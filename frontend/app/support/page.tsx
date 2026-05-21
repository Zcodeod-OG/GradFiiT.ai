import Link from "next/link";
import { LegalPageShell } from "@/components/legal/LegalPage";
import { LEGAL } from "@/content/legal/site";

export const metadata = {
  title: "Support | GradFiT",
  description: "Get help with GradFiT and the browser extension.",
};

export default function SupportPage() {
  return (
    <LegalPageShell
      title="Support"
      description="Help with virtual try-on, the browser extension, and your GradFiT account."
    >
      <section className="space-y-4 text-sm text-muted-foreground leading-relaxed">
        <p>
          Email us at{" "}
          <a
            href={`mailto:${LEGAL.supportEmail}`}
            className="text-primary font-medium hover:underline"
          >
            {LEGAL.supportEmail}
          </a>
          . We typically respond within a few business days.
        </p>
        <h2 className="font-display text-lg font-semibold text-foreground pt-4">
          Browser extension
        </h2>
        <ul className="list-disc pl-5 space-y-2">
          <li>
            Sign in at{" "}
            <Link href="/login" className="text-primary hover:underline">
              gradfit.tech
            </Link>{" "}
            before using try-on on retailer sites.
          </li>
          <li>
            Learn what the extension does on the{" "}
            <Link href="/extension" className="text-primary hover:underline">
              extension overview
            </Link>
            .
          </li>
          <li>
            Privacy:{" "}
            <Link
              href="/extension/privacy"
              className="text-primary hover:underline"
            >
              Extension Privacy Policy
            </Link>
          </li>
        </ul>
        <h2 className="font-display text-lg font-semibold text-foreground pt-4">
          Troubleshooting
        </h2>
        <ul className="list-disc pl-5 space-y-2">
          <li>Reload the retailer page after signing in.</li>
          <li>
            In <code className="text-xs bg-muted px-1 py-0.5 rounded">chrome://extensions</code>,
            click Reload on GradFiT, then refresh the store tab.
          </li>
          <li>
            Ensure third-party cookies and site data are not blocked for gradfit.tech.
          </li>
        </ul>
      </section>
    </LegalPageShell>
  );
}
