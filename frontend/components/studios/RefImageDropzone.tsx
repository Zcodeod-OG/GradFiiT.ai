"use client";

import { ImagePlus, X } from "lucide-react";
import { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { uploadApi } from "@/lib/api";
import { cn } from "@/lib/utils";

type RefImageDropzoneProps = {
  label: string;
  hint?: string;
  value: string | null;
  onChange: (url: string | null) => void;
  /** Accepts either "image" (default uploadApi.uploadImage) or "garment". */
  uploadKind?: "image" | "garment";
  className?: string;
};

export function RefImageDropzone({
  label,
  hint,
  value,
  onChange,
  uploadKind = "image",
  className,
}: RefImageDropzoneProps) {
  const [uploading, setUploading] = useState(false);

  const onDrop = useCallback(
    async (files: File[]) => {
      const file = files[0];
      if (!file) return;
      try {
        setUploading(true);
        const res =
          uploadKind === "garment"
            ? await uploadApi.uploadGarment(file)
            : await uploadApi.uploadImage(file);
        const url = res.data?.url || res.data?.image_url;
        if (!url) {
          throw new Error("Upload returned no URL");
        }
        onChange(url);
      } catch (err) {
        const detail =
          (err as { response?: { data?: { detail?: string } } }).response?.data
            ?.detail || (err as Error).message;
        toast.error(`Upload failed: ${detail}`);
      } finally {
        setUploading(false);
      }
    },
    [onChange, uploadKind]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    multiple: false,
    accept: { "image/*": [] },
    maxSize: 12 * 1024 * 1024,
  });

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">{label}</span>
        {value ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-xs h-auto py-1"
            onClick={() => onChange(null)}
          >
            <X className="size-3" /> Clear
          </Button>
        ) : null}
      </div>

      <div
        {...getRootProps()}
        className={cn(
          "relative flex aspect-square w-full overflow-hidden rounded-2xl border-2 border-dashed border-border/60 bg-muted/30 cursor-pointer transition-colors",
          isDragActive && "border-foreground/70 bg-muted/60",
          uploading && "opacity-60 pointer-events-none"
        )}
      >
        <input {...getInputProps()} />
        {value ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={value}
            alt={label}
            className="absolute inset-0 size-full object-cover"
          />
        ) : (
          <div className="flex flex-1 items-center justify-center text-center text-xs text-muted-foreground gap-2">
            <ImagePlus className="size-4" />
            {uploading ? "Uploading…" : isDragActive ? "Drop to upload" : "Click or drag"}
          </div>
        )}
      </div>

      {hint ? <p className="text-[11px] text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
