"use client";

import { motion } from "framer-motion";
import {
  Layers,
  Loader2,
  Plus,
  RotateCcw,
  Save,
  Sparkles,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  type ComboQuality,
  type Garment,
  type Look,
  looksApi,
  tryonApi,
} from "@/lib/api";
import { fadeUp } from "@/lib/motion";
import { cn } from "@/lib/utils";

import { SaveLookDialog } from "./SaveLookDialog";
import { SuggestedPairings } from "./SuggestedPairings";

type OutfitBuilderProps = {
  garments: Garment[];
  // The look currently being edited, or null when building from scratch.
  // When set, the builder hydrates its slots from `look.garment_ids` so
  // "Edit" on a saved look round-trips through this component.
  editingLook: Look | null;
  onClearEditing: () => void;
  onLookSaved: (look: Look) => void;
};

const MAX_SLOTS = 3;
const POLL_INTERVAL_MS = 2500;
const POLL_TIMEOUT_MS = 5 * 60 * 1000;
const SLOT_LABELS = ["Layer 1 · base", "Layer 2 · mid", "Layer 3 · top"];

type RenderState =
  | { kind: "idle" }
  | { kind: "rendering"; tryonId: number | null }
  | { kind: "result"; tryonId: number; imageUrl: string }
  | { kind: "error"; message: string };

export function OutfitBuilder({
  garments,
  editingLook,
  onClearEditing,
  onLookSaved,
}: OutfitBuilderProps) {
  // Slots hold up to MAX_SLOTS garments in bottom→top order to match
  // the combo endpoint's expectation (`garment_ids` ordered base → top).
  const [slots, setSlots] = useState<(Garment | null)[]>(() =>
    Array.from({ length: MAX_SLOTS }, () => null)
  );
  const [quality, setQuality] = useState<ComboQuality>("balanced");
  const [renderState, setRenderState] = useState<RenderState>({ kind: "idle" });
  const [saveOpen, setSaveOpen] = useState(false);

  // Only ready garments can be sent to the combo endpoint -- the
  // background-removed extracted_image_url has to exist on the server
  // before Fashn can chain it.
  const pickerGarments = useMemo(
    () => garments.filter((g) => g.preprocess_status === "ready"),
    [garments]
  );

  // Hydrate slots when "Edit" was clicked on a saved look. Looks store
  // ids only, so we resolve them against the closet's garments cache.
  useEffect(() => {
    if (!editingLook) return;
    const next: (Garment | null)[] = Array.from(
      { length: MAX_SLOTS },
      () => null
    );
    editingLook.garment_ids.slice(0, MAX_SLOTS).forEach((id, idx) => {
      const garment = garments.find((g) => g.id === id);
      if (garment) next[idx] = garment;
    });
    setSlots(next);
    setRenderState({ kind: "idle" });
  }, [editingLook, garments]);

  const filledIds = slots
    .filter((g): g is Garment => g !== null)
    .map((g) => g.id);
  const filledCount = filledIds.length;

  // Anchor "Complete the look" suggestions on the most recently filled
  // slot so adding a second piece refreshes the strip with pairings for
  // the newest pick. Returns null when no slots are filled or every
  // slot is taken (no point suggesting more).
  const suggestionAnchor = useMemo<Garment | null>(() => {
    if (filledCount === 0 || filledCount >= MAX_SLOTS) return null;
    for (let i = slots.length - 1; i >= 0; i -= 1) {
      const slot = slots[i];
      if (slot) return slot;
    }
    return null;
  }, [slots, filledCount]);

  const addGarment = (garment: Garment) => {
    if (filledIds.includes(garment.id)) {
      toast("Already in this look.");
      return;
    }
    const idx = slots.findIndex((s) => s === null);
    if (idx === -1) {
      toast.error("Combo try-on supports up to 3 garments.");
      return;
    }
    setSlots((prev) => {
      const next = [...prev];
      next[idx] = garment;
      return next;
    });
  };

  const removeSlot = (index: number) => {
    setSlots((prev) => {
      const next = [...prev];
      next[index] = null;
      return next;
    });
  };

  const reset = () => {
    setSlots(Array.from({ length: MAX_SLOTS }, () => null));
    setRenderState({ kind: "idle" });
    onClearEditing();
  };

  const tryThisLook = async () => {
    if (filledCount < 2) {
      toast.error("Add at least 2 garments to render a combo.");
      return;
    }
    setRenderState({ kind: "rendering", tryonId: null });
    try {
      // If this builder session is editing a saved look, route through
      // /api/looks/{id}/render so the look's last_rendered_tryon_id is
      // wired up server-side. Otherwise use the raw combo endpoint.
      const res = editingLook
        ? await looksApi.render(editingLook.id, { quality })
        : await tryonApi.combo(filledIds, undefined, quality);
      const tryonId = res.data.data?.tryon_id;
      if (!tryonId) throw new Error("No tryon id returned");
      setRenderState({ kind: "rendering", tryonId });

      const deadline = Date.now() + POLL_TIMEOUT_MS;
      while (Date.now() < deadline) {
        const status = await tryonApi.getStatus(tryonId);
        const payload = status.data;
        if (payload?.result_image_url) {
          setRenderState({
            kind: "result",
            tryonId,
            imageUrl: payload.result_image_url,
          });
          return;
        }
        if (
          payload?.status === "FAILED" ||
          payload?.status === "failed"
        ) {
          throw new Error(payload?.error_message || "Render failed");
        }
        await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
      }
      throw new Error("Render timed out");
    } catch (err) {
      const message =
        (err as { response?: { data?: { detail?: string } } }).response?.data
          ?.detail || (err as Error).message;
      setRenderState({ kind: "error", message });
      toast.error(message);
    }
  };

  const isRendering = renderState.kind === "rendering";

  return (
    <motion.section variants={fadeUp} className="flex flex-col gap-6">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        {/* Builder canvas */}
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Layers className="size-4 text-muted-foreground" />
              <h2 className="font-display text-lg">
                {editingLook ? `Editing "${editingLook.name}"` : "Build a look"}
              </h2>
            </div>
            <div className="flex items-center gap-2">
              {editingLook ? (
                <Button variant="ghost" size="sm" onClick={reset}>
                  <RotateCcw className="size-3.5" />
                  Start fresh
                </Button>
              ) : null}
              {filledCount > 0 ? (
                <Button variant="ghost" size="sm" onClick={reset}>
                  Clear
                </Button>
              ) : null}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            {slots.map((slot, index) => (
              <SlotCard
                key={index}
                slot={slot}
                label={SLOT_LABELS[index]}
                onRemove={() => removeSlot(index)}
              />
            ))}
          </div>

          <SuggestedPairings
            key={suggestionAnchor?.id ?? "none"}
            anchor={suggestionAnchor}
            excludeIds={filledIds}
            onPick={(g) => addGarment(g)}
          />

          {/* Result canvas */}
          <div className="tnb-canvas relative flex aspect-[4/5] w-full items-center justify-center overflow-hidden rounded-2xl">
            {renderState.kind === "result" ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={renderState.imageUrl}
                alt="Combo try-on result"
                className="size-full object-cover"
              />
            ) : renderState.kind === "rendering" ? (
              <div className="flex flex-col items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-5 animate-spin" />
                Rendering combo… this can take 30-90s.
              </div>
            ) : renderState.kind === "error" ? (
              <p className="max-w-sm px-6 text-center text-sm text-destructive">
                {renderState.message}
              </p>
            ) : (
              <p className="max-w-sm px-6 text-center text-xs text-muted-foreground">
                Add 2 or 3 garments and tap{" "}
                <span className="font-medium">Try this look</span> to render
                them onto your saved photo.
              </p>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border/40 bg-background/60 p-3">
            <div className="flex items-center gap-2">
              <span className="text-[11px] uppercase tracking-wider text-muted-foreground">
                Quality
              </span>
              {(["fast", "balanced"] as const).map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => setQuality(q)}
                  className={cn(
                    "rounded-full px-3 py-1 text-[11px] uppercase tracking-wider transition-colors",
                    quality === q
                      ? "bg-foreground text-background"
                      : "bg-muted/40 text-foreground/70 hover:bg-muted/60"
                  )}
                  disabled={isRendering}
                >
                  {q}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2">
              {renderState.kind === "result" ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSaveOpen(true)}
                >
                  <Save className="size-3.5" />
                  {editingLook ? "Save changes" : "Save look"}
                </Button>
              ) : null}
              <Button
                size="sm"
                onClick={tryThisLook}
                disabled={filledCount < 2 || isRendering}
              >
                {isRendering ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Sparkles className="size-3.5" />
                )}
                Try this look
              </Button>
            </div>
          </div>
        </div>

        {/* Garment picker */}
        <aside className="flex max-h-[640px] flex-col gap-3 rounded-2xl border border-border/40 bg-background/60 p-4 backdrop-blur-md">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium">Tap to add</h3>
            <span className="text-[11px] text-muted-foreground">
              {pickerGarments.length} ready
            </span>
          </div>
          {pickerGarments.length === 0 ? (
            <div className="flex flex-1 items-center justify-center px-4 text-center text-xs text-muted-foreground">
              No ready garments yet. Once your closet items finish processing,
              they show up here.
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-2 overflow-y-auto pr-1">
              {pickerGarments.map((garment) => {
                const inLook = filledIds.includes(garment.id);
                return (
                  <button
                    type="button"
                    key={garment.id}
                    onClick={() => addGarment(garment)}
                    className={cn(
                      "tnb-canvas group relative aspect-square overflow-hidden rounded-xl text-left",
                      inLook
                        ? "ring-2 ring-foreground"
                        : "hover:ring-1 hover:ring-border"
                    )}
                    title={garment.name}
                    disabled={inLook && filledCount >= MAX_SLOTS}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={garment.extracted_image_url || garment.image_url}
                      alt={garment.name}
                      className="absolute inset-0 size-full object-contain p-1.5"
                    />
                    {inLook ? (
                      <div className="absolute right-1 top-1 rounded-full bg-foreground/90 p-0.5 text-background">
                        <Plus className="size-3 rotate-45" />
                      </div>
                    ) : null}
                  </button>
                );
              })}
            </div>
          )}
        </aside>
      </div>

      <SaveLookDialog
        open={saveOpen}
        onOpenChange={setSaveOpen}
        garmentIds={filledIds}
        existingLook={editingLook}
        onSaved={(look) => {
          onLookSaved(look);
          setSaveOpen(false);
        }}
      />
    </motion.section>
  );
}

function SlotCard({
  slot,
  label,
  onRemove,
}: {
  slot: Garment | null;
  label: string;
  onRemove: () => void;
}) {
  return (
    <div
      className={cn(
        "tnb-canvas relative flex aspect-[3/4] flex-col items-center justify-center overflow-hidden rounded-2xl text-center"
      )}
    >
      {slot ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={slot.extracted_image_url || slot.image_url}
            alt={slot.name}
            className="absolute inset-0 size-full object-contain p-3"
          />
          <button
            type="button"
            onClick={onRemove}
            className="absolute right-2 top-2 rounded-full bg-background/90 p-1 shadow-sm transition-colors hover:bg-background"
            aria-label="Remove from slot"
          >
            <X className="size-3.5" />
          </button>
          <span className="absolute bottom-2 left-2 rounded-full bg-background/85 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider">
            {slot.garment_type
              ? slot.garment_type.replace("_", " ")
              : label.split(" · ")[1]}
          </span>
        </>
      ) : (
        <span className="px-3 text-[11px] uppercase tracking-wider text-muted-foreground">
          {label}
        </span>
      )}
    </div>
  );
}
