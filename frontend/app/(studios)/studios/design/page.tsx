"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { BookmarkPlus, Sparkles } from "lucide-react";
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
import { studiosApi, type Design } from "@/lib/api";
import { fadeUp } from "@/lib/motion";
import { classifyStudioError } from "@/lib/studio-errors";

export default function DesignStudioPage() {
  const [prompt, setPrompt] = useState("");
  const [negativePrompt, setNegativePrompt] = useState("");
  const [sketchUrl, setSketchUrl] = useState<string | null>(null);
  const [styleUrl, setStyleUrl] = useState<string | null>(null);
  const [useBrandDna, setUseBrandDna] = useState(true);
  const [history, setHistory] = useState<Design[]>([]);
  const [lastDesign, setLastDesign] = useState<Design | null>(null);
  const [state, setState] =
    useState<"idle" | "loading" | "result" | "error">("idle");
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    studiosApi
      .listDesigns()
      .then((res) => setHistory(res.data || []))
      .catch(() => {});
  }, []);

  const submit = async () => {
    if (!prompt.trim()) {
      toast.error("Describe the piece first.");
      return;
    }
    setState("loading");
    setErrorMessage(null);
    setResultUrl(null);
    setLastDesign(null);
    try {
      const res = await studiosApi.generateDesign({
        prompt: prompt.trim(),
        negative_prompt: negativePrompt.trim() || undefined,
        sketch_image_url: sketchUrl || undefined,
        style_reference_url: styleUrl || undefined,
        num_images: 2,
        use_brand_dna: useBrandDna,
      });
      const design = res.data;
      if (!design.primary_image_url) {
        throw new Error(design.error_message || "No image returned");
      }
      setResultUrl(design.primary_image_url);
      setLastDesign(design);
      setState("result");
      setHistory((prev) => [design, ...prev]);
    } catch (err) {
      const info = classifyStudioError(err);
      setErrorMessage(info.message);
      setState("error");
      toast.error(info.message);
    }
  };

  const pickVariant = async (url: string) => {
    setResultUrl(url);
    if (!lastDesign) return;
    try {
      const res = await studiosApi.setDesignPrimary(lastDesign.id, url);
      setLastDesign(res.data);
    } catch {
      toast.error("Could not set primary image.");
    }
  };

  const onDelete = async (id: number) => {
    try {
      await studiosApi.deleteDesign(id);
      setHistory((prev) => prev.filter((d) => d.id !== id));
    } catch {
      toast.error("Could not delete design");
    }
  };

  return (
    <StudioShell
      eyebrow="Studio 02"
      title="Design Studio"
      description="Describe the piece. Drop a sketch or reference. The clothing LoRA spins up a finished, photo-real garment in seconds."
      actions={
        <Button
          onClick={submit}
          disabled={state === "loading" || !prompt.trim()}
          size="lg"
          className="rounded-full min-h-[44px]"
        >
          <Sparkles className="size-4" />
          {state === "loading" ? "Generating…" : "Generate"}
        </Button>
      }
    >
      <motion.div
        variants={fadeUp}
        className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_420px]"
      >
        <div className="flex flex-col gap-4">
          <StudioCanvas
            state={state}
            errorMessage={errorMessage}
            onRetry={submit}
            emptyHint="Type a prompt to bring a new garment to life."
            loadingHint="FLUX is rendering your garment…"
          >
            {resultUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={resultUrl}
                alt="Design result"
                className="size-full object-cover"
              />
            ) : null}
          </StudioCanvas>

          <MultiImagePicker
            images={lastDesign?.image_urls || (resultUrl ? [resultUrl] : [])}
            selected={resultUrl}
            onSelect={pickVariant}
          />

          {lastDesign ? (
            <div className="flex flex-wrap gap-2">
              <Button asChild variant="outline" size="sm" className="rounded-full">
                <Link href={`/studios/design/${lastDesign.id}`}>Open detail</Link>
              </Button>
              <Button
                variant="secondary"
                size="sm"
                className="rounded-full min-h-[44px]"
                onClick={() =>
                  void studiosApi
                    .saveDesignToCloset(lastDesign.id, {
                      name: lastDesign.prompt.slice(0, 80),
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

        <ResponsivePromptPanel title="Prompt">
          <BrandDNAToggle enabled={useBrandDna} onChange={setUseBrandDna} />

          <div className="space-y-2">
            <Label htmlFor="prompt">Describe the garment</Label>
            <textarea
              id="prompt"
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              rows={5}
              className="w-full resize-none rounded-xl border border-border/40 bg-background/60 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring/40"
              placeholder="Oversized merino sweater, cable knit, oat-milk tone, soft studio light"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="negative">Avoid</Label>
            <Input
              id="negative"
              value={negativePrompt}
              onChange={(event) => setNegativePrompt(event.target.value)}
              placeholder="text, logos, distorted hands"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <RefImageDropzone
              label="Sketch"
              hint="Used as a Canny ControlNet hint."
              value={sketchUrl}
              onChange={setSketchUrl}
            />
            <RefImageDropzone
              label="Style ref"
              hint="IP-Adapter copies the vibe."
              value={styleUrl}
              onChange={setStyleUrl}
            />
          </div>
        </ResponsivePromptPanel>
      </motion.div>

      <motion.section variants={fadeUp} className="mt-12">
        <h2 className="font-display text-xl tracking-tight mb-4">Recent designs</h2>
        <GenerationGallery
          items={history.map((design) => ({
            id: design.id,
            prompt: design.prompt,
            primary_image_url: design.primary_image_url,
            status: design.status,
            created_at: design.created_at,
          }))}
          detailHrefBase="/studios/design"
          onDelete={onDelete}
          emptyMessage="Your designs land here."
        />
      </motion.section>
    </StudioShell>
  );
}
