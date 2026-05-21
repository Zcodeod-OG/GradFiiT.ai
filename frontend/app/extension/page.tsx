import Link from "next/link";
import { LegalPageShell } from "@/components/legal/LegalPage";
import { LEGAL } from "@/content/legal/site";

export const metadata = {
  title: "Browser Extension | GradFiT",
  description:
    "Try on clothes from any online store with the GradFiT browser extension.",
};

const storeLinks = [
  {
    name: "Chrome Web Store",
    note: "Add store URL after approval",
    href: null as string | null,
  },
  {
    name: "Microsoft Edge Add-ons",
    note: "Add store URL after approval",
    href: null,
  },
  {
    name: "Opera Add-ons",
    note: "Add store URL after approval",
    href: null,
  },
  {
    name: "Brave Software Store",
    note: "Add store URL after approval (or install from Chrome Web Store)",
    href: null,
  },
];

export default function ExtensionPage() {
  return (
    <LegalPageShell
      title="GradFiT browser extension"
      description="Wear it before you buy it — virtual try-on on any fashion site, in seconds."
    >
      <section className="space-y-4 text-sm text-muted-foreground leading-relaxed">
        <p>
          The GradFiT extension adds a Try on control on product images, a quick
          preview sidebar, closet-based recommendations, and optional Buy-this
          affiliate links. Sign in with your GradFiT account to use full features.
        </p>
        <h2 className="font-display text-lg font-semibold text-foreground pt-2">
          Install
        </h2>
        <ul className="space-y-3">
          {storeLinks.map((store) => (
            <li
              key={store.name}
              className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 border border-border rounded-lg px-4 py-3 bg-white/60"
            >
              <span className="font-medium text-foreground">{store.name}</span>
              {store.href ? (
                <a
                  href={store.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  Install
                </a>
              ) : (
                <span className="text-xs text-muted-foreground">{store.note}</span>
              )}
            </li>
          ))}
        </ul>
        <p>
          <Link href="/extension/privacy" className="text-primary hover:underline">
            Extension Privacy Policy
          </Link>
          {" · "}
          <Link href="/support" className="text-primary hover:underline">
            Support
          </Link>
          {" · "}
          <a
            href={`mailto:${LEGAL.supportEmail}`}
            className="text-primary hover:underline"
          >
            {LEGAL.supportEmail}
          </a>
        </p>
      </section>
    </LegalPageShell>
  );
}
