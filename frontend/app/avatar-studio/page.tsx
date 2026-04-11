"use client"

import Link from "next/link"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { motion } from "framer-motion"
import { Box, Loader2, Orbit, RefreshCw, Sparkles, UserRound } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Progress } from "@/components/ui/progress"
import { useAuth } from "@/lib/auth"
import { garmentsApi, tryonApi, uploadApi, userApi } from "@/lib/api"
import { TIER_LABELS, TIER_TO_ALLOWED_MODES, type SubscriptionTier } from "@/lib/plans"
import { getApiErrorMessage } from "@/lib/api-error"
import { toast } from "sonner"

type GarmentItem = {
  id: number
  name: string
  image_url: string
  preprocess_status: string
  category: string | null
  saved_to_closet: boolean
}

type AvatarPayload = {
  status: string
  source_image_url: string | null
  model_id: string | null
  model_url: string | null
  preview_url: string | null
  turntable_url: string | null
  metadata: {
    provider?: string
    quality?: string
    body_profile?: {
      height_cm?: number
      body_type?: string
      gender?: string
      fit_preference?: string
      notes?: string
    }
  } | null
  error_message: string | null
  updated_at: string | null
}

type TryonStatusData = {
  tryon_id: number
  status: string
  progress: number
  current_stage: string
  result_image_url: string | null
  result_model_url: string | null
  result_turntable_url: string | null
  error_message: string | null
}

export default function AvatarStudioPage() {
  const { isAuthenticated, isLoading, user, loadUser } = useAuth()

  const [avatar, setAvatar] = useState<AvatarPayload | null>(null)
  const [isFetching, setIsFetching] = useState(false)
  const [isBuildingAvatar, setIsBuildingAvatar] = useState(false)
  const [garments, setGarments] = useState<GarmentItem[]>([])
  const [selectedGarmentId, setSelectedGarmentId] = useState<number | null>(null)
  const [quality, setQuality] = useState<"fast" | "balanced" | "best">("best")
  const [buildFile, setBuildFile] = useState<File | null>(null)
  const [heightCm, setHeightCm] = useState("")
  const [bodyType, setBodyType] = useState("")
  const [gender, setGender] = useState("")
  const [fitPreference, setFitPreference] = useState("")
  const [notes, setNotes] = useState("")

  const [isGenerating, setIsGenerating] = useState(false)
  const [statusData, setStatusData] = useState<TryonStatusData | null>(null)

  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const currentTier = (user?.subscription_tier || "free_2d") as SubscriptionTier
  const allowedModes = TIER_TO_ALLOWED_MODES[currentTier] || ["2d"]
  const has3dAccess = allowedModes.includes("3d")

  const hydrateAvatar = useCallback(async () => {
    if (!isAuthenticated) return
    const response = await userApi.getAvatarStatus()
    const payload = response?.data?.data as AvatarPayload
    setAvatar(payload)

    const profile = payload?.metadata?.body_profile || {}
    setHeightCm(profile.height_cm ? String(profile.height_cm) : "")
    setBodyType(profile.body_type || "")
    setGender(profile.gender || "")
    setFitPreference(profile.fit_preference || "")
    setNotes(profile.notes || "")
  }, [isAuthenticated])

  const hydrateCloset = useCallback(async () => {
    if (!isAuthenticated) return
    const response = await garmentsApi.list(0, 120, true)
    const next = Array.isArray(response.data) ? (response.data as GarmentItem[]) : []
    setGarments(next)
    if (!selectedGarmentId && next.length > 0) {
      setSelectedGarmentId(next[0].id)
    }
  }, [isAuthenticated, selectedGarmentId])

  const refreshAll = useCallback(async () => {
    if (!isAuthenticated) return
    setIsFetching(true)
    try {
      await Promise.all([hydrateAvatar(), hydrateCloset()])
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Could not load avatar studio data"))
    } finally {
      setIsFetching(false)
    }
  }, [hydrateAvatar, hydrateCloset, isAuthenticated])

  useEffect(() => {
    if (!isAuthenticated) return
    void refreshAll()
    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current)
      }
    }
  }, [isAuthenticated, refreshAll])

  const handleBuildAvatar = async () => {
    if (!has3dAccess) {
      toast.error("Your current plan does not include 3D avatar generation")
      return
    }

    setIsBuildingAvatar(true)
    try {
      let personImageUrl = avatar?.source_image_url || ""
      if (buildFile) {
        const uploaded = await uploadApi.uploadImage(buildFile)
        personImageUrl = uploaded.data.url
      }
      if (!personImageUrl) {
        toast.error("Upload an image or use your existing signup avatar source image")
        return
      }

      await userApi.buildAvatar({
        person_image_url: personImageUrl,
        quality,
        height_cm: heightCm ? Number(heightCm) : undefined,
        body_type: bodyType || undefined,
        gender: gender || undefined,
        fit_preference: fitPreference || undefined,
        notes: notes || undefined,
        force_rebuild: true,
      })

      await loadUser()
      await hydrateAvatar()
      toast.success("3D avatar model is ready")
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Avatar build failed"))
    } finally {
      setIsBuildingAvatar(false)
    }
  }

  const startPolling = (tryonId: number) => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current)
    }

    pollIntervalRef.current = setInterval(async () => {
      try {
        const response = await tryonApi.getStatus(tryonId)
        const next = response?.data?.data as TryonStatusData
        setStatusData(next)

        if (next.status === "completed") {
          if (pollIntervalRef.current) clearInterval(pollIntervalRef.current)
          setIsGenerating(false)
          toast.success("3D try-on complete")
        }
        if (next.status === "failed") {
          if (pollIntervalRef.current) clearInterval(pollIntervalRef.current)
          setIsGenerating(false)
          toast.error(next.error_message || "3D try-on failed")
        }
      } catch {
        if (pollIntervalRef.current) clearInterval(pollIntervalRef.current)
        setIsGenerating(false)
        toast.error("Lost connection while tracking 3D try-on")
      }
    }, 3000)
  }

  const handleTryOnSelectedGarment = async () => {
    if (!has3dAccess) {
      toast.error("Your current plan does not include 3D try-ons")
      return
    }
    if (!avatar || avatar.status !== "ready") {
      toast.error("Build your avatar first")
      return
    }
    if (!selectedGarmentId) {
      toast.error("Select a garment from closet")
      return
    }

    setIsGenerating(true)
    setStatusData(null)

    try {
      const response = await tryonApi.generate(selectedGarmentId, undefined, quality, "3d")
      const tryonId = response?.data?.data?.tryon_id as number
      if (!tryonId) {
        throw new Error("Missing tryon id")
      }
      startPolling(tryonId)
    } catch (error) {
      setIsGenerating(false)
      toast.error(getApiErrorMessage(error, "Could not start 3D try-on"))
    }
  }

  const selectedGarment = useMemo(
    () => garments.find((item) => item.id === selectedGarmentId) || null,
    [garments, selectedGarmentId]
  )

  const turntableUrl = statusData?.result_turntable_url || avatar?.turntable_url || null
  const previewUrl = statusData?.result_image_url || avatar?.preview_url || null
  const modelUrl = statusData?.result_model_url || avatar?.model_url || null

  if (isLoading) {
    return (
      <div className="min-h-screen grid place-items-center">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Loading avatar studio...
        </div>
      </div>
    )
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen grid place-items-center p-6">
        <Card className="max-w-xl w-full">
          <CardHeader>
            <CardTitle>Log in to open Avatar Studio</CardTitle>
            <CardDescription>Your 3D profile and closet are private to your account.</CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/try">
              <Button>Go to Login</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">3D Avatar Studio</p>
            <h1 className="text-3xl font-semibold tracking-tight">SMPL + PIFuHD Fitting Lab</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Build your avatar from signup profile inputs and run 3D closet try-ons with 360 output.
            </p>
          </div>

          <div className="flex gap-2">
            <Badge className="bg-white text-foreground border-border/70">{TIER_LABELS[currentTier]}</Badge>
            <Button variant="outline" className="gap-2" onClick={() => void refreshAll()} disabled={isFetching}>
              {isFetching ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
              Refresh
            </Button>
          </div>
        </div>

        {!has3dAccess ? (
          <Card className="border-amber-300 bg-amber-50/80">
            <CardHeader>
              <CardTitle>3D Tier Required</CardTitle>
              <CardDescription>
                Your current plan supports {allowedModes.join(", ").toUpperCase()} mode. Switch to a 3D-capable tier to use avatar studio.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Link href="/">
                <Button>Manage Plan in Dashboard</Button>
              </Link>
            </CardContent>
          </Card>
        ) : (
          <>
            <section className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
              <Card className="bg-white/80 border-border/70">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <UserRound className="size-5 text-primary" />
                    Avatar Profile Builder
                  </CardTitle>
                  <CardDescription>
                    These values are prefilled from your signup metadata and can be refined before rebuild.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1">
                      <Label htmlFor="heightCm">Height (cm)</Label>
                      <Input id="heightCm" value={heightCm} onChange={(e) => setHeightCm(e.target.value)} placeholder="170" />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="bodyType">Body Type</Label>
                      <Input id="bodyType" value={bodyType} onChange={(e) => setBodyType(e.target.value)} placeholder="athletic" />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="gender">Gender</Label>
                      <Input id="gender" value={gender} onChange={(e) => setGender(e.target.value)} placeholder="female / male / non-binary" />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="fitPreference">Fit Preference</Label>
                      <Input id="fitPreference" value={fitPreference} onChange={(e) => setFitPreference(e.target.value)} placeholder="regular / slim / oversized" />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <Label htmlFor="notes">Notes</Label>
                    <Input id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Any fit notes from signup or later edits" />
                  </div>

                  <div className="space-y-1">
                    <Label htmlFor="quality">Build Quality</Label>
                    <select
                      id="quality"
                      value={quality}
                      onChange={(e) => setQuality(e.target.value as "fast" | "balanced" | "best")}
                      className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                    >
                      <option value="fast">Fast</option>
                      <option value="balanced">Balanced</option>
                      <option value="best">Best</option>
                    </select>
                  </div>

                  <div className="space-y-1">
                    <Label htmlFor="buildFile">Avatar Source Image (optional rebuild input)</Label>
                    <Input
                      id="buildFile"
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      onChange={(e) => setBuildFile(e.target.files?.[0] ?? null)}
                    />
                  </div>

                  <Button className="w-full gap-2" onClick={() => void handleBuildAvatar()} disabled={isBuildingAvatar}>
                    {isBuildingAvatar ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
                    Build / Rebuild 3D Avatar
                  </Button>

                  <div className="text-xs text-muted-foreground">
                    Status: {avatar?.status || "not_started"}
                    {avatar?.error_message ? ` • ${avatar.error_message}` : ""}
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-white/80 border-border/70">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Orbit className="size-5 text-sky-600" />
                    360 Avatar Viewer
                  </CardTitle>
                  <CardDescription>Preview your latest avatar or fitted 3D output.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {previewUrl ? (
                    <div className="rounded-xl border border-border/70 overflow-hidden bg-muted/20 aspect-[4/5]">
                      <img src={previewUrl} alt="Avatar preview" className="h-full w-full object-cover" />
                    </div>
                  ) : (
                    <div className="rounded-xl border border-dashed border-border/70 h-64 grid place-items-center text-sm text-muted-foreground">
                      Build avatar to see preview.
                    </div>
                  )}

                  {turntableUrl ? (
                    turntableUrl.endsWith(".mp4") ? (
                      <video src={turntableUrl} controls className="w-full rounded-lg border border-border/70" />
                    ) : (
                      <iframe
                        src={turntableUrl}
                        title="360 avatar turntable"
                        className="w-full h-64 rounded-lg border border-border/70"
                      />
                    )
                  ) : (
                    <div className="rounded-lg border border-dashed border-border/70 p-3 text-xs text-muted-foreground">
                      360 view URL will appear here after avatar generation or 3D fitting.
                    </div>
                  )}

                  {modelUrl ? (
                    <a href={modelUrl} target="_blank" rel="noreferrer" className="text-xs text-sky-700 underline">
                      Open model asset
                    </a>
                  ) : null}
                </CardContent>
              </Card>
            </section>

            <section className="grid gap-4 lg:grid-cols-[1.05fr_0.95fr]">
              <Card className="bg-white/80 border-border/70">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Box className="size-5 text-fuchsia-600" />
                    Closet Garments for 3D Try-On
                  </CardTitle>
                  <CardDescription>
                    Only items explicitly saved to closet appear here.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {garments.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-border/70 p-4 text-sm text-muted-foreground">
                      No saved garments in closet yet. Save items from try-on history first.
                    </div>
                  ) : (
                    <div className="grid gap-2 sm:grid-cols-2">
                      {garments.map((garment) => {
                        const selected = selectedGarmentId === garment.id
                        return (
                          <button
                            key={garment.id}
                            onClick={() => setSelectedGarmentId(garment.id)}
                            className={[
                              "rounded-xl border p-2 text-left transition",
                              selected
                                ? "border-primary/60 bg-primary/5"
                                : "border-border/70 bg-white/70 hover:border-primary/40",
                            ].join(" ")}
                          >
                            <div className="flex gap-2">
                              <div className="size-16 rounded-md overflow-hidden bg-muted/20 shrink-0">
                                <img src={garment.image_url} alt={garment.name} className="h-full w-full object-cover" />
                              </div>
                              <div className="min-w-0">
                                <p className="text-sm font-medium truncate">{garment.name}</p>
                                <p className="text-xs text-muted-foreground truncate">{garment.category || "Uncategorized"}</p>
                                <Badge className="mt-1 bg-white border-border/70 text-foreground">
                                  {garment.preprocess_status}
                                </Badge>
                              </div>
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card className="bg-white/80 border-border/70">
                <CardHeader>
                  <CardTitle>Run 3D Try-On</CardTitle>
                  <CardDescription>
                    Fit selected closet garment on your latest avatar.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="rounded-lg border border-border/70 bg-white/70 p-3 text-sm">
                    <p className="font-medium">Selected Garment</p>
                    <p className="text-muted-foreground mt-1">{selectedGarment?.name || "None selected"}</p>
                  </div>

                  {isGenerating && statusData ? (
                    <div className="rounded-lg border border-border/70 bg-white/80 p-3 space-y-2">
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>{statusData.current_stage}</span>
                        <span>{statusData.progress}%</span>
                      </div>
                      <Progress value={statusData.progress} />
                    </div>
                  ) : null}

                  <Button
                    className="w-full gap-2"
                    onClick={() => void handleTryOnSelectedGarment()}
                    disabled={!selectedGarmentId || isGenerating || avatar?.status !== "ready"}
                  >
                    {isGenerating ? <Loader2 className="size-4 animate-spin" /> : <Orbit className="size-4" />}
                    Generate 3D Fit
                  </Button>

                  <p className="text-xs text-muted-foreground">
                    Requires avatar status = ready and a saved closet garment.
                  </p>
                </CardContent>
              </Card>
            </section>
          </>
        )}

        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="pt-2">
          <Link href="/">
            <Button variant="ghost">Back to Dashboard</Button>
          </Link>
        </motion.div>
      </div>
    </div>
  )
}
