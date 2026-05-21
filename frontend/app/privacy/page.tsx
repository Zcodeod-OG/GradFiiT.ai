import Link from "next/link";
import { LegalPageShell, LegalSections } from "@/components/legal/LegalPage";
import { appPrivacyIntro } from "@/content/legal/extension-privacy";
import { extensionPrivacySections } from "@/content/legal/extension-privacy";
import { LEGAL } from "@/content/legal/site";

export const metadata = {
  title: "Privacy Policy | GradFiT",
  description: "How GradFiT collects and uses data across the web app and browser extension.",
};

export default function PrivacyPage() {
  return (
    <LegalPageShell
      title="Privacy Policy"
      description="How GradFiT handles your data when you use our website and optional browser extension."
    >
      <LegalSections sections={[appPrivacyIntro]} />
      <p className="text-sm">
        <Link
          href="/extension/privacy"
          className="text-primary font-medium hover:underline"
        >
          Extension Privacy Policy
        </Link>{" "}
        (required for Chrome Web Store, Edge, Opera, and Brave listings)
      </p>
      <LegalSections
        sections={extensionPrivacySections.filter((s) =>
          ["collect", "use", "sharing", "choices", "contact"].includes(s.id)
        )}
      />
      <p className="text-sm text-muted-foreground">
        Full extension policy:{" "}
        <Link href={LEGAL.extensionPrivacyUrl} className="text-primary hover:underline">
          {LEGAL.extensionPrivacyUrl}
        </Link>
      </p>
    </LegalPageShell>
  );
}
