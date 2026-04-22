export type TryOnMode = "2d" | "3d"

export type SubscriptionTier =
  | "free_2d"
  | "free_3d"
  | "premium_2d"
  | "premium_3d"
  | "ultra"
  | "business"

export type PlanCard = {
  code: SubscriptionTier
  name: string
  priceLabel: string
  cadence: string
  description: string
  featured?: boolean
  comingSoon?: boolean
  // When false, the pricing CTA is disabled and replaced by a "Coming
  // soon" / "Contact sales" label. Source of truth is the backend
  // (`/api/billing/plans` -> `purchasable`); this mirror keeps the
  // marketing section renderable without a round-trip.
  purchasable?: boolean
  ctaNote?: string
  features: string[]
}

export const PLAN_CARDS: PlanCard[] = [
  {
    code: "free_2d",
    name: "Free 2D Tier",
    priceLabel: "$0",
    cadence: "/month",
    description: "Start with 2D try-ons",
    purchasable: true,
    features: [
      "4 try-ons per day",
      "2D virtual try-on",
      "Standard queue",
      "Basic support",
    ],
  },
  {
    code: "premium_2d",
    name: "Premium 2D",
    priceLabel: "$3.99",
    cadence: "/month",
    description: "High-volume 2D workflows",
    featured: true,
    purchasable: true,
    features: [
      "195 try-ons per month",
      "Priority queue",
      "Higher-quality output",
      "Faster turnaround",
    ],
  },
  {
    code: "premium_3d",
    name: "Premium 3D",
    priceLabel: "$5.99",
    cadence: "/month",
    description: "Production-grade 3D fitting",
    comingSoon: true,
    purchasable: false,
    ctaNote: "Launching soon",
    features: [
      "180 try-ons per month",
      "3D garment fitting",
      "360 mannequin rotation",
      "Priority rendering",
    ],
  },
  {
    code: "ultra",
    name: "Ultra",
    priceLabel: "$15.99",
    cadence: "/month",
    description: "Both 2D and 3D in one bucket",
    comingSoon: true,
    purchasable: false,
    ctaNote: "Launching with 3D",
    features: [
      "365 try-ons per month",
      "Includes both 2D and 3D",
      "Shared quota across all modes",
      "Fastest processing lane",
    ],
  },
  {
    code: "business",
    name: "Business",
    priceLabel: "Custom",
    cadence: "",
    description: "For brands and large teams",
    purchasable: false,
    ctaNote: "Contact sales",
    features: [
      "Contact sales team",
      "SLA and dedicated onboarding",
      "API + workflow integrations",
      "Team-level controls",
    ],
  },
]

export const TIER_TO_ALLOWED_MODES: Record<SubscriptionTier, TryOnMode[]> = {
  free_2d: ["2d"],
  free_3d: ["3d"],
  premium_2d: ["2d"],
  premium_3d: ["3d"],
  ultra: ["2d", "3d"],
  business: ["2d", "3d"],
}

export const TIER_LABELS: Record<SubscriptionTier, string> = {
  free_2d: "Free 2D Tier",
  free_3d: "Free 3D Tier",
  premium_2d: "Premium 2D",
  premium_3d: "Premium 3D",
  ultra: "Ultra",
  business: "Business",
}
