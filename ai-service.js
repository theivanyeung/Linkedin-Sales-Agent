/**
 * AI Service for LinkedIn Sales Agent
 * Handles communication with the Python AI backend
 */

class AIService {
  constructor() {
    // Default AI backend URL (user will need to run Python server)
    this.baseUrl = "http://127.0.0.1:5000";

    // Allow user to configure URL
    this.loadConfig();
  }

  async loadConfig() {
    // Try to load custom URL from storage
    const config = await chrome.storage.sync.get("aiServiceUrl");
    if (config.aiServiceUrl) {
      this.baseUrl = config.aiServiceUrl;
    }
  }

  async saveConfig() {
    await chrome.storage.sync.set({ aiServiceUrl: this.baseUrl });
  }

  /**
   * Check if AI service is available
   */
  async checkHealth() {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    
    try {
      const response = await fetch(`${this.baseUrl}/health`, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
        },
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        console.error(`Health check failed with status: ${response.status}`);
        return false;
      }
      
      const data = await response.json();
      console.log("Health check successful:", data);
      return true;
    } catch (error) {
      clearTimeout(timeoutId);
      if (error.name === 'AbortError') {
        console.error("AI service health check timed out after 5 seconds");
      } else if (error.name === 'TypeError' && error.message.includes('fetch')) {
        console.error("AI service health check failed: Could not connect to server. Make sure Flask is running on", this.baseUrl);
      } else {
        console.error("AI service health check failed:", error);
      }
      return false;
    }
  }

  /**
   * Generate a response for the current conversation
   */
  async generateResponse(conversationData, prospectName = null) {
    try {
      // Extract messages in the format expected by the AI
      const messages = conversationData.messages.map((msg) => ({
        sender: msg.sender || (msg.isFromYou ? "you" : "prospect"),
        text: msg.text || "",
        timestamp: msg.timestamp || msg.actualTimestamp || "",
      }));

      // Extract prospect name
      const name =
        prospectName ||
        conversationData.title ||
        conversationData.prospectName ||
        "Unknown";

      // Prepare request payload
      const payload = {
        thread_id: conversationData.threadId,
        prospect_name: name,
        title: conversationData.title || "",
        description: conversationData.description || "",
        messages: messages,
        app_link: "", // Can be added later if available
        // Send current phase from Supabase for permission gate
        current_phase: conversationData.phase || "building_rapport",
        // confirm_phase_change will be set by the caller if user approves/rejects
        confirm_phase_change: conversationData.confirm_phase_change,
      };

      console.log("Calling AI service with payload:", payload);

      // Call AI service
      const response = await fetch(`${this.baseUrl}/generate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(`AI service error: ${response.status}`);
      }

      const result = await response.json();
      console.log("AI service response:", result);

      // Check if approval is required
      if (result.status === "approval_required") {
        // Return the approval request - caller will handle UI
        return result;
      }

      return result;
    } catch (error) {
      console.error("Error generating AI response:", error);
      throw error;
    }
  }

  /**
   * Copy response to clipboard (replaces DOM injection to avoid detection)
   * User will manually paste into LinkedIn message input field
   * Uses content script to copy, which works even without user gesture
   */
  async injectResponse(messageText, tabId = null) {
    try {
      // First try: Use content script to copy (works without user gesture)
      if (tabId) {
        try {
          const response = await chrome.tabs.sendMessage(tabId, {
            action: 'copyToClipboard',
            text: messageText
          });
          
          if (response && response.success) {
            console.log("Response copied to clipboard via content script.");
            return { success: true, method: "clipboard-content-script" };
          }
        } catch (messageError) {
          // Content script might not be loaded, try direct method
          console.log("Content script copy failed, trying direct method...");
        }
      }
      
      // Fallback: Try direct clipboard API (requires user gesture, may fail)
      try {
        await navigator.clipboard.writeText(messageText);
        console.log("Response copied to clipboard via direct API.");
        return { success: true, method: "clipboard-direct" };
      } catch (clipboardError) {
        // If both fail, try injecting content script and retrying
        if (tabId) {
          try {
            await chrome.scripting.executeScript({
              target: { tabId: tabId },
              files: ['content-script.js']
            });
            await new Promise(resolve => setTimeout(resolve, 300));
            
            const response = await chrome.tabs.sendMessage(tabId, {
              action: 'copyToClipboard',
              text: messageText
            });
            
            if (response && response.success) {
              console.log("Response copied to clipboard after injecting content script.");
              return { success: true, method: "clipboard-injected" };
            }
          } catch (injectError) {
            console.error("All clipboard methods failed:", injectError);
          }
        }
        
        throw new Error("Failed to copy to clipboard. Please copy the message manually.");
      }
    } catch (error) {
      console.error("Error copying to clipboard:", error);
      throw new Error("Failed to copy to clipboard. Please copy the message manually.");
    }
  }

  /**
   * Save a knowledge base document via the AI backend.
   */
  async addKnowledgeEntry({ question, answer, source, tags }) {
    try {
      const response = await fetch(`${this.baseUrl}/kb/add`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ question, answer, source, tags }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Failed to add knowledge document (${response.status}): ${errorText}`
        );
      }

      return await response.json();
    } catch (error) {
      console.error("Error adding knowledge entry:", error);
      throw error;
    }
  }

  /**
   * Get the initial message template for placeholder extraction.
   */
  async getInitialMessageTemplate() {
    try {
      const response = await fetch(`${this.baseUrl}/scripts/initial-message`);
      if (!response.ok) {
        throw new Error(`Failed to fetch initial message template: ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      console.error("Error fetching initial message template:", error);
      throw error;
    }
  }

  /**
   * Get all available scripts organized by phase.
   */
  async getScriptsList() {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);
    
    try {
      const response = await fetch(`${this.baseUrl}/scripts/list`, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
        },
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error(`Failed to fetch scripts: ${response.status} - ${errorText}`);
        throw new Error(`Failed to fetch scripts: ${response.status} ${errorText}`);
      }
      
      const data = await response.json();
      console.log("Successfully loaded scripts:", Object.keys(data.phases || {}).length, "phases");
      return data;
    } catch (error) {
      clearTimeout(timeoutId);
      if (error.name === 'AbortError') {
        console.error("Scripts list request timed out");
        throw new Error("Request timed out. Is the Flask server running?");
      } else if (error.name === 'TypeError' && error.message.includes('fetch')) {
        console.error("Could not connect to Flask server at", this.baseUrl);
        throw new Error(`Could not connect to Flask server at ${this.baseUrl}. Make sure to run: cd ai_module && python main.py`);
      } else {
        console.error("Error fetching scripts list:", error);
        throw error;
      }
    }
  }

  /**
   * Get a specific script template.
   */
  async getScript(phase, templateId) {
    try {
      const response = await fetch(
        `${this.baseUrl}/scripts/get?phase=${encodeURIComponent(phase)}&template_id=${encodeURIComponent(templateId)}`
      );
      if (!response.ok) {
        throw new Error(`Failed to fetch script: ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      console.error("Error fetching script:", error);
      throw error;
    }
  }

  /**
   * Full flow: get conversation → generate response → inject
   *
   * SECURITY: Always requires manual user review and send
   * No automatic sending - user must click LinkedIn's send button
   */
  async generateAndInject(supabaseService) {
    try {
      // SECURITY: Verify we're on a LinkedIn messaging page
      const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });

      if (!tab.url || !tab.url.includes("linkedin.com/messaging")) {
        throw new Error("Not on a LinkedIn messaging page");
      }

      // Extract thread ID
      const threadId = tab.url.match(/\/thread\/([^\/\?]+)/)?.[1];
      if (!threadId) {
        throw new Error("Could not extract thread ID from URL");
      }

      console.log("Extracting conversation for thread:", threadId);

      // Get conversation data from Supabase
      const conversationData = await supabaseService.getConversation(threadId);
      if (!conversationData || !conversationData.messages) {
        throw new Error(
          "No conversation data found. Save the conversation first."
        );
      }

      console.log("Got conversation data:", conversationData);

      // GENERATE RESPONSE
      // This happens server-side, LinkedIn can't detect this
      const aiResult = await this.generateResponse(
        conversationData,
        conversationData.prospectName
      );

      console.log("AI generated response:", aiResult);

      // COPY TO CLIPBOARD
      // SECURITY NOTE: No DOM manipulation - just copies to clipboard
      // User will manually paste and click send in LinkedIn
      // This is completely undetectable by LinkedIn
      // Silently handle clipboard errors - don't throw, just log
      try {
        await this.injectResponse(aiResult.response, tab.id);
        console.log(
          "✅ Response copied to clipboard. Paste into LinkedIn message field and send manually."
        );
      } catch (clipboardError) {
        // Log clipboard error but don't throw - generation succeeded
        console.error("⚠️ Failed to copy to clipboard (user can copy manually):", clipboardError);
        console.log("Response generated successfully - user can copy manually");
      }

      return aiResult;
    } catch (error) {
      console.error("Error in generateAndInject:", error);
      throw error;
    }
  }
}

// Export for use
if (typeof module !== "undefined" && module.exports) {
  module.exports = AIService;
} else {
  window.AIService = AIService;
}

