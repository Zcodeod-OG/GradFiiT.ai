import { create } from "zustand";
import { persist } from "zustand/middleware";
import { authApi } from "./api";

type User = {
  id: number;
  email: string;
  full_name: string | null;
  is_active: boolean;
};

type AuthStore = {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;

  login: (email: string, password: string) => Promise<void>;
  register: (
    email: string,
    password: string,
    fullName?: string
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

      register: async (email, password, fullName) => {
        await authApi.register(email, password, fullName);
        await get().login(email, password);
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
