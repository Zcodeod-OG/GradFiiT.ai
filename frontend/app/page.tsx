"use client"

import { useState, useEffect, useCallback } from "react"
import { motion, AnimatePresence } from "framer-motion"
import {
  ArrowRight,
  CalendarClock,
  Camera,
  CircleCheck,
  Clock3,
  FolderOpen,
  History,
  LayoutDashboard,
  Loader2,
  LogOut,
  Plus,
  RefreshCw,
  Search,
  Settings,
  Shirt,
  Sparkles,
  Upload,
  UserCircle2,
} from "lucide-react"
import { Navbar } from "@/components/Navbar"
import { HeroSection } from "@/components/ui/hero-section"
import { FeaturesSection } from "@/components/ui/features-section"
import { DemoSection } from "@/components/DemoSection"
import { HowItWorksSection } from "@/components/how-it-works-section"
import { PricingSection } from "@/components/pricing-section"
import { Footer } from "@/components/ui/footer"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { useAuth } from "@/lib/auth"
import { garmentsApi, tryonApi, uploadApi } from "@/lib/api"
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
  created_at: string
}

type TryOnItem = {
  id: number
  status: string
  result_image_url: string | null
  garment_image_url: string | null
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
  if (status === "completed") return "bg-emerald-500/20 text-emerald-300 border-emerald-500/40"
  if (status === "failed") return "bg-red-500/20 text-red-300 border-red-500/40"
  return "bg-sky-500/20 text-sky-300 border-sky-500/40"
}

const garmentStatusLabelMap: Record<string, string> = {
  pending: "Pending",
  queued: "Queued",
  processing: "Processing",
  ready: "Ready",
  failed: "Failed",
}

const getGarmentStatusBadgeClass = (status: string): string => {
  if (status === "ready") return "bg-emerald-500/20 text-emerald-300 border-emerald-500/40"
  if (status === "failed") return "bg-red-500/20 text-red-300 border-red-500/40"
  return "bg-amber-500/20 text-amber-300 border-amber-500/40"
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
    <div className="min-h-screen dark scroll-smooth">
      <Navbar />
      <main>
        <HeroSection />
        <FeaturesSection />
        <DemoSection />
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
  const [newGarmentName, setNewGarmentName] = useState("")
  const [newGarmentCategory, setNewGarmentCategory] = useState("")
  const [newGarmentDescription, setNewGarmentDescription] = useState("")
  const [newGarmentFile, setNewGarmentFile] = useState<File | null>(null)

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
    <div className="min-h-screen bg-background gradient-mesh">
      <div className="mx-auto max-w-7xl p-4 md:p-6">
        <div className="grid gap-4 md:grid-cols-[250px_1fr]">
          <aside className="rounded-2xl border border-border/70 bg-card/70 backdrop-blur-md p-3 md:p-4 md:sticky md:top-6 md:h-[calc(100vh-3rem)]">
            <div className="flex items-center gap-2 px-2 pb-4 border-b border-border/70">
              <Sparkles className="size-4 text-primary" />
              <p className="font-semibold">ALTER.ai Home</p>
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
                        ? "bg-primary text-primary-foreground"
                        : "hover:bg-secondary text-muted-foreground hover:text-foreground",
                    ].join(" ")}
                  >
                    <Icon className="size-4" />
                    {item.label}
                  </button>
                )
              })}
            </div>

            <div className="mt-6 rounded-xl border border-border/70 p-3 bg-secondary/35">
              <p className="text-sm font-medium">Quick actions</p>
              <div className="mt-3 space-y-2">
                <Link href="/try">
                  <Button size="sm" className="w-full justify-start gap-2">
                    <Camera className="size-4" />
                    Start Try-On
                  </Button>
                </Link>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full justify-start gap-2"
                  onClick={() => setActiveNav("closet")}
                >
                  <Plus className="size-4" />
                  Add to Closet
                </Button>
              </div>
            </div>
          </aside>

          <main className="space-y-4 md:space-y-6">
            <Card className="bg-card/70 backdrop-blur-md border-border/70">
              <CardContent className="px-5 py-4 md:px-6 md:py-5">
                <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Welcome back</p>
                    <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">
                      {user?.full_name || user?.email || "Your personal closet"}
                    </h1>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Manage your wardrobe, track try-ons, and launch new looks in one place.
                    </p>
                  </div>

                  <div className="flex gap-2 flex-wrap">
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-2"
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
                    <Link href="/try">
                      <Button size="sm" className="gap-2">
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
              <Card className="bg-card/70 border-border/70">
                <CardContent className="px-5 py-4">
                  <p className="text-xs text-muted-foreground">Items in Closet</p>
                  <p className="mt-2 text-2xl font-semibold">{garments.length}</p>
                </CardContent>
              </Card>
              <Card className="bg-card/70 border-border/70">
                <CardContent className="px-5 py-4">
                  <p className="text-xs text-muted-foreground">Total Try-Ons</p>
                  <p className="mt-2 text-2xl font-semibold">{tryons.length}</p>
                </CardContent>
              </Card>
              <Card className="bg-card/70 border-border/70">
                <CardContent className="px-5 py-4">
                  <p className="text-xs text-muted-foreground">Completed Results</p>
                  <p className="mt-2 text-2xl font-semibold">{completedCount}</p>
                </CardContent>
              </Card>
              <Card className="bg-card/70 border-border/70">
                <CardContent className="px-5 py-4">
                  <p className="text-xs text-muted-foreground">In Progress</p>
                  <p className="mt-2 text-2xl font-semibold">{inProgressCount}</p>
                </CardContent>
              </Card>
            </section>

            {activeNav === "overview" && (
              <section className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
                <Card className="bg-card/70 border-border/70">
                  <CardHeader>
                    <CardTitle className="text-lg">Your Closet Snapshot</CardTitle>
                    <CardDescription>Recent items you can try on instantly.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {garments.length === 0 ? (
                      <div className="rounded-lg border border-dashed border-border/70 p-6 text-center text-muted-foreground">
                        Your closet is empty. Add your first garment in the My Closet tab.
                      </div>
                    ) : (
                      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        {garments.slice(0, 6).map((garment) => (
                          <div key={garment.id} className="rounded-lg border border-border/70 p-2 bg-background/40">
                            <div className="aspect-square overflow-hidden rounded-md bg-muted/20">
                              <img
                                src={garment.image_url}
                                alt={garment.name}
                                className="h-full w-full object-cover"
                              />
                            </div>
                            <p className="mt-2 text-sm font-medium truncate">{garment.name}</p>
                            <div className="mt-1 flex items-center gap-2">
                              <p className="text-xs text-muted-foreground truncate">
                                {garment.category || "Uncategorized"}
                              </p>
                              <Badge className={getGarmentStatusBadgeClass(garment.preprocess_status)}>
                                {garmentStatusLabelMap[garment.preprocess_status] || garment.preprocess_status}
                              </Badge>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card className="bg-card/70 border-border/70">
                  <CardHeader>
                    <CardTitle className="text-lg">Recent Try-Ons</CardTitle>
                    <CardDescription>Latest run status and outcomes.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {tryons.length === 0 ? (
                      <div className="rounded-lg border border-dashed border-border/70 p-6 text-center text-muted-foreground">
                        No try-ons yet. Start your first one now.
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {tryons.slice(0, 5).map((item) => (
                          <div
                            key={item.id}
                            className="flex items-center justify-between rounded-lg border border-border/70 p-3"
                          >
                            <div>
                              <p className="text-sm font-medium">Try-On #{item.id}</p>
                              <p className="text-xs text-muted-foreground">{formatTimeAgo(item.created_at)}</p>
                            </div>
                            <Badge className={getStatusBadgeClass(item.status)}>
                              {statusLabelMap[item.status] || item.status}
                            </Badge>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </section>
            )}

            {activeNav === "closet" && (
              <section className="grid gap-4 xl:grid-cols-[1fr_1.3fr]">
                <Card className="bg-card/70 border-border/70">
                  <CardHeader>
                    <CardTitle className="text-lg">Add New Garment</CardTitle>
                    <CardDescription>Update your closet regularly with new pieces.</CardDescription>
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
                    <Input
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      onChange={(event) => setNewGarmentFile(event.target.files?.[0] ?? null)}
                    />
                    <Button
                      className="w-full gap-2"
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
                      You can always add more items and use them instantly in the try-on studio.
                    </p>
                  </CardContent>
                </Card>

                <Card className="bg-card/70 border-border/70">
                  <CardHeader>
                    <CardTitle className="text-lg">Closet Library</CardTitle>
                    <CardDescription>{garments.length} garments available for virtual try-on.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {garments.length === 0 ? (
                      <div className="rounded-lg border border-dashed border-border/70 p-6 text-center text-muted-foreground">
                        No garments yet.
                      </div>
                    ) : (
                      <div className="grid gap-3 sm:grid-cols-2">
                        {garments.map((garment) => (
                          <div key={garment.id} className="rounded-lg border border-border/70 p-3 bg-background/40">
                            <div className="flex gap-3">
                              <div className="size-20 shrink-0 overflow-hidden rounded-md bg-muted/20">
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
                                  <p className="mt-2 text-xs text-red-300 line-clamp-2">
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
              <Card className="bg-card/70 border-border/70">
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
                    <div className="space-y-3">
                      {tryons.map((item) => (
                        <div
                          key={item.id}
                          className="rounded-lg border border-border/70 p-3 bg-background/40"
                        >
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                            <div className="flex items-center gap-3 min-w-0">
                              {item.result_image_url || item.garment_image_url ? (
                                <div className="size-16 overflow-hidden rounded-md bg-muted/20 shrink-0">
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
                              <Badge className={getStatusBadgeClass(item.status)}>
                                {statusLabelMap[item.status] || item.status}
                              </Badge>
                            </div>
                          </div>

                          {item.error_message ? (
                            <p className="mt-2 text-xs text-red-300">Error: {item.error_message}</p>
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
                <Card className="bg-card/70 border-border/70">
                  <CardHeader>
                    <CardTitle className="text-lg">Account</CardTitle>
                    <CardDescription>Your logged-in identity and profile shortcuts.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex items-center gap-3 rounded-lg border border-border/70 p-3">
                      <UserCircle2 className="size-8 text-primary" />
                      <div>
                        <p className="text-sm font-medium">{user?.full_name || "ALTER.ai User"}</p>
                        <p className="text-xs text-muted-foreground">{user?.email}</p>
                      </div>
                    </div>
                    <Button variant="outline" className="w-full justify-start gap-2" onClick={logout}>
                      <LogOut className="size-4" />
                      Sign out
                    </Button>
                  </CardContent>
                </Card>

                <Card className="bg-card/70 border-border/70">
                  <CardHeader>
                    <CardTitle className="text-lg">General Home Options</CardTitle>
                    <CardDescription>Common shortcuts available from your homepage.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm text-muted-foreground">
                    <p className="flex items-center gap-2"><Search className="size-4" /> Search closet and history</p>
                    <p className="flex items-center gap-2"><CircleCheck className="size-4" /> Quick quality status checks</p>
                    <p className="flex items-center gap-2"><Clock3 className="size-4" /> Timeline of latest try-ons</p>
                    <p className="flex items-center gap-2"><FolderOpen className="size-4" /> Closet organization by category</p>
                  </CardContent>
                </Card>
              </section>
            )}
          </main>
        </div>
      </div>
    </div>
  )
}
