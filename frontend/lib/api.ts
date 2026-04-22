import axios from "axios";
import type { SubscriptionTier, TryOnMode } from "@/lib/plans";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    "Content-Type": "application/json",
  },
});

// Add auth token to every request
api.interceptors.request.use((config) => {
  if (typeof window !== "undefined") {
    const token = localStorage.getItem("auth_token");
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (typeof window !== "undefined") {
      const status = error?.response?.status;
      const detail = String(error?.response?.data?.detail || "");
      if (status === 401 && detail.toLowerCase().includes("validate credentials")) {
        localStorage.removeItem("auth_token");
        localStorage.removeItem("auth-storage");
      }
    }
    return Promise.reject(error);
  }
);

// Auth API
export const authApi = {
  register: (payload: {
    email: string;
    password: string;
    full_name?: string;
    subscription_tier?: SubscriptionTier;
    preferred_tryon_mode?: TryOnMode;
  }) => api.post("/api/auth/register", payload),

  login: (email: string, password: string) => {
    const formData = new URLSearchParams();
    formData.append("username", email);
    formData.append("password", password);
    return api.post("/api/auth/login", formData, {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });
  },

  getMe: () => api.get("/api/auth/me"),
};

export type PersonPhotoGate = {
  passed: boolean;
  reasons: string[];
  smart_cropped: boolean;
  metrics: Record<string, unknown>;
};

export type PersonPhotoData = {
  url: string | null;
  smart_crop_url: string | null;
  face_url: string | null;
  uploaded_at: string | null;
  gate: PersonPhotoGate | null;
  has_embedding: boolean;
};

export const userApi = {
  getTier: () => api.get("/api/user/tier"),
  getAvatarStatus: () => api.get("/api/user/avatar/status"),
  updatePreferences: (data: {
    preferred_tryon_mode?: TryOnMode;
    subscription_tier?: SubscriptionTier;
  }) => api.patch("/api/user/preferences", data),
  buildAvatar: (data: {
    person_image_url: string;
    quality?: "fast" | "balanced" | "best";
    height_cm?: number;
    body_type?: string;
    gender?: string;
    fit_preference?: string;
    notes?: string;
    force_rebuild?: boolean;
  }) => api.post("/api/user/avatar/build", data),

  // Persistent canonical "person photo" -- upload once, reused across
  // /try, the Quick Try card, and the Chrome extension overlay.
  getPersonPhoto: () =>
    api.get<{ success: boolean; data: PersonPhotoData }>(
      "/api/user/person-photo"
    ),
  uploadPersonPhoto: (file: File) => {
    const formData = new FormData();
    formData.append("file", file);
    return api.post<{ success: boolean; data: PersonPhotoData }>(
      "/api/user/person-photo",
      formData,
      { headers: { "Content-Type": "multipart/form-data" } }
    );
  },
  deletePersonPhoto: () =>
    api.delete<{ success: boolean; data: PersonPhotoData }>(
      "/api/user/person-photo"
    ),
};

// Upload API
export const uploadApi = {
  uploadImage: (file: File) => {
    const formData = new FormData();
    formData.append("file", file);
    return api.post("/api/upload/image", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
  },

  uploadGarment: (file: File) => {
    const formData = new FormData();
    formData.append("file", file);
    return api.post("/api/upload/garment", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
  },
};

// Garments API
export const garmentsApi = {
  list: (skip = 0, limit = 100, savedOnly = false) =>
    api.get(`/api/garments/?skip=${skip}&limit=${limit}&saved_only=${savedOnly}`),
  get: (id: number) => api.get(`/api/garments/${id}`),
  create: (data: {
    name: string;
    description?: string;
    category?: string;
    image_url: string;
    s3_key: string;
    saved_to_closet?: boolean;
  }) => api.post("/api/garments/", data),
  update: (
    id: number,
    data: {
      name?: string;
      description?: string;
      category?: string;
      saved_to_closet?: boolean;
    }
  ) => api.put(`/api/garments/${id}`, data),
};

// Billing API
export type BillingPlan = {
  code: SubscriptionTier
  display_name: string
  allowed_modes: string[]
  period: string
  limit: number | null
  monthly_price_usd: number | null
  purchasable: boolean
  coming_soon: boolean
  cta_note: string | null
  stripe_price_configured: boolean
}

export type BillingPlansResponse = {
  success: boolean
  plans: BillingPlan[]
  current_tier: SubscriptionTier
  subscription_status: string
  subscription_renews_at: string | null
  cancel_at_period_end: boolean
}

export const billingApi = {
  listPlans: () => api.get<BillingPlansResponse>("/api/billing/plans"),
  createCheckoutSession: (planCode: SubscriptionTier) =>
    api.post<{ success: boolean; url: string; plan_code: string }>(
      "/api/billing/checkout-session",
      { plan_code: planCode }
    ),
  openPortal: () =>
    api.post<{ success: boolean; url: string }>("/api/billing/portal"),
}

// Affiliate API
export type AffiliateLinkPayload = {
  original_url: string
  affiliate_url: string
  merchant: string
  network: string
  commission_rate_pct: number | null
  disclosure_text: string
  has_commission: boolean
}

export const affiliateApi = {
  resolve: (garmentId: number) =>
    api.get<{ success: boolean; garment_id: number; link: AffiliateLinkPayload }>(
      `/api/affiliate/resolve/${garmentId}`
    ),
  click: (payload: { garment_id?: number; tryon_id?: number; url?: string }) =>
    api.post<{
      success: boolean
      link: AffiliateLinkPayload
      click_id: number
    }>("/api/affiliate/click", payload),
  listNetworks: () =>
    api.get<{ success: boolean; networks: Record<string, boolean> }>(
      "/api/affiliate/networks"
    ),
}

// TryOn API
export const tryonApi = {
  // `personImageUrl` is optional: when omitted, the backend uses the
  // saved default person photo (POST /api/user/person-photo). Throws
  // 422 if the user has neither a default nor an explicit URL.
  generate: (
    garmentId: number,
    personImageUrl: string | undefined,
    quality: string = "balanced",
    mode: TryOnMode = "2d"
  ) =>
    api.post("/api/tryon/generate", {
      garment_id: garmentId,
      person_image_url: personImageUrl,
      quality,
      mode,
    }),

  getStatus: (tryonId: number) => api.get(`/api/tryon/status/${tryonId}`),

  get: (tryonId: number) => api.get(`/api/tryon/${tryonId}`),

  list: (skip = 0, limit = 20) =>
    api.get(`/api/tryon/?skip=${skip}&limit=${limit}`),
};
