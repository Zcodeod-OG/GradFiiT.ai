"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { ArrowRight, CreditCard, ExternalLink, Loader2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  billingApi,
  type BillingPlan,
  type BillingPlansResponse,
} from "@/lib/api"
import { useAuth } from "@/lib/auth"

export default function BillingAccountPage() {
  const router = useRouter()
  const { user, isAuthenticated, loadUser } = useAuth()
  const [data, setData] = useState<BillingPlansResponse | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isOpeningPortal, setIsOpeningPortal] = useState(false)

  useEffect(() => {
    if (!isAuthenticated) {
      void loadUser()
    }
  }, [isAuthenticated, loadUser])

  useEffect(() => {
    let mounted = true
    const run = async () => {
      try {
        const res = await billingApi.listPlans()
        if (mounted) setData(res.data)
      } catch {
        // Ignore; the page still renders a "no billing yet" state.
      } finally {
        if (mounted) setIsLoading(false)
      }
    }
    if (isAuthenticated) void run()
    else setIsLoading(false)
    return () => {
      mounted = false
    }
  }, [isAuthenticated])

  const currentPlan: BillingPlan | undefined = data?.plans.find(
    (p) => p.code === data?.current_tier
  )

  const handleOpenPortal = async () => {
    try {
      setIsOpeningPortal(true)
      const res = await billingApi.openPortal()
      if (res.data?.url) {
        window.location.href = res.data.url
      }
    } catch (err: unknown) {
      const detail =
        (err as { response?: { data?: { detail?: string } } })?.response?.data
          ?.detail || "Could not open billing portal."
      toast.error(detail)
    } finally {
      setIsOpeningPortal(false)
    }
  }

  if (!isAuthenticated && !isLoading) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-background px-6">
        <div className="max-w-md w-full surface-panel rounded-3xl p-10 text-center space-y-6 border border-border">
          <h1 className="font-display text-2xl font-bold">Sign in to continue</h1>
          <p className="text-muted-foreground">
            You need to be logged in to see your billing details.
          </p>
          <Button
            onClick={() => router.push("/login?next=/account/billing")}
            size="lg"
          >
            Sign in
          </Button>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-background pb-24 pt-16">
      <div className="container-main max-w-3xl">
        <header className="mb-10 space-y-2">
          <p className="text-sm text-muted-foreground uppercase tracking-wider">
            Account
          </p>
          <h1 className="font-display text-3xl md:text-4xl font-bold tracking-tight">
            Billing & subscription
          </h1>
        </header>

        {isLoading ? (
          <div className="flex items-center gap-3 text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Loading your plan…
          </div>
        ) : (
          <div className="space-y-6">
            <section className="surface-panel rounded-2xl p-8 border border-border">
              <div className="flex items-start justify-between gap-6 flex-wrap">
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">
                    Current plan
                  </p>
                  <h2 className="font-display text-2xl font-bold">
                    {currentPlan?.display_name || "Free 2D"}
                  </h2>
                  <p className="text-sm text-muted-foreground mt-1">
                    {statusLabel(data?.subscription_status)}
                    {data?.subscription_renews_at && (
                      <span className="ml-1">
                        · {data.cancel_at_period_end ? "ends" : "renews"} on{" "}
                        {new Date(
                          data.subscription_renews_at
                        ).toLocaleDateString()}
                      </span>
                    )}
                  </p>
                </div>
                <div className="flex gap-2 flex-wrap">
                  {data?.current_tier !== "free_2d" && (
                    <Button
                      onClick={handleOpenPortal}
                      disabled={isOpeningPortal}
                      variant="outline"
                    >
                      {isOpeningPortal ? (
                        <Loader2 className="size-4 animate-spin mr-2" />
                      ) : (
                        <CreditCard className="size-4 mr-2" />
                      )}
                      Manage billing
                      <ExternalLink className="size-3 ml-1.5 opacity-60" />
                    </Button>
                  )}
                  <Link href="/pricing">
                    <Button>
                      {data?.current_tier === "free_2d"
                        ? "Upgrade"
                        : "Change plan"}
                      <ArrowRight className="size-4 ml-2" />
                    </Button>
                  </Link>
                </div>
              </div>

              {user?.email && (
                <div className="mt-6 pt-6 border-t border-border text-sm text-muted-foreground">
                  Billed to <span className="text-foreground">{user.email}</span>
                </div>
              )}
            </section>

            <section className="surface-panel rounded-2xl p-8 border border-border">
              <h3 className="font-display text-lg font-semibold mb-4">
                How billing works
              </h3>
              <ul className="space-y-3 text-sm text-muted-foreground leading-relaxed">
                <li>
                  Payments are processed by Stripe. We never see or store your
                  card details.
                </li>
                <li>
                  Cancel anytime from the billing portal — your quota stays
                  active until the end of the current period.
                </li>
                <li>
                  3D plans (Premium 3D and Ultra) are launching soon. Upgrade
                  to 2D now and you'll get priority when they ship.
                </li>
                <li>
                  For refunds or invoicing questions, email{" "}
                  <a
                    className="text-primary hover:underline"
                    href="mailto:support@gradfit.tech"
                  >
                    support@gradfit.tech
                  </a>
                  .
                </li>
              </ul>
            </section>
          </div>
        )}
      </div>
    </main>
  )
}

function statusLabel(status?: string | null): string {
  switch (status) {
    case "active":
      return "Active subscription"
    case "trialing":
      return "Free trial"
    case "past_due":
      return "Payment failed — update your card"
    case "canceled":
      return "Canceled"
    case "unpaid":
      return "Unpaid"
    case "incomplete":
      return "Checkout incomplete"
    default:
      return "No active subscription"
  }
}
