"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { motion } from "framer-motion"
import { toast } from "sonner"
import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { useAuth } from "@/lib/auth"

export default function LoginPage() {
  const router = useRouter()
  const { login, register } = useAuth()
  const [isRegisterMode, setIsRegisterMode] = useState(false)
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [fullName, setFullName] = useState("")
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      if (isRegisterMode) {
        await register(email, password, fullName || undefined)
        toast.success("Account created!")
      } else {
        await login(email, password)
        toast.success("Welcome back!")
      }
      router.push("/")
    } catch (err: unknown) {
      const message =
        typeof err === "object" &&
        err !== null &&
        "response" in err &&
        typeof (err as { response?: { data?: { detail?: string } } }).response?.data?.detail === "string"
          ? (err as { response?: { data?: { detail?: string } } }).response?.data?.detail
          : "Authentication failed"
      toast.error(message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md"
      >
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold bg-gradient-to-r from-primary to-blue-500 bg-clip-text text-transparent">
            ALTER.ai
          </h1>
          <p className="text-muted-foreground mt-2">
            {isRegisterMode ? "Create your account" : "Welcome back"}
          </p>
        </div>

        <Card>
          <CardContent className="p-6">
            <form onSubmit={handleSubmit} className="space-y-4">
              {isRegisterMode && (
                <div>
                  <Label htmlFor="fullName">Full Name</Label>
                  <input
                    id="fullName"
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className="w-full mt-1 px-3 py-2 border border-border rounded-md bg-background text-foreground"
                    placeholder="John Doe"
                  />
                </div>
              )}
              <div>
                <Label htmlFor="email">Email</Label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full mt-1 px-3 py-2 border border-border rounded-md bg-background text-foreground"
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
                  className="w-full mt-1 px-3 py-2 border border-border rounded-md bg-background text-foreground"
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
