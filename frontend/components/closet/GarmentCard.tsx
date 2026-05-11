"use client";

import { motion } from "framer-motion";
import { Loader2, Pencil, Sparkles, Trash2 } from "lucide-react";
import type { MouseEvent } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { type Garment } from "@/lib/api";
import { studioCard } from "@/lib/motion";
import { cn } from "@/lib/utils";

type GarmentCardProps = {
  garment: Garment;
  onTryOn: (garment: Garment) => void;
  onEdit: (garment: Garment) => void;
  onDelete: (garment: Garment) => void;
  onOpen?: (garment: Garment) => void;
};

const TYPE_LABEL: Record<string, string> = {
  upper_body: "Upper",
  lower_body: "Lower",
  full_body: "Full",
  outerwear: "Outerwear",
  accessory: "Accessory",
};

export function GarmentCard({
  garment,
  onTryOn,
  onEdit,
  onDelete,
  onOpen,
}: GarmentCardProps) {
  const thumb = garment.extracted_image_url || garment.image_url;
  const isProcessing =
    garment.preprocess_status === "queued" ||
    garment.preprocess_status === "processing" ||
    garment.preprocess_status === "pending";
  const isFailed = garment.preprocess_status === "failed";
  const typeLabel = garment.garment_type
    ? TYPE_LABEL[garment.garment_type] ?? garment.garment_type
    : null;
  // Top 4 swatches for the inline strip; the detail modal shows the full set.
  const swatches = (garment.color_palette ?? []).slice(0, 4);

  const handleCardClick = () => {
    if (onOpen) onOpen(garment);
  };

  // Hover actions sit inside the clickable card. We bubble-stop so a
  // click on Try on / Edit / Delete doesn't also open the detail modal.
  const stop = (fn: () => void) => (e: MouseEvent) => {
    e.stopPropagation();
    fn();
  };

  return (
    <motion.article
      initial="rest"
      whileHover="hover"
      animate="rest"
      variants={studioCard}
      className="group relative flex flex-col overflow-hidden rounded-2xl border border-border/40 bg-background/70 backdrop-blur-md"
    >
      <button
        type="button"
        onClick={handleCardClick}
        aria-label={`Open ${garment.name}`}
        className="text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-foreground/40"
        disabled={!onOpen}
      >
        <div className="tnb-canvas relative aspect-[3/4] w-full overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={thumb}
            alt={garment.name}
            className={cn(
              "absolute inset-0 size-full object-contain p-3 transition-transform duration-500",
              "group-hover:scale-[1.03]"
            )}
          />

          {isProcessing ? (
            <div className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-background/90 px-2.5 py-1 text-[10px] font-mono uppercase tracking-wider shadow-sm">
              <Loader2 className="size-3 animate-spin" />
              Preparing
            </div>
          ) : null}
          {isFailed ? (
            <div className="absolute left-3 top-3">
              <Badge variant="destructive">Failed</Badge>
            </div>
          ) : null}

          <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end gap-2 bg-gradient-to-t from-black/60 via-black/10 to-transparent p-3 opacity-0 transition-opacity duration-300 group-hover:pointer-events-auto group-hover:opacity-100">
            <Button
              type="button"
              size="sm"
              className="rounded-full"
              onClick={stop(() => onTryOn(garment))}
              disabled={isProcessing && !garment.image_url}
            >
              <Sparkles className="size-3.5" />
              Try on
            </Button>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              className="rounded-full"
              onClick={stop(() => onEdit(garment))}
              aria-label="Edit garment"
            >
              <Pencil className="size-3.5" />
            </Button>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              className="rounded-full"
              onClick={stop(() => onDelete(garment))}
              aria-label="Delete garment"
            >
              <Trash2 className="size-3.5" />
            </Button>
          </div>
        </div>
      </button>

      <div className="flex flex-col gap-1.5 px-3.5 pb-3 pt-3">
        <div className="flex items-start justify-between gap-2">
          <h3 className="line-clamp-1 text-sm font-medium leading-tight">
            {garment.name}
          </h3>
          {typeLabel ? (
            <Badge variant="outline" className="shrink-0 text-[10px]">
              {typeLabel}
            </Badge>
          ) : null}
        </div>
        {garment.category ? (
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
            {garment.category}
          </p>
        ) : null}
        {swatches.length > 0 ? (
          <div className="mt-1 flex h-1.5 items-center gap-0.5 overflow-hidden rounded-full">
            {swatches.map((s, i) => (
              <span
                key={`${s.hex}-${i}`}
                aria-hidden
                className="block h-full"
                style={{
                  backgroundColor: s.hex,
                  flexGrow: Math.max(s.weight, 0.05),
                }}
              />
            ))}
          </div>
        ) : null}
      </div>
    </motion.article>
  );
}
