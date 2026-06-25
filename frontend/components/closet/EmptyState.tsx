"use client";

import { Chrome, FolderHeart, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";

type EmptyStateProps = {
  onAdd: () => void;
  variant?: "empty" | "no-results";
};

export function EmptyState({ onAdd, variant = "empty" }: EmptyStateProps) {
  if (variant === "no-results") {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-3xl border border-dashed border-border/60 bg-muted/20 px-6 py-16 text-center">
        <p className="text-sm text-muted-foreground">
          Nothing matches those filters.
        </p>
        <p className="max-w-xs text-xs text-muted-foreground/80">
          Try a different category or clear your search. Newly added pieces
          appear here once they finish processing.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center gap-5 rounded-3xl border border-dashed border-border/60 bg-muted/20 px-6 py-20 text-center">
      <div className="flex size-14 items-center justify-center rounded-full border border-border/60 bg-background">
        <FolderHeart className="size-6 text-foreground/70" />
      </div>
      <div className="max-w-sm space-y-2">
        <h3 className="font-display text-lg">Your closet is empty</h3>
        <p className="text-sm text-muted-foreground">
          Add the first piece. We&apos;ll cut out the background and tag it
          automatically so it&apos;s ready to try on in seconds.
        </p>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <Button onClick={onAdd}>
          <Plus className="size-4" />
          Add a garment
        </Button>
        <Button variant="outline" asChild>
          <a
            href="https://chromewebstore.google.com/"
            target="_blank"
            rel="noreferrer"
          >
            <Chrome className="size-4" />
            Get the extension
          </a>
        </Button>
      </div>
    </div>
  );
}
