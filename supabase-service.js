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
        // Smarter merge to preserve chronology across partial loads
        const existingMsgs = Array.isArray(existing.messages)
          ? existing.messages.map(normalizeMessage)
          : [];

        const buildSig = (m) => `${m.sender}|${m.text}`;
        const newBySig = new Map();
        const oldBySig = new Map();

        // Positions within their respective arrays
        const newOrder = [];
        newMsgs
          .slice()
          .sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
          .forEach((m, i) => {
            const sig = buildSig(m);
            if (!newBySig.has(sig)) {
              newBySig.set(sig, { msg: m, pos: i });
              newOrder.push(sig);
            }
          });

        const oldOrder = [];
        existingMsgs
          .slice()
          .sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
          .forEach((m, i) => {
            const sig = buildSig(m);
            if (!oldBySig.has(sig)) {
              oldBySig.set(sig, { msg: m, pos: i });
              oldOrder.push(sig);
            }
          });

        // Identify overlap and only-in-old
        const overlap = new Set(newOrder.filter((sig) => oldBySig.has(sig)));
        const onlyOld = oldOrder.filter((sig) => !newBySig.has(sig));

        let combined = [];
        if (overlap.size > 0) {
          // Compute min/max old positions of overlap to split old-only into older/newer buckets
          let minOldOverlap = Infinity;
          let maxOldOverlap = -Infinity;
          overlap.forEach((sig) => {
            const p = oldBySig.get(sig)?.pos ?? 0;
            if (p < minOldOverlap) minOldOverlap = p;
            if (p > maxOldOverlap) maxOldOverlap = p;
          });

          const olderOnly = onlyOld
            .filter((sig) => (oldBySig.get(sig)?.pos ?? 0) < minOldOverlap)
            .sort(
              (a, b) =>
                (oldBySig.get(a)?.pos ?? 0) - (oldBySig.get(b)?.pos ?? 0)
            )
            .map((sig) => oldBySig.get(sig).msg);

          const newerOnly = onlyOld
            .filter((sig) => (oldBySig.get(sig)?.pos ?? 0) > maxOldOverlap)
            .sort(
              (a, b) =>
                (oldBySig.get(a)?.pos ?? 0) - (oldBySig.get(b)?.pos ?? 0)
            )
            .map((sig) => oldBySig.get(sig).msg);

          const coreNew = newOrder
            .map((sig) => newBySig.get(sig)?.msg)
            .filter(Boolean);

          combined = [...olderOnly, ...coreNew, ...newerOnly];
        } else {
          // No overlap: keep existing in place, append latest extraction at the end
          const coreNew = newOrder
            .map((sig) => newBySig.get(sig)?.msg)
            .filter(Boolean);
          const restOld = onlyOld
            .sort(
              (a, b) =>
                (oldBySig.get(a)?.pos ?? 0) - (oldBySig.get(b)?.pos ?? 0)
            )
            .map((sig) => oldBySig.get(sig).msg);
          combined = [...restOld, ...coreNew];
        }

        // Reindex and strictly map to minimal schema
        const merged = combined.map((m, i) => ({
          index: i,
          text: m.text || "",
          sender: m.sender || "prospect",
          attachments: Array.isArray(m.attachments) ? m.attachments : [],
          reactions: Array.isArray(m.reactions) ? m.reactions : [],
          mentions: Array.isArray(m.mentions) ? m.mentions : [],
          links: Array.isArray(m.links) ? m.links : [],
        }));

        // IMPORTANT: Always use placeholders from conversationData (extracted from message)
        // DO NOT merge with existing placeholders - they might be from profile data
        // This ensures we always use the exact values from the actual message
        const placeholdersToSave = conversationData.placeholders || {};
        
        const basePayload = {
          // Preserve URL - use new if provided, otherwise keep existing, otherwise null
          url: conversationData.url !== undefined ? conversationData.url : (existing.url || null),
          // Preserve title - use new if provided and valid, otherwise keep existing
          title: conversationData.title !== undefined && conversationData.title ? conversationData.title : (existing.title || null),
          // Preserve description - use new if provided, otherwise keep existing
          description: conversationData.description !== undefined ? conversationData.description : (existing.description || null),
          messages: merged,
          message_count: merged.length,
          updated_at: new Date().toISOString(),
          // Preserve existing status if not explicitly provided
          status: conversationData.status !== undefined ? conversationData.status : existing.status || 'unknown',
          // Store placeholders from message ONLY - overwrite any existing (don't merge)
          placeholders: placeholdersToSave,
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
          status: conversationData.status || 'unknown',
          // Store placeholders as JSONB map - use only from conversationData (extracted from message)
          placeholders: conversationData.placeholders || {},
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
        status: conversationData.status !== undefined ? conversationData.status : null,
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

  async updateLeadStatus(threadId, status) {
    /** Update the lead status for a conversation. */
    try {
      if (window.uiConsoleLog)
        window.uiConsoleLog("DB", "updateLeadStatus", { threadId, status });
      console.log("DB UPDATE: updateLeadStatus threadId=", threadId, "status=", status);

      const validStatuses = ['unknown', 'uninterested', 'interested', 'enrolled', 'ambassador'];
      if (!validStatuses.includes(status)) {
        throw new Error(`Invalid status: ${status}. Must be one of: ${validStatuses.join(', ')}`);
      }

      const payload = {
        status: status,
        updated_at: new Date().toISOString(),
      };

      const response = await fetch(
        `${this.baseUrl}/conversations?thread_id=eq.${encodeURIComponent(threadId)}`,
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

      console.log("Lead status updated in Supabase:", threadId, status);
      if (window.uiConsoleLog)
        window.uiConsoleLog("DB", "updateLeadStatus ok", { threadId, status });
      return threadId;
    } catch (error) {
      console.error("Error updating lead status:", error);
      if (window.uiConsoleLog)
        window.uiConsoleLog("DB", "updateLeadStatus exception", {
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

