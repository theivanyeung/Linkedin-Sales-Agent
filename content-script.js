/**
 * LinkedIn Sales Agent - Content Script
 *
 * Persistent content script that runs automatically on LinkedIn messaging pages.
 * STEALTH MODE: Completely passive - only extracts when explicitly requested.
 * No background monitoring, no polling, no automatic extraction.
 * This is the most undetectable approach.
 */

(function () {
  "use strict";

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
          reject(
            new Error(
              `Element not found: ${selector} after ${maxRetries} retries`
            )
          );
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
      // CRITICAL: Wait a moment to ensure page has fully loaded after thread switch
      // This prevents extracting messages from the previous thread that might still be in the DOM
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Get thread ID from URL
      const threadId =
        window.location.href.match(/\/thread\/([^\/\?]+)/)?.[1] || "unknown";

      // Find the conversation thread directly - don't rely on message form
      // The thread container is more reliable and loads earlier
      let activeConversationThread;

      // Try multiple strategies to find the thread container
      // Strategy 1: Direct query for thread container (most reliable)
      activeConversationThread = document.querySelector(
        ".msg-convo-wrapper.msg-thread"
      );

      // Strategy 2: Wait for thread container if not found immediately
      if (!activeConversationThread) {
        try {
          activeConversationThread = await waitForElement(
            ".msg-convo-wrapper.msg-thread",
            20,
            300
          );
        } catch (e) {
          // Try alternative selectors
          activeConversationThread =
            document.querySelector(
              "[class*='msg-thread'][class*='msg-convo-wrapper']"
            ) || document.querySelector("[class*='msg-thread']");
        }
      }

      // Strategy 3: Find via message list (which loads before the form)
      if (!activeConversationThread) {
        const messageList = document.querySelector(".msg-s-message-list");
        if (messageList) {
          activeConversationThread =
            messageList.closest(".msg-convo-wrapper.msg-thread") ||
            messageList.closest("[class*='msg-thread']");
        }
      }

      // Strategy 4: Last resort - try finding via message form (but don't require it)
      if (!activeConversationThread) {
        const messageForm =
          document.querySelector(".msg-form") ||
          document.querySelector("[class*='msg-form']") ||
          document.querySelector("div[contenteditable='true'][role='textbox']");
        if (messageForm) {
          activeConversationThread =
            messageForm.closest(".msg-convo-wrapper.msg-thread") ||
            messageForm.closest("[class*='msg-thread']");
        }
      }

      if (!activeConversationThread) {
        return {
          error:
            "Conversation thread not found. Please wait for the page to fully load and try again.",
        };
      }

      // Find the message list within the active conversation
      // Wait for it if not immediately available
      let messageListContainer = activeConversationThread.querySelector(
        ".msg-s-message-list"
      );
      if (!messageListContainer) {
        try {
          // Wait up to 6 seconds for message list to appear
          messageListContainer = await waitForElement(
            ".msg-s-message-list",
            20,
            300
          );
        } catch (e) {
          // Try one more time with immediate query
          messageListContainer = activeConversationThread.querySelector(
            ".msg-s-message-list"
          );
        }
      }

      if (!messageListContainer) {
        return {
          error:
            "Message list container not found. Please wait for messages to load.",
        };
      }

      // Find the message content list (only active conversation messages)
      let messageContentList = messageListContainer.querySelector(
        ".msg-s-message-list-content"
      );
      if (!messageContentList) {
        // Wait a bit for content list to appear
        try {
          await new Promise((resolve) => setTimeout(resolve, 500));
          messageContentList = messageListContainer.querySelector(
            ".msg-s-message-list-content"
          );
        } catch (e) {
          // Continue anyway
        }
      }

      if (!messageContentList) {
        return {
          error:
            "Message content list not found. Please wait for messages to load.",
        };
      }

      // CRITICAL FIX: Ensure we're only extracting from the active thread
      // Double-check that the message list container is within the correct thread wrapper
      // LinkedIn sometimes has multiple threads in the DOM, so we need to be strict
      const threadWrapper =
        messageContentList.closest(".msg-convo-wrapper.msg-thread") ||
        messageContentList.closest("[class*='msg-thread']");

      if (!threadWrapper || threadWrapper !== activeConversationThread) {
        return {
          error:
            "Message list container is not within the active conversation thread. Please wait for the page to fully load.",
        };
      }

      // Extract individual messages - ONLY from the active thread's message list
      const messageElements = messageContentList.querySelectorAll(
        ".msg-s-event-listitem"
      );
      const messages = [];

      messageElements.forEach((messageEl, index) => {
        try {
          // CRITICAL FIX: Verify this message is actually within the active thread
          // LinkedIn can have multiple threads in the DOM, so we need to validate
          const messageThreadWrapper =
            messageEl.closest(".msg-convo-wrapper.msg-thread") ||
            messageEl.closest("[class*='msg-thread']");

          if (
            !messageThreadWrapper ||
            messageThreadWrapper !== activeConversationThread
          ) {
            // This message belongs to a different thread - skip it
            return;
          }

          // Get message text
          const bodyEl = messageEl.querySelector(".msg-s-event-listitem__body");
          const text = bodyEl ? bodyEl.textContent.trim() : "";

          if (!text) return; // Skip empty messages

          // Determine sender (you vs them)
          // LinkedIn marks inbound messages with --other class
          const isOther = messageEl.classList.contains(
            "msg-s-event-listitem--other"
          );
          const outboundFlags =
            messageEl.classList.contains("msg-s-event-listitem--outbound") ||
            messageEl.classList.contains("msg-s-event-listitem--self") ||
            !!messageEl.querySelector(
              ".msg-s-event-listitem__profile-picture--me, .msg-s-message-group--own"
            );

          // Fallback: Check if message matches initial message template pattern (definitely from you)
          const matchesInitialTemplate =
            text
              .toLowerCase()
              .includes("i'm currently researching what students at") ||
            text
              .toLowerCase()
              .includes("are you working on any great projects");

          // If it's marked as "other", it's from prospect. Otherwise, if it has outbound flags OR it's not marked as "other", it's from you.
          // Also, if it matches the initial template, it's definitely from you.
          const isFromYou = outboundFlags || !isOther || matchesInitialTemplate;

          // Get timestamp
          const timeEl = messageEl.querySelector(
            ".msg-s-message-list__time-heading"
          );
          const timestamp = timeEl ? timeEl.textContent.trim() : "";

          // Get sender name from profile info
          const profileEl = messageEl.querySelector(
            ".msg-s-event-listitem__profile-picture"
          );
          const senderName = profileEl
            ? (
                profileEl.getAttribute("alt") ||
                profileEl.getAttribute("title") ||
                ""
              ).replace(" Profile", "")
            : "";

          // Extract reactions/emojis
          const reactionsEl = messageEl.querySelector(
            ".msg-reactions-reaction-summary-presenter__container"
          );
          const reactions = [];
          if (reactionsEl) {
            const reactionItems = reactionsEl.querySelectorAll(
              ".msg-reactions-reaction-summary-presenter__reaction"
            );
            reactionItems.forEach((reaction) => {
              const emoji =
                reaction.querySelector(
                  ".msg-reactions-reaction-summary-presenter__emoji"
                )?.textContent || "";
              const count =
                reaction.querySelector(
                  ".msg-reactions-reaction-summary-presenter__count"
                )?.textContent || "1";
              reactions.push({ emoji, count: parseInt(count) || 1 });
            });
          }

          // Helper functions for message extraction
          function extractAttachments(messageEl) {
            const attachments = [];

            // Check for file attachments
            const fileEls = messageEl.querySelectorAll(
              ".msg-s-event-listitem__attachment"
            );
            fileEls.forEach((fileEl) => {
              const fileName =
                fileEl.querySelector(".msg-s-event-listitem__attachment-name")
                  ?.textContent || "";
              const fileSize =
                fileEl.querySelector(".msg-s-event-listitem__attachment-size")
                  ?.textContent || "";
              const fileType =
                fileEl.querySelector(".msg-s-event-listitem__attachment-type")
                  ?.textContent || "";

              attachments.push({
                type: "file",
                name: fileName,
                size: fileSize,
                fileType: fileType,
              });
            });

            // Check for images
            const imageEls = messageEl.querySelectorAll(
              ".msg-s-event-listitem__image img"
            );
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

          const sender = isFromYou ? "you" : "prospect";

          // Note: Console logging removed for stealth (LinkedIn could monitor console)
          // Debug logging can be re-enabled for troubleshooting if needed

          messages.push({
            index: index,
            text: text,
            sender: sender,
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
          messagesFromThem: messages.filter((m) => m.sender === "prospect")
            .length,
          totalCharacters: messages.reduce((sum, m) => sum + m.text.length, 0),
          averageMessageLength: 0,
          messageTypes: {},
          totalReactions: 0,
          messagesWithAttachments: 0,
          totalLinks: 0,
          totalMentions: 0,
        };

        if (messages.length > 0) {
          stats.averageMessageLength = Math.round(
            stats.totalCharacters / messages.length
          );
        }

        messages.forEach((msg) => {
          stats.totalReactions += msg.reactions.reduce(
            (sum, r) => sum + r.count,
            0
          );
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
        if (
          nameElement &&
          nameElement.textContent &&
          nameElement.textContent.trim()
        ) {
          prospectName = nameElement.textContent.trim();
          break;
        }
      }

      // If we didn't find a specific name element, try the profile link
      if (!nameElement || prospectName === "Unknown") {
        const profileLink = activeConversationThread.querySelector(
          ".msg-thread__link-to-profile"
        );
        if (profileLink) {
          const entityLockup = profileLink.querySelector(".msg-entity-lockup");
          if (entityLockup) {
            const titleEl = entityLockup.querySelector(
              ".msg-entity-lockup__entity-title, h2"
            );
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
        ".msg-entity-lockup__entity-info",
        ".msg-s-profile-card__headline",
        ".msg-thread__headline",
        ".artdeco-entity-lockup__subtitle",
        ".artdeco-entity-lockup__subtitle div[title]",
        ".artdeco-entity-lockup__subtitle[title]",
      ];

      for (const selector of headlineSelectors) {
        const headlineEl = activeConversationThread.querySelector(selector);
        if (headlineEl) {
          let headlineText = "";
          const allTextNodes = [];
          headlineEl.childNodes.forEach((node) => {
            if (node.nodeType === Node.TEXT_NODE) {
              allTextNodes.push(node.textContent);
            } else if (
              node.nodeType === Node.ELEMENT_NODE &&
              !node.classList.contains("visually-hidden") &&
              !node.classList.contains("msg-entity-lockup__presence-indicator")
            ) {
              const text = node.textContent || node.getAttribute("title") || "";
              if (text.trim()) {
                allTextNodes.push(text);
              }
            }
          });

          headlineText =
            allTextNodes.join(" ").trim() ||
            headlineEl.getAttribute("title") ||
            "";

          if (headlineText) {
            prospectDescription = headlineText;
            break;
          }
        }
      }

      // Fallback: try subtitle div with title attribute
      if (!prospectDescription) {
        let subtitleDiv = activeConversationThread.querySelector(
          ".artdeco-entity-lockup__subtitle div[title]"
        );
        if (!subtitleDiv) {
          subtitleDiv = document.querySelector(
            ".artdeco-entity-lockup__subtitle div[title]"
          );
        }
        if (subtitleDiv) {
          const subText = (
            subtitleDiv.getAttribute("title") ||
            subtitleDiv.textContent ||
            ""
          ).trim();
          if (subText) {
            prospectDescription = subText;
          }
        }
      }

      // Clean the name and description
      const cleanTitle = clean(prospectName) || "Unknown";
      const cleanDescription = clean(prospectDescription);

      // CRITICAL: Verify threadId consistency - if URL threadId doesn't match, something's wrong
      const urlThreadId =
        window.location.href.match(/\/thread\/([^\/\?]+)/)?.[1] || "unknown";
      if (
        urlThreadId !== "unknown" &&
        threadId !== "unknown" &&
        urlThreadId !== threadId
      ) {
        return {
          error: `Thread ID mismatch detected. URL: ${urlThreadId}, Extracted: ${threadId}. Page may still be loading. Please wait and try again.`,
        };
      }

      // CRITICAL FIX: Validate messages to detect cross-thread contamination
      // Check if any messages appear to be from a different conversation
      // This happens when LinkedIn has multiple threads in the DOM
      const filteredMessages = [];
      const initialMessagePattern = /^hey\s+([^,]+),/i;
      let firstInitialName = null;
      let foundMultipleInitials = false;
      const warnings = []; // Collect warnings to send to popup console UI

      for (let i = 0; i < messages.length; i++) {
        const msg = messages[i];
        const text = msg.text || "";

        // ONLY check messages from "you" for initial message pattern
        // Prospect messages can say anything and shouldn't trigger contamination detection
        const isFromYou = msg.sender === "you";

        // Check if this is an initial message (starts with "hey [name]")
        // Only check messages from "you" - prospect messages can say anything
        const initialMatch = isFromYou
          ? text.match(initialMessagePattern)
          : null;
        if (initialMatch) {
          const mentionedName = initialMatch[1].trim().toLowerCase();
          const mentionedNameWords = mentionedName
            .split(/\s+/)
            .filter((w) => w.length > 2);

          // Normalize the current prospect name for comparison
          const currentProspectName = cleanTitle.toLowerCase().trim();
          const currentProspectNameWords = currentProspectName
            .split(/\s+/)
            .filter((w) => w.length > 2);

          // Check if this initial message matches the current conversation
          let nameMatches = false;
          if (
            currentProspectName !== "unknown" &&
            currentProspectName.length > 0
          ) {
            // Direct match
            if (
              mentionedName === currentProspectName ||
              currentProspectName.includes(mentionedName) ||
              mentionedName.includes(currentProspectName)
            ) {
              nameMatches = true;
            }
            // Word-based match (handles "Vivaan" vs "Vivaan Kumar", "Avika" vs "Avika Agarwal")
            else if (
              mentionedNameWords.length > 0 &&
              currentProspectNameWords.length > 0
            ) {
              const hasCommonWord = mentionedNameWords.some((word) =>
                currentProspectNameWords.some(
                  (cWord) =>
                    word === cWord ||
                    word.includes(cWord) ||
                    cWord.includes(word)
                )
              );
              if (hasCommonWord) {
                nameMatches = true;
              }
            }
          }

          // If we have a prospect name and this initial message doesn't match, it's contamination
          // BUT: Only stop if we're VERY confident it's a mismatch
          // Don't stop on partial matches or if the name is too short (could be a typo or nickname)
          if (
            currentProspectName !== "unknown" &&
            currentProspectName.length > 0 &&
            !nameMatches &&
            mentionedNameWords.length > 0 &&
            currentProspectNameWords.length > 0 &&
            mentionedName.length >= 3 && // Only check if mentioned name is at least 3 chars
            currentProspectName.length >= 3 // Only check if prospect name is at least 3 chars
          ) {
            // Double-check: make sure there's NO common word at all before stopping
            const hasAnyCommonWord = mentionedNameWords.some((word) =>
              currentProspectNameWords.some(
                (cWord) =>
                  word === cWord || word.includes(cWord) || cWord.includes(word)
              )
            );

            // Also check if the mentioned name is clearly a different person
            // (e.g., "John" vs "Avika" - completely different, not just a variation)
            const isClearlyDifferent =
              !hasAnyCommonWord &&
              mentionedName.length >= 3 &&
              currentProspectName.length >= 3;

            if (isClearlyDifferent) {
              const warningMsg = `CROSS-THREAD CONTAMINATION DETECTED at message ${i}: Initial message mentions "${mentionedName}" but conversation is with "${currentProspectName}". Stopping extraction here.`;
              // STEALTH: No console logging - warnings sent to popup UI only
              warnings.push({
                tag: "WARNING",
                message: warningMsg,
                meta: {
                  messageIndex: i,
                  mentionedName: mentionedName,
                  currentProspectName: currentProspectName,
                  action: "Stopped extraction to prevent contamination",
                },
              });
              break; // Stop extracting - we've hit messages from a different thread
            }
          }

          // Track first initial name for comparison
          if (firstInitialName === null) {
            firstInitialName = mentionedName;
          } else if (mentionedName !== firstInitialName) {
            // Found a second initial message with a different name - cross-thread contamination!
            // Even if we don't have a prospect name, this is suspicious
            const firstWords = firstInitialName
              .split(/\s+/)
              .filter((w) => w.length > 2);
            const hasCommonWord = firstWords.some((word) =>
              mentionedNameWords.some(
                (sWord) =>
                  word === sWord || word.includes(sWord) || sWord.includes(word)
              )
            );

            if (!hasCommonWord) {
              foundMultipleInitials = true;
              const warningMsg = `CROSS-THREAD CONTAMINATION DETECTED: Found initial messages for both "${firstInitialName}" and "${mentionedName}". Stopping extraction here.`;
              // STEALTH: No console logging - warnings sent to popup UI only
              warnings.push({
                tag: "WARNING",
                message: warningMsg,
                meta: {
                  firstInitialName: firstInitialName,
                  secondInitialName: mentionedName,
                  action: "Stopped extraction to prevent contamination",
                },
              });
              break; // Stop extracting - we've hit messages from a different thread
            }
          }
        }

        filteredMessages.push(msg);
      }

      // Warning already added to warnings array above

      // Add warning if messages were filtered
      if (filteredMessages.length < messages.length) {
        warnings.push({
          tag: "WARNING",
          message: `Filtered out ${
            messages.length - filteredMessages.length
          } messages from different thread(s)`,
          meta: {
            originalCount: messages.length,
            filteredCount: filteredMessages.length,
            reason:
              "Cross-thread contamination detected. This usually happens when switching threads too quickly. Wait a moment before extracting.",
          },
        });
      }

      // Create conversation data
      const conversationData = {
        threadId: threadId,
        url: window.location.href,
        title: cleanTitle,
        description: cleanDescription,
        timestamp: new Date().toISOString(),
        messageCount: filteredMessages.length,
        participants: extractParticipants(filteredMessages),
        statistics: calculateStatistics(filteredMessages),
        messages: filteredMessages,
        warnings: warnings, // Include warnings for popup to log
      };

      return conversationData;
    } catch (e) {
      // Return error without logging to avoid detection
      const errorMsg = e.message || "Extraction failed";

      // Provide helpful error messages
      if (errorMsg.includes("not found")) {
        return {
          error: `${errorMsg}. The page may still be loading. Please wait a moment and try again.`,
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
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.style.position = "fixed";
      textarea.style.left = "-999999px";
      textarea.style.top = "-999999px";
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();

      try {
        // Use execCommand as fallback (works in content script context)
        const successful = document.execCommand("copy");
        document.body.removeChild(textarea);

        if (successful) {
          resolve(true);
        } else {
          // Try modern clipboard API
          if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard
              .writeText(text)
              .then(() => {
                resolve(true);
              })
              .catch((err) => {
                reject(new Error("Failed to copy to clipboard"));
              });
          } else {
            reject(new Error("Clipboard API not available"));
          }
        }
      } catch (err) {
        document.body.removeChild(textarea);
        reject(new Error("Failed to copy to clipboard: " + err.message));
      }
    });
  }

  // Message monitoring state
  let messageMonitorObserver = null;
  let lastMessageCount = 0;
  let lastYourMessageText = null;

  /**
   * Start monitoring for new messages from "you" (to detect when message is sent)
   */
  function startMessageMonitoring(expectedMessageText) {
    // Stop existing monitoring
    if (messageMonitorObserver) {
      messageMonitorObserver.disconnect();
      messageMonitorObserver = null;
    }

    lastYourMessageText = expectedMessageText;

    // Find message list container
    const messageList = document.querySelector(".msg-s-message-list-content");
    if (!messageList) {
      console.warn("Message list not found for monitoring");
      return;
    }

    // Count current messages from "you"
    const currentMessages = messageList.querySelectorAll(".msg-s-event-listitem");
    lastMessageCount = currentMessages.length;

    // Observe for new messages
    messageMonitorObserver = new MutationObserver(() => {
      const currentMessages = messageList.querySelectorAll(".msg-s-event-listitem");
      const newCount = currentMessages.length;

      // Check if a new message appeared
      if (newCount > lastMessageCount) {
        // Get the last message
        const lastMessageEl = currentMessages[currentMessages.length - 1];
        if (lastMessageEl) {
          const bodyEl = lastMessageEl.querySelector(".msg-s-event-listitem__body");
          const messageText = bodyEl ? bodyEl.textContent.trim() : "";

          // Check if it's from "you"
          const isOther = lastMessageEl.classList.contains("msg-s-event-listitem--other");
          const outboundFlags =
            lastMessageEl.classList.contains("msg-s-event-listitem--outbound") ||
            lastMessageEl.classList.contains("msg-s-event-listitem--self") ||
            !!lastMessageEl.querySelector(
              ".msg-s-event-listitem__profile-picture--me, .msg-s-message-group--own"
            );
          const isFromYou = outboundFlags || !isOther;

          // If it's from "you" and matches our expected message (or similar), notify popup
          if (isFromYou && messageText) {
            const textMatches = 
              expectedMessageText &&
              (messageText.includes(expectedMessageText.substring(0, 50)) ||
               expectedMessageText.includes(messageText.substring(0, 50)));

            if (textMatches || !expectedMessageText) {
              // Notify popup that message was sent
              chrome.runtime.sendMessage({
                action: "messageSent",
                messageText: messageText,
              }).catch(() => {
                // Ignore errors (popup might be closed)
              });

              // Stop monitoring
              if (messageMonitorObserver) {
                messageMonitorObserver.disconnect();
                messageMonitorObserver = null;
              }
            }
          }
        }

        lastMessageCount = newCount;
      }
    });

    // Start observing
    messageMonitorObserver.observe(messageList, {
      childList: true,
      subtree: false,
    });

    // Set a timeout to stop monitoring after 30 seconds (to prevent infinite monitoring)
    setTimeout(() => {
      if (messageMonitorObserver) {
        messageMonitorObserver.disconnect();
        messageMonitorObserver = null;
      }
    }, 30000);
  }

  /**
   * Stop monitoring for new messages
   */
  function stopMessageMonitoring() {
    if (messageMonitorObserver) {
      messageMonitorObserver.disconnect();
      messageMonitorObserver = null;
    }
    lastMessageCount = 0;
    lastYourMessageText = null;
  }

  /**
   * Handle messages from popup/background script
   */
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "copyToClipboard") {
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

    if (request.action === "startMessageMonitoring") {
      // Start monitoring for when a message is sent
      startMessageMonitoring(request.expectedMessageText || null);
      sendResponse({ success: true });
      return true;
    }

    if (request.action === "stopMessageMonitoring") {
      // Stop monitoring
      stopMessageMonitoring();
      sendResponse({ success: true });
      return true;
    }

    if (request.action === "extractConversation") {
      // Prevent duplicate extractions
      const currentThreadId =
        window.location.href.match(/\/thread\/([^\/\?]+)/)?.[1];

      if (extractionInProgress) {
        sendResponse({ error: "Extraction already in progress" });
        return true; // Keep channel open for async response
      }

      if (currentThreadId === lastExtractedThreadId && !request.force) {
        sendResponse({ error: "Already extracted this thread" });
        return true;
      }

      // If force is true, reset lastExtractedThreadId to allow re-extraction
      if (request.force) {
        lastExtractedThreadId = null;
      }

      extractionInProgress = true;

      // Extract with proper async handling
      // Small delay to ensure we're not racing with page load
      // Use requestAnimationFrame for natural timing
      requestAnimationFrame(async () => {
        try {
          // Small additional delay to ensure DOM is stable
          // This mimics the old approach where extraction happened on user click (page was ready)
          await new Promise((resolve) => setTimeout(resolve, 100));

          const result = await extractConversationData();
          if (result && !result.error) {
            lastExtractedThreadId = result.threadId;
          }
          extractionInProgress = false;
          sendResponse(result);
        } catch (error) {
          extractionInProgress = false;
          sendResponse({
            error: error.message || "Extraction failed",
          });
        }
      });

      return true; // Keep channel open for async response
    }

    if (request.action === "extractThreadDOM") {
      // Extract just the HTML of the conversation thread element
      requestAnimationFrame(async () => {
        try {
          // Wait a moment to ensure page is loaded
          await new Promise((resolve) => setTimeout(resolve, 300));

          // Find the conversation thread element (same logic as extractConversationData)
          let activeConversationThread = document.querySelector(
            ".msg-convo-wrapper.msg-thread"
          );

          if (!activeConversationThread) {
            try {
              activeConversationThread = await waitForElement(
                ".msg-convo-wrapper.msg-thread",
                10,
                200
              );
            } catch (e) {
              activeConversationThread =
                document.querySelector(
                  "[class*='msg-thread'][class*='msg-convo-wrapper']"
                ) || document.querySelector("[class*='msg-thread']");
            }
          }

          if (!activeConversationThread) {
            sendResponse({ error: "Conversation thread element not found" });
            return;
          }

          // Get the HTML of the thread element
          const html = activeConversationThread.outerHTML;

          sendResponse({ html, success: true });
        } catch (error) {
          sendResponse({
            error: error.message || "Failed to extract thread DOM",
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

