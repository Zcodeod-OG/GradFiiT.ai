// Background Service Worker for ALTER.ai Chrome Extension (Manifest V3)
// Handles messages, analytics, rate limiting, and badge management

// Configuration
const CONFIG = {
  maxFreeTriesPerDay: 50,
  storageKeys: {
    analytics: 'tryon_analytics',
    dailyCount: 'tryon_daily_count',
    lastResetDate: 'tryon_last_reset_date',
    popularDomains: 'tryon_popular_domains',
    tryOnHistory: 'tryon_history',
  },
  appUrl: 'http://localhost:3000',
};

/**
 * Reset daily counter if needed (at start of new day)
 */
async function resetDailyCounterIfNeeded() {
  try {
    const result = await chrome.storage.local.get([CONFIG.storageKeys.lastResetDate, CONFIG.storageKeys.dailyCount]);
    const today = new Date().toDateString();
    const lastResetDate = result[CONFIG.storageKeys.lastResetDate];
    
    if (lastResetDate !== today) {
      // New day - reset counter
      await chrome.storage.local.set({
        [CONFIG.storageKeys.lastResetDate]: today,
        [CONFIG.storageKeys.dailyCount]: 0,
      });
      await updateBadge(0);
      return true;
    }
    
    return false;
  } catch (error) {
    console.error('Error resetting daily counter:', error);
    return false;
  }
}

/**
 * Get current daily count
 */
async function getDailyCount() {
  try {
    await resetDailyCounterIfNeeded();
    const result = await chrome.storage.local.get(CONFIG.storageKeys.dailyCount);
    return result[CONFIG.storageKeys.dailyCount] || 0;
  } catch (error) {
    console.error('Error getting daily count:', error);
    return 0;
  }
}

/**
 * Increment daily count
 */
async function incrementDailyCount() {
  try {
    const count = await getDailyCount();
    const newCount = count + 1;
    await chrome.storage.local.set({
      [CONFIG.storageKeys.dailyCount]: newCount,
    });
    return newCount;
  } catch (error) {
    console.error('Error incrementing daily count:', error);
    throw error;
  }
}

/**
 * Check if user has tries remaining
 */
async function hasTriesRemaining() {
  try {
    const count = await getDailyCount();
    return count < CONFIG.maxFreeTriesPerDay;
  } catch (error) {
    console.error('Error checking tries remaining:', error);
    return true; // Allow on error to not block users
  }
}

/**
 * Update badge counter
 */
async function updateBadge(count = null) {
  try {
    if (count === null) {
      count = await getDailyCount();
    }
    
    const remaining = Math.max(0, CONFIG.maxFreeTriesPerDay - count);
    
    if (remaining === 0) {
      // No tries left - show warning badge
      await chrome.action.setBadgeText({ text: '0' });
      await chrome.action.setBadgeBackgroundColor({ color: '#ef4444' }); // Red
    } else if (remaining <= 10) {
      // Low tries - show warning
      await chrome.action.setBadgeText({ text: remaining.toString() });
      await chrome.action.setBadgeBackgroundColor({ color: '#f59e0b' }); // Orange
    } else {
      // Normal - show remaining count
      await chrome.action.setBadgeText({ text: remaining.toString() });
      await chrome.action.setBadgeBackgroundColor({ color: '#667eea' }); // Primary color
    }
  } catch (error) {
    console.error('Error updating badge:', error);
  }
}

/**
 * Track analytics
 */
async function trackAnalytics(data) {
  try {
    const result = await chrome.storage.local.get([
      CONFIG.storageKeys.analytics,
      CONFIG.storageKeys.popularDomains,
      CONFIG.storageKeys.tryOnHistory,
    ]);
    
    // Update total count
    const analytics = result[CONFIG.storageKeys.analytics] || {
      totalTryOns: 0,
      firstUseDate: new Date().toISOString(),
      lastUseDate: new Date().toISOString(),
    };
    
    analytics.totalTryOns = (analytics.totalTryOns || 0) + 1;
    analytics.lastUseDate = new Date().toISOString();
    
    // Track popular domains
    let popularDomains = result[CONFIG.storageKeys.popularDomains] || {};
    if (data.sourceUrl) {
      try {
        const domain = new URL(data.sourceUrl).hostname.replace('www.', '');
        popularDomains[domain] = (popularDomains[domain] || 0) + 1;
        
        // Keep only top 50 domains
        const entries = Object.entries(popularDomains)
          .sort(([, a], [, b]) => b - a)
          .slice(0, 50);
        popularDomains = Object.fromEntries(entries);
      } catch (error) {
        console.warn('Error parsing domain:', error);
      }
    }
    
    // Track history (keep last 100)
    let history = result[CONFIG.storageKeys.tryOnHistory] || [];
    history.unshift({
      timestamp: new Date().toISOString(),
      imageUrl: data.imageUrl,
      productTitle: data.productTitle || '',
      price: data.price || '',
      sourceUrl: data.sourceUrl || '',
    });
    
    // Keep only last 100 entries
    if (history.length > 100) {
      history = history.slice(0, 100);
    }
    
    // Save all analytics
    await chrome.storage.local.set({
      [CONFIG.storageKeys.analytics]: analytics,
      [CONFIG.storageKeys.popularDomains]: popularDomains,
      [CONFIG.storageKeys.tryOnHistory]: history,
    });
    
  } catch (error) {
    console.error('Error tracking analytics:', error);
  }
}

/**
 * Extract domain from URL
 */
function extractDomain(url) {
  try {
    return new URL(url).hostname.replace('www.', '');
  } catch (error) {
    return '';
  }
}

/**
 * Build TryOn.AI URL with parameters
 */
function buildTryOnUrl(data) {
  try {
    const url = new URL(`${CONFIG.appUrl}/try`);
    
    // Add image URL (required)
    if (data.imageUrl) {
      url.searchParams.set('image', data.imageUrl);
    }

    // Add source domain
    if (data.sourceUrl) {
      const domain = extractDomain(data.sourceUrl);
      if (domain) {
        url.searchParams.set('source', domain);
      }
    }

    // Add optional metadata
    if (data.productTitle) {
      url.searchParams.set('title', data.productTitle);
    }

    if (data.price) {
      url.searchParams.set('price', data.price);
    }

    if (data.brand) {
      url.searchParams.set('brand', data.brand);
    }
    
    return url.toString();
  } catch (error) {
    console.error('Error building TryOn URL:', error);
    // Fallback to basic URL
    return `${CONFIG.appUrl}/try?image=${encodeURIComponent(data.imageUrl || '')}`;
  }
}

/**
 * Handle try-on request from content script
 */
async function handleTryOnRequest(data, sendResponse) {
  try {
    // Validate required data
    if (!data.imageUrl) {
      sendResponse({
        success: false,
        error: 'Image URL is required',
      });
      return;
    }
    
    // Check rate limit
    const hasRemaining = await hasTriesRemaining();
    if (!hasRemaining) {
      sendResponse({
        success: false,
        error: 'Daily limit reached',
        limitReached: true,
        remaining: 0,
      });
      return;
    }
    
    // Get current count before incrementing
    const currentCount = await getDailyCount();
    
    // Increment counter
    await incrementDailyCount();
    
    // Track analytics
    await trackAnalytics({
      imageUrl: data.imageUrl,
      productTitle: data.productTitle || data.title || '',
      price: data.price || '',
      sourceUrl: data.sourceUrl || data.url || window.location?.href || '',
      brand: data.brand || '',
    });
    
    // Build URL
    const tryOnUrl = buildTryOnUrl({
      imageUrl: data.imageUrl,
      productTitle: data.productTitle || data.title,
      price: data.price,
      sourceUrl: data.sourceUrl || data.url,
      brand: data.brand,
    });
    
    // Open new tab
    try {
      await chrome.tabs.create({
        url: tryOnUrl,
        active: true,
      });
    } catch (error) {
      console.error('Error opening tab:', error);
      sendResponse({
        success: false,
        error: 'Failed to open ALTER.ai',
      });
      return;
    }
    
    // Update badge
    await updateBadge(currentCount + 1);
    
    // Send success response
    sendResponse({
      success: true,
      remaining: CONFIG.maxFreeTriesPerDay - (currentCount + 1),
      url: tryOnUrl,
    });
    
  } catch (error) {
    console.error('Error handling try-on request:', error);
    sendResponse({
      success: false,
      error: error.message || 'Unknown error occurred',
    });
  }
}

/**
 * Handle message from content script or popup
 */
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // Handle asynchronously
  (async () => {
    try {
      switch (request.action) {
        case 'tryOnProduct':
          await handleTryOnRequest(request.metadata, sendResponse);
          break;
          
        case 'getRemainingTries':
          const count = await getDailyCount();
          const remaining = Math.max(0, CONFIG.maxFreeTriesPerDay - count);
          sendResponse({
            success: true,
            remaining: remaining,
            total: CONFIG.maxFreeTriesPerDay,
            count: count,
          });
          break;
          
        case 'getAnalytics':
          const analytics = await chrome.storage.local.get([
            CONFIG.storageKeys.analytics,
            CONFIG.storageKeys.popularDomains,
            CONFIG.storageKeys.dailyCount,
          ]);
          sendResponse({
            success: true,
            analytics: analytics[CONFIG.storageKeys.analytics] || {},
            popularDomains: analytics[CONFIG.storageKeys.popularDomains] || {},
            dailyCount: analytics[CONFIG.storageKeys.dailyCount] || 0,
          });
          break;
          
        case 'resetDailyCount':
          // For testing/admin purposes
          await chrome.storage.local.set({
            [CONFIG.storageKeys.dailyCount]: 0,
            [CONFIG.storageKeys.lastResetDate]: new Date().toDateString(),
          });
          await updateBadge(0);
          sendResponse({ success: true });
          break;
          
        default:
          sendResponse({
            success: false,
            error: 'Unknown action: ' + request.action,
          });
      }
    } catch (error) {
      console.error('Error handling message:', error);
      sendResponse({
        success: false,
        error: error.message || 'Unknown error',
      });
    }
  })();
  
  // Return true to indicate async response
  return true;
});

/**
 * Initialize on installation
 */
chrome.runtime.onInstalled.addListener(async (details) => {
  try {
    if (details.reason === 'install') {
      console.log('ALTER.ai extension installed');
      
      // Initialize default settings
      await chrome.storage.local.set({
        [CONFIG.storageKeys.analytics]: {
          totalTryOns: 0,
          firstUseDate: new Date().toISOString(),
          lastUseDate: null,
        },
        [CONFIG.storageKeys.dailyCount]: 0,
        [CONFIG.storageKeys.lastResetDate]: new Date().toDateString(),
        [CONFIG.storageKeys.popularDomains]: {},
        [CONFIG.storageKeys.tryOnHistory]: [],
      });
      
      await updateBadge(0);
      
    } else if (details.reason === 'update') {
      console.log('ALTER.ai extension updated to version', chrome.runtime.getManifest().version);
      
      // Reset daily counter if needed
      await resetDailyCounterIfNeeded();
      await updateBadge();
      
      // Migrate old data if needed
      try {
        const result = await chrome.storage.local.get(null);
        if (!result[CONFIG.storageKeys.lastResetDate]) {
          // Migrate from old format if needed
          await chrome.storage.local.set({
            [CONFIG.storageKeys.lastResetDate]: new Date().toDateString(),
          });
        }
      } catch (error) {
        console.warn('Migration error:', error);
      }
    }
  } catch (error) {
    console.error('Error in onInstalled handler:', error);
  }
});

/**
 * Handle extension icon click
 */
chrome.action.onClicked.addListener(async (tab) => {
  try {
    // Check remaining tries
    const count = await getDailyCount();
    const remaining = Math.max(0, CONFIG.maxFreeTriesPerDay - count);
    
    if (remaining === 0) {
      // Open options page or show message
      await chrome.tabs.create({
        url: `${CONFIG.appUrl}/upgrade`,
      });
    }
    
  } catch (error) {
    console.error('Error handling icon click:', error);
  }
});

/**
 * Initialize badge on startup
 */
async function initializeBadge() {
  try {
    await resetDailyCounterIfNeeded();
    await updateBadge();
  } catch (error) {
    console.error('Error initializing badge:', error);
  }
}

// Initialize when service worker starts
initializeBadge();

// Reset counter daily (also reset on startup)
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'resetDailyCounter') {
    await resetDailyCounterIfNeeded();
    await updateBadge();
  }
});

// Set up daily alarm for counter reset
chrome.alarms.create('resetDailyCounter', {
  delayInMinutes: 1440, // 24 hours
  periodInMinutes: 1440, // Repeat every 24 hours
});

// Handle tab updates to update badge if needed
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete') {
    // Update badge when page loads (optional - can be removed if not needed)
    await updateBadge();
  }
});

console.log('ALTER.ai background service worker loaded');
