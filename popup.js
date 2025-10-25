// Simple DOM Extractor Popup
class DOMExtractor {
  constructor() {
    this.firebaseService = new FirebaseService();
    this.init();
  }

  init() {
    this.setupEventListeners();
    this.checkPageStatus();
  }

  setupEventListeners() {
    document.getElementById("extractBtn").addEventListener("click", () => {
      this.extractDOM();
    });

    document.getElementById("testInputBtn").addEventListener("click", () => {
      this.testMessageInput();
    });

    document
      .getElementById("saveToFirebaseBtn")
      .addEventListener("click", () => {
        this.saveToFirebase();
      });
  }

  async checkPageStatus() {
    try {
      const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });

      if (tab.url && tab.url.includes("linkedin.com")) {
        this.setStatus("Ready", "LinkedIn page detected");
        document.getElementById("extractBtn").disabled = false;
      } else {
        this.setStatus("Inactive", "Navigate to a LinkedIn page");
        document.getElementById("extractBtn").disabled = true;
      }
    } catch (error) {
      console.error("Error checking page status:", error);
      this.setStatus("Error", "Unable to check page status");
    }
  }

  setStatus(text, details) {
    document.getElementById("statusText").textContent = text;
    document.getElementById("statusDetails").textContent = details;
  }

  async extractDOM() {
    const extractBtn = document.getElementById("extractBtn");
    const originalText = extractBtn.textContent;

    extractBtn.disabled = true;
    extractBtn.textContent = "Extracting...";
    this.setStatus("Extracting", "Getting page DOM...");

    try {
      const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });

      // Inject content script to get DOM
      console.log("Injecting script into tab:", tab.id, tab.url);

      // Simple test injection first
      console.log("Testing basic injection...");

      const testResults = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
          console.log("Script injected successfully!");
          return "test-success";
        },
      });

      console.log("Test injection results:", testResults);

      if (
        !testResults ||
        !testResults[0] ||
        testResults[0].result !== "test-success"
      ) {
        throw new Error(
          "Basic script injection failed - LinkedIn may be blocking scripts"
        );
      }

      // Now try DOM extraction
      console.log("Basic injection works, trying DOM extraction...");

      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
          try {
            console.log(
              "Extracting conversation messages from:",
              window.location.href
            );

            // Get thread ID
            const threadId =
              window.location.href.match(/\/thread\/([^\/\?]+)/)?.[1] ||
              "unknown";
            console.log("Thread ID:", threadId);

            // Find the message input form first (there's only one active input)
            const messageForm = document.querySelector(".msg-form");
            if (!messageForm) {
              console.warn("Could not find message input form");
              return { error: "Message input form not found" };
            }

            console.log("Found message input form");

            // Work backwards from the input form to find the specific conversation thread
            // The input form should be within the active conversation thread
            let activeConversationThread = messageForm.closest(
              ".msg-convo-wrapper.msg-thread"
            );
            if (!activeConversationThread) {
              // Fallback: look for the conversation thread that contains the input
              activeConversationThread = messageForm.closest(
                "[class*='msg-thread']"
              );
            }

            if (!activeConversationThread) {
              console.warn(
                "Could not find active conversation thread from input form"
              );
              return { error: "Active conversation thread not found" };
            }

            console.log("Found active conversation thread from input form");

            // Find the message list within the active conversation
            const messageListContainer = activeConversationThread.querySelector(
              ".msg-s-message-list"
            );
            if (!messageListContainer) {
              console.warn("Could not find message list container");
              return { error: "Message list container not found" };
            }

            console.log("Found message list container");

            // Find the message content list (only active conversation messages)
            const messageContentList = messageListContainer.querySelector(
              ".msg-s-message-list-content"
            );
            if (!messageContentList) {
              console.warn("Could not find message content list");
              return { error: "Message content list not found" };
            }

            console.log("Found message content list");

            // Extract individual messages
            const messageElements = messageContentList.querySelectorAll(
              ".msg-s-event-listitem"
            );
            console.log(`Found ${messageElements.length} message elements`);

            const messages = [];
            messageElements.forEach((messageEl, index) => {
              try {
                // Get message text
                const bodyEl = messageEl.querySelector(
                  ".msg-s-event-listitem__body"
                );
                const text = bodyEl ? bodyEl.textContent.trim() : "";

                if (!text) return; // Skip empty messages

                // Determine sender (you vs them)
                const isFromYou = !messageEl.classList.contains(
                  "msg-s-event-listitem--other"
                );

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

                // Extract reply button (if present)
                const replyButton = messageEl.querySelector(
                  ".msg-s-event-listitem__hover-action-button"
                );
                const hasReplyButton = !!replyButton;

                // Helper functions for message extraction
                function detectMessageType(messageEl) {
                  if (
                    messageEl.querySelector(".msg-s-event-listitem__attachment")
                  ) {
                    return "attachment";
                  }
                  if (messageEl.querySelector(".msg-s-event-listitem__image")) {
                    return "image";
                  }
                  if (messageEl.querySelector(".msg-s-event-listitem__file")) {
                    return "file";
                  }
                  if (
                    messageEl.querySelector(
                      ".msg-s-event-listitem__link-preview"
                    )
                  ) {
                    return "link";
                  }
                  return "text";
                }

                function extractAttachments(messageEl) {
                  const attachments = [];

                  // Check for file attachments
                  const fileEls = messageEl.querySelectorAll(
                    ".msg-s-event-listitem__attachment"
                  );
                  fileEls.forEach((fileEl) => {
                    const fileName =
                      fileEl.querySelector(
                        ".msg-s-event-listitem__attachment-name"
                      )?.textContent || "";
                    const fileSize =
                      fileEl.querySelector(
                        ".msg-s-event-listitem__attachment-size"
                      )?.textContent || "";
                    const fileType =
                      fileEl.querySelector(
                        ".msg-s-event-listitem__attachment-type"
                      )?.textContent || "";

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

                function extractMessageStatus(messageEl) {
                  const statusEl = messageEl.querySelector(
                    ".msg-s-event-listitem__status"
                  );
                  if (statusEl) {
                    return statusEl.textContent.trim();
                  }

                  if (
                    messageEl.querySelector(
                      ".msg-s-event-listitem__read-receipt"
                    )
                  ) {
                    return "read";
                  }

                  return "sent";
                }

                function extractLinks(messageEl) {
                  const links = [];
                  const linkEls = messageEl.querySelectorAll("a[href]");
                  linkEls.forEach((linkEl) => {
                    links.push({
                      url: linkEl.href,
                      text: linkEl.textContent.trim(),
                      title: linkEl.title || "",
                    });
                  });
                  return links;
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

                // Extract message type (text, image, file, etc.)
                const messageType = detectMessageType(messageEl);

                // Extract any attachments
                const attachments = extractAttachments(messageEl);

                // Extract message status (sent, delivered, read)
                const status = extractMessageStatus(messageEl);

                // Extract message ID if available
                const messageId = messageEl.id || `msg-${index}`;

                // Extract any links in the message
                const links = extractLinks(messageEl);

                // Extract mentions (@username)
                const mentions = extractMentions(text);

                messages.push({
                  index: index,
                  messageId: messageId,
                  text: text,
                  isFromYou: isFromYou,
                  senderName: senderName,
                  timestamp: timestamp,
                  messageType: messageType,
                  reactions: reactions,
                  hasReplyButton: hasReplyButton,
                  attachments: attachments,
                  status: status,
                  links: links,
                  mentions: mentions,
                  element: {
                    tagName: messageEl.tagName,
                    className: messageEl.className,
                    id: messageEl.id,
                  },
                });
              } catch (e) {
                console.warn("Error parsing message element:", e);
              }
            });

            console.log(`Extracted ${messages.length} messages`);

            // Helper functions for data processing
            function extractParticipants(messages) {
              const participants = new Set();
              messages.forEach((msg) => {
                if (msg.isFromYou) {
                  participants.add("You");
                } else if (msg.senderName) {
                  participants.add(msg.senderName);
                }
              });
              return Array.from(participants);
            }

            function calculateStatistics(messages) {
              const stats = {
                totalMessages: messages.length,
                messagesFromYou: messages.filter((m) => m.isFromYou).length,
                messagesFromThem: messages.filter((m) => !m.isFromYou).length,
                totalCharacters: messages.reduce(
                  (sum, m) => sum + m.text.length,
                  0
                ),
                averageMessageLength: 0,
                messageTypes: {},
                totalReactions: 0,
                messagesWithAttachments: 0,
                messagesWithReplies: 0,
                totalLinks: 0,
                totalMentions: 0,
              };

              if (messages.length > 0) {
                stats.averageMessageLength = Math.round(
                  stats.totalCharacters / messages.length
                );
              }

              // Count message types and other stats
              messages.forEach((msg) => {
                stats.messageTypes[msg.messageType] =
                  (stats.messageTypes[msg.messageType] || 0) + 1;
                stats.totalReactions += msg.reactions.reduce(
                  (sum, r) => sum + r.count,
                  0
                );
                if (msg.attachments.length > 0) {
                  stats.messagesWithAttachments++;
                }
                if (msg.hasReplyButton) {
                  stats.messagesWithReplies++;
                }
                stats.totalLinks += msg.links.length;
                stats.totalMentions += msg.mentions.length;
              });

              return stats;
            }

            // Create clean conversation data
            const conversationData = {
              threadId: threadId,
              url: window.location.href,
              title: document.title,
              timestamp: new Date().toISOString(),
              messageCount: messages.length,
              participants: extractParticipants(messages),
              statistics: calculateStatistics(messages),
              messages: messages,
              fullPageDOM: document.documentElement.outerHTML,
            };

            return conversationData;
          } catch (e) {
            console.error("Message extraction error:", e);
            return { error: e.message };
          }
        },
      });

      console.log("DOM extraction results:", results);

      if (results && results[0] && results[0].result) {
        const domData = results[0].result;
        console.log("DOM data extracted:", domData);

        // Check if the injected function returned an error
        if (domData.error) {
          throw new Error(`DOM extraction failed: ${domData.error}`);
        }

        // Create AI payload only
        const aiPayload = this.createAIPayload(domData);

        // Download AI payload
        await this.downloadJSON(aiPayload, domData.threadId, "ai-payload");

        this.setStatus("Success", "DOM extracted and downloaded");
        extractBtn.textContent = "✅ Extracted!";

        setTimeout(() => {
          extractBtn.textContent = originalText;
          extractBtn.disabled = false;
          this.setStatus("Ready", "LinkedIn page detected");
        }, 2000);
      } else {
        console.error("No results from script injection:", results);
        throw new Error("Failed to extract DOM - no results returned");
      }
    } catch (error) {
      console.error("Error extracting DOM:", error);
      this.setStatus("Error", error.message);
      extractBtn.textContent = "❌ Error";

      setTimeout(() => {
        extractBtn.textContent = originalText;
        extractBtn.disabled = false;
        this.setStatus("Ready", "LinkedIn page detected");
      }, 2000);
    }
  }

  async testMessageInput() {
    const testBtn = document.getElementById("testInputBtn");
    const originalText = testBtn.textContent;

    try {
      testBtn.disabled = true;
      testBtn.textContent = "Testing...";
      this.setStatus("Testing", "Testing message input...");

      const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });

      if (!tab.url.includes("linkedin.com/messaging")) {
        throw new Error("Not on a LinkedIn messaging page");
      }

      // Inject function to fill the input field
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: (messageText) => {
          // Find the message input field
          const inputField = document.querySelector(
            ".msg-form__contenteditable"
          );
          if (!inputField) {
            return { error: "Message input field not found" };
          }

          // Focus the input field
          inputField.focus();

          // Clear existing content
          inputField.innerHTML = "";

          // Insert the text
          inputField.innerHTML = `<p>${messageText}</p>`;

          // Trigger input event to notify LinkedIn
          const inputEvent = new Event("input", { bubbles: true });
          inputField.dispatchEvent(inputEvent);

          return { success: true, message: "Text filled in input field" };
        },
        args: [
          "Hi! This is a test message from the LinkedIn Sales Agent extension. 🚀",
        ],
      });

      if (results && results[0] && results[0].result) {
        const result = results[0].result;
        if (result.error) {
          throw new Error(result.error);
        }
        this.setStatus("Success", "Test message filled in input field");
        testBtn.textContent = "✅ Success!";
      } else {
        throw new Error("Failed to fill input field");
      }
    } catch (error) {
      console.error("Error testing message input:", error);
      this.setStatus("Error", error.message);
      testBtn.textContent = "❌ Error";
    } finally {
      setTimeout(() => {
        testBtn.textContent = originalText;
        testBtn.disabled = false;
        this.setStatus("Ready", "LinkedIn page detected");
      }, 2000);
    }
  }

  async saveToFirebase() {
    const saveBtn = document.getElementById("saveToFirebaseBtn");
    const originalText = saveBtn.textContent;

    try {
      saveBtn.disabled = true;
      saveBtn.textContent = "Saving...";
      this.setStatus("Saving", "Saving conversation to Firebase...");

      const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });

      if (!tab.url.includes("linkedin.com/messaging")) {
        throw new Error("Not on a LinkedIn messaging page");
      }

      // Extract conversation data first
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
          // Get thread ID
          const threadId =
            window.location.href.match(/\/thread\/([^\/\?]+)/)?.[1] ||
            "unknown";

          // Find the message input form first
          const messageForm = document.querySelector(".msg-form");
          if (!messageForm) {
            return { error: "Message input form not found" };
          }

          // Work backwards from the input form to find the specific conversation thread
          let activeConversationThread = messageForm.closest(
            ".msg-convo-wrapper.msg-thread"
          );
          if (!activeConversationThread) {
            activeConversationThread = messageForm.closest(
              "[class*='msg-thread']"
            );
          }

          if (!activeConversationThread) {
            return { error: "Active conversation thread not found" };
          }

          // Find the message list within the active conversation
          const messageListContainer = activeConversationThread.querySelector(
            ".msg-s-message-list"
          );
          if (!messageListContainer) {
            return { error: "Message list container not found" };
          }

          // Find the message content list
          const messageContentList = messageListContainer.querySelector(
            ".msg-s-message-list-content"
          );
          if (!messageContentList) {
            return { error: "Message content list not found" };
          }

          // Extract individual messages
          const messageElements = messageContentList.querySelectorAll(
            ".msg-s-event-listitem"
          );
          const messages = [];

          messageElements.forEach((messageEl, index) => {
            try {
              const textEl = messageEl.querySelector(
                ".msg-s-event-listitem__body"
              );
              const text = textEl ? textEl.textContent.trim() : "";

              const senderEl = messageEl.querySelector(
                ".msg-s-event-listitem__sender"
              );
              const senderName = senderEl ? senderEl.textContent.trim() : "";

              // Extract timestamp - try multiple selectors
              let timestamp = "";
              const timestampEl = messageEl.querySelector(
                ".msg-s-event-listitem__timestamp"
              );
              if (timestampEl) {
                timestamp = timestampEl.textContent.trim();
              } else {
                // Fallback: try to get timestamp from data attributes or other elements
                const timeEl = messageEl.querySelector("time");
                if (timeEl) {
                  timestamp =
                    timeEl.getAttribute("datetime") ||
                    timeEl.textContent.trim();
                }
              }

              // Extract actual timestamp from LinkedIn's data attributes
              let actualTimestamp = "";
              const timeElement = messageEl.querySelector("time");
              if (timeElement) {
                actualTimestamp = timeElement.getAttribute("datetime") || "";
              }

              const isFromYou = messageEl.classList.contains(
                "msg-s-event-listitem--outbound"
              );

              messages.push({
                localIndex: index, // Index within current extraction
                text: text,
                sender: isFromYou ? "you" : "prospect",
                senderName: senderName,
                timestamp: timestamp, // Display timestamp
                actualTimestamp: actualTimestamp, // ISO timestamp for sorting
                extractedAt: new Date().toISOString(),
                isFromYou: isFromYou,
              });
            } catch (e) {
              console.warn("Error parsing message element:", e);
            }
          });

          // Extract prospect name
          const prospectNameEl = activeConversationThread.querySelector(
            ".msg-thread__link-to-profile"
          );
          const prospectName = prospectNameEl
            ? prospectNameEl.textContent.trim()
            : "Unknown";

          return {
            threadId: threadId,
            prospectName: prospectName,
            messages: messages,
            url: window.location.href,
            extractedAt: new Date().toISOString(),
          };
        },
      });

      if (results && results[0] && results[0].result) {
        const conversationData = results[0].result;

        if (conversationData.error) {
          throw new Error(conversationData.error);
        }

        // Save to Firebase
        const conversationId = await this.firebaseService.saveConversation(
          conversationData
        );

        this.setStatus(
          "Success",
          `Conversation saved to Firebase (ID: ${conversationId})`
        );
        saveBtn.textContent = "✅ Saved!";
      } else {
        throw new Error("Failed to extract conversation data");
      }
    } catch (error) {
      console.error("Error saving to Firebase:", error);
      this.setStatus("Error", error.message);
      saveBtn.textContent = "❌ Error";
    } finally {
      setTimeout(() => {
        saveBtn.textContent = originalText;
        saveBtn.disabled = false;
        this.setStatus("Ready", "LinkedIn page detected");
      }, 2000);
    }
  }

  // Function to inject into the page
  getPageDOM() {
    try {
      console.log("Getting DOM from page:", window.location.href);

      const result = {
        url: window.location.href,
        title: document.title,
        html: document.documentElement.outerHTML,
        timestamp: new Date().toISOString(),
      };

      console.log(
        "DOM extraction successful, HTML length:",
        result.html.length
      );
      return result;
    } catch (error) {
      console.error("Error in getPageDOM:", error);
      return { error: error.message };
    }
  }

  escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }

  detectMessageType(messageEl) {
    // Check for different message types
    if (messageEl.querySelector(".msg-s-event-listitem__attachment")) {
      return "attachment";
    }
    if (messageEl.querySelector(".msg-s-event-listitem__image")) {
      return "image";
    }
    if (messageEl.querySelector(".msg-s-event-listitem__file")) {
      return "file";
    }
    if (messageEl.querySelector(".msg-s-event-listitem__link-preview")) {
      return "link";
    }
    return "text";
  }

  extractAttachments(messageEl) {
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

  extractMessageStatus(messageEl) {
    // Check for read receipts, delivery status, etc.
    const statusEl = messageEl.querySelector(".msg-s-event-listitem__status");
    if (statusEl) {
      return statusEl.textContent.trim();
    }

    // Check for read indicators
    if (messageEl.querySelector(".msg-s-event-listitem__read-receipt")) {
      return "read";
    }

    return "sent";
  }

  extractLinks(messageEl) {
    const links = [];
    const linkEls = messageEl.querySelectorAll("a[href]");
    linkEls.forEach((linkEl) => {
      links.push({
        url: linkEl.href,
        text: linkEl.textContent.trim(),
        title: linkEl.title || "",
      });
    });
    return links;
  }

  extractMentions(text) {
    const mentionRegex = /@(\w+)/g;
    const mentions = [];
    let match;
    while ((match = mentionRegex.exec(text)) !== null) {
      mentions.push(match[1]);
    }
    return mentions;
  }

  extractParticipants(messages) {
    const participants = new Set();
    messages.forEach((msg) => {
      if (msg.isFromYou) {
        participants.add("You");
      } else if (msg.senderName) {
        participants.add(msg.senderName);
      }
    });
    return Array.from(participants);
  }

  calculateStatistics(messages) {
    const stats = {
      totalMessages: messages.length,
      messagesFromYou: messages.filter((m) => m.isFromYou).length,
      messagesFromThem: messages.filter((m) => !m.isFromYou).length,
      totalCharacters: messages.reduce((sum, m) => sum + m.text.length, 0),
      averageMessageLength: 0,
      messageTypes: {},
      totalReactions: 0,
      messagesWithAttachments: 0,
      messagesWithReplies: 0,
      totalLinks: 0,
      totalMentions: 0,
    };

    if (messages.length > 0) {
      stats.averageMessageLength = Math.round(
        stats.totalCharacters / messages.length
      );
    }

    // Count message types and other stats
    messages.forEach((msg) => {
      stats.messageTypes[msg.messageType] =
        (stats.messageTypes[msg.messageType] || 0) + 1;
      stats.totalReactions += msg.reactions.reduce(
        (sum, r) => sum + r.count,
        0
      );
      if (msg.attachments.length > 0) {
        stats.messagesWithAttachments++;
      }
      if (msg.hasReplyButton) {
        stats.messagesWithReplies++;
      }
      stats.totalLinks += msg.links.length;
      stats.totalMentions += msg.mentions.length;
    });

    return stats;
  }

  createJSONFile(domData) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");

    const jsonData = {
      metadata: {
        threadId: domData.threadId,
        url: domData.url,
        title: domData.title,
        extractedAt: domData.timestamp,
        extractedBy: "LinkedIn DOM Extractor",
        version: "2.0",
      },
      conversation: {
        messageCount: domData.messageCount,
        participants: domData.participants,
        messages: domData.messages,
        statistics: domData.statistics,
      },
    };

    return JSON.stringify(jsonData, null, 2);
  }

  createAIPayload(domData) {
    // Extract essential data for AI sales processing
    const essentialMessages = domData.messages
      .map((msg) => ({
        index: msg.index,
        text: msg.text,
        sender: msg.isFromYou ? "you" : "prospect",
        attachments: msg.attachments,
        reactions: msg.reactions,
        mentions: msg.mentions,
        // Only include relevant links (no metadata)
        links: msg.links.filter(
          (link) =>
            link.url.includes("prodicity") ||
            link.url.includes("calendly") ||
            link.url.includes("application") ||
            link.text.toLowerCase().includes("apply") ||
            link.text.toLowerCase().includes("program")
        ),
      }))
      .filter((msg) => msg.text && msg.text.trim().length > 0); // Remove empty messages

    // AI payload with essential fields
    const aiPayload = {
      threadId: domData.threadId,
      prospectName: domData.participants.find((p) => p !== "You") || "Unknown",
      messages: essentialMessages,
    };

    return JSON.stringify(aiPayload, null, 2);
  }

  extractSalesSignals(messages) {
    const prospectMessages = messages.filter((m) => m.sender === "prospect");

    // Only extract the most critical sales signals
    const signals = {
      interestLevel: "unknown",
      hasObjections: false,
      lastMessageFrom: messages[messages.length - 1]?.sender,
    };

    // Check for interest indicators
    const interestKeywords = [
      "interested",
      "excited",
      "perfect",
      "awesome",
      "love to",
    ];
    const objectionKeywords = [
      "busy",
      "not sure",
      "maybe later",
      "expensive",
      "cost",
    ];

    prospectMessages.forEach((msg) => {
      const text = msg.text.toLowerCase();

      if (interestKeywords.some((keyword) => text.includes(keyword))) {
        signals.interestLevel = "high";
      }

      if (objectionKeywords.some((keyword) => text.includes(keyword))) {
        signals.hasObjections = true;
      }
    });

    return signals;
  }

  async downloadJSON(jsonContent, threadId, type = "full") {
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const filename = `linkedin-conversation-${
      threadId || "unknown"
    }-${type}-${timestamp}.json`;

    const blob = new Blob([jsonContent], { type: "application/json" });
    const url_blob = URL.createObjectURL(blob);

    await chrome.downloads.download({
      url: url_blob,
      filename: filename,
      saveAs: true,
    });
  }
}

// Initialize when DOM is loaded
document.addEventListener("DOMContentLoaded", () => {
  new DOMExtractor();
});

