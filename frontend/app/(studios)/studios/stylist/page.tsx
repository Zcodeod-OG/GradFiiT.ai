"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { BookmarkPlus, Plus, Sparkles, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { BrandDNAToggle } from "@/components/studios/BrandDNAToggle";
import { GenerationGallery } from "@/components/studios/GenerationGallery";
import { MultiImagePicker } from "@/components/studios/MultiImagePicker";
import { ResponsivePromptPanel } from "@/components/studios/ResponsivePromptPanel";
import { RefImageDropzone } from "@/components/studios/RefImageDropzone";
import { StudioCanvas } from "@/components/studios/StudioCanvas";
import { StudioShell } from "@/components/studios/StudioShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { studiosApi, type Outfit, type StylistPiece } from "@/lib/api";
import { fadeUp } from "@/lib/motion";
import { classifyStudioError } from "@/lib/studio-errors";

const SLOTS = ["top", "bottom", "outerwear", "shoes", "accessory"] as const;
type Slot = (typeof SLOTS)[number];

export default function StylistStudioPage() {
  const [prompt, setPrompt] = useState("");
  const [background, setBackground] = useState("studio");
  const [modelRef, setModelRef] = useState<string | null>(null);
  const [useBrandDna, setUseBrandDna] = useState(true);
  const [pieces, setPieces] = useState<StylistPiece[]>([
    { slot: "top", description: "" },
    { slot: "bottom", description: "" },
  ]);
  const [history, setHistory] = useState<Outfit[]>([]);
  const [lastOutfit, setLastOutfit] = useState<Outfit | null>(null);
  const [state, setState] =
    useState<"idle" | "loading" | "result" | "error">("idle");
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    studiosApi.listOutfits().then((res) => setHistory(res.data || [])).catch(() => {});
  }, []);

  const updatePiece = (index: number, patch: Partial<StylistPiece>) => {
    setPieces((prev) =>
      prev.map((piece, i) => (i === index ? { ...piece, ...patch } : piece))
    );
  };

  const addPiece = () => {
    if (pieces.length >= 6) {
      toast.error("Six pieces is the limit per look.");
      return;
    }
    setPieces((prev) => [...prev, { slot: "accessory", description: "" }]);
  };

  const removePiece = (index: number) => {
    setPieces((prev) => prev.filter((_, i) => i !== index));
  };

  const submit = async () => {
    if (!prompt.trim()) {
      toast.error("Describe the look first.");
      return;
    }
    const validPieces = pieces.filter((p) => p.description.trim());
    if (!validPieces.length) {
      toast.error("Add at least one piece.");
      return;
    }
    setState("loading");
    setErrorMessage(null);
    setResultUrl(null);
    setLastOutfit(null);
    try {
      const res = await studiosApi.generateOutfit({
        prompt: prompt.trim(),
        pieces: validPieces,
        background,
        model_reference_url: modelRef || undefined,
        num_images: 2,
        use_brand_dna: useBrandDna,
      });
      const outfit = res.data;
      if (!outfit.primary_image_url) {
        throw new Error(outfit.error_message || "No image returned");
      }
      setResultUrl(outfit.primary_image_url);
      setLastOutfit(outfit);
      setState("result");
      setHistory((prev) => [outfit, ...prev]);
    } catch (err) {
      const info = classifyStudioError(err);
      setErrorMessage(info.message);
      setState("error");
      toast.error(info.message);
    }
  };

  const pickVariant = async (url: string) => {
    setResultUrl(url);
    if (!lastOutfit) return;
    try {
      const res = await studiosApi.setOutfitPrimary(lastOutfit.id, url);
      setLastOutfit(res.data);
    } catch {
      toast.error("Could not set primary image.");
    }
  };

  const onDelete = async (id: number) => {
    try {
      await studiosApi.deleteOutfit(id);
      setHistory((prev) => prev.filter((o) => o.id !== id));
    } catch {
      toast.error("Could not delete outfit");
    }
  };

  return (
    <StudioShell
      eyebrow="Studio 03"
      title="Stylist Studio"
      description="Pick the slots, describe the vibe, attach a model reference. We hand back a editorial-grade full-look."
      actions={
        <Button
          onClick={submit}
          disabled={state === "loading" || !prompt.trim()}
          size="lg"
          className="rounded-full min-h-[44px]"
        >
          <Sparkles className="size-4" />
          {state === "loading" ? "Styling…" : "Generate look"}
        </Button>
      }
    >
      <motion.div
        variants={fadeUp}
        className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_460px]"
      >
        <div className="flex flex-col gap-4">
          <StudioCanvas
            state={state}
            errorMessage={errorMessage}
            onRetry={submit}
            emptyHint="Add at least one piece to begin."
            loadingHint="FLUX is composing your look…"
          >
            {resultUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={resultUrl}
                alt="Outfit result"
                className="size-full object-cover"
              />
            ) : null}
          </StudioCanvas>

          <MultiImagePicker
            images={lastOutfit?.image_urls || (resultUrl ? [resultUrl] : [])}
            selected={resultUrl}
            onSelect={pickVariant}
          />

          {lastOutfit ? (
            <div className="flex flex-wrap gap-2">
              <Button asChild variant="outline" size="sm" className="rounded-full">
                <Link href={`/studios/stylist/${lastOutfit.id}`}>Open detail</Link>
              </Button>
              <Button
                variant="secondary"
                size="sm"
                className="rounded-full"
                onClick={() =>
                  void studiosApi
                    .saveOutfitToCloset(lastOutfit.id, {
                      name: lastOutfit.prompt.slice(0, 80),
                    })
                    .then(() => toast.success("Saved to closet."))
                    .catch((err) =>
                      toast.error(classifyStudioError(err).message)
                    )
                }
              >
                <BookmarkPlus className="size-3.5" />
                Save to closet
              </Button>
            </div>
          ) : null}
        </div>

        <ResponsivePromptPanel title="Look">
          <BrandDNAToggle enabled={useBrandDna} onChange={setUseBrandDna} />

          <div className="space-y-2">
            <Label htmlFor="prompt">Mood</Label>
            <textarea
              id="prompt"
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              rows={3}
              className="w-full resize-none rounded-xl border border-border/40 bg-background/60 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring/40"
              placeholder="Tokyo street style, soft golden-hour light, oversized silhouette"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="background">Background</Label>
            <Input
              id="background"
              value={background}
              onChange={(event) => setBackground(event.target.value)}
              placeholder="studio, city street, beach…"
            />
          </div>

          <RefImageDropzone
            label="Model reference"
            hint="Optional — Keeps the AI model consistent across shoots."
            value={modelRef}
            onChange={setModelRef}
          />

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>Pieces</Label>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={addPiece}
                className="h-auto py-1 text-xs"
              >
                <Plus className="size-3" /> Add piece
              </Button>
            </div>

            <div className="flex flex-col gap-3">
              {pieces.map((piece, index) => (
                <div
                  key={index}
                  className="flex flex-col gap-2 rounded-xl border border-border/40 p-3 bg-muted/20"
                >
                  <div className="flex items-center justify-between">
                    <select
                      value={piece.slot}
                      onChange={(event) =>
                        updatePiece(index, { slot: event.target.value as Slot })
                      }
                      className="rounded-md border border-border/40 bg-background px-2 py-1 text-xs uppercase tracking-wider"
                    >
                      {SLOTS.map((slot) => (
                        <option key={slot} value={slot}>
                          {slot}
                        </option>
                      ))}
                    </select>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-7"
                      onClick={() => removePiece(index)}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                  <Input
                    value={piece.description}
                    onChange={(event) =>
                      updatePiece(index, { description: event.target.value })
                    }
                    placeholder="Cropped boxy denim jacket"
                  />
                </div>
              ))}
            </div>
          </div>
        </ResponsivePromptPanel>
      </motion.div>

      <motion.section variants={fadeUp} className="mt-12">
        <h2 className="font-display text-xl tracking-tight mb-4">Recent looks</h2>
        <GenerationGallery
          items={history.map((outfit) => ({
            id: outfit.id,
            prompt: outfit.prompt,
            primary_image_url: outfit.primary_image_url,
            status: outfit.status,
            created_at: outfit.created_at,
          }))}
          detailHrefBase="/studios/stylist"
          onDelete={onDelete}
          emptyMessage="Your styled looks will appear here."
        />
      </motion.section>
    </StudioShell>
  );
}
