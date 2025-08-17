
import { socialMediaDomains, friendlyNames, goals } from './config.js';

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

function formatTime(seconds) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

function getFriendlySiteName(url) {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    const domain = socialMediaDomains.find(domain => hostname.includes(domain));
    
    if (domain) {
      return friendlyNames[domain] || domain;
    }
    
    return hostname.replace('www.', '');
  } catch (e) {
    return 'Unknown Site';
  }
}

let updateTimer;
let currentSiteName = null;
let showTotalTime = true;

document.addEventListener('DOMContentLoaded', async () => {
	try {
		const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
		if (tabs.length === 0) {
			showError('No active tab found');
			return;
		}
		
		const tab = tabs[0];
		const url = tab.url;
		
		if (!url) {
			showError('No URL found in current tab');
			return;
		}
		
		const siteName = getDomainFromUrl(url);
		const isSocial = isSocialMediaSite(url);
		
		currentSiteName = siteName;

		updateSiteInfo(siteName, isSocial, url);
		setupToggleButton();
		await updateSessionTime();
		startRealTimeUpdates();
	} catch (error) {
		console.error('Error initializing popup:', error);
		showError('Failed to initialize popup');
	}
});

function setupToggleButton() {
	const toggleBtn = document.getElementById('toggle-btn');
	toggleBtn.addEventListener('click', () => {
		showTotalTime = !showTotalTime;
		updateToggleDisplay();
		updateSessionTime();
	});
}

function updateToggleDisplay() {
	const timeLabel = document.getElementById('time-label');
	const progressText = document.getElementById('progress-text');
	const toggleArrow = document.querySelector('.toggle-arrow');
	
	if (showTotalTime) {
		timeLabel.textContent = 'Total Session';
		progressText.textContent = `Total goal: ${Math.floor(goals.total / 3600)} hours`;
		toggleArrow.textContent = '←';
		toggleArrow.style.transform = 'rotate(180deg)';
	} else {
		timeLabel.textContent = 'Current Session';
		progressText.textContent = `Session goal: ${Math.floor(goals.session / 60)} minutes`;
		toggleArrow.textContent = '→';
		toggleArrow.style.transform = 'rotate(0deg)';
	}
}

function showError(message) {
	const container = document.querySelector('.popup-container');
	container.innerHTML = `
		<div class="error-message">
			<div class="error-icon">⚠️</div>
			<div class="error-text">${message}</div>
		</div>
	`;
}

function startRealTimeUpdates() {
	if (updateTimer) {
		clearInterval(updateTimer);
	}
	
	updateTimer = setInterval(async () => {
		try {
			await updateSessionTime();
		} catch (error) {
			console.error('Error updating session time:', error);
		}
	}, 1000);
}

function updateSiteInfo(siteName, isSocial, url) {
		const siteNameElem = document.getElementById('site-name');
		const siteStatusElem = document.getElementById('site-status');
  
		const friendlyName = getFriendlySiteName ? getFriendlySiteName(url) : siteName;
		siteNameElem.innerHTML = '';
		const nameSpan = document.createElement('span');
		nameSpan.textContent = friendlyName;
		siteNameElem.appendChild(nameSpan);
		if (isSocial) {
			siteStatusElem.innerHTML = '<span class="glow-dot" title="Tracking active"></span> Social Media Site';
			siteStatusElem.style.color = '#e4405f';
			document.getElementById('site-info').className = `site-info site-${siteName.toLowerCase()}`;
		} else {
			siteStatusElem.textContent = 'Regular Website';
			siteStatusElem.style.color = '#787774';
		}
}

async function updateSessionTime() {
	try {
		const backgroundTime = await getBackgroundTime();
		
		let sessionSeconds = 0;
		let goalSeconds = goals.session;
		
		if (showTotalTime) {
			if (backgroundTime && backgroundTime.currentWebsite === currentSiteName) {
				sessionSeconds = backgroundTime.totalTime;
			} else {
				const result = await chrome.storage.local.get([currentSiteName]);
				sessionSeconds = result[currentSiteName] || 0;
			}
			goalSeconds = goals.total;
		} else {
			if (backgroundTime && backgroundTime.currentWebsite === currentSiteName) {
				sessionSeconds = backgroundTime.sessionTime;
			}
			goalSeconds = goals.session;
		}
		
		document.getElementById('time-value').textContent = formatTime(sessionSeconds);
		
		const progressPercent = Math.min((sessionSeconds / goalSeconds) * 100, 100);
		document.getElementById('progress-fill').style.width = `${progressPercent}%`;
	} catch (error) {
		console.error('Error updating session time:', error);
	}
}

function getBackgroundTime() {
	return new Promise((resolve) => {
		try {
			chrome.runtime.sendMessage({ type: "GET_TIME" }, (response) => {
				if (chrome.runtime.lastError) {
					console.log('Background script error:', chrome.runtime.lastError);
					resolve(null);
				} else {
					resolve(response);
				}
			});
		} catch (error) {
			console.error('Error sending message to background:', error);
			resolve(null);
		}
	});
}

document.addEventListener('DOMContentLoaded', () => {
	const elements = document.querySelectorAll('.time-display');
	elements.forEach((el, index) => {
		el.style.opacity = '0';
		el.style.transform = 'translateY(10px)';
		el.style.transition = 'all 0.3s ease';
		
		setTimeout(() => {
			el.style.opacity = '1';
			el.style.transform = 'translateY(0)';
		}, index * 100);
	});
});

window.addEventListener('beforeunload', () => {
	if (updateTimer) {
		clearInterval(updateTimer);
	}
});
