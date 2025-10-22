// LinkedIn Message Extractor Popup Script
class PopupController {
  constructor() {
    this.isActive = false;
    this.lastExtraction = null;
    this.init();
  }

  init() {
    this.setupEventListeners();
    this.checkPageStatus();
    this.loadLastExtraction();
  }

  setupEventListeners() {
    document.getElementById("extractBtn").addEventListener("click", () => {
      this.extractMessages();
    });

    document.getElementById("viewDataBtn").addEventListener("click", () => {
      this.viewLastExtraction();
    });

    // Listen for messages from content script
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      if (request.type === "MESSAGES_EXTRACTED") {
        this.handleMessagesExtracted(request.data);
      }
    });
  }

  async checkPageStatus() {
    try {
      const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });

      if (tab.url && tab.url.includes("linkedin.com/messaging/thread/")) {
        this.setStatus(true, "Active", "On LinkedIn conversation page");
        document.getElementById("extractBtn").disabled = false;
      } else {
        this.setStatus(
          false,
          "Inactive",
          "Navigate to a LinkedIn conversation"
        );
        document.getElementById("extractBtn").disabled = true;
      }
    } catch (error) {
      console.error("Error checking page status:", error);
      this.setStatus(false, "Error", "Unable to check page status");
    }
  }

  setStatus(isActive, text, details) {
    this.isActive = isActive;

    const statusDot = document.getElementById("statusDot");
    const statusText = document.getElementById("statusText");
    const statusDetails = document.getElementById("statusDetails");

    statusDot.className = `status-dot ${isActive ? "active" : "inactive"}`;
    statusText.textContent = text;
    statusDetails.textContent = details;
  }

  async extractMessages() {
    const extractBtn = document.getElementById("extractBtn");
    const originalText = extractBtn.textContent;

    extractBtn.disabled = true;
    extractBtn.textContent = "Extracting...";

    try {
      const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });

      await chrome.tabs.sendMessage(tab.id, { type: "EXTRACT_MESSAGES" });

      // Wait a moment for extraction to complete
      setTimeout(() => {
        extractBtn.textContent = "Extracted!";
        setTimeout(() => {
          extractBtn.textContent = originalText;
          extractBtn.disabled = false;
        }, 1000);
      }, 1500);
    } catch (error) {
      console.error("Error extracting messages:", error);
      extractBtn.textContent = "Error";
      setTimeout(() => {
        extractBtn.textContent = originalText;
        extractBtn.disabled = false;
      }, 1000);
    }
  }

  handleMessagesExtracted(data) {
    this.lastExtraction = data;
    this.saveLastExtraction();
    this.updateLastExtractionDisplay();

    // Show success message
    const statusDetails = document.getElementById("statusDetails");
    statusDetails.textContent = `Extracted ${data.messages.length} messages`;

    setTimeout(() => {
      if (this.isActive) {
        statusDetails.textContent = "On LinkedIn conversation page";
      }
    }, 3000);
  }

  updateLastExtractionDisplay() {
    if (this.lastExtraction) {
      const lastExtractionDiv = document.getElementById("lastExtraction");
      const lastTime = document.getElementById("lastTime");
      const messageCount = document.getElementById("messageCount");

      const time = new Date(this.lastExtraction.timestamp).toLocaleTimeString();
      lastTime.textContent = time;
      messageCount.textContent = this.lastExtraction.messages.length;

      lastExtractionDiv.style.display = "block";
      document.getElementById("viewDataBtn").disabled = false;
    }
  }

  viewLastExtraction() {
    if (this.lastExtraction) {
      // Open a new tab with the extracted data
      const dataString = JSON.stringify(this.lastExtraction, null, 2);
      const blob = new Blob([dataString], { type: "application/json" });
      const url = URL.createObjectURL(blob);

      chrome.tabs.create({ url: url });
    }
  }

  saveLastExtraction() {
    if (this.lastExtraction) {
      chrome.storage.local.set({
        lastExtraction: this.lastExtraction,
        lastExtractionTime: Date.now(),
      });
    }
  }

  async loadLastExtraction() {
    try {
      const result = await chrome.storage.local.get([
        "lastExtraction",
        "lastExtractionTime",
      ]);

      if (result.lastExtraction && result.lastExtractionTime) {
        // Only show if extraction was within last 24 hours
        const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
        if (result.lastExtractionTime > dayAgo) {
          this.lastExtraction = result.lastExtraction;
          this.updateLastExtractionDisplay();
        }
      }
    } catch (error) {
      console.error("Error loading last extraction:", error);
    }
  }
}

// Initialize popup when DOM is loaded
document.addEventListener("DOMContentLoaded", () => {
  new PopupController();
});
