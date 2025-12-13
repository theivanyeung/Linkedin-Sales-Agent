// Simple DOM Extractor Popup
class DOMExtractor {
  constructor() {
    this.supabaseService = new SupabaseService();
    this.aiService = new AIService();
    this.lastThreadId = null;
    this.consoleEntries = [];
    this.responseHistoryByThread = {};
    this.kbStatusEl = null;
    this.init();
  }

  init() {
    this.setupEventListeners();
    this.checkPageStatus();
    // Load conversation data when page loads or conversation changes
    this.loadConversationOnChange();
    // Check for conversation changes periodically (just to load/display, not save)
    this.conversationCheckInterval = setInterval(
      () => this.loadConversationOnChange(),
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

    const kbToggle = document.getElementById("kbToggle");
    if (kbToggle) {
      kbToggle.addEventListener("click", () => this.toggleKnowledgeBase());
    }

    const scriptsToggle = document.getElementById("scriptsToggle");
    if (scriptsToggle) {
      scriptsToggle.addEventListener("click", () => this.toggleScripts());
    }

    const placeholdersToggle = document.getElementById("placeholdersToggle");
    if (placeholdersToggle) {
      placeholdersToggle.addEventListener("click", () =>
        this.togglePlaceholders()
      );
    }

    this.kbStatusEl = document.getElementById("kbStatusMessage");

    // Auto-save status when dropdown changes (no button needed)
    const statusSelect = document.getElementById("leadStatusSelect");
    if (statusSelect) {
      statusSelect.addEventListener("change", () => this.updateLeadStatus());
    }

    // Phase selector - manual phase change
    const phaseSelect = document.getElementById("phaseSelect");
    if (phaseSelect) {
      phaseSelect.addEventListener("change", () => this.handlePhaseChange());
    }

    const updatePlaceholdersBtn = document.getElementById(
      "updatePlaceholdersBtn"
    );
    if (updatePlaceholdersBtn) {
      updatePlaceholdersBtn.addEventListener("click", () =>
        this.updatePlaceholders()
      );
    }

    // Copy response button
    const copyResponseBtn = document.getElementById("copyResponseBtn");
    if (copyResponseBtn) {
      copyResponseBtn.addEventListener("click", () =>
        this.copyResponseToClipboard()
      );
    }

    // Load scripts on init
    this.loadScripts();

    // Ensure Script Templates panel is closed by default
    this.ensureScriptsPanelClosed();
  }

  ensureScriptsPanelClosed() {
    const content = document.getElementById("scriptsContent");
    const icon = document.getElementById("scriptsToggleIcon");
    if (content && icon) {
      content.classList.remove("open");
      icon.style.transform = "rotate(0deg)";
    }
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
      this.addConsoleLog("FLOW", "Starting generateFromCloud", {});
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
        this.addConsoleLog("SUPABASE", "No conversation found in cloud", {
          threadId,
        });
        throw new Error(
          "No conversation data in cloud. Click Update Cloud first."
        );
      }
      this.addConsoleLog("SUPABASE", "Fetched conversation", {
        threadId,
        messageCount: convo.messages.length,
        status: convo.status || "unknown",
      });

      // Update lead card with status from conversation
      this.updateLeadCard({
        name: convo.title || convo.placeholders?.name || "—",
        description: convo.description || "",
        status: convo.status || "unknown",
        placeholders: convo.placeholders || {},
      });

      // Ensure AI is available
      this.addConsoleLog("FLOW", "Checking AI service health", {
        baseUrl: this.aiService.baseUrl,
      });
      const healthy = await this.aiService.checkHealth();
      if (!healthy) {
        this.addConsoleLog("AI", "Health check failed", {});
        throw new Error(
          "AI service not running (cd ai_module && python main.py)"
        );
      }
      this.addConsoleLog("AI", "Service healthy", {});

      // Generate
      // If user manually set phase to "doing_the_ask", respect it by setting confirm_phase_change
      // This tells the orchestrator to respect the manual phase change even if analyzer disagrees
      if (convo.phase === "doing_the_ask") {
        convo.confirm_phase_change = true;
        this.addConsoleLog(
          "AI",
          "Manual phase override detected - respecting user's phase selection",
          {
            phase: convo.phase,
          }
        );
      }

      this.addConsoleLog("AI", "Requesting /generate", {
        phase: convo.phase,
        messageCount: convo.messages.length,
        confirm_phase_change: convo.confirm_phase_change,
      });
      let aiResult = await this.aiService.generateResponse(
        convo,
        convo.prospectName || convo.title || ""
      );

      // Handle approval required
      if (aiResult.status === "approval_required") {
        this.setStatus("Waiting", "Approval required for phase transition...");
        const approved = await this.showPhaseApprovalDialog(
          aiResult.reasoning,
          aiResult.suggested_phase
        );

        // Update phase in Supabase based on decision
        if (approved) {
          await this.updatePhaseInSupabase(threadId, "doing_the_ask");
          // Re-call with approval
          const convoUpdated = await this.supabaseService.getConversation(
            threadId
          );
          convoUpdated.confirm_phase_change = true;
          aiResult = await this.aiService.generateResponse(
            convoUpdated,
            convoUpdated.prospectName || convoUpdated.title || ""
          );
        } else {
          await this.updatePhaseInSupabase(threadId, "building_rapport");
          // Re-call with rejection
          const convoUpdated = await this.supabaseService.getConversation(
            threadId
          );
          convoUpdated.confirm_phase_change = false;
          aiResult = await this.aiService.generateResponse(
            convoUpdated,
            convoUpdated.prospectName || convoUpdated.title || ""
          );
        }
      }

      // Only proceed if we have a valid response
      if (!aiResult || !aiResult.response) {
        this.addConsoleLog("AI", "No response generated", { threadId });
        this.setStatus("Ready", "No response generated");
        return;
      }

      this.addConsoleLog("AI", "Received /generate result", {
        phase: aiResult.phase,
        readyForAsk: aiResult.ready_for_ask,
        knowledgeSnippets: aiResult.input?.knowledge_context?.length || 0,
      });

      // Show suggested response in the top bar and add to history
      this.setStatus("Suggested", aiResult.response);
      this.addToHistory(threadId, aiResult.response);

      // Update phase display
      this.updatePhaseDisplay(aiResult.phase);

      // Update phase in Supabase if it changed
      if (aiResult.phase && convo.phase !== aiResult.phase) {
        await this.updatePhaseInSupabase(threadId, aiResult.phase);
      }

      // Copy to clipboard (silently handle errors - don't show in status)
      this.addConsoleLog("UI", "Copying response to clipboard", { threadId });
      try {
        await this.aiService.injectResponse(aiResult.response, tab.id);
        this.addConsoleLog("AI", "Generated from cloud - copied to clipboard", {
          threadId,
          phase: aiResult.phase,
        });
      } catch (clipboardError) {
        // Log clipboard error to console only, don't affect status
        this.addConsoleLog("ERROR", "Failed to copy to clipboard", {
          error: clipboardError.message,
          response: aiResult?.response
            ? aiResult.response.substring(0, 50) + "..."
            : "No response",
        });
        console.error("Clipboard copy failed:", clipboardError);
      }
      return aiResult;
    } catch (e) {
      console.error("GenerateFromCloud failed:", e);
      // Only show errors in status if it's NOT a clipboard error
      if (!e.message || !e.message.includes("clipboard")) {
        this.setStatus("Error", e.message || "Failed generating from cloud");
      } else {
        // For clipboard errors, just show the response (user can copy manually)
        this.setStatus(
          "Suggested",
          aiResult?.response || "Response generated - copy manually"
        );
      }
      this.addConsoleLog("ERROR", "generateFromCloud failed", {
        error: e.message,
      });
    }
  }

  setStatus(text, details) {
    document.getElementById("statusText").textContent = text;
    const statusDetailsEl = document.getElementById("statusDetails");
    statusDetailsEl.textContent = details;

    // Show/hide copy button based on status
    const copyBtn = document.getElementById("copyResponseBtn");
    if (copyBtn) {
      if (text === "Suggested" && details) {
        copyBtn.style.display = "block";
        // Store the response text for copying
        copyBtn.dataset.responseText = details;
      } else {
        copyBtn.style.display = "none";
        copyBtn.dataset.responseText = "";
      }
    }
  }

  async copyResponseToClipboard() {
    const copyBtn = document.getElementById("copyResponseBtn");
    if (!copyBtn) return;

    const responseText = copyBtn.dataset.responseText;
    if (!responseText) {
      this.addConsoleLog("ERROR", "No response text to copy", {});
      return;
    }

    try {
      // Try modern clipboard API first
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(responseText);
        this.addConsoleLog("UI", "Response copied to clipboard", {
          length: responseText.length,
        });

        // Show visual feedback
        const originalText = copyBtn.textContent;
        copyBtn.textContent = "✓ Copied";
        copyBtn.style.background = "rgba(34, 197, 94, 0.2)";
        copyBtn.style.borderColor = "#22c55e";

        setTimeout(() => {
          copyBtn.textContent = originalText;
          copyBtn.style.background = "";
          copyBtn.style.borderColor = "";
        }, 2000);
      } else {
        // Fallback: create temporary textarea
        const textarea = document.createElement("textarea");
        textarea.value = responseText;
        textarea.style.position = "fixed";
        textarea.style.left = "-999999px";
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);

        this.addConsoleLog("UI", "Response copied to clipboard (fallback)", {
          length: responseText.length,
        });

        // Show visual feedback
        const originalText = copyBtn.textContent;
        copyBtn.textContent = "✓ Copied";
        setTimeout(() => {
          copyBtn.textContent = originalText;
        }, 2000);
      }
    } catch (error) {
      console.error("Failed to copy to clipboard:", error);
      this.addConsoleLog("ERROR", "Failed to copy to clipboard", {
        error: error.message,
      });

      // Show error feedback
      const originalText = copyBtn.textContent;
      copyBtn.textContent = "❌ Error";
      setTimeout(() => {
        copyBtn.textContent = originalText;
      }, 2000);
    }
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

  updateLeadCard({
    name = "—",
    description = "",
    dataHtml = "",
    status = "unknown",
    placeholders = {},
  } = {}) {
    const nameEl = document.getElementById("leadName");
    const descEl = document.getElementById("leadDescription");
    const dataEl = document.getElementById("leadData");
    const statusSelect = document.getElementById("leadStatusSelect");
    const leadCard = document.getElementById("leadCard");

    // Placeholder input fields
    const placeholderNameInput = document.getElementById("placeholderName");
    const placeholderSchoolInput = document.getElementById("placeholderSchool");
    const placeholderIdeaInput = document.getElementById("placeholderIdea");

    // Update status class on lead card for color coding
    if (leadCard) {
      // Remove all status classes
      leadCard.classList.remove(
        "status-unknown",
        "status-interested",
        "status-enrolled",
        "status-ambassador",
        "status-uninterested"
      );
      // Add the current status class
      if (status) {
        leadCard.classList.add(`status-${status}`);
      } else {
        leadCard.classList.add("status-unknown");
      }
    }

    if (nameEl) nameEl.textContent = `Lead: ${name}`;
    if (descEl) {
      descEl.textContent = description || "";
    }
    if (dataEl) dataEl.innerHTML = dataHtml || "";
    if (statusSelect && status) {
      statusSelect.value = status;
    }

    // Update placeholder input fields
    if (placeholderNameInput) {
      placeholderNameInput.value = placeholders.name || "";
      placeholderNameInput.title = placeholders.name || "Name placeholder";
    }
    if (placeholderSchoolInput) {
      placeholderSchoolInput.value = placeholders.school || "";
      placeholderSchoolInput.title =
        placeholders.school || "School placeholder";
    }
    if (placeholderIdeaInput) {
      placeholderIdeaInput.value = placeholders.their_idea_pain_vision || "";
      placeholderIdeaInput.title =
        placeholders.their_idea_pain_vision || "Idea/Vision placeholder";
    }

    // Update placeholder toggle button text with actual values (compact, no wrap)
    const placeholdersToggleText = document.getElementById(
      "placeholdersToggleText"
    );
    if (placeholdersToggleText) {
      const toggleParts = [];
      if (placeholders.name) toggleParts.push(`${placeholders.name}`);
      if (placeholders.school) toggleParts.push(`${placeholders.school}`);
      // Don't include idea/vision in header to keep it compact

      if (toggleParts.length > 0) {
        // Format: "Name • School" - simple and compact
        placeholdersToggleText.textContent = toggleParts.join(" • ");
        // Add title attribute for full text on hover
        placeholdersToggleText.title = `Name: ${
          placeholders.name || "—"
        } • School: ${placeholders.school || "—"}${
          placeholders.their_idea_pain_vision
            ? ` • Idea: ${placeholders.their_idea_pain_vision}`
            : ""
        }`;
      } else {
        placeholdersToggleText.textContent = "Placeholders";
        placeholdersToggleText.title = "Click to edit placeholder values";
      }
    }
  }

  /**
   * Handle manual phase change from dropdown
   */
  async handlePhaseChange() {
    const phaseSelect = document.getElementById("phaseSelect");
    if (!phaseSelect) return;

    const newPhase = phaseSelect.value;
    if (!newPhase) return;

    const threadId = await this.getActiveThreadId();
    if (!threadId) {
      this.addConsoleLog("ERROR", "Not on a LinkedIn conversation thread", {});
      // Revert select
      const convo = await this.supabaseService.getConversation(threadId);
      if (convo && convo.phase) {
        phaseSelect.value = convo.phase;
      }
      return;
    }

    try {
      this.setStatus("Saving", "Updating phase...");
      await this.updatePhaseInSupabase(threadId, newPhase);

      // Update display
      this.updatePhaseDisplay(newPhase);

      this.setStatus(
        "Success",
        `Phase updated to ${
          newPhase === "doing_the_ask" ? "Selling Phase" : "Building Rapport"
        }`
      );
      this.addConsoleLog("DB", "Phase manually changed", {
        threadId,
        newPhase,
      });

      setTimeout(() => {
        this.setStatus("Ready", "Phase updated");
      }, 2000);
    } catch (error) {
      console.error("Error updating phase:", error);
      this.setStatus("Error", `Failed to update phase: ${error.message}`);
      this.addConsoleLog("ERROR", "Failed to update phase", {
        threadId,
        error: error.message,
      });

      // Revert select to previous value
      const convo = await this.supabaseService.getConversation(threadId);
      if (convo && convo.phase) {
        phaseSelect.value = convo.phase;
      }
    }
  }

  async updateLeadStatus() {
    const statusSelect = document.getElementById("leadStatusSelect");

    if (!statusSelect) return;

    const status = statusSelect.value;
    const threadId = await this.getActiveThreadId();

    if (!threadId) {
      // Silently fail if not on a conversation page
      return;
    }

    try {
      // Auto-save status (no button feedback needed)
      await this.supabaseService.updateLeadStatus(threadId, status);

      this.addConsoleLog("CRM", "Status auto-updated", { threadId, status });

      // Update lead card to reflect new status color immediately
      const leadCard = document.getElementById("leadCard");
      if (leadCard) {
        // Remove all status classes
        leadCard.classList.remove(
          "status-unknown",
          "status-interested",
          "status-enrolled",
          "status-ambassador",
          "status-uninterested",
          "status-graduated"
        );
        // Add the new status class
        leadCard.classList.add(`status-${status}`);
      }
    } catch (error) {
      // Silently fail - don't interrupt user workflow
      console.error("Error updating lead status:", error);
      this.addConsoleLog("CRM", "Status update failed", {
        error: error.message,
      });
    }
  }

  async updatePlaceholders() {
    const updateBtn = document.getElementById("updatePlaceholdersBtn");
    const nameInput = document.getElementById("placeholderName");
    const schoolInput = document.getElementById("placeholderSchool");
    const ideaInput = document.getElementById("placeholderIdea");

    if (!updateBtn) return;

    const threadId = await this.getActiveThreadId();

    if (!threadId) {
      alert("Please open a LinkedIn conversation thread first.");
      return;
    }

    // Get placeholder values from inputs
    const placeholders = {
      name: nameInput?.value.trim() || null,
      school: schoolInput?.value.trim() || null,
      their_idea_pain_vision: ideaInput?.value.trim() || null,
    };

    // Remove empty strings and convert to null
    if (placeholders.name === "") placeholders.name = null;
    if (placeholders.school === "") placeholders.school = null;
    if (placeholders.their_idea_pain_vision === "")
      placeholders.their_idea_pain_vision = null;

    try {
      updateBtn.disabled = true;
      updateBtn.textContent = "Saving...";

      // Get existing conversation to preserve other fields
      const existing = await this.supabaseService.getConversation(threadId);

      if (existing) {
        // Update conversation with new placeholders
        await this.supabaseService.saveConversation({
          threadId: existing.thread_id || threadId,
          title: existing.title,
          description: existing.description,
          url: existing.url,
          messages: existing.messages || [],
          status: existing.status || "unknown",
          placeholders: placeholders, // Use the edited placeholders
        });
      } else {
        // If conversation doesn't exist, we need to create it
        // But we don't have messages, so we can't create it properly
        this.addConsoleLog(
          "PLACEHOLDERS",
          "Cannot update placeholders - conversation not found",
          { threadId }
        );
        alert(
          "Please extract the conversation first by clicking 'Update Cloud'."
        );
        updateBtn.textContent = "Save Placeholders";
        updateBtn.disabled = false;
        return;
      }

      this.addConsoleLog("PLACEHOLDERS", "Placeholders updated", {
        threadId,
        placeholders,
      });
      updateBtn.textContent = "✅ Saved";

      // Update the UI immediately to reflect saved placeholders
      // Refresh the lead card to update toggle text and summary
      const updated = await this.supabaseService.getConversation(threadId);
      if (updated) {
        this.updateLeadCard({
          name: updated.title || updated.placeholders?.name || "—",
          description: updated.description || "",
          status: updated.status || "unknown",
          placeholders: updated.placeholders || placeholders,
        });
      }

      setTimeout(() => {
        updateBtn.textContent = "Save Placeholders";
        updateBtn.disabled = false;
      }, 2000);
    } catch (error) {
      console.error("Error updating placeholders:", error);
      this.addConsoleLog("PLACEHOLDERS", "Placeholder update failed", {
        error: error.message,
      });
      alert(`Failed to update placeholders: ${error.message}`);
      updateBtn.textContent = "Save Placeholders";
      updateBtn.disabled = false;
    }
  }

  updatePhaseDisplay(phase) {
    const phaseEl = document.getElementById("statusPhase");
    const phaseValueEl = document.getElementById("phaseValue");
    const phaseSelect = document.getElementById("phaseSelect");
    if (!phaseEl || !phaseValueEl) return;

    if (phase) {
      const phaseText =
        phase === "doing_the_ask" ? "Selling Phase" : "Building Rapport";
      const phaseColor = phase === "doing_the_ask" ? "#f39c12" : "#8ab4ff";
      phaseValueEl.textContent = phaseText;
      phaseValueEl.style.color = phaseColor;
      phaseEl.style.display = "block";

      // Update select dropdown
      if (phaseSelect) {
        phaseSelect.value = phase;
      }
    } else {
      phaseEl.style.display = "none";
    }
  }

  /**
   * Show approval dialog for phase transition
   * Returns a promise that resolves to true if approved, false if rejected
   */
  async showPhaseApprovalDialog(reasoning, suggestedPhase) {
    return new Promise((resolve) => {
      // Create modal overlay
      const overlay = document.createElement("div");
      overlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.75);
        z-index: 10000;
        display: flex;
        align-items: center;
        justify-content: center;
        backdrop-filter: blur(4px);
      `;

      // Create modal dialog - matching UI theme
      const dialog = document.createElement("div");
      dialog.style.cssText = `
        background: #0f1624;
        border: 1px solid #26344a;
        border-radius: 12px;
        padding: 20px;
        max-width: 500px;
        width: 90%;
        box-shadow: 0 6px 16px rgba(0, 0, 0, 0.5);
        color: #e6edf3;
      `;

      dialog.innerHTML = `
        <div style="margin-bottom: 16px;">
          <div style="font-size: 18px; font-weight: 600; color: #e6edf3; margin-bottom: 8px; display: flex; align-items: center; gap: 8px;">
            <span style="font-size: 20px;">⚠️</span>
            <span>Phase Transition Approval</span>
          </div>
          <div style="font-size: 13px; color: #9aa7b2; margin-top: 4px;">
            The AI wants to transition from <strong style="color: #8ab4ff;">Building Rapport</strong> to <strong style="color: #f39c12;">Selling Phase</strong>.
          </div>
        </div>
        <div style="background: rgba(59, 130, 246, 0.1); border: 1px solid rgba(59, 130, 246, 0.3); border-radius: 8px; padding: 12px; margin: 12px 0; font-size: 13px; color: #c9d1d9; line-height: 1.5;">
          <div style="font-weight: 600; color: #8ab4ff; margin-bottom: 6px;">Reasoning:</div>
          <div>${reasoning || "No reasoning provided"}</div>
        </div>
        <div style="display: flex; gap: 10px; margin-top: 20px;">
          <button id="approveBtn" class="btn btn-primary" style="flex: 1; padding: 10px 16px; font-size: 14px; font-weight: 600;">
            ✅ Approve & Generate Pitch
          </button>
          <button id="rejectBtn" class="btn btn-outline-secondary" style="flex: 1; padding: 10px 16px; font-size: 14px; font-weight: 600;">
            ❌ Reject & Continue Rapport
          </button>
        </div>
      `;

      overlay.appendChild(dialog);
      document.body.appendChild(overlay);

      // Handle approve
      document.getElementById("approveBtn").onclick = () => {
        document.body.removeChild(overlay);
        resolve(true);
      };

      // Handle reject
      document.getElementById("rejectBtn").onclick = () => {
        document.body.removeChild(overlay);
        resolve(false);
      };

      // Close on overlay click (outside dialog)
      overlay.onclick = (e) => {
        if (e.target === overlay) {
          document.body.removeChild(overlay);
          resolve(false); // Default to reject if closed
        }
      };
    });
  }

  /**
   * Update phase in Supabase
   */
  async updatePhaseInSupabase(threadId, newPhase) {
    try {
      const convo = await this.supabaseService.getConversation(threadId);
      if (!convo) {
        console.error("Cannot update phase - conversation not found");
        return;
      }

      // Update phase in Supabase
      await this.supabaseService.saveConversation({
        threadId: threadId,
        phase: newPhase,
        // Preserve other fields
        title: convo.title,
        description: convo.description,
        messages: convo.messages,
        status: convo.status,
        placeholders: convo.placeholders,
      });

      this.addConsoleLog("DB", "Phase updated in Supabase", {
        threadId,
        newPhase,
      });
    } catch (error) {
      console.error("Error updating phase in Supabase:", error);
      this.addConsoleLog("ERROR", "Failed to update phase", {
        threadId,
        error: error.message,
      });
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

      if (!tab || !tab.url || !tab.url.includes("linkedin.com/messaging")) {
        throw new Error("Not on a LinkedIn messaging page");
      }

      // Use message passing to content script instead of script injection
      const domData = await chrome.tabs.sendMessage(tab.id, {
        action: "extractConversation",
        force: true,
      });

      if (!domData) {
        throw new Error("No response from content script");
      }

      // Check if the content script returned an error
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

      // Download messages JSON to dom snapshots/
      await this.downloadJSON(minimal, domData.threadId, "messages");

      // Update lead card in UI using title (name) and description
      const dataHtml = `
        <div>Messages: ${domData.messages.length}</div>
        <div>Last updated: ${new Date(
          domData.timestamp || Date.now()
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

  // Legacy method - kept for reference but replaced with message passing
  async extractDOM_OLD() {
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

      // OLD METHOD - Using executeScript (detectable)
      console.log("Injecting script into tab:", tab.id, tab.url);

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

      // Get thread ID for phase updates
      const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });
      const threadId = tab?.url?.match(/\/thread\/([^\/\?]+)/)?.[1];

      // Get conversation to pass phase
      const convo = await this.supabaseService.getConversation(threadId);
      if (!convo) {
        throw new Error(
          "No conversation found. Please save the conversation first."
        );
      }

      // First call - check for approval
      let aiResult = await this.aiService.generateResponse(
        convo,
        convo.prospectName || convo.title || ""
      );

      // Handle approval required
      if (aiResult.status === "approval_required") {
        this.setStatus("Waiting", "Approval required for phase transition...");
        const approved = await this.showPhaseApprovalDialog(
          aiResult.reasoning,
          aiResult.suggested_phase
        );

        // Update phase in Supabase based on decision
        if (approved) {
          await this.updatePhaseInSupabase(threadId, "doing_the_ask");
          // Re-call with approval
          const convoUpdated = await this.supabaseService.getConversation(
            threadId
          );
          convoUpdated.confirm_phase_change = true;
          aiResult = await this.aiService.generateResponse(
            convoUpdated,
            convoUpdated.prospectName || convoUpdated.title || ""
          );
        } else {
          await this.updatePhaseInSupabase(threadId, "building_rapport");
          // Re-call with rejection
          const convoUpdated = await this.supabaseService.getConversation(
            threadId
          );
          convoUpdated.confirm_phase_change = false;
          aiResult = await this.aiService.generateResponse(
            convoUpdated,
            convoUpdated.prospectName || convoUpdated.title || ""
          );
        }
      }

      // Inject response if we have one
      if (aiResult && aiResult.response) {
        await this.aiService.generateAndInject(this.supabaseService);
      }

      // Update phase in Supabase if it changed
      if (aiResult && aiResult.phase && threadId) {
        const currentConvo = await this.supabaseService.getConversation(
          threadId
        );
        if (currentConvo && currentConvo.phase !== aiResult.phase) {
          await this.updatePhaseInSupabase(threadId, aiResult.phase);
        }
      }

      // Show the response, not clipboard status
      if (aiResult && aiResult.response) {
        this.setStatus("Suggested", aiResult.response);
        this.updatePhaseDisplay(aiResult.phase);
      } else {
        this.setStatus("Ready", "Response generated. Copy manually if needed.");
      }

      if (btn) btn.textContent = "✅ Generated";
      setTimeout(() => {
        if (btn) {
          btn.disabled = false;
          btn.textContent = original || "Generate Response";
        }
      }, 2000);
      return aiResult;
    } catch (e) {
      console.error("Generate response failed:", e);
      // Only show errors in status if it's NOT a clipboard error
      if (!e.message || !e.message.includes("clipboard")) {
        this.setStatus("Error", e.message || "Failed to generate response");
        if (btn) btn.textContent = "❌ Error";
      } else {
        // For clipboard errors, just show that generation succeeded
        this.setStatus("Suggested", "Response generated - copy manually");
        if (btn) btn.textContent = "✅ Generated";
      }
      this.addConsoleLog("ERROR", "generateResponse failed", {
        error: e.message,
      });
      setTimeout(() => {
        if (btn) {
          btn.disabled = false;
          btn.textContent = original || "Generate Response";
        }
      }, 2000);
    }
  }

  /**
   * Auto-generate AI response after conversation is saved
   * This runs in the background and doesn't block the UI
   */
  async autoGenerateResponse(threadId) {
    try {
      this.addConsoleLog("AI", "Auto-generating response after save", {
        threadId,
      });
      this.setStatus("Thinking", "Auto-generating response...");

      // Get the conversation from Supabase (just saved)
      const conversationData = await this.supabaseService.getConversation(
        threadId
      );
      if (
        !conversationData ||
        !conversationData.messages ||
        conversationData.messages.length === 0
      ) {
        this.addConsoleLog("AI", "Skipping auto-gen - no messages", {
          threadId,
        });
        return;
      }

      // Check if last message was sent by "you" - if so, skip auto-generation (wait for prospect response)
      const messages = conversationData.messages || [];
      if (messages.length > 0) {
        const lastMessage = messages[messages.length - 1];
        const lastSender =
          lastMessage.sender || (lastMessage.isFromYou ? "you" : "prospect");
        if (lastSender === "you") {
          this.addConsoleLog(
            "AI",
            "Skipping auto-gen - last message was sent by you, waiting for prospect response",
            {
              threadId,
              lastMessageIndex: messages.length - 1,
            }
          );
          return;
        }
      }

      // Generate response using AI service
      let aiResult = await this.aiService.generateResponse(
        conversationData,
        conversationData.prospectName || conversationData.title || ""
      );

      // Handle approval required - show dialog even for auto-generate
      if (aiResult.status === "approval_required") {
        this.setStatus("Waiting", "Approval required for phase transition...");
        const approved = await this.showPhaseApprovalDialog(
          aiResult.reasoning,
          aiResult.suggested_phase
        );

        // Update phase in Supabase based on decision
        if (approved) {
          await this.updatePhaseInSupabase(threadId, "doing_the_ask");
          // Re-call with approval
          const convoUpdated = await this.supabaseService.getConversation(
            threadId
          );
          convoUpdated.confirm_phase_change = true;
          aiResult = await this.aiService.generateResponse(
            convoUpdated,
            convoUpdated.prospectName || convoUpdated.title || ""
          );
        } else {
          await this.updatePhaseInSupabase(threadId, "building_rapport");
          // Re-call with rejection
          const convoUpdated = await this.supabaseService.getConversation(
            threadId
          );
          convoUpdated.confirm_phase_change = false;
          aiResult = await this.aiService.generateResponse(
            convoUpdated,
            convoUpdated.prospectName || convoUpdated.title || ""
          );
        }
      }

      // Only proceed if we have a valid response
      if (!aiResult || !aiResult.response) {
        this.addConsoleLog("AI", "No response generated", { threadId });
        return;
      }

      this.addConsoleLog("AI", "Received /generate result (auto)", {
        phase: aiResult.phase,
        readyForAsk: aiResult.ready_for_ask,
        knowledgeSnippets: aiResult.input?.knowledge_context?.length || 0,
      });

      // Update phase in Supabase if it changed
      if (aiResult.phase && conversationData.phase !== aiResult.phase) {
        await this.updatePhaseInSupabase(threadId, aiResult.phase);
      }

      // Show suggested response in the top bar (same as manual generation)
      this.setStatus("Suggested", aiResult.response);
      this.addToHistory(threadId, aiResult.response);

      // Update phase display
      this.updatePhaseDisplay(aiResult.phase);

      // Copy to clipboard (silently handle errors - don't show in status)
      const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });
      if (tab && tab.url && tab.url.includes("linkedin.com/messaging")) {
        try {
          await this.aiService.injectResponse(aiResult.response, tab.id);
          this.addConsoleLog(
            "AI",
            "Auto-generated response copied to clipboard",
            {
              threadId,
              phase: aiResult.phase,
            }
          );
        } catch (clipboardError) {
          // Log clipboard error to console only, don't affect status
          this.addConsoleLog(
            "ERROR",
            "Failed to copy to clipboard (auto-gen)",
            {
              error: clipboardError.message,
              threadId,
            }
          );
          console.error("Clipboard copy failed (auto-gen):", clipboardError);
        }
      }

      return aiResult;
    } catch (error) {
      // Silently fail - auto-gen is optional
      this.addConsoleLog("AI", "Auto-generation error (non-blocking)", {
        threadId,
        error: error.message,
      });
      throw error; // Re-throw so caller can handle if needed
    }
  }

  async loadConversationOnChange() {
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
      if (!threadId) return;

      const changed = threadId && threadId !== this.lastThreadId;

      // Only load if conversation changed
      if (!changed) return;

      // Load existing conversation from Supabase to display in UI
      try {
        const existing = await this.supabaseService.getConversation(threadId);
        if (existing) {
          // EXISTING CONVERSATION: Re-extract from DOM to get latest messages
          this.addConsoleLog(
            "DB",
            "Existing conversation detected - re-extracting from DOM to update messages",
            {
              threadId,
              existingMessageCount: existing.messages?.length || 0,
            }
          );

          try {
            // Extract conversation from DOM (gets latest messages)
            const convo = await this.extractConversationFromActiveTab(tab.id);
            if (
              convo &&
              !convo.error &&
              convo.messages &&
              convo.messages.length > 0
            ) {
              // Extract placeholders from the initial message (not from profile)
              const extractedPlaceholders =
                await this.extractPlaceholdersFromTemplate(convo);

              // Preserve existing title/description/url/status if they're good, but update messages and placeholders
              const existingTitleIsClean =
                existing.title &&
                !existing.title.includes("Mobile") &&
                !existing.title.includes("•") &&
                !existing.title.match(/\d+[wdhms]\s+ago/i);

              const finalTitle =
                existingTitleIsClean && existing.title !== "Unknown"
                  ? existing.title
                  : convo.title;
              const finalDescription =
                existing.description && existing.description.length > 0
                  ? existing.description
                  : convo.description;
              const finalUrl = existing.url || convo.url;

              // Update conversation with latest data (including new messages)
              await this.supabaseService.saveConversation({
                threadId: existing.thread_id || threadId,
                title: finalTitle,
                description: finalDescription,
                url: finalUrl,
                messages: convo.messages, // Always update with latest messages from DOM
                status: existing.status || "unknown",
                placeholders: extractedPlaceholders || {},
              });

              // Update UI with saved data
              const dataHtml = `
                <div>Messages: ${convo.messages.length}</div>
                <div>Updated: ${new Date().toLocaleString()}</div>
              `;
              this.updateLeadCard({
                name: finalTitle || extractedPlaceholders?.name || "—",
                description: finalDescription || "",
                dataHtml,
                status: existing.status || "unknown",
                placeholders: extractedPlaceholders || {},
              });

              // Update phase display if phase exists
              if (existing.phase) {
                this.updatePhaseDisplay(existing.phase);
              }

              this.addConsoleLog(
                "DB",
                "Updated existing conversation in Supabase with latest messages",
                {
                  threadId,
                  messageCount: convo.messages.length,
                  previousMessageCount: existing.messages?.length || 0,
                  title: finalTitle,
                }
              );
              this.setStatus("Ready", `Updated conversation ${threadId}`);

              // Auto-generate AI response after successful update
              this.autoGenerateResponse(threadId).catch((err) => {
                // Don't show error to user - auto-gen is optional
                this.addConsoleLog(
                  "AI",
                  "Auto-generation failed (non-blocking)",
                  { error: err.message }
                );
              });
            } else {
              // Extraction failed, just load existing data
              const dataHtml = `
                <div>Messages: ${existing.messages?.length || 0}</div>
                <div>Last updated: ${
                  existing.updated_at
                    ? new Date(existing.updated_at).toLocaleString()
                    : "—"
                }</div>
              `;
              this.updateLeadCard({
                name: existing.title || existing.placeholders?.name || "—",
                description: existing.description || "",
                dataHtml,
                status: existing.status || "unknown",
                placeholders: existing.placeholders || {},
              });

              // Update phase display if phase exists
              if (existing.phase) {
                this.updatePhaseDisplay(existing.phase);
              }

              this.addConsoleLog(
                "DB",
                "Loaded conversation from Supabase (extraction failed)",
                {
                  threadId,
                  error: convo?.error || "Unknown error",
                }
              );
              this.setStatus("Ready", `Loaded conversation ${threadId}`);
            }
          } catch (e) {
            // If extraction fails, just load existing data
            const dataHtml = `
              <div>Messages: ${existing.messages?.length || 0}</div>
              <div>Last updated: ${
                existing.updated_at
                  ? new Date(existing.updated_at).toLocaleString()
                  : "—"
              }</div>
            `;
            this.updateLeadCard({
              name: existing.title || existing.placeholders?.name || "—",
              description: existing.description || "",
              dataHtml,
              status: existing.status || "unknown",
              placeholders: existing.placeholders || {},
            });

            // Update phase display if phase exists
            if (existing.phase) {
              this.updatePhaseDisplay(existing.phase);
            }

            this.addConsoleLog("DB", "Failed to update conversation", {
              threadId,
              error: e.message,
            });
            this.setStatus("Ready", `Loaded conversation ${threadId}`);
          }
        } else {
          // NEW CONVERSATION: Extract from DOM and save to Supabase automatically
          this.addConsoleLog(
            "DB",
            "New conversation detected - extracting from DOM and saving",
            { threadId }
          );

          try {
            // Extract conversation from DOM
            const convo = await this.extractConversationFromActiveTab(tab.id);
            if (
              convo &&
              !convo.error &&
              convo.messages &&
              convo.messages.length > 0
            ) {
              // Extract placeholders from the initial message
              const extractedPlaceholders =
                await this.extractPlaceholdersFromTemplate(convo);
              convo.placeholders = extractedPlaceholders || {};

              // Save to Supabase
              await this.persistConversation(convo);

              // Update UI with saved data
              const dataHtml = `
                <div>Messages: ${convo.messages.length}</div>
                <div>Saved: ${new Date().toLocaleString()}</div>
              `;
              this.updateLeadCard({
                name: convo.title || convo.placeholders?.name || "—",
                description: convo.description || "",
                dataHtml,
                status: "unknown",
                placeholders: convo.placeholders || {},
              });

              this.addConsoleLog("DB", "Saved new conversation to Supabase", {
                threadId,
                messageCount: convo.messages.length,
                title: convo.title,
                url: convo.url,
                placeholders: convo.placeholders,
              });
              this.setStatus("Ready", `Saved new conversation ${threadId}`);

              // Auto-generate AI response after successful save
              this.autoGenerateResponse(threadId).catch((err) => {
                // Don't show error to user - auto-gen is optional
                this.addConsoleLog(
                  "AI",
                  "Auto-generation failed (non-blocking)",
                  { error: err.message }
                );
              });
            } else {
              // Extraction failed or no messages
              this.updateLeadCard({
                name: "—",
                description: "",
                dataHtml:
                  "<div>Could not extract conversation. Make sure you're on a LinkedIn message thread.</div>",
                status: "unknown",
                placeholders: {},
              });
              this.addConsoleLog(
                "DB",
                "Failed to extract conversation from DOM",
                {
                  threadId,
                  error: convo?.error || "No messages found",
                }
              );
              this.setStatus("Error", "Could not extract conversation");
            }
          } catch (error) {
            this.addConsoleLog(
              "DB",
              "Error extracting and saving new conversation",
              {
                error: error.message,
                threadId,
              }
            );
            this.updateLeadCard({
              name: "—",
              description: "",
              dataHtml:
                "<div>Error saving conversation. Click 'Update Cloud' to retry.</div>",
              status: "unknown",
              placeholders: {},
            });
            this.setStatus("Error", `Failed to save: ${error.message}`);
          }
        }
        this.lastThreadId = threadId;
      } catch (e) {
        this.addConsoleLog("DB", "Failed to load conversation", {
          error: e.message,
          threadId,
        });
      }
    } catch (e) {
      // Silent fail to avoid noisy UI
      console.warn("Load conversation failed:", e);
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
      // CRITICAL FIX: Pass force=true to bypass duplicate prevention when manually updating
      const convo = await this.extractConversationFromActiveTab(tab.id, true);
      if (convo && !convo.error) {
        // Get existing conversation to preserve existing placeholders
        const existing = await this.supabaseService.getConversation(
          convo.threadId
        );
        const existingPlaceholders = existing?.placeholders || {};

        // Extract placeholders from the actual initial message ONLY (not from profile)
        // Use the conversation that has the messages (prefer existing from Supabase if available, otherwise use newly extracted)
        let conversationForExtraction =
          existing && existing.messages && existing.messages.length > 0
            ? existing
            : convo;
        const extractedPlaceholders =
          await this.extractPlaceholdersFromTemplate(conversationForExtraction);

        // Use ONLY extracted placeholders from the message - don't merge with profile data
        // This ensures we get exact values like "Ari" not "Ari Zhang", "dvhs" not "Dougherty Valley High School"
        convo.placeholders = extractedPlaceholders || {};

        // IMPORTANT: When updating, preserve existing title/description/url if they exist and are good
        // Only update if the new extracted data is better (not corrupted with status indicators)
        // But always update placeholders from message
        if (existing) {
          // Keep existing title/description if they don't contain status indicators
          // (existing ones were probably cleaned properly when first saved)
          const existingTitleIsClean =
            existing.title &&
            !existing.title.includes("Mobile") &&
            !existing.title.includes("•") &&
            !existing.title.match(/\d+[wdhms]\s+ago/i);

          if (existingTitleIsClean && existing.title !== "Unknown") {
            convo.title = existing.title;
          }

          if (existing.description && existing.description.length > 0) {
            convo.description = existing.description;
          }

          if (existing.url) {
            convo.url = existing.url;
          }
        }

        // CRITICAL FIX: Set forceReplace flag to replace all messages when manually updating
        // This prevents mixing messages from different conversations
        convo.forceReplace = true;

        this.addConsoleLog("DB", "Manual update triggered", {
          threadId: convo.threadId,
          extracted: extractedPlaceholders,
          title: convo.title,
          description: convo.description,
          url: convo.url,
          messageCount: convo.messages?.length || 0,
          forceReplace: true,
        });

        try {
          await this.persistConversation(convo);
          this.addConsoleLog("DB", "Manual update successful", {
            threadId: convo.threadId,
          });
        } catch (saveError) {
          this.addConsoleLog("DB", "Manual update - save failed", {
            threadId: convo.threadId,
            error: saveError.message || String(saveError),
          });
          throw saveError; // Re-throw to be caught by outer catch
        }

        // Update UI with saved data
        const dataHtml = `
          <div>Messages: ${convo.messages.length}</div>
          <div>Last updated: ${new Date(
            convo.extractedAt || Date.now()
          ).toLocaleString()}</div>
        `;
        const displayName = convo.title || convo.placeholders?.name || "—";
        const displayDescription =
          convo.description || "No description available";
        this.updateLeadCard({
          name: displayName,
          description: displayDescription,
          dataHtml,
          status: convo.status || existing?.status || "unknown",
          placeholders: convo.placeholders || {},
        });

        this.setStatus("Synced", `Conversation ${convo.threadId} updated`);
        if (btn) btn.textContent = "✅ Updated";
        this.lastThreadId = convo.threadId;
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

    // Check if last message was sent by "you" - if so, skip auto-generation (wait for prospect response)
    const messages = convo.messages || [];
    if (messages.length > 0) {
      const lastMessage = messages[messages.length - 1];
      const lastSender =
        lastMessage.sender || (lastMessage.isFromYou ? "you" : "prospect");
      if (lastSender === "you") {
        this.addConsoleLog(
          "AI",
          "Skipping auto-gen - last message was sent by you, waiting for prospect response",
          {
            threadId,
            lastMessageIndex: messages.length - 1,
          }
        );
        return;
      }
    }

    // Update lead card with status if available
    if (convo.status) {
      this.updateLeadCard({
        status: convo.status,
      });
    }

    // Generate - check for approval
    let aiResult = await this.aiService.generateResponse(
      convo,
      convo.prospectName || convo.title || ""
    );

    // Handle approval required - show dialog even for auto-generate
    if (aiResult.status === "approval_required") {
      this.setStatus("Waiting", "Approval required for phase transition...");
      const approved = await this.showPhaseApprovalDialog(
        aiResult.reasoning,
        aiResult.suggested_phase
      );

      // Update phase in Supabase based on decision
      if (approved) {
        await this.updatePhaseInSupabase(threadId, "doing_the_ask");
        // Re-call with approval
        const convoUpdated = await this.supabaseService.getConversation(
          threadId
        );
        convoUpdated.confirm_phase_change = true;
        aiResult = await this.aiService.generateResponse(
          convoUpdated,
          convoUpdated.prospectName || convoUpdated.title || ""
        );
      } else {
        await this.updatePhaseInSupabase(threadId, "building_rapport");
        // Re-call with rejection
        const convoUpdated = await this.supabaseService.getConversation(
          threadId
        );
        convoUpdated.confirm_phase_change = false;
        aiResult = await this.aiService.generateResponse(
          convoUpdated,
          convoUpdated.prospectName || convoUpdated.title || ""
        );
      }
    }

    // Only proceed if we have a valid response
    if (!aiResult || !aiResult.response) {
      this.addConsoleLog("AI", "No response generated", { threadId });
      return;
    }

    this.addConsoleLog("AI", "Generated", { phase: aiResult.phase });

    // Copy to clipboard (user will paste manually)
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });
    if (!tab || !tab.url || !tab.url.includes("linkedin.com/messaging")) {
      this.addConsoleLog("AI", "Copy skipped (not on messaging page)", {});
      return;
    }
    // Show suggested response in the top bar and add to history
    this.setStatus("Suggested", aiResult.response);
    this.addToHistory(threadId, aiResult.response);

    // Update phase display
    this.updatePhaseDisplay(aiResult.phase);

    // Copy to clipboard (silently handle errors - don't show in status)
    try {
      await this.aiService.injectResponse(aiResult.response, tab.id);
      this.addConsoleLog("AI", "Response copied to clipboard", { threadId });
    } catch (clipboardError) {
      // Log clipboard error to console only, don't affect status
      this.addConsoleLog("ERROR", "Failed to copy to clipboard", {
        error: clipboardError.message,
        threadId,
      });
      console.error("Clipboard copy failed:", clipboardError);
    }
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

  async extractConversationFromActiveTab(tabId, force = false) {
    // Use message passing to content script instead of script injection
    try {
      // Check if content script is loaded by trying to send a message
      // If it fails, inject the content script first
      let domData;
      try {
        domData = await chrome.tabs.sendMessage(tabId, {
          action: "extractConversation",
          force: force,
        });
      } catch (messageError) {
        // Content script might not be loaded - try to inject it
        const errorStr = String(messageError.message || messageError);
        if (
          errorStr.includes("Receiving end does not exist") ||
          errorStr.includes("Could not establish connection")
        ) {
          this.addConsoleLog(
            "EXTRACTION",
            "Content script not loaded, injecting...",
            {
              tabId: tabId,
            }
          );

          try {
            // Inject content script manually
            await chrome.scripting.executeScript({
              target: { tabId: tabId },
              files: ["content-script.js"],
            });

            // Wait for script to initialize and DOM to be ready
            // Give LinkedIn time to render the conversation UI
            await new Promise((resolve) => setTimeout(resolve, 1000));

            // Try again
            domData = await chrome.tabs.sendMessage(tabId, {
              action: "extractConversation",
              force: force,
            });
          } catch (injectError) {
            // If injection also fails, return helpful error
            return {
              error:
                "Failed to load content script. Please refresh the LinkedIn page and try again.",
            };
          }
        } else {
          throw messageError;
        }
      }

      if (!domData || domData.error) {
        return domData || { error: "No response from content script" };
      }

      return domData;
    } catch (error) {
      console.error("Error extracting conversation:", error);
      const errorMsg = error.message || "Failed to extract conversation";

      // Provide helpful error message
      if (
        errorMsg.includes("Receiving end does not exist") ||
        errorMsg.includes("Could not establish connection")
      ) {
        return {
          error:
            "Content script not loaded. Please refresh the LinkedIn page and try again.",
        };
      }

      return { error: errorMsg };
    }
  }

  // Legacy method - kept for reference but replaced with message passing
  async extractConversationFromActiveTab_OLD(tabId) {
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
            .replace(/\s*@\s*[^•]+/g, "") // Remove everything after @
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

        // Extract prospect name, title, and description from LinkedIn DOM
        // IMPORTANT: Name and status are in SEPARATE elements - target the name element specifically
        let prospectName = "Unknown";
        let prospectTitle = "";
        let prospectDescription = "";

        // Try multiple selectors to find the NAME element specifically (not the container with status)
        // Based on LinkedIn DOM structure: name is in .msg-entity-lockup__entity-title (h2)
        // Status is in a separate .visually-hidden span, title is in .msg-entity-lockup__entity-info
        const nameSelectors = [
          ".msg-entity-lockup__entity-title", // Main name element (h2) - MOST RELIABLE
          ".msg-entity-lockup__entity-title h2", // Nested h2 if needed
          ".msg-s-profile-card__name", // Alternative name class
          "span.msg-s-profile-card__profile-link", // Name span
          ".msg-thread__link-to-profile .msg-entity-lockup__entity-title", // Scoped to profile link
          ".msg-thread__link-to-profile h2", // h2 inside profile link
          "[data-test-id='profile-name']", // Test ID if available
        ];

        let nameElement = null;
        for (const selector of nameSelectors) {
          nameElement = activeConversationThread.querySelector(selector);
          if (
            nameElement &&
            nameElement.textContent &&
            nameElement.textContent.trim()
          ) {
            // Found a name element - use it directly (it's already isolated from status)
            prospectName = nameElement.textContent.trim();
            break;
          }
        }

        // If we didn't find a specific name element, try the profile link but extract carefully
        if (!nameElement || prospectName === "Unknown") {
          const profileLink = activeConversationThread.querySelector(
            ".msg-thread__link-to-profile"
          );

          if (profileLink) {
            // Look for the entity lockup structure
            const entityLockup =
              profileLink.querySelector(".msg-entity-lockup");
            if (entityLockup) {
              const titleEl = entityLockup.querySelector(
                ".msg-entity-lockup__entity-title, h2"
              );
              if (titleEl && titleEl.textContent) {
                prospectName = titleEl.textContent.trim();
              }
            }

            // Last resort: look for h2 or first meaningful text node
            if (prospectName === "Unknown") {
              const h2El = profileLink.querySelector("h2");
              if (h2El && h2El.textContent) {
                prospectName = h2El.textContent.trim();
              } else {
                // Try first direct child text
                const directNameChild = profileLink.querySelector(":scope > *");
                if (directNameChild && directNameChild.textContent) {
                  const text = directNameChild.textContent.trim();
                  // Filter out if it contains status indicators
                  if (
                    !text.match(/Status|Mobile|ago|•/i) &&
                    !text.match(/\d+[wdhms]/)
                  ) {
                    prospectName = text;
                  }
                }
              }
            }
          }
        }

        // Clean the name (should already be clean, but just in case)
        prospectName = clean(prospectName) || "Unknown";

        // Extract title/description from SEPARATE entity-info element (not from name element)
        // Based on DOM: title is in .msg-entity-lockup__entity-info, separate from name
        const headlineSelectors = [
          ".msg-entity-lockup__entity-info", // Main title/description element - MOST RELIABLE
          ".msg-entity-lockup__presence-status", // Status container (contains title)
          ".msg-s-profile-card__headline",
          ".msg-thread__headline",
          '[data-test-id="headline"]',
          ".artdeco-entity-lockup__subtitle",
          ".artdeco-entity-lockup__subtitle div[title]",
          ".artdeco-entity-lockup__subtitle[title]",
        ];

        for (const selector of headlineSelectors) {
          const headlineEl = activeConversationThread.querySelector(selector);
          if (headlineEl) {
            // Get text but exclude visually-hidden status text
            let headlineText = "";
            const allTextNodes = [];
            headlineEl.childNodes.forEach((node) => {
              // Skip visually-hidden elements (they contain status)
              if (node.nodeType === Node.TEXT_NODE) {
                allTextNodes.push(node.textContent);
              } else if (
                node.nodeType === Node.ELEMENT_NODE &&
                !node.classList.contains("visually-hidden") &&
                !node.classList.contains(
                  "msg-entity-lockup__presence-indicator"
                )
              ) {
                // Get text from non-hidden elements
                const text =
                  node.textContent || node.getAttribute("title") || "";
                if (text.trim()) {
                  allTextNodes.push(text);
                }
              }
            });

            headlineText =
              allTextNodes.join(" ").trim() ||
              headlineEl.getAttribute("title") ||
              "";

            if (headlineText.trim()) {
              prospectDescription = clean(headlineText);
              prospectTitle = prospectDescription;
              break; // Use first found headline
            }
          }
        }

        // Final cleanup - ensure name is clean
        const cleanName = clean(prospectName) || "Unknown";
        const cleanDescription = clean(prospectDescription || "");

        return {
          threadId,
          title: cleanName,
          description: cleanDescription,
          prospectName: cleanName,
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

  /**
   * Extract placeholders by comparing the first message (index 0) with the initial message template
   * IMPORTANT: Only extracts from the actual initial message text, NOT from profile/description
   * Uses template comparison to extract {name} and {school} placeholders
   * Returns a map of placeholder keys to values
   */
  async extractPlaceholdersFromTemplate(conversation) {
    const placeholders = {};

    try {
      // Get the template from the backend
      let template = "";
      try {
        const templateResponse =
          await this.aiService.getInitialMessageTemplate();
        template = templateResponse.template || "";
        this.addConsoleLog("PLACEHOLDERS", "Loaded template from backend", {
          template: template.substring(0, 100) + "...",
          templateLength: template.length,
        });
      } catch (error) {
        this.addConsoleLog(
          "PLACEHOLDERS",
          "Failed to load template, using fallback",
          {
            error: error.message,
          }
        );
        // Fallback template
        template =
          "hey {name}, I'm currently researching what students at {school} are working on outside of school, like nonprofits, research, internships, or passion projects. Are you working on any great projects or ideas?";
      }

      // Get the FIRST message (index 0) from the conversation messages
      // The user confirmed this is the initial message
      const messages = conversation.messages || [];
      if (messages.length === 0) {
        this.addConsoleLog("PLACEHOLDERS", "No messages in conversation", {});
        return {
          name: null,
          school: null,
          their_idea_pain_vision: null,
        };
      }

      // Get message at index 0 (first message)
      // Sort messages by index to ensure we get index 0
      const sortedMessages = [...messages].sort(
        (a, b) => (a.index || 0) - (b.index || 0)
      );
      const firstMessage = sortedMessages[0];

      // Verify it's from "you" (should always be for initial messages)
      const sender = firstMessage.sender || "";
      const isFromYou = firstMessage.isFromYou === true || sender === "you";

      if (!isFromYou) {
        this.addConsoleLog(
          "PLACEHOLDERS",
          "First message (index 0) is not from 'you'",
          {
            sender: sender,
            isFromYou: firstMessage.isFromYou,
            messageIndex: firstMessage.index,
            messagePreview: firstMessage.text?.substring(0, 50) || "no text",
          }
        );
        // Still try to extract from it if it exists, but log a warning
      }

      if (!firstMessage || !firstMessage.text) {
        this.addConsoleLog(
          "PLACEHOLDERS",
          "No text in first message (index 0)",
          {
            messageIndex: firstMessage?.index,
            hasMessage: !!firstMessage,
          }
        );
        return {
          name: null,
          school: null,
          their_idea_pain_vision: null,
        };
      }

      const actualMessage = firstMessage.text.trim();
      this.addConsoleLog("PLACEHOLDERS", "Extracting from message at index 0", {
        messageIndex: firstMessage.index,
        sender: sender,
        messagePreview: actualMessage.substring(0, 200),
        templatePreview: template.substring(0, 100) + "...",
      });

      // Extract name by comparing template and actual message
      // Template: "hey {name}," or "Hi {name},"
      // Actual: "Hi Ashaaz," or "hey Rohan,"
      // Match the greeting pattern and extract what comes after
      const templateNamePattern = /\{name\}/i;
      if (templateNamePattern.test(template)) {
        // Find where {name} appears in template (after greeting)
        const templateBeforeName = template.substring(
          0,
          template.indexOf("{name}")
        );
        const templateAfterName = template.substring(
          template.indexOf("{name}") + "{name}".length
        );

        // Extract greeting pattern from template (e.g., "hey ", "Hi ")
        const greetingMatch = templateBeforeName.match(/(?:hey|hi|hello)\s+/i);
        if (greetingMatch) {
          // Find the same greeting in actual message
          const greeting = greetingMatch[0];
          const greetingIndex = actualMessage
            .toLowerCase()
            .indexOf(greeting.toLowerCase());

          if (greetingIndex !== -1) {
            // Extract text after greeting, up to the next punctuation or template pattern
            const nameStart = greetingIndex + greeting.length;
            // Find where name ends - look for comma, period, or space before next word
            const nameEndPatterns = [
              /[,\.!?\n]/, // Punctuation
              /\s+my\s+/i, // Space before "my"
              /\s+I'?m\s+/i, // Space before "I'm"
              /\s+the\s+/i, // Space before "the"
            ];

            let nameEnd = actualMessage.length;
            for (const pattern of nameEndPatterns) {
              const match = actualMessage.substring(nameStart).match(pattern);
              if (match && match.index !== undefined) {
                nameEnd = Math.min(nameEnd, nameStart + match.index);
              }
            }

            if (nameEnd > nameStart) {
              let name = actualMessage.substring(nameStart, nameEnd).trim();
              // Remove trailing punctuation
              name = name.replace(/[,\.!?;:]+$/, "").trim();
              if (name.length > 0 && name.length <= 50) {
                placeholders.name = name;
                this.addConsoleLog(
                  "PLACEHOLDERS",
                  "Extracted name from template comparison",
                  {
                    name: name,
                    greeting: greeting,
                    nameStart: nameStart,
                    nameEnd: nameEnd,
                  }
                );
              }
            }
          }
        }

        // Fallback: if template comparison didn't work, try regex
        if (!placeholders.name) {
          const namePatterns = [
            /^(?:hi|hey|hello)\s+([^,\.!?\n]+?)[,\.!?\n]/i,
            /^(?:hi|hey|hello)\s+([A-Z][a-z]+)(?:\s|,|\.|$)/i,
          ];

          for (const pattern of namePatterns) {
            const match = actualMessage.match(pattern);
            if (match && match[1]) {
              let name = match[1].trim();
              name = name.replace(/\s+(my|the|a|an|and|or)$/i, "").trim();
              if (name.length > 0 && name.length <= 50) {
                placeholders.name = name;
                break;
              }
            }
          }
        }
      }

      // Extract school by comparing template and actual message
      // Template has: "students at {school}" OR might have "attended {school}"
      // Actual message: "attended tino" or "students at valley christian"
      const templateSchoolPattern = /\{school\}/i;
      if (templateSchoolPattern.test(template)) {
        // Template might have: "students at {school}" or variations
        // Actual message might have: "attended tino" or "students at valley christian"

        // Try to find "attended {school}" pattern first (most common in actual messages)
        const attendedPattern =
          /(?:friend|close friend|buddy|pal|colleague)\s+(?:who\s+)?(?:attended|went to)\s+([A-Za-z0-9\s]{1,40})(?:\s+(?:told|pointed|said|mentioned|shared|me|about)|[,\.!?]|$)/i;
        const attendedMatch = actualMessage.match(attendedPattern);

        if (attendedMatch && attendedMatch[1]) {
          let school = attendedMatch[1].trim();
          school = school.replace(/[.,!?;:]+$/, "").trim();
          school = school.replace(/\s+/g, " ").trim();

          // Filter out false positives
          if (
            school.length >= 2 &&
            school.length <= 50 &&
            !school.match(
              /^(the|a|an|and|or|at|from|are|were|used|to|told|said|mentioned|students|friend|who|attended|went|my|close|cool|things|build|there|nonprofits|projects|research|internships|ideas|passion|even|me|about)$/i
            )
          ) {
            placeholders.school = school.toLowerCase();
            this.addConsoleLog(
              "PLACEHOLDERS",
              "Extracted school from 'attended' pattern",
              {
                school: placeholders.school,
                match: attendedMatch[0],
              }
            );
          }
        }

        // If not found, try "students at {school}" pattern (from template)
        if (!placeholders.school) {
          const studentsAtPattern =
            /students\s+(?:at|from)\s+([A-Za-z0-9\s&'\-\.]{1,50}?)(?:\s+(?:are|used to|were|used|build|working|used to build)|[,\.!?]|$)/i;
          const studentsAtMatch = actualMessage.match(studentsAtPattern);

          if (studentsAtMatch && studentsAtMatch[1]) {
            let school = studentsAtMatch[1].trim();
            school = school.replace(/[.,!?;:]+$/, "").trim();
            school = school.replace(/\s+/g, " ").trim();

            if (
              school.length >= 2 &&
              school.length <= 50 &&
              !school.match(
                /^(the|a|an|and|or|at|from|are|were|used|to|told|said|mentioned|students|friend|who|attended|went|my|close|cool|things|build|there|nonprofits|projects|research|internships|ideas|passion|even)$/i
              )
            ) {
              placeholders.school = school.toLowerCase();
              this.addConsoleLog(
                "PLACEHOLDERS",
                "Extracted school from 'students at' pattern",
                {
                  school: placeholders.school,
                  match: studentsAtMatch[0],
                }
              );
            }
          }
        }

        // If still not found, try simpler "attended {school}" pattern
        if (!placeholders.school) {
          const simpleAttendedPattern =
            /(?:attended|went to)\s+([A-Za-z0-9\s]{1,40})(?:\s+(?:told|pointed|said|mentioned|shared|me|about)|[,\.!?]|$)/i;
          const simpleMatch = actualMessage.match(simpleAttendedPattern);

          if (simpleMatch && simpleMatch[1]) {
            let school = simpleMatch[1].trim();
            school = school.replace(/[.,!?;:]+$/, "").trim();
            school = school.replace(/\s+/g, " ").trim();

            if (
              school.length >= 2 &&
              school.length <= 50 &&
              !school.match(
                /^(the|a|an|and|or|at|from|are|were|used|to|told|said|mentioned|students|friend|who|attended|went|my|close|cool|things|build|there|nonprofits|projects|research|internships|ideas|passion|even|me|about)$/i
              )
            ) {
              placeholders.school = school.toLowerCase();
              this.addConsoleLog(
                "PLACEHOLDERS",
                "Extracted school from simple 'attended' pattern",
                {
                  school: placeholders.school,
                  match: simpleMatch[0],
                }
              );
            }
          }
        }
      }

      // DEBUG: Log extraction results
      this.addConsoleLog(
        "PLACEHOLDERS",
        "=== TEMPLATE COMPARISON EXTRACTION ===",
        {
          messageIndex: firstMessage.index,
          template: template.substring(0, 100) + "...",
          actualMessage: actualMessage.substring(0, 200),
          extractedName: placeholders.name || "(NOT FOUND)",
          extractedSchool: placeholders.school || "(NOT FOUND)",
        }
      );

      // Extract their_idea_pain_vision from PROSPECT messages (what they're working on)
      // Look for messages where the prospect talks about their project, idea, passion, or vision
      const prospectMessages = (conversation.messages || [])
        .filter((m) => {
          const sender = m.sender || "";
          return (
            sender === "prospect" || (sender !== "you" && m.isFromYou === false)
          );
        })
        .map((m) => m.text || "")
        .filter((text) => text.trim().length > 0);

      if (prospectMessages.length > 0) {
        const prospectText = prospectMessages.join(" ").toLowerCase();

        // Try to extract key information about their project/idea/passion
        const ideaPatterns = [
          // "I'm working on X" or "working on X"
          /(?:i'?m\s+)?(?:working on|building|creating|developing|starting|launching|doing)\s+(.+?)(?:\.|,|\?|$)/gi,
          // "my project/idea/startup/nonprofit/initiative X"
          /(?:my|our)\s+(?:project|idea|startup|nonprofit|initiative|organization|company|app|platform|program)\s+(?:is|called|about|for|to)?\s*(.+?)(?:\.|,|\?|$)/gi,
          // "I'm passionate about X" or "interested in X"
          /(?:i'?m\s+)?(?:passionate about|interested in|focused on|excited about)\s+(.+?)(?:\.|,|\?|$)/gi,
          // Direct mentions: "X is my project" or "X is what I'm working on"
          /(.+?)\s+(?:is|are)\s+(?:my|what i'?m)\s+(?:project|idea|startup|nonprofit|initiative|passion)/gi,
        ];

        let extractedIdea = null;
        for (const pattern of ideaPatterns) {
          const matches = Array.from(prospectText.matchAll(pattern));
          for (const match of matches) {
            if (match[1]) {
              let idea = match[1].trim();
              // Clean up the idea text
              idea = idea.replace(/^(that|this|it|a|an|the)\s+/i, "").trim();
              // Remove trailing punctuation
              idea = idea.replace(/[.,!?;:]+$/, "").trim();
              // Limit length
              if (idea.length > 10 && idea.length < 200) {
                extractedIdea =
                  idea.length > 100 ? idea.substring(0, 100) + "..." : idea;
                this.addConsoleLog(
                  "PLACEHOLDERS",
                  "Found idea/vision in prospect messages",
                  {
                    idea: extractedIdea,
                    pattern: pattern.toString(),
                    match: match[0],
                    prospectMessageCount: prospectMessages.length,
                  }
                );
                break;
              }
            }
          }
          if (extractedIdea) break;
        }

        // If we didn't find a specific pattern, try to extract from longer prospect responses
        // Look for sentences that mention projects, ideas, or work
        if (!extractedIdea) {
          for (const msg of prospectMessages) {
            const msgLower = msg.toLowerCase();
            // Check if message mentions project-related keywords
            if (
              msgLower.match(
                /(?:project|idea|startup|nonprofit|initiative|working on|building|creating)/i
              )
            ) {
              // Extract first substantial sentence that mentions these keywords
              const sentences = msg
                .split(/[.!?]+/)
                .filter((s) => s.trim().length > 20);
              for (const sentence of sentences) {
                const sentLower = sentence.toLowerCase();
                if (
                  sentLower.match(
                    /(?:project|idea|startup|nonprofit|initiative|working on|building|creating)/i
                  )
                ) {
                  let idea = sentence.trim();
                  idea = idea
                    .replace(/^(that|this|it|a|an|the)\s+/i, "")
                    .trim();
                  if (idea.length > 20 && idea.length < 200) {
                    extractedIdea =
                      idea.length > 100 ? idea.substring(0, 100) + "..." : idea;
                    this.addConsoleLog(
                      "PLACEHOLDERS",
                      "Found idea/vision in prospect message sentence",
                      {
                        idea: extractedIdea,
                        sentence: sentence.substring(0, 100),
                      }
                    );
                    break;
                  }
                }
              }
              if (extractedIdea) break;
            }
          }
        }

        if (extractedIdea) {
          placeholders.their_idea_pain_vision = extractedIdea;
        }
      }

      // Final log with all extracted placeholders
      this.addConsoleLog("PLACEHOLDERS", "=== FINAL EXTRACTION RESULTS ===", {
        name: placeholders.name || null,
        school: placeholders.school || null,
        their_idea_pain_vision: placeholders.their_idea_pain_vision || null,
        allPlaceholders: placeholders,
      });
    } catch (error) {
      this.addConsoleLog("PLACEHOLDERS", "Template extraction failed", {
        error: error.message,
        stack: error.stack,
      });
      // Return empty structure with nulls - don't fall back to profile extraction
      return {
        name: null,
        school: null,
        their_idea_pain_vision: null,
      };
    }

    // Always return placeholders object (even if empty) - never return undefined
    // This ensures we always have a consistent structure
    return {
      name: placeholders.name || null,
      school: placeholders.school || null,
      their_idea_pain_vision: placeholders.their_idea_pain_vision || null,
    };
  }

  /**
   * Fallback placeholder extraction using pattern matching
   * Used when template comparison fails or as a secondary method
   */
  extractPlaceholdersFallback(prospectName, description, messages) {
    const placeholders = {};

    // Find the first message sent by "you" (the initial outreach message)
    const firstYourMessage = (messages || []).find((m) => {
      const sender = m.sender || "";
      const isFromYou =
        m.isFromYou !== false && m.isFromYou !== undefined
          ? m.isFromYou
          : sender === "you";
      return (
        isFromYou ||
        sender === "you" ||
        (sender !== "prospect" && !sender.includes("prospect"))
      );
    });

    if (firstYourMessage && firstYourMessage.text) {
      const messageText = firstYourMessage.text.trim();

      // Extract name: between "hey" and comma
      const nameMatch = messageText.match(/^hey\s+([^,]+?),/i);
      if (nameMatch && nameMatch[1]) {
        placeholders.name = nameMatch[1].trim();
      }

      // Extract school: between "students at" and "are working on" (or similar)
      const studentsAtIndex = messageText.toLowerCase().indexOf("students at");
      if (studentsAtIndex !== -1) {
        const atIndex = messageText
          .toLowerCase()
          .indexOf("at", studentsAtIndex);
        if (atIndex !== -1) {
          const schoolStart = atIndex + 3;
          const endPatterns = [/\s+are\s+working/i, /\s+outside/i, /[.,!?\n]/];

          let schoolEnd = messageText.length;
          for (const pattern of endPatterns) {
            const match = messageText.substring(schoolStart).match(pattern);
            if (match && match.index !== undefined) {
              schoolEnd = Math.min(schoolEnd, schoolStart + match.index);
            }
          }

          if (schoolEnd > schoolStart) {
            let school = messageText.substring(schoolStart, schoolEnd).trim();
            school = school.replace(/[.,!?;:]+$/, "").trim();

            if (school.length >= 1 && school.length <= 50) {
              placeholders.school = school;
            }
          }
        }
      }

      // Fallback: if we didn't find "students at", try just "at" before "are working" or "outside"
      if (!placeholders.school) {
        const atMatch = messageText.match(
          /\bat\s+([A-Za-z0-9\s&'\-\.]{1,50}?)(?:\s+are\s+working|\s+outside|\.|,|$)/i
        );
        if (atMatch && atMatch[1]) {
          let school = atMatch[1].trim();
          school = school.replace(/[.,!?;:]+$/, "").trim();
          if (
            school.length >= 1 &&
            !school.match(/^(the|a|an|and|or|at|from|are|working)$/i) &&
            school.length <= 50
          ) {
            placeholders.school = school;
          }
        }
      }
    }

    // NOTE: We DO NOT extract from profile/description anymore
    // Only extract from the actual initial message text
    // This ensures we get the exact values used in the conversation (e.g., "Ari" not "Ari Zhang", "dvhs" not "Dougherty Valley High School")

    // Extract their_idea/pain/vision from prospect messages
    // Look for messages where prospect talks about their project, idea, pain, or vision
    const prospectMessages = (messages || [])
      .filter(
        (m) =>
          m.sender === "prospect" ||
          (m.sender !== "you" && m.isFromYou === false)
      )
      .map((m) => m.text || "")
      .join(" ");

    if (prospectMessages) {
      // Try to extract key information about their project/idea
      const ideaPatterns = [
        /(?:working on|building|creating|developing|starting|launching|doing)\s+(.+?)(?:\.|,|$)/gi,
        /(?:project|idea|startup|nonprofit|initiative|organization)\s+(.+?)(?:\.|,|$)/gi,
      ];

      for (const pattern of ideaPatterns) {
        const matches = prospectMessages.matchAll(pattern);
        for (const match of matches) {
          if (match[1] && match[1].length > 10 && match[1].length < 200) {
            const idea = match[1].trim();
            // Clean up and truncate if too long
            placeholders.their_idea_pain_vision =
              idea.length > 100 ? idea.substring(0, 100) + "..." : idea;
            break;
          }
        }
        if (placeholders.their_idea_pain_vision) break;
      }
    }

    return placeholders;
  }

  async persistConversation(conversationData) {
    try {
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

      // Log data being saved to Supabase
      this.addConsoleLog("DB", "Preparing to save to Supabase", {
        threadId: conversationData.threadId,
        title: conversationData.title,
        description: conversationData.description
          ? conversationData.description.substring(0, 100) + "..."
          : "none",
        messageCount:
          conversationData.messageCount ||
          conversationData.messages?.length ||
          0,
        url: conversationData.url,
        hasPlaceholders: !!(
          conversationData.placeholders &&
          Object.keys(conversationData.placeholders).length > 0
        ),
        placeholders: conversationData.placeholders || {},
        status: conversationData.status || "unknown",
        participants: conversationData.participants || [],
        hasStatistics: !!conversationData.statistics,
        messagesPreview:
          conversationData.messages?.slice(0, 3).map((m) => ({
            index: m.index,
            sender: m.sender,
            textPreview: m.text?.substring(0, 50) + "...",
            attachmentsCount: m.attachments?.length || 0,
            reactionsCount: m.reactions?.length || 0,
            linksCount: m.links?.length || 0,
            mentionsCount: m.mentions?.length || 0,
          })) || [],
      });

      // Save to Supabase
      this.addConsoleLog("DB", "Writing to Supabase", {
        threadId: conversationData.threadId,
      });

      const result = await this.supabaseService.saveConversation(
        conversationData
      );

      this.addConsoleLog("DB", "Write complete", {
        threadId: conversationData.threadId,
        result: result,
      });
    } catch (error) {
      this.addConsoleLog("DB", "Save to Supabase FAILED", {
        threadId: conversationData.threadId,
        error: error.message || String(error),
        errorStack: error.stack,
        conversationDataKeys: Object.keys(conversationData || {}),
      });
      throw error; // Re-throw so caller can handle it
    }
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

  toggleKnowledgeBase() {
    const content = document.getElementById("kbContent");
    const icon = document.getElementById("kbToggleIcon");
    if (!content || !icon) return;
    const open = content.classList.toggle("open");
    if (open) {
      icon.classList.add("open");
      icon.textContent = "▶";
    } else {
      icon.classList.remove("open");
      icon.textContent = "▶";
    }
    // Rotate icon visually when open
    icon.style.transform = open ? "rotate(90deg)" : "rotate(0deg)";
  }

  toggleScripts() {
    const content = document.getElementById("scriptsContent");
    const icon = document.getElementById("scriptsToggleIcon");
    if (!content || !icon) return;
    const open = content.classList.toggle("open");
    icon.style.transform = open ? "rotate(90deg)" : "rotate(0deg)";
  }

  togglePlaceholders() {
    const content = document.getElementById("placeholdersContent");
    const icon = document.getElementById("placeholdersToggleIcon");
    if (!content || !icon) return;
    const open = content.classList.toggle("open");
    icon.style.transform = open ? "rotate(90deg)" : "rotate(0deg)";
  }

  async loadScripts() {
    const container = document.getElementById("scriptsContainer");
    if (!container) return;

    try {
      // Try health check first, but don't fail completely if it fails
      const healthy = await this.aiService.checkHealth();
      if (!healthy) {
        container.innerHTML =
          '<div class="status-details" style="color: #ffb4b4">AI service not available. Start python main.py<br><small style="color: #9aa7b2;">Make sure to run: cd ai_module && python main.py</small></div>';
        // Still try to load scripts as a fallback
        console.warn(
          "Health check failed, but attempting to load scripts anyway..."
        );
      }

      const result = await this.aiService.getScriptsList();
      const phases = result.phases || {};

      if (Object.keys(phases).length === 0) {
        container.innerHTML =
          '<div class="status-details" style="color: #9aa7b2">No scripts available. Check Flask server logs.</div>';
        return;
      }

      let html = "";
      for (const [phaseId, phaseData] of Object.entries(phases)) {
        const phaseName = phaseData.name || phaseId;
        const templates = phaseData.templates || [];

        if (templates.length === 0) continue;

        html += `<div style="margin-bottom: 16px;">`;
        html += `<div class="status-details" style="font-weight: 600; color: #8ab4ff; margin-bottom: 8px;">${phaseName}</div>`;
        html += `<div style="display: flex; flex-wrap: wrap; gap: 6px;">`;

        for (const template of templates) {
          html += `<button class="btn btn-ghost btn-small script-btn" 
                           data-phase="${phaseId}" 
                           data-template-id="${template.id}"
                           style="font-size: 11px; padding: 4px 8px;">
                    ${template.label}
                  </button>`;
        }

        html += `</div></div>`;
      }

      container.innerHTML = html;

      // Attach click handlers
      container.querySelectorAll(".script-btn").forEach((btn) => {
        btn.addEventListener("click", async (e) => {
          const phase = e.target.getAttribute("data-phase");
          const templateId = e.target.getAttribute("data-template-id");
          await this.insertScript(phase, templateId);
        });
      });

      console.log(
        "Successfully loaded and displayed",
        Object.keys(phases).length,
        "phases of scripts"
      );
    } catch (error) {
      console.error("Error loading scripts:", error);
      const errorMsg = error.message || "Unknown error";
      container.innerHTML = `<div class="status-details" style="color: #ffb4b4">
        Error loading scripts: ${errorMsg}<br>
        <small style="color: #9aa7b2;">Make sure Flask is running: cd ai_module && python main.py</small>
      </div>`;
    }
  }

  async insertScript(phase, templateId) {
    try {
      this.addConsoleLog("SCRIPTS", "Fetching script", { phase, templateId });

      const result = await this.aiService.getScript(phase, templateId);
      let scriptText = result.text || "";

      if (!scriptText) {
        this.addConsoleLog("SCRIPTS", "Script text is empty", {
          phase,
          templateId,
        });
        return;
      }

      // Get the active LinkedIn tab
      const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });

      if (!tab || !tab.url || !tab.url.includes("linkedin.com/messaging")) {
        this.addConsoleLog("SCRIPTS", "Not on LinkedIn messaging page", {});
        alert("Please open a LinkedIn conversation thread first.");
        return;
      }

      // Extract thread ID from URL
      const threadIdMatch = tab.url.match(/\/messaging\/thread\/([^\/]+)/);
      const threadId = threadIdMatch ? threadIdMatch[1] : null;

      // Fetch conversation data to get placeholders
      let placeholders = {};

      if (threadId) {
        try {
          const convo = await this.supabaseService.getConversation(threadId);
          if (convo && convo.placeholders) {
            placeholders = convo.placeholders;
            this.addConsoleLog(
              "SCRIPTS",
              "Loaded placeholders from conversation",
              {
                placeholders,
              }
            );
          }
        } catch (err) {
          console.warn("Could not load conversation for placeholders:", err);
          // Continue without placeholders - user can fill manually
        }
      }

      // Replace placeholders in script text
      // Define all placeholder patterns and their values
      // If placeholder is null/undefined, leave the placeholder text so user can fill manually
      const replacements = [];

      // Name placeholder
      if (placeholders.name) {
        replacements.push({ pattern: /\{name\}/gi, value: placeholders.name });
      }
      // If name is null, leave {name} in the text for user to fill

      // School placeholder
      if (placeholders.school) {
        replacements.push({
          pattern: /\{school\}/gi,
          value: placeholders.school,
        });
      }
      // If school is null, leave {school} in the text for user to fill

      // Their idea/pain/vision placeholder
      if (placeholders.their_idea_pain_vision) {
        // Replace both {their_idea/pain/vision} and {their_idea_pain_vision} variants
        replacements.push({
          pattern: /\{their_idea\/pain\/vision\}/gi,
          value: placeholders.their_idea_pain_vision,
        });
        replacements.push({
          pattern: /\{their_idea_pain_vision\}/gi,
          value: placeholders.their_idea_pain_vision,
        });
        // Also handle {initiative} as an alias
        replacements.push({
          pattern: /\{initiative\}/gi,
          value: placeholders.their_idea_pain_vision,
        });
      }
      // If their_idea_pain_vision is null, leave placeholder in the text for user to fill

      // Apply all replacements
      let replacedCount = 0;
      for (const { pattern, value } of replacements) {
        if (scriptText.match(pattern)) {
          scriptText = scriptText.replace(pattern, value);
          replacedCount++;
        }
      }

      this.addConsoleLog("SCRIPTS", "Replaced placeholders", {
        placeholdersFound: Object.keys(placeholders).length,
        placeholdersReplaced: replacedCount,
        finalLength: scriptText.length,
      });

      // Copy the script to clipboard
      await this.aiService.injectResponse(scriptText, tab.id);

      this.addConsoleLog("SCRIPTS", "Script copied to clipboard", {
        phase,
        templateId,
        length: scriptText.length,
      });
    } catch (error) {
      console.error("Error inserting script:", error);
      this.addConsoleLog("SCRIPTS", "Error inserting script", {
        error: error.message,
      });
      alert(`Failed to insert script: ${error.message}`);
    }
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
      this.addConsoleLog("KB", "Submitting knowledge entry", payload);

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
      this.setKbStatus(
        error.message || "Failed to save knowledge entry.",
        true
      );
      this.addConsoleLog("ERROR", "Knowledge entry save failed", {
        message: error.message,
      });
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

