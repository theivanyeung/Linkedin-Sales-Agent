// LinkedIn Message Extractor Content Script
class LinkedInMessageExtractor {
  constructor() {
    this.currentThreadId = null;
    this.isExtracting = false;
    this.init();
  }

  init() {
    // Extract current thread ID from URL
    this.currentThreadId = this.extractThreadIdFromUrl();
    
    // Set up URL change detection
    this.setupUrlChangeDetection();
    
    // Initial extraction if on a valid thread page
    if (this.currentThreadId) {
      this.extractMessages();
    }
    
    console.log('LinkedIn Message Extractor initialized');
  }

  extractThreadIdFromUrl() {
    const url = window.location.href;
    const match = url.match(/\/messaging\/thread\/([^\/\?]+)/);
    return match ? match[1] : null;
  }

  setupUrlChangeDetection() {
    // Listen for URL changes (LinkedIn uses pushState)
    let lastUrl = window.location.href;
    
    // Override pushState to detect navigation
    const originalPushState = history.pushState;
    history.pushState = function(...args) {
      originalPushState.apply(history, args);
      setTimeout(() => {
        if (window.location.href !== lastUrl) {
          lastUrl = window.location.href;
          this.handleUrlChange();
        }
      }.bind(this), 100);
    }.bind(this);

    // Also listen for popstate events
    window.addEventListener('popstate', () => {
      setTimeout(() => {
        if (window.location.href !== lastUrl) {
          lastUrl = window.location.href;
          this.handleUrlChange();
        }
      }, 100);
    });

    // Fallback: check URL periodically
    setInterval(() => {
      if (window.location.href !== lastUrl) {
        lastUrl = window.location.href;
        this.handleUrlChange();
      }
    }, 1000);
  }

  handleUrlChange() {
    const newThreadId = this.extractThreadIdFromUrl();
    
    if (newThreadId && newThreadId !== this.currentThreadId) {
      console.log('Thread changed:', this.currentThreadId, '->', newThreadId);
      this.currentThreadId = newThreadId;
      
      // Wait for page to load, then extract
      setTimeout(() => {
        this.extractMessages();
      }, 500);
    }
  }

  extractMessages() {
    if (this.isExtracting) return;
    
    this.isExtracting = true;
    console.log('Extracting messages for thread:', this.currentThreadId);

    try {
      // Wait for messages to load
      setTimeout(() => {
        const messages = this.getMessagesFromDOM();
        
        if (messages.length > 0) {
          const conversationData = {
            threadId: this.currentThreadId,
            timestamp: new Date().toISOString(),
            url: window.location.href,
            messages: messages
          };
          
          // Copy to clipboard
          this.copyToClipboard(conversationData);
          
          // Notify popup if open
          this.notifyPopup(conversationData);
          
          console.log('Extracted', messages.length, 'messages');
        } else {
          console.log('No messages found');
        }
        
        this.isExtracting = false;
      }, 1000);
      
    } catch (error) {
      console.error('Error extracting messages:', error);
      this.isExtracting = false;
    }
  }

  getMessagesFromDOM() {
    const messages = [];
    
    // Try multiple selectors for LinkedIn message elements
    const messageSelectors = [
      '.msg-s-event-list__msg',
      '.msg-s-message-list__event',
      '.message-item',
      '[data-test-id="message-item"]',
      '.conversation-item'
    ];
    
    let messageElements = [];
    for (const selector of messageSelectors) {
      messageElements = document.querySelectorAll(selector);
      if (messageElements.length > 0) {
        console.log(`Found messages using selector: ${selector}`);
        break;
      }
    }
    
    if (messageElements.length === 0) {
      // Fallback: look for any elements that might contain messages
      const allElements = document.querySelectorAll('*');
      for (const element of allElements) {
        if (element.textContent && element.textContent.length > 10 && 
            element.textContent.length < 1000 && 
            !element.querySelector('img, video, svg')) {
          messageElements.push(element);
        }
      }
    }
    
    messageElements.forEach((element, index) => {
      try {
        const message = this.parseMessageElement(element, index);
        if (message && message.text.trim()) {
          messages.push(message);
        }
      } catch (error) {
        console.warn('Error parsing message element:', error);
      }
    });
    
    return messages;
  }

  parseMessageElement(element, index) {
    const text = element.textContent || element.innerText || '';
    
    // Try to determine if it's from you or them
    const isFromYou = this.isMessageFromYou(element);
    
    // Try to extract timestamp
    const timestamp = this.extractTimestamp(element);
    
    return {
      index: index,
      text: text.trim(),
      isFromYou: isFromYou,
      timestamp: timestamp,
      element: {
        tagName: element.tagName,
        className: element.className,
        id: element.id
      }
    };
  }

  isMessageFromYou(element) {
    // Look for indicators that this message is from you
    const fromYouIndicators = [
      'msg-s-message-list__event--sent',
      'message-sent',
      'your-message',
      'outgoing'
    ];
    
    const className = element.className || '';
    return fromYouIndicators.some(indicator => className.includes(indicator));
  }

  extractTimestamp(element) {
    // Look for timestamp elements
    const timestampSelectors = [
      '.msg-s-message-list__time',
      '.timestamp',
      '.message-time',
      '[data-test-id="timestamp"]'
    ];
    
    for (const selector of timestampSelectors) {
      const timestampEl = element.querySelector(selector);
      if (timestampEl) {
        return timestampEl.textContent.trim();
      }
    }
    
    return null;
  }

  async copyToClipboard(data) {
    try {
      const jsonString = JSON.stringify(data, null, 2);
      await navigator.clipboard.writeText(jsonString);
      console.log('Conversation data copied to clipboard');
    } catch (error) {
      console.error('Failed to copy to clipboard:', error);
    }
  }

  notifyPopup(data) {
    // Send message to popup if it's open
    chrome.runtime.sendMessage({
      type: 'MESSAGES_EXTRACTED',
      data: data
    }).catch(() => {
      // Popup might not be open, that's okay
    });
  }

  // Manual extraction method for popup
  manualExtract() {
    this.extractMessages();
  }
}

// Initialize the extractor
const extractor = new LinkedInMessageExtractor();

// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'EXTRACT_MESSAGES') {
    extractor.manualExtract();
    sendResponse({ success: true });
  }
});
