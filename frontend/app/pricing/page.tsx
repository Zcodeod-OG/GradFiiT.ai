"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { toast } from "sonner"
import { ArrowRight, Check, Lock, Sparkles } from "lucide-react"

import { Button } from "@/components/ui/button"
import { billingApi, type BillingPlan } from "@/lib/api"
import { useAuth } from "@/lib/auth"
import { PLAN_CARDS, type SubscriptionTier } from "@/lib/plans"

type MergedPlan = BillingPlan & {
  marketingName: string
  marketingDescription: string
  featuresList: string[]
  priceLabel: string
  cadence: string
  featured: boolean
}

// Merge the marketing copy from PLAN_CARDS with the authoritative
// purchasable / coming-soon flags from the backend. The backend wins
// on anything that affects checkout (price id config, tier gating) so
// the UI can never get out of sync with reality.
function mergeCatalog(backend: BillingPlan[]): MergedPlan[] {
  const byCode = new Map(backend.map((p) => [p.code, p]))
  return PLAN_CARDS.map((card) => {
    const b = byCode.get(card.code)
    const base: MergedPlan = {
      code: card.code,
      display_name: card.name,
      allowed_modes: b?.allowed_modes ?? [],
      period: b?.period ?? "month",
      limit: b?.limit ?? null,
      monthly_price_usd: b?.monthly_price_usd ?? null,
      purchasable: b?.purchasable ?? card.purchasable ?? false,
      coming_soon: b?.coming_soon ?? card.comingSoon ?? false,
      cta_note: b?.cta_note ?? card.ctaNote ?? null,
      stripe_price_configured: b?.stripe_price_configured ?? false,
      marketingName: card.name,
      marketingDescription: card.description,
      featuresList: card.features,
      priceLabel: card.priceLabel,
      cadence: card.cadence,
      featured: Boolean(card.featured),
    }
    return base
  })
}

export default function PricingPage() {
  const router = useRouter()
  const search = useSearchParams()
  const { user, isAuthenticated, loadUser } = useAuth()

  const [plans, setPlans] = useState<MergedPlan[]>(() =>
    mergeCatalog([])
  )
  const [currentTier, setCurrentTier] = useState<SubscriptionTier>(
    user?.subscription_tier ?? "free_2d"
  )
  const [status, setStatus] = useState<string>("inactive")
  const [renewsAt, setRenewsAt] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [checkoutPlan, setCheckoutPlan] = useState<SubscriptionTier | null>(
    null
  )

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
        if (!mounted) return
        setPlans(mergeCatalog(res.data.plans))
        setCurrentTier(res.data.current_tier)
        setStatus(res.data.subscription_status)
        setRenewsAt(res.data.subscription_renews_at)
      } catch (err) {
        // Listing plans doesn't require auth to render, but without a
        // session we can't learn the current tier. Fall back to the
        // static marketing catalog so the page still renders.
        setPlans(mergeCatalog([]))
      } finally {
        if (mounted) setIsLoading(false)
      }
    }
    if (isAuthenticated) {
      void run()
    } else {
      setIsLoading(false)
    }
    return () => {
      mounted = false
    }
  }, [isAuthenticated])

  useEffect(() => {
    if (search.get("canceled") === "1") {
      toast.info("Checkout canceled. You can try again anytime.")
    }
  }, [search])

  const handleCheckout = async (plan: MergedPlan) => {
    if (!isAuthenticated) {
      toast.message("Sign in to upgrade", {
        description: "Create a free account first, then pick a plan.",
        action: {
          label: "Sign in",
          onClick: () => router.push("/login?next=/pricing"),
        },
      })
      return
    }
    if (!plan.purchasable) {
      toast.info(plan.cta_note || `${plan.display_name} isn't available yet.`)
      return
    }
    if (!plan.stripe_price_configured && plan.monthly_price_usd) {
      toast.error(
        "Checkout isn't configured on the server yet. Please try again soon."
      )
      return
    }
    if ((plan.monthly_price_usd ?? 0) === 0) {
      // Free tier -- just take the user to /try.
      router.push("/try")
      return
    }

    try {
      setCheckoutPlan(plan.code)
      const res = await billingApi.createCheckoutSession(plan.code)
      if (res.data?.url) {
        window.location.href = res.data.url
      } else {
        toast.error("Stripe did not return a checkout URL.")
      }
    } catch (err: unknown) {
      const detail =
        (err as { response?: { data?: { detail?: string } } })?.response?.data
          ?.detail || "Could not start checkout."
      toast.error(detail)
    } finally {
      setCheckoutPlan(null)
    }
  }

  const handleManageBilling = async () => {
    try {
      const res = await billingApi.openPortal()
      if (res.data?.url) {
        window.location.href = res.data.url
      }
    } catch (err: unknown) {
      const detail =
        (err as { response?: { data?: { detail?: string } } })?.response?.data
          ?.detail || "Could not open the billing portal."
      toast.error(detail)
    }
  }

  return (
    <main className="min-h-screen bg-background pb-24 pt-16">
      <div className="container-main">
        <header className="max-w-3xl mx-auto text-center space-y-4 mb-12">
          <h1 className="font-display text-4xl md:text-5xl font-bold tracking-tight">
            Plans that grow with your <span className="text-gradient">wardrobe</span>
          </h1>
          <p className="text-lg text-muted-foreground">
            Start free, upgrade when you want more try-ons or faster lanes.
            Cancel anytime in two clicks.
          </p>

          {isAuthenticated && (
            <div className="mt-6 inline-flex items-center gap-3 rounded-full bg-secondary/70 border border-border px-5 py-2 text-sm">
              <Sparkles className="size-4 text-primary" />
              <span className="text-muted-foreground">
                You're on
                <span className="ml-1 font-semibold text-foreground">
                  {plans.find((p) => p.code === currentTier)?.display_name ||
                    currentTier}
                </span>
                {renewsAt && status === "active" && (
                  <span className="ml-2 text-xs text-muted-foreground">
                    — renews {new Date(renewsAt).toLocaleDateString()}
                  </span>
                )}
              </span>
              {status !== "inactive" && status !== "canceled" && (
                <button
                  onClick={handleManageBilling}
                  className="text-xs font-semibold text-primary hover:underline"
                >
                  Manage billing →
                </button>
              )}
            </div>
          )}
        </header>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-6 max-w-7xl mx-auto items-start">
          {plans.map((plan) => (
            <PlanCardView
              key={plan.code}
              plan={plan}
              isCurrent={plan.code === currentTier}
              isLoading={isLoading || checkoutPlan === plan.code}
              onCheckout={() => handleCheckout(plan)}
            />
          ))}
        </div>

        <footer className="max-w-3xl mx-auto mt-16 text-center space-y-3 text-sm text-muted-foreground">
          <p>
            Every paid plan is a recurring subscription. You can cancel
            anytime from <Link href="/account/billing" className="text-primary hover:underline">your billing portal</Link>.
          </p>
          <p>
            Questions about Business? Email{" "}
            <a
              href="mailto:sales@gradfit.tech"
              className="text-primary hover:underline"
            >
              sales@gradfit.tech
            </a>
            .
          </p>
        </footer>
      </div>
    </main>
  )
}

function PlanCardView({
  plan,
  isCurrent,
  isLoading,
  onCheckout,
}: {
  plan: MergedPlan
  isCurrent: boolean
  isLoading: boolean
  onCheckout: () => void
}) {
  const disabled =
    plan.coming_soon ||
    (!plan.purchasable && plan.code !== "free_2d") ||
    isLoading

  let ctaLabel = "Choose plan"
  if (plan.code === "business") ctaLabel = "Contact sales"
  else if (plan.coming_soon) ctaLabel = "Coming soon"
  else if (isCurrent) ctaLabel = "Current plan"
  else if ((plan.monthly_price_usd ?? 0) === 0) ctaLabel = "Start free"
  else ctaLabel = `Upgrade to ${plan.display_name}`

  return (
    <div className="relative">
      {plan.featured && !plan.coming_soon && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 z-20">
          <span className="bg-gradient-to-r from-primary to-accent px-4 py-1 rounded-full text-xs font-semibold text-primary-foreground shadow-lg shadow-primary/25">
            Most popular
          </span>
        </div>
      )}
      {plan.coming_soon && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 z-20">
          <span className="bg-muted text-muted-foreground border border-border px-3 py-1 rounded-full text-[10px] font-semibold uppercase tracking-wider">
            Coming soon
          </span>
        </div>
      )}

      <div
        className={`surface-panel rounded-2xl p-6 h-full transition-all flex flex-col ${
          isCurrent
            ? "border-2 border-primary shadow-lg shadow-primary/20"
            : plan.featured && !plan.coming_soon
              ? "border-2 border-primary/40"
              : "border border-border"
        } ${plan.coming_soon ? "opacity-75" : ""}`}
      >
        <div>
          <h3 className="font-display text-xl font-bold text-foreground mb-1">
            {plan.display_name}
          </h3>
          <p className="text-muted-foreground text-xs leading-relaxed min-h-[2.5rem]">
            {plan.marketingDescription}
          </p>
        </div>

        <div className="flex items-baseline gap-1 mt-5 mb-5">
          <span className="text-3xl font-bold text-foreground">
            {plan.priceLabel}
          </span>
          <span className="text-sm text-muted-foreground">{plan.cadence}</span>
        </div>

        {plan.code === "business" ? (
          <a
            href="mailto:sales@gradfit.tech"
            className="block"
          >
            <Button
              variant="outline"
              className="w-full"
              size="lg"
            >
              Contact sales
              <ArrowRight className="size-4 ml-2" />
            </Button>
          </a>
        ) : (
          <Button
            onClick={onCheckout}
            disabled={disabled || isCurrent}
            size="lg"
            className={`w-full ${
              plan.featured && !plan.coming_soon && !isCurrent
                ? "pulse-glow"
                : ""
            }`}
            variant={
              isCurrent
                ? "secondary"
                : plan.featured && !plan.coming_soon
                  ? "default"
                  : "outline"
            }
          >
            {disabled && plan.coming_soon ? (
              <Lock className="size-4 mr-2" />
            ) : null}
            {ctaLabel}
            {plan.featured && !plan.coming_soon && !isCurrent && (
              <ArrowRight className="size-4 ml-2" />
            )}
          </Button>
        )}

        {plan.cta_note && plan.coming_soon && (
          <p className="text-[11px] text-muted-foreground mt-2 text-center leading-snug">
            {plan.cta_note}
          </p>
        )}

        <ul className="space-y-2.5 mt-6">
          {plan.featuresList.map((feature) => (
            <li key={feature} className="flex items-start gap-2">
              <span className="size-4 rounded-full bg-primary/15 flex items-center justify-center mt-0.5 shrink-0">
                <Check className="size-2.5 text-primary" />
              </span>
              <span className="text-xs text-muted-foreground leading-relaxed">
                {feature}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
