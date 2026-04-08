// Enhanced Popup Script for ALTER.ai Chrome Extension
// Handles stats, recent try-ons, button actions, and user tier

// Configuration
const CONFIG = {
  appUrl: 'http://localhost:3000',
  apiUrl: 'http://localhost:8000',
  storageKeys: {
    analytics: 'tryon_analytics',
    dailyCount: 'tryon_daily_count',
    tryOnHistory: 'tryon_history',
    userToken: 'tryon_user_token',
    userTier: 'tryon_user_tier',
    userMode: 'tryon_user_mode',
  },
  maxFreeTriesPerDay: 4,
  maxRecentTryOns: 3, // Show last 3 in popup
};

// State
let statsInterval = null;
let userTier = 'free_2d';
let userMode = '2d';
let userQuota = null;

function getTierLimit(tier, mode) {
  switch (tier) {
    case 'free_3d':
      return mode === '3d' ? 2 : 0;
    case 'premium_2d':
      return mode === '2d' ? 195 : 0;
    case 'premium_3d':
      return mode === '3d' ? 180 : 0;
    case 'ultra':
      return 365;
    case 'business':
      return 9999;
    case 'free_2d':
    default:
      return mode === '2d' ? 4 : 0;
  }
}

/**
 * Format time ago string
 */
function formatTimeAgo(timestamp) {
  const now = Date.now();
  const diff = now - new Date(timestamp).getTime();
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (minutes > 0) return `${minutes}m ago`;
  return 'Just now';
}

/**
 * Load stats from storage
 */
async function loadStats() {
  try {
    const result = await chrome.storage.local.get([
      CONFIG.storageKeys.dailyCount,
      CONFIG.storageKeys.analytics,
    ]);

    const dailyCount = result[CONFIG.storageKeys.dailyCount] || 0;
    const analytics = result[CONFIG.storageKeys.analytics] || {};
    const totalTryOns = analytics.totalTryOns || 0;

    // Update UI
    updateStatsDisplay(dailyCount, totalTryOns);

    return { dailyCount, totalTryOns };
  } catch (error) {
    console.error('Error loading stats:', error);
    updateStatsDisplay(0, 0);
    return { dailyCount: 0, totalTryOns: 0 };
  }
}

/**
 * Update stats display in UI
 */
function updateStatsDisplay(dailyCount, totalTryOns) {
  const tryonCountEl = document.getElementById('tryonCount');
  const progressFillEl = document.getElementById('progressFill');
  const statsHintEl = document.querySelector('.stats-hint');

  if (!tryonCountEl || !progressFillEl) return;

  let dailyLimit = getUserDailyLimit();
  let usedCount = dailyCount;
  let periodLabel = 'today';

  if (userQuota && userQuota.limit !== null) {
    dailyLimit = userQuota.limit;
    usedCount = typeof userQuota.used === 'number' ? userQuota.used : dailyCount;
    periodLabel = userQuota.period || 'period';
  }

  // Update count display
  tryonCountEl.textContent = `${usedCount}/${dailyLimit}`;

  // Update progress bar
  const percentage = dailyLimit > 0 ? Math.min((usedCount / dailyLimit) * 100, 100) : 0;
  progressFillEl.style.width = `${percentage}%`;

  // Update hint text
  const remaining = Math.max(0, dailyLimit - usedCount);
  if (statsHintEl) {
    if (remaining === 0) {
      statsHintEl.textContent = `${periodLabel} limit reached`;
      statsHintEl.style.color = '#ef4444';
    } else {
      statsHintEl.textContent = `${remaining} try-ons remaining this ${periodLabel}`;
      statsHintEl.style.color = '#6b7280';
    }
  }

  // Update progress bar color based on remaining
  if (remaining <= 10 && remaining > 0) {
    progressFillEl.style.background = 'linear-gradient(90deg, #f59e0b 0%, #ef4444 100%)';
  } else if (remaining === 0) {
    progressFillEl.style.background = '#ef4444';
  } else {
    progressFillEl.style.background = 'linear-gradient(90deg, #8b5cf6 0%, #3b82f6 100%)';
  }
}

/**
 * Get user's daily limit based on tier
 */
function getUserDailyLimit() {
  return getTierLimit(userTier, userMode);
}

/**
 * Load recent try-ons from storage
 */
async function loadRecentTryOns() {
  try {
    const result = await chrome.storage.local.get(CONFIG.storageKeys.tryOnHistory);
    const history = result[CONFIG.storageKeys.tryOnHistory] || [];

    // Get last N try-ons
    const recent = history.slice(0, CONFIG.maxRecentTryOns);

    displayRecentTryOns(recent);

    return recent;
  } catch (error) {
    console.error('Error loading recent try-ons:', error);
    displayRecentTryOns([]);
    return [];
  }
}

/**
 * Display recent try-ons in UI
 */
function displayRecentTryOns(tryOns) {
  const thumbnailsGrid = document.querySelector('.thumbnails-grid');
  if (!thumbnailsGrid) return;

  // Clear existing thumbnails
  thumbnailsGrid.innerHTML = '';

  if (tryOns.length === 0) {
    // Show empty state
    const emptyState = document.createElement('div');
    emptyState.className = 'empty-state';
    emptyState.style.cssText = `
      grid-column: 1 / -1;
      text-align: center;
      padding: 20px;
      color: #6b7280;
      font-size: 13px;
    `;
    emptyState.textContent = 'No recent try-ons';
    thumbnailsGrid.appendChild(emptyState);
    return;
  }

  // Create thumbnail for each try-on
  tryOns.forEach((tryOn) => {
    const thumbnail = document.createElement('div');
    thumbnail.className = 'thumbnail';
    thumbnail.style.cursor = 'pointer';

    const img = document.createElement('img');
    img.src = tryOn.imageUrl || '/placeholder.svg?height=90&width=90';
    img.alt = tryOn.productTitle || 'Try-on result';
    img.onerror = () => {
      img.src = '/placeholder.svg?height=90&width=90';
    };

    const overlay = document.createElement('div');
    overlay.className = 'thumbnail-overlay';

    const timeIcon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    timeIcon.setAttribute('width', '16');
    timeIcon.setAttribute('height', '16');
    timeIcon.setAttribute('viewBox', '0 0 24 24');
    timeIcon.setAttribute('fill', 'none');
    timeIcon.setAttribute('stroke', 'currentColor');
    timeIcon.setAttribute('stroke-width', '2');
    timeIcon.innerHTML = `
      <circle cx="12" cy="12" r="10"/>
      <polyline points="12 6 12 12 16 14"/>
    `;

    const timeText = document.createElement('span');
    timeText.textContent = formatTimeAgo(tryOn.timestamp);

    overlay.appendChild(timeIcon);
    overlay.appendChild(timeText);

    thumbnail.appendChild(img);
    thumbnail.appendChild(overlay);

    // Click handler - open try-on in app
    thumbnail.addEventListener('click', () => {
      const url = `${CONFIG.appUrl}/try?image=${encodeURIComponent(tryOn.imageUrl)}`;
      chrome.tabs.create({ url, active: true });
    });

    thumbnailsGrid.appendChild(thumbnail);
  });
}

/**
 * Fetch user tier from backend API
 */
async function fetchUserTier() {
  try {
    // Check if user is logged in
    const result = await chrome.storage.local.get(CONFIG.storageKeys.userToken);
    const token = result[CONFIG.storageKeys.userToken];

    if (!token) {
      userTier = 'free_2d';
      userMode = '2d';
      userQuota = null;
      return userTier;
    }

    // Fetch tier from API
    const response = await fetch(`${CONFIG.apiUrl}/api/user/tier`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error('Failed to fetch user tier');
    }

    const data = await response.json();
    userTier = data.tier || (data.data && data.data.tier) || 'free_2d';
    userMode = data.preferred_mode || (data.data && data.data.preferred_mode) || '2d';
    userQuota = data.quota || (data.data && data.data.quota) || null;

    // Cache tier in storage
    await chrome.storage.local.set({
      [CONFIG.storageKeys.userTier]: userTier,
      [CONFIG.storageKeys.userMode]: userMode,
    });

    return userTier;
  } catch (error) {
    console.error('Error fetching user tier:', error);
    // Fallback to cached tier or free
    const cached = await chrome.storage.local.get(CONFIG.storageKeys.userTier);
    userTier = cached[CONFIG.storageKeys.userTier] || 'free_2d';
    userMode = cached[CONFIG.storageKeys.userMode] || '2d';
    userQuota = null;
    return userTier;
  }
}

/**
 * Handle upload from computer button
 */
function handleUploadFromComputer() {
  // Create file input element
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.style.display = 'none';

  input.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    try {
      // Convert file to data URL
      const reader = new FileReader();
      reader.onload = async (event) => {
        const dataUrl = event.target.result;

        // Open TryOn.AI with image data
        const url = `${CONFIG.appUrl}/try?image=${encodeURIComponent(dataUrl)}`;
        await chrome.tabs.create({ url, active: true });

        // Track analytics
        await chrome.runtime.sendMessage({
          action: 'tryOnProduct',
          metadata: {
            imageUrl: dataUrl,
            sourceUrl: 'file://upload',
            productTitle: file.name,
          },
        });
      };

      reader.onerror = (error) => {
        console.error('Error reading file:', error);
        showNotification('Error reading image file', 'error');
      };

      reader.readAsDataURL(file);
    } catch (error) {
      console.error('Error handling file upload:', error);
      showNotification('Error uploading image', 'error');
    }

    // Clean up
    document.body.removeChild(input);
  });

  // Trigger file picker
  document.body.appendChild(input);
  input.click();
}

/**
 * Handle open app button
 */
function handleOpenApp() {
  chrome.tabs.create({
    url: CONFIG.appUrl,
    active: true,
  });
}

/**
 * Handle settings button
 */
function handleSettings() {
  chrome.runtime.openOptionsPage();
}

/**
 * Handle pricing link
 */
function handlePricing() {
  chrome.tabs.create({
    url: `${CONFIG.appUrl}/#pricing`,
    active: true,
  });
}

/**
 * Handle how to use link
 */
function handleHowToUse() {
  chrome.tabs.create({
    url: `${CONFIG.appUrl}/help`,
    active: true,
  });
}

/**
 * Show notification toast
 */
function showNotification(message, type = 'info') {
  // Create toast element
  const toast = document.createElement('div');
  toast.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: ${type === 'error' ? '#ef4444' : type === 'success' ? '#10b981' : '#667eea'};
    color: white;
    padding: 12px 20px;
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
    z-index: 10000;
    font-size: 13px;
    font-weight: 500;
    animation: slideIn 0.3s ease-out;
  `;
  toast.textContent = message;

  // Add animation
  const style = document.createElement('style');
  style.textContent = `
    @keyframes slideIn {
      from {
        transform: translateX(400px);
        opacity: 0;
      }
      to {
        transform: translateX(0);
        opacity: 1;
      }
    }
  `;
  document.head.appendChild(style);

  document.body.appendChild(toast);

  // Remove after 3 seconds
  setTimeout(() => {
    toast.style.animation = 'slideIn 0.3s ease-out reverse';
    setTimeout(() => {
      if (toast.parentNode) {
        toast.parentNode.removeChild(toast);
      }
    }, 300);
  }, 3000);
}

/**
 * Setup real-time stats updates
 */
function setupRealTimeUpdates() {
  // Update stats immediately
  loadStats();

  // Update stats every 2 seconds
  statsInterval = setInterval(() => {
    loadStats();
  }, 2000);

  // Listen for storage changes
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'local') {
      if (changes[CONFIG.storageKeys.dailyCount] || changes[CONFIG.storageKeys.tryOnHistory]) {
        loadStats();
        loadRecentTryOns();
      }
    }
  });
}

/**
 * Initialize popup
 */
async function init() {
  try {
    // Fetch user tier
    await fetchUserTier();

    // Load initial data
    await loadStats();
    await loadRecentTryOns();

    // Setup real-time updates
    setupRealTimeUpdates();

    // Setup button handlers
    const uploadBtn = document.getElementById('uploadBtn');
    const openAppBtn = document.getElementById('openAppBtn');
    const settingsBtn = document.getElementById('settingsBtn');
    const pricingLink = document.getElementById('pricingLink');
    const howToUseLink = document.getElementById('howToUseLink');

    if (uploadBtn) {
      uploadBtn.addEventListener('click', handleUploadFromComputer);
    }

    if (openAppBtn) {
      openAppBtn.addEventListener('click', handleOpenApp);
    }

    if (settingsBtn) {
      settingsBtn.addEventListener('click', handleSettings);
    }

    if (pricingLink) {
      pricingLink.addEventListener('click', (e) => {
        e.preventDefault();
        handlePricing();
      });
    }

    if (howToUseLink) {
      howToUseLink.addEventListener('click', (e) => {
        e.preventDefault();
        handleHowToUse();
      });
    }

    const helpBtn = document.getElementById('helpBtn');
    if (helpBtn) {
      helpBtn.addEventListener('click', handleHowToUse);
    }

    // Update upgrade section based on tier
    updateUpgradeSection();

    console.log('Popup initialized');
  } catch (error) {
    console.error('Error initializing popup:', error);
    showNotification('Error loading popup', 'error');
  }
}

/**
 * Update upgrade section based on user tier
 */
function updateUpgradeSection() {
  const upgradeSection = document.querySelector('.upgrade-section');
  if (!upgradeSection) return;

  if (userTier !== 'free_2d' && userTier !== 'free_3d') {
    // Hide upgrade section for paid users
    upgradeSection.style.display = 'none';
  } else {
    // Show upgrade section for free users
    upgradeSection.style.display = 'flex';
  }
}

/**
 * Cleanup on popup close
 */
function cleanup() {
  if (statsInterval) {
    clearInterval(statsInterval);
    statsInterval = null;
  }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

// Cleanup on unload
window.addEventListener('beforeunload', cleanup);
