"use client";

import { cn } from "@/lib/utils";

type MultiImagePickerProps = {
  images: string[];
  selected: string | null;
  onSelect: (url: string) => void;
  className?: string;
};

export function MultiImagePicker({
  images,
  selected,
  onSelect,
  className,
}: MultiImagePickerProps) {
  if (images.length <= 1) return null;

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
        Pick a variant
      </p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {images.map((url) => {
          const active = url === selected;
          return (
            <button
              key={url}
              type="button"
              onClick={() => onSelect(url)}
              className={cn(
                "relative aspect-[4/5] overflow-hidden rounded-xl border transition",
                active
                  ? "border-foreground ring-2 ring-foreground/20"
                  : "border-border/50 hover:border-border"
              )}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt="" className="size-full object-cover" />
            </button>
          );
        })}
      </div>
    </div>
  );
}
