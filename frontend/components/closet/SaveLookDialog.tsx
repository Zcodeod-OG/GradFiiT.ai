"use client";

import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { looksApi, type Look } from "@/lib/api";

type SaveLookDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  garmentIds: number[];
  // When provided, the dialog operates in "rename / save changes" mode
  // for an existing look. Otherwise it creates a new one.
  existingLook?: Look | null;
  onSaved: (look: Look) => void;
};

export function SaveLookDialog({
  open,
  onOpenChange,
  garmentIds,
  existingLook,
  onSaved,
}: SaveLookDialogProps) {
  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setName(existingLook?.name ?? "");
      setNotes(existingLook?.notes ?? "");
    }
  }, [open, existingLook]);

  const submit = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error("Give your look a name first.");
      return;
    }
    if (garmentIds.length < 2) {
      toast.error("A look needs at least 2 garments.");
      return;
    }
    setSubmitting(true);
    try {
      const res = existingLook
        ? await looksApi.update(existingLook.id, {
            name: trimmed,
            notes: notes.trim() || undefined,
            garment_ids: garmentIds,
          })
        : await looksApi.create({
            name: trimmed,
            notes: notes.trim() || undefined,
            garment_ids: garmentIds,
          });
      toast.success(existingLook ? "Look updated." : "Look saved.");
      onSaved(res.data);
      onOpenChange(false);
    } catch (err) {
      const detail =
        (err as { response?: { data?: { detail?: string } } }).response?.data
          ?.detail || (err as Error).message;
      toast.error(`Could not save look: ${detail}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {existingLook ? "Update look" : "Save this look"}
          </DialogTitle>
          <DialogDescription>
            Name it so you can re-render it later in one click.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="space-y-2">
            <Label htmlFor="look-name">Name</Label>
            <Input
              id="look-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Friday office, weekend coffee, …"
              autoFocus
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="look-notes">Notes (optional)</Label>
            <Input
              id="look-notes"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Pair with brown belt"
            />
          </div>
          <p className="text-[11px] text-muted-foreground">
            {garmentIds.length} garment{garmentIds.length === 1 ? "" : "s"} in
            this look.
          </p>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button onClick={submit} disabled={submitting}>
            {submitting ? <Loader2 className="size-4 animate-spin" /> : null}
            {existingLook ? "Save changes" : "Save look"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
