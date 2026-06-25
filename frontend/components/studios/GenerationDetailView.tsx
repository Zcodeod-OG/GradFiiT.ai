"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { MultiImagePicker } from "@/components/studios/MultiImagePicker";
import { StudioCanvas } from "@/components/studios/StudioCanvas";
import { StudioShell } from "@/components/studios/StudioShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { type Design, type Outfit, studiosApi } from "@/lib/api";

type GenerationRecord = Design | Outfit;

type GenerationDetailViewProps = {
  kind: "design" | "stylist";
  id: number;
  backHref: string;
  title: string;
  load: (id: number) => Promise<{ data: GenerationRecord }>;
  setPrimary: (id: number, image_url: string) => Promise<{ data: GenerationRecord }>;
  saveToCloset: (
    id: number,
    payload?: { name?: string; category?: string }
  ) => Promise<unknown>;
  onDelete: (id: number) => Promise<unknown>;
};

export function GenerationDetailView({
  kind,
  id,
  backHref,
  title,
  load,
  setPrimary,
  saveToCloset,
  onDelete,
}: GenerationDetailViewProps) {
  const router = useRouter();
  const [record, setRecord] = useState<GenerationRecord | null>(null);
  const [selectedUrl, setSelectedUrl] = useState<string | null>(null);
  const [saveName, setSaveName] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    load(id)
      .then((res) => {
        setRecord(res.data);
        setSelectedUrl(res.data.primary_image_url);
        setSaveName(res.data.prompt.slice(0, 80));
      })
      .catch(() => toast.error("Could not load generation."));
  }, [id, load]);

  const images = record?.image_urls?.length
    ? record.image_urls
    : record?.primary_image_url
      ? [record.primary_image_url]
      : [];

  const pickPrimary = async (url: string) => {
    setSelectedUrl(url);
    try {
      const res = await setPrimary(id, url);
      setRecord(res.data);
    } catch {
      toast.error("Could not update primary image.");
    }
  };

  const saveCloset = async () => {
    setSaving(true);
    try {
      await saveToCloset(id, { name: saveName.trim() || undefined });
      toast.success("Saved to your closet.");
      router.push("/account/closet");
    } catch (err) {
      toast.error((err as Error).message || "Could not save to closet.");
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!window.confirm("Delete this generation permanently?")) return;
    try {
      await onDelete(id);
      toast.success("Deleted.");
      router.push(backHref);
    } catch {
      toast.error("Could not delete.");
    }
  };

  const canvasState =
    record?.status === "failed"
      ? "error"
      : selectedUrl
        ? "result"
        : "idle";

  return (
    <StudioShell
      eyebrow={kind === "design" ? "Studio 02" : "Studio 03"}
      title={title}
      description={record?.prompt || "Loading…"}
      actions={
        <Button asChild variant="outline" className="rounded-full">
          <Link href={backHref}>Back to studio</Link>
        </Button>
      }
    >
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex flex-col gap-4">
          <StudioCanvas
            state={canvasState}
            errorMessage={record?.error_message}
            emptyHint="No preview for this generation."
          >
            {selectedUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={selectedUrl}
                alt={record?.prompt || "Generation"}
                className="size-full object-cover"
              />
            ) : null}
          </StudioCanvas>
          <MultiImagePicker
            images={images}
            selected={selectedUrl}
            onSelect={pickPrimary}
          />
        </div>

        <aside className="flex flex-col gap-4 rounded-3xl border border-border/40 bg-background/70 p-6 backdrop-blur-md">
          <div className="space-y-1">
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
              Status
            </p>
            <p className="text-sm font-medium">{record?.status || "…"}</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="save-name">Closet name</Label>
            <Input
              id="save-name"
              value={saveName}
              onChange={(event) => setSaveName(event.target.value)}
            />
          </div>

          <Button
            onClick={saveCloset}
            disabled={!selectedUrl || saving || record?.saved}
            className="rounded-full"
          >
            {record?.saved ? "Already in closet" : saving ? "Saving…" : "Save to closet"}
          </Button>

          <Button variant="destructive" onClick={remove} className="rounded-full">
            Delete generation
          </Button>
        </aside>
      </div>
    </StudioShell>
  );
}
