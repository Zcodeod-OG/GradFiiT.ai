"use client";

import { motion } from "framer-motion";
import { Sparkles } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { toast } from "sonner";

import { BeforeAfterSlider } from "@/components/studios/BeforeAfterSlider";
import { PromptPanel } from "@/components/studios/PromptPanel";
import { RefImageDropzone } from "@/components/studios/RefImageDropzone";
import { StudioCanvas } from "@/components/studios/StudioCanvas";
import { StudioShell } from "@/components/studios/StudioShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  RadioGroup,
  RadioGroupItem,
} from "@/components/ui/radio-group";
import {
  api,
  garmentsApi,
  tryonApi,
  userApi,
  type PersonPhotoData,
} from "@/lib/api";
import { fadeUp } from "@/lib/motion";

type Quality = "fast" | "balanced" | "best";

export default function TryOnStudioPage() {
  return (
    <Suspense fallback={null}>
      <TryOnStudioInner />
    </Suspense>
  );
}

function TryOnStudioInner() {
  const searchParams = useSearchParams();
  const preselectedGarmentId = searchParams.get("garmentId");

  const [garmentUrl, setGarmentUrl] = useState<string | null>(null);
  const [garmentName, setGarmentName] = useState("");
  const [garmentDescription, setGarmentDescription] = useState("");
  // When the user arrives via /studios/tryon?garmentId=N (e.g. from the
  // closet "Try on" button), we already have a server-side garment row.
  // Skip the redundant POST /api/garments call on submit so we don't
  // create a duplicate.
  const [existingGarmentId, setExistingGarmentId] = useState<number | null>(
    null
  );
  const [personUrl, setPersonUrl] = useState<string | null>(null);
  const [quality, setQuality] = useState<Quality>("fast");
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [state, setState] =
    useState<"idle" | "loading" | "result" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Auto-load the user's saved person photo so the user doesn't have to
  // re-upload it for every session.
  useEffect(() => {
    let cancelled = false;
    userApi
      .getPersonPhoto()
      .then((res) => {
        if (cancelled) return;
        const data = res.data?.data as PersonPhotoData | undefined;
        if (data?.url) setPersonUrl(data.url);
      })
      .catch(() => {
        // Anonymous or no saved photo — silently noop.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Predictive warmup: ping SageMaker on mount so the GPU pipeline is
  // hot before the user clicks Generate. Server debounces to once per
  // 60s; failure here is fine, the next real request just pays cold start.
  useEffect(() => {
    tryonApi.warmup().catch(() => {});
  }, []);

  // Hydrate from ?garmentId= so closet deep-links land with the garment
  // already filled in.
  useEffect(() => {
    if (!preselectedGarmentId) return;
    const id = Number(preselectedGarmentId);
    if (!Number.isFinite(id)) return;
    let cancelled = false;
    garmentsApi
      .get(id)
      .then((res) => {
        if (cancelled) return;
        const garment = res.data;
        setGarmentUrl(garment.extracted_image_url || garment.image_url);
        setGarmentName(garment.name || "");
        setGarmentDescription(garment.description || "");
        setExistingGarmentId(garment.id);
      })
      .catch(() => {
        if (!cancelled) toast.error("Could not load that garment.");
      });
    return () => {
      cancelled = true;
    };
  }, [preselectedGarmentId]);

  // Wrap the dropzone setter so a manual upload clears the preselected
  // garment id and forces a fresh garment row on submit.
  const handleGarmentChange = (url: string | null) => {
    setGarmentUrl(url);
    setExistingGarmentId(null);
  };

  const submit = async () => {
    if (!garmentUrl) {
      toast.error("Upload a garment first.");
      return;
    }
    setState("loading");
    setErrorMessage(null);
    setResultUrl(null);
    setPreviewUrl(null);
    try {
      let garmentId = existingGarmentId;
      if (!garmentId) {
        // Persist the garment so the standard /api/tryon flow can drive it.
        const garmentRes = await garmentsApi.create({
          name: garmentName || "Untitled garment",
          description: garmentDescription || undefined,
          image_url: garmentUrl,
          s3_key: garmentUrl.split("/").slice(3).join("/"),
          saved_to_closet: false,
        });
        garmentId = garmentRes.data?.id ?? null;
      }
      if (!garmentId) throw new Error("Could not register garment");

      // Hit the existing /api/tryon/generate route with the studio
      // source flag so the Provider Router lands on FLUX SageMaker
      // rather than Fashn.
      const initial = await api.post(
        "/api/tryon/generate",
        {
          garment_id: garmentId,
          person_image_url: personUrl || undefined,
          quality,
          mode: "2d",
        },
        { headers: { "X-GradFiT-Source": "web" } }
      );

      const tryonId = initial.data?.tryon_id || initial.data?.id;
      if (!tryonId) throw new Error("Try-on response missing id");

      // Prefer SSE so the client picks up status changes (and the
      // streaming preview) the moment the server writes them. The
      // polling fallback runs only when SSE bootstraps fail.
      const sseDeadline = Date.now() + 5 * 60 * 1000;
      let resolved = false;

      await new Promise<void>((resolve, reject) => {
        let unsubscribe: (() => void) | null = null;
        const timeoutId = window.setTimeout(() => {
          if (!resolved) {
            unsubscribe?.();
            reject(new Error("Generation timed out"));
          }
        }, sseDeadline - Date.now());

        unsubscribe = tryonApi.streamStatus(tryonId, {
          onSnapshot: (snap) => {
            if (snap.preview_image_url && !resolved) {
              setPreviewUrl(snap.preview_image_url);
            }
            if (snap.result_image_url) {
              resolved = true;
              setResultUrl(snap.result_image_url);
              setState("result");
              window.clearTimeout(timeoutId);
              unsubscribe?.();
              resolve();
            } else if (
              snap.status === "FAILED" ||
              snap.status === "failed" ||
              snap.status === "dead_letter"
            ) {
              window.clearTimeout(timeoutId);
              unsubscribe?.();
              reject(new Error(snap.error_message || "Generation failed"));
            }
          },
          onError: async (_err) => {
            // SSE flaked — fall back to polling so we still finish.
            window.clearTimeout(timeoutId);
            try {
              while (Date.now() < sseDeadline && !resolved) {
                const status = await tryonApi.getStatus(tryonId);
                const payload = status.data;
                if (payload?.result_image_url) {
                  resolved = true;
                  setResultUrl(payload.result_image_url);
                  setState("result");
                  resolve();
                  return;
                }
                if (
                  payload?.status === "FAILED" ||
                  payload?.status === "failed" ||
                  payload?.status === "dead_letter"
                ) {
                  reject(
                    new Error(payload?.error_message || "Generation failed")
                  );
                  return;
                }
                await new Promise((r) => setTimeout(r, 2500));
              }
              if (!resolved) reject(new Error("Generation timed out"));
            } catch (err) {
              reject(err as Error);
            }
          },
          onClose: async () => {
            if (resolved) return;
            // Stream closed without a terminal payload — final probe.
            try {
              const status = await tryonApi.getStatus(tryonId);
              const payload = status.data;
              if (payload?.result_image_url) {
                resolved = true;
                setResultUrl(payload.result_image_url);
                setState("result");
                window.clearTimeout(timeoutId);
                resolve();
              } else if (
                payload?.status === "FAILED" ||
                payload?.status === "failed" ||
                payload?.status === "dead_letter"
              ) {
                window.clearTimeout(timeoutId);
                reject(new Error(payload?.error_message || "Generation failed"));
              }
            } catch (err) {
              reject(err as Error);
            }
          },
        });
      });
    } catch (err) {
      const detail =
        (err as { response?: { data?: { detail?: string } } }).response?.data
          ?.detail || (err as Error).message;
      setErrorMessage(detail);
      setState("error");
      toast.error(detail);
    }
  };

  return (
    <StudioShell
      eyebrow="Studio 01"
      title="Try-On Studio"
      description="One photo of you, one image of the garment. Specialized VTO model + identity-locked refinement handle the rest, in seconds."
      actions={
        <Button
          onClick={submit}
          disabled={!garmentUrl || state === "loading"}
          size="lg"
          className="rounded-full"
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
        <div className="flex justify-center">
          <StudioCanvas
            state={state}
            errorMessage={errorMessage}
            emptyHint="Upload a garment and your photo to begin."
          >
            {resultUrl ? (
              personUrl ? (
                <BeforeAfterSlider
                  beforeUrl={personUrl}
                  afterUrl={resultUrl}
                  beforeLabel="You"
                  afterLabel="Try-on"
                />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={resultUrl}
                  alt="Try-on result"
                  className="size-full object-cover"
                />
              )
            ) : previewUrl ? (
              // Optional interim preview from providers that emit one
              // (e.g. Fashn). Replaced by the final image when ready.
              <div className="relative size-full">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={previewUrl}
                  alt="Try-on preview"
                  className="size-full object-cover blur-sm scale-105"
                />
                <div className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-background/85 px-3 py-1 text-[11px] font-medium text-muted-foreground backdrop-blur">
                  Sharpening…
                </div>
              </div>
            ) : null}
          </StudioCanvas>
        </div>

        <PromptPanel title="Inputs">
          <div className="grid grid-cols-2 gap-4">
            <RefImageDropzone
              label="Person"
              hint="Upload once or use your saved photo."
              value={personUrl}
              onChange={setPersonUrl}
            />
            <RefImageDropzone
              label="Garment"
              hint="Flat-lay or studio shot works best."
              value={garmentUrl}
              onChange={handleGarmentChange}
              uploadKind="garment"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="garment-name">Garment name</Label>
            <Input
              id="garment-name"
              value={garmentName}
              onChange={(event) => setGarmentName(event.target.value)}
              placeholder="Cropped leather jacket"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="garment-desc">Description (optional)</Label>
            <Input
              id="garment-desc"
              value={garmentDescription}
              onChange={(event) => setGarmentDescription(event.target.value)}
              placeholder="Black quilted leather, slim fit"
            />
          </div>

          <div className="space-y-2">
            <Label>Quality</Label>
            <RadioGroup
              value={quality}
              onValueChange={(value) => setQuality(value as Quality)}
              className="grid grid-cols-3 gap-2"
            >
              {(["fast", "balanced", "best"] as const).map((option) => (
                <Label
                  key={option}
                  htmlFor={`q-${option}`}
                  className={`cursor-pointer rounded-xl border border-border/40 p-2.5 text-center text-xs uppercase tracking-wider transition ${
                    quality === option
                      ? "bg-foreground text-background"
                      : "bg-muted/30 hover:bg-muted/60"
                  }`}
                >
                  <RadioGroupItem
                    id={`q-${option}`}
                    value={option}
                    className="sr-only"
                  />
                  {option}
                </Label>
              ))}
            </RadioGroup>
          </div>
        </PromptPanel>
      </motion.div>
    </StudioShell>
  );
}
