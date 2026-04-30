"use client";

import { Link2, Loader2, Upload } from "lucide-react";
import { useState } from "react";
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
import { RefImageDropzone } from "@/components/studios/RefImageDropzone";
import { garmentsApi, type Garment } from "@/lib/api";
import { cn } from "@/lib/utils";

type AddGarmentDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (garment: Garment) => void;
};

type Tab = "upload" | "url";

export function AddGarmentDialog({
  open,
  onOpenChange,
  onCreated,
}: AddGarmentDialogProps) {
  const [tab, setTab] = useState<Tab>("upload");
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [externalUrl, setExternalUrl] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const reset = () => {
    setTab("upload");
    setImageUrl(null);
    setExternalUrl("");
    setName("");
    setDescription("");
    setSubmitting(false);
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) reset();
    onOpenChange(next);
  };

  const submit = async () => {
    setSubmitting(true);
    try {
      let garment: Garment;
      if (tab === "upload") {
        if (!imageUrl) {
          toast.error("Upload an image first.");
          setSubmitting(false);
          return;
        }
        const res = await garmentsApi.create({
          name: name.trim() || "Untitled garment",
          description: description.trim() || undefined,
          image_url: imageUrl,
          s3_key: imageUrl.split("/").slice(3).join("/"),
          saved_to_closet: true,
        });
        garment = res.data;
      } else {
        const url = externalUrl.trim();
        if (!url.startsWith("http")) {
          toast.error("Paste a valid http(s) image URL.");
          setSubmitting(false);
          return;
        }
        const res = await garmentsApi.fromUrl({
          image_url: url,
          name: name.trim() || undefined,
          description: description.trim() || undefined,
          source_url: url,
          save_to_closet: true,
        });
        garment = res.data;
      }
      toast.success("Garment added — preparing in background.");
      onCreated(garment);
      handleOpenChange(false);
    } catch (err) {
      const detail =
        (err as { response?: { data?: { detail?: string } } }).response?.data
          ?.detail || (err as Error).message;
      toast.error(`Could not add garment: ${detail}`);
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Add to closet</DialogTitle>
          <DialogDescription>
            Upload from your device, or paste a product image URL from any
            store.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-2 rounded-xl bg-muted/40 p-1">
          <TabButton
            active={tab === "upload"}
            onClick={() => setTab("upload")}
            icon={<Upload className="size-3.5" />}
            label="Upload"
          />
          <TabButton
            active={tab === "url"}
            onClick={() => setTab("url")}
            icon={<Link2 className="size-3.5" />}
            label="From URL"
          />
        </div>

        <div className="flex flex-col gap-4">
          {tab === "upload" ? (
            <div className="max-w-xs">
              <RefImageDropzone
                label="Garment image"
                hint="Flat-lay or studio shot works best."
                value={imageUrl}
                onChange={setImageUrl}
                uploadKind="garment"
              />
            </div>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="garment-external-url">Image URL</Label>
              <Input
                id="garment-external-url"
                value={externalUrl}
                onChange={(event) => setExternalUrl(event.target.value)}
                placeholder="https://store.example.com/product/image.jpg"
              />
              <p className="text-[11px] text-muted-foreground">
                We mirror the image into your closet so retailers can&apos;t
                expire the link later.
              </p>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="garment-name">Name (optional)</Label>
            <Input
              id="garment-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Cropped leather jacket"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="garment-description">Description (optional)</Label>
            <Input
              id="garment-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Black quilted leather, slim fit"
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button
            variant="ghost"
            onClick={() => handleOpenChange(false)}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button onClick={submit} disabled={submitting}>
            {submitting ? <Loader2 className="size-4 animate-spin" /> : null}
            Add to closet
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
        active
          ? "bg-background text-foreground shadow-sm"
          : "text-muted-foreground hover:text-foreground"
      )}
    >
      {icon}
      {label}
    </button>
  );
}
