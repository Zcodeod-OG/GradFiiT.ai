// ============================================================
// Enhanced Image Detection Utilities for ALTER.ai Chrome Extension
// Advanced garment/clothing recognition with multi-signal scoring
// ============================================================

/**
 * Comprehensive clothing & fashion keyword lists
 */
const CLOTHING_KEYWORDS = {
  // Primary garment types
  garments: [
    'dress', 'shirt', 'blouse', 'top', 'tee', 't-shirt', 'tshirt',
    'pants', 'trousers', 'jeans', 'denim', 'chinos', 'slacks',
    'jacket', 'coat', 'blazer', 'cardigan', 'vest', 'waistcoat',
    'sweater', 'sweatshirt', 'hoodie', 'pullover', 'jumper', 'knitwear',
    'skirt', 'shorts', 'bermuda', 'capri',
    'suit', 'tuxedo', 'formal', 'gown', 'romper', 'jumpsuit', 'overalls',
    'leggings', 'tights', 'stockings', 'joggers', 'tracksuit',
    'polo', 'henley', 'tank', 'camisole', 'bodysuit', 'corset',
    'kimono', 'kaftan', 'tunic', 'poncho', 'cape', 'shawl',
    'parka', 'anorak', 'windbreaker', 'raincoat', 'trench',
    'bikini', 'swimsuit', 'swimwear', 'bathing suit',
    'lingerie', 'underwear', 'bra', 'panties', 'boxers', 'briefs',
    'pajamas', 'pyjamas', 'nightgown', 'robe', 'loungewear',
    'uniform', 'scrubs', 'workwear', 'activewear', 'sportswear',
    'saree', 'sari', 'kurta', 'kurti', 'lehenga', 'salwar', 'churidar',
    'abaya', 'hijab', 'burkini',
  ],
  // Footwear
  footwear: [
    'shoes', 'boots', 'sneakers', 'sandals', 'heels', 'flats',
    'loafers', 'moccasins', 'oxfords', 'pumps', 'wedges',
    'slippers', 'flip-flops', 'espadrilles', 'mules', 'clogs',
    'trainers', 'running shoes', 'athletic shoes',
  ],
  // Accessories (lower weight)
  accessories: [
    'bag', 'handbag', 'purse', 'clutch', 'backpack', 'tote',
    'hat', 'cap', 'beanie', 'scarf', 'gloves', 'belt',
    'watch', 'jewelry', 'necklace', 'bracelet', 'earrings', 'ring',
    'sunglasses', 'glasses', 'tie', 'bow tie', 'cufflinks',
    'wallet', 'socks',
  ],
  // Generic fashion/product terms
  fashion: [
    'clothing', 'apparel', 'fashion', 'wear', 'outfit', 'attire',
    'garment', 'wardrobe', 'collection', 'style', 'look',
    'product', 'item', 'model', 'catalog', 'catalogue',
    'menswear', 'womenswear', 'kidswear', 'unisex',
    'designer', 'couture', 'ready-to-wear', 'prêt-à-porter',
    'new arrival', 'bestseller', 'trending', 'seasonal',
  ],
  // Fabric/material terms
  materials: [
    'cotton', 'silk', 'linen', 'wool', 'cashmere', 'polyester',
    'nylon', 'leather', 'suede', 'velvet', 'satin', 'chiffon',
    'denim', 'tweed', 'fleece', 'jersey', 'mesh', 'lace',
    'organic', 'sustainable', 'recycled',
  ],
  // Size/fit terms (indicates product context)
  sizing: [
    'size', 'small', 'medium', 'large', 'xl', 'xxl', 'xs',
    'regular', 'slim', 'relaxed', 'oversized', 'petite', 'plus size',
    'fit', 'tailored', 'loose', 'tight', 'stretch',
  ],
};

/**
 * Known fashion e-commerce domains and their specific selectors
 */
const SITE_ADAPTERS = {
  'amazon.com': {
    selectors: ['#imgTagWrapperId img', '#landingImage', '.a-dynamic-image', '#main-image-container img', '.imgTagWrapper img', '#imageBlock img'],
    productContainer: '#dp-container, #ppd, .s-result-item',
  },
  'amazon.': {
    selectors: ['#imgTagWrapperId img', '#landingImage', '.a-dynamic-image', '#main-image-container img'],
    productContainer: '#dp-container, #ppd, .s-result-item',
  },
  'zara.com': {
    selectors: ['.media-image img', '.product-detail-image img', '.product-grid-image img', 'picture.media-image img'],
    productContainer: '.product-detail-view, .product-grid-product',
  },
  'hm.com': {
    selectors: ['.product-image img', '.product-detail-main-image img', 'img.product-item-image'],
    productContainer: '.product-detail, .product-item',
  },
  'asos.com': {
    selectors: ['img[data-testid="product-img"]', '.gallery-image img', '#product-img img', 'img.gallery-image'],
    productContainer: '[data-testid="product-page"], .product-page',
  },
  'nordstrom.com': {
    selectors: ['.product-photo img', 'img[data-testid="product-image"]', '.image-container img'],
    productContainer: '.product-details-container',
  },
  'uniqlo.com': {
    selectors: ['.product-image img', '.pdp-image img', '.fr-ec-product-image img'],
    productContainer: '.product-detail, .fr-ec-product',
  },
  'nike.com': {
    selectors: ['img[data-testid="product-image"]', '.product-card__hero-image img', '#pdp_6up img'],
    productContainer: '.product-card, [data-testid="product-card"]',
  },
  'adidas.com': {
    selectors: ['.product-gallery img', '.glass-product-card__asset img', 'img[data-testid="product-card-image"]'],
    productContainer: '.product-card, .product-description',
  },
  'shein.com': {
    selectors: ['.product-intro__head-img img', '.crop-image-container img', '.S-product-item__img img'],
    productContainer: '.product-intro, .S-product-item',
  },
  'myntra.com': {
    selectors: ['.image-grid-image', '.product-image img', '.image-grid-imageContainer img'],
    productContainer: '.pdp-product-container, .product-base',
  },
  'flipkart.com': {
    selectors: ['._396cs4', '._2r_T1I img', '.CXW8mj img', '._1AtVbE img'],
    productContainer: '._1AtVbE, ._2kHMtA',
  },
  'ajio.com': {
    selectors: ['.rilrtl-products-list__item img', '.zoom-image img', '.img-alignment img'],
    productContainer: '.product-base, .detail-container',
  },
  'gap.com': {
    selectors: ['.product-image img', '.cat-product-image img'],
    productContainer: '.product, .product-card',
  },
  'mango.com': {
    selectors: ['.product-image img', '.image-container img'],
    productContainer: '.product-card, .product-images',
  },
  'forever21.com': {
    selectors: ['.product-image img', '.product-tile__image img'],
    productContainer: '.product-tile, .product-detail',
  },
  'urbanoutfitters.com': {
    selectors: ['.c-pwa-image img', '.o-pwa-product-tile__media img'],
    productContainer: '.o-pwa-product-tile, .c-pwa-product-detail',
  },
  'shopify': {
    selectors: ['.product__media img', '.product-single__photo img', '.product-featured-media img', '.product-image-container img', '.product__image img'],
    productContainer: '.product, .product-single, [data-product]',
  },
  'woocommerce': {
    selectors: ['.woocommerce-product-gallery img', '.wp-post-image', '.attachment-woocommerce_single img'],
    productContainer: '.product, .type-product',
  },
};

/**
 * Expanded product image CSS selectors (generic)
 */
const GENERIC_PRODUCT_SELECTORS = [
  // Standard product image patterns
  '.product-image img', '.product-img img', '.product-photo img',
  '.product-picture img', '.product-thumbnail img', '.product-media img',
  '.product-gallery img', '.product-image-container img',
  '.product-image-wrapper img', '.product-detail-image img',
  '.product-main-image img', '.product-hero-image img',
  
  // Class contains patterns
  '[class*="ProductImage"] img', '[class*="product-image"] img',
  '[class*="productImage"] img', '[class*="product-photo"] img',
  '[class*="productPhoto"] img', '[class*="ProductPhoto"] img',
  '[class*="product-img"] img', '[class*="productImg"] img',
  '[class*="product-picture"] img', '[class*="product-media"] img',
  '[class*="product-gallery"] img', '[class*="productGallery"] img',
  '[class*="product-detail"] img', '[class*="productDetail"] img',
  '[class*="product-hero"] img', '[class*="productHero"] img',
  '[class*="product-main"] img', '[class*="productMain"] img',
  '[class*="product-card"] img', '[class*="productCard"] img',
  '[class*="product-tile"] img', '[class*="productTile"] img',
  '[class*="product-listing"] img', '[class*="productListing"] img',
  '[class*="item-image"] img', '[class*="itemImage"] img',
  '[class*="catalog-image"] img', '[class*="catalogImage"] img',
  '[class*="merchandise"] img', '[class*="garment"] img',
  '[class*="clothing"] img', '[class*="fashion"] img',
  '[class*="apparel"] img', '[class*="outfit"] img',
  
  // Data attribute patterns
  '[data-testid*="product-image"]', '[data-testid*="ProductImage"]',
  '[data-testid*="productImage"]', '[data-testid*="product-img"]',
  '[data-testid*="gallery-image"]', '[data-testid*="hero-image"]',
  '[data-product-image]', '[data-image-id]', '[data-item-image]',
  '[data-product-component="image"]', '[data-component="product-image"]',
  '[data-zoom-image]', '[data-large-image]', '[data-full-image]',
  
  // Schema.org / microdata
  '[itemprop="image"]', '[itemprop*="image"]',
  '[itemtype*="Product"] img', '[itemtype*="product"] img',
  '[itemscope][itemtype*="Product"] img',
  
  // Gallery patterns
  '.gallery-image img', '.gallery img', '.carousel-image img',
  '.slider-image img', '.swiper-image img', '.product-carousel img',
  '.swiper-slide img', '.slick-slide img', '.glide__slide img',
  '.flickity-slider img', '.owl-item img',
  
  // E-commerce platform specific
  '.woocommerce-product-gallery img', '.product-single-photo img',
  '.shopify-product-image img', '.magento-product-image img',
  '.bigcommerce-product-image img',
  
  // Alt text patterns
  'img[alt*="product" i]', 'img[alt*="clothing" i]',
  'img[alt*="dress" i]', 'img[alt*="shirt" i]',
  'img[alt*="apparel" i]', 'img[alt*="fashion" i]',
  'img[alt*="outfit" i]', 'img[alt*="wear" i]',
  'img[alt*="jacket" i]', 'img[alt*="pants" i]',
  'img[alt*="skirt" i]', 'img[alt*="shoes" i]',
  'img[alt*="sweater" i]', 'img[alt*="coat" i]',
  'img[alt*="blouse" i]', 'img[alt*="jeans" i]',
  'img[alt*="hoodie" i]', 'img[alt*="sneaker" i]',
  'img[alt*="boot" i]', 'img[alt*="heel" i]',
  'img[alt*="model wearing" i]', 'img[alt*="front view" i]',
  'img[alt*="back view" i]', 'img[alt*="side view" i]',
  
  // Generic product containers
  '.product img', '.item img', '.product-item img',
  '.product-card img', '.product-tile img', '.product-box img',
  '.main-image img', '.primary-image img', '.featured-image img',
  'figure.product img', 'picture.product img',
  '.listing-image img', '.catalog-image img',
  '.collection-item img', '.shop-item img',
  
  // Picture elements
  'picture source', 'picture img',
  
  // Responsive image patterns
  'img[srcset]', 'img[data-srcset]',
  'img[data-src]', 'img[data-lazy-src]', 'img[data-lazy]',
  'img.lazyload', 'img.lazy', 'img[loading="lazy"]',
];

/**
 * Elements/areas to EXCLUDE (non-product images)
 */
const EXCLUSION_SELECTORS = [
  'nav img', 'header:not(.product-header) > img', 'footer img',
  '.logo img', '[class*="logo"] img', '[id*="logo"] img',
  '.icon img', '[class*="icon"] img', '.sprite',
  '.banner img', '[class*="banner"] img', '.ad img', '[class*="advertisement"] img',
  '.social img', '[class*="social"] img', '.share img',
  '.avatar img', '[class*="avatar"] img', '.profile-pic img',
  '.rating img', '.stars img', '[class*="rating"] img',
  '.payment img', '[class*="payment"] img', '.trust-badge img',
  '.breadcrumb img', '.pagination img',
  '.newsletter img', '.popup img:not(.product img)',
  '.cookie img', '.consent img',
  'svg', 'canvas',
];

/**
 * Score an image for likelihood of being a garment/fashion product
 * Returns a score object { total, breakdown }
 */
function scoreImage(img) {
  const breakdown = {};
  let total = 0;

  // ── 1. Dimension analysis ──
  const w = img.naturalWidth || img.width || 0;
  const h = img.naturalHeight || img.height || 0;
  const rect = img.getBoundingClientRect();
  const displayW = rect.width;
  const displayH = rect.height;

  if (w < 120 || h < 120) {
    breakdown.tooSmall = -100;
    return { total: -100, breakdown };
  }

  if (w >= 200 && h >= 200) {
    breakdown.goodSize = 2;
    total += 2;
  }
  if (w >= 400 && h >= 400) {
    breakdown.largeSize = 2;
    total += 2;
  }
  if (displayW >= 200 && displayH >= 200) {
    breakdown.goodDisplaySize = 1;
    total += 1;
  }

  // Aspect ratio analysis
  const aspectRatio = w / h;
  // Portrait (model shots): 0.5 - 0.85
  if (aspectRatio >= 0.5 && aspectRatio <= 0.85) {
    breakdown.portraitAspect = 3;
    total += 3;
  }
  // Near-square (product shots): 0.85 - 1.15
  else if (aspectRatio >= 0.85 && aspectRatio <= 1.15) {
    breakdown.squareAspect = 2;
    total += 2;
  }
  // Moderate landscape: 1.15 - 1.5
  else if (aspectRatio >= 1.15 && aspectRatio <= 1.5) {
    breakdown.landscapeAspect = 1;
    total += 1;
  }
  // Very wide or very tall - less likely product
  else {
    breakdown.oddAspect = -1;
    total -= 1;
  }

  // ── 2. Alt text analysis ──
  const altText = (img.alt || '').toLowerCase();
  const titleAttr = (img.title || '').toLowerCase();
  const combinedText = altText + ' ' + titleAttr;

  if (combinedText.length > 0) {
    let altScore = 0;
    const matchedKeywords = [];

    for (const keyword of CLOTHING_KEYWORDS.garments) {
      if (combinedText.includes(keyword)) {
        altScore += 4;
        matchedKeywords.push(keyword);
      }
    }
    for (const keyword of CLOTHING_KEYWORDS.footwear) {
      if (combinedText.includes(keyword)) {
        altScore += 3;
        matchedKeywords.push(keyword);
      }
    }
    for (const keyword of CLOTHING_KEYWORDS.fashion) {
      if (combinedText.includes(keyword)) {
        altScore += 2;
        matchedKeywords.push(keyword);
      }
    }
    for (const keyword of CLOTHING_KEYWORDS.materials) {
      if (combinedText.includes(keyword)) {
        altScore += 2;
        matchedKeywords.push(keyword);
      }
    }
    for (const keyword of CLOTHING_KEYWORDS.sizing) {
      if (combinedText.includes(keyword)) {
        altScore += 1;
        matchedKeywords.push(keyword);
      }
    }
    for (const keyword of CLOTHING_KEYWORDS.accessories) {
      if (combinedText.includes(keyword)) {
        altScore += 1;
        matchedKeywords.push(keyword);
      }
    }

    // Cap alt text score
    altScore = Math.min(altScore, 12);
    if (altScore > 0) {
      breakdown.altText = altScore;
      breakdown.matchedKeywords = matchedKeywords.slice(0, 5);
      total += altScore;
    }
  }

  // ── 3. URL analysis ──
  const src = (getImageSrc(img) || '').toLowerCase();
  let urlScore = 0;

  // Check for product-related URL patterns
  const productUrlPatterns = [
    /\/product[s]?\//i, /\/item[s]?\//i, /\/catalog/i,
    /\/collection/i, /\/shop\//i, /\/clothing\//i,
    /\/fashion\//i, /\/apparel\//i, /\/wear\//i,
    /\/men\//i, /\/women\//i, /\/kids\//i,
    /\/dress/i, /\/shirt/i, /\/pants/i, /\/jacket/i,
    /\/shoes/i, /\/accessories/i,
    /pdp/i, /plp/i, // product detail/listing page
  ];

  for (const pattern of productUrlPatterns) {
    if (pattern.test(src)) {
      urlScore += 2;
    }
  }

  // Check page URL too
  const pageUrl = window.location.href.toLowerCase();
  for (const pattern of productUrlPatterns) {
    if (pattern.test(pageUrl)) {
      urlScore += 1;
    }
  }

  urlScore = Math.min(urlScore, 6);
  if (urlScore > 0) {
    breakdown.urlPatterns = urlScore;
    total += urlScore;
  }

  // ── 4. DOM context analysis ──
  let contextScore = 0;
  let el = img.parentElement;
  const maxDepth = 8;

  for (let i = 0; i < maxDepth && el; i++) {
    const className = (el.className || '').toString().toLowerCase();
    const id = (el.id || '').toLowerCase();
    const tagName = el.tagName.toLowerCase();
    const combined = className + ' ' + id;

    // Product-related class/id
    if (/product|item|catalog|listing|merchandise|garment|clothing|fashion|apparel/.test(combined)) {
      contextScore += 3;
    }
    // Gallery/carousel context
    if (/gallery|carousel|slider|swiper|slideshow|zoom/.test(combined)) {
      contextScore += 2;
    }
    // Card/tile context (product listings)
    if (/card|tile|grid-item|list-item/.test(combined)) {
      contextScore += 1;
    }
    // Shopping context
    if (/shop|store|buy|cart|price|add-to/.test(combined)) {
      contextScore += 2;
    }

    // Check for schema.org Product markup
    const itemtype = el.getAttribute('itemtype') || '';
    if (itemtype.includes('Product') || itemtype.includes('product')) {
      contextScore += 5;
    }
    const itemscope = el.hasAttribute('itemscope');
    const itemprop = el.getAttribute('itemprop') || '';
    if (itemprop.includes('image')) {
      contextScore += 4;
    }

    // Data attributes
    if (el.dataset) {
      const dataStr = JSON.stringify(el.dataset).toLowerCase();
      if (/product|item|sku|variant/.test(dataStr)) {
        contextScore += 2;
      }
    }

    el = el.parentElement;
  }

  contextScore = Math.min(contextScore, 12);
  if (contextScore > 0) {
    breakdown.domContext = contextScore;
    total += contextScore;
  }

  // ── 5. Nearby elements analysis ──
  let nearbyScore = 0;
  const container = findProductContainer(img);

  if (container) {
    const containerText = container.textContent || '';

    // Check for price nearby
    if (/[$€£¥₹]\s*[\d,]+\.?\d*/.test(containerText) || /\d+[.,]\d{2}\s*(USD|EUR|GBP|INR)/.test(containerText)) {
      nearbyScore += 4;
      breakdown.priceNearby = true;
    }

    // Check for "Add to Cart" / "Buy" buttons
    const buttons = container.querySelectorAll('button, [role="button"], a.btn, .button');
    for (const btn of buttons) {
      const btnText = (btn.textContent || '').toLowerCase();
      if (/add to (cart|bag|basket)|buy now|shop now|purchase|add to wishlist/.test(btnText)) {
        nearbyScore += 4;
        breakdown.addToCartNearby = true;
        break;
      }
    }

    // Check for size selectors
    const sizeElements = container.querySelectorAll('[class*="size"], [data-size], select[name*="size"], [aria-label*="size" i]');
    if (sizeElements.length > 0) {
      nearbyScore += 3;
      breakdown.sizeSelector = true;
    }

    // Check for color selectors
    const colorElements = container.querySelectorAll('[class*="color"], [class*="swatch"], [data-color], [aria-label*="color" i]');
    if (colorElements.length > 0) {
      nearbyScore += 2;
      breakdown.colorSelector = true;
    }
  }

  nearbyScore = Math.min(nearbyScore, 10);
  if (nearbyScore > 0) {
    breakdown.nearbyElements = nearbyScore;
    total += nearbyScore;
  }

  // ── 6. Page-level signals ──
  let pageScore = 0;

  // Check meta tags
  const ogType = document.querySelector('meta[property="og:type"]');
  if (ogType && ogType.content && ogType.content.includes('product')) {
    pageScore += 3;
  }

  // Check for structured data in JSON-LD
  const jsonLdScripts = document.querySelectorAll('script[type="application/ld+json"]');
  for (const script of jsonLdScripts) {
    try {
      const data = JSON.parse(script.textContent);
      if (data['@type'] === 'Product' || (Array.isArray(data['@graph']) && data['@graph'].some(item => item['@type'] === 'Product'))) {
        pageScore += 4;
        break;
      }
    } catch { /* ignore parse errors */ }
  }

  // Check page title
  const pageTitle = (document.title || '').toLowerCase();
  for (const keyword of [...CLOTHING_KEYWORDS.garments.slice(0, 20), ...CLOTHING_KEYWORDS.fashion.slice(0, 10)]) {
    if (pageTitle.includes(keyword)) {
      pageScore += 1;
      break;
    }
  }

  pageScore = Math.min(pageScore, 6);
  if (pageScore > 0) {
    breakdown.pageSignals = pageScore;
    total += pageScore;
  }

  // ── 7. Exclusion penalties ──
