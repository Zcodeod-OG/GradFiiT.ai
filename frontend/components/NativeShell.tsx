"use client";

import { useEffect } from "react";

import { initNativeShell } from "@/lib/platform";

/**
 * Initializes Capacitor plugins when the Next.js app runs inside the
 * native WebView (StatusBar, SplashScreen, deep-link handler).
 */
export function NativeShell() {
  useEffect(() => {
    void initNativeShell();
  }, []);

  return null;
}
