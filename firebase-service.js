// Firebase Service for LinkedIn Sales Agent
class FirebaseService {
  constructor() {
    this.db = null;
    this.initialized = false;
  }

  async initialize() {
    if (this.initialized) return;

    try {
      // Import Firebase modules
      const { initializeApp } = await import(
        "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js"
      );
      const { getDatabase, ref, push, set, get, query, orderByChild, equalTo } =
        await import(
          "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js"
        );

      // Initialize Firebase
      const app = initializeApp(window.firebaseConfig);
      this.db = getDatabase(app);
      this.initialized = true;

      console.log("Firebase initialized successfully");
    } catch (error) {
      console.error("Firebase initialization failed:", error);
      throw error;
    }
  }

  async saveConversation(conversationData) {
    if (!this.initialized) {
      await this.initialize();
    }

    try {
      const threadId = conversationData.threadId;
      const threadRef = ref(this.db, `threads/${threadId}`);

      // Get existing thread data
      const snapshot = await get(threadRef);
      let existingThread = snapshot.exists() ? snapshot.val() : null;

      if (existingThread) {
        // Update existing thread with new messages
        const updatedThread = this.mergeConversationData(
          existingThread,
          conversationData
        );
        await set(threadRef, updatedThread);
        console.log("Thread updated in Firebase:", threadId);
        return threadId;
      } else {
        // Create new thread
        const newThread = {
          ...conversationData,
          createdAt: new Date().toISOString(),
          lastUpdated: new Date().toISOString(),
          messageCount: conversationData.messages.length,
        };

        await set(threadRef, newThread);
        console.log("New thread created in Firebase:", threadId);
        return threadId;
      }
    } catch (error) {
      console.error("Error saving conversation:", error);
      throw error;
    }
  }

  mergeConversationData(existingThread, newData) {
    // Create a map of existing messages by their unique identifiers
    const existingMessages = new Map();
    existingThread.messages.forEach((msg) => {
      // Use timestamp + sender + first 50 chars of text as unique identifier
      const uniqueId = this.getMessageUniqueId(msg);
      existingMessages.set(uniqueId, msg);
    });

    // Add new messages, avoiding duplicates
    const allMessages = [...existingThread.messages];
    newData.messages.forEach((newMsg) => {
      const uniqueId = this.getMessageUniqueId(newMsg);
      if (!existingMessages.has(uniqueId)) {
        allMessages.push(newMsg);
        existingMessages.set(uniqueId, newMsg);
      }
    });

    // Sort messages by timestamp to maintain chronological order
    allMessages.sort((a, b) => {
      const timeA = new Date(a.timestamp || a.extractedAt).getTime();
      const timeB = new Date(b.timestamp || b.extractedAt).getTime();
      return timeA - timeB;
    });

    // Re-index messages based on chronological order
    allMessages.forEach((msg, index) => {
      msg.globalIndex = index;
    });

    return {
      ...existingThread,
      ...newData,
      messages: allMessages,
      lastUpdated: new Date().toISOString(),
      messageCount: allMessages.length,
    };
  }

  getMessageUniqueId(message) {
    // Create a unique identifier for each message
    const timestamp = message.timestamp || message.extractedAt || "";
    const sender = message.sender || message.isFromYou ? "you" : "prospect";
    const textPreview = (message.text || "").substring(0, 50);
    return `${timestamp}-${sender}-${textPreview}`;
  }

  async getConversations(limit = 50) {
    if (!this.initialized) {
      await this.initialize();
    }

    try {
      const threadsRef = ref(this.db, "threads");
      const snapshot = await get(
        query(threadsRef, orderByChild("lastUpdated"))
      );

      if (snapshot.exists()) {
        const conversations = [];
        snapshot.forEach((childSnapshot) => {
          conversations.push({
            threadId: childSnapshot.key,
            ...childSnapshot.val(),
          });
        });

        // Return most recent conversations first
        return conversations.reverse().slice(0, limit);
      }

      return [];
    } catch (error) {
      console.error("Error fetching conversations:", error);
      throw error;
    }
  }

  async getConversationByThreadId(threadId) {
    if (!this.initialized) {
      await this.initialize();
    }

    try {
      const threadRef = ref(this.db, `threads/${threadId}`);
      const snapshot = await get(threadRef);

      if (snapshot.exists()) {
        return {
          threadId: threadId,
          ...snapshot.val(),
        };
      }

      return null;
    } catch (error) {
      console.error("Error fetching conversation:", error);
      throw error;
    }
  }

  async searchConversations(searchTerm) {
    if (!this.initialized) {
      await this.initialize();
    }

    try {
      const conversationsRef = ref(this.db, "conversations");
      const snapshot = await get(conversationsRef);

      if (snapshot.exists()) {
        const conversations = [];
        snapshot.forEach((childSnapshot) => {
          const conversation = childSnapshot.val();

          // Search in prospect name and message content
          const searchableText = [
            conversation.prospectName,
            ...conversation.messages.map((msg) => msg.text),
          ]
            .join(" ")
            .toLowerCase();

          if (searchableText.includes(searchTerm.toLowerCase())) {
            conversations.push({
              id: childSnapshot.key,
              ...conversation,
            });
          }
        });

        return conversations;
      }

      return [];
    } catch (error) {
      console.error("Error searching conversations:", error);
      throw error;
    }
  }
}

// Export for use
if (typeof module !== "undefined" && module.exports) {
  module.exports = FirebaseService;
} else {
  window.FirebaseService = FirebaseService;
}
