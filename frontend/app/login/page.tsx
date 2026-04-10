"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { motion } from "framer-motion"
import { toast } from "sonner"
import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { uploadApi, userApi } from "@/lib/api"
import { getApiErrorMessage } from "@/lib/api-error"
import { useAuth } from "@/lib/auth"
import { TIER_LABELS, TIER_TO_ALLOWED_MODES, type SubscriptionTier, type TryOnMode } from "@/lib/plans"

export default function LoginPage() {
  const router = useRouter()
  const { login, register, loadUser } = useAuth()
  const [isRegisterMode, setIsRegisterMode] = useState(false)
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [fullName, setFullName] = useState("")
  const [subscriptionTier, setSubscriptionTier] = useState<SubscriptionTier>("free_2d")
  const [preferredMode, setPreferredMode] = useState<TryOnMode>("2d")
  const [avatarFile, setAvatarFile] = useState<File | null>(null)
  const [avatarHeightCm, setAvatarHeightCm] = useState("")
  const [avatarBodyType, setAvatarBodyType] = useState("")
  const [avatarGender, setAvatarGender] = useState("")
  const [avatarNotes, setAvatarNotes] = useState("")
  const [loading, setLoading] = useState(false)

  const tierAllowedModes = TIER_TO_ALLOWED_MODES[subscriptionTier] || ["2d"]
  const tierHas3d = tierAllowedModes.includes("3d")

  const ensurePreferredModeForTier = (tier: SubscriptionTier) => {
    const allowed = TIER_TO_ALLOWED_MODES[tier] || ["2d"]
    if (!allowed.includes(preferredMode)) {
      setPreferredMode(allowed[0])
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      if (isRegisterMode) {
        if (preferredMode === "3d" && !avatarFile) {
          toast.error("Please upload a person image for 3D avatar setup")
          setLoading(false)
          return
        }

        await register({
          email,
          password,
          fullName: fullName || undefined,
          subscriptionTier,
          preferredMode,
        })

        if (preferredMode === "3d" && avatarFile) {
          const uploaded = await uploadApi.uploadImage(avatarFile)
          await userApi.buildAvatar({
            person_image_url: uploaded.data.url,
            quality: "best",
            height_cm: avatarHeightCm ? Number(avatarHeightCm) : undefined,
            body_type: avatarBodyType || undefined,
            gender: avatarGender || undefined,
            notes: avatarNotes || undefined,
          })
          await loadUser()
          toast.success("3D avatar is ready")
        }

        toast.success("Account created!")
      } else {
        await login(email, password)
        toast.success("Welcome back!")
      }
      router.push("/")
    } catch (err: unknown) {
      toast.error(getApiErrorMessage(err, "Authentication failed"))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-10">
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_15%_10%,oklch(0.76_0.09_250/.28),transparent_55%),radial-gradient(circle_at_90%_20%,oklch(0.76_0.08_190/.2),transparent_58%)]" />
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md"
      >
        <div className="text-center mb-8">
          <h1 className="font-display text-4xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent tracking-tight">
            ALTER.ai
          </h1>
          <p className="text-muted-foreground mt-2">
            {isRegisterMode ? "Create your account" : "Welcome back"}
          </p>
        </div>

        <Card className="bg-white/85 border-border/80 backdrop-blur-sm">
          <CardContent className="p-6">
            <form onSubmit={handleSubmit} className="space-y-4">
              {isRegisterMode && (
                <>
                <div>
                  <Label htmlFor="fullName">Full Name</Label>
                  <input
                    id="fullName"
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className="w-full mt-1 px-3 py-2 border border-border/80 rounded-lg bg-white/80 text-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-ring/40"
                    placeholder="John Doe"
                  />
                </div>
                <div>
                  <Label htmlFor="tier">Plan Tier</Label>
                  <select
                    id="tier"
                    value={subscriptionTier}
                    onChange={(e) => {
                      const tier = e.target.value as SubscriptionTier
                      setSubscriptionTier(tier)
                      ensurePreferredModeForTier(tier)
                    }}
                    className="w-full mt-1 px-3 py-2 border border-border/80 rounded-lg bg-white/80 text-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-ring/40"
                  >
                    {(Object.keys(TIER_LABELS) as SubscriptionTier[]).map((tier) => (
                      <option key={tier} value={tier}>
                        {TIER_LABELS[tier]}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <Label htmlFor="preferredMode">Preferred Mode</Label>
                  <select
                    id="preferredMode"
                    value={preferredMode}
                    onChange={(e) => setPreferredMode(e.target.value as TryOnMode)}
                    className="w-full mt-1 px-3 py-2 border border-border/80 rounded-lg bg-white/80 text-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-ring/40"
                  >
                    {tierAllowedModes.map((mode) => (
                      <option key={mode} value={mode}>
                        {mode.toUpperCase()}
                      </option>
                    ))}
                  </select>
                </div>

                {tierHas3d && preferredMode === "3d" ? (
                  <div className="space-y-3 rounded-lg border border-border/80 bg-white/70 p-3">
                    <p className="text-sm font-medium">3D Avatar Setup</p>
                    <div>
                      <Label htmlFor="avatarFile">Person Image</Label>
                      <input
                        id="avatarFile"
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        onChange={(e) => setAvatarFile(e.target.files?.[0] ?? null)}
                        className="w-full mt-1 px-3 py-2 border border-border/80 rounded-lg bg-white/80 text-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-ring/40"
                      />
                    </div>
                    <div>
                      <Label htmlFor="avatarHeight">Height (cm)</Label>
                      <input
                        id="avatarHeight"
                        type="number"
                        min="100"
                        max="250"
                        value={avatarHeightCm}
                        onChange={(e) => setAvatarHeightCm(e.target.value)}
                        className="w-full mt-1 px-3 py-2 border border-border/80 rounded-lg bg-white/80 text-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-ring/40"
                        placeholder="170"
                      />
                    </div>
                    <div>
                      <Label htmlFor="avatarBodyType">Body Type</Label>
                      <input
                        id="avatarBodyType"
                        type="text"
                        value={avatarBodyType}
                        onChange={(e) => setAvatarBodyType(e.target.value)}
                        className="w-full mt-1 px-3 py-2 border border-border/80 rounded-lg bg-white/80 text-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-ring/40"
                        placeholder="athletic / slim / regular"
                      />
                    </div>
                    <div>
                      <Label htmlFor="avatarGender">Gender</Label>
                      <input
                        id="avatarGender"
                        type="text"
                        value={avatarGender}
                        onChange={(e) => setAvatarGender(e.target.value)}
                        className="w-full mt-1 px-3 py-2 border border-border/80 rounded-lg bg-white/80 text-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-ring/40"
                        placeholder="woman / man / non-binary"
                      />
                    </div>
                    <div>
                      <Label htmlFor="avatarNotes">Fit Notes</Label>
                      <input
                        id="avatarNotes"
                        type="text"
                        value={avatarNotes}
                        onChange={(e) => setAvatarNotes(e.target.value)}
                        className="w-full mt-1 px-3 py-2 border border-border/80 rounded-lg bg-white/80 text-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-ring/40"
                        placeholder="broad shoulders, longer torso, etc."
                      />
                    </div>
                  </div>
                ) : null}
                </>
              )}
              <div>
                <Label htmlFor="email">Email</Label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full mt-1 px-3 py-2 border border-border/80 rounded-lg bg-white/80 text-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-ring/40"
                  placeholder="you@example.com"
                  required
                />
              </div>
              <div>
                <Label htmlFor="password">Password</Label>
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full mt-1 px-3 py-2 border border-border/80 rounded-lg bg-white/80 text-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-ring/40"
                  placeholder="Enter password"
                  required
                />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading && <Loader2 className="size-4 mr-2 animate-spin" />}
                {isRegisterMode ? "Create Account" : "Log In"}
              </Button>
              <p className="text-center text-sm text-muted-foreground">
                {isRegisterMode
                  ? "Already have an account?"
                  : "Don't have an account?"}{" "}
                <button
                  type="button"
                  className="text-primary hover:underline"
                  onClick={() => setIsRegisterMode(!isRegisterMode)}
                >
                  {isRegisterMode ? "Log In" : "Sign Up"}
                </button>
              </p>
            </form>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  )
}
