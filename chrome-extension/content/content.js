// ============================================================
// ALTER.ai Chrome Extension - Content Script
// Enhanced garment detection + Quick Try-On Sidebar
// ============================================================
(function () {
  'use strict';

  var CONFIG = {
    minImageSize: 150, minDisplaySize: 100, debounceDelay: 300,
    duplicateCheckWindow: 5000, clickAnimationDuration: 900,
    detectionThreshold: 5, maxScanDepth: 10,
    appUrl: 'http://localhost:3000', maxSidebarGarments: 10, maxHistoryItems: 20,
  };

  var processedImages = new Set();
  var imageOverlays = new Map();
  var observer = null;
  var duplicateCheckMap = new Map();

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
    if (processedImages.has(n)) return true;
    if (duplicateCheckMap.has(n) && Date.now() - duplicateCheckMap.get(n) < CONFIG.duplicateCheckWindow) return true;
    return false;
  }

  function debounce(fn, wait) { var t; return function() { var a = arguments, c = this; clearTimeout(t); t = setTimeout(function() { fn.apply(c, a); }, wait); }; }

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
    if (!imageUrl || isDuplicateImage(imageUrl)) return;
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
      processedImages.add(normalizeImageUrl(imageUrl));
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
