import axios from "axios";

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
  register: (email: string, password: string, fullName?: string) =>
    api.post("/api/auth/register", { email, password, full_name: fullName }),

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
    personImageUrl: string,
    quality: string = "balanced"
  ) =>
    api.post("/api/tryon/generate", {
      garment_id: garmentId,
      person_image_url: personImageUrl,
      quality,
    }),

  getStatus: (tryonId: number) => api.get(`/api/tryon/status/${tryonId}`),

  get: (tryonId: number) => api.get(`/api/tryon/${tryonId}`),

  list: (skip = 0, limit = 20) =>
    api.get(`/api/tryon/?skip=${skip}&limit=${limit}`),
};
