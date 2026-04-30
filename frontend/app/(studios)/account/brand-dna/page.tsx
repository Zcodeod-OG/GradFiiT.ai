"use client";

import { motion } from "framer-motion";
import { Plus, Save, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { PromptPanel } from "@/components/studios/PromptPanel";
import { RefImageDropzone } from "@/components/studios/RefImageDropzone";
import { StudioShell } from "@/components/studios/StudioShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { brandDnaApi, uploadApi, type BrandDNA } from "@/lib/api";
import { fadeUp } from "@/lib/motion";

export default function BrandDNAPage() {
  const [palette, setPalette] = useState<string[]>([]);
  const [paletteDraft, setPaletteDraft] = useState("");
  const [logos, setLogos] = useState<string[]>([]);
  const [models, setModels] = useState<string[]>([]);
  const [voice, setVoice] = useState("");
  const [loraUri, setLoraUri] = useState("");
  const [loraStrength, setLoraStrength] = useState(1.0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    brandDnaApi
      .get()
      .then((res) => hydrate(res.data))
      .catch(() => {
        toast.error("Could not load Brand DNA");
      })
      .finally(() => setLoading(false));
  }, []);

  const hydrate = (data: BrandDNA) => {
    setPalette(data.palette || []);
    setLogos(data.logos || []);
    setModels(data.model_references || []);
    setVoice(data.voice || "");
    setLoraUri(data.lora_uri || "");
    setLoraStrength(data.lora_strength ?? 1.0);
  };

  const addPaletteColor = () => {
    const value = paletteDraft.trim();
    if (!value) return;
    if (palette.length >= 12) {
      toast.error("12 colors max.");
      return;
    }
    setPalette((prev) => [...prev, value]);
    setPaletteDraft("");
  };

  const uploadInto = async (
    file: File | undefined,
    setter: (next: string[]) => void,
    current: string[],
    cap: number
  ) => {
    if (!file) return;
    if (current.length >= cap) {
      toast.error(`Max ${cap} entries.`);
      return;
    }
    try {
      const res = await uploadApi.uploadImage(file);
      const url = res.data?.url || res.data?.image_url;
      if (!url) throw new Error("Upload returned no URL");
      setter([...current, url]);
    } catch (err) {
      toast.error("Upload failed");
    }
  };

  const save = async () => {
    setSaving(true);
    try {
      const payload = {
        palette,
        logos,
        model_references: models,
        voice: voice || undefined,
        lora_uri: loraUri || undefined,
        lora_strength: loraStrength,
      };
      const res = await brandDnaApi.update(payload);
      hydrate(res.data);
      toast.success("Brand DNA saved");
    } catch {
      toast.error("Could not save Brand DNA");
    } finally {
      setSaving(false);
    }
  };

  return (
    <StudioShell
      eyebrow="Workspace"
      title="Brand DNA"
      description="The palette, models, and tone every studio should pull from. Updates take effect on the next generation."
      actions={
        <Button
          onClick={save}
          disabled={loading || saving}
          size="lg"
          className="rounded-full"
        >
          <Save className="size-4" />
          {saving ? "Saving…" : "Save changes"}
        </Button>
      }
    >
      <motion.div
        variants={fadeUp}
        className="grid gap-6 lg:grid-cols-2"
      >
        <PromptPanel title="Palette">
          <p className="text-xs text-muted-foreground">
            Pin up to 12 colors. We pass them as conditioning text to FLUX and
            sample them in the generation gallery.
          </p>
          <div className="grid grid-cols-6 gap-2">
            {palette.map((hex, index) => (
              <button
                key={`${hex}-${index}`}
                type="button"
                className="group relative aspect-square rounded-xl border border-border/40 overflow-hidden"
                onClick={() =>
                  setPalette((prev) => prev.filter((_, i) => i !== index))
                }
              >
                <span
                  className="absolute inset-0"
                  style={{ background: hex }}
                />
                <span className="absolute inset-x-0 bottom-0 bg-black/50 text-[10px] text-white py-0.5 opacity-0 group-hover:opacity-100">
                  remove
                </span>
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <Input
              value={paletteDraft}
              onChange={(event) => setPaletteDraft(event.target.value)}
              placeholder="#4F7CFF"
            />
            <Button type="button" variant="outline" onClick={addPaletteColor}>
              <Plus className="size-4" />
              Add
            </Button>
          </div>
        </PromptPanel>

        <PromptPanel title="Voice">
          <p className="text-xs text-muted-foreground">
            One paragraph that captures your brand attitude. Used as a soft
            prefix to every prompt.
          </p>
          <textarea
            value={voice}
            onChange={(event) => setVoice(event.target.value)}
            rows={6}
            className="w-full resize-none rounded-xl border border-border/40 bg-background/60 px-3 py-2 text-sm"
            placeholder="Quietly luxurious. Low contrast. Soft focus. Models look unhurried."
          />
        </PromptPanel>

        <PromptPanel title="Logos">
          <ImageGrid
            value={logos}
            onAdd={(file) => uploadInto(file, setLogos, logos, 8)}
            onRemove={(url) =>
              setLogos((prev) => prev.filter((entry) => entry !== url))
            }
            label="Drop a logo"
          />
        </PromptPanel>

        <PromptPanel title="Model references">
          <p className="text-xs text-muted-foreground">
            We feed these into IP-Adapter so generated models look consistent
            across shoots.
          </p>
          <ImageGrid
            value={models}
            onAdd={(file) => uploadInto(file, setModels, models, 12)}
            onRemove={(url) =>
              setModels((prev) => prev.filter((entry) => entry !== url))
            }
            label="Drop a model ref"
          />
        </PromptPanel>

        <PromptPanel title="LoRA (optional)">
          <p className="text-xs text-muted-foreground">
            Paste an S3 URI to a fine-tuned ``.safetensors`` LoRA. We hot-swap
            it into FLUX for every generation in your account.
          </p>
          <Input
            value={loraUri}
            onChange={(event) => setLoraUri(event.target.value)}
            placeholder="s3://gradfit-models/loras/your-brand.safetensors"
          />
          <div className="space-y-1">
            <Label htmlFor="lora-strength">Strength ({loraStrength.toFixed(2)})</Label>
            <input
              id="lora-strength"
              type="range"
              min="0"
              max="1.5"
              step="0.05"
              value={loraStrength}
              onChange={(event) => setLoraStrength(Number(event.target.value))}
              className="w-full"
            />
          </div>
        </PromptPanel>
      </motion.div>
    </StudioShell>
  );
}

function ImageGrid({
  value,
  onAdd,
  onRemove,
  label,
}: {
  value: string[];
  onAdd: (file: File | undefined) => void;
  onRemove: (url: string) => void;
  label: string;
}) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {value.map((url) => (
        <div
          key={url}
          className="relative aspect-square overflow-hidden rounded-xl border border-border/40 bg-muted/30 group"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt="" className="size-full object-cover" />
          <button
            type="button"
            className="absolute right-1 top-1 rounded-full bg-black/70 p-1 text-white opacity-0 transition-opacity group-hover:opacity-100"
            onClick={() => onRemove(url)}
          >
            <Trash2 className="size-3" />
          </button>
        </div>
      ))}
      <label className="flex aspect-square cursor-pointer items-center justify-center rounded-xl border border-dashed border-border/60 text-xs text-muted-foreground hover:bg-muted/40">
        <input
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(event) => onAdd(event.target.files?.[0] ?? undefined)}
        />
        {label}
      </label>
    </div>
  );
}
