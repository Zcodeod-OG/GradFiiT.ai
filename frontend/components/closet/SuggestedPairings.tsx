"use client";

import { Loader2, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";

import {
  garmentsApi,
  type Garment,
  type GarmentSuggestion,
} from "@/lib/api";
import { cn } from "@/lib/utils";

type SuggestedPairingsProps = {
  // The garment we're completing the look around. When null the strip
  // hides itself; when it changes we re-fetch.
  anchor: Garment | null;
  // Garments already placed in the look. We hide them from suggestions
  // so users don't see "add" on something they've already added.
  excludeIds: number[];
  onPick: (garment: GarmentSuggestion) => void;
  // Hide the strip entirely (e.g. when all slots are full).
  hidden?: boolean;
};

type FetchState = {
  // The anchor id we last successfully resolved. While this differs
  // from the current `anchor.id` prop the UI shows the loading state,
  // so we never need a separate `loading` flag (and don't have to call
  // setState synchronously inside the effect to manage one).
  anchorId: number | null;
  status: "ready" | "error";
  items: GarmentSuggestion[];
};

const INITIAL_STATE: FetchState = {
  anchorId: null,
  status: "ready",
  items: [],
};

export function SuggestedPairings({
  anchor,
  excludeIds,
  onPick,
  hidden,
}: SuggestedPairingsProps) {
  const [state, setState] = useState<FetchState>(INITIAL_STATE);

  useEffect(() => {
    if (!anchor || hidden) return;
    let cancelled = false;
    garmentsApi
      .suggestions(anchor.id, 8)
      .then((res) => {
        if (cancelled) return;
        setState({
          anchorId: anchor.id,
          status: "ready",
          items: res.data ?? [],
        });
      })
      .catch(() => {
        if (cancelled) return;
        setState({ anchorId: anchor.id, status: "error", items: [] });
      });
    return () => {
      cancelled = true;
    };
  }, [anchor, hidden]);

  if (hidden || !anchor) return null;

  const loading = state.anchorId !== anchor.id;
  const errored = !loading && state.status === "error";
  const items = loading ? [] : state.items;
  const visible = items.filter((s) => !excludeIds.includes(s.id));

  if (!loading && !errored && visible.length === 0) return null;

  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-border/40 bg-background/60 p-4 backdrop-blur-md">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="size-3.5 text-muted-foreground" />
          <h3 className="text-sm font-medium">Complete the look</h3>
        </div>
        <span className="text-[11px] uppercase tracking-wider text-muted-foreground">
          based on {anchor.name}
        </span>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 px-1 py-3 text-xs text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" />
          Finding pairings…
        </div>
      ) : errored ? (
        <p className="px-1 py-2 text-xs text-muted-foreground">
          Could not load suggestions.
        </p>
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-1">
          {visible.map((s) => (
            <button
              type="button"
              key={s.id}
              onClick={() => onPick(s)}
              className={cn(
                "tnb-canvas group relative flex h-[152px] w-[120px] shrink-0 flex-col overflow-hidden rounded-xl text-left transition-shadow hover:ring-1 hover:ring-border"
              )}
              title={`Add ${s.name}`}
            >
              <div className="relative h-[104px] w-full">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={s.extracted_image_url || s.image_url}
                  alt={s.name}
                  className="absolute inset-0 size-full object-contain p-2"
                />
              </div>
              <div className="flex flex-col gap-0.5 px-2 py-1.5">
                <span className="truncate text-[11px] font-medium">
                  {s.name}
                </span>
                <span className="truncate text-[10px] text-muted-foreground">
                  {s.reason}
                </span>
              </div>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
