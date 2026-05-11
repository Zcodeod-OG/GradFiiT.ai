import axios, { AxiosError, type InternalAxiosRequestConfig } from "axios";
import type { SubscriptionTier, TryOnMode } from "@/lib/plans";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

// 60s covers a warm round-trip comfortably. Render's free-tier cold starts
// (30–60s) are handled by the retry path below — the first attempt is allowed
// to fail fast on ECONNABORTED so the retry can succeed against a now-warm
// instance.
export const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 60_000,
  headers: {
    "Content-Type": "application/json",
  },
});

type RetriableConfig = InternalAxiosRequestConfig & { _retried?: boolean };

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

const isColdStartFailure = (error: AxiosError): boolean => {
  if (error.code === "ECONNABORTED") return true;
  if (!error.response) return true; // network error, DNS fail, connection refused
  const status = error.response.status;
  return status === 502 || status === 503 || status === 504;
};

const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    if (typeof window !== "undefined") {
      const status = error?.response?.status;
      const detail = String(
        (error?.response?.data as { detail?: string } | undefined)?.detail || ""
      );
      if (status === 401 && detail.toLowerCase().includes("validate credentials")) {
        localStorage.removeItem("auth_token");
        localStorage.removeItem("auth-storage");
      }
    }

    const config = error.config as RetriableConfig | undefined;
    if (config && !config._retried && isColdStartFailure(error)) {
      config._retried = true;
      await delay(1500);
      return api.request(config);
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
export type GarmentPreprocessStatus =
  | "pending"
  | "queued"
  | "processing"
  | "ready"
  | "failed";

export type PaletteEntry = {
  hex: string;
  weight: number;
};

export type Garment = {
  id: number;
  user_id: number;
  name: string;
  description: string | null;
  category: string | null;
  image_url: string;
  s3_key: string;
  extracted_image_url: string | null;
  extracted_s3_key: string | null;
  garment_type: string | null;
  preprocess_status: GarmentPreprocessStatus;
  preprocess_error: string | null;
  saved_to_closet: boolean;
  source_url: string | null;
  color_palette: PaletteEntry[] | null;
  palette_extracted_at: string | null;
  attributes: Record<string, unknown> | null;
  created_at: string;
  updated_at: string | null;
};

export type OutfitRecommendation = {
  garments: Garment[];
  score: number;
  reason: string;
  palette: string[];
};

export type OutfitRecommendationsResponse = {
  outfits: OutfitRecommendation[];
};

export const garmentsApi = {
  list: (skip = 0, limit = 100, savedOnly = false) =>
    api.get<Garment[]>(
      `/api/garments/?skip=${skip}&limit=${limit}&saved_only=${savedOnly}`
    ),
  get: (id: number) => api.get<Garment>(`/api/garments/${id}`),
  create: (data: {
    name: string;
    description?: string;
    category?: string;
    image_url: string;
    s3_key: string;
    saved_to_closet?: boolean;
  }) => api.post<Garment>("/api/garments/", data),
  update: (
    id: number,
    data: {
      name?: string;
      description?: string;
      category?: string;
      saved_to_closet?: boolean;
    }
  ) => api.put<Garment>(`/api/garments/${id}`, data),
  delete: (id: number) => api.delete(`/api/garments/${id}`),
  fromUrl: (data: {
    image_url: string;
    name?: string;
    description?: string;
    category?: string;
    source_url?: string;
    save_to_closet?: boolean;
  }) => api.post<Garment>("/api/garments/from-url", data),
  suggestions: (id: number, limit = 6) =>
    api.get<GarmentSuggestion[]>(
      `/api/garments/${id}/suggestions?limit=${limit}`
    ),
  recommendOutfits: (limit = 10, anchorId?: number) => {
    const params = new URLSearchParams({ limit: String(limit) });
    if (anchorId != null) params.set("anchor_id", String(anchorId));
    return api.get<OutfitRecommendationsResponse>(
      `/api/garments/outfits/recommendations?${params.toString()}`
    );
  },
};

export type GarmentSuggestion = Garment & {
  score: number;
  reason: string;
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

// Studios API (Design + Stylist)
export type Design = {
  id: number;
  user_id: number;
  prompt: string;
  negative_prompt: string | null;
  sketch_image_url: string | null;
  style_reference_url: string | null;
  width: number;
  height: number;
  num_images: number;
  seed: number | null;
  primary_image_url: string | null;
  image_urls: string[];
  saved: boolean;
  status: string;
  error_message: string | null;
  pipeline_metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string | null;
};

export type DesignGenerateRequest = {
  prompt: string;
  negative_prompt?: string;
  sketch_image_url?: string;
  style_reference_url?: string;
  width?: number;
  height?: number;
  guidance_scale?: number;
  num_inference_steps?: number;
  num_images?: number;
  seed?: number;
  lora_uri?: string;
  lora_scale?: number;
};

export type StylistPiece = {
  slot: string;
  description: string;
  color?: string;
  fabric?: string;
};

export type Outfit = {
  id: number;
  user_id: number;
  prompt: string;
  pieces: StylistPiece[];
  background: string;
  model_reference_url: string | null;
  seed: number | null;
  num_images: number;
  primary_image_url: string | null;
  image_urls: string[];
  saved: boolean;
  status: string;
  error_message: string | null;
  pipeline_metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string | null;
};

export type StylistGenerateRequest = {
  prompt: string;
  pieces?: StylistPiece[];
  background?: string;
  model_reference_url?: string;
  seed?: number;
  num_images?: number;
  lora_uri?: string;
  lora_scale?: number;
};

export const studiosApi = {
  generateDesign: (payload: DesignGenerateRequest) =>
    api.post<Design>("/api/studios/design/generate", payload),
  listDesigns: (skip = 0, limit = 24) =>
    api.get<Design[]>(`/api/studios/design?skip=${skip}&limit=${limit}`),
  getDesign: (id: number) => api.get<Design>(`/api/studios/design/${id}`),
  deleteDesign: (id: number) => api.delete(`/api/studios/design/${id}`),

  generateOutfit: (payload: StylistGenerateRequest) =>
    api.post<Outfit>("/api/studios/stylist/generate", payload),
  listOutfits: (skip = 0, limit = 24) =>
    api.get<Outfit[]>(`/api/studios/stylist?skip=${skip}&limit=${limit}`),
  getOutfit: (id: number) => api.get<Outfit>(`/api/studios/stylist/${id}`),
  deleteOutfit: (id: number) => api.delete(`/api/studios/stylist/${id}`),
};

// Brand DNA API
export type BrandDNA = {
  id: number;
  user_id: number;
  palette: string[];
  logos: string[];
  model_references: string[];
  voice: string | null;
  lora_uri: string | null;
  lora_status: string;
  lora_strength: number;
  lora_metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string | null;
};

export type BrandDNAUpdate = {
  palette?: string[];
  logos?: string[];
  model_references?: string[];
  voice?: string;
  lora_uri?: string;
  lora_strength?: number;
};

export const brandDnaApi = {
  get: () => api.get<BrandDNA>("/api/brand-dna"),
  update: (payload: BrandDNAUpdate) => api.put<BrandDNA>("/api/brand-dna", payload),
  reset: () => api.delete("/api/brand-dna"),
};

// TryOn API
export type ComboQuality = "fast" | "balanced";

export type ComboTryOnResponse = {
  success: boolean;
  data: {
    tryon_id: number;
    status: string;
    estimated_time: string;
    execution_mode: string;
    combo_garment_ids: number[];
    quality_lane: ComboQuality;
    mode: string;
    provider: string;
    quota?: Record<string, unknown>;
  };
};

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

  // Multi-garment combo (2-3 garments, 2D-only, fast/balanced only).
  // Order matters: bottom-layer first.
  combo: (
    garmentIds: number[],
    personImageUrl?: string,
    quality: ComboQuality = "balanced"
  ) =>
    api.post<ComboTryOnResponse>("/api/tryon/combo", {
      garment_ids: garmentIds,
      person_image_url: personImageUrl,
      quality,
      mode: "2d",
    }),

  getStatus: (tryonId: number) => api.get(`/api/tryon/status/${tryonId}`),

  get: (tryonId: number) => api.get(`/api/tryon/${tryonId}`),

  list: (skip = 0, limit = 20) =>
    api.get(`/api/tryon/?skip=${skip}&limit=${limit}`),

  // Predictive warmup of the SageMaker try-on endpoint. Fire-and-forget.
  // Server debounces to once per 60s so it's safe to call on every mount.
  warmup: () => api.post("/api/tryon/warmup", {}),

  // On-demand Real-ESRGAN upscale of an existing result. Backend caches
  // the upscaled URL on the TryOn row so a second click is free.
  upscale: (tryonId: number) =>
    api.post<{
      success: boolean;
      data: {
        tryon_id: number;
        upscaled_image_url: string;
        from_cache: boolean;
      };
    }>(`/api/tryon/${tryonId}/upscale`, {}),

  // Subscribe to status updates via Server-Sent Events. Returns an
  // unsubscribe function. Prefer this over getStatus polling when the
  // browser supports streaming. The handler is invoked each time the
  // backend emits a status snapshot (status change, preview/result URL
  // change). On terminal status (completed/failed) the stream closes
  // server-side; the onClose callback fires so the caller can fall
  // back to a final getStatus probe if needed.
  streamStatus(
    tryonId: number,
    handlers: {
      onSnapshot: (snapshot: TryOnStatusSnapshot) => void;
      onError?: (err: Error) => void;
      onClose?: () => void;
    }
  ): () => void {
    const controller = new AbortController();
    const token =
      typeof window !== "undefined"
        ? localStorage.getItem("auth_token") || ""
        : "";

    fetch(`${API_BASE_URL}/api/tryon/stream/${tryonId}`, {
      headers: {
        Accept: "text/event-stream",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      signal: controller.signal,
      cache: "no-store",
    })
      .then(async (res) => {
        if (!res.ok || !res.body) {
          throw new Error(
            `SSE handshake failed (${res.status} ${res.statusText})`
          );
        }
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let currentEvent = "message";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          let idx;
          while ((idx = buffer.indexOf("\n\n")) >= 0) {
            const block = buffer.slice(0, idx);
            buffer = buffer.slice(idx + 2);
            currentEvent = "message";
            let data = "";
            for (const line of block.split("\n")) {
              if (line.startsWith(":")) continue; // comment / heartbeat
              if (line.startsWith("event:")) {
                currentEvent = line.slice(6).trim();
              } else if (line.startsWith("data:")) {
                data += line.slice(5).trimStart();
              }
            }
            if (currentEvent === "status" && data) {
              try {
                handlers.onSnapshot(JSON.parse(data) as TryOnStatusSnapshot);
              } catch {
                /* malformed payload — ignore, stream stays open */
              }
            } else if (currentEvent === "error") {
              handlers.onError?.(new Error(data || "stream_error"));
              controller.abort();
              return;
            }
          }
        }
        handlers.onClose?.();
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        handlers.onError?.(err instanceof Error ? err : new Error(String(err)));
      });

    return () => controller.abort();
  },
};

export type TryOnStatusSnapshot = {
  tryon_id: number;
  status: string;
  tryon_mode: string;
  progress: number;
  current_stage: string;
  extracted_garment_url: string | null;
  stage1_result_url: string | null;
  result_image_url: string | null;
  preview_image_url: string | null;
  result_model_url: string | null;
  result_turntable_url: string | null;
  error_message: string | null;
  lifecycle_status: string;
};

// Looks API (saved closet outfit assemblies)
export type Look = {
  id: number;
  user_id: number;
  name: string;
  notes: string | null;
  garment_ids: number[];
  last_rendered_tryon_id: number | null;
  last_rendered_image_url: string | null;
  last_rendered_at: string | null;
  last_rendered_status: string | null;
  created_at: string;
  updated_at: string | null;
};

export const looksApi = {
  list: (skip = 0, limit = 100) =>
    api.get<Look[]>(`/api/looks/?skip=${skip}&limit=${limit}`),
  get: (id: number) => api.get<Look>(`/api/looks/${id}`),
  create: (data: { name: string; garment_ids: number[]; notes?: string }) =>
    api.post<Look>("/api/looks/", data),
  update: (
    id: number,
    data: { name?: string; garment_ids?: number[]; notes?: string }
  ) => api.put<Look>(`/api/looks/${id}`, data),
  delete: (id: number) => api.delete(`/api/looks/${id}`),
  render: (
    id: number,
    data: { person_image_url?: string; quality?: ComboQuality } = {}
  ) => api.post<ComboTryOnResponse>(`/api/looks/${id}/render`, data),
};
