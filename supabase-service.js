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
      // Validate Supabase configuration
      if (!this.config || !this.config.url || !this.config.anonKey) {
        const errorMsg =
          "Supabase configuration missing. Please check your supabase-config.js file.";
        console.error("Supabase config error:", {
          hasConfig: !!this.config,
          hasUrl: !!this.config?.url,
          hasAnonKey: !!this.config?.anonKey,
        });
        if (window.uiConsoleLog) {
          window.uiConsoleLog("DB", "Config error", {
            error: errorMsg,
            hasConfig: !!this.config,
          });
        }
        throw new Error(errorMsg);
      }

      if (window.uiConsoleLog)
        window.uiConsoleLog("DB", "saveConversation", {
          threadId: conversationData.threadId,
          baseUrl: this.baseUrl,
          hasConfig: !!this.config,
        });
      console.log(
        "DB WRITE: saveConversation threadId=",
        conversationData.threadId
      );
      console.log(
        "Attempting to save conversation:",
        conversationData.threadId
      );
      console.log("Supabase baseUrl:", this.baseUrl);

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
        // Check if forceReplace is set - if so, replace all messages without merging
        const shouldReplaceAll = conversationData.forceReplace || false;

        let merged;
        if (shouldReplaceAll) {
          // Force replace: use new messages directly, no merging
          if (window.uiConsoleLog) {
            window.uiConsoleLog(
              "DB",
              "Force replace - replacing all messages",
              {
                threadId: conversationData.threadId,
                existingCount: existing.messages?.length || 0,
                newCount: newMsgs.length,
              }
            );
          }
          // Use newMsgs directly
          merged = newMsgs.map((m, i) => ({
            index: i,
            text: m.text || "",
            sender: m.sender || "prospect",
            attachments: Array.isArray(m.attachments) ? m.attachments : [],
            reactions: Array.isArray(m.reactions) ? m.reactions : [],
            mentions: Array.isArray(m.mentions) ? m.mentions : [],
            links: Array.isArray(m.links) ? m.links : [],
          }));
        } else {
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
          merged = combined.map((m, i) => ({
            index: i,
            text: m.text || "",
            sender: m.sender || "prospect",
            attachments: Array.isArray(m.attachments) ? m.attachments : [],
            reactions: Array.isArray(m.reactions) ? m.reactions : [],
            mentions: Array.isArray(m.mentions) ? m.mentions : [],
            links: Array.isArray(m.links) ? m.links : [],
          }));
        }

        // IMPORTANT: Always use placeholders from conversationData (extracted from message)
        // DO NOT merge with existing placeholders - they might be from profile data
        // This ensures we always use the exact values from the actual message
        const placeholdersToSave = conversationData.placeholders || {};

        const basePayload = {
          // Preserve URL - use new if provided, otherwise keep existing, otherwise null
          url:
            conversationData.url !== undefined
              ? conversationData.url
              : existing.url || null,
          // Preserve title - use new if provided and valid, otherwise keep existing
          title:
            conversationData.title !== undefined && conversationData.title
              ? conversationData.title
              : existing.title || null,
          // Preserve description - use new if provided, otherwise keep existing
          description:
            conversationData.description !== undefined
              ? conversationData.description
              : existing.description || null,
          messages: merged,
          message_count: merged.length,
          updated_at: new Date().toISOString(),
          // Preserve existing status if not explicitly provided
          status:
            conversationData.status !== undefined
              ? conversationData.status
              : existing.status || "unknown",
          // Preserve existing phase if not explicitly provided, default to 'building_rapport'
          phase:
            conversationData.phase !== undefined
              ? conversationData.phase
              : existing.phase || "building_rapport",
          // Store placeholders from message ONLY - overwrite any existing (don't merge)
          placeholders: placeholdersToSave,
        };

        // Log what's being saved (UPDATE)
        if (window.uiConsoleLog) {
          window.uiConsoleLog("DB", "Saving to Supabase (UPDATE)", {
            threadId: conversationData.threadId,
            title: basePayload.title,
            description: basePayload.description
              ? basePayload.description.substring(0, 100) + "..."
              : "none",
            messageCount: basePayload.message_count,
            existingMessageCount: existing.messages?.length || 0,
            newMessageCount: newMsgs.length,
            forceReplace: shouldReplaceAll,
            url: basePayload.url,
            status: basePayload.status,
            placeholders: basePayload.placeholders,
            messagesSample: merged.slice(0, 3).map((m) => ({
              index: m.index,
              sender: m.sender,
              textPreview: m.text?.substring(0, 50) + "...",
              attachmentsCount: m.attachments?.length || 0,
              reactionsCount: m.reactions?.length || 0,
              linksCount: m.links?.length || 0,
              mentionsCount: m.mentions?.length || 0,
            })),
            totalMessages: merged.length,
          });
        }

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
          console.error("Supabase error response (update):", {
            status: response.status,
            statusText: response.statusText,
            error: errorText,
            url: `${
              this.baseUrl
            }/conversations?thread_id=eq.${encodeURIComponent(
              conversationData.threadId
            )}`,
          });
          if (window.uiConsoleLog)
            window.uiConsoleLog("DB", "update error", {
              status: response.status,
              statusText: response.statusText,
              error: errorText,
              threadId: conversationData.threadId,
            });
          throw new Error(
            `Supabase update failed (${response.status}): ${errorText}`
          );
        }

        if (window.uiConsoleLog)
          window.uiConsoleLog("DB", "updated existing", {
            threadId: conversationData.threadId,
          });
        if (typeof window.showDbToast === "function")
          window.showDbToast("Database updated");
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
          status: conversationData.status || "unknown",
          // Default phase to 'building_rapport' for new conversations
          phase: conversationData.phase || "building_rapport",
          // Store placeholders as JSONB map - use only from conversationData (extracted from message)
          placeholders: conversationData.placeholders || {},
        };

        // Log what's being saved (INSERT)
        if (window.uiConsoleLog) {
          window.uiConsoleLog("DB", "Saving to Supabase (INSERT)", {
            threadId: insertPayload.thread_id,
            title: insertPayload.title,
            description: insertPayload.description
              ? insertPayload.description.substring(0, 100) + "..."
              : "none",
            messageCount: insertPayload.message_count,
            url: insertPayload.url,
            status: insertPayload.status,
            placeholders: insertPayload.placeholders,
            messagesSample: withIndex.slice(0, 3).map((m) => ({
              index: m.index,
              sender: m.sender,
              textPreview: m.text?.substring(0, 50) + "...",
              attachmentsCount: m.attachments?.length || 0,
              reactionsCount: m.reactions?.length || 0,
              linksCount: m.links?.length || 0,
              mentionsCount: m.mentions?.length || 0,
            })),
            totalMessages: withIndex.length,
          });
        }

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
          console.error("Supabase error response (insert):", {
            status: response.status,
            statusText: response.statusText,
            error: errorText,
            url: `${this.baseUrl}/conversations`,
          });
          if (window.uiConsoleLog)
            window.uiConsoleLog("DB", "insert error", {
              status: response.status,
              statusText: response.statusText,
              error: errorText,
              threadId: conversationData.threadId,
            });
          throw new Error(
            `Supabase insert failed (${response.status}): ${errorText}`
          );
        }

        if (window.uiConsoleLog)
          window.uiConsoleLog("DB", "inserted new", {
            threadId: conversationData.threadId,
          });
        if (typeof window.showDbToast === "function")
          window.showDbToast("Database updated");
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
        status:
          conversationData.status !== undefined
            ? conversationData.status
            : null,
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
      if (typeof window.showDbToast === "function")
        window.showDbToast("Database updated");
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
      console.log(
        "DB UPDATE: updateLeadStatus threadId=",
        threadId,
        "status=",
        status
      );

      const validStatuses = [
        "unknown",
        "uninterested",
        "interested",
        "enrolled",
        "ambassador",
        "graduated",
      ];
      if (!validStatuses.includes(status)) {
        throw new Error(
          `Invalid status: ${status}. Must be one of: ${validStatuses.join(
            ", "
          )}`
        );
      }

      const payload = {
        status: status,
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

      console.log("Lead status updated in Supabase:", threadId, status);
      if (window.uiConsoleLog)
        window.uiConsoleLog("DB", "updateLeadStatus ok", { threadId, status });
      if (typeof window.showDbToast === "function")
        window.showDbToast("Database updated");
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

