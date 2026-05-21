import type { ReactNode } from "react";
import Link from "next/link";
import type { LegalSection } from "@/content/legal/site";
import { LEGAL } from "@/content/legal/site";

export function LegalPageShell({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <main className="min-h-screen bg-background">
      <div className="container-main py-16 max-w-3xl">
        <p className="text-sm text-muted-foreground mb-2">
          <Link href="/" className="hover:text-foreground transition-colors">
            GradFiT
          </Link>
          {" / "}
          <span className="text-foreground">{title}</span>
        </p>
        <h1 className="font-display text-3xl font-bold tracking-tight text-foreground mb-3">
          {title}
        </h1>
        {description ? (
          <p className="text-muted-foreground mb-10 leading-relaxed">{description}</p>
        ) : null}
        <div className="surface-panel p-8 md:p-10 space-y-10">{children}</div>
        <p className="text-xs text-muted-foreground mt-8">
          Last updated: {LEGAL.lastUpdated}
        </p>
      </div>
    </main>
  );
}

export function LegalSections({ sections }: { sections: LegalSection[] }) {
  return (
    <>
      {sections.map((section) => (
        <section key={section.id} id={section.id} className="scroll-mt-24">
          <h2 className="font-display text-lg font-semibold text-foreground mb-3">
            {section.title}
          </h2>
          {section.paragraphs?.map((p) => (
            <p key={p.slice(0, 40)} className="text-sm text-muted-foreground leading-relaxed mb-3">
              {p}
            </p>
          ))}
          {section.bullets?.length ? (
            <ul className="list-disc pl-5 space-y-2 text-sm text-muted-foreground">
              {section.bullets.map((b) => (
                <li key={b.slice(0, 48)}>{b}</li>
              ))}
            </ul>
          ) : null}
        </section>
      ))}
    </>
  );
}
