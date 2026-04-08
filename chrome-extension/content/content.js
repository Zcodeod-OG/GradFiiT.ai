// ============================================================
// ALTER.ai Chrome Extension - Content Script
// Enhanced garment detection + Quick Try-On Sidebar
// ============================================================
(function () {
  'use strict';

  var CONFIG = {
    minImageSize: 120, minDisplaySize: 80, debounceDelay: 300,
    duplicateCheckWindow: 5000, clickAnimationDuration: 900,
    detectionThreshold: 4, maxScanDepth: 10,
    appUrl: 'http://localhost:3000', maxSidebarGarments: 10, maxHistoryItems: 20,
    quickTryOnTimeoutMs: 25000, themeRefreshThrottleMs: 1500,
  };

  var imageOverlays = new Map();
  var observer = null;
  var duplicateCheckMap = new Map();
  var quickPreviewCache = new Map();
  var quickPreviewInFlight = new Map();
  var intersectionObserver = null;
  var intersectionMutationObserver = null;
  var initDone = false;
  var sidebarThemeState = { lastAppliedAt: 0 };

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

  function clampColor(v) {
    return Math.max(0, Math.min(255, Math.round(v)));
  }

  function parseCssColor(value) {
    if (!value || value === 'transparent' || value === 'inherit') return null;
    var color = value.trim().toLowerCase();
    var m = null;

    m = color.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)$/);
    if (m) {
      return {
        r: clampColor(parseInt(m[1], 10)),
        g: clampColor(parseInt(m[2], 10)),
        b: clampColor(parseInt(m[3], 10)),
        a: m[4] !== undefined ? Math.max(0, Math.min(1, parseFloat(m[4]))) : 1,
      };
    }

    m = color.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
    if (m) {
      var hex = m[1];
      if (hex.length === 3) {
        return {
          r: parseInt(hex[0] + hex[0], 16),
          g: parseInt(hex[1] + hex[1], 16),
          b: parseInt(hex[2] + hex[2], 16),
          a: 1,
        };
      }
      return {
        r: parseInt(hex.slice(0, 2), 16),
        g: parseInt(hex.slice(2, 4), 16),
        b: parseInt(hex.slice(4, 6), 16),
        a: 1,
      };
    }

    return null;
  }

  function rgbToCss(c) {
    return 'rgb(' + c.r + ', ' + c.g + ', ' + c.b + ')';
  }

  function rgbToHsl(c) {
    var r = c.r / 255;
    var g = c.g / 255;
    var b = c.b / 255;
    var max = Math.max(r, g, b);
    var min = Math.min(r, g, b);
    var h = 0;
    var s = 0;
    var l = (max + min) / 2;

    if (max !== min) {
      var d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case r:
          h = (g - b) / d + (g < b ? 6 : 0);
          break;
        case g:
          h = (b - r) / d + 2;
          break;
        default:
          h = (r - g) / d + 4;
      }
      h *= 60;
    }

    return { h: h, s: s, l: l };
  }

  function hslToRgb(h, s, l) {
    var hue = ((h % 360) + 360) % 360;
    var sat = Math.max(0, Math.min(1, s));
    var light = Math.max(0, Math.min(1, l));

    if (sat === 0) {
      var gray = clampColor(light * 255);
      return { r: gray, g: gray, b: gray, a: 1 };
    }

    function channel(n) {
      var k = (n + hue / 30) % 12;
      var a = sat * Math.min(light, 1 - light);
      return clampColor((light - a * Math.max(-1, Math.min(k - 3, Math.min(9 - k, 1)))) * 255);
    }

    return { r: channel(0), g: channel(8), b: channel(4), a: 1 };
  }

  function mixColor(a, b, amount) {
    var t = Math.max(0, Math.min(1, amount));
    return {
      r: clampColor(a.r * (1 - t) + b.r * t),
      g: clampColor(a.g * (1 - t) + b.g * t),
      b: clampColor(a.b * (1 - t) + b.b * t),
      a: 1,
    };
  }

  function relativeLuminance(c) {
    function map(v) {
      var x = v / 255;
      return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
    }
    return 0.2126 * map(c.r) + 0.7152 * map(c.g) + 0.0722 * map(c.b);
  }

  function contrastRatio(a, b) {
    var la = relativeLuminance(a);
    var lb = relativeLuminance(b);
    var lighter = Math.max(la, lb);
    var darker = Math.min(la, lb);
    return (lighter + 0.05) / (darker + 0.05);
  }

  function pickDynamicAccent(baseBg) {
    var fallback = { r: 139, g: 92, b: 246, a: 1 };
    var candidates = [];

    function pushCandidate(value, weight) {
      var parsed = parseCssColor(value);
      if (!parsed || parsed.a === 0) return;
      candidates.push({ color: parsed, weight: weight || 1 });
    }

    try {
      var meta = document.querySelector('meta[name="theme-color"], meta[name="msapplication-TileColor"]');
      if (meta && meta.content) pushCandidate(meta.content, 4);
    } catch (e) {}

    try {
      var bodyStyle = getComputedStyle(document.body);
      pushCandidate(bodyStyle.color, 1.6);
      pushCandidate(bodyStyle.borderColor, 1);
    } catch (e) {}

    try {
      var interactive = document.querySelectorAll('a, button, [role="button"], [class*="btn"], [class*="button"], [class*="cta"]');
      var max = Math.min(interactive.length, 40);
      for (var i = 0; i < max; i++) {
        var st = getComputedStyle(interactive[i]);
        pushCandidate(st.backgroundColor, 2.6);
        pushCandidate(st.color, 1.5);
        pushCandidate(st.borderColor, 1.1);
      }
    } catch (e) {}

    var best = null;
    var bestScore = -Infinity;

    for (var j = 0; j < candidates.length; j++) {
      var c = candidates[j].color;
      var hsl = rgbToHsl(c);
      var sat = hsl.s;
      var lum = relativeLuminance(c);
      if (sat < 0.18) continue;
      if (lum <= 0.05 || lum >= 0.95) continue;

      var score = sat * 70;
      score += (1 - Math.abs(lum - 0.45)) * 20;
      score += Math.min(contrastRatio(c, baseBg), 8) * 2;
      score += candidates[j].weight * 8;

      if (score > bestScore) {
        bestScore = score;
        best = c;
      }
    }

    return best || fallback;
  }

  function buildSidebarPaletteFromPage() {
    var defaultBg = { r: 18, g: 20, b: 30, a: 1 };
    var pageBg = defaultBg;

    try {
      var rootStyle = getComputedStyle(document.body || document.documentElement);
      pageBg = parseCssColor(rootStyle.backgroundColor) || defaultBg;
    } catch (e) {}

    var accent = pickDynamicAccent(pageBg);
    var accentHsl = rgbToHsl(accent);
    var accentStrong = hslToRgb(accentHsl.h, Math.max(0.35, accentHsl.s), Math.max(0.28, accentHsl.l * 0.74));
    var accent2 = hslToRgb(accentHsl.h + 24, Math.max(0.36, Math.min(0.84, accentHsl.s * 0.92)), Math.max(0.45, Math.min(0.65, accentHsl.l + 0.06)));

    var darkBase = relativeLuminance(pageBg) < 0.32
      ? mixColor(pageBg, { r: 10, g: 12, b: 18, a: 1 }, 0.42)
      : { r: 14, g: 18, b: 28, a: 1 };

    var bgStart = mixColor(darkBase, accent, 0.16);
    var bgMid = mixColor(darkBase, accent2, 0.24);
    var bgEnd = mixColor(darkBase, accent, 0.1);

    var text = { r: 229, g: 232, b: 240, a: 1 };
    var muted = mixColor(text, bgMid, 0.45);
    var soft = mixColor(text, bgMid, 0.62);

    return {
      accent: accent,
      accentStrong: accentStrong,
      accent2: accent2,
      bgStart: bgStart,
      bgMid: bgMid,
      bgEnd: bgEnd,
      text: text,
      muted: muted,
      soft: soft,
    };
  }

  function applySidebarTheme(force) {
    var now = Date.now();
    if (!force && now - sidebarThemeState.lastAppliedAt < CONFIG.themeRefreshThrottleMs) return;
    sidebarThemeState.lastAppliedAt = now;

    var palette = buildSidebarPaletteFromPage();
    var rootStyle = document.documentElement.style;

    rootStyle.setProperty('--tryon-accent', rgbToCss(palette.accent));
    rootStyle.setProperty('--tryon-accent-strong', rgbToCss(palette.accentStrong));
    rootStyle.setProperty('--tryon-accent-rgb', palette.accent.r + ', ' + palette.accent.g + ', ' + palette.accent.b);
    rootStyle.setProperty('--tryon-accent-2', rgbToCss(palette.accent2));
    rootStyle.setProperty('--tryon-accent-2-rgb', palette.accent2.r + ', ' + palette.accent2.g + ', ' + palette.accent2.b);
    rootStyle.setProperty('--tryon-sidebar-bg-start', rgbToCss(palette.bgStart));
    rootStyle.setProperty('--tryon-sidebar-bg-mid', rgbToCss(palette.bgMid));
    rootStyle.setProperty('--tryon-sidebar-bg-end', rgbToCss(palette.bgEnd));
    rootStyle.setProperty('--tryon-text', rgbToCss(palette.text));
    rootStyle.setProperty('--tryon-muted', rgbToCss(palette.muted));
    rootStyle.setProperty('--tryon-soft', rgbToCss(palette.soft));
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
  // BUTTON CREATION
  // ═══════════════════════════════════════════════════════════
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
      var overlay = document.createElement('div');
      overlay.className = 'tryon-ai-overlay';
      overlay.style.cssText = 'position:absolute;bottom:12px;left:50%;transform:translateX(-50%) translateY(8px);z-index:999998;pointer-events:all;opacity:0;transition:opacity .25s ease,transform .25s ease;';

      var btn = document.createElement('button');
      btn.className = 'tryon-ai-button';
      btn.innerHTML = '<span class="tryon-ai-btn-icon">\u2728</span> Try On';
      btn.style.cssText = 'background:linear-gradient(135deg,#8b5cf6,#3b82f6);color:#fff;border:none;padding:10px 22px;border-radius:24px;font-size:14px;font-weight:700;cursor:pointer;white-space:nowrap;box-shadow:0 4px 20px rgba(139,92,246,.45);transition:all .25s ease;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;display:flex;align-items:center;gap:6px;';

      var qBtn = document.createElement('button');
      qBtn.className = 'tryon-ai-quick-btn';
      qBtn.innerHTML = '\u26A1';
      qBtn.title = 'Quick Preview in Sidebar';
      qBtn.style.cssText = 'background:rgba(255,255,255,.15);color:#fff;border:2px solid rgba(255,255,255,.3);padding:8px 10px;border-radius:50%;font-size:14px;cursor:pointer;transition:all .25s ease;backdrop-filter:blur(4px);';

      btn.onmouseenter = function() { btn.style.transform = 'scale(1.06)'; btn.style.boxShadow = '0 6px 28px rgba(139,92,246,.55)'; };
      btn.onmouseleave = function() { btn.style.transform = 'scale(1)'; btn.style.boxShadow = '0 4px 20px rgba(139,92,246,.45)'; };
      qBtn.onmouseenter = function() { qBtn.style.background = 'rgba(139,92,246,.6)'; qBtn.style.borderColor = '#8b5cf6'; };
      qBtn.onmouseleave = function() { qBtn.style.background = 'rgba(255,255,255,.15)'; qBtn.style.borderColor = 'rgba(255,255,255,.3)'; };

      btn.addEventListener('click', function(e) { e.preventDefault(); e.stopPropagation(); handleTryOnClick(img, btn); });
      qBtn.addEventListener('click', function(e) { e.preventDefault(); e.stopPropagation(); handleQuickPreview(img); });

      var bc = document.createElement('div');
      bc.style.cssText = 'display:flex;align-items:center;gap:6px;';
      bc.appendChild(btn); bc.appendChild(qBtn);
      overlay.appendChild(bc);

      var ht = null;
      function show() { clearTimeout(ht); overlay.style.opacity = '1'; overlay.style.transform = 'translateX(-50%) translateY(0)'; }
      function hide() { clearTimeout(ht); ht = setTimeout(function() { overlay.style.opacity = '0'; overlay.style.transform = 'translateX(-50%) translateY(8px)'; }, 150); }
      img.addEventListener('mouseenter', show); img.addEventListener('mouseleave', hide);
      overlay.addEventListener('mouseenter', show); overlay.addEventListener('mouseleave', hide);

      wrapper.appendChild(overlay);
      imageOverlays.set(img, { overlay: overlay, wrapper: wrapper });
    } catch (err) { console.error('[ALTER.ai] Button error:', err); }
  }

  // ═══════════════════════════════════════════════════════════
  // CLICK HANDLERS
  // ═══════════════════════════════════════════════════════════
  function handleTryOnClick(img, button) {
    try {
      button.disabled = true; button.style.opacity = '0.7'; button.textContent = 'Opening...';
      var md = extractProductMetadata(img);
      if (!md.imageUrl) { showToast('Could not get image URL', 'error'); resetButton(button); return; }
      if (isDuplicateImage(md.imageUrl)) {
        showToast('Already processing this item...', 'info');
        resetButton(button);
        return;
      }
      duplicateCheckMap.set(normalizeImageUrl(md.imageUrl), Date.now());
      playImageAnimation(img);
      setTimeout(function() {
        try { chrome.runtime.sendMessage({ action: 'tryOnProduct', metadata: md, timestamp: Date.now() }); } catch (e) { console.error('[ALTER.ai] msg error:', e); }
        showToast('Opening ALTER.ai...', 'success');
        setTimeout(function() { resetButton(button); }, 1500);
      }, CONFIG.clickAnimationDuration);
    } catch (err) { console.error('[ALTER.ai] click error:', err); showToast('Error: ' + err.message, 'error'); resetButton(button); }
  }

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

    try {
      timeoutId = setTimeout(function() {
        finish({ success: false, error: 'Quick preview timed out' });
      }, CONFIG.quickTryOnTimeoutMs);

      chrome.runtime.sendMessage(
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
          if (chrome.runtime.lastError) {
            finish({ success: false, error: chrome.runtime.lastError.message || 'Quick preview request failed' });
            return;
          }
          finish(response || { success: false, error: 'No response from quick preview service' });
        }
      );
    } catch (err) {
      finish({ success: false, error: err.message || 'Failed to send quick preview request' });
    }
  }

  function buildMockMannequinPreview(garmentUrl) {
    var safeGarment = escapeAttr(garmentUrl || '');
    var svg = '' +
      '<svg xmlns="http://www.w3.org/2000/svg" width="720" height="960" viewBox="0 0 720 960">' +
        '<defs>' +
          '<linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">' +
            '<stop offset="0%" stop-color="#f6f3ff"/>' +
            '<stop offset="100%" stop-color="#e6efff"/>' +
          '</linearGradient>' +
          '<radialGradient id="dressGlow" cx="50%" cy="40%" r="60%">' +
            '<stop offset="0%" stop-color="#ffffff" stop-opacity="0.9"/>' +
            '<stop offset="100%" stop-color="#8b5cf6" stop-opacity="0.18"/>' +
          '</radialGradient>' +
        '</defs>' +
        '<rect x="0" y="0" width="720" height="960" fill="url(#bg)"/>' +
        '<ellipse cx="360" cy="860" rx="180" ry="38" fill="#cbd5e1" opacity="0.45"/>' +
        '<circle cx="360" cy="150" r="62" fill="#e2e8f0"/>' +
        '<rect x="308" y="210" width="104" height="80" rx="46" fill="#e2e8f0"/>' +
        '<rect x="220" y="270" width="280" height="430" rx="140" fill="#e2e8f0"/>' +
        '<rect x="210" y="300" width="300" height="380" rx="130" fill="url(#dressGlow)"/>' +
        '<rect x="120" y="320" width="100" height="260" rx="52" fill="#d8dee9"/>' +
        '<rect x="500" y="320" width="100" height="260" rx="52" fill="#d8dee9"/>' +
        '<rect x="282" y="680" width="70" height="180" rx="35" fill="#d8dee9"/>' +
        '<rect x="368" y="680" width="70" height="180" rx="35" fill="#d8dee9"/>' +
        '<rect x="206" y="294" width="308" height="388" rx="118" fill="#ffffff" opacity="0.28"/>' +
        '<image href="' + safeGarment + '" x="228" y="300" width="264" height="360" preserveAspectRatio="xMidYMid slice" opacity="0.9"/>' +
        '<text x="360" y="925" text-anchor="middle" font-family="Arial, sans-serif" font-size="24" fill="#475569">Instant mannequin preview</text>' +
      '</svg>';
    return 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg);
  }

  function runQuickTryOn(metadata) {
    var norm = normalizeImageUrl(metadata.imageUrl || '');
    if (!norm) return;

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

    requestQuickTryOn(metadata, function(response) {
      quickPreviewInFlight.delete(norm);
      var resultUrl = response && response.success ? (response.resultUrl || response.result_image_url || '') : '';
      var isGenerated = !!(response && response.success && !response.isFallback);

      if (!resultUrl) {
        resultUrl = buildMockMannequinPreview(metadata.imageUrl);
        isGenerated = false;
      }

      quickPreviewCache.set(norm, resultUrl);
      setQuickPreviewForGarment(metadata.imageUrl, resultUrl, isGenerated);
      setPreviewLoading(false);

      if (!response || !response.success) showToast('Quick preview fallback ready', 'info');
      else if (response.isFallback) showToast('Showing instant preview', 'info');
      else showToast('Quick preview ready', 'success');
    });
  }

  function resetButton(button) {
    button.disabled = false; button.style.opacity = '1';
    button.innerHTML = '<span class="tryon-ai-btn-icon">\u2728</span> Try On';
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
    var colors = { error: '#ef4444', success: '#10b981', info: '#8b5cf6' };
    var t = document.createElement('div');
    t.id = 'tryon-ai-toast';
    t.style.cssText = 'position:fixed;top:20px;right:20px;background:' + (colors[type] || colors.info) + ';color:#fff;padding:12px 20px;border-radius:10px;box-shadow:0 4px 20px rgba(0,0,0,.3);z-index:999999;font-size:14px;font-weight:600;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;animation:tryon-toast-in .3s ease-out;max-width:300px;';
    t.textContent = message;
    document.body.appendChild(t);
    setTimeout(function() { t.style.transition = 'opacity .3s,transform .3s'; t.style.opacity = '0'; t.style.transform = 'translateX(40px)'; setTimeout(function() { t.remove(); }, 300); }, 3000);
  }

  // ═══════════════════════════════════════════════════════════
  // SIDEBAR
  // ═══════════════════════════════════════════════════════════
  var sidebarEl = null;
  var sidebarToggleEl = null;
  var sidebarBackdropEl = null;
  var sidebarState = { open: false, selectedGarments: [], history: [] };

  function createSidebar() {
    if (sidebarEl) return;

    // Backdrop
    sidebarBackdropEl = document.createElement('div');
    sidebarBackdropEl.id = 'tryon-ai-sidebar-backdrop';
    sidebarBackdropEl.addEventListener('click', closeSidebar);
    document.body.appendChild(sidebarBackdropEl);

    // Toggle button
    sidebarToggleEl = document.createElement('div');
    sidebarToggleEl.id = 'tryon-ai-sidebar-toggle';
    sidebarToggleEl.innerHTML = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>';
    sidebarToggleEl.title = 'ALTER.ai Quick Try-On';
    sidebarToggleEl.addEventListener('click', toggleSidebar);
    document.body.appendChild(sidebarToggleEl);

    // Sidebar panel
    sidebarEl = document.createElement('div');
    sidebarEl.id = 'tryon-ai-sidebar';
    sidebarEl.innerHTML = buildSidebarHTML();
    document.body.appendChild(sidebarEl);

    setupSidebarEvents();
    loadSidebarHistory();
    applySidebarTheme(true);
  }

  function buildSidebarHTML() {
    return '<div class="tryon-sidebar-header">' +
      '<div class="tryon-sidebar-logo">' +
        '<svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M12 2L2 7L12 12L22 7L12 2Z" fill="url(#sg1)" stroke="url(#sg2)" stroke-width="2"/><path d="M2 17L12 22L22 17" stroke="url(#sg2)" stroke-width="2"/><path d="M2 12L12 17L22 12" stroke="url(#sg2)" stroke-width="2"/><defs><linearGradient id="sg1" x1="2" y1="2" x2="22" y2="12"><stop stop-color="#8B5CF6"/><stop offset="1" stop-color="#3B82F6"/></linearGradient><linearGradient id="sg2" x1="2" y1="12" x2="22" y2="22"><stop stop-color="#8B5CF6"/><stop offset="1" stop-color="#3B82F6"/></linearGradient></defs></svg>' +
        '<span class="tryon-sidebar-title">ALTER.ai</span>' +
        '<span class="tryon-sidebar-badge">Quick</span>' +
      '</div>' +
      '<button class="tryon-sidebar-close" id="tryon-sidebar-close"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>' +
    '</div>' +
    '<div class="tryon-sidebar-content">' +
      '<div class="tryon-sidebar-section tryon-model-section">' +
        '<div class="tryon-section-label"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg><span>Preview</span></div>' +
        '<div class="tryon-model-preview" id="tryon-model-preview">' +
          '<div class="tryon-model-placeholder" id="tryon-model-placeholder"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="rgba(139,92,246,0.4)" stroke-width="1.5"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg><span>Select a garment to preview</span></div>' +
          '<img id="tryon-model-img" class="tryon-model-img" style="display:none;" alt="Try-on preview"/>' +
          '<div class="tryon-model-loading" id="tryon-model-loading" style="display:none;"><div class="tryon-spinner"></div><span>Generating preview...</span></div>' +
        '</div>' +
        '<div class="tryon-model-actions">' +
          '<button class="tryon-action-btn tryon-action-primary" id="tryon-full-tryon-btn" disabled><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg><span>Full Try-On</span></button>' +
          '<button class="tryon-action-btn tryon-action-secondary" id="tryon-save-btn" disabled><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg><span>Save</span></button>' +
        '</div>' +
      '</div>' +
      '<div class="tryon-sidebar-section">' +
        '<div class="tryon-section-label"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg><span>Selected Items</span><span class="tryon-item-count" id="tryon-item-count">0</span></div>' +
        '<div class="tryon-garment-list" id="tryon-garment-list"><div class="tryon-empty-state" id="tryon-empty-garments"><span>Click \u26A1 on any garment to add it here</span></div></div>' +
      '</div>' +
      '<div class="tryon-sidebar-section">' +
        '<div class="tryon-section-label"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg><span>Recent</span></div>' +
        '<div class="tryon-history-list" id="tryon-history-list"><div class="tryon-empty-state"><span>No recent previews</span></div></div>' +
      '</div>' +
    '</div>' +
    '<div class="tryon-sidebar-footer">' +
      '<a class="tryon-footer-link" id="tryon-open-app-link">Open ALTER.ai</a>' +
      '<span class="tryon-footer-divider">\u00B7</span>' +
      '<span class="tryon-footer-powered">Powered by AI</span>' +
    '</div>';
  }

  function setupSidebarEvents() {
    var closeBtn = document.getElementById('tryon-sidebar-close');
    if (closeBtn) closeBtn.addEventListener('click', closeSidebar);

    var fullBtn = document.getElementById('tryon-full-tryon-btn');
    if (fullBtn) fullBtn.addEventListener('click', function() {
      if (sidebarState.selectedGarments.length === 0) return;
      var g = sidebarState.selectedGarments[sidebarState.selectedGarments.length - 1];
      var url = CONFIG.appUrl + '/try?image=' + encodeURIComponent(g.imageUrl);
      if (g.title) url += '&title=' + encodeURIComponent(g.title);
      try { chrome.runtime.sendMessage({ action: 'tryOnProduct', metadata: g, timestamp: Date.now() }); } catch(e) { window.open(url, '_blank'); }
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
      window.open(CONFIG.appUrl, '_blank');
    });
  }

  function toggleSidebar() {
    if (sidebarState.open) closeSidebar(); else {
      applySidebarTheme(true);
      sidebarState.open = true;
      sidebarEl.classList.add('open');
      sidebarToggleEl.classList.add('active');
      sidebarBackdropEl.classList.add('visible');
    }
  }

  function openSidebar(metadata) {
    if (!sidebarEl) createSidebar();
    applySidebarTheme(true);
    sidebarState.open = true;
    sidebarEl.classList.add('open');
    sidebarToggleEl.classList.add('active');
    sidebarBackdropEl.classList.add('visible');
    if (metadata) addGarmentToSidebar(metadata);
  }

  function closeSidebar() {
    sidebarState.open = false;
    if (sidebarEl) sidebarEl.classList.remove('open');
    if (sidebarToggleEl) sidebarToggleEl.classList.remove('active');
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
      item.innerHTML = '<img class="tryon-garment-thumb" src="' + escapeAttr(g.imageUrl) + '" alt="' + escapeAttr(g.title || 'Garment') + '" onerror="this.style.display=\'none\'">' +
        '<div class="tryon-garment-info"><div class="tryon-garment-name">' + escapeHtml(g.title || 'Untitled Garment') + '</div>' +
        '<div class="tryon-garment-meta">' + escapeHtml(g.price || '') + (g.brand ? ' \u00B7 ' + escapeHtml(g.brand) : '') + '</div>' + previewTag + '</div>' +
        '<button class="tryon-garment-remove" title="Remove"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>';
      item.addEventListener('click', function(e) {
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

  // ─── Sidebar History ──────────────────────────────────────
  function saveSidebarHistory() {
    try {
      sidebarState.selectedGarments.forEach(function(g) {
        sidebarState.history.unshift({ imageUrl: g.imageUrl, quickPreviewUrl: g.quickPreviewUrl || '', title: g.title, price: g.price, brand: g.brand, timestamp: Date.now() });
      });
      if (sidebarState.history.length > CONFIG.maxHistoryItems) sidebarState.history = sidebarState.history.slice(0, CONFIG.maxHistoryItems);
      try { chrome.storage.local.set({ tryon_sidebar_history: sidebarState.history }); } catch(e) {}
      renderHistoryList();
    } catch(e) {}
  }

  function loadSidebarHistory() {
    try {
      chrome.storage.local.get('tryon_sidebar_history', function(result) {
        sidebarState.history = result.tryon_sidebar_history || [];
        renderHistoryList();
      });
    } catch(e) {}
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
    console.log('[ALTER.ai] Scanned ' + found.size + ' images, ' + imageOverlays.size + ' garments detected');
  }

  function addBgImageOverlay(div, bgUrl) {
    if (imageOverlays.has(div)) return;
    var pos = getComputedStyle(div).position;
    if (pos === 'static') div.style.position = 'relative';
    var overlay = document.createElement('div');
    overlay.className = 'tryon-ai-overlay';
    overlay.style.cssText = 'position:absolute;bottom:12px;left:50%;transform:translateX(-50%) translateY(8px);z-index:999998;pointer-events:all;opacity:0;transition:opacity .25s ease,transform .25s ease;';
    var button = document.createElement('button');
    button.className = 'tryon-ai-button';
    button.innerHTML = '<span class="tryon-ai-btn-icon">\u2728</span> Try On';
    button.style.cssText = 'background:linear-gradient(135deg,#8b5cf6,#3b82f6);color:#fff;border:none;padding:10px 22px;border-radius:24px;font-size:14px;font-weight:700;cursor:pointer;white-space:nowrap;box-shadow:0 4px 20px rgba(139,92,246,.45);transition:all .25s ease;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;display:flex;align-items:center;gap:6px;';
    button.addEventListener('click', function(e) {
      e.preventDefault(); e.stopPropagation();
      var md = { imageUrl: bgUrl, title: '', price: '', brand: '', url: window.location.href };
      try { chrome.runtime.sendMessage({ action: 'tryOnProduct', metadata: md, timestamp: Date.now() }); } catch(e) {}
      showToast('Opening ALTER.ai...', 'success');
    });
    overlay.appendChild(button);
    var ht = null;
    div.addEventListener('mouseenter', function() { clearTimeout(ht); overlay.style.opacity = '1'; overlay.style.transform = 'translateX(-50%) translateY(0)'; });
    div.addEventListener('mouseleave', function() { clearTimeout(ht); ht = setTimeout(function() { overlay.style.opacity = '0'; overlay.style.transform = 'translateX(-50%) translateY(8px)'; }, 150); });
    overlay.addEventListener('mouseenter', function() { clearTimeout(ht); });
    overlay.addEventListener('mouseleave', function() { ht = setTimeout(function() { overlay.style.opacity = '0'; overlay.style.transform = 'translateX(-50%) translateY(8px)'; }, 150); });
    div.appendChild(overlay);
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

  function syncAlterAuthToken() {
    try {
      var appOrigin = new URL(CONFIG.appUrl).origin;
      if (window.location.origin !== appOrigin) return;

      var token = window.localStorage.getItem('auth_token') || '';
      if (token) {
        chrome.storage.local.set({ tryon_user_token: token });
      } else {
        chrome.storage.local.remove('tryon_user_token');
      }
    } catch (e) {
      // no-op: this should never interrupt content script behavior
    }
  }

  // ═══════════════════════════════════════════════════════════
  // MESSAGE LISTENER
  // ═══════════════════════════════════════════════════════════
  try {
    chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
      if (request.action === 'scanPage') { processImages(); sendResponse({ success: true, count: imageOverlays.size }); }
      else if (request.action === 'toggleSidebar') { toggleSidebar(); sendResponse({ success: true }); }
      else if (request.action === 'getDetectedCount') { sendResponse({ success: true, count: imageOverlays.size }); }
      return true;
    });
  } catch(e) {}

  // ═══════════════════════════════════════════════════════════
  // INITIALIZATION
  // ═══════════════════════════════════════════════════════════
  function init() {
    if (initDone) return;
    initDone = true;
    console.log('[ALTER.ai] Content script initializing...');
    syncAlterAuthToken();
    processImages();
    setupMutationObserver();
    setupIntersectionObserver();
    createSidebar();
    window.addEventListener('focus', function() { applySidebarTheme(false); });
    document.addEventListener('visibilitychange', function() {
      if (document.visibilityState === 'visible') applySidebarTheme(false);
    });
    // Re-scan on scroll (for infinite scroll pages)
    var debouncedScan = debounce(processImages, 1000);
    window.addEventListener('scroll', debouncedScan, { passive: true });
    // Re-scan on URL change (SPA navigation)
    var lastUrl = window.location.href;
    setInterval(function() {
      if (window.location.href !== lastUrl) {
        lastUrl = window.location.href;
        syncAlterAuthToken();
        cleanup();
        setTimeout(function() {
          processImages();
          setupMutationObserver();
          setupIntersectionObserver();
          applySidebarTheme(true);
        }, 500);
      }
    }, 1000);
    console.log('[ALTER.ai] Content script ready');
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
  window.addEventListener('beforeunload', cleanup, { once: true });
})();

