const socialMediaDomains = [
  'facebook.com',
  'twitter.com',
  'instagram.com',
  'linkedin.com',
  'youtube.com',
  'tiktok.com',
  'reddit.com',
  'snapchat.com',
  'pinterest.com',
  'whatsapp.com',
  'telegram.org',
  'discord.com'
];

function isSocialMediaSite(url) {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    return socialMediaDomains.some(domain => hostname.includes(domain));
  } catch (e) {
    return false;
  }
}

function getDomainFromUrl(url) {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    return socialMediaDomains.find(domain => hostname.includes(domain)) || hostname;
  } catch (e) {
    return 'unknown';
  }
}

let currentWebsite = null;
let currentWebsiteSavedTime = 0;
let currentSessionStartTime = null;

function startTracking(url) {
  const domain = getDomainFromUrl(url);
  if (domain === currentWebsite) return;
  
  // Stop tracking previous site if any
  if (currentWebsite) {
    stopTracking();
  }
  
  currentWebsite = domain;
  currentSessionStartTime = Date.now();
  
  // Get existing time for this site from session storage
  chrome.storage.session.get([domain], (result) => {
    currentWebsiteSavedTime = result[domain] || 0;
  });
}

function getTotalTime() {
  if (!currentWebsite || !currentSessionStartTime) return 0;
  const elapsed = Math.floor((Date.now() - currentSessionStartTime) / 1000);
  return currentWebsiteSavedTime + elapsed;
}

function stopTracking() {
  if (!currentWebsite || !currentSessionStartTime) return;
  
  const totalTime = getTotalTime();

  chrome.storage.session.set({ [currentWebsite]: totalTime });
  
  currentWebsite = null;
  currentWebsiteSavedTime = 0;
  currentSessionStartTime = null;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "GET_TIME") {
    const totalTime = getTotalTime();
    const sessionTime = currentSessionStartTime ? Math.floor((Date.now() - currentSessionStartTime) / 1000) : 0;
    
    console.log(`GET_TIME request: currentWebsite=${currentWebsite}, totalTime=${totalTime}, sessionTime=${sessionTime}`);
    
    sendResponse({ 
      totalTime: totalTime,
      currentWebsite: currentWebsite,
      sessionTime: sessionTime
    });
  }
  return true; // Keep message channel open for async response
});

chrome.tabs.onActivated.addListener(async (activeInfo) => {
  try {
    const tab = await chrome.tabs.get(activeInfo.tabId);
    if (tab.url) {
      const domain = getDomainFromUrl(tab.url);
      if (domain === currentWebsite) {
        return; // Same site, no need to restart tracking
      }

      stopTracking();

      if (isSocialMediaSite(tab.url)) {
        startTracking(tab.url);
      }
    }
  } catch (error) {
    console.log('Error handling tab activation:', error);
  }
});

// Handle tab updates (URL changes, page loads)
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  try {
    if (changeInfo.status === 'complete' && tab.active && tab.url) {
      if (isSocialMediaSite(tab.url)) {
        startTracking(tab.url);
      } else {
        stopTracking();
      }
    }
  } catch (error) {
    console.log('Error handling tab update:', error);
  }
});

// Handle tab removal, if the removed tab was the one we were tracking, stop tracking
chrome.tabs.onRemoved.addListener((tabId) => {
  if (currentWebsite) {
    stopTracking();
  }
});


/* Gets the current active tab, when the extension is opened */
async function initializeTracking() {
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tabs.length > 0 && tabs[0].url) {
      const url = tabs[0].url;
      if (isSocialMediaSite(url)) {
        startTracking(url);
      }
    }
  } catch (error) {
    console.log('Error initializing tracking:', error);
  }
}

chrome.runtime.onStartup.addListener(() => {
  currentWebsite = null;
  currentWebsiteSavedTime = 0;
  currentSessionStartTime = null;
  
  setTimeout(initializeTracking, 1000);
});

chrome.runtime.onInstalled.addListener(() => {
  currentWebsite = null;
  currentWebsiteSavedTime = 0;
  currentSessionStartTime = null;

  setTimeout(initializeTracking, 1000);
});

initializeTracking();
