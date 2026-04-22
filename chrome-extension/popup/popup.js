/* GradFiT popup script.
 *
 * Reads the cached `gradfit_user_snapshot` (written by background.js) and
 * `gradfit_recent_tryons` (written by content scripts when a try-on starts /
 * completes). Falls back to live API calls only if the snapshot is missing
 * so the popup feels instant when opened repeatedly.
 */

const CONFIG = {
  appUrl: "http://localhost:3000",
  apiUrl: "http://localhost:8000",
  storageKeys: {
    userToken: "tryon_user_token",
    snapshot: "gradfit_user_snapshot",
    recentTryons: "gradfit_recent_tryons",
  },
  maxRecent: 6,
};

let snapshot = null;
let unsubscribeStorage = null;

function $(id) {
  return document.getElementById(id);
}

function setText(id, value) {
  const el = $(id);
  if (el) el.textContent = value;
}

function tierLabel(tier) {
  switch (tier) {
    case "free_2d":
      return "Free";
    case "free_3d":
      return "Free 3D";
    case "premium_2d":
      return "Premium";
    case "premium_3d":
      return "Premium 3D";
    case "ultra":
      return "Ultra";
    case "business":
      return "Business";
    default:
      return tier ? tier.toUpperCase() : "Free";
  }
}

function tierLimit(tier, mode) {
  switch (tier) {
    case "free_3d":
      return mode === "3d" ? 2 : 0;
    case "premium_2d":
      return mode === "2d" ? 195 : 0;
    case "premium_3d":
      return mode === "3d" ? 180 : 0;
    case "ultra":
      return 365;
    case "business":
      return 9999;
    case "free_2d":
    default:
      return mode === "2d" ? 4 : 0;
  }
}

function formatTimeAgo(iso) {
  if (!iso) return "";
  const ts = new Date(iso).getTime();
  if (Number.isNaN(ts)) return "";
  const diff = Date.now() - ts;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

function showToast(message, tone = "info") {
  const toast = document.createElement("div");
  toast.className = "popup-toast";
  toast.dataset.tone = tone;
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 2400);
}

function applyAuth(state) {
  const dot = document.querySelector("#authPill .popup-dot");
  const label = $("authLabel");
  if (state === "signed_in") {
    if (dot) dot.dataset.state = "signed_in";
    if (label) label.textContent = snapshot?.user?.email || "Signed in";
  } else if (state === "signed_out") {
    if (dot) dot.dataset.state = "signed_out";
    if (label) label.textContent = "Sign in";
  } else {
    if (dot) dot.dataset.state = "loading";
    if (label) label.textContent = "Checking session...";
  }
}

function applyPhoto() {
  const avatar = $("savedPhotoAvatar");
  const label = $("photoLabel");
  const hint = $("photoHint");
  const quickTryBtn = $("quickTryBtn");
  if (!avatar || !label || !hint) return;

  const url =
    snapshot?.user?.default_person_smart_crop_url ||
    snapshot?.user?.default_person_image_url ||
    null;

  if (url) {
    avatar.dataset.hasPhoto = "true";
    avatar.innerHTML = "";
    const img = document.createElement("img");
    img.src = url;
    img.alt = "Saved photo";
    avatar.appendChild(img);
    label.textContent = "Saved photo ready";
    hint.textContent = "Quick Try is enabled on every product page.";
    if (quickTryBtn) quickTryBtn.disabled = false;
  } else {
    avatar.dataset.hasPhoto = "false";
    label.textContent = "No saved photo yet";
    hint.textContent = "Add one to enable Quick Try.";
    if (quickTryBtn) quickTryBtn.disabled = true;
  }
}

function applyQuota() {
  const tier = snapshot?.user?.subscription_tier || "free_2d";
  const mode = snapshot?.user?.preferred_tryon_mode || "2d";
  const quota = snapshot?.quota || null;

  setText("tierTag", tierLabel(tier));

  let used = quota?.used ?? 0;
  let limit = quota?.limit ?? tierLimit(tier, mode);
  const period = quota?.period || "today";

  if (limit <= 0) limit = 1; // avoid div by zero
  setText("quotaValue", `${used}/${limit === 9999 ? "Unlimited" : limit}`);

  const fill = $("quotaFill");
  if (fill) {
    const pct = Math.min(100, Math.max(0, (used / limit) * 100));
    fill.style.width = `${pct}%`;
  }

  const remaining = Math.max(0, limit - used);
  setText(
    "quotaHint",
    remaining === 0
      ? `${period} limit reached - upgrade to keep going.`
      : `${remaining} try-ons remaining ${period}.`
  );

  const upgradeCard = $("upgradeCard");
  if (upgradeCard) {
    const isFree = tier === "free_2d" || tier === "free_3d";
    upgradeCard.style.display = isFree ? "" : "none";
  }
}

function applyRecent(items) {
  const grid = $("recentGrid");
  const empty = $("recentEmpty");
  if (!grid) return;
  // Remove all non-empty children
  Array.from(grid.querySelectorAll(".popup-recent__item")).forEach((n) => n.remove());

  if (!items || items.length === 0) {
    if (empty) empty.style.display = "";
    return;
  }

  if (empty) empty.style.display = "none";
  items.slice(0, CONFIG.maxRecent).forEach((item) => {
    const node = document.createElement("button");
    node.type = "button";
    node.className = "popup-recent__item";
    node.title = item.label || "Open try-on";

    const img = document.createElement("img");
    img.src = item.thumbnail || item.imageUrl || "";
    img.alt = item.label || "Try-on";
    img.onerror = () => {
      img.style.display = "none";
    };
    node.appendChild(img);

    const overlay = document.createElement("div");
    overlay.className = "popup-recent__overlay";
    const labelSpan = document.createElement("span");
    labelSpan.textContent = item.status === "completed" ? "Done" : item.status || "";
    const timeSpan = document.createElement("span");
    timeSpan.textContent = formatTimeAgo(item.timestamp);
    overlay.appendChild(labelSpan);
    overlay.appendChild(timeSpan);
    node.appendChild(overlay);

    node.addEventListener("click", () => {
      const target = item.tryonId
        ? `${CONFIG.appUrl}/?tryon=${item.tryonId}`
        : `${CONFIG.appUrl}/`;
      chrome.tabs.create({ url: target });
    });

    grid.appendChild(node);
  });
}

async function loadSnapshot() {
  try {
    const stored = await chrome.storage.local.get([
      CONFIG.storageKeys.snapshot,
      CONFIG.storageKeys.recentTryons,
      CONFIG.storageKeys.userToken,
    ]);
    snapshot = stored[CONFIG.storageKeys.snapshot] || null;
    const recents = stored[CONFIG.storageKeys.recentTryons] || [];
    const token = stored[CONFIG.storageKeys.userToken];

    if (!token) {
      applyAuth("signed_out");
    } else if (snapshot?.user) {
      applyAuth("signed_in");
    } else {
      applyAuth("loading");
    }

    applyPhoto();
    applyQuota();
    applyRecent(recents);

    // Ask the background SW to refresh the snapshot in the background so
    // we always show the latest tier/quota/photo without blocking the UI.
    if (token) {
      try {
        chrome.runtime.sendMessage({ action: "refreshUserSnapshot" });
      } catch (err) {
        // SW may be asleep; harmless.
      }
    }
  } catch (err) {
    console.error("GradFiT popup: failed to load snapshot", err);
  }
}

function bindStorageListener() {
  if (unsubscribeStorage) return;
  const handler = (changes, area) => {
    if (area !== "local") return;
    if (changes[CONFIG.storageKeys.snapshot]) {
      snapshot = changes[CONFIG.storageKeys.snapshot].newValue || null;
      applyAuth(snapshot?.user ? "signed_in" : "signed_out");
      applyPhoto();
      applyQuota();
    }
    if (changes[CONFIG.storageKeys.recentTryons]) {
      applyRecent(changes[CONFIG.storageKeys.recentTryons].newValue || []);
    }
    if (changes[CONFIG.storageKeys.userToken] && !changes[CONFIG.storageKeys.userToken].newValue) {
      snapshot = null;
      applyAuth("signed_out");
      applyPhoto();
      applyQuota();
    }
  };
  chrome.storage.onChanged.addListener(handler);
  unsubscribeStorage = () => chrome.storage.onChanged.removeListener(handler);
}

function bindActions() {
  $("managePhotoBtn")?.addEventListener("click", () => {
    chrome.tabs.create({ url: `${CONFIG.appUrl}/?settings=photo` });
  });

  $("openAppBtn")?.addEventListener("click", () => {
    chrome.tabs.create({ url: CONFIG.appUrl });
  });

  $("viewAllBtn")?.addEventListener("click", () => {
    chrome.tabs.create({ url: `${CONFIG.appUrl}/?tab=history` });
  });

  $("pricingBtn")?.addEventListener("click", () => {
    chrome.tabs.create({ url: `${CONFIG.appUrl}/#pricing` });
  });

  $("settingsBtn")?.addEventListener("click", () => {
    chrome.tabs.create({ url: `${CONFIG.appUrl}/?settings=true` });
  });

  $("helpBtn")?.addEventListener("click", () => {
    chrome.tabs.create({ url: `${CONFIG.appUrl}/help` });
  });

  $("authPill")?.addEventListener("click", async () => {
    const stored = await chrome.storage.local.get(CONFIG.storageKeys.userToken);
    if (!stored[CONFIG.storageKeys.userToken]) {
      chrome.tabs.create({ url: `${CONFIG.appUrl}/login` });
    }
  });

  $("quickTryBtn")?.addEventListener("click", async () => {
    const btn = $("quickTryBtn");
    if (!btn) return;
    btn.disabled = true;
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) {
        showToast("No active tab", "error");
        return;
      }
      const response = await chrome.tabs.sendMessage(tab.id, {
        action: "gradfitTryThisPage",
      });
      if (response?.ok) {
        showToast("Try-on started", "success");
        window.close();
      } else {
        showToast(response?.error || "No garment found on this page", "error");
      }
    } catch (err) {
      showToast("Open a supported product page first", "error");
    } finally {
      btn.disabled = !snapshot?.user?.default_person_image_url;
    }
  });
}

async function init() {
  bindActions();
  bindStorageListener();
  await loadSnapshot();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}

window.addEventListener("beforeunload", () => {
  if (unsubscribeStorage) unsubscribeStorage();
});
