"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { useDropzone, type FileRejection } from "react-dropzone"
import { toast } from "sonner"
import {
  Camera,
  CheckCircle2,
  Loader2,
  Sparkles,
  Trash2,
  TriangleAlert,
  Upload,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { userApi, type PersonPhotoData } from "@/lib/api"
import { useAuth } from "@/lib/auth"
import { cn } from "@/lib/utils"

type WizardStep = "upload" | "analyzing" | "review"

const ALLOWED_TYPES = {
  "image/jpeg": [".jpg", ".jpeg"],
  "image/png": [".png"],
  "image/webp": [".webp"],
}

const MAX_FILE_SIZE = 12 * 1024 * 1024 // 12MB

const REASON_HINTS: Record<string, string> = {
  image_too_blurry: "Photo looks a bit blurry. Hold the camera steady or move into better light.",
  insufficient_body_coverage: "We can only see part of you. Step back so most of your body is in frame.",
  missing_person_image_url: "Could not read your photo. Try uploading a different file.",
}

function humanizeReason(raw: string): string {
  const key = raw.split(" ")[0]?.replace(/\(.*$/, "") ?? raw
  return REASON_HINTS[key] ?? raw
}

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  // When `forceOnboarding` is true the wizard cannot be dismissed until a
  // photo is saved. Used for the first-login flow.
  forceOnboarding?: boolean
  initialPhoto?: PersonPhotoData | null
  onSaved?: (photo: PersonPhotoData) => void
}

export function PhotoWizard({
  open,
  onOpenChange,
  forceOnboarding,
  initialPhoto,
  onSaved,
}: Props) {
  const { loadUser } = useAuth()
  const [step, setStep] = useState<WizardStep>("upload")
  const [previewUrl, setPreviewUrl] = useState<string | null>(initialPhoto?.url ?? null)
  const [photo, setPhoto] = useState<PersonPhotoData | null>(initialPhoto ?? null)
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  useEffect(() => {
    if (!open) return
    setPhoto(initialPhoto ?? null)
    setPreviewUrl(initialPhoto?.url ?? null)
    setPendingFile(null)
    setStep(initialPhoto?.url ? "review" : "upload")
  }, [open, initialPhoto])

  useEffect(() => {
    return () => {
      if (previewUrl && previewUrl.startsWith("blob:")) {
        URL.revokeObjectURL(previewUrl)
      }
    }
  }, [previewUrl])

  const handleSubmit = useCallback(
    async (file: File) => {
      setIsUploading(true)
      setStep("analyzing")
      try {
        const response = await userApi.uploadPersonPhoto(file)
        const data = response.data?.data
        if (!data) throw new Error("Server returned an empty payload")
        setPhoto(data)
        setPreviewUrl(data.url ?? null)
        setStep("review")
        await loadUser()
        onSaved?.(data)
        toast.success("Photo saved. You won't have to upload it again.")
      } catch (error) {
        const message =
          (error as { response?: { data?: { detail?: string } } }).response?.data?.detail ||
          (error as Error).message ||
          "Could not save photo"
        toast.error(message)
        setStep("upload")
      } finally {
        setIsUploading(false)
      }
    },
    [loadUser, onSaved]
  )

  const onDrop = useCallback(
    (accepted: File[], rejections: FileRejection[]) => {
      if (rejections.length > 0) {
        const reason = rejections[0]?.errors[0]?.message || "File rejected"
        toast.error(reason)
        return
      }
      const file = accepted[0]
      if (!file) return

      setPendingFile(file)
      const objectUrl = URL.createObjectURL(file)
      setPreviewUrl(objectUrl)
      void handleSubmit(file)
    },
    [handleSubmit]
  )

  const { getRootProps, getInputProps, isDragActive, open: openFileDialog } = useDropzone({
    accept: ALLOWED_TYPES,
    maxSize: MAX_FILE_SIZE,
    maxFiles: 1,
    multiple: false,
    onDrop,
    noClick: step !== "upload",
  })

  const reasons = useMemo(() => {
    return (photo?.gate?.reasons ?? []).map(humanizeReason)
  }, [photo])

  const passed = photo?.gate?.passed ?? true
  const gateMetrics = (photo?.gate?.metrics ?? {}) as Record<string, unknown>

  const handleRetake = () => {
    if (previewUrl && previewUrl.startsWith("blob:")) {
      URL.revokeObjectURL(previewUrl)
    }
    setPendingFile(null)
    setPreviewUrl(null)
    setStep("upload")
  }

  const handleDelete = async () => {
    setIsDeleting(true)
    try {
      await userApi.deletePersonPhoto()
      setPhoto(null)
      setPreviewUrl(null)
      setStep("upload")
      await loadUser()
      toast.success("Saved photo removed")
    } catch (error) {
      toast.error((error as Error).message || "Could not remove photo")
    } finally {
      setIsDeleting(false)
    }
  }

  const handleClose = (next: boolean) => {
    if (!next && forceOnboarding && !photo?.url) {
      toast.info("Add your photo to continue")
      return
    }
    onOpenChange(next)
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent
        className="sm:max-w-2xl border-border/70 bg-white/90 backdrop-blur-xl"
        showCloseButton={!forceOnboarding || !!photo?.url}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <span className="inline-flex size-8 items-center justify-center rounded-xl bg-gradient-to-br from-primary via-sky-500 to-emerald-400 text-white shadow-md">
              <Sparkles className="size-4" />
            </span>
            Set up your try-on photo
          </DialogTitle>
        </DialogHeader>

        <p className="text-sm text-muted-foreground">
          Upload one good full-body photo and we&apos;ll reuse it for every
          try-on, in the dashboard, and in the Chrome extension. No more
          uploading the same selfie ten times a day.
        </p>

        <AnimatePresence mode="wait">
          {step === "upload" && (
            <motion.div
              key="upload"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.18 }}
            >
              <div
                {...getRootProps()}
                className={cn(
                  "mt-2 cursor-pointer rounded-2xl border-2 border-dashed p-8 text-center transition",
                  isDragActive
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-primary/60 hover:bg-primary/5"
                )}
              >
                <input {...getInputProps()} />
                <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-gradient-to-br from-primary via-sky-500 to-emerald-400 text-white shadow-lg">
                  <Upload className="size-6" />
                </div>
                <p className="mt-4 text-base font-medium">
                  {isDragActive ? "Drop your photo to upload" : "Drag & drop or click to choose"}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  JPG, PNG, or WebP up to 12MB. Aim for a well-lit, full-body shot.
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-4 gap-2"
                  onClick={(event) => {
                    event.stopPropagation()
                    openFileDialog()
                  }}
                >
                  <Camera className="size-4" />
                  Choose photo
                </Button>
              </div>

              <ul className="mt-4 grid gap-2 text-xs text-muted-foreground sm:grid-cols-3">
                <li className="rounded-lg border border-border/70 bg-white/70 p-2">
                  Stand 2-3 metres back so most of your body is in frame.
                </li>
                <li className="rounded-lg border border-border/70 bg-white/70 p-2">
                  Plain background and even lighting work best.
                </li>
                <li className="rounded-lg border border-border/70 bg-white/70 p-2">
                  Wear something snug -- it gives the AI a clean silhouette.
                </li>
              </ul>
            </motion.div>
          )}

          {step === "analyzing" && (
            <motion.div
              key="analyzing"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="mt-4 grid gap-4 sm:grid-cols-[200px_1fr] sm:items-center"
            >
              <div className="aspect-[4/5] overflow-hidden rounded-2xl border border-border/70 bg-muted/30">
                {previewUrl ? (
                  <img
                    src={previewUrl}
                    alt="Uploaded preview"
                    className="h-full w-full object-cover"
                  />
                ) : null}
              </div>
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Loader2 className="size-4 animate-spin text-primary" />
                  Checking your photo...
                </div>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li>Detecting pose and full-body coverage</li>
                  <li>Measuring sharpness</li>
                  <li>Pre-cropping a face for identity matching</li>
                </ul>
                <p className="text-xs text-muted-foreground">
                  This runs once -- after this you&apos;ll never see the
                  upload step again.
                </p>
              </div>
            </motion.div>
          )}

          {step === "review" && (
            <motion.div
              key="review"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="mt-4 grid gap-4 sm:grid-cols-[220px_1fr]"
            >
              <div className="aspect-[4/5] overflow-hidden rounded-2xl border border-border/70 bg-muted/30">
                {(photo?.smart_crop_url || previewUrl) ? (
                  <img
                    src={photo?.smart_crop_url || previewUrl || ""}
                    alt="Saved photo"
                    className="h-full w-full object-cover"
                  />
                ) : null}
              </div>

              <div className="space-y-3">
                <div
                  className={cn(
                    "rounded-xl border p-3",
                    passed
                      ? "border-emerald-200/70 bg-emerald-50/80"
                      : "border-amber-200/70 bg-amber-50/80"
                  )}
                >
                  <div className="flex items-start gap-2">
                    {passed ? (
                      <CheckCircle2 className="mt-0.5 size-4 text-emerald-600" />
                    ) : (
                      <TriangleAlert className="mt-0.5 size-4 text-amber-600" />
                    )}
                    <div>
                      <p className="text-sm font-medium">
                        {passed ? "Photo looks great" : "Photo saved, but a retake might help"}
                      </p>
                      {reasons.length > 0 ? (
                        <ul className="mt-1 list-disc pl-4 text-xs text-muted-foreground">
                          {reasons.map((reason) => (
                            <li key={reason}>{reason}</li>
                          ))}
                        </ul>
                      ) : (
                        <p className="mt-1 text-xs text-muted-foreground">
                          We pre-built your face crop so future try-ons skip
                          the input gate and shave a few seconds off each run.
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                <dl className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                  {typeof gateMetrics.body_coverage === "number" ? (
                    <Stat
                      label="Body coverage"
                      value={`${Math.round((gateMetrics.body_coverage as number) * 100)}%`}
                    />
                  ) : null}
                  {typeof gateMetrics.blur_var === "number" ? (
                    <Stat
                      label="Sharpness"
                      value={(gateMetrics.blur_var as number).toFixed(0)}
                    />
                  ) : null}
                  <Stat label="Face cached" value={photo?.has_embedding ? "Yes" : "No"} />
                  <Stat
                    label="Smart crop"
                    value={photo?.smart_crop_url ? "Built" : "Skipped"}
                  />
                </dl>

                <div className="flex flex-wrap gap-2 pt-1">
                  <Button onClick={handleRetake} variant="outline" size="sm" className="gap-2">
                    <Camera className="size-4" />
                    Retake
                  </Button>
                  <Button
                    onClick={() => onOpenChange(false)}
                    size="sm"
                    className="bg-gradient-to-r from-primary to-sky-500 text-white"
                  >
                    Done
                  </Button>
                  <Button
                    onClick={handleDelete}
                    variant="ghost"
                    size="sm"
                    disabled={isDeleting}
                    className="text-muted-foreground"
                  >
                    {isDeleting ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Trash2 className="size-4" />
                    )}
                    Remove saved photo
                  </Button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        {pendingFile && isUploading && step === "upload" ? (
          <p className="text-xs text-muted-foreground">
            Uploading {pendingFile.name}...
          </p>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border/70 bg-white/80 px-3 py-2">
      <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-sm font-medium text-foreground">{value}</p>
    </div>
  )
}
