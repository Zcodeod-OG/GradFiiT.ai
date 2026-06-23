"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { motion } from "framer-motion"
import { toast } from "sonner"
import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { API_BASE_URL } from "@/lib/api"
import { getApiErrorMessage } from "@/lib/api-error"
import { useAuth } from "@/lib/auth"

/**
 * Lowest-friction sign-in.
 *
 * Three OAuth buttons up top (Google / GitHub / Facebook — one tap, no
 * forms) + a two-field email path below it. Tier, preferred mode, and
 * 3D avatar setup are NOT collected here anymore: new users default to
 * the free 2D plan and can change anything later from /account or via
 * the PhotoWizard. The friction here is exactly two inputs.
 */
export default function LoginPage() {
  const router = useRouter()
  const { login, register } = useAuth()
  const [isRegisterMode, setIsRegisterMode] = useState(false)
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      if (isRegisterMode) {
        await register({
          email,
          password,
          subscriptionTier: "free_2d",
          preferredMode: "2d",
        })
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
        <div className="text-center mb-6">
          <h1 className="font-display text-4xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent tracking-tight">
            GradFiT
          </h1>
          <p className="text-muted-foreground mt-2 text-sm">
            {isRegisterMode ? "Create your account" : "Welcome back"}
          </p>
        </div>

        <Card className="bg-white/85 border-border/80 backdrop-blur-sm">
          <CardContent className="p-6 space-y-5">
            {/* One-tap social sign-in (provider creds required in .env,
                see docs/oauth-setup.md). Each button is full-width so it
                reads as a single primary action rather than a tiny chip. */}
            <div className="space-y-2">
              <Button
                type="button"
                variant="outline"
                className="w-full justify-center h-11"
                onClick={() => {
                  window.location.href = `${API_BASE_URL}/api/auth/oauth/google/authorize`
                }}
              >
                Continue with Google
              </Button>
              <Button
                type="button"
                variant="outline"
                className="w-full justify-center h-11"
                onClick={() => {
                  window.location.href = `${API_BASE_URL}/api/auth/oauth/github/authorize`
                }}
              >
                Continue with GitHub
              </Button>
              <Button
                type="button"
                variant="outline"
                className="w-full justify-center h-11"
                onClick={() => {
                  window.location.href = `${API_BASE_URL}/api/auth/oauth/facebook/authorize`
                }}
              >
                Continue with Facebook
              </Button>
            </div>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-border/60" />
              </div>
              <div className="relative flex justify-center text-xs">
                <span className="bg-white/85 px-2 text-muted-foreground">
                  or with email
                </span>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <Label htmlFor="email">Email</Label>
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  inputMode="email"
                  enterKeyHint="next"
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
                  autoComplete={isRegisterMode ? "new-password" : "current-password"}
                  enterKeyHint="go"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full mt-1 px-3 py-2 border border-border/80 rounded-lg bg-white/80 text-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-ring/40"
                  placeholder={isRegisterMode ? "Choose a password" : "Enter password"}
                  required
                  minLength={isRegisterMode ? 8 : undefined}
                />
              </div>
              <Button type="submit" className="w-full h-11" disabled={loading}>
                {loading && <Loader2 className="size-4 mr-2 animate-spin" />}
                {isRegisterMode ? "Create Account" : "Log In"}
              </Button>
              <p className="text-center text-sm text-muted-foreground">
                {isRegisterMode
                  ? "Already have an account?"
                  : "Don't have an account?"}{" "}
                <button
                  type="button"
                  className="text-primary hover:underline font-medium"
                  onClick={() => setIsRegisterMode(!isRegisterMode)}
                >
                  {isRegisterMode ? "Log In" : "Sign Up"}
                </button>
              </p>
            </form>
          </CardContent>
        </Card>

        <p className="text-center text-xs text-muted-foreground mt-4">
          No account? You can also{" "}
          <a href="/try" className="text-primary hover:underline">
            try GradFiT instantly
          </a>{" "}
          — no sign-up required.
        </p>
      </motion.div>
    </div>
  )
}
