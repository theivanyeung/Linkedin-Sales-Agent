// Simple DOM Extractor Popup
class DOMExtractor {
  constructor() {
    this.supabaseService = new SupabaseService();
    this.aiService = new AIService();
    this.lastThreadId = null;
    this.lastAutoSaveAt = 0;
    this.consoleEntries = [];
    this.responseHistoryByThread = {};
    this.kbStatusEl = null;
    this.init();
  }

  init() {
    this.setupEventListeners();
    this.checkPageStatus();
    // Start auto-save polling (side panel persists)
    this.autoSaveInterval = setInterval(
      () => this.autoSaveConversationIfNeeded(),
      3000
    );
  }

  setupEventListeners() {
    document.getElementById("extractBtn").addEventListener("click", () => {
      this.extractDOM();
    });

    const genBtn = document.getElementById("generateResponseBtn");
    if (genBtn) {
      genBtn.addEventListener("click", () => {
        this.generateFromCloud();
      });
    }

    const updateBtn = document.getElementById("updateCloudBtn");
    if (updateBtn) {
      updateBtn.addEventListener("click", () => {
        this.manualUpdateCloud();
      });
    }

    // Single generate button handles fetching from cloud and injecting
    const prevBtn = document.getElementById("prevRespBtn");
    const nextBtn = document.getElementById("nextRespBtn");
    if (prevBtn)
      prevBtn.addEventListener("click", () => this.navigateHistory(-1));
    if (nextBtn)
      nextBtn.addEventListener("click", () => this.navigateHistory(1));
    
    const saveKbBtn = document.getElementById("saveKbBtn");
    if (saveKbBtn) {
      saveKbBtn.addEventListener("click", () => this.saveKnowledgeEntry());
    }

    this.kbStatusEl = document.getElementById("kbStatusMessage");
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

  async generateFromCloud() {
    try {
      this.setStatus("Thinking", "Fetching from cloud and generating...");
      const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });
      if (
        !tab ||
        !tab.url ||
        !tab.url.includes("linkedin.com/messaging/thread/")
      ) {
        throw new Error("Open a LinkedIn conversation thread first");
      }
      const threadId = tab.url.match(/\/thread\/([^\/\?]+)/)?.[1];
      if (!threadId) throw new Error("Cannot determine thread ID");

      // Fetch conversation from Supabase
      const convo = await this.supabaseService.getConversation(threadId);
      if (!convo || !convo.messages || !convo.messages.length) {
        throw new Error(
          "No conversation data in cloud. Click Update Cloud first."
        );
      }

      // Ensure AI is available
      const healthy = await this.aiService.checkHealth();
      if (!healthy)
        throw new Error(
          "AI service not running (cd ai_module && python main.py)"
        );

      // Generate
      const aiResult = await this.aiService.generateResponse(
        convo,
        convo.prospectName || convo.title || ""
      );

      // Show suggested response in the top bar and add to history
      this.setStatus("Suggested", aiResult.response);
      this.addToHistory(threadId, aiResult.response);
      
      // Update phase display
      this.updatePhaseDisplay(aiResult.phase);

      // Inject
      await this.aiService.injectResponse(aiResult.response, tab.id);
      this.addConsoleLog("AI", "Generated from cloud", {
        threadId,
        phase: aiResult.phase,
      });
      return aiResult;
    } catch (e) {
      console.error("GenerateFromCloud failed:", e);
      this.setStatus("Error", e.message || "Failed generating from cloud");
    }
  }

  setStatus(text, details) {
    document.getElementById("statusText").textContent = text;
    document.getElementById("statusDetails").textContent = details;
  }

  addConsoleLog(tag, message, meta) {
    try {
      const list = document.getElementById("consoleList");
      if (!list) return;
      const ts = new Date().toLocaleTimeString();
      const line = `[${ts}] ${tag}: ${message}${
        meta ? ` ${JSON.stringify(meta)}` : ""
      }`;
      this.consoleEntries.push(line);
      if (this.consoleEntries.length > 200) this.consoleEntries.shift();
      list.textContent = this.consoleEntries.join("\n");
      list.scrollTop = list.scrollHeight;
    } catch (_) {}
  }

  updateLeadCard({ name = "—", description = "", dataHtml = "" } = {}) {
    const nameEl = document.getElementById("leadName");
    const descEl = document.getElementById("leadDescription");
    const dataEl = document.getElementById("leadData");
    if (nameEl) nameEl.textContent = `Lead: ${name}`;
    if (descEl) descEl.textContent = description || "";
    if (dataEl) dataEl.innerHTML = dataHtml || "";
  }

  updatePhaseDisplay(phase) {
    const phaseEl = document.getElementById("statusPhase");
    const phaseValueEl = document.getElementById("phaseValue");
    if (!phaseEl || !phaseValueEl) return;
    
    if (phase) {
      const phaseText = phase === "doing_the_ask" ? "Selling Phase" : "Building Rapport";
      const phaseColor = phase === "doing_the_ask" ? "#f39c12" : "#8ab4ff";
      phaseValueEl.textContent = phaseText;
      phaseValueEl.style.color = phaseColor;
      phaseEl.style.display = "block";
    } else {
      phaseEl.style.display = "none";
    }
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
                const isFromYou =
                  messageEl.classList.contains(
                    "msg-s-event-listitem--outbound"
                  ) ||
                  messageEl.classList.contains("msg-s-event-listitem--self") ||
                  !!messageEl.querySelector(
                    ".msg-s-event-listitem__profile-picture--me, .msg-s-message-group--own"
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

                // Extract message type (text, image, file, etc.)
                const messageType = detectMessageType(messageEl);

                // Extract any attachments
                const attachments = extractAttachments(messageEl);

                // Extract message status (sent, delivered, read)
                const status = extractMessageStatus(messageEl);

                // Extract any links from body only
                const links = extractLinksFromBody(bodyEl, text);

                // Extract mentions (@username)
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

            // Extract prospect name/title/description
            let prospectName = "Unknown";
            let prospectDescription = "";
            const profileLink = activeConversationThread.querySelector(
              ".msg-thread__link-to-profile"
            );
            if (profileLink) {
              const fullText = profileLink.textContent.trim();
              const statusMatch = fullText.match(
                /Status\s+is\s+(offline|online)/i
              );
              if (statusMatch && statusMatch.index !== undefined) {
                prospectName = fullText.substring(0, statusMatch.index).trim();
              } else {
                const nameEl = profileLink.querySelector(
                  "span[aria-label], .msg-s-profile-card__name, span.msg-s-profile-card__profile-link"
                );
                prospectName = (nameEl ? nameEl.textContent : fullText).trim();
              }
            }

            // Prefer subtitle div with title attribute for description
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

            // Clean the name and description
            const clean = (s) =>
              (s || "")
                .replace(/Status\s+is\s+\w+/gi, "")
                .replace(/Available on mobile/gi, "")
                .replace(/[\n\t]+/g, " ")
                .replace(/\s{2,}/g, " ")
                .trim();
            const cleanTitle = clean(prospectName) || "Unknown";
            const cleanDescription = clean(prospectDescription);

            // Create clean conversation data
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
              fullPageDOM: document.documentElement.outerHTML,
              activeThreadDOM: activeConversationThread.outerHTML,
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

        // Generate minimal JSON for download
        const minimal = JSON.stringify(
          {
            threadId: domData.threadId,
            title: domData.title,
            description: domData.description,
            messages: domData.messages,
          },
          null,
          2
        );

        // Download raw HTML of the active thread DOM to dom snapshots/
        if (domData.activeThreadDOM) {
          await this.downloadHTML(
            domData.activeThreadDOM,
            domData.threadId,
            "thread",
            true
          );
        }

        // Download messages JSON to dom snapshots/
        await this.downloadJSON(minimal, domData.threadId, "messages");

        // Update lead card in UI using title (name) and description
        const dataHtml = `
          <div>Messages: ${domData.messages.length}</div>
          <div>Last updated: ${new Date(
            domData.extractedAt || Date.now()
          ).toLocaleString()}</div>
        `;
        this.updateLeadCard({
          name: domData.title || "—",
          description: domData.description || "",
          dataHtml,
        });

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

  async generateResponse() {
    const btn = document.getElementById("generateResponseBtn");
    const original = btn ? btn.textContent : "";
    try {
      if (btn) {
        btn.disabled = true;
        btn.textContent = "Generating...";
      }
      this.setStatus("Thinking", "Generating suggested reply...");
      const result = await this.aiService.generateAndInject(
        this.supabaseService
      );
      this.setStatus("Ready", "Response injected. Review and send manually.");
      if (btn) btn.textContent = "✅ Inserted";
      setTimeout(() => {
        if (btn) {
          btn.disabled = false;
          btn.textContent = original || "Generate Response";
        }
      }, 2000);
      return result;
    } catch (e) {
      console.error("Generate response failed:", e);
      this.setStatus("Error", e.message || "Failed to generate response");
      if (btn) btn.textContent = "❌ Error";
      setTimeout(() => {
        if (btn) {
          btn.disabled = false;
          btn.textContent = original || "Generate Response";
        }
      }, 2000);
    }
  }

  async autoSaveConversationIfNeeded() {
    try {
      const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });
      if (
        !tab ||
        !tab.url ||
        !tab.url.includes("linkedin.com/messaging/thread/")
      )
        return;
      const threadId = tab.url.match(/\/thread\/([^\/\?]+)/)?.[1];
      const now = Date.now();
      const throttleMs = 30000; // 30s
      const timeOk = now - this.lastAutoSaveAt > throttleMs;
      const changed = threadId && threadId !== this.lastThreadId;
      if (!changed && !timeOk) return;

      const convo = await this.extractConversationFromActiveTab(tab.id);
      if (convo && !convo.error) {
        this.addConsoleLog("DB", "Auto-save triggered", { threadId });
        await this.persistConversation(convo);
        this.lastThreadId = convo.threadId;
        this.lastAutoSaveAt = now;

        // Update lead card with proper title and description
        const prospectTitle = convo.title || "";
        const prospectDescription = convo.description || "";

        // For the UI, show: Name as title, Description as description
        const displayName = prospectTitle || "—";
        const displayDescription =
          prospectDescription || prospectTitle || "No description available";

        const dataHtml = `
          <div>Messages: ${convo.messages.length}</div>
          <div>Last updated: ${new Date(
            convo.extractedAt || Date.now()
          ).toLocaleString()}</div>
        `;
        this.updateLeadCard({
          name: displayName,
          description: displayDescription,
          dataHtml,
        });
        this.setStatus("Synced", `Conversation ${convo.threadId} saved`);

        // After saving/updating in cloud, auto-generate and inject a response
        try {
          this.addConsoleLog("AI", "Auto-generating after save", { threadId });
          await this.autoGenerateFromCloud(threadId);
        } catch (e) {
          this.addConsoleLog("AI", "Auto-generate failed (non-blocking)", {
            error: e.message,
          });
        }
      }
    } catch (e) {
      // Silent fail to avoid noisy UI
      console.warn("Auto-save failed:", e);
    }
  }

  async manualUpdateCloud() {
    const btn = document.getElementById("updateCloudBtn");
    const original = btn ? btn.textContent : "";
    try {
      if (btn) {
        btn.disabled = true;
        btn.textContent = "Updating...";
      }
      this.setStatus("Saving", "Updating cloud for current conversation...");
      const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });
      if (
        !tab ||
        !tab.url ||
        !tab.url.includes("linkedin.com/messaging/thread/")
      ) {
        throw new Error("Open a LinkedIn conversation thread first");
      }
      const convo = await this.extractConversationFromActiveTab(tab.id);
      if (convo && !convo.error) {
        this.addConsoleLog("DB", "Manual update triggered", {
          threadId: convo.threadId,
        });
        await this.persistConversation(convo);
        this.setStatus("Synced", `Conversation ${convo.threadId} updated`);
        if (btn) btn.textContent = "✅ Updated";
      } else {
        throw new Error(
          convo && convo.error ? convo.error : "Extraction failed"
        );
      }
    } catch (e) {
      this.addConsoleLog("DB", "Manual update failed", { error: e.message });
      this.setStatus("Error", e.message || "Update failed");
      if (btn) btn.textContent = "❌ Error";
    } finally {
      setTimeout(() => {
        if (btn) {
          btn.disabled = false;
          btn.textContent = original || "Update Cloud";
        }
      }, 2000);
    }
  }

  async autoGenerateFromCloud(threadId) {
    // Fetch latest conversation from Supabase, generate via AI, and inject
    // Runs automatically after a successful cloud save/update
    const healthy = await this.aiService.checkHealth();
    if (!healthy) {
      this.addConsoleLog("AI", "Skipped (AI offline)", {});
      return;
    }
    const convo = await this.supabaseService.getConversation(threadId);
    if (!convo || !convo.messages || !convo.messages.length) {
      this.addConsoleLog("AI", "No conversation found in cloud", {
        threadId,
      });
      return;
    }

    // Generate
    const aiResult = await this.aiService.generateResponse(
      convo,
      convo.prospectName || convo.title || ""
    );
    this.addConsoleLog("AI", "Generated", { phase: aiResult.phase });

    // Inject into currently active LinkedIn tab
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });
    if (!tab || !tab.url || !tab.url.includes("linkedin.com/messaging")) {
      this.addConsoleLog("AI", "Injection skipped (not on messaging)", {});
      return;
    }
      // Show suggested response in the top bar and add to history
      this.setStatus("Suggested", aiResult.response);
      this.addToHistory(threadId, aiResult.response);
      
      // Update phase display
      this.updatePhaseDisplay(aiResult.phase);
      
      await this.aiService.injectResponse(aiResult.response, tab.id);
  }

  // ===== Response History =====
  getHistory(threadId) {
    if (!this.responseHistoryByThread[threadId]) {
      this.responseHistoryByThread[threadId] = { items: [], index: -1 };
    }
    return this.responseHistoryByThread[threadId];
  }

  addToHistory(threadId, text) {
    const hist = this.getHistory(threadId);
    // If current index not at end, truncate forward history
    if (hist.index < hist.items.length - 1) {
      hist.items = hist.items.slice(0, hist.index + 1);
    }
    hist.items.push(text);
    hist.index = hist.items.length - 1;
    this.updateHistoryUI(threadId);
  }

  updateHistoryUI(threadId) {
    const hist = this.getHistory(threadId);
    const counter = document.getElementById("respCounter");
    if (counter)
      counter.textContent = `${hist.items.length ? hist.index + 1 : 0}/${
        hist.items.length
      }`;
    const prevBtn = document.getElementById("prevRespBtn");
    const nextBtn = document.getElementById("nextRespBtn");
    
    // Only enable buttons if multiple responses exist
    const hasMultiple = hist.items.length > 1;
    if (prevBtn) {
      prevBtn.disabled = !hasMultiple || hist.index <= 0;
    }
    if (nextBtn) {
      nextBtn.disabled = !hasMultiple || hist.index >= hist.items.length - 1;
    }
  }

  async navigateHistory(delta) {
    const threadId = await this.getActiveThreadId();
    if (!threadId) return;
    const hist = this.getHistory(threadId);
    const newIndex = hist.index + delta;
    if (newIndex < 0 || newIndex >= hist.items.length) return;
    hist.index = newIndex;
    const text = hist.items[hist.index];
    this.setStatus("Suggested", text);
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });
    if (tab && tab.url && tab.url.includes("linkedin.com/messaging")) {
      await this.aiService.injectResponse(text, tab.id);
    }
    this.updateHistoryUI(threadId);
  }

  // reinjectCurrent removed; generation flow injects automatically

  async getActiveThreadId() {
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });
    if (!tab || !tab.url) return null;
    const match = tab.url.match(/\/thread\/([^\/\?]+)/);
    return match ? match[1] : null;
  }


  async extractConversationFromActiveTab(tabId) {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        function simpleHash(input) {
          let h = 2166136261 >>> 0;
          for (let i = 0; i < input.length; i++) {
            h ^= input.charCodeAt(i);
            h = Math.imul(h, 16777619);
          }
          return (h >>> 0).toString(16);
        }
        const threadId =
          window.location.href.match(/\/thread\/([^\/\?]+)/)?.[1] || "unknown";
        const messageForm = document.querySelector(".msg-form");
        if (!messageForm) return { error: "Message input form not found" };
        let activeConversationThread = messageForm.closest(
          ".msg-convo-wrapper.msg-thread"
        );
        if (!activeConversationThread) {
          activeConversationThread = messageForm.closest(
            "[class*='msg-thread']"
          );
        }
        if (!activeConversationThread)
          return { error: "Active conversation thread not found" };
        const messageListContainer = activeConversationThread.querySelector(
          ".msg-s-message-list"
        );
        if (!messageListContainer)
          return { error: "Message list container not found" };
        const messageContentList = messageListContainer.querySelector(
          ".msg-s-message-list-content"
        );
        if (!messageContentList)
          return { error: "Message content list not found" };
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
            // Robust sender detection: LinkedIn marks inbound with --other
            const isOther = messageEl.classList.contains(
              "msg-s-event-listitem--other"
            );
            const outboundFlags =
              messageEl.classList.contains("msg-s-event-listitem--outbound") ||
              messageEl.classList.contains("msg-s-event-listitem--self") ||
              !!messageEl.querySelector(
                ".msg-s-event-listitem__profile-picture--me, .msg-s-message-group--own"
              );
            const isFromYou = outboundFlags || !isOther;

            // Attachments
            const attachments = [];
            const fileEls = messageEl.querySelectorAll(
              ".msg-s-event-listitem__attachment"
            );
            fileEls.forEach((fileEl) => {
              attachments.push({
                type: "file",
                name:
                  fileEl.querySelector(".msg-s-event-listitem__attachment-name")
                    ?.textContent || "",
                size:
                  fileEl.querySelector(".msg-s-event-listitem__attachment-size")
                    ?.textContent || "",
                fileType:
                  fileEl.querySelector(".msg-s-event-listitem__attachment-type")
                    ?.textContent || "",
              });
            });
            const imageEls = messageEl.querySelectorAll(
              ".msg-s-event-listitem__image img"
            );
            imageEls.forEach((imgEl) => {
              attachments.push({
                type: "image",
                src: imgEl.src || "",
                alt: imgEl.alt || "",
              });
            });

            // Reactions
            const reactions = [];
            const reactionsEl = messageEl.querySelector(
              ".msg-reactions-reaction-summary-presenter__container"
            );
            if (reactionsEl) {
              reactionsEl
                .querySelectorAll(
                  ".msg-reactions-reaction-summary-presenter__reaction"
                )
                .forEach((r) => {
                  const count = r.querySelector(
                    ".msg-reactions-reaction-summary-presenter__count"
                  )?.textContent;
                  reactions.push({
                    emoji:
                      r.querySelector(
                        ".msg-reactions-reaction-summary-presenter__emoji"
                      )?.textContent || "",
                    count: (count && parseInt(count)) || 1,
                  });
                });
            }

            // Links: only anchors inside the body + plain-text URLs; dedupe by URL
            const links = [];
            const urlSet = new Set();
            if (textEl) {
              textEl.querySelectorAll("a[href]").forEach((a) => {
                const url = a.getAttribute("href") || "";
                if (!url || urlSet.has(url)) return;
                urlSet.add(url);
                links.push({
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
                links.push({ url, text: url, title: "" });
              }
            }

            // Mentions
            const mentions = [];
            if (text) {
              const regex = /@(\w+)/g;
              let m;
              while ((m = regex.exec(text)) !== null) mentions.push(m[1]);
            }

            messages.push({
              index,
              text,
              sender: isFromYou ? "you" : "prospect",
              attachments,
              reactions,
              mentions,
              links,
            });
          } catch (e) {}
        });

        // After messages collected, compute clean lead name and backfill senderName for prospect messages
        const clean = (s) =>
          (s || "")
            .replace(/Status\s+is\s+\w+/gi, "")
            .replace(/Available on mobile/gi, "")
            .replace(/[\n\t]+/g, " ")
            .replace(/\s{2,}/g, " ")
            .trim();
        let leadName = "";
        const profileLinkBackfill = document.querySelector(
          ".msg-thread__link-to-profile"
        );
        if (profileLinkBackfill) {
          leadName = clean(profileLinkBackfill.textContent || "");
        }
        if (leadName) {
          messages.forEach((m) => {
            if (m.sender !== "you" && !m.senderName) m.senderName = leadName;
          });
        }
        // Extract prospect name, title, and description from LinkedIn DOM
        let prospectName = "Unknown";
        let prospectTitle = "";
        let prospectDescription = "";

        const profileLink = activeConversationThread.querySelector(
          ".msg-thread__link-to-profile"
        );

        if (profileLink) {
          const fullText = profileLink.textContent.trim();

          // Pattern: "Name Status is offline Title | Description" or "Name Status is online Title"
          // Step 1: Find and extract the name (everything before "Status")
          const statusMatch = fullText.match(/Status\s+is\s+(offline|online)/i);

          if (statusMatch && statusMatch.index !== undefined) {
            // Name is everything before "Status"
            prospectName = fullText.substring(0, statusMatch.index).trim();

            // Everything after "Status is offline/online" is the title/description
            const statusEndIndex = statusMatch.index + statusMatch[0].length;
            const afterStatus = fullText.substring(statusEndIndex).trim();

            if (afterStatus) {
              // Clean up: remove leading pipes, extra whitespace
              prospectDescription = afterStatus
                .replace(/^[|\s\-]+|[|\s\-]+$/g, "")
                .trim();
              prospectTitle = prospectDescription;
            }
          } else {
            // No status found - try alternative methods
            // Try to find name in a child element first
            const nameElement = profileLink.querySelector(
              "span[aria-label], .msg-s-profile-card__name, span.msg-s-profile-card__profile-link"
            );

            if (nameElement) {
              prospectName = nameElement.textContent.trim();
              // Get description from headline element or remaining text
              const headlineEl = activeConversationThread.querySelector(
                ".msg-s-profile-card__headline, .msg-thread__headline"
              );
              if (headlineEl) {
                prospectDescription = headlineEl.textContent.trim();
                prospectTitle = prospectDescription;
              }
            } else {
              // Fallback: assume full text is name if no status found
              prospectName = fullText;
            }
          }

          // Try to find headline in separate element (overrides if found)
          const headlineEl = activeConversationThread.querySelector(
            '.msg-s-profile-card__headline, .msg-thread__headline, [data-test-id="headline"]'
          );
          if (headlineEl && headlineEl.textContent.trim()) {
            prospectTitle = headlineEl.textContent.trim();
            prospectDescription = prospectTitle;
          }

          // Stronger selector: LinkedIn profile card subtitle with title attribute
          // Example seen in DOM snapshots: div#ember661.artdeco-entity-lockup__subtitle > div[title]
          const subtitleDiv = activeConversationThread.querySelector(
            ".artdeco-entity-lockup__subtitle div[title]"
          );
          if (subtitleDiv) {
            const subText = (
              subtitleDiv.getAttribute("title") ||
              subtitleDiv.textContent ||
              ""
            ).trim();
            if (subText) {
              prospectDescription = subText;
              prospectTitle = subText;
            }
          }
        }

        // Clean name strictly (remove status/mobile) and collapse whitespace (reuse clean from above)
        const cleanName =
          clean(prospectName || prospectTitle || "Unknown") || "Unknown";
        const cleanDescription = clean(prospectDescription || "");

        return {
          threadId,
          title: cleanName,
          description: cleanDescription,
          messages,
          url: window.location.href,
          extractedAt: new Date().toISOString(),
        };
      },
    });
    return results && results[0] && results[0].result
      ? results[0].result
      : { error: "No result" };
  }

  async persistConversation(conversationData) {
    // Save locally
    const storageKey = `linkedin_conversation_${conversationData.threadId}`;
    const savedData = {
      ...conversationData,
      savedAt: new Date().toISOString(),
    };
    this.addConsoleLog("LOCAL", "Saved to chrome.storage", {
      threadId: conversationData.threadId,
    });
    await chrome.storage.local.set({ [storageKey]: savedData });
    // Save to Supabase
    this.addConsoleLog("DB", "Writing to Supabase", {
      threadId: conversationData.threadId,
    });
    await this.supabaseService.saveConversation(conversationData);
    this.addConsoleLog("DB", "Write complete", {
      threadId: conversationData.threadId,
    });
  }

  downloadConversationJSON(conversationData) {
    try {
      const jsonString = JSON.stringify(conversationData, null, 2);
      const blob = new Blob([jsonString], { type: "application/json" });
      const url = URL.createObjectURL(blob);

      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const filename = `linkedin-conversation-${conversationData.threadId}-${timestamp}.json`;

      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      console.log(`Downloaded conversation JSON: ${filename}`);
    } catch (error) {
      console.error("Error downloading JSON:", error);
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

  async testSupabaseConnection() {
    const testBtn = document.getElementById("testSupabaseBtn");
    const originalText = testBtn.textContent;

    try {
      testBtn.disabled = true;
      testBtn.textContent = "Testing...";
      this.setStatus("Testing", "Testing Supabase connection...");

      const isConnected = await this.supabaseService.testConnection();

      if (isConnected) {
        this.setStatus("Success", "Supabase connection successful!");
        testBtn.textContent = "✅ Connected";
      } else {
        this.setStatus(
          "Error",
          "Supabase connection failed. Check console for details."
        );
        testBtn.textContent = "❌ Failed";
      }
    } catch (error) {
      console.error("Supabase test error:", error);
      this.setStatus("Error", `Connection test failed: ${error.message}`);
      testBtn.textContent = "❌ Error";
    } finally {
      setTimeout(() => {
        testBtn.disabled = false;
        testBtn.textContent = originalText;
      }, 3000);
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

              const isFromYou = messageEl.classList.contains(
                "msg-s-event-listitem--outbound"
              );

              messages.push({
                localIndex: index, // Index within current extraction
                text: text,
                sender: isFromYou ? "you" : "prospect",
                senderName: isFromYou ? "You" : senderName || "",
                extractedAt: new Date().toISOString(),
                isFromYou: isFromYou,
              });
            } catch (e) {
              console.warn("Error parsing message element:", e);
            }
          });

          // Extract prospect name, title, and description properly
          let prospectName = "Unknown";
          let prospectTitle = "";
          let prospectDescription = "";

          const profileLink = activeConversationThread.querySelector(
            ".msg-thread__link-to-profile"
          );

          if (profileLink) {
            const fullText = profileLink.textContent.trim();

            // Pattern: "Name Status is offline Title | Description"
            // Step 1: Find "Status is offline/online" pattern
            const statusMatch = fullText.match(
              /Status\s+is\s+(offline|online)/i
            );

            if (statusMatch && statusMatch.index !== undefined) {
              // Name is everything before "Status"
              prospectName = fullText.substring(0, statusMatch.index).trim();

              // Everything after "Status is offline/online" is the title/description
              const statusEndIndex = statusMatch.index + statusMatch[0].length;
              const afterStatus = fullText.substring(statusEndIndex).trim();

              if (afterStatus) {
                // Clean up: remove leading pipes, dashes, extra whitespace
                prospectDescription = afterStatus
                  .replace(/^[|\s\-]+|[|\s\-]+$/g, "")
                  .trim();
                prospectTitle = prospectDescription;
              }
            } else {
              // No status found - try alternative methods
              const nameElement = profileLink.querySelector(
                "span[aria-label], .msg-s-profile-card__name, span.msg-s-profile-card__profile-link"
              );

              if (nameElement) {
                prospectName = nameElement.textContent.trim();
              } else {
                prospectName = fullText;
              }
            }

            // Try to find headline in separate element (this overrides if found)
            const headlineEl2 = activeConversationThread.querySelector(
              '.msg-s-profile-card__headline, .msg-thread__headline, [data-test-id="headline"]'
            );
            if (headlineEl2 && headlineEl2.textContent.trim()) {
              prospectTitle = headlineEl2.textContent.trim();
              prospectDescription = prospectTitle;
            }

            // Stronger selector: profile card subtitle with title attribute
            const subtitleDiv2 = activeConversationThread.querySelector(
              ".artdeco-entity-lockup__subtitle div[title]"
            );
            if (subtitleDiv2) {
              const subText2 = (
                subtitleDiv2.getAttribute("title") ||
                subtitleDiv2.textContent ||
                ""
              ).trim();
              if (subText2) {
                prospectDescription = subText2;
                prospectTitle = subText2;
              }
            }
          }

          // Clean title strictly to the name (remove status fragments and collapse whitespace)
          const cleanName = (prospectTitle || prospectName || "Unknown")
            .replace(/Status\s+is\s+\w+/gi, "")
            .replace(/Available on mobile/gi, "")
            .replace(/[\n\t]+/g, " ")
            .replace(/\s{2,}/g, " ")
            .trim();

          return {
            threadId: threadId,
            title: cleanName || "Unknown",
            description: (prospectDescription || "")
              .replace(/[\n\t]+/g, " ")
              .replace(/\s{2,}/g, " ")
              .trim(),
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

        // Save locally first (for speed)
        const storageKey = `linkedin_conversation_${conversationData.threadId}`;
        const savedData = {
          ...conversationData,
          savedAt: new Date().toISOString(),
        };

        // Save to Chrome storage (backup)
        await chrome.storage.local.set({
          [storageKey]: savedData,
        });

        // Save to Supabase (cloud persistence)
        this.setStatus("Saving", "Syncing to cloud...");
        const threadId = await this.supabaseService.saveConversation(
          conversationData
        );

        // Download JSON file (additional backup)
        this.downloadConversationJSON(savedData);

        this.setStatus(
          "Success",
          `Saved locally & to cloud! Thread ID: ${threadId}`
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
      url: domData.url,
      title: domData.title || "",
      description: domData.description || "",
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
    const base = `linkedin-conversation-${
      threadId || "unknown"
    }-${type}-${timestamp}`;
    const filename = `dom snapshots/${base}.json`;

    const blob = new Blob([jsonContent], { type: "application/json" });
    const url_blob = URL.createObjectURL(blob);

    await chrome.downloads.download({
      url: url_blob,
      filename,
      saveAs: false,
    });
  }

  async downloadHTML(htmlContent, threadId, type = "thread") {
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const base = `linkedin-conversation-${
      threadId || "unknown"
    }-${type}-${timestamp}`;
    const filename = `dom snapshots/${base}.html`;

    const blob = new Blob([htmlContent], { type: "text/html" });
    const url_blob = URL.createObjectURL(blob);

    await chrome.downloads.download({
      url: url_blob,
      filename,
      saveAs: false,
    });
  }

  setKbStatus(message, isError = false) {
    if (!this.kbStatusEl) return;
    this.kbStatusEl.textContent = message;
    this.kbStatusEl.style.color = isError ? "#ffb4b4" : "#9aa7b2";
  }

  async saveKnowledgeEntry() {
    const questionEl = document.getElementById("kbQuestionInput");
    const answerEl = document.getElementById("kbAnswerInput");
    const tagsEl = document.getElementById("kbTagsInput");
    const sourceEl = document.getElementById("kbSourceInput");
    const saveBtn = document.getElementById("saveKbBtn");

    const answer = answerEl ? answerEl.value.trim() : "";
    const question = questionEl ? questionEl.value.trim() : "";
    const tagsRaw = tagsEl ? tagsEl.value.trim() : "";
    const source = sourceEl ? sourceEl.value.trim() : "";

    if (!answer) {
      this.setKbStatus("Answer is required before saving.", true);
      if (answerEl) answerEl.focus();
      return;
    }

    const tags = tagsRaw
      ? tagsRaw
          .split(",")
          .map((tag) => tag.trim())
          .filter((tag) => tag.length > 0)
      : undefined;

    try {
      if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.textContent = "Saving...";
      }
      this.setKbStatus("Saving to knowledge base...", false);

      const payload = {
        question: question || null,
        answer,
        source: source || null,
        tags,
      };

      const result = await this.aiService.addKnowledgeEntry(payload);
      this.setKbStatus("Saved! The AI can now reuse this answer.", false);

      // Clear fields except source to make follow-up entries faster
      if (questionEl) questionEl.value = "";
      if (answerEl) answerEl.value = "";
      if (tagsEl) tagsEl.value = "";

      // Show document id in console panel for debugging
      this.addConsoleLog("KB", "Added entry", {
        id: result?.document?.id,
        source: payload.source,
      });
    } catch (error) {
      this.setKbStatus(error.message || "Failed to save knowledge entry.", true);
    } finally {
      if (saveBtn) {
        saveBtn.disabled = false;
        saveBtn.textContent = "Save to Knowledge Base";
      }
    }
  }
}

// Initialize when DOM is loaded
document.addEventListener("DOMContentLoaded", () => {
  new DOMExtractor();
});

