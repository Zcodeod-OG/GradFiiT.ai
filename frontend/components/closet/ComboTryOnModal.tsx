"use client";

import { AlertCircle, BookmarkPlus, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { PipelineMeter } from "@/components/PipelineMeter";
import { useTryOnLiveStatus } from "@/components/hooks/useTryOnLiveStatus";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { looksApi, type Look } from "@/lib/api";
import { getApiErrorMessage } from "@/lib/api-error";

type ComboTryOnModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The combo try-on id to poll. Null while we have nothing to show. */
  tryonId: number | null;
  /** Garments in the combo, used when saving the result as a look. */
  garmentIds: number[];
  /** Suggested look name (e.g. "Tee + Jeans"). */
  suggestedName: string;
  /** Optional notes carried onto the saved look (the stylist rationale). */
  notes?: string | null;
  /** Fired after a look is created so the parent can refresh its list. */
  onLookSaved?: (look: Look) => void;
};

/**
 * Shows a combo try-on as it renders: live progress, the final image, or a
 * failure message. From the result the user can save the combo as a Look or
 * jump to the full try-on studio. Polling stops automatically once the
 * pipeline reaches a terminal status (see `useTryOnLiveStatus`).
 */
export function ComboTryOnModal({
  open,
  onOpenChange,
  tryonId,
  garmentIds,
  suggestedName,
  notes,
  onLookSaved,
}: ComboTryOnModalProps) {
  const { status, error } = useTryOnLiveStatus(open ? tryonId : null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Reset the saved flag whenever we open a fresh try-on.
  useEffect(() => {
    if (open) setSaved(false);
  }, [open, tryonId]);

  const resultUrl = status?.result_image_url ?? null;
  const isFailed = status?.status === "failed" || !!error;

  const saveAsLook = async () => {
    if (garmentIds.length < 2) {
      toast.error("A look needs at least 2 garments.");
      return;
    }
    setSaving(true);
    try {
      const res = await looksApi.create({
        name: suggestedName || "New look",
        garment_ids: garmentIds.slice(0, 3),
        notes: notes || undefined,
      });
      setSaved(true);
      toast.success(`Saved as "${res.data.name}".`);
      onLookSaved?.(res.data);
    } catch (err) {
      toast.error(getApiErrorMessage(err, "Could not save look."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Trying this look</DialogTitle>
          <DialogDescription>
            We&apos;re rendering the combo onto your saved photo. This usually
            takes 30-90 seconds.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="tnb-canvas relative flex aspect-[4/5] w-full items-center justify-center overflow-hidden rounded-2xl bg-muted/40">
            {resultUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={resultUrl}
                alt="Combo try-on result"
                className="size-full object-cover"
              />
            ) : isFailed ? (
              <div className="flex max-w-xs flex-col items-center gap-2 px-6 text-center">
                <AlertCircle className="size-6 text-destructive" />
                <p className="text-sm text-destructive">
                  {status?.error_message ||
                    error ||
                    "The try-on could not be completed."}
                </p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2 text-muted-foreground">
                <Loader2 className="size-6 animate-spin" />
                <p className="text-xs">
                  {status?.current_stage || "Starting render..."}
                </p>
              </div>
            )}
          </div>

          {!resultUrl && !isFailed ? (
            <PipelineMeter status={status} mode="2d" compact />
          ) : null}

          <div className="flex flex-wrap justify-end gap-2">
            {resultUrl ? (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={saveAsLook}
                  disabled={saving || saved}
                >
                  {saving ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <BookmarkPlus className="size-3.5" />
                  )}
                  {saved ? "Saved" : "Save as look"}
                </Button>
                <Button size="sm" onClick={() => onOpenChange(false)}>
                  Done
                </Button>
              </>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onOpenChange(false)}
              >
                {isFailed ? "Close" : "Hide"}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
