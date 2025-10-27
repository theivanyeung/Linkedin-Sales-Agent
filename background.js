// Background script for LinkedIn Sales Agent
chrome.action.onClicked.addListener(async (tab) => {
  // Check if we're on LinkedIn
  if (!tab.url.includes("linkedin.com")) {
    chrome.notifications.create({
      type: "basic",
      iconUrl: "icon16.png",
      title: "LinkedIn Sales Agent",
      message: "Please navigate to LinkedIn first",
    });
    return;
  }

  // Open the persistent panel
  chrome.sidePanel.open({ tabId: tab.id });
});

// Set up the side panel
chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
});

