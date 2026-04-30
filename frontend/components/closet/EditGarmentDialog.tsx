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
import { garmentsApi, type Garment } from "@/lib/api";

type EditGarmentDialogProps = {
  garment: Garment | null;
  onClose: () => void;
  onSaved: (garment: Garment) => void;
};

export function EditGarmentDialog({
  garment,
  onClose,
  onSaved,
}: EditGarmentDialogProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (garment) {
      setName(garment.name);
      setDescription(garment.description ?? "");
      setCategory(garment.category ?? "");
    }
  }, [garment]);

  if (!garment) return null;

  const submit = async () => {
    setSaving(true);
    try {
      const res = await garmentsApi.update(garment.id, {
        name: name.trim() || garment.name,
        description: description.trim() || undefined,
        category: category.trim() || undefined,
      });
      toast.success("Saved.");
      onSaved(res.data);
      onClose();
    } catch (err) {
      const detail =
        (err as { response?: { data?: { detail?: string } } }).response?.data
          ?.detail || (err as Error).message;
      toast.error(`Could not save: ${detail}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={!!garment} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit garment</DialogTitle>
          <DialogDescription>
            Update the name, description, or category. Type and tags are set
            automatically.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="space-y-2">
            <Label htmlFor="edit-garment-name">Name</Label>
            <Input
              id="edit-garment-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-garment-description">Description</Label>
            <Input
              id="edit-garment-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-garment-category">Category</Label>
            <Input
              id="edit-garment-category"
              value={category}
              onChange={(event) => setCategory(event.target.value)}
              placeholder="e.g. Office, Weekend, Festive"
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={saving}>
            {saving ? <Loader2 className="size-4 animate-spin" /> : null}
            Save
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
