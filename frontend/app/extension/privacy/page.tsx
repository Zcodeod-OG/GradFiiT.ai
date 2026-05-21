import { LegalPageShell, LegalSections } from "@/components/legal/LegalPage";
import { extensionPrivacySections } from "@/content/legal/extension-privacy";

export const metadata = {
  title: "Extension Privacy Policy | GradFiT",
  description:
    "Privacy policy for the GradFiT browser extension (Chrome, Edge, Opera, Brave).",
};

export default function ExtensionPrivacyPage() {
  return (
    <LegalPageShell
      title="Extension Privacy Policy"
      description="This policy applies to the GradFiT browser extension only. It is the URL listed in browser extension stores."
    >
      <LegalSections sections={extensionPrivacySections} />
    </LegalPageShell>
  );
}
