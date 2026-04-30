"use client";

import * as React from "react";
import { ThemeProvider as NextThemesProvider, ThemeProviderProps } from "next-themes";

/**
 * Wraps `next-themes` so the rest of the app can `useTheme()` from the
 * studios shell without importing the underlying lib directly. Default
 * scheme is dark — matches the thenewblack-style studio canvases — but
 * the toggle stores the user's choice in `localStorage`.
 */
export function ThemeProvider({ children, ...props }: ThemeProviderProps) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="dark"
      enableSystem
      disableTransitionOnChange
      {...props}
    >
      {children}
    </NextThemesProvider>
  );
}
