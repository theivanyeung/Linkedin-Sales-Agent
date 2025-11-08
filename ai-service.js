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
    try {
      const response = await fetch(`${this.baseUrl}/health`);
      return response.ok;
    } catch (error) {
      console.error("AI service health check failed:", error);
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

      return result;
    } catch (error) {
      console.error("Error generating AI response:", error);
      throw error;
    }
  }

  /**
   * Inject response into LinkedIn message input field
   */
  async injectResponse(messageText, tabId = null) {
    try {
      const currentTab = tabId
        ? await chrome.tabs.get(tabId)
        : (await chrome.tabs.query({ active: true, currentWindow: true }))[0];

      if (!currentTab.url.includes("linkedin.com/messaging")) {
        throw new Error("Not on a LinkedIn messaging page");
      }

      // Inject the response
      const results = await chrome.scripting.executeScript({
        target: { tabId: currentTab.id },
        func: (text) => {
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
          inputField.innerHTML = `<p>${text}</p>`;

          // Trigger input event to notify LinkedIn
          const inputEvent = new Event("input", { bubbles: true });
          inputField.dispatchEvent(inputEvent);

          return { success: true };
        },
        args: [messageText],
      });

      if (results && results[0] && results[0].result) {
        return results[0].result;
      }

      throw new Error("Failed to inject response");
    } catch (error) {
      console.error("Error injecting response:", error);
      throw error;
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

      // INJECT INTO INPUT FIELD
      // SECURITY NOTE: This injects into input field only
      // User MUST manually click LinkedIn's send button
      // This is same as copy-paste - standard browser behavior
      await this.injectResponse(aiResult.response, tab.id);

      // Return result with security reminder
      console.log(
        "⚠️ SECURITY: Response injected. YOU must manually click send in LinkedIn. No auto-send."
      );

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

