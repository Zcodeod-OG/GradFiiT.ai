"use client"

import { useEffect } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { CheckCircle2, ArrowRight } from "lucide-react"

import { Button } from "@/components/ui/button"
import { useAuth } from "@/lib/auth"

// Post-checkout landing page. Stripe redirects here with
// `session_id` in the query string. The actual tier change is applied
// by the backend webhook; this page just gives the user a reassuring
// "you're in" screen and refreshes their session so the new tier
// shows up immediately.
export default function BillingSuccessPage() {
  const router = useRouter()
  const search = useSearchParams()
  const { loadUser } = useAuth()
  const sessionId = search.get("session_id")

  useEffect(() => {
    // Re-fetch the user a few times -- webhook latency can be 1-3s in
    // practice. Polling is cheap and prevents the "still on free tier"
    // flash immediately after checkout.
    let cancelled = false
    let tries = 0
    const tick = async () => {
      if (cancelled) return
      await loadUser()
      tries += 1
      if (tries < 5) {
        setTimeout(() => void tick(), 1500)
      }
    }
    void tick()
    return () => {
      cancelled = true
    }
  }, [loadUser])

  return (
    <main className="min-h-screen flex items-center justify-center bg-background px-6">
      <div className="max-w-md w-full surface-panel rounded-3xl p-10 text-center space-y-6 border border-border">
        <div className="mx-auto size-16 rounded-full bg-primary/15 flex items-center justify-center">
          <CheckCircle2 className="size-8 text-primary" />
        </div>
        <div className="space-y-2">
          <h1 className="font-display text-3xl font-bold tracking-tight">
            You're in! Welcome to Premium.
          </h1>
          <p className="text-muted-foreground">
            Your new quota is live. Head back to the app and try on as much as
            you like.
          </p>
        </div>
        {sessionId && (
          <p className="text-xs text-muted-foreground font-mono break-all">
            Receipt ID: {sessionId.slice(-12)}
          </p>
        )}
        <div className="flex gap-3 justify-center pt-2">
          <Link href="/try" className="block">
            <Button size="lg" className="pulse-glow">
              Start trying on
              <ArrowRight className="size-4 ml-2" />
            </Button>
          </Link>
          <Link href="/account/billing" className="block">
            <Button size="lg" variant="outline">
              Manage billing
            </Button>
          </Link>
        </div>
      </div>
    </main>
  )
}
