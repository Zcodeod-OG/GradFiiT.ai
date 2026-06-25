import type { CapacitorConfig } from "@capacitor/cli";

/**
 * v1 loads the production Next.js deployment in a WebView.
 * For local dev: CAPACITOR_SERVER_URL=http://192.168.x.x:3000 npx cap sync
 */
const serverUrl =
  process.env.CAPACITOR_SERVER_URL?.trim() || "https://gradfit.tech";

const config: CapacitorConfig = {
  appId: "ai.gradfit.app",
  appName: "GradFiiT",
  webDir: "www",
  server: {
    url: serverUrl,
    cleartext: serverUrl.startsWith("http://"),
    androidScheme: "https",
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      launchAutoHide: true,
      backgroundColor: "#f8f9fc",
      showSpinner: false,
    },
    StatusBar: {
      style: "DEFAULT",
      backgroundColor: "#f8f9fc",
    },
    Keyboard: {
      resize: "body",
      resizeOnFullScreen: true,
    },
  },
};

export default config;
