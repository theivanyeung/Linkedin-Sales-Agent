/**
 * LinkedIn Sales Agent - Content Script
 * 
 * Persistent content script that runs automatically on LinkedIn messaging pages.
 * STEALTH MODE: Completely passive - only extracts when explicitly requested.
 * No background monitoring, no polling, no automatic extraction.
 * This is the most undetectable approach.
 */

(function() {
  'use strict';

  // Store the last extracted thread ID to avoid duplicate extractions
  let lastExtractedThreadId = null;
  let extractionInProgress = false;

  /**
   * Wait for DOM element to appear (with retry)
   * Uses requestAnimationFrame for more natural timing (less detectable)
   */
  function waitForElement(selector, maxRetries = 20, delay = 300) {
    return new Promise((resolve, reject) => {
      let retries = 0;
      const check = () => {
        const element = document.querySelector(selector);
        if (element) {
          resolve(element);
        } else if (retries < maxRetries) {
          retries++;
          // Use requestAnimationFrame for more natural timing
          requestAnimationFrame(() => {
            setTimeout(check, delay);
          });
        } else {
          reject(new Error(`Element not found: ${selector} after ${maxRetries} retries`));
        }
      };
      check();
    });
  }

  /**
   * Extract conversation data from the current page
   * This is the same extraction logic as before, but runs in a persistent content script
   */
  async function extractConversationData() {
    try {
      // Get thread ID from URL
      const threadId = window.location.href.match(/\/thread\/([^\/\?]+)/)?.[1] || "unknown";
      
      // Find the conversation thread directly - don't rely on message form
      // The thread container is more reliable and loads earlier
      let activeConversationThread;
      
      // Try multiple strategies to find the thread container
      // Strategy 1: Direct query for thread container (most reliable)
      activeConversationThread = document.querySelector(".msg-convo-wrapper.msg-thread");
      
      // Strategy 2: Wait for thread container if not found immediately
      if (!activeConversationThread) {
        try {
          activeConversationThread = await waitForElement(".msg-convo-wrapper.msg-thread", 20, 300);
        } catch (e) {
          // Try alternative selectors
          activeConversationThread = document.querySelector("[class*='msg-thread'][class*='msg-convo-wrapper']") ||
                                     document.querySelector("[class*='msg-thread']");
        }
      }
      
      // Strategy 3: Find via message list (which loads before the form)
      if (!activeConversationThread) {
        const messageList = document.querySelector(".msg-s-message-list");
        if (messageList) {
          activeConversationThread = messageList.closest(".msg-convo-wrapper.msg-thread") ||
                                     messageList.closest("[class*='msg-thread']");
        }
      }
      
      // Strategy 4: Last resort - try finding via message form (but don't require it)
      if (!activeConversationThread) {
        const messageForm = document.querySelector(".msg-form") ||
                           document.querySelector("[class*='msg-form']") ||
                           document.querySelector("div[contenteditable='true'][role='textbox']");
        if (messageForm) {
          activeConversationThread = messageForm.closest(".msg-convo-wrapper.msg-thread") ||
                                     messageForm.closest("[class*='msg-thread']");
        }
      }

      if (!activeConversationThread) {
        return { 
          error: "Conversation thread not found. Please wait for the page to fully load and try again." 
        };
      }

      // Find the message list within the active conversation
      // Wait for it if not immediately available
      let messageListContainer = activeConversationThread.querySelector(".msg-s-message-list");
      if (!messageListContainer) {
        try {
          // Wait up to 6 seconds for message list to appear
          messageListContainer = await waitForElement(".msg-s-message-list", 20, 300);
        } catch (e) {
          // Try one more time with immediate query
          messageListContainer = activeConversationThread.querySelector(".msg-s-message-list");
        }
      }
      
      if (!messageListContainer) {
        return { error: "Message list container not found. Please wait for messages to load." };
      }

      // Find the message content list (only active conversation messages)
      let messageContentList = messageListContainer.querySelector(".msg-s-message-list-content");
      if (!messageContentList) {
        // Wait a bit for content list to appear
        try {
          await new Promise(resolve => setTimeout(resolve, 500));
          messageContentList = messageListContainer.querySelector(".msg-s-message-list-content");
        } catch (e) {
          // Continue anyway
        }
      }
      
      if (!messageContentList) {
        return { error: "Message content list not found. Please wait for messages to load." };
      }

      // Extract individual messages
      const messageElements = messageContentList.querySelectorAll(".msg-s-event-listitem");
      const messages = [];

      messageElements.forEach((messageEl, index) => {
        try {
          // Get message text
          const bodyEl = messageEl.querySelector(".msg-s-event-listitem__body");
          const text = bodyEl ? bodyEl.textContent.trim() : "";

          if (!text) return; // Skip empty messages

          // Determine sender (you vs them)
          const isFromYou =
            messageEl.classList.contains("msg-s-event-listitem--outbound") ||
            messageEl.classList.contains("msg-s-event-listitem--self") ||
            !!messageEl.querySelector(".msg-s-event-listitem__profile-picture--me, .msg-s-message-group--own");

          // Get timestamp
          const timeEl = messageEl.querySelector(".msg-s-message-list__time-heading");
          const timestamp = timeEl ? timeEl.textContent.trim() : "";

          // Get sender name from profile info
          const profileEl = messageEl.querySelector(".msg-s-event-listitem__profile-picture");
          const senderName = profileEl
            ? (profileEl.getAttribute("alt") || profileEl.getAttribute("title") || "").replace(" Profile", "")
            : "";

          // Extract reactions/emojis
          const reactionsEl = messageEl.querySelector(".msg-reactions-reaction-summary-presenter__container");
          const reactions = [];
          if (reactionsEl) {
            const reactionItems = reactionsEl.querySelectorAll(".msg-reactions-reaction-summary-presenter__reaction");
            reactionItems.forEach((reaction) => {
              const emoji = reaction.querySelector(".msg-reactions-reaction-summary-presenter__emoji")?.textContent || "";
              const count = reaction.querySelector(".msg-reactions-reaction-summary-presenter__count")?.textContent || "1";
              reactions.push({ emoji, count: parseInt(count) || 1 });
            });
          }

          // Helper functions for message extraction
          function extractAttachments(messageEl) {
            const attachments = [];

            // Check for file attachments
            const fileEls = messageEl.querySelectorAll(".msg-s-event-listitem__attachment");
            fileEls.forEach((fileEl) => {
              const fileName = fileEl.querySelector(".msg-s-event-listitem__attachment-name")?.textContent || "";
              const fileSize = fileEl.querySelector(".msg-s-event-listitem__attachment-size")?.textContent || "";
              const fileType = fileEl.querySelector(".msg-s-event-listitem__attachment-type")?.textContent || "";

              attachments.push({
                type: "file",
                name: fileName,
                size: fileSize,
                fileType: fileType,
              });
            });

            // Check for images
            const imageEls = messageEl.querySelectorAll(".msg-s-event-listitem__image img");
            imageEls.forEach((imgEl) => {
              attachments.push({
                type: "image",
                src: imgEl.src,
                alt: imgEl.alt,
              });
            });

            return attachments;
          }

          function extractLinksFromBody(bodyEl, text) {
            const out = [];
            const urlSet = new Set();
            if (bodyEl) {
              bodyEl.querySelectorAll("a[href]").forEach((a) => {
                const url = a.getAttribute("href") || "";
                if (!url || urlSet.has(url)) return;
                urlSet.add(url);
                out.push({
                  url,
                  text: (a.textContent || "").trim(),
                  title: a.title || "",
                });
              });
              const urlRegex = /https?:\/\/[^\s)]+/g;
              let m;
              while ((m = urlRegex.exec(text)) !== null) {
                const url = m[0];
                if (urlSet.has(url)) continue;
                urlSet.add(url);
                out.push({ url, text: url, title: "" });
              }
            }
            return out;
          }

          function extractMentions(text) {
            const mentionRegex = /@(\w+)/g;
            const mentions = [];
            let match;
            while ((match = mentionRegex.exec(text)) !== null) {
              mentions.push(match[1]);
            }
            return mentions;
          }

          // Extract attachments
          const attachments = extractAttachments(messageEl);

          // Extract links
          const links = extractLinksFromBody(bodyEl, text);

          // Extract mentions
          const mentions = extractMentions(text);

          messages.push({
            index: index,
            text: text,
            sender: isFromYou ? "you" : "prospect",
            attachments: attachments,
            reactions: reactions,
            mentions: mentions,
            links: links,
          });
        } catch (e) {
          // Silently skip errors to avoid console noise
        }
      });

      // Helper functions for data processing
      function extractParticipants(messages) {
        const participants = new Set();
        messages.forEach((msg) => {
          if (msg.sender === "you") {
            participants.add("You");
          } else {
            participants.add("Prospect");
          }
        });
        return Array.from(participants);
      }

      function calculateStatistics(messages) {
        const stats = {
          totalMessages: messages.length,
          messagesFromYou: messages.filter((m) => m.sender === "you").length,
          messagesFromThem: messages.filter((m) => m.sender === "prospect").length,
          totalCharacters: messages.reduce((sum, m) => sum + m.text.length, 0),
          averageMessageLength: 0,
          messageTypes: {},
          totalReactions: 0,
          messagesWithAttachments: 0,
          totalLinks: 0,
          totalMentions: 0,
        };

        if (messages.length > 0) {
          stats.averageMessageLength = Math.round(stats.totalCharacters / messages.length);
        }

        messages.forEach((msg) => {
          stats.totalReactions += msg.reactions.reduce((sum, r) => sum + r.count, 0);
          if (msg.attachments.length > 0) {
            stats.messagesWithAttachments++;
          }
          stats.totalLinks += msg.links.length;
          stats.totalMentions += msg.mentions.length;
        });

        return stats;
      }

      // Enhanced clean function to remove ALL LinkedIn status indicators, timestamps, and mobile indicators
      const clean = (s) => {
        if (!s) return "";
        let cleaned = s
          // Remove status indicators
          .replace(/Status\s+is\s+(offline|online|away|busy)/gi, "")
          .replace(/Available\s+on\s+mobile/gi, "")
          .replace(/Mobile/gi, "")
          // Remove timestamps like "• 1w ago", "• 2d ago", "• 3h ago"
          .replace(/\s*•\s*\d+[wdhms]\s+ago/gi, "")
          .replace(/\s*•\s*\d+\s+(week|day|hour|minute|second)s?\s+ago/gi, "")
          // Remove job title prefixes like "Group General Manager @"
          .replace(/\s*@\s*[^•]+/g, "")
          // Remove common LinkedIn prefixes
          .replace(/^\s*1st\s+degree\s+connection\s*•?\s*/i, "")
          .replace(/^\s*2nd\s+degree\s+connection\s*•?\s*/i, "")
          .replace(/^\s*3rd\s+degree\s+connection\s*•?\s*/i, "")
          // Remove pipes and dashes used as separators
          .replace(/^[|\s\-•]+|[|\s\-•]+$/g, "")
          // Normalize whitespace
          .replace(/[\n\t\r]+/g, " ")
          .replace(/\s{2,}/g, " ")
          .trim();
        return cleaned;
      };

      // Extract prospect name, title, and description
      let prospectName = "Unknown";
      let prospectDescription = "";

      // Try multiple selectors to find the NAME element specifically
      const nameSelectors = [
        ".msg-entity-lockup__entity-title",
        ".msg-entity-lockup__entity-title h2",
        ".msg-s-profile-card__name",
        "span.msg-s-profile-card__profile-link",
        ".msg-thread__link-to-profile .msg-entity-lockup__entity-title",
        ".msg-thread__link-to-profile h2",
      ];

      let nameElement = null;
      for (const selector of nameSelectors) {
        nameElement = activeConversationThread.querySelector(selector);
        if (nameElement && nameElement.textContent && nameElement.textContent.trim()) {
          prospectName = nameElement.textContent.trim();
          break;
        }
      }

      // If we didn't find a specific name element, try the profile link
      if (!nameElement || prospectName === "Unknown") {
        const profileLink = activeConversationThread.querySelector(".msg-thread__link-to-profile");
        if (profileLink) {
          const entityLockup = profileLink.querySelector(".msg-entity-lockup");
          if (entityLockup) {
            const titleEl = entityLockup.querySelector(".msg-entity-lockup__entity-title, h2");
            if (titleEl && titleEl.textContent) {
              prospectName = titleEl.textContent.trim();
            }
          }
          
          if (prospectName === "Unknown") {
            const h2El = profileLink.querySelector("h2");
            if (h2El && h2El.textContent) {
              prospectName = h2El.textContent.trim();
            }
          }
        }
      }

      // Extract title/description
      const headlineSelectors = [
        '.msg-entity-lockup__entity-info',
        '.msg-s-profile-card__headline',
        '.msg-thread__headline',
        '.artdeco-entity-lockup__subtitle',
        '.artdeco-entity-lockup__subtitle div[title]',
        '.artdeco-entity-lockup__subtitle[title]',
      ];

      for (const selector of headlineSelectors) {
        const headlineEl = activeConversationThread.querySelector(selector);
        if (headlineEl) {
          let headlineText = "";
          const allTextNodes = [];
          headlineEl.childNodes.forEach(node => {
            if (node.nodeType === Node.TEXT_NODE) {
              allTextNodes.push(node.textContent);
            } else if (node.nodeType === Node.ELEMENT_NODE && 
                       !node.classList.contains('visually-hidden') &&
                       !node.classList.contains('msg-entity-lockup__presence-indicator')) {
              const text = node.textContent || node.getAttribute("title") || "";
              if (text.trim()) {
                allTextNodes.push(text);
              }
            }
          });
          
          headlineText = allTextNodes.join(" ").trim() || headlineEl.getAttribute("title") || "";
          
          if (headlineText) {
            prospectDescription = headlineText;
            break;
          }
        }
      }

      // Fallback: try subtitle div with title attribute
      if (!prospectDescription) {
        let subtitleDiv = activeConversationThread.querySelector(".artdeco-entity-lockup__subtitle div[title]");
        if (!subtitleDiv) {
          subtitleDiv = document.querySelector(".artdeco-entity-lockup__subtitle div[title]");
        }
        if (subtitleDiv) {
          const subText = (subtitleDiv.getAttribute("title") || subtitleDiv.textContent || "").trim();
          if (subText) {
            prospectDescription = subText;
          }
        }
      }

      // Clean the name and description
      const cleanTitle = clean(prospectName) || "Unknown";
      const cleanDescription = clean(prospectDescription);

      // Create conversation data
      const conversationData = {
        threadId: threadId,
        url: window.location.href,
        title: cleanTitle,
        description: cleanDescription,
        timestamp: new Date().toISOString(),
        messageCount: messages.length,
        participants: extractParticipants(messages),
        statistics: calculateStatistics(messages),
        messages: messages,
      };

      return conversationData;
    } catch (e) {
      // Return error without logging to avoid detection
      const errorMsg = e.message || "Extraction failed";
      
      // Provide helpful error messages
      if (errorMsg.includes("not found")) {
        return { 
          error: `${errorMsg}. The page may still be loading. Please wait a moment and try again.` 
        };
      }
      
      return { error: errorMsg };
    }
  }

  /**
   * Copy text to clipboard using content script context
   * This works even without user gesture because content scripts run in page context
   */
  function copyToClipboard(text) {
    return new Promise((resolve, reject) => {
      // Create a temporary textarea element
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.left = '-999999px';
      textarea.style.top = '-999999px';
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      
      try {
        // Use execCommand as fallback (works in content script context)
        const successful = document.execCommand('copy');
        document.body.removeChild(textarea);
        
        if (successful) {
          resolve(true);
        } else {
          // Try modern clipboard API
          if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).then(() => {
              resolve(true);
            }).catch(err => {
              reject(new Error('Failed to copy to clipboard'));
            });
          } else {
            reject(new Error('Clipboard API not available'));
          }
        }
      } catch (err) {
        document.body.removeChild(textarea);
        reject(new Error('Failed to copy to clipboard: ' + err.message));
      }
    });
  }

  /**
   * Handle messages from popup/background script
   */
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'copyToClipboard') {
      // Handle clipboard copy request
      copyToClipboard(request.text)
        .then(() => {
          sendResponse({ success: true });
        })
        .catch((error) => {
          sendResponse({ success: false, error: error.message });
        });
      return true; // Keep channel open for async response
    }
    
    if (request.action === 'extractConversation') {
      // Prevent duplicate extractions
      const currentThreadId = window.location.href.match(/\/thread\/([^\/\?]+)/)?.[1];
      
      if (extractionInProgress) {
        sendResponse({ error: "Extraction already in progress" });
        return true; // Keep channel open for async response
      }

      if (currentThreadId === lastExtractedThreadId && !request.force) {
        sendResponse({ error: "Already extracted this thread" });
        return true;
      }

      extractionInProgress = true;
      
      // Extract with proper async handling
      // Small delay to ensure we're not racing with page load
      // Use requestAnimationFrame for natural timing
      requestAnimationFrame(async () => {
        try {
          // Small additional delay to ensure DOM is stable
          // This mimics the old approach where extraction happened on user click (page was ready)
          await new Promise(resolve => setTimeout(resolve, 100));
          
          const result = await extractConversationData();
          if (result && !result.error) {
            lastExtractedThreadId = result.threadId;
          }
          extractionInProgress = false;
          sendResponse(result);
        } catch (error) {
          extractionInProgress = false;
          sendResponse({ 
            error: error.message || "Extraction failed" 
          });
        }
      });

      return true; // Keep channel open for async response
    }

    return false;
  });

  /**
   * STEALTH MODE: No background monitoring
   * 
   * Removed all detectable patterns:
   * - No MutationObserver (too broad, creates patterns)
   * - No setInterval polling (very detectable)
   * - No history API interception (modifies native APIs)
   * - No automatic message sending (creates patterns)
   * - No console logging (could be monitored)
   * 
   * Extraction ONLY happens when explicitly requested by popup.
   * This is the most undetectable approach - completely passive until activated.
   */
})();

