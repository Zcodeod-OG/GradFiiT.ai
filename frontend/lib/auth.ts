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
        try {
          set({ isLoading: true });
          const response = await authApi.getMe();
          set({ user: response.data, isAuthenticated: true });
        } catch {
          set({ user: null, isAuthenticated: false, token: null });
          localStorage.removeItem("auth_token");
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
