// Simple DOM Extractor Popup
class DOMExtractor {
  constructor() {
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

            // Find the message list container
            const messageListContainer = document.querySelector(
              ".msg-s-message-list"
            );
            if (!messageListContainer) {
              console.warn("Could not find message list container");
              return { error: "Message list container not found" };
            }

            console.log("Found message list container");

            // Extract individual messages
            const messageElements = messageListContainer.querySelectorAll(
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

        // Create both JSON and HTML files
        const jsonContent = this.createJSONFile(domData);
        const htmlContent = this.createHTMLFile(domData, tab.url);

        // Download both files
        await this.downloadJSON(jsonContent, domData.threadId);
        await this.downloadHTML(htmlContent, domData.threadId);

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

  createHTMLFile(domData, url) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const filename = `linkedin-conversation-${
      domData.threadId || "unknown"
    }-${timestamp}.html`;

    // Create messages HTML
    let messagesHtml = "";
    if (domData.messages && domData.messages.length > 0) {
      messagesHtml = domData.messages
        .map((msg, index) => {
          const senderClass = msg.isFromYou ? "message-you" : "message-them";
          const senderLabel = msg.isFromYou ? "You" : msg.senderName || "Them";
          const timestamp = msg.timestamp || "No timestamp";

          return `
          <div class="message ${senderClass}">
            <div class="message-header">
              <span class="sender">${senderLabel}</span>
              <span class="timestamp">${timestamp}</span>
              <span class="index">#${index + 1}</span>
            </div>
            <div class="message-content">${this.escapeHtml(msg.text)}</div>
          </div>
        `;
        })
        .join("");
    } else {
      messagesHtml =
        '<div class="no-messages">No messages found in this conversation.</div>';
    }

    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>LinkedIn Conversation - Thread ${domData.threadId}</title>
  <style>
    body { 
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; 
      margin: 0; 
      padding: 20px; 
      background: #f5f5f5; 
    }
    .container { 
      max-width: 800px; 
      margin: 0 auto; 
      background: white; 
      border-radius: 12px; 
      padding: 20px; 
      box-shadow: 0 2px 10px rgba(0,0,0,0.1); 
    }
    .header { 
      border-bottom: 2px solid #e1e5e9; 
      padding-bottom: 15px; 
      margin-bottom: 20px; 
    }
    .title { 
      font-size: 24px; 
      font-weight: 600; 
      color: #333; 
      margin: 0; 
    }
    .subtitle { 
      color: #666; 
      margin: 5px 0 0 0; 
    }
    .conversation-info { 
      background: #f8f9fa; 
      padding: 10px; 
      border-radius: 6px; 
      margin-bottom: 20px; 
      font-size: 14px; 
    }
    .messages { 
      display: flex; 
      flex-direction: column; 
      gap: 15px; 
    }
    .message { 
      border-radius: 12px; 
      padding: 15px; 
      max-width: 70%; 
      word-wrap: break-word; 
    }
    .message-you { 
      background: #0073b1; 
      color: white; 
      margin-left: auto; 
      border-bottom-right-radius: 4px; 
    }
    .message-them { 
      background: #e1e5e9; 
      color: #333; 
      margin-right: auto; 
      border-bottom-left-radius: 4px; 
    }
    .message-header { 
      display: flex; 
      justify-content: space-between; 
      align-items: center; 
      margin-bottom: 8px; 
      font-size: 12px; 
      opacity: 0.8; 
    }
    .sender { 
      font-weight: 600; 
    }
    .index { 
      background: rgba(0,0,0,0.1); 
      padding: 2px 6px; 
      border-radius: 10px; 
      font-size: 10px; 
    }
    .message-content { 
      font-size: 14px; 
      line-height: 1.4; 
      white-space: pre-wrap; 
    }
    .stats { 
      background: #e3f2fd; 
      padding: 15px; 
      border-radius: 8px; 
      margin-top: 20px; 
    }
    .stats h3 { 
      margin: 0 0 10px 0; 
      color: #1976d2; 
    }
    .stats-grid { 
      display: grid; 
      grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); 
      gap: 10px; 
    }
    .stat-item { 
      background: white; 
      padding: 10px; 
      border-radius: 6px; 
      text-align: center; 
    }
    .stat-number { 
      font-size: 20px; 
      font-weight: 600; 
      color: #0073b1; 
    }
    .stat-label { 
      font-size: 12px; 
      color: #666; 
    }
    .no-messages { 
      text-align: center; 
      color: #666; 
      font-style: italic; 
      padding: 40px; 
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1 class="title">LinkedIn Conversation</h1>
      <p class="subtitle">Clean message extraction</p>
    </div>
    
    <div class="conversation-info">
      <strong>Thread ID:</strong> ${domData.threadId}<br>
      <strong>URL:</strong> <a href="${domData.url}" target="_blank">${
      domData.url
    }</a><br>
      <strong>Extracted:</strong> ${new Date(
        domData.timestamp
      ).toLocaleString()}<br>
      <strong>Messages:</strong> ${domData.messageCount || 0}
    </div>
    
    <div class="messages">
      ${messagesHtml}
    </div>
    
    <div class="stats">
      <h3>Conversation Statistics</h3>
      <div class="stats-grid">
        <div class="stat-item">
          <div class="stat-number">${domData.messageCount || 0}</div>
          <div class="stat-label">Total Messages</div>
        </div>
        <div class="stat-item">
          <div class="stat-number">${
            domData.messages
              ? domData.messages.filter((m) => m.isFromYou).length
              : 0
          }</div>
          <div class="stat-label">From You</div>
        </div>
        <div class="stat-item">
          <div class="stat-number">${
            domData.messages
              ? domData.messages.filter((m) => !m.isFromYou).length
              : 0
          }</div>
          <div class="stat-label">From Them</div>
        </div>
        <div class="stat-item">
          <div class="stat-number">${
            domData.messages
              ? domData.messages.reduce((sum, m) => sum + m.text.length, 0)
              : 0
          }</div>
          <div class="stat-label">Total Characters</div>
        </div>
      </div>
    </div>
  </div>
</body>
</html>`;
  }

  async downloadHTML(htmlContent, url) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const filename = `linkedin-conversation-${timestamp}.html`;

    const blob = new Blob([htmlContent], { type: "text/html" });
    const url_blob = URL.createObjectURL(blob);

    await chrome.downloads.download({
      url: url_blob,
      filename: filename,
      saveAs: true,
    });
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

  async downloadJSON(jsonContent, threadId) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const filename = `linkedin-conversation-${
      threadId || "unknown"
    }-${timestamp}.json`;

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

