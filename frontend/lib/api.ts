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
  list: (skip = 0, limit = 100) =>
    api.get(`/api/garments/?skip=${skip}&limit=${limit}`),
  get: (id: number) => api.get(`/api/garments/${id}`),
  create: (data: {
    name: string;
    description?: string;
    category?: string;
    image_url: string;
    s3_key: string;
  }) => api.post("/api/garments/", data),
};

// TryOn API
export const tryonApi = {
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
