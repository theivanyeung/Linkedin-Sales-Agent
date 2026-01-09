// Follow-Up Service for LinkedIn Sales Agent
class FollowUpService {
  constructor() {
    this.config = window.supabaseConfig;
    if (!this.config || !this.config.url || !this.config.anonKey) {
      console.warn(
        "FollowUpService: Supabase configuration missing. Please check your supabase-config.js file."
      );
    }
    this.baseUrl = this.config ? `${this.config.url}/rest/v1` : null;
  }

  static FOLLOW_UP_SCRIPTS = {
    unknown:
      "Hey {name}, it's been a while, and I wanted to reach out again on that last message.",
    interested:
      "Hey {name}, it's been a while, and I wanted to reach out again on that last message.\nWe're finalizing applications and starting interviews.",
  };

  /**
   * Calculate the date range for the previous calendar week (Monday-Sunday)
   * @returns {Object} { start: ISO string, end: ISO string }
   */
  _getLastWeekRange() {
    const now = new Date();
    const currentDay = now.getDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
    const currentDate = now.getDate();

    // Calculate days to subtract to get to last Monday
    // If today is Monday (1), last week's Monday was 7 days ago
    // If today is Tuesday (2), last week's Monday was 8 days ago
    // If today is Sunday (0), last week's Monday was 6 days ago
    // Formula: (currentDay === 0 ? 6 : currentDay + 6) days back
    const daysToLastMonday = currentDay === 0 ? 6 : currentDay + 6;

    // Create last Monday at 00:00:00
    const lastMonday = new Date(now);
    lastMonday.setDate(currentDate - daysToLastMonday);
    lastMonday.setHours(0, 0, 0, 0);

    // Last Sunday at 23:59:59.999 (6 days after last Monday)
    const lastSunday = new Date(lastMonday);
    lastSunday.setDate(lastMonday.getDate() + 6);
    lastSunday.setHours(23, 59, 59, 999);

    return {
      start: lastMonday.toISOString(),
      end: lastSunday.toISOString(),
    };
  }

  /**
   * Filter conversations to only include those where the last message was sent by "you"
   * @param {Array} conversations - Array of conversation objects
   * @returns {Array} Filtered conversations
   */
  _filterByLastMessageFromYou(conversations) {
    if (!Array.isArray(conversations)) {
      return [];
    }

    return conversations.filter((convo) => {
      if (!convo.messages || !Array.isArray(convo.messages) || convo.messages.length === 0) {
        return false;
      }

      // Find the message with the highest index (last message)
      const lastMessage = convo.messages.reduce((latest, current) => {
        const latestIndex = latest?.index ?? -1;
        const currentIndex = current?.index ?? -1;
        return currentIndex > latestIndex ? current : latest;
      });

      // Check if last message sender is "you"
      return lastMessage && lastMessage.sender === "you";
    });
  }

  /**
   * Get the static script template for a given status
   * @param {string} status - Status value ("unknown" or "interested")
   * @returns {string} Script template
   */
  getScript(status) {
    return FollowUpService.FOLLOW_UP_SCRIPTS[status] || "";
  }

  /**
   * Format a script template by replacing placeholders with actual values
   * @param {string} status - Status value ("unknown" or "interested")
   * @param {Object} conversationData - Conversation object with placeholders or title
   * @returns {string} Formatted script
   */
  formatScript(status, conversationData) {
    const template = this.getScript(status);
    if (!template) {
      return "";
    }

    // Extract name from placeholders or title
    let name = "there";
    if (conversationData.placeholders && conversationData.placeholders.name) {
      name = conversationData.placeholders.name;
    } else if (conversationData.title) {
      // Try to extract name from title (e.g., "Lead: John Doe" -> "John Doe")
      const titleMatch = conversationData.title.match(/Lead:\s*(.+)/i);
      if (titleMatch && titleMatch[1]) {
        name = titleMatch[1].trim();
      } else {
        name = conversationData.title.trim();
      }
    }

    // Replace {name} placeholder
    return template.replace(/\{name\}/g, name);
  }

  /**
   * Get conversations with status "unknown" from last calendar week and earlier
   * where the last message was sent by "you"
   * @returns {Promise<Array>} Array of conversation objects
   */
  async getUnknownStatusConversations() {
    try {
      if (!this.baseUrl || !this.config?.anonKey) {
        console.error("FollowUpService: Supabase configuration missing");
        return [];
      }

      const { end } = this._getLastWeekRange();

      // Query Supabase for conversations with status "unknown" from last week and earlier
      // Only filter by end date (last Sunday of last week) to include everything before that
      const response = await fetch(
        `${this.baseUrl}/conversations?status=eq.unknown&updated_at=lte.${encodeURIComponent(end)}&order=updated_at.desc`,
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
        const errorText = await response.text();
        console.error("FollowUpService: Error fetching unknown conversations", {
          status: response.status,
          error: errorText,
        });
        return [];
      }

      const conversations = await response.json();
      
      // Filter to only include conversations where last message is from "you"
      return this._filterByLastMessageFromYou(conversations || []);
    } catch (error) {
      console.error("FollowUpService: Error in getUnknownStatusConversations", error);
      return [];
    }
  }

  /**
   * Get conversations with status "interested" from last calendar week and earlier
   * where the last message was sent by "you"
   * @returns {Promise<Array>} Array of conversation objects
   */
  async getInterestedStatusConversations() {
    try {
      if (!this.baseUrl || !this.config?.anonKey) {
        console.error("FollowUpService: Supabase configuration missing");
        return [];
      }

      const { end } = this._getLastWeekRange();

      // Query Supabase for conversations with status "interested" from last week and earlier
      // Only filter by end date (last Sunday of last week) to include everything before that
      const response = await fetch(
        `${this.baseUrl}/conversations?status=eq.interested&updated_at=lte.${encodeURIComponent(end)}&order=updated_at.desc`,
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
        const errorText = await response.text();
        console.error("FollowUpService: Error fetching interested conversations", {
          status: response.status,
          error: errorText,
        });
        return [];
      }

      const conversations = await response.json();
      
      // Filter to only include conversations where last message is from "you"
      return this._filterByLastMessageFromYou(conversations || []);
    } catch (error) {
      console.error("FollowUpService: Error in getInterestedStatusConversations", error);
      return [];
    }
  }
}

// Export for use
if (typeof module !== "undefined" && module.exports) {
  module.exports = FollowUpService;
} else {
  window.FollowUpService = FollowUpService;
}
