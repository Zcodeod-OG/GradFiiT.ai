/**
 * Capacitor / native shell helpers. Safe to import on web — all native
 * calls no-op when not running inside the iOS/Android WebView.
 */

import { Capacitor } from "@capacitor/core";

const APP_URL_SCHEME = "ai.gradfit.app";

export function isNativePlatform(): boolean {
  if (typeof window === "undefined") return false;
  return Capacitor.isNativePlatform();
}

export async function initNativeShell(): Promise<void> {
  if (!isNativePlatform()) return;

  const [{ SplashScreen }, { StatusBar, Style }, { App }] = await Promise.all([
    import("@capacitor/splash-screen"),
    import("@capacitor/status-bar"),
    import("@capacitor/app"),
  ]);

  try {
    await StatusBar.setStyle({ style: Style.Default });
  } catch {
    // Status bar plugin unavailable on some WebViews.
  }

  try {
    await SplashScreen.hide();
  } catch {
    // Splash may already be hidden.
  }

  void App.addListener("appUrlOpen", ({ url }) => {
    handleDeepLink(url);
  });

  const launch = await App.getLaunchUrl();
  if (launch?.url) {
    handleDeepLink(launch.url);
  }
}

function handleDeepLink(url: string): void {
  if (typeof window === "undefined") return;

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return;
  }

  const isAppScheme =
    parsed.protocol === `${APP_URL_SCHEME}:` ||
    parsed.hostname === "auth" ||
    parsed.pathname.startsWith("/auth/callback");

  if (!isAppScheme) return;

  const target = parsed.search
    ? `/auth/callback${parsed.search}`
    : "/auth/callback";
  window.location.href = target;
}

export function buildOAuthAuthorizeUrl(
  provider: "google" | "github" | "facebook",
  apiBaseUrl: string
): string {
  const base = `${apiBaseUrl.replace(/\/$/, "")}/api/auth/oauth/${provider}/authorize`;
  if (!isNativePlatform()) return base;
  return `${base}?platform=app`;
}

export async function openOAuth(provider: "google" | "github" | "facebook", apiBaseUrl: string): Promise<void> {
  const url = buildOAuthAuthorizeUrl(provider, apiBaseUrl);
  if (isNativePlatform()) {
    const { Browser } = await import("@capacitor/browser");
    await Browser.open({ url, presentationStyle: "popover" });
    return;
  }
  window.location.href = url;
}

export async function openExternalUrl(url: string): Promise<void> {
  if (!url) return;
  if (isNativePlatform()) {
    const { Browser } = await import("@capacitor/browser");
    await Browser.open({ url, presentationStyle: "fullscreen" });
    return;
  }
  window.location.href = url;
}

export async function closeInAppBrowser(): Promise<void> {
  if (!isNativePlatform()) return;
  try {
    const { Browser } = await import("@capacitor/browser");
    await Browser.close();
  } catch {
    // Browser was not open.
  }
}

export type CapturedPhoto = {
  file: File;
  dataUrl: string;
};

export async function captureNativePhoto(): Promise<CapturedPhoto | null> {
  if (!isNativePlatform()) return null;

  const { Camera, CameraResultType, CameraSource } = await import("@capacitor/camera");
  const photo = await Camera.getPhoto({
    quality: 90,
    allowEditing: false,
    resultType: CameraResultType.DataUrl,
    source: CameraSource.Prompt,
    correctOrientation: true,
  });

  if (!photo.dataUrl) return null;

  const blob = await (await fetch(photo.dataUrl)).blob();
  const ext = photo.format === "png" ? "png" : "jpeg";
  const file = new File([blob], `photo-${Date.now()}.${ext}`, {
    type: blob.type || `image/${ext}`,
  });

  return { file, dataUrl: photo.dataUrl };
}

export async function dataUrlToFile(dataUrl: string, filename: string): Promise<File> {
  const blob = await (await fetch(dataUrl)).blob();
  return new File([blob], filename, { type: blob.type || "image/jpeg" });
}
