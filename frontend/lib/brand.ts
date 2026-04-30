/**
 * GradFiT brand tokens.
 *
 * The web app expresses its palette in oklch (see `app/globals.css`). The
 * Chrome extension and any embedded SVGs we render at runtime can't always
 * use oklch yet (older Chromium, third-party iframes, etc.), so we mirror
 * the same tokens in sRGB hex here. Keep both in sync.
 *
 * The canonical brand gradient runs Primary -> Sky -> Emerald. It shows up
 * in the navbar logo, primary CTAs, sticky progress bars, the hero mesh,
 * and the extension popup header so the surfaces feel like one product.
 */

export const BRAND_HEX = {
  // Tailwind-ish names mirror existing class usage in the app.
  primary: "#4F7CFF",       // ~oklch(0.59 0.15 252)
  primaryDeep: "#3F66E0",   // hover/active
  sky500: "#0EA5E9",
  emerald400: "#34D399",
  emerald500: "#10B981",
  ink: "#1B2336",
  inkSoft: "#3B4664",
  surface: "#FFFFFF",
  surfaceTint: "rgba(255, 255, 255, 0.72)",
  border: "#E2E8F0",
  glow: "rgba(79, 124, 255, 0.25)",
} as const;

/** 135deg primary -> sky -> emerald. Used for hero CTAs and the extension header. */
export const BRAND_GRADIENT_CSS = `linear-gradient(135deg, ${BRAND_HEX.primary} 0%, ${BRAND_HEX.sky500} 50%, ${BRAND_HEX.emerald400} 100%)`;

/** Soft mesh used on hero / dashboard backgrounds. */
export const BRAND_MESH_CSS = `radial-gradient(1200px 600px at 10% -5%, rgba(79, 124, 255, 0.20), transparent 55%), radial-gradient(1000px 500px at 92% 0%, rgba(14, 165, 233, 0.18), transparent 58%), radial-gradient(800px 500px at 50% 110%, rgba(52, 211, 153, 0.18), transparent 55%)`;

/** Stops, in order, for SVG <linearGradient> elements. */
export const BRAND_GRADIENT_STOPS: ReadonlyArray<{ offset: string; color: string }> = [
  { offset: "0%", color: BRAND_HEX.primary },
  { offset: "50%", color: BRAND_HEX.sky500 },
  { offset: "100%", color: BRAND_HEX.emerald400 },
];
