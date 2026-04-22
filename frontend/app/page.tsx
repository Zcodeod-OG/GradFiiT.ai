"use client"

import { useState, useEffect, useCallback, useMemo, useRef } from "react"
import { motion, AnimatePresence } from "framer-motion"
import {
  ArrowRight,
  CalendarClock,
  Camera,
  History,
  LayoutDashboard,
  Loader2,
  LogOut,
  Orbit,
  Plus,
  RefreshCw,
  Settings,
  Shirt,
  Sparkles,
  Target,
  Trophy,
  Upload,
  UserCircle2,
} from "lucide-react"
import { Navbar } from "@/components/Navbar"
import { HeroSection } from "@/components/ui/hero-section"
import { FeaturesSection } from "@/components/ui/features-section"
import { DemoSection } from "@/components/DemoSection"
import { StyleQuestSection } from "@/components/ui/style-quest-section"
import { HowItWorksSection } from "@/components/how-it-works-section"
import { PricingSection } from "@/components/pricing-section"
import { ScrollStory } from "@/components/landing/ScrollStory"
import { CompareScrubSection } from "@/components/landing/CompareScrubSection"
import { ExtensionShowcase } from "@/components/landing/ExtensionShowcase"
import { StatsTickerSection } from "@/components/landing/StatsTickerSection"
import { Footer } from "@/components/ui/footer"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Progress } from "@/components/ui/progress"
import { PhotoWizard } from "@/components/onboarding/PhotoWizard"
import { PipelineMeter } from "@/components/PipelineMeter"
import { useTryOnLiveStatus } from "@/components/hooks/useTryOnLiveStatus"
import { CommandPalette, useCommandPaletteToggle } from "@/components/CommandPalette"
import { useDropzone } from "react-dropzone"
import { useAuth } from "@/lib/auth"
import { garmentsApi, tryonApi, uploadApi, userApi } from "@/lib/api"
import { TIER_LABELS, TIER_TO_ALLOWED_MODES, type SubscriptionTier, type TryOnMode } from "@/lib/plans"
import { toast } from "sonner"
import Link from "next/link"

type GarmentItem = {
  id: number
  name: string
  description: string | null
  category: string | null
  image_url: string
  preprocess_status: string
  preprocess_error: string | null
  saved_to_closet: boolean
  created_at: string
}

type TryOnItem = {
  id: number
  garment_id: number
  status: string
  result_image_url: string | null
  garment_image_url: string | null
  tryon_mode: string
  created_at: string
  rating_score: number | null
  quality_gate_passed: boolean | null
  error_message: string | null
}

type NavKey = "overview" | "closet" | "history" | "settings"

const statusLabelMap: Record<string, string> = {
  pending: "Pending",
  garment_extracting: "Extracting Garment",
  garment_extracted: "Garment Ready",
  stage1_processing: "Initial Try-On",
  stage1_completed: "Try-On Done",
  quality_checking: "Quality Check",
  quality_passed: "Quality Passed",
  quality_failed: "Refining",
  stage2_processing: "Refining",
  rating_computing: "Scoring",
  completed: "Completed",
  failed: "Failed",
}

const getStatusBadgeClass = (status: string): string => {
  if (status === "completed") return "bg-emerald-100 text-emerald-700 border-emerald-200"
  if (status === "failed") return "bg-red-100 text-red-700 border-red-200"
  return "bg-sky-100 text-sky-700 border-sky-200"
}

const garmentStatusLabelMap: Record<string, string> = {
  pending: "Pending",
  queued: "Queued",
  processing: "Processing",
  ready: "Ready",
  failed: "Failed",
}

const getGarmentStatusBadgeClass = (status: string): string => {
  if (status === "ready") return "bg-emerald-100 text-emerald-700 border-emerald-200"
  if (status === "failed") return "bg-red-100 text-red-700 border-red-200"
  return "bg-amber-100 text-amber-700 border-amber-200"
}

const formatTimeAgo = (value: string): string => {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "Unknown"
  const diffMs = Date.now() - date.getTime()
  const minutes = Math.floor(diffMs / (1000 * 60))
  if (minutes < 1) return "Just now"
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  return date.toLocaleDateString()
}

const getErrorMessage = (error: unknown, fallback: string): string => {
  if (typeof error === "object" && error !== null && "response" in error) {
    const response = (error as { response?: { data?: { detail?: string } } }).response
    if (response?.data?.detail) return response.data.detail
  }
  return fallback
}

const normalizeTryons = (payload: unknown): TryOnItem[] => {
  if (Array.isArray(payload)) return payload as TryOnItem[]
  if (typeof payload !== "object" || payload === null) return []

  const wrapped = payload as { data?: { tryons?: TryOnItem[] } }
  if (Array.isArray(wrapped.data?.tryons)) return wrapped.data.tryons
  return []
}

function PublicLanding() {
  const [showFloatingCTA, setShowFloatingCTA] = useState(false)

  useEffect(() => {
    const handleScroll = () => {
      setShowFloatingCTA(window.scrollY > 600)
    }
    window.addEventListener("scroll", handleScroll, { passive: true })
    return () => window.removeEventListener("scroll", handleScroll)
  }, [])

  return (
    <div className="min-h-screen scroll-smooth">
      <Navbar />
      <main>
        <HeroSection />
        <ScrollStory />
        <CompareScrubSection />
        <FeaturesSection />
        <DemoSection />
        <ExtensionShowcase />
        <StyleQuestSection />
        <StatsTickerSection />
        <HowItWorksSection />
        <PricingSection />
      </main>
      <Footer />

      {/* Floating CTA */}
      <AnimatePresence>
        {showFloatingCTA && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.8, y: 20 }}
            transition={{ type: "spring", stiffness: 300, damping: 25 }}
            className="fixed bottom-8 right-8 z-40"
          >
            <Link href="/try">
              <Button
                size="lg"
                className="bg-primary hover:bg-primary/90 text-primary-foreground pulse-glow shadow-2xl shadow-primary/25 h-12 px-6"
              >
                Try It Free
                <ArrowRight className="size-4 ml-2" />
              </Button>
            </Link>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export default function Page() {
  const { user, token, isAuthenticated, isLoading, loadUser, logout } = useAuth()
  const [isAuthReady, setIsAuthReady] = useState(false)
  const [activeNav, setActiveNav] = useState<NavKey>("overview")
  const [garments, setGarments] = useState<GarmentItem[]>([])
  const [tryons, setTryons] = useState<TryOnItem[]>([])
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [feedVisibleCount, setFeedVisibleCount] = useState(6)
  const [styleVibe, setStyleVibe] = useState("Street Core")
  const [shoppingMoment, setShoppingMoment] = useState("Weekend Drop")
  const [colorPalette, setColorPalette] = useState("Neutrals")
  const [compareReveal, setCompareReveal] = useState(54)
  const [newGarmentName, setNewGarmentName] = useState("")
  const [newGarmentCategory, setNewGarmentCategory] = useState("")
  const [newGarmentDescription, setNewGarmentDescription] = useState("")
  const [newGarmentFile, setNewGarmentFile] = useState<File | null>(null)
  const [isSavingPreferences, setIsSavingPreferences] = useState(false)
  const [savingGarmentIds, setSavingGarmentIds] = useState<number[]>([])
  const [photoWizardOpen, setPhotoWizardOpen] = useState(false)
  const [photoWizardForceOnboarding, setPhotoWizardForceOnboarding] = useState(false)
  const [photoWizardSeen, setPhotoWizardSeen] = useState(false)
  const [activeTryOnId, setActiveTryOnId] = useState<number | null>(null)
  const [quickTryError, setQuickTryError] = useState<string | null>(null)
  const [quickTryStartingGarmentId, setQuickTryStartingGarmentId] = useState<number | null>(null)
  const [stickyDrawerCollapsed, setStickyDrawerCollapsed] = useState(false)
  const [commandOpen, setCommandOpen] = useCommandPaletteToggle()
  const garmentDropzone = useDropzone({
    accept: {
      "image/png": [".png"],
      "image/jpeg": [".jpg", ".jpeg"],
      "image/webp": [".webp"],
    },
    multiple: false,
    onDrop: (accepted) => {
      const file = accepted[0]
      if (file) setNewGarmentFile(file)
    },
  })
  const feedSentinelRef = useRef<HTMLDivElement | null>(null)

  const navItems: Array<{ key: NavKey; label: string; icon: typeof LayoutDashboard }> = [
    { key: "overview", label: "Dashboard", icon: LayoutDashboard },
    { key: "closet", label: "My Closet", icon: Shirt },
    { key: "history", label: "Try-On History", icon: History },
    { key: "settings", label: "Settings", icon: Settings },
  ]

  useEffect(() => {
    let active = true

    const hydrateUser = async () => {
      if (!token) {
        if (active) setIsAuthReady(true)
        return
      }
      try {
        await loadUser()
      } finally {
        if (active) setIsAuthReady(true)
      }
    }

    void hydrateUser()

    return () => {
      active = false
    }
  }, [loadUser, token])

  const refreshDashboard = useCallback(async () => {
    if (!isAuthenticated) return

    setIsRefreshing(true)
    try {
      const [garmentResponse, tryonResponse] = await Promise.all([
        garmentsApi.list(0, 48),
        tryonApi.list(0, 24),
      ])

      setGarments(Array.isArray(garmentResponse.data) ? garmentResponse.data : [])
      setTryons(normalizeTryons(tryonResponse.data))
    } catch (error) {
      toast.error(getErrorMessage(error, "Could not load your closet data"))
    } finally {
      setIsRefreshing(false)
    }
  }, [isAuthenticated])

  useEffect(() => {
    if (isAuthenticated) {
      void refreshDashboard()
    }
  }, [isAuthenticated, refreshDashboard])

  // First-login Photo Wizard. We open the wizard exactly once per
  // session when the authenticated user has no saved default photo, so
  // every other surface (/try, Quick Try, the extension overlay) can
  // assume the photo exists.
  useEffect(() => {
    if (!isAuthenticated || !user) return
    if (user.default_person_image_url) return
    if (photoWizardSeen) return
    setPhotoWizardForceOnboarding(true)
    setPhotoWizardOpen(true)
    setPhotoWizardSeen(true)
  }, [isAuthenticated, user, photoWizardSeen])

  useEffect(() => {
    if (!isAuthenticated) return

    const hasPreprocessing = garments.some(
      (garment) => garment.preprocess_status !== "ready" && garment.preprocess_status !== "failed"
    )

    if (!hasPreprocessing) return

    const timer = window.setInterval(() => {
      void refreshDashboard()
    }, 5000)

    return () => {
      window.clearInterval(timer)
    }
  }, [garments, isAuthenticated, refreshDashboard])

  const completedCount = tryons.filter((item) => item.status === "completed").length
  const inProgressCount = tryons.filter(
    (item) => item.status !== "completed" && item.status !== "failed"
  ).length
  const completionRate = tryons.length > 0 ? Math.round((completedCount / tryons.length) * 100) : 0
  const closetGarments = garments.filter((garment) => garment.saved_to_closet)
  const closetGarmentIds = useMemo(
    () => new Set(closetGarments.map((garment) => garment.id)),
    [closetGarments]
  )

  const categoryBreakdown = useMemo(() => {
    const counts = new Map<string, number>()
    closetGarments.forEach((garment) => {
      const key = (garment.category || "Uncategorized").trim() || "Uncategorized"
      counts.set(key, (counts.get(key) ?? 0) + 1)
    })
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
  }, [closetGarments])

  const behaviorPersona = useMemo(() => {
    if (completedCount >= 18) return "Trend Sniper"
    if (inProgressCount >= 4) return "Look Builder"
    if (closetGarments.length >= 8) return "Closet Curator"
    return "Style Explorer"
  }, [completedCount, inProgressCount, closetGarments.length])

  const currentTier = (user?.subscription_tier || "free_2d") as SubscriptionTier
  const preferredMode = (user?.preferred_tryon_mode || "2d") as TryOnMode
  const allowedModes = TIER_TO_ALLOWED_MODES[currentTier] || ["2d"]

  const { status: activeTryOnStatus } = useTryOnLiveStatus(activeTryOnId)

  // Resumable processing: when the user returns to the dashboard with
  // an in-flight try-on, surface it in the sticky drawer automatically.
  useEffect(() => {
    if (activeTryOnId) return
    const inFlight = tryons.find(
      (item) =>
        item.status !== "completed" &&
        item.status !== "failed" &&
        item.status !== "dead_letter"
    )
    if (inFlight) {
      setActiveTryOnId(inFlight.id)
      setStickyDrawerCollapsed(false)
    }
  }, [tryons, activeTryOnId])

  // When the live status reports completion, refresh the dashboard so
  // the new result appears in the runway feed and the meter clears.
  useEffect(() => {
    if (!activeTryOnStatus) return
    if (
      activeTryOnStatus.status === "completed" ||
      activeTryOnStatus.status === "failed" ||
      activeTryOnStatus.status === "dead_letter"
    ) {
      void refreshDashboard()
    }
  }, [activeTryOnStatus, refreshDashboard])

  const handleQuickTry = useCallback(
    async (garmentId: number) => {
      if (!user?.default_person_image_url) {
        setPhotoWizardForceOnboarding(false)
        setPhotoWizardOpen(true)
        toast.info("Add your photo first to use Quick Try")
        return
      }
      setQuickTryStartingGarmentId(garmentId)
      setQuickTryError(null)
      try {
        const response = await tryonApi.generate(
          garmentId,
          undefined, // backend will use the saved default photo
          "balanced",
          (preferredMode || "2d") as TryOnMode
        )
        const tryonId = response.data?.data?.tryon_id
        if (tryonId) {
          setActiveTryOnId(Number(tryonId))
          setStickyDrawerCollapsed(false)
          toast.success("Try-on started -- watch the progress bar.")
        }
      } catch (error) {
        const detail =
          (error as { response?: { data?: { detail?: string } } }).response?.data?.detail ||
          (error as Error).message ||
          "Could not start try-on"
        setQuickTryError(detail)
        toast.error(detail)
      } finally {
        setQuickTryStartingGarmentId(null)
      }
    },
    [user, preferredMode, refreshDashboard]
  )

  const compareSource = useMemo(
    () =>
      tryons.find((item) => item.result_image_url && item.garment_image_url) ||
      tryons.find((item) => item.result_image_url),
    [tryons]
  )

  const compareLeftImage = compareSource?.garment_image_url || closetGarments[0]?.image_url || null
  const compareRightImage = compareSource?.result_image_url || tryons[0]?.result_image_url || null
  // Runway Feed rules:
  //  - Terminal failures (failed / dead_letter) never appear -- the user
  //    asked for a curated "looks" stream, not a debugging log.
  //  - We also drop items with no image at all to keep the reel from
  //    stuttering into empty cards while a run is still seeding.
  const feedItems = tryons.filter((item) => {
    if (item.status === "failed" || item.status === "dead_letter") return false
    const hasImage = Boolean(item.result_image_url || item.garment_image_url)
    return hasImage
  })
  const visibleFeedItems = feedItems.slice(0, Math.min(feedVisibleCount, feedItems.length))
  const recommendedGarments = closetGarments.slice(0, 6)
  const styleXp = completedCount * 45 + closetGarments.length * 18 + inProgressCount * 10
  const currentLevel = Math.max(1, Math.floor(styleXp / 250) + 1)
  const nextLevelXp = currentLevel * 250
  const previousLevelXp = (currentLevel - 1) * 250
  const levelProgress =
    nextLevelXp > previousLevelXp
      ? Math.round(((styleXp - previousLevelXp) / (nextLevelXp - previousLevelXp)) * 100)
      : 0

  const styleMissions = [
    {
      label: "Complete 2 try-ons",
      progress: Math.min(completedCount, 2),
      target: 2,
      reward: "+80 XP",
    },
    {
      label: "Add 1 new garment",
      progress: closetGarments.length > 0 ? 1 : 0,
      target: 1,
      reward: "Palette unlock",
    },
    {
      label: "Run a high-quality look",
      progress: tryons.some((item) => typeof item.rating_score === "number") ? 1 : 0,
      target: 1,
      reward: "Pro badge",
    },
  ]

  const missionCompletion = Math.round(
    (styleMissions.reduce((acc, mission) => acc + mission.progress / mission.target, 0) /
      styleMissions.length) *
      100
  )

  const handleSaveTryOnGarment = async (item: TryOnItem) => {
    if (!item.garment_id) {
      toast.error("This try-on does not have a reusable garment record")
      return
    }
    if (closetGarmentIds.has(item.garment_id)) {
      toast.info("Already in your closet")
      return
    }

    setSavingGarmentIds((prev) => [...prev, item.garment_id])

    // Optimistic update: flip the local garment state immediately so the
    // closet count and "Save to closet" affordance reflect the action
    // before the network round-trip completes.
    const previousGarments = garments
    setGarments((prev) =>
      prev.map((garment) =>
        garment.id === item.garment_id
          ? { ...garment, saved_to_closet: true }
          : garment
      )
    )

    try {
      await garmentsApi.update(item.garment_id, { saved_to_closet: true })
      toast.success("Added to closet")
      // Background refresh keeps the rest of the dashboard in sync, but the
      // user already sees the change.
      void refreshDashboard()
    } catch (error) {
      // Roll back the optimistic mutation on failure.
      setGarments(previousGarments)
      toast.error(getErrorMessage(error, "Could not add this garment to closet"))
    } finally {
      setSavingGarmentIds((prev) => prev.filter((id) => id !== item.garment_id))
    }
  }

  useEffect(() => {
    setFeedVisibleCount(6)
  }, [activeNav, tryons.length])

  useEffect(() => {
    if (activeNav !== "overview") return

    const sentinel = feedSentinelRef.current
    if (!sentinel) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting) return
        setFeedVisibleCount((current) => Math.min(current + 4, feedItems.length))
      },
      { rootMargin: "220px 0px" }
    )

    observer.observe(sentinel)

    return () => {
      observer.disconnect()
    }
  }, [activeNav, feedItems.length])

  const handleUploadGarment = async () => {
    if (!newGarmentName.trim()) {
      toast.error("Please give your garment a name")
      return
    }
    if (!newGarmentFile) {
      toast.error("Please select a garment image")
      return
    }

    setIsUploading(true)
    try {
      const uploaded = await uploadApi.uploadGarment(newGarmentFile)
      const createdGarment = await garmentsApi.create({
        name: newGarmentName.trim(),
        description: newGarmentDescription.trim() || undefined,
        category: newGarmentCategory.trim() || "uncategorized",
        image_url: uploaded.data.url,
        s3_key: uploaded.data.s3_key,
        saved_to_closet: true,
      })

      setNewGarmentName("")
      setNewGarmentCategory("")
      setNewGarmentDescription("")
      setNewGarmentFile(null)
      const preprocessStatus = createdGarment.data?.preprocess_status
      if (preprocessStatus === "ready") {
        toast.success("Garment added to your closet")
      } else {
        toast.success("Garment uploaded. Preprocessing is running in the background.")
      }
      await refreshDashboard()
    } catch (error) {
      toast.error(getErrorMessage(error, "Could not add this garment"))
    } finally {
      setIsUploading(false)
    }
  }

  const handleSavePreferences = async (payload: {
    preferred_tryon_mode?: TryOnMode
    subscription_tier?: SubscriptionTier
  }) => {
    setIsSavingPreferences(true)
    try {
      await userApi.updatePreferences(payload)
      await loadUser()
      toast.success("Preferences updated")
    } catch (error) {
      toast.error(getErrorMessage(error, "Could not update preferences"))
    } finally {
      setIsSavingPreferences(false)
    }
  }

  if (!isAuthReady || isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex items-center gap-3 text-muted-foreground">
          <Loader2 className="size-5 animate-spin" />
          Loading your workspace...
        </div>
      </div>
    )
  }

  if (!isAuthenticated) {
    return <PublicLanding />
  }

  return (
    <div className="min-h-screen bg-background gradient-mesh relative overflow-x-clip">
      <div className="pointer-events-none absolute -top-36 -left-20 h-72 w-72 rounded-full bg-[radial-gradient(circle,_oklch(0.78_0.19_255_/_0.32)_0%,_transparent_72%)] blur-2xl" />
      <div className="pointer-events-none absolute top-36 -right-16 h-96 w-96 rounded-full bg-[radial-gradient(circle,_oklch(0.84_0.19_150_/_0.32)_0%,_transparent_72%)] blur-2xl" />

      <div className="mx-auto max-w-7xl p-4 md:p-6 relative">
        <div className="grid gap-4 md:grid-cols-[250px_1fr]">
          <aside className="rounded-2xl border border-border/70 bg-white/65 backdrop-blur-xl p-3 md:p-4 md:sticky md:top-6 md:h-[calc(100vh-3rem)] shadow-[0_18px_48px_oklch(0.28_0.06_250/_0.14)]">
            <div className="flex items-center gap-2 px-2 pb-4 border-b border-border/70">
              <div className="size-8 rounded-xl bg-gradient-to-br from-primary/90 via-sky-500 to-emerald-400 text-white flex items-center justify-center shadow-md">
                <Sparkles className="size-4" />
              </div>
              <div>
                <p className="font-semibold leading-none">GradFiT Home</p>
                <p className="text-[11px] text-muted-foreground mt-1">{behaviorPersona}</p>
              </div>
            </div>

            <div className="mt-4 space-y-1">
              {navItems.map((item) => {
                const Icon = item.icon
                const isActive = activeNav === item.key
                return (
                  <button
                    key={item.key}
                    onClick={() => setActiveNav(item.key)}
                    className={[
                      "w-full flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition",
                      isActive
                        ? "bg-gradient-to-r from-primary to-sky-500 text-white shadow-[0_10px_28px_oklch(0.55_0.14_252/_0.25)]"
                        : "hover:bg-secondary/80 text-muted-foreground hover:text-foreground",
                    ].join(" ")}
                  >
                    <Icon className="size-4" />
                    {item.label}
                  </button>
                )
              })}
            </div>

            <div className="mt-6 rounded-xl border border-border/70 p-3 bg-gradient-to-br from-white/80 to-sky-50/70">
              <p className="text-sm font-medium">Quick actions</p>
              <div className="mt-3 space-y-2">
                <Link href={`/try?mode=${preferredMode}`}>
                  <Button size="sm" className="w-full justify-start gap-2 bg-gradient-to-r from-primary to-sky-500 text-white">
                    <Camera className="size-4" />
                    Start Try-On
                  </Button>
                </Link>
                {allowedModes.includes("3d") ? (
                  <Link href="/avatar-studio">
                    <Button size="sm" variant="outline" className="w-full justify-start gap-2 bg-white/80">
                      <Orbit className="size-4" />
                      Open Avatar Studio
                    </Button>
                  </Link>
                ) : null}
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full justify-start gap-2 bg-white/80"
                  onClick={() => setActiveNav("closet")}
                >
                  <Plus className="size-4" />
                  Add to Closet
                </Button>
              </div>
            </div>

            <div className="mt-4 rounded-xl border border-border/70 bg-white/70 p-3">
              <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Style Pulse</p>
              <p className="mt-2 text-xl font-semibold">{completionRate}%</p>
              <p className="text-xs text-muted-foreground">Completed looks this cycle</p>
              <div className="mt-3 h-2 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-primary via-sky-500 to-emerald-400 transition-all duration-500"
                  style={{ width: `${completionRate}%` }}
                />
              </div>
            </div>
          </aside>

          <main className="space-y-4 md:space-y-6">
            <Card className="bg-white/70 backdrop-blur-xl border-border/70 overflow-hidden">
              <CardContent className="px-5 py-4 md:px-6 md:py-5">
                <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                  <div>
                    <p className="text-xs uppercase tracking-[0.18em] text-sky-700/80">Closet control center</p>
                    <h1 className="text-2xl md:text-3xl font-semibold tracking-tight text-balance">
                      {user?.full_name || user?.email || "Your personal closet"}
                    </h1>
                    <p className="mt-1 text-sm text-muted-foreground max-w-2xl">
                      Visual feed, smart picks, and one-tap try-ons tuned to how you actually shop.
                    </p>
                  </div>

                  <div className="flex gap-2 flex-wrap">
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-2 bg-white/80"
                      onClick={() => void refreshDashboard()}
                      disabled={isRefreshing}
                    >
                      {isRefreshing ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <RefreshCw className="size-4" />
                      )}
                      Refresh
                    </Button>
                    <Link href={`/try?mode=${preferredMode}`}>
                      <Button size="sm" className="gap-2 bg-gradient-to-r from-primary to-sky-500 text-white">
                        <Camera className="size-4" />
                        New Try-On
                      </Button>
                    </Link>
                    <Button variant="ghost" size="sm" className="gap-2" onClick={logout}>
                      <LogOut className="size-4" />
                      Log out
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <Card className="bg-gradient-to-br from-blue-50 to-white border-blue-200/60">
                <CardContent className="px-5 py-4">
                  <p className="text-xs text-sky-700/80 uppercase tracking-[0.14em]">Items in Closet</p>
                  <p className="mt-2 text-2xl font-semibold text-sky-950">{closetGarments.length}</p>
                </CardContent>
              </Card>
              <Card className="bg-gradient-to-br from-violet-50 to-white border-violet-200/60">
                <CardContent className="px-5 py-4">
                  <p className="text-xs text-violet-700/80 uppercase tracking-[0.14em]">Total Try-Ons</p>
                  <p className="mt-2 text-2xl font-semibold text-violet-950">{tryons.length}</p>
                </CardContent>
              </Card>
              <Card className="bg-gradient-to-br from-emerald-50 to-white border-emerald-200/70">
                <CardContent className="px-5 py-4">
                  <p className="text-xs text-emerald-700/80 uppercase tracking-[0.14em]">Completed Results</p>
                  <p className="mt-2 text-2xl font-semibold text-emerald-950">{completedCount}</p>
                </CardContent>
              </Card>
              <Card className="bg-gradient-to-br from-amber-50 to-white border-amber-200/70">
                <CardContent className="px-5 py-4">
                  <p className="text-xs text-amber-700/80 uppercase tracking-[0.14em]">In Progress</p>
                  <p className="mt-2 text-2xl font-semibold text-amber-950">{inProgressCount}</p>
                </CardContent>
              </Card>
            </section>

            {activeNav === "overview" && (
              <div className="space-y-4">
                <Card className="bg-white/72 backdrop-blur-lg border-border/70">
                  <CardHeader className="pb-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <CardTitle className="text-lg flex items-center gap-2">
                          <Sparkles className="size-5 text-fuchsia-500" />
                          Quick Try
                        </CardTitle>
                        <CardDescription>
                          {user?.default_person_image_url
                            ? "Tap any garment to instantly run a try-on with your saved photo."
                            : "Add your photo once and Quick Try lets you launch a look in a single tap."}
                        </CardDescription>
                      </div>
                      {user?.default_person_image_url ? (
                        <span className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs text-emerald-700">
                          <span className="relative size-6 overflow-hidden rounded-full ring-1 ring-emerald-200">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={user.default_person_smart_crop_url || user.default_person_image_url}
                              alt="You"
                              className="size-full object-cover"
                            />
                          </span>
                          Saved photo ready
                        </span>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setPhotoWizardForceOnboarding(true)
                            setPhotoWizardOpen(true)
                          }}
                        >
                          Add my photo
                        </Button>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent>
                    {closetGarments.length === 0 ? (
                      <div className="rounded-xl border border-dashed border-border/70 p-6 text-center text-muted-foreground">
                        Your closet is empty. Save a few looks first to enable Quick Try.
                        <div className="mt-4">
                          <Link href={`/try?mode=${preferredMode}`}>
                            <Button className="bg-gradient-to-r from-primary to-sky-500 text-white">
                              Open the studio <ArrowRight className="size-4" />
                            </Button>
                          </Link>
                        </div>
                      </div>
                    ) : (
                      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
                        {closetGarments.slice(0, 6).map((garment) => {
                          const launching = quickTryStartingGarmentId === garment.id
                          return (
                            <button
                              key={garment.id}
                              type="button"
                              onClick={() => void handleQuickTry(garment.id)}
                              disabled={launching || activeTryOnStatus?.status === "stage1_processing"}
                              className="group relative aspect-square overflow-hidden rounded-xl border border-border/70 bg-muted/40 transition hover:border-primary/40 hover:shadow-md disabled:opacity-60"
                            >
                              {garment.image_url ? (
                                /* eslint-disable-next-line @next/next/no-img-element */
                                <img
                                  src={garment.image_url}
                                  alt={garment.name || "Garment"}
                                  className="size-full object-cover transition group-hover:scale-105"
                                />
                              ) : (
                                <div className="flex size-full items-center justify-center text-xs text-muted-foreground">
                                  No image
                                </div>
                              )}
                              <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent px-2 py-1.5 text-left text-[11px] font-medium text-white opacity-0 transition group-hover:opacity-100">
                                {launching ? "Launching..." : "Quick try"}
                              </div>
                            </button>
                          )
                        })}
                      </div>
                    )}
                    {quickTryError ? (
                      <p className="mt-3 text-xs text-destructive">{quickTryError}</p>
                    ) : null}
                  </CardContent>
                </Card>

                <section className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
                  <Card className="bg-white/72 backdrop-blur-lg border-border/70">
                    <CardHeader>
                      <CardTitle className="text-lg flex items-center gap-2">
                        <Trophy className="size-5 text-amber-500" />
                        Style Journey
                      </CardTitle>
                      <CardDescription>
                        Level progression based on your closet activity and try-on results.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="grid gap-3 sm:grid-cols-3">
                        <div className="rounded-xl border border-border/70 bg-gradient-to-br from-amber-50 to-orange-50 p-3">
                          <p className="text-xs uppercase tracking-[0.12em] text-amber-700/80">Current Level</p>
                          <p className="mt-1 text-2xl font-semibold text-amber-900">L{currentLevel}</p>
                        </div>
                        <div className="rounded-xl border border-border/70 bg-gradient-to-br from-fuchsia-50 to-pink-50 p-3">
                          <p className="text-xs uppercase tracking-[0.12em] text-fuchsia-700/80">Style XP</p>
                          <p className="mt-1 text-2xl font-semibold text-fuchsia-900">{styleXp}</p>
                        </div>
                        <div className="rounded-xl border border-border/70 bg-gradient-to-br from-sky-50 to-cyan-50 p-3">
                          <p className="text-xs uppercase tracking-[0.12em] text-sky-700/80">Quest Completion</p>
                          <p className="mt-1 text-2xl font-semibold text-sky-900">{missionCompletion}%</p>
                        </div>
                      </div>

                      <div className="rounded-xl border border-border/70 bg-white/80 p-3">
                        <div className="flex items-center justify-between text-xs text-muted-foreground mb-2">
                          <span>Progress to L{currentLevel + 1}</span>
                          <span>{styleXp}/{nextLevelXp} XP</span>
                        </div>
                        <Progress value={Math.max(0, Math.min(100, levelProgress))} />
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="bg-white/72 backdrop-blur-lg border-border/70">
                    <CardHeader>
                      <CardTitle className="text-lg flex items-center gap-2">
                        <Target className="size-5 text-sky-600" />
                        Daily Missions
                      </CardTitle>
                      <CardDescription>Small actions that unlock personalization perks.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {styleMissions.map((mission) => {
                        const done = mission.progress >= mission.target
                        return (
                          <div key={mission.label} className="rounded-xl border border-border/70 bg-white/80 p-3">
                            <div className="flex items-center justify-between gap-2">
                              <p className="text-sm font-medium">{mission.label}</p>
                              <Badge className={done ? "bg-emerald-100 text-emerald-700 border-emerald-200" : "bg-sky-100 text-sky-700 border-sky-200"}>
                                {mission.reward}
                              </Badge>
                            </div>
                            <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                              <span>{mission.progress}/{mission.target}</span>
                              <span>{done ? "Completed" : "In progress"}</span>
                            </div>
                            <Progress className="mt-2" value={Math.round((mission.progress / mission.target) * 100)} />
                          </div>
                        )
                      })}
                    </CardContent>
                  </Card>
                </section>

                <section className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
                <Card className="bg-white/72 backdrop-blur-lg border-border/70 overflow-hidden">
                  <CardHeader className="flex flex-row items-start justify-between gap-3">
                    <div>
                      <CardTitle className="text-lg">Runway Feed</CardTitle>
                      <CardDescription>
                        Swipe through your looks. Drag or scroll to reel through each try-on.
                      </CardDescription>
                    </div>
                    {feedItems.length > 0 ? (
                      <Badge className="bg-foreground/5 text-foreground/70 border-transparent">
                        {feedItems.length} {feedItems.length === 1 ? "look" : "looks"}
                      </Badge>
                    ) : null}
                  </CardHeader>
                  <CardContent className="p-0">
                    {feedItems.length === 0 ? (
                      <div className="m-6 rounded-lg border border-dashed border-border/70 p-6 text-center text-muted-foreground">
                        No looks in your feed yet. Launch your first try-on to start building your runway.
                        <div className="mt-4">
                          <Link href={`/try?mode=${preferredMode}`}>
                            <Button className="bg-gradient-to-r from-primary to-sky-500 text-white">
                              Start Feed <ArrowRight className="size-4" />
                            </Button>
                          </Link>
                        </div>
                      </div>
                    ) : (
                      // TikTok-style reel: tall vertical viewport, snap-scroll
                      // between items so each try-on fills the frame. We give
                      // the scroller a fixed height and let each article be
                      // full-height + snap-start, which is what locks each look
                      // into place as the user scrolls.
                      <div
                        className="runway-reel relative h-[640px] overflow-y-auto snap-y snap-mandatory"
                        style={{
                          scrollbarWidth: "none",
                          WebkitOverflowScrolling: "touch",
                        }}
                      >
                        {visibleFeedItems.map((item, index) => {
                          const heroImage = item.result_image_url || item.garment_image_url
                          const isComplete = item.status === "completed"
                          const isProcessing =
                            item.status !== "completed" &&
                            item.status !== "failed" &&
                            item.status !== "dead_letter"
                          return (
                            <motion.article
                              key={item.id}
                              initial={{ opacity: 0 }}
                              animate={{ opacity: 1 }}
                              transition={{ duration: 0.24, delay: Math.min(index, 3) * 0.04 }}
                              className="relative h-full w-full snap-start snap-always"
                            >
                              {/* Hero image fills the reel. Contain (not cover)
                                  so fashion shots aren't cropped to the face. */}
                              {heroImage ? (
                                /* eslint-disable-next-line @next/next/no-img-element */
                                <img
                                  src={heroImage}
                                  alt={`Look #${item.id}`}
                                  className="absolute inset-0 h-full w-full object-contain bg-gradient-to-br from-slate-100 via-white to-sky-50"
                                />
                              ) : (
                                <div className="absolute inset-0 flex items-center justify-center bg-muted/30">
                                  <Shirt className="size-10 text-muted-foreground" />
                                </div>
                              )}

                              {/* Top fade + meta row */}
                              <div className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-black/55 via-black/10 to-transparent" />
                              <div className="absolute left-4 right-4 top-4 flex items-center justify-between text-white">
                                <div className="flex items-center gap-2">
                                  <span className="rounded-full bg-white/15 backdrop-blur px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.2em]">
                                    Look #{item.id}
                                  </span>
                                  {isProcessing ? (
                                    <span className="rounded-full bg-sky-500/90 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] backdrop-blur flex items-center gap-1.5">
                                      <span className="relative flex size-1.5">
                                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white/70" />
                                        <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-white" />
                                      </span>
                                      {statusLabelMap[item.status] || item.status}
                                    </span>
                                  ) : null}
                                  {isComplete && typeof item.rating_score === "number" ? (
                                    <span className="rounded-full bg-emerald-500/90 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] backdrop-blur flex items-center gap-1">
                                      <Sparkles className="size-3" />
                                      {item.rating_score.toFixed(1)}
                                    </span>
                                  ) : null}
                                </div>
                                <span className="rounded-full bg-black/30 backdrop-blur px-2.5 py-1 text-[10px] font-medium">
                                  {formatTimeAgo(item.created_at)}
                                </span>
                              </div>

                              {/* Bottom fade + action row (TikTok-style). */}
                              <div className="pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-black/70 via-black/25 to-transparent" />
                              <div className="absolute inset-x-0 bottom-0 p-5 flex items-end justify-between gap-3 text-white">
                                <div className="min-w-0 max-w-[60%]">
                                  <p className="text-xs uppercase tracking-[0.16em] text-white/70">
                                    {item.tryon_mode === "3d" ? "3D Avatar" : "2D Try-On"}
                                  </p>
                                  <p className="mt-1 text-sm font-medium line-clamp-2">
                                    {isComplete
                                      ? "Fit complete — drag the slider to reveal the change."
                                      : isProcessing
                                      ? "Your look is still stitching. It'll appear here the moment it's ready."
                                      : "Look saved."}
                                  </p>
                                </div>
                                <Link href={`/try?mode=${preferredMode}`} className="shrink-0">
                                  <Button
                                    size="sm"
                                    className="bg-white text-foreground hover:bg-white/90 shadow-lg"
                                  >
                                    Remix <ArrowRight className="size-3.5" />
                                  </Button>
                                </Link>
                              </div>

                              {/* Reel index indicator (bottom-right dots-style) */}
                              <div className="absolute right-3 top-1/2 -translate-y-1/2 hidden sm:flex flex-col gap-1.5">
                                {visibleFeedItems.slice(0, Math.min(visibleFeedItems.length, 6)).map((dot, dotIdx) => (
                                  <span
                                    key={dot.id}
                                    className={`block rounded-full transition-all ${
                                      dotIdx === index
                                        ? "h-6 w-1 bg-white/95"
                                        : "h-1.5 w-1 bg-white/40"
                                    }`}
                                  />
                                ))}
                              </div>
                            </motion.article>
                          )
                        })}

                        {visibleFeedItems.length < feedItems.length ? (
                          <div ref={feedSentinelRef} className="h-24 flex items-center justify-center text-xs text-white bg-black/40">
                            Loading more looks...
                          </div>
                        ) : (
                          <div className="h-20 flex items-center justify-center text-xs text-muted-foreground bg-gradient-to-b from-slate-50 to-white">
                            You&apos;ve seen every look. Try a new outfit to add more.
                          </div>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>

                <div className="space-y-4">
                  <Card className="bg-white/72 backdrop-blur-lg border-border/70">
                    <CardHeader>
                      <CardTitle className="text-lg">Personalization Lab</CardTitle>
                      <CardDescription>Quiz + behavior profile powering your recommendations.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-5">
                      <div className="rounded-xl border border-border/70 bg-gradient-to-r from-sky-50 to-emerald-50 p-3">
                        <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Behavior Persona</p>
                        <p className="mt-1 text-lg font-semibold">{behaviorPersona}</p>
                        <p className="text-xs text-muted-foreground mt-1">Completion rate: {completionRate}%</p>
                      </div>

                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Vibe</p>
                        <div className="mt-2 grid grid-cols-2 gap-2">
                          {["Street Core", "Minimal Luxe", "Y2K Flash", "Athflow"].map((option) => (
                            <button
                              key={option}
                              onClick={() => setStyleVibe(option)}
                              className={[
                                "rounded-lg border px-3 py-2 text-sm transition text-left",
                                styleVibe === option
                                  ? "border-primary/50 bg-primary/10 text-foreground"
                                  : "border-border/70 bg-white/70 text-muted-foreground hover:text-foreground",
                              ].join(" ")}
                            >
                              {option}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Moment</p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {["Weekend Drop", "Workday", "Date Night", "Travel"].map((option) => (
                            <button
                              key={option}
                              onClick={() => setShoppingMoment(option)}
                              className={[
                                "rounded-full border px-3 py-1.5 text-xs transition",
                                shoppingMoment === option
                                  ? "border-sky-400/80 bg-sky-100 text-sky-900"
                                  : "border-border/70 bg-white/70 text-muted-foreground hover:text-foreground",
                              ].join(" ")}
                            >
                              {option}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Palette</p>
                        <div className="mt-2 grid grid-cols-3 gap-2">
                          {[
                            { name: "Neutrals", tone: "from-zinc-200 to-zinc-50" },
                            { name: "Bold", tone: "from-pink-400 to-orange-300" },
                            { name: "Cool", tone: "from-sky-500 to-blue-300" },
                          ].map((option) => (
                            <button
                              key={option.name}
                              onClick={() => setColorPalette(option.name)}
                              className={[
                                "rounded-lg border px-2 py-2 text-xs",
                                colorPalette === option.name ? "border-primary/55" : "border-border/70",
                              ].join(" ")}
                            >
                              <span
                                className={`block h-6 rounded-md bg-gradient-to-r ${option.tone} mb-1`}
                              />
                              {option.name}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="rounded-lg border border-border/70 bg-white/75 p-3">
                        <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">AI direction</p>
                        <p className="mt-1 text-sm font-medium">{styleVibe} · {shoppingMoment} · {colorPalette}</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          Top closet category: {categoryBreakdown[0]?.[0] || "Build your closet"}
                        </p>
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="bg-white/72 backdrop-blur-lg border-border/70">
                    <CardHeader>
                      <CardTitle className="text-lg">Try-Before-Buy</CardTitle>
                      <CardDescription>Interactive comparison before you commit.</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="rounded-2xl overflow-hidden border border-border/70 bg-muted/20">
                        <div className="relative aspect-[4/5]">
                          {compareLeftImage ? (
                            <img
                              src={compareLeftImage}
                              alt="Original garment"
                              className="absolute inset-0 h-full w-full object-cover"
                            />
                          ) : (
                            <div className="absolute inset-0 flex items-center justify-center bg-muted/35">
                              <Shirt className="size-8 text-muted-foreground" />
                            </div>
                          )}

                          {compareRightImage ? (
                            <div className="absolute inset-y-0 left-0 overflow-hidden" style={{ width: `${compareReveal}%` }}>
                              <img
                                src={compareRightImage}
                                alt="Try-on output"
                                className="h-full w-full object-cover"
                              />
                            </div>
                          ) : null}

                          <div
                            className="absolute inset-y-0 w-0.5 bg-white/85 shadow-[0_0_0_1px_oklch(0.25_0.03_250/_0.2)]"
                            style={{ left: `${compareReveal}%` }}
                          />

                          <div className="absolute top-2 left-2 rounded-full bg-black/35 px-2 py-1 text-[10px] text-white">Original</div>
                          <div className="absolute top-2 right-2 rounded-full bg-black/35 px-2 py-1 text-[10px] text-white">AI Fit</div>
                        </div>
                      </div>

                      <input
                        type="range"
                        min={5}
                        max={95}
                        value={compareReveal}
                        onChange={(event) => setCompareReveal(Number(event.target.value))}
                        className="mt-3 w-full"
                      />
                    </CardContent>
                  </Card>

                  <Card className="bg-white/72 backdrop-blur-lg border-border/70">
                    <CardHeader>
                      <CardTitle className="text-lg">Closet Highlights</CardTitle>
                      <CardDescription>Visual picks from your current wardrobe.</CardDescription>
                    </CardHeader>
                    <CardContent>
                      {recommendedGarments.length === 0 ? (
                        <div className="rounded-lg border border-dashed border-border/70 p-4 text-center text-sm text-muted-foreground">
                          Add a few garments to unlock visual recommendations.
                        </div>
                      ) : (
                        <div className="grid grid-cols-3 gap-2">
                          {recommendedGarments.map((garment) => (
                            <div key={garment.id} className="aspect-square rounded-lg overflow-hidden border border-border/70 bg-muted/20">
                              <img
                                src={garment.image_url}
                                alt={garment.name}
                                className="h-full w-full object-cover"
                              />
                            </div>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>
              </section>
              </div>
            )}

            {activeNav === "closet" && (
              <section className="grid gap-4 xl:grid-cols-[1fr_1.3fr]">
                <Card className="bg-white/72 backdrop-blur-lg border-border/70">
                  <CardHeader>
                    <CardTitle className="text-lg">Add New Garment</CardTitle>
                    <CardDescription>Keep your digital closet fresh with every new drop.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <Input
                      value={newGarmentName}
                      onChange={(event) => setNewGarmentName(event.target.value)}
                      placeholder="Name (e.g. Denim Jacket)"
                    />
                    <Input
                      value={newGarmentCategory}
                      onChange={(event) => setNewGarmentCategory(event.target.value)}
                      placeholder="Category (e.g. Outerwear)"
                    />
                    <Input
                      value={newGarmentDescription}
                      onChange={(event) => setNewGarmentDescription(event.target.value)}
                      placeholder="Description (optional)"
                    />
                    <div
                      {...garmentDropzone.getRootProps()}
                      className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-4 text-center text-xs transition-colors ${
                        garmentDropzone.isDragActive
                          ? "border-primary/70 bg-primary/5 text-primary"
                          : "border-border/70 bg-muted/30 text-muted-foreground hover:border-primary/50"
                      }`}
                    >
                      <input {...garmentDropzone.getInputProps()} />
                      <Upload className="size-5" />
                      {newGarmentFile ? (
                        <span className="font-medium text-foreground">{newGarmentFile.name}</span>
                      ) : (
                        <span>
                          Drop a garment image here, or <span className="font-semibold text-primary">click to browse</span>
                        </span>
                      )}
                    </div>
                    <Button
                      className="w-full gap-2 bg-gradient-to-r from-primary to-sky-500 text-white"
                      onClick={() => void handleUploadGarment()}
                      disabled={isUploading}
                    >
                      {isUploading ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <Upload className="size-4" />
                      )}
                      Add To Closet
                    </Button>
                    <p className="text-xs text-muted-foreground">
                      Items added here are saved directly to closet. Try-on uploads stay in history until you save them.
                    </p>
                  </CardContent>
                </Card>

                <Card className="bg-white/72 backdrop-blur-lg border-border/70">
                  <CardHeader>
                    <CardTitle className="text-lg">Closet Library</CardTitle>
                    <CardDescription>{closetGarments.length} garments saved in your closet.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {closetGarments.length === 0 ? (
                      <div className="rounded-lg border border-dashed border-border/70 p-6 text-center text-muted-foreground">
                        No saved garments yet. Save looks from history or upload directly here.
                      </div>
                    ) : (
                      <div className="grid gap-3 sm:grid-cols-2">
                        {closetGarments.map((garment) => (
                          <div key={garment.id} className="rounded-xl border border-border/70 p-3 bg-white/85 hover:shadow-md transition">
                            <div className="flex gap-3">
                              <div className="size-24 shrink-0 overflow-hidden rounded-lg bg-muted/20">
                                <img
                                  src={garment.image_url}
                                  alt={garment.name}
                                  className="h-full w-full object-cover"
                                />
                              </div>
                              <div className="min-w-0">
                                <p className="text-sm font-medium truncate">{garment.name}</p>
                                <div className="mt-1 flex items-center gap-2 flex-wrap">
                                  <p className="text-xs text-muted-foreground">
                                    {garment.category || "Uncategorized"}
                                  </p>
                                  <Badge className={getGarmentStatusBadgeClass(garment.preprocess_status)}>
                                    {garmentStatusLabelMap[garment.preprocess_status] || garment.preprocess_status}
                                  </Badge>
                                </div>
                                {garment.description ? (
                                  <p className="mt-2 text-xs text-muted-foreground line-clamp-2">
                                    {garment.description}
                                  </p>
                                ) : null}
                                {garment.preprocess_error ? (
                                  <p className="mt-2 text-xs text-red-600 line-clamp-2">
                                    {garment.preprocess_error}
                                  </p>
                                ) : null}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </section>
            )}

            {activeNav === "history" && (
              <Card className="bg-white/72 backdrop-blur-lg border-border/70">
                <CardHeader>
                  <CardTitle className="text-lg">Try-On History</CardTitle>
                  <CardDescription>
                    All your previous virtual try-ons with status and results.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {tryons.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-border/70 p-6 text-center text-muted-foreground">
                      No try-on history available yet.
                    </div>
                  ) : (
                    <div className="grid gap-3 lg:grid-cols-2">
                      {tryons.map((item) => (
                        <div
                          key={item.id}
                          className="rounded-xl border border-border/70 p-3 bg-white/80"
                        >
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                            <div className="flex items-center gap-3 min-w-0">
                              {item.result_image_url || item.garment_image_url ? (
                                <div className="size-20 overflow-hidden rounded-lg bg-muted/20 shrink-0">
                                  <img
                                    src={item.result_image_url || item.garment_image_url || ""}
                                    alt={`Try-On ${item.id}`}
                                    className="h-full w-full object-cover"
                                  />
                                </div>
                              ) : (
                                <div className="size-16 rounded-md bg-muted/30 shrink-0 flex items-center justify-center">
                                  <Shirt className="size-5 text-muted-foreground" />
                                </div>
                              )}

                              <div className="min-w-0">
                                <p className="text-sm font-medium truncate">Try-On #{item.id}</p>
                                <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                                  <CalendarClock className="size-3" />
                                  <span>{formatTimeAgo(item.created_at)}</span>
                                </div>
                              </div>
                            </div>

                            <div className="flex items-center gap-2 flex-wrap">
                              {typeof item.rating_score === "number" ? (
                                <Badge variant="outline">Score: {item.rating_score.toFixed(1)}</Badge>
                              ) : null}
                              {item.garment_id && !closetGarmentIds.has(item.garment_id) ? (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-7 px-2"
                                  onClick={() => void handleSaveTryOnGarment(item)}
                                  disabled={savingGarmentIds.includes(item.garment_id)}
                                >
                                  {savingGarmentIds.includes(item.garment_id) ? (
                                    <Loader2 className="size-3 animate-spin" />
                                  ) : (
                                    <Plus className="size-3" />
                                  )}
                                  Add to closet
                                </Button>
                              ) : null}
                              <Badge className={getStatusBadgeClass(item.status)}>
                                {statusLabelMap[item.status] || item.status}
                              </Badge>
                            </div>
                          </div>

                          {item.error_message ? (
                            <p className="mt-2 text-xs text-red-600">Error: {item.error_message}</p>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {activeNav === "settings" && (
              <section className="grid gap-4 md:grid-cols-2">
                <Card className="bg-white/72 backdrop-blur-lg border-border/70">
                  <CardHeader>
                    <CardTitle className="text-lg">Account</CardTitle>
                    <CardDescription>Your logged-in identity and profile shortcuts.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex items-center gap-3 rounded-lg border border-border/70 p-3">
                      <UserCircle2 className="size-8 text-primary" />
                      <div>
                        <p className="text-sm font-medium">{user?.full_name || "GradFiT User"}</p>
                        <p className="text-xs text-muted-foreground">{user?.email}</p>
                      </div>
                    </div>
                    <Button variant="outline" className="w-full justify-start gap-2" onClick={logout}>
                      <LogOut className="size-4" />
                      Sign out
                    </Button>
                  </CardContent>
                </Card>

                <Card className="bg-white/72 backdrop-blur-lg border-border/70">
                  <CardHeader>
                    <CardTitle className="text-lg">Profile photo</CardTitle>
                    <CardDescription>
                      Upload once -- every try-on, the dashboard, and the
                      Chrome extension reuse this photo automatically.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex items-center gap-3 rounded-lg border border-border/70 p-3">
                      <div className="size-14 overflow-hidden rounded-xl border border-border/70 bg-gradient-to-br from-primary/10 via-sky-500/10 to-emerald-400/10">
                        {user?.default_person_smart_crop_url || user?.default_person_image_url ? (
                          <img
                            src={
                              user.default_person_smart_crop_url ||
                              user.default_person_image_url ||
                              ""
                            }
                            alt="Saved photo"
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                            <UserCircle2 className="size-7" />
                          </div>
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium">
                          {user?.default_person_image_url ? "Saved photo" : "No photo yet"}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {user?.default_person_uploaded_at
                            ? `Updated ${new Date(user.default_person_uploaded_at).toLocaleDateString()}`
                            : "Add your photo to skip uploads on every try-on."}
                        </p>
                      </div>
                    </div>
                    <Button
                      variant={user?.default_person_image_url ? "outline" : "default"}
                      className={
                        user?.default_person_image_url
                          ? "w-full"
                          : "w-full bg-gradient-to-r from-primary to-sky-500 text-white"
                      }
                      onClick={() => {
                        setPhotoWizardForceOnboarding(false)
                        setPhotoWizardOpen(true)
                      }}
                    >
                      {user?.default_person_image_url ? "Update photo" : "Add photo"}
                    </Button>
                  </CardContent>
                </Card>

                <Card className="bg-white/72 backdrop-blur-lg border-border/70">
                  <CardHeader>
                    <CardTitle className="text-lg">Try-On Mode</CardTitle>
                    <CardDescription>Choose whether to remain in 2D or shift to 3D.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Badge variant="outline">Current Tier: {TIER_LABELS[currentTier] || currentTier}</Badge>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      {(["2d", "3d"] as TryOnMode[]).map((mode) => {
                        const supported = allowedModes.includes(mode)
                        const active = preferredMode === mode
                        return (
                          <Button
                            key={mode}
                            variant={active ? "default" : "outline"}
                            disabled={!supported || isSavingPreferences}
                            onClick={() => void handleSavePreferences({ preferred_tryon_mode: mode })}
                            className="uppercase"
                          >
                            {mode}
                          </Button>
                        )
                      })}
                    </div>

                    <p className="text-xs text-muted-foreground">
                      2D and 3D access depends on your selected subscription plan.
                    </p>
                  </CardContent>
                </Card>

                <Card className="bg-white/72 backdrop-blur-lg border-border/70 md:col-span-2">
                  <CardHeader>
                    <CardTitle className="text-lg">Subscription Tier</CardTitle>
                    <CardDescription>Pick a plan profile to match quota and pipeline mode access.</CardDescription>
                  </CardHeader>
                  <CardContent className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {(Object.keys(TIER_LABELS) as SubscriptionTier[]).map((tier) => (
                      <Button
                        key={tier}
                        variant={tier === currentTier ? "default" : "outline"}
                        disabled={isSavingPreferences}
                        onClick={() => void handleSavePreferences({ subscription_tier: tier })}
                        className="justify-start"
                      >
                        {TIER_LABELS[tier]}
                      </Button>
                    ))}
                  </CardContent>
                </Card>
              </section>
            )}
          </main>
        </div>
      </div>
      {activeTryOnId && activeTryOnStatus && activeTryOnStatus.status !== "completed" && activeTryOnStatus.status !== "failed" && activeTryOnStatus.status !== "dead_letter" ? (
        <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center px-4 pb-4 sm:px-6">
          <div className="pointer-events-auto w-full max-w-3xl rounded-2xl border border-border/70 bg-white/95 shadow-2xl backdrop-blur supports-[backdrop-filter]:bg-white/80">
            <div className="flex items-center justify-between gap-3 px-4 py-2.5">
              <div className="flex items-center gap-2 text-sm font-medium">
                <span className="relative flex size-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-60" />
                  <span className="relative inline-flex size-2 rounded-full bg-primary" />
                </span>
                Try-on #{activeTryOnId} in progress
              </div>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => setStickyDrawerCollapsed((v) => !v)}
                >
                  {stickyDrawerCollapsed ? "Expand" : "Collapse"}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => setActiveTryOnId(null)}
                >
                  Hide
                </Button>
              </div>
            </div>
            {!stickyDrawerCollapsed ? (
              <div className="border-t border-border/60 px-4 py-3">
                <PipelineMeter status={activeTryOnStatus} mode={preferredMode} />
                {activeTryOnStatus.error_message ? (
                  <p className="mt-2 text-xs text-destructive">{activeTryOnStatus.error_message}</p>
                ) : null}
              </div>
            ) : (
              <div className="border-t border-border/60 px-4 py-2">
                <PipelineMeter status={activeTryOnStatus} mode={preferredMode} compact />
              </div>
            )}
          </div>
        </div>
      ) : null}
      <CommandPalette
        open={commandOpen}
        onOpenChange={setCommandOpen}
        onOpenPhotoWizard={() => {
          setPhotoWizardForceOnboarding(false)
          setPhotoWizardOpen(true)
        }}
        onJumpToTab={(tab) => setActiveNav(tab)}
      />
      <PhotoWizard
        open={photoWizardOpen}
        onOpenChange={(next) => {
          setPhotoWizardOpen(next)
          if (!next) setPhotoWizardForceOnboarding(false)
        }}
        forceOnboarding={photoWizardForceOnboarding}
        initialPhoto={
          user?.default_person_image_url
            ? {
                url: user.default_person_image_url,
                smart_crop_url: user.default_person_smart_crop_url ?? null,
                face_url: user.default_person_face_url ?? null,
                uploaded_at: user.default_person_uploaded_at ?? null,
                gate: (user.default_person_input_gate_metrics as
                  | {
                      passed: boolean
                      reasons: string[]
                      smart_cropped: boolean
                      metrics: Record<string, unknown>
                    }
                  | null) ?? null,
                has_embedding: false,
              }
            : null
        }
      />
    </div>
  )
}
