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

  // Dev origins are intentionally included even in production builds.
  // They only take effect when the user actually browses these URLs,
  // and dev URLs never appear on a normal end user's machine. This is
  // what lets the same unpacked extension drive local-dev (sign in on
  // http://localhost:3000) and production (sign in on gradfit.tech)
  // without rebuilding config.js between environments.
  var DEV_APP_URL = "http://localhost:3000";
  var DEV_API_URL = "http://localhost:8000";

  function safeOrigin(u) {
    try { return new URL(u).origin; } catch (_e) { return ""; }
  }

  // For any apex origin (e.g. https://gradfit.tech) we ALSO accept the
  // `www.` variant (https://www.gradfit.tech), and vice-versa. Custom
  // domains on Vercel / Netlify / Cloudflare commonly redirect between
  // the two, so the user ends up signed in on whichever the DNS prefers
  // - usually www. Without this, `new URL("https://gradfit.tech").origin`
  // (apex) never matches `location.origin === "https://www.gradfit.tech"`
  // and the content script silently skips the token sync.
  function variantsOf(origin) {
    if (!origin) return [];
    var url;
    try { url = new URL(origin); } catch (_e) { return [origin]; }
    var host = url.hostname;
    var out = [origin];
    if (host.indexOf("www.") === 0) {
      out.push(url.protocol + "//" + host.slice(4) + (url.port ? ":" + url.port : ""));
    } else if (host.split(".").length >= 2 && !/^\d+\.\d+\.\d+\.\d+$/.test(host) && host !== "localhost") {
      // Only add a www-variant for real public domains (skip loopback
      // and bare IPs - "www.localhost" / "www.127.0.0.1" make no sense).
      out.push(url.protocol + "//www." + host + (url.port ? ":" + url.port : ""));
    }
    return out;
  }

  var prodOrigin = safeOrigin(APP_URL);
  var devOrigin = safeOrigin(DEV_APP_URL);
  var devLoopback = "http://127.0.0.1:3000";
  var devLoopbackApi = DEV_API_URL.replace("localhost", "127.0.0.1");

  var rawOrigins = [prodOrigin, devOrigin, devLoopback].filter(Boolean);
  var appOrigins = [];
  var apiUrlByOrigin = {};

  rawOrigins.forEach(function (origin) {
    var api;
    if (origin === prodOrigin) api = API_URL;
    else if (origin === devOrigin) api = DEV_API_URL;
    else if (origin === devLoopback) api = devLoopbackApi;
    else api = API_URL;

    variantsOf(origin).forEach(function (v) {
      if (appOrigins.indexOf(v) === -1) appOrigins.push(v);
      // Same API base serves both the apex and the www form (it's the
      // same backend regardless of which marketing URL the user lands on).
      apiUrlByOrigin[v] = api;
    });
  });

  globalThis.GRADFIT_CONFIG = {
    appUrl: APP_URL,
    apiUrl: API_URL,
    // Allowed app origins for the content-script token sync. The JWT
    // is only copied out of window.localStorage when the page origin
    // matches one of these.
    appOrigins: appOrigins,
    // Per-origin backend URL. When the token is synced from a given
    // app origin, this map is consulted to pick the matching API base
    // so dev tokens hit the dev backend and prod tokens hit prod.
    apiUrlByOrigin: apiUrlByOrigin,
    sourceHeader: "X-GradFiT-Source",
    sourceValue: "extension",
  };
})();
