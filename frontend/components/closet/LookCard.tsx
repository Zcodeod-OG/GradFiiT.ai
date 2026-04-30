"use client";

import { motion } from "framer-motion";
import { Loader2, Pencil, Sparkles, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { type Garment, type Look } from "@/lib/api";
import { studioCard } from "@/lib/motion";
import { cn } from "@/lib/utils";

type LookCardProps = {
  look: Look;
  // Map of id → garment so we can render thumbnail rows for the
  // garments referenced by `look.garment_ids` without extra fetches.
  garmentLookup: Map<number, Garment>;
  rendering: boolean;
  onEdit: (look: Look) => void;
  onRender: (look: Look) => void;
  onDelete: (look: Look) => void;
};

export function LookCard({
  look,
  garmentLookup,
  rendering,
  onEdit,
  onRender,
  onDelete,
}: LookCardProps) {
  const garments = look.garment_ids
    .map((id) => garmentLookup.get(id))
    .filter((g): g is Garment => Boolean(g));
  const cover = look.last_rendered_image_url;
  const renderedAtLabel = look.last_rendered_at
    ? new Date(look.last_rendered_at).toLocaleDateString()
    : null;

  return (
    <motion.article
      initial="rest"
      whileHover="hover"
      animate="rest"
      variants={studioCard}
      className="flex flex-col overflow-hidden rounded-2xl border border-border/40 bg-background/70 backdrop-blur-md"
    >
      <div className="tnb-canvas relative aspect-[3/4] w-full overflow-hidden">
        {cover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={cover}
            alt={look.name}
            className="absolute inset-0 size-full object-cover"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center px-6 text-center text-xs text-muted-foreground">
            Render this look to see your preview here.
          </div>
        )}

        {rendering ? (
          <div className="absolute inset-0 flex items-center justify-center bg-background/70 backdrop-blur-sm">
            <div className="flex items-center gap-2 rounded-full bg-background px-3 py-1.5 text-xs shadow-md">
              <Loader2 className="size-3.5 animate-spin" />
              Rendering…
            </div>
          </div>
        ) : null}
      </div>

      <div className="flex flex-col gap-3 px-4 py-3">
        <div>
          <h3 className="line-clamp-1 text-sm font-medium leading-tight">
            {look.name}
          </h3>
          {look.notes ? (
            <p className="line-clamp-1 text-[11px] text-muted-foreground">
              {look.notes}
            </p>
          ) : null}
        </div>

        <div className="flex -space-x-2">
          {garments.slice(0, 4).map((g) => (
            <div
              key={g.id}
              className={cn(
                "relative size-8 shrink-0 overflow-hidden rounded-full border border-background bg-muted"
              )}
              title={g.name}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={g.extracted_image_url || g.image_url}
                alt={g.name}
                className="size-full object-contain p-0.5"
              />
            </div>
          ))}
          {garments.length === 0 ? (
            <span className="text-[11px] text-muted-foreground">
              {look.garment_ids.length} garments
            </span>
          ) : null}
        </div>

        <div className="flex items-center gap-1.5">
          <Button
            type="button"
            size="sm"
            className="flex-1 rounded-full"
            onClick={() => onRender(look)}
            disabled={rendering}
          >
            {rendering ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Sparkles className="size-3.5" />
            )}
            {cover ? "Re-render" : "Render"}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            className="rounded-full"
            onClick={() => onEdit(look)}
            aria-label="Edit look"
          >
            <Pencil className="size-3.5" />
          </Button>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            className="rounded-full"
            onClick={() => onDelete(look)}
            aria-label="Delete look"
          >
            <Trash2 className="size-3.5" />
          </Button>
        </div>

        {renderedAtLabel ? (
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Rendered {renderedAtLabel}
          </p>
        ) : null}
      </div>
    </motion.article>
  );
}
