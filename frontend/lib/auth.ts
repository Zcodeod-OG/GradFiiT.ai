import { create } from "zustand";
import { persist } from "zustand/middleware";
import { authApi } from "./api";
import type { SubscriptionTier, TryOnMode } from "./plans";

type User = {
  id: number;
  email: string;
  full_name: string | null;
  subscription_tier: SubscriptionTier;
  preferred_tryon_mode: TryOnMode;
  avatar_status?: string;
  avatar_source_image_url?: string | null;
  avatar_model_id?: string | null;
  avatar_model_url?: string | null;
  avatar_preview_url?: string | null;
  avatar_turntable_url?: string | null;
  avatar_metadata?: Record<string, unknown> | null;
  avatar_error_message?: string | null;
  avatar_updated_at?: string | null;
  default_person_image_url?: string | null;
  default_person_smart_crop_url?: string | null;
  default_person_face_url?: string | null;
  default_person_input_gate_metrics?: Record<string, unknown> | null;
  default_person_uploaded_at?: string | null;
  is_active: boolean;
};

type AuthStore = {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;

  login: (email: string, password: string) => Promise<void>;
  register: (
    payload: {
      email: string;
      password: string;
      fullName?: string;
      subscriptionTier?: SubscriptionTier;
      preferredMode?: TryOnMode;
    }
  ) => Promise<void>;
  logout: () => void;
  loadUser: () => Promise<void>;
};

export const useAuth = create<AuthStore>()(
  persist(
    (set, get) => ({
      user: null,
      token: null,
      isAuthenticated: false,
      isLoading: false,

      login: async (email, password) => {
        const response = await authApi.login(email, password);
        const { access_token } = response.data;
        localStorage.setItem("auth_token", access_token);
        set({ token: access_token, isAuthenticated: true });
        await get().loadUser();
      },

      register: async (payload) => {
        await authApi.register({
          email: payload.email,
          password: payload.password,
          full_name: payload.fullName,
          subscription_tier: payload.subscriptionTier,
          preferred_tryon_mode: payload.preferredMode,
        });
        await get().login(payload.email, payload.password);
      },

      logout: () => {
        localStorage.removeItem("auth_token");
        set({ user: null, token: null, isAuthenticated: false });
      },

      loadUser: async () => {
        // Watchdog: if the backend is down or the network is frozen, we
        // don't want the dashboard to stay stuck on the "Loading your
        // workspace" spinner forever. Cap the wait at 12s and fall back
        // to the public landing on timeout.
        const TIMEOUT_MS = 12_000;
        try {
          set({ isLoading: true });
          const response = await Promise.race([
            authApi.getMe(),
            new Promise<never>((_, reject) =>
              setTimeout(
                () => reject(new Error("auth_timeout")),
                TIMEOUT_MS
              )
            ),
          ]);
          set({ user: response.data, isAuthenticated: true });
        } catch (err) {
          const isTimeout =
            err instanceof Error && err.message === "auth_timeout";
          if (isTimeout && typeof window !== "undefined") {
            console.warn(
              "[GradFiT] /api/auth/me took more than 12s; falling back to public landing."
            );
            set({ user: null, isAuthenticated: false });
            return;
          }
          set({ user: null, isAuthenticated: false, token: null });
          if (typeof window !== "undefined") {
            localStorage.removeItem("auth_token");
          }
        } finally {
          set({ isLoading: false });
        }
      },
    }),
    {
      name: "auth-storage",
      partialize: (state) => ({ token: state.token }),
    }
  )
);
