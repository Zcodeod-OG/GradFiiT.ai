"use client";

import { motion } from "framer-motion";
import { Trash2 } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { fadeUp, staggerContainer } from "@/lib/motion";
import { cn } from "@/lib/utils";

type GenerationItem = {
  id: number;
  prompt: string;
  primary_image_url: string | null;
  status: string;
  created_at: string;
};

type GenerationGalleryProps = {
  items: GenerationItem[];
  emptyMessage?: string;
  detailHrefBase: string;
  onDelete?: (id: number) => void;
  className?: string;
};

export function GenerationGallery({
  items,
  emptyMessage,
  detailHrefBase,
  onDelete,
  className,
}: GenerationGalleryProps) {
  if (!items.length) {
    return (
      <div className="rounded-3xl border border-dashed border-border/50 p-10 text-center text-sm text-muted-foreground">
        {emptyMessage || "Generations will appear here."}
      </div>
    );
  }

  return (
    <motion.div
      initial="hidden"
      animate="show"
      variants={staggerContainer(0.05, 0.05)}
      className={cn(
        "grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4",
        className
      )}
    >
      {items.map((item) => (
        <motion.article
          key={item.id}
          variants={fadeUp}
          className="group relative overflow-hidden rounded-2xl border border-border/40 bg-muted/30"
        >
          <Link href={`${detailHrefBase}/${item.id}`} className="block">
            <div className="aspect-[4/5] w-full bg-muted">
              {item.primary_image_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={item.primary_image_url}
                  alt={item.prompt.slice(0, 80)}
                  className="size-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                  loading="lazy"
                />
              ) : (
                <div className="flex size-full items-center justify-center text-xs text-muted-foreground">
                  {item.status}
                </div>
              )}
            </div>
            <div className="p-3 space-y-1">
              <p className="text-xs text-muted-foreground line-clamp-2">
                {item.prompt}
              </p>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground/70">
                {new Date(item.created_at).toLocaleString()}
              </p>
            </div>
          </Link>
          {onDelete ? (
            <Button
              variant="secondary"
              size="icon"
              className="absolute right-2 top-2 size-7 opacity-0 group-hover:opacity-100 transition-opacity"
              onClick={(event) => {
                event.preventDefault();
                onDelete(item.id);
              }}
              aria-label="Delete generation"
            >
              <Trash2 className="size-3.5" />
            </Button>
          ) : null}
        </motion.article>
      ))}
    </motion.div>
  );
}
