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

// Load persisted state when service worker wakes up
async function loadState() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['currentWebsite', 'currentSessionStartTime'], (result) => {
      currentWebsite = result.currentWebsite || null;
      currentSessionStartTime = result.currentSessionStartTime || null;
      if (currentWebsite) {
        chrome.storage.local.get([currentWebsite], (res) => {
          currentWebsiteSavedTime = res[currentWebsite] || 0;
          resolve();
        });
      } else {
        currentWebsiteSavedTime = 0;
        resolve();
      }
    });
  });
}

function startTracking(url) {
  const domain = getDomainFromUrl(url);
  if (domain === currentWebsite) return;
  
  // Stop tracking previous site if any
  if (currentWebsite) {
    stopTracking();
  }
  
  currentWebsite = domain;
  currentSessionStartTime = Date.now();

  // Service workers in manifest v3 are not stateful, so storing to storage
  chrome.storage.local.set({ currentWebsite: currentWebsite, currentSessionStartTime: currentSessionStartTime });
  
  // Get existing time for this site from session storage
  chrome.storage.local.get([domain], (result) => {
    currentWebsiteSavedTime = result[domain] || 0;
  });
}


function getTotalTime() {
  if (!currentSessionStartTime) return currentWebsiteSavedTime;
  const elapsed = Math.floor((Date.now() - currentSessionStartTime) / 1000);
  return currentWebsiteSavedTime + elapsed;
}

function save()
{
  if (!currentWebsite) return;
  chrome.storage.local.set({ [currentWebsite]: getTotalTime() });
}

function stopTracking() {
  save();

  currentWebsite = null;
  currentWebsiteSavedTime = 0;
  currentSessionStartTime = null;
}


chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "GET_TIME") {
    loadState().then(() => {
      const totalTime = getTotalTime();
      const sessionTime = currentSessionStartTime ? Math.floor((Date.now() - currentSessionStartTime) / 1000) : 0;
      console.log(`GET_TIME request: currentWebsite=${currentWebsite}, totalTime=${totalTime}, sessionTime=${sessionTime}`);
      sendResponse({ 
        totalTime: totalTime,
        currentWebsite: currentWebsite,
        sessionTime: sessionTime
      });
    });
    return true; // Keep message channel open for async response
  }
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

// Save state before service worker is killed
chrome.runtime.onSuspend.addListener(() => {
  console.log("Service worker suspended, saving state...");
  loadState().then(() => {
    save();
  });
});

// Periodic save in case of crashes/suspension
setInterval(() => {
  save();
}, 10000);

// Load state before initializing tracking
loadState().then(() => {
  initializeTracking();
});
