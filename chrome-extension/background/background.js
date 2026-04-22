// Background Service Worker for GradFiT Chrome Extension (Manifest V3)
// Handles messages, analytics, rate limiting, and badge management

// Configuration
const CONFIG = {
  maxFreeTriesPerDay: 4,
  storageKeys: {
    analytics: 'tryon_analytics',
    dailyCount: 'tryon_daily_count',
    lastResetDate: 'tryon_last_reset_date',
    popularDomains: 'tryon_popular_domains',
    tryOnHistory: 'tryon_history',
    userToken: 'tryon_user_token',
    userTier: 'tryon_user_tier',
    userMode: 'tryon_user_mode',
    snapshot: 'gradfit_user_snapshot',
    snapshotTimestamp: 'gradfit_user_snapshot_at',
    recentTryons: 'gradfit_recent_tryons',
  },
  snapshotMaxAgeMs: 60 * 1000,
  recentTryonsLimit: 10,
  appUrl: 'http://localhost:3000',
  apiUrl: 'http://localhost:8000',
};

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

async function getActiveTierAndMode(modeOverride = null) {
  const result = await chrome.storage.local.get([
    CONFIG.storageKeys.userTier,
    CONFIG.storageKeys.userMode,
  ]);
  const tier = result[CONFIG.storageKeys.userTier] || 'free_2d';
  const mode = modeOverride || result[CONFIG.storageKeys.userMode] || '2d';
  return { tier, mode };
}

async function getCurrentLimit(modeOverride = null) {
  try {
    const { tier, mode } = await getActiveTierAndMode(modeOverride);
    return getTierLimit(tier, mode);
  } catch (error) {
    console.warn('Failed to resolve tier limit, using free 2D default:', error);
    return CONFIG.maxFreeTriesPerDay;
  }
}

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
async function hasTriesRemaining(mode = '2d') {
  try {
    const count = await getDailyCount();
    const limit = await getCurrentLimit(mode);
    return count < limit;
  } catch (error) {
    console.error('Error checking tries remaining:', error);
    return true; // Allow on error to not block users
  }
}

/**
 * Update badge counter
 */
async function updateBadge(count = null, mode = null) {
  try {
    if (count === null) {
      count = await getDailyCount();
    }

    const limit = await getCurrentLimit(mode);
    const remaining = Math.max(0, limit - count);
    
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

    if (data.tryonMode) {
      url.searchParams.set('mode', data.tryonMode);
    }
    
    return url.toString();
  } catch (error) {
    console.error('Error building TryOn URL:', error);
    // Fallback to basic URL
    return `${CONFIG.appUrl}/try?image=${encodeURIComponent(data.imageUrl || '')}`;
  }
}

function extractQuickPreviewUrl(payload) {
  if (!payload || typeof payload !== 'object') return '';
  if (payload.result_image_url) return payload.result_image_url;
  if (payload.resultUrl) return payload.resultUrl;
  if (payload.preview_url) return payload.preview_url;
  if (payload.stage1_result_url) return payload.stage1_result_url;
  if (payload.data && typeof payload.data === 'object') {
    if (payload.data.result_image_url) return payload.data.result_image_url;
    if (payload.data.resultUrl) return payload.data.resultUrl;
    if (payload.data.preview_url) return payload.data.preview_url;
    if (payload.data.stage1_result_url) return payload.data.stage1_result_url;
  }
  return '';
}

async function fetchJsonWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });

    let data = null;
    try {
      data = await response.json();
    } catch (e) {
      data = null;
    }

    return { response, data };
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Extract a real try-on `tryon_id` from POST /api/tryon/generate responses.
 * The backend wraps responses in `{ success, data: {...} }` but also returns
 * a flat shape in some paths - handle both.
 */
function extractTryOnId(payload) {
  if (!payload || typeof payload !== 'object') return null;
  return (
    payload.tryon_id ||
    payload.tryonId ||
    payload.id ||
    (payload.data && (payload.data.tryon_id || payload.data.tryonId || payload.data.id)) ||
    null
  );
}

function extractGarmentId(payload) {
  if (!payload || typeof payload !== 'object') return null;
  return (
    payload.garment_id ||
    payload.id ||
    (payload.data && (payload.data.garment_id || payload.data.id)) ||
    null
  );
}

function extractResultUrl(statusPayload) {
  if (!statusPayload || typeof statusPayload !== 'object') return '';
  const direct =
    statusPayload.result_image_url ||
    statusPayload.final_image_url ||
    statusPayload.stage1_result_url ||
    '';
  if (direct) return direct;
  const d = statusPayload.data;
  if (d && typeof d === 'object') {
    return (
      d.result_image_url ||
      d.final_image_url ||
      d.stage1_result_url ||
      ''
    );
  }
  return '';
}

/**
 * Handle quick try-on preview using the REAL fast-lane pipeline.
 *
 * Flow:
 *   1. Register the garment via /api/garments/from-url (save_to_closet: false).
 *   2. Kick off /api/tryon/generate with quality: "fast" (Fashn v1.6 performance).
 *   3. Poll /api/tryon/status/{id} until completion (~8-60s typical).
 *   4. Return the real result_image_url so the sidebar/content script can
 *      show the actual try-on rather than a mock mannequin.
 */
async function handleQuickTryOn(data, sendResponse) {
  try {
    if (!data.imageUrl) {
      sendResponse({ success: false, error: 'Image URL required' });
      return;
    }

    const stored = await chrome.storage.local.get([
      CONFIG.storageKeys.userToken,
      CONFIG.storageKeys.snapshot,
    ]);
    const authToken = stored[CONFIG.storageKeys.userToken] || '';
    const snap = stored[CONFIG.storageKeys.snapshot] || null;

    if (!authToken) {
      sendResponse({ success: false, error: 'Please sign in to GradFiT to run Quick Try.' });
      return;
    }
    if (!snap?.user?.default_person_image_url) {
      sendResponse({
        success: false,
        error: 'Save a default photo in GradFiT before using Quick Try.',
      });
      return;
    }

    const authHeaders = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${authToken}`,
    };

    // 1. Register the garment so the backend has a stable garment_id.
    //    Preprocessing runs in a background thread server-side, so this
    //    should return in a few seconds (image download + S3 upload).
    //    We still allow up to 60s as a cushion for retailer CDNs that
    //    throttle fetches or cold backend connections.
    const startedAt = Date.now();
    const garmentResult = await fetchJsonWithTimeout(
      `${CONFIG.apiUrl}/api/garments/from-url`,
      {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          image_url: data.imageUrl,
          name: (data.title || 'Garment').slice(0, 80),
          source_url: data.url || data.sourceUrl || '',
          save_to_closet: false,
        }),
      },
      60000
    );
    if (!garmentResult.response.ok) {
      sendResponse({
        success: false,
        error: `Could not register garment (${garmentResult.response.status})`,
      });
      return;
    }
    const garmentId = extractGarmentId(garmentResult.data);
    if (!garmentId) {
      sendResponse({ success: false, error: 'Garment registration returned no id' });
      return;
    }

    // 2. Kick off the try-on with the fastest model. This call only
    //    queues the job on the backend and returns a tryon_id, so it
    //    should be very fast - 15s is plenty even under load.
    const genResult = await fetchJsonWithTimeout(
      `${CONFIG.apiUrl}/api/tryon/generate`,
      {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          garment_id: garmentId,
          quality: 'fast',
          mode: snap.user.preferred_tryon_mode || '2d',
        }),
      },
      15000
    );
    if (!genResult.response.ok) {
      const detail =
        (genResult.data && (genResult.data.detail || genResult.data.error)) ||
        `Try-on start failed (${genResult.response.status})`;
      sendResponse({ success: false, error: detail });
      return;
    }
    const tryonId = extractTryOnId(genResult.data);
    if (!tryonId) {
      sendResponse({ success: false, error: 'Try-on returned no id' });
      return;
    }

    // 3. Poll for completion.
    //
    // Fashn's internal max_wait is 180s (see FASHN_MAX_WAIT_SECONDS in
    // backend .env). Our client-side poll window must be at least as
    // long, otherwise we surface a "timed out" error to the user while
    // the backend is still legitimately working. We use a 2s cadence
    // plus a 1.5s warm-up delay for the first poll -> ~180s total.
    //
    // If Fashn itself times out, the backend will flip the tryon to
    // `failed` with a descriptive error_message, which we surface here
    // verbatim so the drawer never says a generic "timed out".
    const TERMINAL = new Set(['completed', 'failed', 'dead_letter', 'cancelled']);
    const maxAttempts = 90; // ~180s total with ~2s cadence
    let attempt = 0;
    let lastStatus = null;
    let lastStage = null;
    let lastError = null;
    let resultUrl = '';

    while (attempt < maxAttempts) {
      attempt += 1;
      await new Promise((r) => setTimeout(r, attempt === 1 ? 1500 : 2000));
      try {
        const statusResult = await fetchJsonWithTimeout(
          `${CONFIG.apiUrl}/api/tryon/status/${tryonId}`,
          { method: 'GET', headers: authHeaders },
          15000
        );
        if (!statusResult.response.ok) {
          lastError = `Status check failed (${statusResult.response.status})`;
          continue;
        }
        const statusBody = statusResult.data || {};
        const statusData = statusBody.data || statusBody;
        lastStatus = statusData.status || lastStatus;
        lastStage = statusData.current_stage || statusData.stage || lastStage;
        if (statusData.error_message) lastError = statusData.error_message;

        if (TERMINAL.has(statusData.status)) {
          resultUrl = extractResultUrl(statusData) || extractResultUrl(statusBody);
          break;
        }
      } catch (err) {
        lastError = err.message || 'Status poll failed';
      }
    }

    if (!resultUrl) {
      // Prefer the backend's own error_message when we have one - it's
      // always more actionable than a generic client-side timeout.
      let finalError;
      if (lastError) {
        finalError = lastError;
      } else if (lastStatus === 'failed' || lastStatus === 'dead_letter' || lastStatus === 'cancelled') {
        finalError = `Try-on ended in state: ${lastStatus}`;
      } else {
        finalError =
          `Still processing (last stage: ${lastStage || lastStatus || 'unknown'}). ` +
          'Open the GradFiT dashboard to see the finished result.';
      }

      console.warn('[GradFiT] Quick Try did not complete in 180s', {
        tryonId,
        lastStatus,
        lastStage,
        lastError,
      });

      sendResponse({ success: false, tryonId, error: finalError });
      // Record the failed attempt so it appears in recents.
      await recordTryOnEvent({
        tryonId,
        imageUrl: data.imageUrl,
        label: (data.title || '').slice(0, 80),
        sourceUrl: data.url || data.sourceUrl || '',
        status: lastStatus || 'failed',
        timestamp: new Date().toISOString(),
      });
      return;
    }

    await recordTryOnEvent({
      tryonId,
      imageUrl: resultUrl,
      thumbnail: resultUrl,
      label: (data.title || '').slice(0, 80),
      sourceUrl: data.url || data.sourceUrl || '',
      status: 'completed',
      timestamp: new Date().toISOString(),
    });

    sendResponse({
      success: true,
      resultUrl,
      tryonId,
      // Echoing garmentId + sourceUrl back lets the sidebar/drawer
      // mount a "Buy this" affiliate CTA right after the preview lands
      // (without a second round-trip to resolve the garment record).
      garmentId,
      sourceUrl: data.url || data.sourceUrl || '',
      processingTime: Date.now() - startedAt,
    });
  } catch (error) {
    console.error('Quick try-on error:', error);
    sendResponse({ success: false, error: error.message || 'Quick Try failed' });
  }
}


/**
 * Register a garment without running a try-on. Used by the combo
 * staging flow so the sidebar can stash a stable `garment_id` the
 * moment the user adds an item, even across tabs/sites. Returns
 * `{ success, garmentId, imageUrl, sourceUrl, title }`.
 */
async function handleRegisterGarment(data, sendResponse) {
  try {
    if (!data || !data.imageUrl) {
      sendResponse({ success: false, error: 'Image URL required' });
      return;
    }

    const stored = await chrome.storage.local.get([CONFIG.storageKeys.userToken]);
    const authToken = stored[CONFIG.storageKeys.userToken] || '';
    if (!authToken) {
      sendResponse({ success: false, error: 'Please sign in to GradFiT first.' });
      return;
    }

    const garmentResult = await fetchJsonWithTimeout(
      `${CONFIG.apiUrl}/api/garments/from-url`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          image_url: data.imageUrl,
          name: (data.title || 'Garment').slice(0, 80),
          source_url: data.url || data.sourceUrl || '',
          // We don't auto-save combo-staged items to the closet -- they
          // only live in this session. The user can still save from the
          // dashboard history once the combo completes.
          save_to_closet: false,
        }),
      },
      60000
    );

    if (!garmentResult.response.ok) {
      sendResponse({
        success: false,
        error: `Could not register garment (${garmentResult.response.status})`,
      });
      return;
    }

    const garmentId = extractGarmentId(garmentResult.data);
    if (!garmentId) {
      sendResponse({ success: false, error: 'Garment registration returned no id' });
      return;
    }

    sendResponse({
      success: true,
      garmentId,
      imageUrl: data.imageUrl,
      sourceUrl: data.url || data.sourceUrl || '',
      title: (data.title || '').slice(0, 80),
      category: (data.category || '').toLowerCase(),
    });
  } catch (err) {
    console.error('Register garment error:', err);
    sendResponse({ success: false, error: err.message || 'Register garment failed' });
  }
}


/**
 * Combo try-on: chain 2-3 garments into a single composite look.
 *
 * The content script collects staged garment records from storage
 * (potentially from multiple tabs/sites) and passes them in as
 * `data.garments = [{garmentId?, imageUrl, title, url, category}, ...]`.
 * We register any that don't yet have a `garmentId`, then fire
 * `POST /api/tryon/combo`, then poll status like Quick Try does.
 */
async function handleComboTryOn(data, sendResponse) {
  try {
    const items = Array.isArray(data && data.garments) ? data.garments : [];
    if (items.length < 2) {
      sendResponse({ success: false, error: 'Combo try-on needs at least 2 garments.' });
      return;
    }

    const stored = await chrome.storage.local.get([
      CONFIG.storageKeys.userToken,
      CONFIG.storageKeys.snapshot,
    ]);
    const authToken = stored[CONFIG.storageKeys.userToken] || '';
    const snap = stored[CONFIG.storageKeys.snapshot] || null;
    if (!authToken) {
      sendResponse({ success: false, error: 'Please sign in to GradFiT first.' });
      return;
    }
    if (!snap?.user?.default_person_image_url) {
      sendResponse({
        success: false,
        error: 'Save a default photo in GradFiT before trying a combo.',
      });
      return;
    }

    const authHeaders = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${authToken}`,
    };

    // 1. Make sure every staged item has a garment_id. We register any
    //    that are still "draft" (URL only, no id yet). This lets the
    //    UI keep combo state optimistic even before registration.
    const resolvedIds = [];
    for (let i = 0; i < items.length; i += 1) {
      const item = items[i];
      if (item && item.garmentId) {
        resolvedIds.push(item.garmentId);
        continue;
      }
      if (!item || !item.imageUrl) {
        sendResponse({ success: false, error: `Combo slot ${i + 1} is empty.` });
        return;
      }
      const reg = await fetchJsonWithTimeout(
        `${CONFIG.apiUrl}/api/garments/from-url`,
        {
          method: 'POST',
          headers: authHeaders,
          body: JSON.stringify({
            image_url: item.imageUrl,
            name: (item.title || 'Garment').slice(0, 80),
            source_url: item.url || item.sourceUrl || '',
            save_to_closet: false,
          }),
        },
        60000
      );
      if (!reg.response.ok) {
        sendResponse({
          success: false,
          error: `Combo registration failed for slot ${i + 1} (${reg.response.status})`,
        });
        return;
      }
      const gid = extractGarmentId(reg.data);
      if (!gid) {
        sendResponse({ success: false, error: `No garment_id for slot ${i + 1}` });
        return;
      }
      resolvedIds.push(gid);
    }

    // 2. Fire the combo endpoint. Fast lane is plenty for multi-step
    //    runs (each step already adds latency).
    const startedAt = Date.now();
    const genResult = await fetchJsonWithTimeout(
      `${CONFIG.apiUrl}/api/tryon/combo`,
      {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          garment_ids: resolvedIds,
          quality: data.quality || 'fast',
          mode: '2d',
        }),
      },
      15000
    );
    if (!genResult.response.ok) {
      const detail =
        (genResult.data && (genResult.data.detail || genResult.data.error)) ||
        `Combo start failed (${genResult.response.status})`;
      sendResponse({ success: false, error: detail });
      return;
    }
    const tryonId = extractTryOnId(genResult.data);
    if (!tryonId) {
      sendResponse({ success: false, error: 'Combo returned no tryon_id' });
      return;
    }

    // 3. Poll. Allow a longer ceiling than single try-on since we
    //    chain N Fashn calls (roughly N x single-run latency).
    const TERMINAL = new Set(['completed', 'failed', 'dead_letter', 'cancelled']);
    const maxAttempts = 150; // ~300s at 2s cadence
    let attempt = 0;
    let lastStatus = null;
    let lastStage = null;
    let lastError = null;
    let resultUrl = '';

    while (attempt < maxAttempts) {
      attempt += 1;
      await new Promise((r) => setTimeout(r, attempt === 1 ? 2000 : 2000));
      try {
        const statusResult = await fetchJsonWithTimeout(
          `${CONFIG.apiUrl}/api/tryon/status/${tryonId}`,
          { method: 'GET', headers: authHeaders },
          15000
        );
        if (!statusResult.response.ok) {
          lastError = `Status check failed (${statusResult.response.status})`;
          continue;
        }
        const statusBody = statusResult.data || {};
        const statusData = statusBody.data || statusBody;
        lastStatus = statusData.status || lastStatus;
        lastStage = statusData.current_stage || statusData.stage || lastStage;
        if (statusData.error_message) lastError = statusData.error_message;
        if (TERMINAL.has(statusData.status)) {
          resultUrl = extractResultUrl(statusData) || extractResultUrl(statusBody);
          break;
        }
      } catch (err) {
        lastError = err.message || 'Status poll failed';
      }
    }

    if (!resultUrl) {
      sendResponse({
        success: false,
        tryonId,
        error:
          lastError ||
          (lastStatus
            ? `Combo ended in state: ${lastStatus}`
            : 'Combo did not complete in time.'),
      });
      return;
    }

    sendResponse({
      success: true,
      tryonId,
      resultUrl,
      garmentIds: resolvedIds,
      // Primary garment (first in the chain) is what the Buy-this
      // CTA will resolve against by default.
      primaryGarmentId: resolvedIds[0],
      processingTime: Date.now() - startedAt,
    });
  } catch (err) {
    console.error('Combo try-on error:', err);
    sendResponse({ success: false, error: err.message || 'Combo try-on failed' });
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

    const { mode: preferredMode } = await getActiveTierAndMode(data.tryonMode || null);

    // Check rate limit
    const hasRemaining = await hasTriesRemaining(preferredMode);
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
      sourceUrl: data.sourceUrl || data.url || '',
      brand: data.brand || '',
    });

    // Build URL
    const tryOnUrl = buildTryOnUrl({
      imageUrl: data.imageUrl,
      productTitle: data.productTitle || data.title,
      price: data.price,
      sourceUrl: data.sourceUrl || data.url,
      brand: data.brand,
      tryonMode: preferredMode,
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
        error: 'Failed to open GradFiT',
      });
      return;
    }

    // Update badge
    await updateBadge(currentCount + 1, preferredMode);

    const currentLimit = await getCurrentLimit(preferredMode);

    // Send success response
    sendResponse({
      success: true,
      remaining: Math.max(0, currentLimit - (currentCount + 1)),
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

/* ----------------------------------------------------------------------
 * User snapshot + recent try-ons sync
 *
 * The popup and content script both read the cached `gradfit_user_snapshot`
 * for instant render. The snapshot is refreshed whenever the SW receives
 * a `refreshUserSnapshot` message, when the auth token changes, and on a
 * 5-minute alarm. We dedupe via timestamp so opening the popup repeatedly
 * doesn't hammer the API.
 * --------------------------------------------------------------------*/

let snapshotInFlight = null;

async function fetchUserSnapshot(force = false) {
  if (snapshotInFlight) return snapshotInFlight;

  snapshotInFlight = (async () => {
    try {
      const stored = await chrome.storage.local.get([
        CONFIG.storageKeys.userToken,
        CONFIG.storageKeys.snapshot,
        CONFIG.storageKeys.snapshotTimestamp,
      ]);
      const token = stored[CONFIG.storageKeys.userToken];
      if (!token) {
        await chrome.storage.local.remove([
          CONFIG.storageKeys.snapshot,
          CONFIG.storageKeys.snapshotTimestamp,
        ]);
        return null;
      }

      const lastFetched = stored[CONFIG.storageKeys.snapshotTimestamp] || 0;
      if (
        !force &&
        stored[CONFIG.storageKeys.snapshot] &&
        Date.now() - lastFetched < CONFIG.snapshotMaxAgeMs
      ) {
        return stored[CONFIG.storageKeys.snapshot];
      }

      const headers = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      };

      const [meResp, tierResp] = await Promise.allSettled([
        fetchJsonWithTimeout(`${CONFIG.apiUrl}/api/auth/me`, { method: 'GET', headers }, 8000),
        fetchJsonWithTimeout(`${CONFIG.apiUrl}/api/user/tier`, { method: 'GET', headers }, 8000),
      ]);

      let userPayload = null;
      if (meResp.status === 'fulfilled' && meResp.value.response.ok) {
        const body = meResp.value.data;
        userPayload = body?.data || body || null;
      }

      let quota = null;
      let tier = userPayload?.subscription_tier || 'free_2d';
      let mode = userPayload?.preferred_tryon_mode || '2d';
      if (tierResp.status === 'fulfilled' && tierResp.value.response.ok) {
        const tierBody = tierResp.value.data;
        const inner = tierBody?.data || tierBody || {};
        tier = inner.tier || tier;
        mode = inner.preferred_mode || mode;
        quota = inner.quota || null;
      }

      const snapshot = {
        user: userPayload
          ? {
              id: userPayload.id,
              email: userPayload.email,
              subscription_tier: tier,
              preferred_tryon_mode: mode,
              default_person_image_url: userPayload.default_person_image_url || null,
              default_person_smart_crop_url:
                userPayload.default_person_smart_crop_url || null,
              default_person_face_url: userPayload.default_person_face_url || null,
              default_person_uploaded_at:
                userPayload.default_person_uploaded_at || null,
            }
          : null,
        quota,
        fetchedAt: new Date().toISOString(),
      };

      await chrome.storage.local.set({
        [CONFIG.storageKeys.snapshot]: snapshot,
        [CONFIG.storageKeys.snapshotTimestamp]: Date.now(),
        [CONFIG.storageKeys.userTier]: tier,
        [CONFIG.storageKeys.userMode]: mode,
      });

      // Mirror onto the legacy badge/limit logic.
      try {
        const count = await getDailyCount();
        await updateBadge(count, mode);
      } catch (e) {
        // ignore
      }

      return snapshot;
    } catch (err) {
      console.warn('GradFiT SW: snapshot refresh failed', err);
      return null;
    } finally {
      snapshotInFlight = null;
    }
  })();

  return snapshotInFlight;
}

async function recordTryOnEvent(event) {
  if (!event || (!event.tryonId && !event.imageUrl)) return;
  try {
    const stored = await chrome.storage.local.get(CONFIG.storageKeys.recentTryons);
    const list = Array.isArray(stored[CONFIG.storageKeys.recentTryons])
      ? stored[CONFIG.storageKeys.recentTryons]
      : [];

    const idx = list.findIndex((item) => item.tryonId && item.tryonId === event.tryonId);
    const entry = {
      tryonId: event.tryonId || null,
      thumbnail: event.thumbnail || event.imageUrl || null,
      imageUrl: event.imageUrl || null,
      label: event.label || event.productTitle || '',
      sourceUrl: event.sourceUrl || '',
      status: event.status || 'pending',
      timestamp: event.timestamp || new Date().toISOString(),
    };
    if (idx >= 0) {
      list.splice(idx, 1);
    }
    list.unshift(entry);
    const trimmed = list.slice(0, CONFIG.recentTryonsLimit);
    await chrome.storage.local.set({
      [CONFIG.storageKeys.recentTryons]: trimmed,
    });
  } catch (err) {
    console.warn('GradFiT SW: recordTryOnEvent failed', err);
  }
}

// Refresh snapshot whenever the auth token flips (sign-in / sign-out).
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  if (changes[CONFIG.storageKeys.userToken]) {
    void fetchUserSnapshot(true);
  }
});

// Periodic refresh keeps tier/quota current even if popup is never opened.
chrome.alarms.create('gradfitRefreshSnapshot', {
  delayInMinutes: 1,
  periodInMinutes: 5,
});

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

        case 'quickTryOn':
          await handleQuickTryOn(request.metadata, sendResponse);
          break;

        case 'registerGarment':
          await handleRegisterGarment(request.metadata, sendResponse);
          break;

        case 'comboTryOn':
          await handleComboTryOn(request.metadata, sendResponse);
          break;

        case 'getRemainingTries':
          const count = await getDailyCount();
          const { mode } = await getActiveTierAndMode();
          const limit = await getCurrentLimit(mode);
          const remaining = Math.max(0, limit - count);
          sendResponse({
            success: true,
            remaining: remaining,
            total: limit,
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

        case 'refreshUserSnapshot': {
          const snap = await fetchUserSnapshot(Boolean(request.force));
          sendResponse({ success: true, snapshot: snap });
          break;
        }

        case 'getUserSnapshot': {
          const stored = await chrome.storage.local.get(CONFIG.storageKeys.snapshot);
          sendResponse({
            success: true,
            snapshot: stored[CONFIG.storageKeys.snapshot] || null,
          });
          break;
        }

        case 'recordTryOnEvent':
          await recordTryOnEvent(request.event || {});
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
      console.log('GradFiT extension installed');
      
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
      console.log('GradFiT extension updated to version', chrome.runtime.getManifest().version);
      
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
    const limit = await getCurrentLimit();
    const remaining = Math.max(0, limit - count);
    
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
void fetchUserSnapshot(true);

// Reset counter daily (also reset on startup)
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'resetDailyCounter') {
    await resetDailyCounterIfNeeded();
    await updateBadge();
  } else if (alarm.name === 'gradfitRefreshSnapshot') {
    await fetchUserSnapshot(true);
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

console.log('GradFiT background service worker loaded');
