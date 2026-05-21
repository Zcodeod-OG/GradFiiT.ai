# Permission justification

Use these explanations in store dashboards when asked why each permission is needed.

## activeTab

Required to interact with the current shopping tab when you trigger try-on from the extension popup or when resolving the active page context for quick actions.

## storage

Stores your GradFiT authentication token (after you sign in on gradfit.tech), extension preferences, recent try-ons, combo-studio staging, and cached style-profile data locally in the browser. Nothing is synced to other extensions without your GradFiT account session.

## scripting

Injects the GradFiT sidebar, try-on controls, and style-recommendation UI on retailer product pages. Scripts run only in response to extension features, not for unrelated advertising.

## alarms

Runs lightweight background timers (for example periodic token refresh checks and maintenance tasks) without keeping a persistent page open.

## host_permissions: https://*/* and http://*/*

**Why all websites:** Users shop across thousands of fashion retailers (Shopify stores, marketplaces, brand sites). A fixed allowlist would break try-on on most stores. The extension only activates on pages where it detects product-style images and user interaction.

**What we access:** Public product images, page URLs, and nearby visible text used to identify garments. We do not read passwords, payment fields, or unrelated form data.

**What we send to our servers:** Selected image URLs or uploads, try-on requests, and metadata needed for virtual try-on — only when you use GradFiT features while signed in (or as documented for anonymous limits).

## content_scripts on &lt;all_urls&gt;

Same rationale as host permissions: universal shopping compatibility. CSS and JS add the Try on button, sidebar, and optional recommendation glow. They do not modify checkout or banking flows.

## Remote code

**None packaged in the extension.** The extension bundle contains only static JavaScript and assets. Virtual try-on inference runs on GradFiT servers via HTTPS API calls; the extension does not download or execute remote scripts inside the extension context.
