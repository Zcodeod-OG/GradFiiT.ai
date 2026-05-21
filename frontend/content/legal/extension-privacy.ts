import { LEGAL, type LegalSection } from "./site";

export const extensionPrivacySections: LegalSection[] = [
  {
    id: "introduction",
    title: "Introduction",
    paragraphs: [
      `This Privacy Policy describes how ${LEGAL.productName} ("we", "us") collects, uses, and shares information when you use the ${LEGAL.extensionName} browser extension (the "Extension") together with your ${LEGAL.productName} account at ${LEGAL.websiteUrl}.`,
      "The Extension helps you try on clothing from online stores and receive style recommendations based on your GradFiT closet.",
    ],
  },
  {
    id: "controller",
    title: "Who we are",
    paragraphs: [
      `${LEGAL.productName} operates the Extension and the GradFiT web application.`,
      `Contact: ${LEGAL.supportEmail}`,
    ],
  },
  {
    id: "collect",
    title: "Information we collect",
    paragraphs: ["When you use the Extension, we may process the following categories of data:"],
    bullets: [
      "Account data: if you sign in on gradfit.tech, an authentication token is stored locally in the browser (chrome.storage.local) so the Extension can call our API on your behalf.",
      "Product page data: on sites you visit, the Extension reads publicly visible product images, page URLs, and nearby text (for example image alt text and titles) to detect garments and run virtual try-on.",
      "Try-on data: images you select, generated preview results, garment metadata, and related timestamps sent to our API for processing.",
      "Closet and style profile: aggregated keywords and categories from garments you saved in GradFiT, used to highlight items that may match your style on retailer pages.",
      "Affiliate attribution: when you use Buy-this links, we log outbound clicks (merchant, original URL, affiliate URL) for analytics and commission attribution.",
      "Local preferences: extension settings such as style-highlight toggle, recent try-ons, and combo-studio staging data stored in chrome.storage.local.",
    ],
  },
  {
    id: "use",
    title: "How we use information",
    bullets: [
      "Provide virtual try-on and quick preview features.",
      "Authenticate you and sync your session with the GradFiT web app.",
      "Show closet-based style recommendations on shopping sites.",
      "Generate affiliate links when you choose to open a retailer product page.",
      "Improve reliability, security, and product experience.",
      "Enforce usage limits and prevent abuse.",
    ],
  },
  {
    id: "sharing",
    title: "How we share information",
    paragraphs: [
      "We do not sell your personal information. We share data only as needed to operate the service:",
    ],
    bullets: [
      `Service providers: our API (${LEGAL.apiUrl}) and cloud infrastructure (for example hosting, image storage, and AI inference partners used by the backend).`,
      "Affiliate partners: when you follow a Buy-this link, you may be redirected through affiliate networks (such as Amazon Associates, EarnKaro, or CueLinks) subject to their policies.",
      "Legal requirements: if required by law or to protect rights, safety, and security.",
    ],
  },
  {
    id: "permissions",
    title: "Browser permissions",
    paragraphs: [
      "The Extension requests access to websites you visit (host permissions) so it can inject try-on controls on retailer pages. It uses storage for your session and preferences, scripting to run on product pages, activeTab for the current tab, and alarms for background maintenance tasks.",
      "You can disable style highlights in the Extension popup without uninstalling.",
    ],
  },
  {
    id: "retention",
    title: "Data retention",
    paragraphs: [
      "Data stored in your browser remains until you clear extension storage, sign out, or uninstall the Extension.",
      "Server-side try-on and account data are retained according to our main application privacy practices and your account settings.",
    ],
  },
  {
    id: "choices",
    title: "Your choices",
    bullets: [
      "Uninstall the Extension to stop on-page processing.",
      "Sign out at gradfit.tech to invalidate synced tokens.",
      "Turn off Style highlights in the Extension popup.",
      "Contact us to request access, correction, or deletion where applicable law provides those rights.",
    ],
  },
  {
    id: "children",
    title: "Children",
    paragraphs: [
      "The Extension is not directed to children under 13 (or the minimum age in your jurisdiction). We do not knowingly collect children's data.",
    ],
  },
  {
    id: "changes",
    title: "Changes",
    paragraphs: [
      `We may update this policy. The "Last updated" date below will change. Continued use after updates means you accept the revised policy.`,
    ],
  },
  {
    id: "contact",
    title: "Contact",
    paragraphs: [
      `Questions: ${LEGAL.supportEmail}`,
      `Support page: ${LEGAL.supportUrl}`,
    ],
  },
];

export const appPrivacyIntro: LegalSection = {
  id: "app-overview",
  title: "GradFiT privacy overview",
  paragraphs: [
    `${LEGAL.productName} includes a web application and an optional browser extension. This page summarizes privacy for the whole product.`,
    `For extension-specific details required by browser stores, see our Extension Privacy Policy.`,
  ],
};
