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
      if (window.uiConsoleLog)
        window.uiConsoleLog("DB", "saveConversation", {
          threadId: conversationData.threadId,
        });
      console.log(
        "DB WRITE: saveConversation threadId=",
        conversationData.threadId
      );
      console.log(
        "Attempting to save conversation:",
        conversationData.threadId
      );

      // Build payload for insert/update, EXACT schema per requirement
      const normalizeMessage = (m) => ({
        index:
          typeof m.index === "number"
            ? m.index
            : typeof m.localIndex === "number"
            ? m.localIndex
            : null,
        text: m.text || "",
        sender: m.sender || (m.isFromYou ? "you" : "prospect"),
        attachments: Array.isArray(m.attachments) ? m.attachments : [],
        reactions: Array.isArray(m.reactions) ? m.reactions : [],
        mentions: Array.isArray(m.mentions) ? m.mentions : [],
        links: Array.isArray(m.links) ? m.links : [],
      });

      const newMsgs = (conversationData.messages || []).map(normalizeMessage);

      // Check if conversation exists
      const existing = await this.getConversation(conversationData.threadId);
      if (existing) {
        // Merge messages using signature without domId/senderName/timestamps
        const existingMsgs = Array.isArray(existing.messages)
          ? existing.messages.map(normalizeMessage)
          : [];
        const sigToMsg = new Map();
        const buildSig = (m) => `${m.sender}|${m.text}`;
        for (const m of existingMsgs) sigToMsg.set(buildSig(m), m);
        for (const m of newMsgs) {
          const sig = buildSig(m);
          if (!sigToMsg.has(sig)) sigToMsg.set(sig, m);
        }
        let merged = Array.from(sigToMsg.values());
        // Assign sequential index and strip to exact keys
        merged = merged.map((m, i) => ({
          index: i,
          text: m.text,
          sender: m.sender,
          attachments: m.attachments || [],
          reactions: m.reactions || [],
          mentions: m.mentions || [],
          links: m.links || [],
        }));

        const basePayload = {
          url: conversationData.url || null,
          title: conversationData.title || null,
          description: conversationData.description || null,
          messages: merged,
          message_count: merged.length,
          updated_at: new Date().toISOString(),
        };

        const response = await fetch(
          `${this.baseUrl}/conversations?thread_id=eq.${encodeURIComponent(
            conversationData.threadId
          )}`,
          {
            method: "PATCH",
            headers: {
              apikey: this.config.anonKey,
              Authorization: `Bearer ${this.config.anonKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(basePayload),
          }
        );

        if (!response.ok) {
          const errorText = await response.text();
          console.error("Supabase error response (update):", errorText);
          if (window.uiConsoleLog)
            window.uiConsoleLog("DB", "update error", {
              status: response.status,
              error: errorText,
            });
          throw new Error(`Supabase error: ${response.status} - ${errorText}`);
        }

        if (window.uiConsoleLog)
          window.uiConsoleLog("DB", "updated existing", {
            threadId: conversationData.threadId,
          });
        return conversationData.threadId;
      } else {
        // Insert new
        const withIndex = newMsgs.map((m, i) => ({
          index: i,
          text: m.text,
          sender: m.sender,
          attachments: m.attachments || [],
          reactions: m.reactions || [],
          mentions: m.mentions || [],
          links: m.links || [],
        }));
        const insertPayload = {
          thread_id: conversationData.threadId,
          created_at: new Date().toISOString(),
          url: conversationData.url || null,
          title: conversationData.title || null,
          description: conversationData.description || null,
          messages: withIndex,
          message_count: withIndex.length,
          updated_at: new Date().toISOString(),
        };

        const response = await fetch(`${this.baseUrl}/conversations`, {
          method: "POST",
          headers: {
            apikey: this.config.anonKey,
            Authorization: `Bearer ${this.config.anonKey}`,
            "Content-Type": "application/json",
            Prefer: "return=representation",
          },
          body: JSON.stringify(insertPayload),
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error("Supabase error response (insert):", errorText);
          if (window.uiConsoleLog)
            window.uiConsoleLog("DB", "insert error", {
              status: response.status,
              error: errorText,
            });
          throw new Error(`Supabase error: ${response.status} - ${errorText}`);
        }

        if (window.uiConsoleLog)
          window.uiConsoleLog("DB", "inserted new", {
            threadId: conversationData.threadId,
          });
        return conversationData.threadId;
      }
    } catch (error) {
      console.error("Error saving to Supabase:", error);
      if (window.uiConsoleLog)
        window.uiConsoleLog("DB", "saveConversation exception", {
          error: String(error),
        });
      throw error;
    }
  }

  async getConversation(threadId) {
    try {
      if (window.uiConsoleLog)
        window.uiConsoleLog("DB", "getConversation", { threadId });
      console.log("DB READ: getConversation threadId=", threadId);
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
      if (window.uiConsoleLog)
        window.uiConsoleLog("DB", "getConversation ok", {
          found: result.length,
        });
      return result.length > 0 ? result[0] : null;
    } catch (error) {
      console.error("Error fetching from Supabase:", error);
      if (window.uiConsoleLog)
        window.uiConsoleLog("DB", "getConversation exception", {
          error: String(error),
        });
      throw error;
    }
  }

  async getAllConversations(limit = 50) {
    try {
      if (window.uiConsoleLog)
        window.uiConsoleLog("DB", "getAllConversations", { limit });
      console.log("DB READ: getAllConversations limit=", limit);
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
      if (window.uiConsoleLog)
        window.uiConsoleLog("DB", "getAllConversations ok", {
          count: result.length,
        });
      return result;
    } catch (error) {
      console.error("Error fetching conversations from Supabase:", error);
      if (window.uiConsoleLog)
        window.uiConsoleLog("DB", "getAllConversations exception", {
          error: String(error),
        });
      throw error;
    }
  }

  async updateConversation(threadId, conversationData) {
    try {
      if (window.uiConsoleLog)
        window.uiConsoleLog("DB", "updateConversation", { threadId });
      console.log("DB UPDATE: updateConversation threadId=", threadId);
      const payload = {
        title: conversationData.title || null,
        description: conversationData.description || null,
        messages: conversationData.messages || [],
        message_count: (conversationData.messages || []).length,
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

      console.log("Conversation updated in Supabase:", threadId);
      if (window.uiConsoleLog)
        window.uiConsoleLog("DB", "updateConversation ok", { threadId });
      return threadId;
    } catch (error) {
      console.error("Error updating Supabase:", error);
      if (window.uiConsoleLog)
        window.uiConsoleLog("DB", "updateConversation exception", {
          error: String(error),
        });
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

