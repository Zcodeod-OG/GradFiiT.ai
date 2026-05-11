"use client";

import { motion } from "framer-motion";
import { BookmarkPlus, Loader2, Sparkles, WandSparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  garmentsApi,
  looksApi,
  tryonApi,
  type Garment,
  type Look,
  type OutfitRecommendation,
} from "@/lib/api";
import { getApiErrorMessage } from "@/lib/api-error";
import { fadeUp, staggerContainer } from "@/lib/motion";

type OutfitsGalleryProps = {
  /** When the closet changes meaningfully (add/delete), bump this so we refetch. */
  refreshKey?: number;
  onLookSaved?: (look: Look) => void;
};

export function OutfitsGallery({
  refreshKey = 0,
  onLookSaved,
}: OutfitsGalleryProps) {
  const [outfits, setOutfits] = useState<OutfitRecommendation[]>([]);
  const [loading, setLoading] = useState(true);
  // Per-outfit busy state keyed by the sorted garment-id string so the
  // spinner survives re-renders even if the list re-sorts.
  const [busy, setBusy] = useState<Record<string, "try" | "save" | undefined>>(
    {}
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    garmentsApi
      .recommendOutfits(10)
      .then((res) => {
        if (!cancelled) setOutfits(res.data?.outfits ?? []);
      })
      .catch((err) => {
        if (!cancelled) {
          toast.error(getApiErrorMessage(err, "Could not load outfit ideas."));
          setOutfits([]);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  const outfitKey = (o: OutfitRecommendation) =>
    o.garments.map((g) => g.id).join("-");

  const handleTry = async (outfit: OutfitRecommendation) => {
    const key = outfitKey(outfit);
    // Combo try-on is capped at 3 garments. Trim accessories first
    // since they're the optional outermost layer.
    const ids = outfit.garments
      .slice()
      .sort((a, b) => {
        const order = (g: Garment) =>
          g.garment_type === "accessory" ? 1 : 0;
        return order(a) - order(b);
      })
      .map((g) => g.id)
      .slice(0, 3);
    if (ids.length < 2) {
      toast.error("Outfit needs at least 2 pieces to try.");
      return;
    }
    setBusy((p) => ({ ...p, [key]: "try" }));
    try {
      const res = await tryonApi.combo(ids);
      const tryonId = res.data?.data?.tryon_id;
      if (!tryonId) throw new Error("No try-on id returned");
      toast.success("Combo try-on started — check the Looks tab when ready.");
    } catch (err) {
      toast.error(getApiErrorMessage(err, "Could not start try-on."));
    } finally {
      setBusy((p) => ({ ...p, [key]: undefined }));
    }
  };

  const handleSave = async (outfit: OutfitRecommendation) => {
    const key = outfitKey(outfit);
    setBusy((p) => ({ ...p, [key]: "save" }));
    try {
      const name = outfit.garments
        .map((g) => g.name)
        .filter(Boolean)
        .slice(0, 2)
        .join(" + ") || "New look";
      const res = await looksApi.create({
        name,
        garment_ids: outfit.garments.map((g) => g.id).slice(0, 3),
        notes: outfit.reason,
      });
      toast.success(`Saved as "${name}".`);
      onLookSaved?.(res.data);
    } catch (err) {
      toast.error(getApiErrorMessage(err, "Could not save look."));
    } finally {
      setBusy((p) => ({ ...p, [key]: undefined }));
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        Composing outfits from your closet…
      </div>
    );
  }

  if (outfits.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border/60 bg-background/60 p-8 text-center">
        <WandSparkles className="mx-auto mb-3 size-5 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          Add at least one top and one bottom (or a full-body piece) and
          we&apos;ll start composing outfit ideas.
        </p>
      </div>
    );
  }

  return (
    <motion.div
      key={refreshKey}
      initial="hidden"
      animate="show"
      variants={staggerContainer(0.06, 0.04)}
      className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3"
    >
      {outfits.map((outfit) => {
        const key = outfitKey(outfit);
        const busyState = busy[key];
        return (
          <motion.article
            key={key}
            variants={fadeUp}
            className="relative overflow-hidden rounded-2xl border border-border/40 bg-background/70 p-4 backdrop-blur-md"
          >
            {/* Palette gradient backdrop */}
            <OutfitBackdrop palette={outfit.palette} />

            <div className="relative z-10 flex flex-col gap-4">
              <div className="flex items-start justify-between gap-3">
                <Badge
                  variant="outline"
                  className="text-[10px] uppercase tracking-[0.22em]"
                >
                  {outfit.garments.length} pieces
                </Badge>
                <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                  {outfit.score.toFixed(2)}
                </span>
              </div>

              <div className="grid grid-cols-3 gap-2">
                {outfit.garments.slice(0, 3).map((g) => {
                  const thumb = g.extracted_image_url || g.image_url;
                  return (
                    <div
                      key={g.id}
                      className="relative aspect-[3/4] overflow-hidden rounded-xl border border-border/40 bg-background/80"
                      title={g.name}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={thumb}
                        alt={g.name}
                        className="size-full object-contain p-1.5"
                      />
                    </div>
                  );
                })}
              </div>

              <p className="text-xs leading-relaxed text-muted-foreground">
                {outfit.reason}
              </p>

              {outfit.palette.length > 0 ? (
                <div className="flex items-center gap-1.5">
                  {outfit.palette.map((hex, i) => (
                    <span
                      key={`${hex}-${i}`}
                      title={hex}
                      className="block size-4 rounded-full ring-1 ring-border/30"
                      style={{ backgroundColor: hex }}
                    />
                  ))}
                </div>
              ) : null}

              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  className="rounded-full"
                  onClick={() => handleTry(outfit)}
                  disabled={!!busyState}
                >
                  {busyState === "try" ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Sparkles className="size-3.5" />
                  )}
                  Try this look
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  className="rounded-full"
                  onClick={() => handleSave(outfit)}
                  disabled={!!busyState}
                  aria-label="Save outfit as a look"
                >
                  {busyState === "save" ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <BookmarkPlus className="size-3.5" />
                  )}
                  Save
                </Button>
              </div>
            </div>
          </motion.article>
        );
      })}
    </motion.div>
  );
}

function OutfitBackdrop({ palette }: { palette: string[] }) {
  if (palette.length === 0) return null;
  const [a, b = a, c = b] = palette;
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 opacity-25"
      style={{
        background: `radial-gradient(420px 240px at 20% 10%, ${a}, transparent 60%), radial-gradient(380px 220px at 80% 90%, ${b}, transparent 60%), radial-gradient(300px 180px at 50% 50%, ${c}, transparent 70%)`,
      }}
    />
  );
}
