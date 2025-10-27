// Supabase Service for LinkedIn Sales Agent
class SupabaseService {
  constructor() {
    this.config = window.supabaseConfig;
    this.baseUrl = `${this.config.url}/rest/v1`;
  }

  async testConnection() {
    try {
      console.log("Testing Supabase connection...");
      console.log("Base URL:", this.baseUrl);
      console.log("Config:", this.config);

      const response = await fetch(`${this.baseUrl}/conversations?limit=1`, {
        method: "GET",
        headers: {
          apikey: this.config.anonKey,
          Authorization: `Bearer ${this.config.anonKey}`,
          "Content-Type": "application/json",
        },
      });

      console.log("Test response status:", response.status);

      if (response.ok) {
        console.log("Supabase connection successful!");
        return true;
      } else {
        const errorText = await response.text();
        console.error("Supabase connection failed:", errorText);
        return false;
      }
    } catch (error) {
      console.error("Supabase connection test error:", error);
      return false;
    }
  }

  async saveConversation(conversationData) {
    try {
      console.log(
        "Attempting to save/update conversation:",
        conversationData.threadId
      );

      // Clean messages by removing any extractedAt fields
      const cleanedMessages = conversationData.messages.map((msg) => {
        const { extractedAt, ...cleanMsg } = msg;
        return cleanMsg;
      });

      // Check if conversation already exists
      const existingConversation = await this.getConversation(
        conversationData.threadId
      );

      if (existingConversation) {
        console.log(
          "Conversation exists, updating:",
          conversationData.threadId
        );
        // Update existing conversation
        return await this.updateConversation(
          conversationData.threadId,
          conversationData
        );
      } else {
        console.log("New conversation, creating:", conversationData.threadId);
        // Create new conversation
        const payload = {
          thread_id: conversationData.threadId,
          url: conversationData.url,
          title: conversationData.prospectName || "Unknown",
          messages: cleanedMessages,
          message_count: cleanedMessages.length,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };

        console.log("Payload:", payload);

        const response = await fetch(`${this.baseUrl}/conversations`, {
          method: "POST",
          headers: {
            apikey: this.config.anonKey,
            Authorization: `Bearer ${this.config.anonKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        });

        console.log("Response status:", response.status);

        if (!response.ok) {
          const errorText = await response.text();
          console.error("Supabase error response:", errorText);
          throw new Error(`Supabase error: ${response.status} - ${errorText}`);
        }

        console.log(
          "Conversation created in Supabase:",
          conversationData.threadId
        );
        return conversationData.threadId;
      }
    } catch (error) {
      console.error("Error saving to Supabase:", error);
      throw error;
    }
  }

  async getConversation(threadId) {
    try {
      const response = await fetch(
        `${this.baseUrl}/conversations?thread_id=eq.${encodeURIComponent(
          threadId
        )}`,
        {
          method: "GET",
          headers: {
            apikey: this.config.anonKey,
            Authorization: `Bearer ${this.config.anonKey}`,
            "Content-Type": "application/json",
          },
        }
      );

      if (!response.ok) {
        throw new Error(`Supabase error: ${response.status}`);
      }

      const result = await response.json();
      return result.length > 0 ? result[0] : null;
    } catch (error) {
      console.error("Error fetching from Supabase:", error);
      throw error;
    }
  }

  async getAllConversations(limit = 50) {
    try {
      const response = await fetch(
        `${this.baseUrl}/conversations?order=updated_at.desc&limit=${limit}`,
        {
          method: "GET",
          headers: {
            apikey: this.config.anonKey,
            Authorization: `Bearer ${this.config.anonKey}`,
            "Content-Type": "application/json",
          },
        }
      );

      if (!response.ok) {
        throw new Error(`Supabase error: ${response.status}`);
      }

      const result = await response.json();
      return result;
    } catch (error) {
      console.error("Error fetching conversations from Supabase:", error);
      throw error;
    }
  }

  async updateConversation(threadId, conversationData) {
    try {
      // Clean new messages by removing any extractedAt fields
      const cleanedNewMessages = conversationData.messages.map((msg) => {
        const { extractedAt, ...cleanMsg } = msg;
        return cleanMsg;
      });

      // Get existing conversation from database
      const existingConversation = await this.getConversation(threadId);

      let mergedMessages = cleanedNewMessages;

      if (existingConversation && existingConversation.messages) {
        console.log(
          `Merging messages: ${cleanedNewMessages.length} new + ${existingConversation.messages.length} existing`
        );

        // Create content-based signature for message matching
        const getMessageSignature = (msg) => {
          const text = (msg.text || "").trim().substring(0, 200);
          const sender = msg.isFromYou ? "you" : msg.sender || "prospect";
          return `${sender}:${text}`;
        };

        // Merge existing messages with new messages using content-based deduplication
        const messageMap = new Map();

        // Add ALL existing messages from Supabase first (preserves history)
        existingConversation.messages.forEach((msg) => {
          const signature = getMessageSignature(msg);
          messageMap.set(signature, msg);
        });

        // Add new messages from DOM (overwrites duplicates, adds new)
        cleanedNewMessages.forEach((msg) => {
          const signature = getMessageSignature(msg);
          messageMap.set(signature, msg);
        });

        // Convert map back to array
        mergedMessages = Array.from(messageMap.values());

        console.log(`Merged result: ${mergedMessages.length} unique messages`);
      }

      const payload = {
        messages: mergedMessages,
        message_count: mergedMessages.length,
        updated_at: new Date().toISOString(),
      };

      const response = await fetch(
        `${this.baseUrl}/conversations?thread_id=eq.${encodeURIComponent(
          threadId
        )}`,
        {
          method: "PATCH",
          headers: {
            apikey: this.config.anonKey,
            Authorization: `Bearer ${this.config.anonKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Supabase error: ${response.status} - ${errorText}`);
      }

      console.log(
        `Conversation updated in Supabase: ${threadId} (${mergedMessages.length} messages total)`
      );
      return threadId;
    } catch (error) {
      console.error("Error updating Supabase:", error);
      throw error;
    }
  }
}

// Export for use
if (typeof module !== "undefined" && module.exports) {
  module.exports = SupabaseService;
} else {
  window.SupabaseService = SupabaseService;
}

