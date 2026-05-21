/** Public legal / support constants (extension store + site pages). */
export const LEGAL = {
  productName: "GradFiT",
  extensionName: "GradFiT - Graduate your fit.",
  supportEmail: "support@gradfit.tech",
  websiteUrl: "https://gradfit.tech",
  apiUrl: "https://gradfit-ai.onrender.com",
  privacyUrl: "https://gradfit.tech/privacy",
  extensionPrivacyUrl: "https://gradfit.tech/extension/privacy",
  supportUrl: "https://gradfit.tech/support",
  extensionUrl: "https://gradfit.tech/extension",
  lastUpdated: "May 20, 2026",
} as const;

export type LegalSection = {
  id: string;
  title: string;
  paragraphs?: string[];
  bullets?: string[];
};
