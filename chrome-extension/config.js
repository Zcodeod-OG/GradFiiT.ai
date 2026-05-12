/**
 * GradFiT extension build-time config.
 *
 * The CI build script (see chrome-extension/scripts/build.sh) rewrites
 * the placeholder URLs below so the same source ships dev, staging, and
 * prod artifacts. Keep this file as a CLASSIC script (no ES module
 * `export` statements) so it loads cleanly in both the MV3 service
 * worker (via importScripts) and content-script contexts.
 *
 * Source flag: `X-GradFiT-Source: extension` is attached to every
 * outbound API call so the backend Provider Router lands extension
 * traffic on Fashn for sub-second inference, while the web app stays
 * on FLUX.
 */

(function () {
  // __GRADFIT_APP_URL__ - replaced at build time by scripts/build.sh
  var APP_URL = "https://gradfit.tech";
  // __GRADFIT_API_URL__ - replaced at build time by scripts/build.sh
  var API_URL = "https://gradfit-ai.onrender.com";

  globalThis.GRADFIT_CONFIG = {
    appUrl: APP_URL,
    apiUrl: API_URL,
    sourceHeader: "X-GradFiT-Source",
    sourceValue: "extension",
  };
})();
