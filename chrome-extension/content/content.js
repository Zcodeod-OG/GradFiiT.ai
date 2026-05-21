// ============================================================
// GradFiT Chrome Extension - Content Script
// Enhanced garment detection + Quick Try-On Sidebar
// ============================================================
(function () {
  'use strict';

  var CONFIG = {
    minImageSize: 120, minDisplaySize: 80, debounceDelay: 300,
    duplicateCheckWindow: 5000, clickAnimationDuration: 900,
    detectionThreshold: 4, maxScanDepth: 10,
    appUrl: (globalThis.GRADFIT_CONFIG && globalThis.GRADFIT_CONFIG.appUrl) || 'http://localhost:3000',
    maxSidebarGarments: 10, maxHistoryItems: 20,
    // Must comfortably exceed the SW's 180s poll window in background.js
    // (Fashn's own max_wait is also 180s). 210s gives ~30s headroom for
    // the final sendResponse round-trip so we never cut the SW off early.
    quickTryOnTimeoutMs: 210000,
  };

  var imageOverlays = new Map();
  var observer = null;
  var duplicateCheckMap = new Map();
  var quickPreviewCache = new Map();
  var quickPreviewInFlight = new Map();
  var intersectionObserver = null;
  var intersectionMutationObserver = null;
  var initDone = false;
  var spaCheckInterval = null;
  var contextInvalidated = false;

  // ------------------------------------------------------------------
  // Extension-context survival helpers
  //
  // When the user reloads the extension in chrome://extensions, every
  // content script already injected into pages loses access to the
  // runtime (chrome.runtime.id becomes undefined). Any subsequent
  // chrome.* call throws "Extension context invalidated" and, if left
  // inside a setInterval, floods the console. We detect the situation
  // once and then short-circuit every API call + tear down our timers
  // and observers so the page stays quiet.
  // ------------------------------------------------------------------
  function isExtensionContextValid() {
    try {
      return !!(typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id);
    } catch (_e) {
      return false;
    }
  }

  function markContextInvalidated() {
    if (contextInvalidated) return;
    contextInvalidated = true;
    try { cleanup(); } catch (_e) {}
    if (spaCheckInterval) { try { clearInterval(spaCheckInterval); } catch (_e) {} spaCheckInterval = null; }
  }

  function safeSendMessage(payload, callback) {
    if (!isExtensionContextValid()) {
      markContextInvalidated();
      if (typeof callback === 'function') {
        try { callback({ success: false, error: 'Extension was reloaded. Refresh this tab to use GradFiT again.' }); } catch (_e) {}
      }
      return false;
    }
    try {
      chrome.runtime.sendMessage(payload, function (response) {
        if (chrome.runtime.lastError) {
          var msg = chrome.runtime.lastError.message || '';
          if (msg.indexOf('context invalidated') !== -1 || msg.indexOf('Receiving end does not exist') !== -1) {
            markContextInvalidated();
          }
          if (typeof callback === 'function') {
            try { callback({ success: false, error: msg || 'Extension message failed' }); } catch (_e) {}
          }
          return;
        }
        if (typeof callback === 'function') {
          try { callback(response); } catch (_e) {}
        }
      });
      return true;
    } catch (err) {
      var emsg = (err && err.message) || '';
      if (emsg.indexOf('context invalidated') !== -1) {
        markContextInvalidated();
      }
      if (typeof callback === 'function') {
        try { callback({ success: false, error: emsg || 'Extension message failed' }); } catch (_e) {}
      }
      return false;
    }
  }

  function safeStorageSet(obj) {
    if (!isExtensionContextValid()) return;
    try { chrome.storage.local.set(obj); } catch (_e) { markContextInvalidated(); }
  }
  function safeStorageRemove(key) {
    if (!isExtensionContextValid()) return;
    try { chrome.storage.local.remove(key); } catch (_e) { markContextInvalidated(); }
  }
  function safeStorageGet(key, cb) {
    if (!isExtensionContextValid()) { if (typeof cb === 'function') cb({}); return; }
    try { chrome.storage.local.get(key, cb); } catch (_e) { markContextInvalidated(); if (typeof cb === 'function') cb({}); }
  }

  // Cached "active" app URL — the origin the JWT was last synced from.
  // Lets the in-page sidebar's "Open app" / "Full try-on" fallbacks
  // route to the user's actual environment (localhost vs production)
  // even when this content script is running on a third-party retailer
  // page that has no notion of which backend the extension targets.
  var _activeAppUrl = CONFIG.appUrl;
  function refreshActiveAppUrl() {
    safeStorageGet('gradfit_active_app_url', function(stored) {
      var pinned = stored && stored.gradfit_active_app_url;
      if (typeof pinned === 'string' && pinned) {
        _activeAppUrl = pinned.replace(/\/$/, '');
      }
    });
  }
  function activeAppUrl() {
    return _activeAppUrl || CONFIG.appUrl;
  }
  // Pick up the pinned URL on script boot and again whenever it changes
  // (covers the "sign in flips us from prod to localhost in another
  // tab" case while this content script is already running).
  refreshActiveAppUrl();
  if (isExtensionContextValid()) {
    try {
      chrome.storage.onChanged.addListener(function(changes, area) {
        if (area !== 'local') return;
        if (changes.gradfit_active_app_url) refreshActiveAppUrl();
      });
    } catch (_e) { /* SW may be tearing down; harmless */ }
  }

  var GARMENT_WORDS = ['dress','shirt','blouse','top','tee','t-shirt','tshirt','pants','trousers','jeans','denim','chinos','slacks','jacket','coat','blazer','cardigan','vest','sweater','sweatshirt','hoodie','pullover','jumper','skirt','shorts','suit','tuxedo','gown','romper','jumpsuit','overalls','leggings','tights','joggers','tracksuit','polo','henley','tank','camisole','bodysuit','kimono','kaftan','tunic','poncho','cape','parka','anorak','windbreaker','raincoat','trench','bikini','swimsuit','swimwear','lingerie','pajamas','robe','loungewear','activewear','sportswear','uniform','saree','sari','kurta','kurti','lehenga','salwar','abaya','hijab','dupatta','churidar'];
  var FOOTWEAR_WORDS = ['shoes','boots','sneakers','sandals','heels','flats','loafers','moccasins','oxfords','pumps','wedges','slippers','espadrilles','mules','clogs','trainers'];
  var ACCESSORY_WORDS = ['bag','handbag','purse','clutch','backpack','tote','hat','cap','beanie','scarf','gloves','belt','watch','jewelry','necklace','bracelet','earrings','sunglasses','tie','wallet','socks'];
  var FASHION_WORDS = ['clothing','apparel','fashion','wear','outfit','attire','garment','wardrobe','collection','style','look','product','item','model','catalog','menswear','womenswear','kidswear','unisex','designer','couture','new arrival','bestseller'];
  var MATERIAL_WORDS = ['cotton','silk','linen','wool','cashmere','polyester','nylon','leather','suede','velvet','satin','chiffon','denim','tweed','fleece','jersey','mesh','lace'];
  var SIZE_WORDS = ['size','small','medium','large','xl','xxl','xs','regular','slim','relaxed','oversized','petite','plus size','fit','tailored'];

  var SITE_ADAPTERS = {
    'amazon': ['#imgTagWrapperId img','#landingImage','.a-dynamic-image','#main-image-container img','.imgTagWrapper img','#imageBlock img','.s-image'],
    'zara': ['.media-image img','.product-detail-image img','.product-grid-image img'],
    'hm.com': ['.product-image img','.product-detail-main-image img','img.product-item-image'],
    'asos': ['img[data-testid="product-img"]','.gallery-image img','#product-img img'],
    'nordstrom': ['.product-photo img','img[data-testid="product-image"]','.image-container img'],
    'uniqlo': ['.product-image img','.pdp-image img','.fr-ec-product-image img'],
    'nike': ['img[data-testid="product-image"]','.product-card__hero-image img','#pdp_6up img'],
    'adidas': ['.product-gallery img','.glass-product-card__asset img'],
    'shein': ['.product-intro__head-img img','.crop-image-container img','.S-product-item__img img'],
    'myntra': ['.image-grid-image','.product-image img','.image-grid-imageContainer img'],
    'flipkart': ['._396cs4','._2r_T1I img','.CXW8mj img','._1AtVbE img'],
    'ajio': ['.rilrtl-products-list__item img','.zoom-image img'],
    'gap': ['.product-image img','.cat-product-image img'],
    'mango': ['.product-image img','.image-container img'],
    'forever21': ['.product-image img','.product-tile__image img'],
    'shopify': ['.product__media img','.product-single__photo img','.product-featured-media img','.product__image img'],
    'woocommerce': ['.woocommerce-product-gallery img','.wp-post-image','.attachment-woocommerce_single img'],
  };

  var PRODUCT_IMAGE_SELECTORS = [
    '.product-image img','.product-img img','.product-photo img','.product-media img',
    '.product-gallery img','.product-image-container img','.product-detail-image img',
    '.product-main-image img','.product-hero-image img',
    '[class*="ProductImage"] img','[class*="product-image"] img','[class*="productImage"] img',
    '[class*="product-photo"] img','[class*="product-img"] img','[class*="product-media"] img',
    '[class*="product-gallery"] img','[class*="product-detail"] img','[class*="product-card"] img',
    '[class*="productCard"] img','[class*="product-tile"] img','[class*="item-image"] img',
    '[class*="catalog-image"] img','[class*="merchandise"] img','[class*="garment"] img',
    '[class*="clothing"] img','[class*="fashion"] img','[class*="apparel"] img',
    '[data-testid*="product-image"]','[data-testid*="product-img"]','[data-testid*="gallery-image"]',
    '[data-product-image]','[data-image-id]','[data-item-image]',
    '[data-zoom-image]','[data-large-image]','[data-full-image]',
    '[itemprop="image"]','[itemtype*="Product"] img',
    '.gallery-image img','.carousel-image img','.swiper-slide img','.slick-slide img','.owl-item img',
    '.woocommerce-product-gallery img',
    'img[alt*="product" i]','img[alt*="clothing" i]','img[alt*="dress" i]','img[alt*="shirt" i]',
    'img[alt*="apparel" i]','img[alt*="fashion" i]','img[alt*="outfit" i]','img[alt*="wear" i]',
    'img[alt*="jacket" i]','img[alt*="pants" i]','img[alt*="skirt" i]','img[alt*="shoes" i]',
    'img[alt*="sweater" i]','img[alt*="coat" i]','img[alt*="jeans" i]','img[alt*="hoodie" i]',
    'img[alt*="sneaker" i]','img[alt*="model wearing" i]',
    '.product img','.product-item img','.product-card img','.product-tile img',
    '.main-image img','.primary-image img','.featured-image img',
    '.listing-image img','.catalog-image img','.collection-item img','.shop-item img',
    'img[data-src]','img[data-lazy-src]','img.lazyload','img.lazy','img[loading="lazy"]','picture img',
  ];

  var EXCLUSION_PATTERNS = /logo|icon|sprite|banner|advertisement|social|share|avatar|profile-pic|rating|stars|payment|trust-badge|breadcrumb|pagination|newsletter|cookie|consent|favicon|placeholder|spacer|pixel|tracking|analytics/i;

  // ═══════════════════════════════════════════════════════════
  // UTILITIES
  // ═══════════════════════════════════════════════════════════
  function getImageUrl(img) {
    try {
      var ds = img.dataset || {};
      var lazy = ds.src || ds.lazySrc || ds.original || ds.largeSrc || ds.zoomImage || ds.highRes || null;
      if (lazy && lazy.trim() && !lazy.startsWith('data:')) return lazy.trim();
      if (img.srcset) {
        var parts = img.srcset.split(',').map(function(s) { var p = s.trim().split(/\s+/); return { url: p[0], sz: parseInt(p[1]) || 0 }; });
        parts.sort(function(a, b) { return b.sz - a.sz; });
        if (parts[0] && parts[0].url) return parts[0].url;
      }
      if (img.currentSrc && !img.currentSrc.startsWith('data:')) return img.currentSrc;
      if (img.src && !img.src.startsWith('data:')) return img.src;
      var pic = img.closest('picture');
      if (pic) { var s = pic.querySelector('source'); if (s && s.srcset) return s.srcset.split(',')[0].trim().split(/\s+/)[0]; }
      return img.src || '';
    } catch (e) { return img.src || ''; }
  }

  function normalizeImageUrl(url) {
    try { var u = new URL(url, window.location.origin); var p = new URLSearchParams(); u.searchParams.forEach(function(v, k) { if (['w','h','width','height'].indexOf(k.toLowerCase()) !== -1) p.set(k, v); }); u.search = p.toString(); return u.href; } catch (e) { return url.split('?')[0]; }
  }

  function isDuplicateImage(url) {
    var n = normalizeImageUrl(url);
    if (duplicateCheckMap.has(n) && Date.now() - duplicateCheckMap.get(n) < CONFIG.duplicateCheckWindow) return true;
    return false;
  }

  function debounce(fn, wait) { var t; return function() { var a = arguments, c = this; clearTimeout(t); t = setTimeout(function() { fn.apply(c, a); }, wait); }; }

  function applySidebarTheme(_force) {
    /* Fixed light theme in overlay.css — matches gradfit.tech, not retailer pages. */
  }

  function isExcludedImage(img) {
    var el = img;
    for (var i = 0; i < 5 && el; i++) {
      var cn = (el.className || '').toString(), id = el.id || '', tag = (el.tagName || '').toLowerCase();
      if (EXCLUSION_PATTERNS.test(cn) || EXCLUSION_PATTERNS.test(id)) return true;
      if (i > 0 && (tag === 'nav' || tag === 'footer' || tag === 'header')) return true;
      el = el.parentElement;
    }
    var w = img.naturalWidth || img.width || 0, h = img.naturalHeight || img.height || 0;
    if (w < 50 || h < 50) return true;
    var src = (img.src || '').toLowerCase();
    if (/logo|icon|sprite|pixel|tracking|spacer|placeholder\.(gif|png|svg)|1x1|blank\./.test(src)) return true;
    return false;
  }

  // ═══════════════════════════════════════════════════════════
  // IMAGE SCORING
  // ═══════════════════════════════════════════════════════════
  function scoreImage(img) {
    var score = 0, w = img.naturalWidth || img.width || 0, h = img.naturalHeight || img.height || 0, rect = img.getBoundingClientRect();
    if (w < CONFIG.minImageSize || h < CONFIG.minImageSize) return -100;
    if (rect.width < CONFIG.minDisplaySize || rect.height < CONFIG.minDisplaySize) return -100;
    if (isExcludedImage(img)) return -100;

    if (w >= 200 && h >= 200) score += 2;
    if (w >= 400 && h >= 400) score += 2;
    if (w >= 600 && h >= 600) score += 1;
    if (rect.width >= 200 && rect.height >= 200) score += 1;

    var ar = w / h;
    if (ar >= 0.5 && ar <= 0.85) score += 3;
    else if (ar >= 0.85 && ar <= 1.15) score += 2;
    else if (ar >= 1.15 && ar <= 1.5) score += 1;
    else score -= 1;

    var altText = ((img.alt || '') + ' ' + (img.title || '')).toLowerCase();
    if (altText.length > 0) {
      var as = 0;
      var wls = [{w: GARMENT_WORDS, p: 4},{w: FOOTWEAR_WORDS, p: 3},{w: FASHION_WORDS, p: 2},{w: MATERIAL_WORDS, p: 2},{w: SIZE_WORDS, p: 1},{w: ACCESSORY_WORDS, p: 1}];
      for (var wl = 0; wl < wls.length && as === 0; wl++) { for (var wi = 0; wi < wls[wl].w.length; wi++) { if (altText.indexOf(wls[wl].w[wi]) !== -1) { as += wls[wl].p; break; } } }
      var mc = 0; var aw = GARMENT_WORDS.concat(FASHION_WORDS, MATERIAL_WORDS);
      for (var i = 0; i < aw.length && mc < 3; i++) { if (altText.indexOf(aw[i]) !== -1) mc++; }
      if (mc >= 2) as += 2;
      score += Math.min(as, 8);
    }

    var src = (getImageUrl(img) || '').toLowerCase(), pageUrl = window.location.href.toLowerCase();
    var up = [/\/product/i,/\/item/i,/\/catalog/i,/\/collection/i,/\/shop\//i,/\/clothing/i,/\/fashion/i,/\/apparel/i,/\/wear/i,/\/men\//i,/\/women\//i,/\/kids\//i,/\/dress/i,/\/shirt/i,/\/pants/i,/\/jacket/i,/\/shoes/i,/pdp/i,/plp/i];
    var us = 0;
    for (var i = 0; i < up.length; i++) { if (up[i].test(src)) us += 2; if (up[i].test(pageUrl)) us += 1; }
    score += Math.min(us, 6);

    var cs = 0, el = img.parentElement;
    for (var d = 0; d < CONFIG.maxScanDepth && el; d++) {
      var cn = ((el.className || '') + '').toLowerCase(), id = (el.id || '').toLowerCase(), cb = cn + ' ' + id;
      if (/product|item|catalog|listing|merchandise|garment|clothing|fashion|apparel/.test(cb)) cs += 3;
      if (/gallery|carousel|slider|swiper|slideshow|zoom/.test(cb)) cs += 2;
      if (/card|tile|grid-item|list-item/.test(cb)) cs += 1;
      if (/shop|store|buy|cart|price|add-to/.test(cb)) cs += 2;
      if ((el.getAttribute('itemtype') || '').indexOf('Product') !== -1) cs += 5;
      if ((el.getAttribute('itemprop') || '').indexOf('image') !== -1) cs += 4;
      if (el.dataset) { try { var ds = JSON.stringify(el.dataset).toLowerCase(); if (/product|item|sku|variant/.test(ds)) cs += 2; } catch(e) {} }
      el = el.parentElement;
    }
    score += Math.min(cs, 12);

    var ctr = findProductContainer(img);
    if (ctr) {
      var ct = ctr.textContent || '';
      if (/[$\u20AC\u00A3\u00A5\u20B9]\s*[\d,]+\.?\d*/.test(ct)) score += 4;
      var btns = ctr.querySelectorAll('button, [role="button"], a.btn, .button');
      for (var i = 0; i < btns.length; i++) { if (/add to (cart|bag|basket)|buy now|shop now|purchase/.test((btns[i].textContent || '').toLowerCase())) { score += 4; break; } }
      if (ctr.querySelector('[class*="size"], [data-size], select[name*="size"]')) score += 3;
      if (ctr.querySelector('[class*="color"], [class*="swatch"], [data-color]')) score += 2;
    }

    var ogT = document.querySelector('meta[property="og:type"]');
    if (ogT && ogT.content && ogT.content.indexOf('product') !== -1) score += 3;
    var jlds = document.querySelectorAll('script[type="application/ld+json"]');
    for (var i = 0; i < jlds.length; i++) { try { var jd = JSON.parse(jlds[i].textContent); if (jd['@type'] === 'Product' || (Array.isArray(jd['@graph']) && jd['@graph'].some(function(x) { return x['@type'] === 'Product'; }))) { score += 4; break; } } catch(e) {} }

    var vw = window.innerWidth, cx = rect.left + rect.width / 2;
    if (cx > vw * 0.15 && cx < vw * 0.85) score += 1;
    if (rect.top < window.innerHeight * 2) score += 1;

    var fn = (src.split('/').pop() || '').split('?')[0].toLowerCase();
    if (/front|model|wear|look|outfit|product|main|hero|primary/.test(fn)) score += 2;

    return score;
  }

  function findProductContainer(img) {
    var el = img.closest('.product, .product-item, .product-card, [class*="product"], [data-product-id], [itemtype*="Product"], .product-detail, .pdp-container');
    if (el) return el;
    el = img.parentElement;
    for (var i = 0; i < CONFIG.maxScanDepth && el; i++) { var cn = ((el.className || '') + '').toLowerCase(); if (/product|item|listing|card|tile/.test(cn)) return el; el = el.parentElement; }
    return null;
  }

  // ═══════════════════════════════════════════════════════════
  // METADATA EXTRACTION
  // ═══════════════════════════════════════════════════════════
  function extractProductMetadata(img) {
    var md = { imageUrl: getImageUrl(img), title: '', price: '', brand: '', url: window.location.href };
    try {
      var ctr = findProductContainer(img);
      if (!ctr) { var el = img.parentElement; for (var i = 0; i < CONFIG.maxScanDepth && el; i++) { if (((el.className || '') + '').toLowerCase().indexOf('product') !== -1) { ctr = el; break; } el = el.parentElement; } }
      if (ctr) {
        var ts = ['h1','h2','h3','.product-title','.product-name','[itemprop="name"]','[class*="product-title"]','[class*="product-name"]'];
        for (var i = 0; i < ts.length; i++) { var t = ctr.querySelector(ts[i]); if (t) { md.title = t.textContent.trim(); break; } }
        var ps = ['.price','.product-price','[class*="price"]','[itemprop="price"]','[data-price]'];
        for (var i = 0; i < ps.length; i++) { var p = ctr.querySelector(ps[i]); if (p) { var m = p.textContent.trim().match(/[$\u20AC\u00A3\u00A5\u20B9]\s*[\d,]+\.?\d*/); if (m) { md.price = m[0]; break; } } }
        var bs = ['.brand','.product-brand','[itemprop="brand"]','[class*="brand"]'];
        for (var i = 0; i < bs.length; i++) { var b = ctr.querySelector(bs[i]); if (b) { md.brand = b.textContent.trim() || b.getAttribute('data-brand') || ''; if (md.brand) break; } }
      }
      if (!md.title) { var h = document.querySelector('h1, [itemprop="name"]'); if (h) md.title = h.textContent.trim(); }
      if (!md.title) { var og = document.querySelector('meta[property="og:title"]'); if (og) md.title = og.content || ''; }
      if (!md.title && img.alt) md.title = img.alt.trim();
    } catch (e) {}
    return md;
  }

  // ═══════════════════════════════════════════════════════════
  // STYLE-MATCH HIGHLIGHT  (closet-aware "you should try this" hint)
  // ═══════════════════════════════════════════════════════════
  //
  // For every product image we already detect, score it against the
  // cached closet style profile (palette + categories + keywords) from
  // the service worker. When the score crosses a threshold we wrap the
  // image with a brand-colored animated glow and a "Recommended for you"
  // pill (top-left). Glow is always on; pill lifts slightly on hover.
  // Distinct from the bottom Try-on CTA so the two don't overlap.
  //
  // Matching is keyword-only by design: alt text + image URL path +
  // immediate parent text vs the profile's keywords / categories /
  // garment_types. No canvas color sampling (avoids CORS), no per-
  // image API calls (avoids latency).

  var styleProfileState = {
    profile: null,
    enabled: true,
    fetched: false,
    fetchInFlight: false,
  };
  var styleHighlights = new Map(); // img → wrapper element
  var STYLE_MATCH_THRESHOLD = 2;   // tune by feel

  function requestStyleProfile() {
    if (styleProfileState.fetched || styleProfileState.fetchInFlight) return;
    styleProfileState.fetchInFlight = true;
    safeSendMessage({ action: 'getStyleProfile' }, function(resp) {
      styleProfileState.fetchInFlight = false;
      styleProfileState.fetched = true;
      if (!resp || !resp.success) return;
      styleProfileState.profile = resp.profile || null;
      styleProfileState.enabled =
        resp.enabled === undefined ? true : Boolean(resp.enabled);
      // Re-pass over any images we've already decorated with try-on
      // buttons so the highlight can apply now that the profile is
      // here. Keep it cheap: iterate the existing imageOverlays map.
      try {
        imageOverlays.forEach(function(_, img) { mountStyleHighlight(img); });
      } catch (_e) {}
    });
  }

  function _styleTokens(text) {
    if (!text) return [];
    var out = [];
    var re = /[a-z0-9]{3,}/g;
    var m;
    var lower = String(text).toLowerCase();
    while ((m = re.exec(lower)) !== null) out.push(m[0]);
    return out;
  }

  function _imageContextTokens(img) {
    var bag = [];
    try {
      if (img.alt) bag = bag.concat(_styleTokens(img.alt));
      var src = getImageUrl(img) || '';
      try {
        var path = new URL(src, location.href).pathname || '';
        bag = bag.concat(_styleTokens(path.replace(/[\-_/]+/g, ' ')));
      } catch (_e) {}
      var p = img.parentElement;
      if (p && p.textContent) {
        bag = bag.concat(_styleTokens(p.textContent.slice(0, 200)));
      }
      var t = img.getAttribute && img.getAttribute('title');
      if (t) bag = bag.concat(_styleTokens(t));
    } catch (_e) {}
    return bag;
  }

  function scoreStyleMatch(img, profile) {
    if (!profile) return 0;
    var tokens = _imageContextTokens(img);
    if (!tokens.length) return 0;
    var set = Object.create(null);
    for (var i = 0; i < tokens.length; i++) set[tokens[i]] = true;
    var score = 0;
    // Keyword overlap (most discriminating signal — these are words
    // the user has explicitly used in their own closet).
    var kws = Array.isArray(profile.keywords) ? profile.keywords : [];
    for (var k = 0; k < kws.length; k++) {
      if (set[String(kws[k]).toLowerCase()]) score += 1;
    }
    // Category match (free-form labels from the user).
    var cats = Array.isArray(profile.categories) ? profile.categories : [];
    for (var c = 0; c < cats.length; c++) {
      var name = (cats[c] && cats[c].name) || '';
      var catTokens = _styleTokens(name);
      for (var j = 0; j < catTokens.length; j++) {
        if (set[catTokens[j]]) { score += 1.5; break; }
      }
    }
    // garment_type hint: rough mapping from a few canonical words to
    // the type buckets. We score if any token matches one of the
    // types the user actually has.
    var typeMap = {
      upper_body: ['shirt','top','blouse','tee','tshirt','sweater','hoodie','cardigan'],
      lower_body: ['pants','trousers','jeans','shorts','skirt','leggings'],
      full_body: ['dress','jumpsuit','romper','gown'],
      outerwear: ['jacket','coat','blazer','parka','vest'],
      accessory: ['bag','hat','cap','belt','scarf','shoes','sneaker','boots'],
    };
    var types = profile.garment_types || {};
    Object.keys(typeMap).forEach(function(typeKey) {
      if (!types[typeKey]) return;
      var words = typeMap[typeKey];
      for (var w = 0; w < words.length; w++) {
        if (set[words[w]]) { score += 1; break; }
      }
    });
    return score;
  }

  function mountStyleHighlight(img) {
    if (!styleProfileState.enabled) return;
    if (styleHighlights.has(img)) return;
    var profile = styleProfileState.profile;
    if (!profile || !profile.total_items) return;
    var score = scoreStyleMatch(img, profile);
    if (score < STYLE_MATCH_THRESHOLD) return;

    try {
      var wrapper = ensurePositionedParent(img);
      if (!wrapper) return;

      // Soft glow outline that sits behind the image but in front of
      // the page background. Use an absolutely-positioned div so we
      // never touch the retailer's image element.
      var glow = document.createElement('div');
      glow.className = 'tryon-ai-style-glow';
      glow.setAttribute('aria-hidden', 'true');

      var pill = document.createElement('div');
      pill.className = 'tryon-ai-style-pill';
      pill.setAttribute('role', 'note');
      pill.innerHTML =
        '<span class="tryon-ai-style-pill__spark" aria-hidden="true"></span>' +
        '<span class="tryon-ai-style-pill__text">Recommended for you</span>';

      function showPill() {
        pill.classList.add('tryon-ai-style-pill--emphasis');
        glow.classList.add('tryon-ai-style-glow--emphasis');
      }
      function hidePill() {
        pill.classList.remove('tryon-ai-style-pill--emphasis');
        glow.classList.remove('tryon-ai-style-glow--emphasis');
      }
      img.addEventListener('mouseenter', showPill);
      img.addEventListener('mouseleave', hidePill);

      wrapper.appendChild(glow);
      wrapper.appendChild(pill);
      styleHighlights.set(img, { wrapper: wrapper, glow: glow, pill: pill, showPill: showPill, hidePill: hidePill });
    } catch (err) {
      console.warn('[GradFiT] style highlight error:', err);
    }
  }

  function clearAllStyleHighlights() {
    styleHighlights.forEach(function(rec, img) {
      try {
        if (rec.glow && rec.glow.parentNode) rec.glow.parentNode.removeChild(rec.glow);
        if (rec.pill && rec.pill.parentNode) rec.pill.parentNode.removeChild(rec.pill);
        if (img && rec.showPill) img.removeEventListener('mouseenter', rec.showPill);
        if (img && rec.hidePill) img.removeEventListener('mouseleave', rec.hidePill);
      } catch (_e) {}
    });
    styleHighlights.clear();
  }

  // Listen for toggle changes from the popup so users can flip the
  // feature on/off without reloading the page.
  try {
    chrome.storage.onChanged.addListener(function(changes, area) {
      if (area !== 'local') return;
      if (changes.gradfit_style_highlights_enabled) {
        styleProfileState.enabled = changes.gradfit_style_highlights_enabled.newValue !== false;
        if (!styleProfileState.enabled) {
          clearAllStyleHighlights();
        } else {
          // Re-run highlight pass on already-decorated images.
          imageOverlays.forEach(function(_, img) { mountStyleHighlight(img); });
        }
      }
      if (changes.gradfit_style_profile) {
        styleProfileState.profile = changes.gradfit_style_profile.newValue || null;
        // Re-decorate visible items with the fresh profile.
        clearAllStyleHighlights();
        imageOverlays.forEach(function(_, img) { mountStyleHighlight(img); });
      }
    });
  } catch (_e) {}

  // ═══════════════════════════════════════════════════════════
  // BUTTON CREATION
  // ═══════════════════════════════════════════════════════════
  function getExtensionAssetUrl(relativePath) {
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL) {
      return chrome.runtime.getURL(relativePath);
    }
    return relativePath;
  }

  function buildGradfitCtaMarkup() {
    var iconUrl = getExtensionAssetUrl('assets/icon-48.png');
    return (
      '<span class="tryon-ai-cta__badge" aria-hidden="true">' +
        '<img class="tryon-ai-cta__badge-img" src="' + iconUrl + '" alt="" width="14" height="14" />' +
      '</span>' +
      '<span class="tryon-ai-cta__label">Try on</span>'
    );
  }

  function createGradfitCtaButton(onClick) {
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'tryon-ai-cta';
    btn.setAttribute('aria-label', 'Try on with GradFiT');
    btn.innerHTML = buildGradfitCtaMarkup();
    btn.addEventListener('click', onClick);
    return btn;
  }

  function mountOverlayOnElement(targetEl, onCtaClick) {
    var overlay = document.createElement('div');
    overlay.className = 'tryon-ai-overlay';
    overlay.style.cssText =
      'position:absolute;bottom:10px;left:50%;transform:translateX(-50%) translateY(6px);' +
      'z-index:999998;pointer-events:all;opacity:0;transition:opacity .25s ease,transform .25s ease;';

    var btn = createGradfitCtaButton(onCtaClick);
    overlay.appendChild(btn);

    var ht = null;
    function show() {
      clearTimeout(ht);
      overlay.style.opacity = '1';
      overlay.style.transform = 'translateX(-50%) translateY(0)';
    }
    function hide() {
      clearTimeout(ht);
      ht = setTimeout(function() {
        overlay.style.opacity = '0';
        overlay.style.transform = 'translateX(-50%) translateY(6px)';
      }, 150);
    }
    targetEl.addEventListener('mouseenter', show);
    targetEl.addEventListener('mouseleave', hide);
    overlay.addEventListener('mouseenter', show);
    overlay.addEventListener('mouseleave', hide);

    return { overlay: overlay, show: show, hide: hide };
  }

  function ensurePositionedParent(img) {
    var el = img.parentElement;
    for (var i = 0; i < 3 && el; i++) { if (getComputedStyle(el).position !== 'static') return el; el = el.parentElement; }
    var p = img.parentElement; if (p) p.style.position = 'relative'; return p;
  }

  function createTryOnButton(img) {
    if (imageOverlays.has(img)) return;
    var imageUrl = getImageUrl(img);
    if (!imageUrl) return;
    if (scoreImage(img) < CONFIG.detectionThreshold) return;
    try {
      var wrapper = ensurePositionedParent(img);
      if (!wrapper) return;
      var mounted = mountOverlayOnElement(img, function(e) {
        e.preventDefault();
        e.stopPropagation();
        handleQuickPreview(img);
      });
      wrapper.appendChild(mounted.overlay);
      imageOverlays.set(img, { overlay: mounted.overlay, wrapper: wrapper });

      // Closet-aware highlight runs alongside the Try-On CTA. It bails
      // out cleanly when the profile isn't loaded yet (the loader on
      // boot re-walks imageOverlays once it lands) or when the user
      // has turned highlights off via the popup toggle.
      try { mountStyleHighlight(img); } catch (_e) {}
    } catch (err) { console.error('[GradFiT] Button error:', err); }
  }

  // ═══════════════════════════════════════════════════════════
  // CLICK HANDLERS
  // ═══════════════════════════════════════════════════════════
  function handleQuickPreview(img) {
    var md = extractProductMetadata(img);
    if (!md.imageUrl) { showToast('Could not get image URL', 'error'); return; }
    playImageAnimation(img);
    openSidebar(md);
    runQuickTryOn(md);
  }

  function findSidebarGarment(imageUrl) {
    var norm = normalizeImageUrl(imageUrl);
    for (var i = 0; i < sidebarState.selectedGarments.length; i++) {
      var garment = sidebarState.selectedGarments[i];
      if (normalizeImageUrl(garment.imageUrl) === norm) return garment;
    }
    return null;
  }

  function setPreviewLoading(loading) {
    var loadingEl = document.getElementById('tryon-model-loading');
    if (loadingEl) loadingEl.style.display = loading ? 'flex' : 'none';
  }

  function setQuickPreviewForGarment(imageUrl, previewUrl, isGenerated) {
    var garment = findSidebarGarment(imageUrl);
    if (!garment) return;
    garment.quickPreviewUrl = previewUrl || '';
    garment.quickPreviewGenerated = !!isGenerated;
    renderGarmentList();
    showGarmentPreview(imageUrl);
  }

  function requestQuickTryOn(metadata, callback) {
    var finished = false;
    var timeoutId = null;

    function finish(result) {
      if (finished) return;
      finished = true;
      if (timeoutId) clearTimeout(timeoutId);
      callback(result || { success: false, error: 'Unknown quick preview error' });
    }

    timeoutId = setTimeout(function() {
      finish({ success: false, error: 'Quick preview timed out' });
    }, CONFIG.quickTryOnTimeoutMs);

    safeSendMessage(
      {
        action: 'quickTryOn',
        metadata: {
          imageUrl: metadata.imageUrl,
          title: metadata.title || '',
          price: metadata.price || '',
          brand: metadata.brand || '',
          url: metadata.url || window.location.href,
          quality: 'fast',
          previewOnly: true,
        },
      },
      function(response) {
        finish(response || { success: false, error: 'No response from quick preview service' });
      }
    );
  }

  function runQuickTryOn(metadata) {
    var norm = normalizeImageUrl(metadata.imageUrl || '');
    if (!norm) return;

    // Cached successes are still re-shown instantly.
    if (quickPreviewCache.has(norm)) {
      setQuickPreviewForGarment(metadata.imageUrl, quickPreviewCache.get(norm), true);
      return;
    }

    if (quickPreviewInFlight.has(norm)) {
      setPreviewLoading(true);
      return;
    }

    quickPreviewInFlight.set(norm, Date.now());
    setPreviewLoading(true);
    // Clear any stale Buy-this CTA from a previous try-on so the user
    // doesn't see a "Buy last item" link while the new one runs.
    quickTryContext = null;
    hideSidebarBuyLink();
    showToast('Quick Try running in the background. Real try-on incoming...', 'info');

    requestQuickTryOn(metadata, function(response) {
      quickPreviewInFlight.delete(norm);
      setPreviewLoading(false);

      var resultUrl = response && response.success ? (response.resultUrl || response.result_image_url || '') : '';

      if (resultUrl) {
        // Only cache real generated results - never placeholder or error URLs.
        quickPreviewCache.set(norm, resultUrl);
        setQuickPreviewForGarment(metadata.imageUrl, resultUrl, true);
        showToast('Quick Try ready', 'success');
        // Buy-this: background.js now echoes back the garmentId +
        // sourceUrl it used, so the affiliate CTA resolves without a
        // second /garments lookup.
        quickTryContext = {
          tryonId: response.tryonId || null,
          garmentId: response.garmentId || null,
          sourceUrl: response.sourceUrl || metadata.url || window.location.href,
        };
        mountSidebarBuyLink();
        return;
      }

      // No real result came back - surface a clear error instead of a
      // fake mannequin. The original product image stays visible so the
      // user isn't left staring at an empty preview pane.
      var reason = (response && response.error) || 'Quick Try did not return a result';
      showToast(reason, 'error');
    });
  }

  // ═══════════════════════════════════════════════════════════
  // SCAN ANIMATION
  // ═══════════════════════════════════════════════════════════
  function playImageAnimation(img) {
    var r = img.getBoundingClientRect();
    var a = document.createElement('div');
    a.style.cssText = 'position:fixed;top:' + r.top + 'px;left:' + r.left + 'px;width:' + r.width + 'px;height:' + r.height + 'px;z-index:999999;pointer-events:none;border-radius:8px;overflow:hidden;';

    var glow = document.createElement('div');
    glow.style.cssText = 'position:absolute;inset:-4px;border-radius:12px;box-shadow:0 0 20px rgba(139,92,246,.5),0 0 40px rgba(59,130,246,.3);animation:tryon-glow-pulse .6s ease-in-out infinite alternate;';

    var scan = document.createElement('div');
    scan.style.cssText = 'position:absolute;left:0;width:100%;height:3px;background:linear-gradient(90deg,transparent,rgba(139,92,246,.8) 30%,rgba(59,130,246,1) 50%,rgba(139,92,246,.8) 70%,transparent);box-shadow:0 0 12px rgba(139,92,246,.8);animation:tryon-scan-sweep ' + CONFIG.clickAnimationDuration + 'ms ease-in-out forwards;';

    var corners = [['top','left'],['top','right'],['bottom','left'],['bottom','right']];
    for (var i = 0; i < corners.length; i++) {
      var c = document.createElement('div');
      c.style.cssText = 'position:absolute;' + corners[i][0] + ':-1px;' + corners[i][1] + ':-1px;width:16px;height:16px;border-' + corners[i][0] + ':3px solid #8b5cf6;border-' + corners[i][1] + ':3px solid #3b82f6;border-' + corners[i][0] + '-' + corners[i][1] + '-radius:4px;animation:tryon-corner-pop .3s ease-out ' + (i * 0.08) + 's both;';
      a.appendChild(c);
    }
    a.appendChild(glow); a.appendChild(scan);
    document.body.appendChild(a);
    setTimeout(function() { a.style.transition = 'opacity .3s'; a.style.opacity = '0'; setTimeout(function() { a.remove(); }, 300); }, CONFIG.clickAnimationDuration);
  }

  // ═══════════════════════════════════════════════════════════
  // TOAST
  // ═══════════════════════════════════════════════════════════
  function showToast(message, type) {
    var ex = document.getElementById('tryon-ai-toast'); if (ex) ex.remove();
    var accent = { error: '#ef4444', success: '#10b981', info: '#4f7cff' };
    var t = document.createElement('div');
    t.id = 'tryon-ai-toast';
    t.style.cssText =
      'position:fixed;top:20px;right:20px;padding:11px 16px;border-radius:10px;' +
      'z-index:999999;animation:tryon-toast-in .3s ease-out;max-width:300px;' +
      'border-left:3px solid ' + (accent[type] || accent.info) + ';';
    t.textContent = message;
    document.body.appendChild(t);
    setTimeout(function() { t.style.transition = 'opacity .3s,transform .3s'; t.style.opacity = '0'; t.style.transform = 'translateX(40px)'; setTimeout(function() { t.remove(); }, 300); }, 3000);
  }

  // ═══════════════════════════════════════════════════════════
  // SIDEBAR
  // ═══════════════════════════════════════════════════════════
  var sidebarEl = null;
  var sidebarBackdropEl = null;
  var sidebarState = { open: false, selectedGarments: [], history: [] };

  // ─── Combo state ─────────────────────────────────────────────────
  // Combo staging persists in chrome.storage.local so the user can
  // "add to combo" on one retailer tab (e.g. a shirt from Zara), then
  // switch to another tab (e.g. pants from H&M), and still see both
  // slots populated in the sidebar. The `top` / `bottom` slots each
  // hold one optional item. Each item is:
  //   { imageUrl, title, sourceUrl, garmentId?, category, registering?,
  //     addedAt }
  var COMBO_STORAGE_KEY = 'gradfit_combo_staged';
  var comboState = {
    top: null,
    bottom: null,
    running: false,
    tryOn: null, // { resultUrl, tryonId, primaryGarmentId }
  };
  // After a Quick Try (single garment) completes we remember the
  // garment_id + source URL so the Buy-this CTA in the preview area
  // can render without a second lookup. Cleared on new quick try.
  var quickTryContext = null;

  function normalizeCategory(str) {
    if (!str) return '';
    var s = (str + '').toLowerCase();
    if (/\b(pant|trouser|jean|denim|chino|short|skirt|legging|joggers|slack)\b/.test(s)) return 'bottom';
    if (/\b(shirt|tee|t-shirt|tshirt|blouse|top|hoodie|sweater|sweatshirt|jacket|coat|blazer|cardigan|vest|pullover|jumper|polo|henley|tank|camisole)\b/.test(s)) return 'top';
    if (/\b(dress|gown|jumpsuit|romper|bodysuit|kurta|saree|sari|abaya|kaftan)\b/.test(s)) return 'dress';
    return '';
  }

  function createSidebar() {
    if (sidebarEl) return;

    // Backdrop
    sidebarBackdropEl = document.createElement('div');
    sidebarBackdropEl.id = 'tryon-ai-sidebar-backdrop';
    sidebarBackdropEl.addEventListener('click', closeSidebar);
    document.body.appendChild(sidebarBackdropEl);

    // Sidebar panel (opened from product-image CTA or extension popup)
    sidebarEl = document.createElement('div');
    sidebarEl.id = 'tryon-ai-sidebar';
    sidebarEl.innerHTML = buildSidebarHTML();
    document.body.appendChild(sidebarEl);

    setupSidebarEvents();
    loadSidebarHistory();
    applySidebarTheme(true);
  }

  function buildSidebarHTML() {
    var logoSrc = (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL)
      ? chrome.runtime.getURL('assets/icon-48.png')
      : 'assets/icon-48.png';
    return '<div class="tryon-sidebar-header">' +
      '<div class="tryon-sidebar-logo">' +
        '<img src="' + logoSrc + '" alt="GradFiT" width="22" height="22" />' +
        '<span class="tryon-sidebar-title">GradFiT</span>' +
      '</div>' +
      '<button class="tryon-sidebar-close" id="tryon-sidebar-close"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>' +
    '</div>' +
    '<div class="tryon-sidebar-content">' +
      '<div class="tryon-sidebar-section tryon-model-section">' +
        '<div class="tryon-section-label"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg><span>Preview</span></div>' +
        '<div class="tryon-model-preview" id="tryon-model-preview">' +
          '<div class="tryon-model-placeholder" id="tryon-model-placeholder"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="rgba(79,124,255,0.45)" stroke-width="1.5"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg><span>Select a garment to preview</span></div>' +
          '<img id="tryon-model-img" class="tryon-model-img" style="display:none;" alt="Try-on preview"/>' +
          '<div class="tryon-model-loading" id="tryon-model-loading" style="display:none;"><div class="tryon-spinner"></div><span>Generating preview...</span></div>' +
        '</div>' +
        '<div class="tryon-model-actions">' +
          '<button class="tryon-action-btn tryon-action-primary" id="tryon-full-tryon-btn" disabled><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg><span>Full Try-On</span></button>' +
          '<button class="tryon-action-btn tryon-action-secondary" id="tryon-save-btn" disabled><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg><span>Save</span></button>' +
        '</div>' +
        // Buy-this affiliate CTA, appears after a completed try-on.
        // Hidden until we have a try-on id + garment id to attribute the
        // click to. Styled as an outline button below the two main CTAs.
        '<div class="tryon-buy-wrap" id="tryon-buy-wrap" style="display:none">' +
          '<a class="tryon-action-btn tryon-action-buy" id="tryon-buy-link" href="#" target="_blank" rel="noopener noreferrer">' +
            '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.7 13.4a2 2 0 0 0 2 1.6h9.7a2 2 0 0 0 2-1.6L23 6H6"/></svg>' +
            '<span id="tryon-buy-label">Buy this</span>' +
          '</a>' +
          '<div class="tryon-buy-disclosure" id="tryon-buy-disclosure" style="display:none"></div>' +
        '</div>' +
      '</div>' +
      // ── Combo Studio: stage up to one top + one bottom across tabs ──
      '<div class="tryon-sidebar-section tryon-combo-section">' +
        '<div class="tryon-section-label"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 3l6 6M9 3L3 9"/><rect x="13" y="13" width="8" height="8" rx="1"/></svg><span>Combo Studio</span><span class="tryon-combo-badge">New</span></div>' +
        '<div class="tryon-combo-hint">Add a top from one site + a bottom from another. We\'ll stitch them onto you in one shot.</div>' +
        '<div class="tryon-combo-slots">' +
          '<div class="tryon-combo-slot" id="tryon-combo-slot-top" data-slot="top">' +
            '<div class="tryon-combo-slot-label">Top</div>' +
            '<div class="tryon-combo-slot-body" id="tryon-combo-slot-top-body"><div class="tryon-combo-slot-empty">Empty</div></div>' +
          '</div>' +
          '<div class="tryon-combo-slot" id="tryon-combo-slot-bottom" data-slot="bottom">' +
            '<div class="tryon-combo-slot-label">Bottom</div>' +
            '<div class="tryon-combo-slot-body" id="tryon-combo-slot-bottom-body"><div class="tryon-combo-slot-empty">Empty</div></div>' +
          '</div>' +
        '</div>' +
        '<div class="tryon-combo-actions">' +
          '<button class="tryon-action-btn tryon-action-primary" id="tryon-combo-try" disabled><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg><span id="tryon-combo-try-label">Try combo</span></button>' +
          '<button class="tryon-action-btn tryon-action-secondary" id="tryon-combo-clear"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg><span>Clear</span></button>' +
        '</div>' +
      '</div>' +
      '<div class="tryon-sidebar-section">' +
        '<div class="tryon-section-label"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg><span>Selected Items</span><span class="tryon-item-count" id="tryon-item-count">0</span></div>' +
        '<div class="tryon-garment-list" id="tryon-garment-list"><div class="tryon-empty-state" id="tryon-empty-garments"><span>Try on from any product image to add items here</span></div></div>' +
      '</div>' +
      '<div class="tryon-sidebar-section">' +
        '<div class="tryon-section-label"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg><span>Recent</span></div>' +
        '<div class="tryon-history-list" id="tryon-history-list"><div class="tryon-empty-state"><span>No recent previews</span></div></div>' +
      '</div>' +
    '</div>' +
    '<div class="tryon-sidebar-footer">' +
      '<a class="tryon-footer-link" id="tryon-open-app-link">Open GradFiT</a>' +
      '<span class="tryon-footer-divider">\u00B7</span>' +
      '<span class="tryon-footer-powered">Virtual try-on</span>' +
    '</div>';
  }

  function setupSidebarEvents() {
    var closeBtn = document.getElementById('tryon-sidebar-close');
    if (closeBtn) closeBtn.addEventListener('click', closeSidebar);

    var fullBtn = document.getElementById('tryon-full-tryon-btn');
    if (fullBtn) fullBtn.addEventListener('click', function() {
      if (sidebarState.selectedGarments.length === 0) return;
      var g = sidebarState.selectedGarments[sidebarState.selectedGarments.length - 1];
      var url = activeAppUrl() + '/try?image=' + encodeURIComponent(g.imageUrl);
      if (g.title) url += '&title=' + encodeURIComponent(g.title);
      if (!safeSendMessage({ action: 'tryOnProduct', metadata: g, timestamp: Date.now() })) {
        window.open(url, '_blank');
      }
      showToast('Opening full try-on...', 'success');
    });

    var saveBtn = document.getElementById('tryon-save-btn');
    if (saveBtn) saveBtn.addEventListener('click', function() {
      if (sidebarState.selectedGarments.length === 0) return;
      saveSidebarHistory();
      showToast('Saved to history!', 'success');
    });

    var appLink = document.getElementById('tryon-open-app-link');
    if (appLink) appLink.addEventListener('click', function(e) {
      e.preventDefault();
      window.open(activeAppUrl(), '_blank');
    });

    var comboTryBtn = document.getElementById('tryon-combo-try');
    if (comboTryBtn) comboTryBtn.addEventListener('click', fireComboTryOn);

    var comboClearBtn = document.getElementById('tryon-combo-clear');
    if (comboClearBtn) comboClearBtn.addEventListener('click', function() {
      clearComboSlot(null);
      hideSidebarBuyLink();
    });

    var buyLink = document.getElementById('tryon-buy-link');
    if (buyLink) buyLink.addEventListener('click', function(e) {
      if (buyLink.getAttribute('data-ready') === 'true') return;
      // If the affiliate resolve never finished, fall back to the raw
      // retailer URL so the user isn't stuck.
      if (!quickTryContext || !quickTryContext.sourceUrl) return;
      e.preventDefault();
      window.open(quickTryContext.sourceUrl, '_blank');
    });

    // Hydrate combo slots from storage (may be populated by a prior
    // session on another tab/site).
    loadComboState();
  }

  function toggleSidebar() {
    if (!sidebarEl) createSidebar();
    if (sidebarState.open) closeSidebar(); else {
      applySidebarTheme(true);
      sidebarState.open = true;
      sidebarEl.classList.add('open');
      sidebarBackdropEl.classList.add('visible');
    }
  }

  function openSidebar(metadata) {
    if (!sidebarEl) createSidebar();
    applySidebarTheme(true);
    sidebarState.open = true;
    sidebarEl.classList.add('open');
    sidebarBackdropEl.classList.add('visible');
    if (metadata) addGarmentToSidebar(metadata);
  }

  function closeSidebar() {
    sidebarState.open = false;
    if (sidebarEl) sidebarEl.classList.remove('open');
    if (sidebarBackdropEl) sidebarBackdropEl.classList.remove('visible');
  }

  function addGarmentToSidebar(metadata) {
    var dominated = sidebarState.selectedGarments.some(function(g) { return normalizeImageUrl(g.imageUrl) === normalizeImageUrl(metadata.imageUrl); });
    if (dominated) { showToast('Already added!', 'info'); selectGarmentInSidebar(metadata.imageUrl); return; }
    if (sidebarState.selectedGarments.length >= CONFIG.maxSidebarGarments) sidebarState.selectedGarments.shift();
    sidebarState.selectedGarments.push(metadata);
    renderGarmentList();
    selectGarmentInSidebar(metadata.imageUrl);
    updateActionButtons();
  }

  function removeGarmentFromSidebar(imageUrl) {
    sidebarState.selectedGarments = sidebarState.selectedGarments.filter(function(g) { return normalizeImageUrl(g.imageUrl) !== normalizeImageUrl(imageUrl); });
    renderGarmentList();
    updatePreviewArea();
    updateActionButtons();
  }

  function selectGarmentInSidebar(imageUrl) {
    var items = document.querySelectorAll('.tryon-garment-item');
    items.forEach(function(el) { el.classList.remove('selected'); });
    var norm = normalizeImageUrl(imageUrl);
    items.forEach(function(el) { if (el.dataset.imageUrl && normalizeImageUrl(el.dataset.imageUrl) === norm) el.classList.add('selected'); });
    showGarmentPreview(imageUrl);
  }

  function showGarmentPreview(imageUrl) {
    var placeholder = document.getElementById('tryon-model-placeholder');
    var imgEl = document.getElementById('tryon-model-img');
    var garment = findSidebarGarment(imageUrl);
    var previewUrl = garment && garment.quickPreviewUrl ? garment.quickPreviewUrl : imageUrl;
    if (placeholder) placeholder.style.display = 'none';
    if (imgEl) { imgEl.src = previewUrl; imgEl.style.display = 'block'; }
    setPreviewLoading(false);
  }

  function updatePreviewArea() {
    if (sidebarState.selectedGarments.length === 0) {
      var placeholder = document.getElementById('tryon-model-placeholder');
      var imgEl = document.getElementById('tryon-model-img');
      if (placeholder) placeholder.style.display = 'flex';
      if (imgEl) { imgEl.style.display = 'none'; imgEl.src = ''; }
      setPreviewLoading(false);
    }
  }

  function updateActionButtons() {
    var hasItems = sidebarState.selectedGarments.length > 0;
    var fullBtn = document.getElementById('tryon-full-tryon-btn');
    var saveBtn = document.getElementById('tryon-save-btn');
    if (fullBtn) fullBtn.disabled = !hasItems;
    if (saveBtn) saveBtn.disabled = !hasItems;
    var countEl = document.getElementById('tryon-item-count');
    if (countEl) countEl.textContent = sidebarState.selectedGarments.length;
  }

  function renderGarmentList() {
    var list = document.getElementById('tryon-garment-list');
    if (!list) return;
    list.innerHTML = '';
    if (sidebarState.selectedGarments.length === 0) {
      list.innerHTML = '<div class="tryon-empty-state" id="tryon-empty-garments"><span>Click \u26A1 on any garment to add it here</span></div>';
      return;
    }
    sidebarState.selectedGarments.forEach(function(g) {
      var previewTag = g.quickPreviewUrl ? '<div class="tryon-garment-preview-tag">' + (g.quickPreviewGenerated ? 'AI preview' : 'Fast preview') + '</div>' : '';
      var item = document.createElement('div');
      item.className = 'tryon-garment-item';
      item.dataset.imageUrl = g.imageUrl;
      // Per-item "Add to combo" chooser. We default the slot based on
      // the detected category (`normalizeCategory` on title/brand) but
      // still let the user override via the dedicated Top/Bottom
      // buttons -- retailers sometimes mislabel their pages.
      var guessed = normalizeCategory((g.title || '') + ' ' + (g.brand || ''));
      var comboButtons =
        '<div class="tryon-combo-add-buttons">' +
          '<button class="tryon-combo-add-btn" data-slot="top" data-image="' + escapeAttr(g.imageUrl) + '">' +
            (guessed === 'top' ? '+ Top \u2605' : '+ Top') +
          '</button>' +
          '<button class="tryon-combo-add-btn" data-slot="bottom" data-image="' + escapeAttr(g.imageUrl) + '">' +
            (guessed === 'bottom' ? '+ Bottom \u2605' : '+ Bottom') +
          '</button>' +
        '</div>';
      item.innerHTML = '<img class="tryon-garment-thumb" src="' + escapeAttr(g.imageUrl) + '" alt="' + escapeAttr(g.title || 'Garment') + '" onerror="this.style.display=\'none\'">' +
        '<div class="tryon-garment-info"><div class="tryon-garment-name">' + escapeHtml(g.title || 'Untitled Garment') + '</div>' +
        '<div class="tryon-garment-meta">' + escapeHtml(g.price || '') + (g.brand ? ' \u00B7 ' + escapeHtml(g.brand) : '') + '</div>' + previewTag + comboButtons + '</div>' +
        '<button class="tryon-garment-remove" title="Remove"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>';
      item.addEventListener('click', function(e) {
        var comboBtn = e.target.closest('.tryon-combo-add-btn');
        if (comboBtn) {
          e.stopPropagation();
          var slot = comboBtn.getAttribute('data-slot');
          addToComboSlot(slot, g);
          return;
        }
        if (e.target.closest('.tryon-garment-remove')) { removeGarmentFromSidebar(g.imageUrl); return; }
        selectGarmentInSidebar(g.imageUrl);
      });
      list.appendChild(item);
    });
    var countEl = document.getElementById('tryon-item-count');
    if (countEl) countEl.textContent = sidebarState.selectedGarments.length;
  }

  function escapeHtml(s) { var d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
  function escapeAttr(s) { return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

  // ─── Combo Studio ─────────────────────────────────────────
  // Combo state is persisted in chrome.storage.local so the user can
  // stage a top on Zara, open H&M in another tab, and still see the
  // first item populated in the Combo Studio slot. We listen to
  // storage changes below so updates sync across tabs instantly.
  function loadComboState() {
    safeStorageGet(COMBO_STORAGE_KEY, function(result) {
      var raw = (result && result[COMBO_STORAGE_KEY]) || null;
      if (raw && typeof raw === 'object') {
        comboState.top = raw.top || null;
        comboState.bottom = raw.bottom || null;
      }
      renderComboSlots();
    });
  }

  function saveComboState() {
    var payload = {};
    payload[COMBO_STORAGE_KEY] = {
      top: comboState.top,
      bottom: comboState.bottom,
      updatedAt: Date.now(),
    };
    safeStorageSet(payload);
  }

  function addToComboSlot(slot, garment) {
    if (!slot || (slot !== 'top' && slot !== 'bottom')) return;
    if (!garment || !garment.imageUrl) return;

    var entry = {
      imageUrl: garment.imageUrl,
      title: (garment.title || 'Garment').slice(0, 80),
      sourceUrl: garment.sourceUrl || garment.url || window.location.href,
      category: slot,
      brand: garment.brand || '',
      addedAt: Date.now(),
      registering: true,
    };
    comboState[slot] = entry;
    saveComboState();
    renderComboSlots();
    showToast('Added to combo \u00B7 registering...', 'info');

    // Register with the backend so we have a stable garment_id. The
    // combo fire-path can register inline later if this fails, but
    // pre-registering up front makes the final "Try combo" click
    // near-instant (only the try-on RTT, no upload).
    safeSendMessage(
      {
        action: 'registerGarment',
        metadata: {
          imageUrl: entry.imageUrl,
          title: entry.title,
          url: entry.sourceUrl,
          category: slot,
        },
      },
      function(resp) {
        var current = comboState[slot];
        if (!current || current.imageUrl !== entry.imageUrl) return;
        if (resp && resp.success && resp.garmentId) {
          current.garmentId = resp.garmentId;
          current.registering = false;
          saveComboState();
          renderComboSlots();
        } else {
          current.registering = false;
          current.registerError = (resp && resp.error) || 'Could not register';
          saveComboState();
          renderComboSlots();
        }
      }
    );
  }

  function clearComboSlot(slot) {
    if (slot === 'top' || slot === 'bottom') {
      comboState[slot] = null;
    } else {
      comboState.top = null;
      comboState.bottom = null;
    }
    saveComboState();
    renderComboSlots();
  }

  function renderComboSlots() {
    ['top', 'bottom'].forEach(function(slot) {
      var body = document.getElementById('tryon-combo-slot-' + slot + '-body');
      var slotEl = document.getElementById('tryon-combo-slot-' + slot);
      var item = comboState[slot];
      if (!body || !slotEl) return;
      if (!item) {
        slotEl.classList.remove('filled');
        body.innerHTML = '<div class="tryon-combo-slot-empty">Empty</div>';
        return;
      }
      slotEl.classList.add('filled');
      var host = '';
      try { host = new URL(item.sourceUrl || '').hostname.replace(/^www\./, ''); } catch (_e) {}
      var statusLabel = item.registering
        ? 'Registering...'
        : (item.garmentId ? (host || 'Ready') : (item.registerError || 'Ready (no id)'));
      body.innerHTML =
        '<div class="tryon-combo-item">' +
          '<img class="tryon-combo-item-thumb" src="' + escapeAttr(item.imageUrl) + '" alt="" onerror="this.style.display=\'none\'">' +
          '<div class="tryon-combo-item-info">' +
            '<div class="tryon-combo-item-name">' + escapeHtml(item.title || 'Garment') + '</div>' +
            '<div class="tryon-combo-item-src">' + escapeHtml(statusLabel) + '</div>' +
          '</div>' +
          '<button class="tryon-combo-item-remove" data-slot="' + slot + '" title="Remove">\u00D7</button>' +
        '</div>';
      var rm = body.querySelector('.tryon-combo-item-remove');
      if (rm) rm.addEventListener('click', function(e) {
        e.stopPropagation();
        clearComboSlot(slot);
      });
    });
    updateComboActions();
  }

  function updateComboActions() {
    var tryBtn = document.getElementById('tryon-combo-try');
    var label = document.getElementById('tryon-combo-try-label');
    var hasTop = !!comboState.top;
    var hasBottom = !!comboState.bottom;
    var count = (hasTop ? 1 : 0) + (hasBottom ? 1 : 0);
    if (tryBtn) tryBtn.disabled = count < 2 || comboState.running;
    if (label) {
      if (comboState.running) label.textContent = 'Stitching...';
      else if (count < 2) label.textContent = 'Add top + bottom';
      else label.textContent = 'Try combo';
    }
  }

  function fireComboTryOn() {
    if (comboState.running) return;
    if (!comboState.top || !comboState.bottom) {
      showToast('Add both a Top and a Bottom first.', 'error');
      return;
    }

    // Order: apply Bottom first, then Top. Fashn applies each garment
    // as an overlay, so the last one applied sits on top. Pants under
    // a shirt looks right; shirt under pants would clip weirdly.
    var payload = [
      {
        garmentId: comboState.bottom.garmentId,
        imageUrl: comboState.bottom.imageUrl,
        title: comboState.bottom.title,
        url: comboState.bottom.sourceUrl,
        category: 'bottom',
      },
      {
        garmentId: comboState.top.garmentId,
        imageUrl: comboState.top.imageUrl,
        title: comboState.top.title,
        url: comboState.top.sourceUrl,
        category: 'top',
      },
    ];

    comboState.running = true;
    updateComboActions();
    setPreviewLoading(true);
    showToast('Stitching your combo look... this takes ~30-90s', 'info');

    safeSendMessage(
      {
        action: 'comboTryOn',
        metadata: { garments: payload, quality: 'fast' },
      },
      function(resp) {
        comboState.running = false;
        setPreviewLoading(false);
        updateComboActions();
        if (!resp || !resp.success) {
          var reason = (resp && resp.error) || 'Combo try-on failed';
          showToast(reason, 'error');
          return;
        }
        showToast('Combo ready \u2728', 'success');
        comboState.tryOn = {
          resultUrl: resp.resultUrl,
          tryonId: resp.tryonId,
          primaryGarmentId: resp.primaryGarmentId || (resp.garmentIds && resp.garmentIds[0]),
        };
        // Render the combo result directly in the preview frame.
        var imgEl = document.getElementById('tryon-model-img');
        var placeholder = document.getElementById('tryon-model-placeholder');
        if (placeholder) placeholder.style.display = 'none';
        if (imgEl) { imgEl.src = resp.resultUrl; imgEl.style.display = 'block'; }
        // Point the Buy-this CTA at the primary garment in the combo
        // (usually the bottom, since we apply it first). The affiliate
        // service still honours per-garment source_url, so the CTA
        // resolves to the right retailer.
        quickTryContext = {
          tryonId: resp.tryonId,
          garmentId: resp.primaryGarmentId || (resp.garmentIds && resp.garmentIds[0]),
          sourceUrl: comboState.bottom && comboState.bottom.sourceUrl,
        };
        mountSidebarBuyLink();
      }
    );
  }

  // ─── Sidebar Buy-this CTA ─────────────────────────────────
  function hideSidebarBuyLink() {
    var wrap = document.getElementById('tryon-buy-wrap');
    var link = document.getElementById('tryon-buy-link');
    var disc = document.getElementById('tryon-buy-disclosure');
    if (wrap) wrap.style.display = 'none';
    if (link) { link.href = '#'; link.removeAttribute('data-ready'); }
    if (disc) disc.style.display = 'none';
  }

  function mountSidebarBuyLink() {
    var wrap = document.getElementById('tryon-buy-wrap');
    var link = document.getElementById('tryon-buy-link');
    var label = document.getElementById('tryon-buy-label');
    var disc = document.getElementById('tryon-buy-disclosure');
    if (!wrap || !link || !label) return;
    if (!quickTryContext) return;
    if (!quickTryContext.garmentId && !quickTryContext.sourceUrl) return;

    // Show the button in a "Resolving..." state immediately so users
    // get feedback even if the affiliate network lookup is slow.
    wrap.style.display = 'flex';
    label.textContent = 'Resolving best price...';
    link.setAttribute('href', quickTryContext.sourceUrl || '#');

    safeStorageGet(['tryon_user_token', 'gradfit_active_api_url'], function(stored) {
      var token = stored && stored.tryon_user_token;
      if (!token) {
        label.textContent = 'Open product page';
        link.setAttribute('href', quickTryContext.sourceUrl || '#');
        return;
      }
      var apiBase = (stored && stored.gradfit_active_api_url) || GRADFIT_API_URL;
      apiBase = apiBase.replace(/\/$/, '');
      var body = {
        garment_id: quickTryContext.garmentId || undefined,
        tryon_id: quickTryContext.tryonId || undefined,
        url: quickTryContext.garmentId ? undefined : quickTryContext.sourceUrl || undefined,
      };
      var affiliateHeaders = {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + token,
      };
      affiliateHeaders[GRADFIT_SOURCE_HEADER] = GRADFIT_SOURCE_VALUE;
      fetch(apiBase + '/api/affiliate/click', {
        method: 'POST',
        headers: affiliateHeaders,
        body: JSON.stringify(body),
      })
      .then(function(r) { return r.ok ? r.json() : Promise.reject(new Error('HTTP ' + r.status)); })
      .then(function(resp) {
        var linkData = (resp && resp.link) || {};
        if (!linkData.affiliate_url) {
          label.textContent = 'Open product page';
          link.setAttribute('href', quickTryContext.sourceUrl || '#');
          return;
        }
        var merchant = linkData.merchant ? ' on ' + linkData.merchant : '';
        label.textContent = 'Buy this' + merchant;
        link.setAttribute('href', linkData.affiliate_url);
        link.setAttribute('data-ready', 'true');
        if (linkData.disclosure_text && disc) {
          disc.textContent = linkData.disclosure_text;
          disc.style.display = 'block';
        }
      })
      .catch(function(err) {
        console.warn('[GradFiT] affiliate resolve failed:', err);
        label.textContent = 'Open product page';
        link.setAttribute('href', quickTryContext.sourceUrl || '#');
      });
    });
  }

  // Shared API origin -- pulled from build-time config (see config.js).
  var GRADFIT_API_URL =
    (globalThis.GRADFIT_CONFIG && globalThis.GRADFIT_CONFIG.apiUrl) ||
    'http://localhost:8000';
  var GRADFIT_SOURCE_HEADER =
    (globalThis.GRADFIT_CONFIG && globalThis.GRADFIT_CONFIG.sourceHeader) ||
    'X-GradFiT-Source';
  var GRADFIT_SOURCE_VALUE =
    (globalThis.GRADFIT_CONFIG && globalThis.GRADFIT_CONFIG.sourceValue) ||
    'extension';

  // Cross-tab combo sync: when the user adds a garment from one tab,
  // every other open tab's sidebar should update immediately. We
  // listen to chrome.storage.onChanged specifically on the combo
  // storage key. `contextInvalidated` + isExtensionContextValid()
  // protect us from runtime-invalidated listeners throwing.
  if (isExtensionContextValid()) {
    try {
      chrome.storage.onChanged.addListener(function(changes, area) {
        if (area !== 'local') return;
        if (!changes || !changes[COMBO_STORAGE_KEY]) return;
        var next = changes[COMBO_STORAGE_KEY].newValue || {};
        comboState.top = next.top || null;
        comboState.bottom = next.bottom || null;
        // Only re-render when the sidebar is actually mounted --
        // rendering into a non-existent DOM is a no-op but spammy.
        if (sidebarEl) renderComboSlots();
      });
    } catch (_e) { markContextInvalidated(); }
  }

  // ─── Sidebar History ──────────────────────────────────────
  function saveSidebarHistory() {
    try {
      sidebarState.selectedGarments.forEach(function(g) {
        sidebarState.history.unshift({ imageUrl: g.imageUrl, quickPreviewUrl: g.quickPreviewUrl || '', title: g.title, price: g.price, brand: g.brand, timestamp: Date.now() });
      });
      if (sidebarState.history.length > CONFIG.maxHistoryItems) sidebarState.history = sidebarState.history.slice(0, CONFIG.maxHistoryItems);
      safeStorageSet({ tryon_sidebar_history: sidebarState.history });
      renderHistoryList();
    } catch(e) {}
  }

  function loadSidebarHistory() {
    safeStorageGet('tryon_sidebar_history', function(result) {
      sidebarState.history = (result && result.tryon_sidebar_history) || [];
      renderHistoryList();
    });
  }

  function renderHistoryList() {
    var list = document.getElementById('tryon-history-list');
    if (!list) return;
    list.innerHTML = '';
    if (sidebarState.history.length === 0) {
      list.innerHTML = '<div class="tryon-empty-state"><span>No recent previews</span></div>';
      return;
    }
    sidebarState.history.slice(0, 10).forEach(function(h) {
      var item = document.createElement('div');
      item.className = 'tryon-history-item';
      var ago = formatTimeAgo(h.timestamp);
      var thumbUrl = h.quickPreviewUrl || h.imageUrl;
      item.innerHTML = '<img src="' + escapeAttr(thumbUrl) + '" alt="' + escapeAttr(h.title || 'Recent') + '" onerror="this.parentElement.style.display=\'none\'">' +
        '<div class="tryon-history-time">' + ago + '</div>';
      item.addEventListener('click', function() {
        addGarmentToSidebar({ imageUrl: h.imageUrl, quickPreviewUrl: h.quickPreviewUrl || '', quickPreviewGenerated: !!h.quickPreviewUrl, title: h.title || '', price: h.price || '', brand: h.brand || '', url: window.location.href });
      });
      list.appendChild(item);
    });
  }

  function formatTimeAgo(ts) {
    var diff = Date.now() - ts, s = Math.floor(diff / 1000), m = Math.floor(s / 60), h = Math.floor(m / 60), d = Math.floor(h / 24);
    if (d > 0) return d + 'd'; if (h > 0) return h + 'h'; if (m > 0) return m + 'm'; return 'now';
  }

  // ═══════════════════════════════════════════════════════════
  // IMAGE SCANNING & OBSERVER
  // ═══════════════════════════════════════════════════════════
  function getSiteSelectors() {
    var hostname = window.location.hostname.toLowerCase(), extra = [];
    for (var key in SITE_ADAPTERS) { if (hostname.indexOf(key) !== -1) extra = extra.concat(SITE_ADAPTERS[key]); }
    return extra;
  }

  function processImages() {
    var found = new Set();
    var siteSelectors = getSiteSelectors();
    for (var i = 0; i < siteSelectors.length; i++) { try { document.querySelectorAll(siteSelectors[i]).forEach(function(img) { if (img instanceof HTMLImageElement) found.add(img); }); } catch(e) {} }
    for (var i = 0; i < PRODUCT_IMAGE_SELECTORS.length; i++) { try { document.querySelectorAll(PRODUCT_IMAGE_SELECTORS[i]).forEach(function(img) { if (img instanceof HTMLImageElement) found.add(img); }); } catch(e) {} }
    document.querySelectorAll('img').forEach(function(img) {
      if (img instanceof HTMLImageElement && !found.has(img)) {
        var w = img.naturalWidth || img.width || 0, h = img.naturalHeight || img.height || 0;
        if (w >= CONFIG.minImageSize && h >= CONFIG.minImageSize) found.add(img);
      }
    });
    // Background images
    try {
      document.querySelectorAll('[style*="background-image"]').forEach(function(div) {
        var bg = getComputedStyle(div).backgroundImage;
        if (bg && bg !== 'none' && bg.indexOf('url(') !== -1) {
          var rect = div.getBoundingClientRect();
          if (rect.width >= CONFIG.minDisplaySize && rect.height >= CONFIG.minDisplaySize) {
            var match = bg.match(/url\(["']?([^"')]+)["']?\)/);
            if (match && match[1]) addBgImageOverlay(div, match[1]);
          }
        }
      });
    } catch(e) {}

    found.forEach(function(img) {
      if (imageOverlays.has(img)) return;
      if (img.complete && img.naturalWidth > 0) { createTryOnButton(img); return; }
      if (!img.dataset.tryonLoadWatched) {
        img.dataset.tryonLoadWatched = '1';
        img.addEventListener('load', function() { delete img.dataset.tryonLoadWatched; createTryOnButton(img); }, { once: true });
      }
      setTimeout(function() { if (img.complete && img.naturalWidth > 0) createTryOnButton(img); }, 800);
    });
    console.log('[GradFiT] Scanned ' + found.size + ' images, ' + imageOverlays.size + ' garments detected');
  }

  function addBgImageOverlay(div, bgUrl) {
    if (imageOverlays.has(div)) return;
    var pos = getComputedStyle(div).position;
    if (pos === 'static') div.style.position = 'relative';
    var md = { imageUrl: bgUrl, title: '', price: '', brand: '', url: window.location.href };
    var mounted = mountOverlayOnElement(div, function(e) {
      e.preventDefault();
      e.stopPropagation();
      openSidebar(md);
      runQuickTryOn(md);
    });
    div.appendChild(mounted.overlay);
    imageOverlays.set(div, { overlay: overlay, wrapper: div });
  }

  function setupMutationObserver() {
    if (observer) observer.disconnect();
    var debouncedProcess = debounce(processImages, CONFIG.debounceDelay);
    observer = new MutationObserver(function(mutations) {
      var shouldProcess = false;
      for (var i = 0; i < mutations.length; i++) {
        var mutation = mutations[i];
        if (mutation.type === 'attributes') {
          var target = mutation.target;
          if (
            target &&
            target.nodeType === Node.ELEMENT_NODE &&
            (
              target.tagName === 'IMG' ||
              mutation.attributeName === 'style' ||
              mutation.attributeName === 'src' ||
              mutation.attributeName === 'srcset' ||
              mutation.attributeName === 'data-src' ||
              mutation.attributeName === 'data-lazy-src'
            )
          ) {
            shouldProcess = true;
            break;
          }
        }
        var added = mutation.addedNodes;
        for (var j = 0; j < added.length; j++) {
          var node = added[j];
          if (node.nodeType !== Node.ELEMENT_NODE) continue;
          if (node.tagName === 'IMG' || (node.querySelectorAll && node.querySelector('img'))) { shouldProcess = true; break; }
        }
        if (shouldProcess) break;
      }
      if (shouldProcess) debouncedProcess();
    });
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['src', 'srcset', 'data-src', 'data-lazy-src', 'style', 'class'],
    });
  }

  // IntersectionObserver for lazy images
  function setupIntersectionObserver() {
    if (!window.IntersectionObserver) return;
    if (intersectionObserver) intersectionObserver.disconnect();
    if (intersectionMutationObserver) intersectionMutationObserver.disconnect();
    intersectionObserver = new IntersectionObserver(function(entries) {
      entries.forEach(function(entry) {
        if (entry.isIntersecting && entry.target instanceof HTMLImageElement) {
          setTimeout(function() { createTryOnButton(entry.target); }, 500);
        }
      });
    }, { threshold: 0.1 });
    document.querySelectorAll('img').forEach(function(img) { intersectionObserver.observe(img); });
    // Also observe new images via mutation
    intersectionMutationObserver = new MutationObserver(function(mutations) {
      mutations.forEach(function(m) {
        m.addedNodes.forEach(function(n) {
          if (n.nodeType === Node.ELEMENT_NODE) {
            if (n.tagName === 'IMG') intersectionObserver.observe(n);
            if (n.querySelectorAll) n.querySelectorAll('img').forEach(function(img) { intersectionObserver.observe(img); });
          }
        });
      });
    });
    intersectionMutationObserver.observe(document.body, { childList: true, subtree: true });
  }

  function cleanup() {
    imageOverlays.forEach(function(data) { try { data.overlay.remove(); } catch(e) {} });
    imageOverlays.clear();
    if (observer) { observer.disconnect(); observer = null; }
    if (intersectionObserver) { intersectionObserver.disconnect(); intersectionObserver = null; }
    if (intersectionMutationObserver) { intersectionMutationObserver.disconnect(); intersectionMutationObserver = null; }
    duplicateCheckMap.clear();
    quickPreviewInFlight.clear();
  }

  // Last token we pushed into chrome.storage. Used to skip redundant
  // writes (and to detect a real change, which needs a snapshot refresh
  // on the background side so /api/auth/me is re-fetched with the new
  // token instead of the stale cached snapshot).
  var _lastSyncedAuthToken = null;

  // Allowed app origins (prod + localhost dev). Resolved lazily so the
  // build-time GRADFIT_CONFIG injection always wins, with a fallback
  // to CONFIG.appUrl if an older config.js is shipped.
  function gradfitAppOrigins() {
    var cfg = (typeof globalThis !== 'undefined' && globalThis.GRADFIT_CONFIG) || {};
    if (Array.isArray(cfg.appOrigins) && cfg.appOrigins.length) return cfg.appOrigins;
    try { return [new URL(CONFIG.appUrl).origin]; } catch (_e) { return []; }
  }

  // API base for a given app origin. The content script writes this
  // into chrome.storage so the background SW knows whether to talk to
  // the dev backend (when the user signed in on localhost) or the
  // prod backend (when signed in on gradfit.tech).
  function gradfitApiUrlForOrigin(origin) {
    var cfg = (typeof globalThis !== 'undefined' && globalThis.GRADFIT_CONFIG) || {};
    if (cfg.apiUrlByOrigin && cfg.apiUrlByOrigin[origin]) return cfg.apiUrlByOrigin[origin];
    return cfg.apiUrl || CONFIG.apiUrl || '';
  }

  function syncGradfitAuthToken() {
    try {
      var origin = window.location.origin;
      var allowed = gradfitAppOrigins();
      if (allowed.indexOf(origin) === -1) return;

      var token = window.localStorage.getItem('auth_token') || '';
      if (token === _lastSyncedAuthToken) return;
      _lastSyncedAuthToken = token;

      if (token) {
        safeStorageSet({
          tryon_user_token: token,
          // Pin the active app+api URLs to whichever origin we picked
          // the token up from. The background SW + popup read these to
          // route every subsequent API call / "open app" link to the
          // matching environment.
          gradfit_active_app_url: origin,
          gradfit_active_api_url: gradfitApiUrlForOrigin(origin),
        });
        // Force the background to re-fetch the user snapshot with the
        // new token. Without this, the cached snapshot (which may have
        // been populated with an expired token) keeps driving Quick Try
        // checks and the user stays stuck on "Save a default photo".
        if (isExtensionContextValid()) {
          try {
            chrome.runtime.sendMessage({ action: 'refreshUserSnapshot', force: true }, function() {
              if (chrome.runtime.lastError) { /* SW may be asleep; ignore */ }
            });
          } catch (_e) { markContextInvalidated(); }
        }
      } else {
        safeStorageRemove([
          'tryon_user_token',
          'gradfit_active_app_url',
          'gradfit_active_api_url',
        ]);
      }
    } catch (_e) {
      // no-op: this should never interrupt content script behavior
    }
  }

  // Keep the extension's copy of the JWT in lockstep with the web app's
  // localStorage. A single one-shot sync at init() is not enough: the
  // web app can refresh / rotate the token silently (login, logout,
  // another tab signing out) while the content script just sits there
  // and the extension ends up with a stale Bearer token that the API
  // rejects with 401 forever.
  function startAuthTokenSyncWatchers() {
    try {
      var allowed = gradfitAppOrigins();
      if (allowed.indexOf(window.location.origin) === -1) return;

      // Cross-tab updates: fires when another tab writes to localStorage.
      window.addEventListener('storage', function(e) {
        if (!e || e.key === 'auth_token' || e.key === null) syncGradfitAuthToken();
      });
      // Same-tab updates: the tab that did the write does NOT receive the
      // 'storage' event, so cover login-in-current-tab and silent refresh
      // with visibility + focus + a short poll.
      document.addEventListener('visibilitychange', function() {
        if (document.visibilityState === 'visible') syncGradfitAuthToken();
      });
      window.addEventListener('focus', syncGradfitAuthToken);
      setInterval(syncGradfitAuthToken, 5000);
    } catch (_e) { /* best effort */ }
  }

  // ═══════════════════════════════════════════════════════════
  // MESSAGE LISTENER
  // ═══════════════════════════════════════════════════════════
  if (isExtensionContextValid()) {
    try {
      chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
        if (!isExtensionContextValid()) { markContextInvalidated(); return false; }
        if (request.action === 'scanPage') { processImages(); sendResponse({ success: true, count: imageOverlays.size }); }
        else if (request.action === 'toggleSidebar') { toggleSidebar(); sendResponse({ success: true }); }
        else if (request.action === 'getDetectedCount') { sendResponse({ success: true, count: imageOverlays.size }); }
        return true;
      });
    } catch (_e) {
      markContextInvalidated();
    }
  }

  // ═══════════════════════════════════════════════════════════
  // INITIALIZATION
  // ═══════════════════════════════════════════════════════════
  function init() {
    if (initDone) return;
    initDone = true;
    console.log('[GradFiT] Content script initializing...');
    syncGradfitAuthToken();
    startAuthTokenSyncWatchers();
    // Kick off the closet style-profile fetch in parallel with the
    // first image scan. When it lands the profile callback re-walks
    // already-decorated images to add highlights retroactively.
    requestStyleProfile();
    processImages();
    setupMutationObserver();
    setupIntersectionObserver();
    // Sidebar is created lazily when the user clicks "Try on" on a
    // product image or the popup sends a toggleSidebar message — no
    // fixed floating launcher on the page.
    window.addEventListener('focus', function() { applySidebarTheme(false); });
    document.addEventListener('visibilitychange', function() {
      if (document.visibilityState === 'visible') applySidebarTheme(false);
    });
    // Re-scan on scroll (for infinite scroll pages)
    var debouncedScan = debounce(processImages, 1000);
    window.addEventListener('scroll', debouncedScan, { passive: true });
    // Re-scan on URL change (SPA navigation). Also watches for extension
    // context invalidation (user reloaded extension) and self-terminates
    // to avoid flooding the console with "Extension context invalidated"
    // errors on every tick.
    var lastUrl = window.location.href;
    spaCheckInterval = setInterval(function() {
      if (!isExtensionContextValid()) {
        markContextInvalidated();
        return;
      }
      if (window.location.href !== lastUrl) {
        lastUrl = window.location.href;
        syncGradfitAuthToken();
        cleanup();
        setTimeout(function() {
          if (!isExtensionContextValid()) return;
          processImages();
          setupMutationObserver();
          setupIntersectionObserver();
          applySidebarTheme(true);
        }, 500);
      }
    }, 1000);
    console.log('[GradFiT] Content script ready');
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
  window.addEventListener('beforeunload', cleanup, { once: true });
})();

