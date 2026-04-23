import { create } from "zustand";
import { api, toFormUrlEncoded } from "../lib/api";

export type User = {
  id: number;
  email: string;
  role: "specialist" | "company";
  username?: string | null;
};

type AuthState = {
  user: User | null;
  loading: boolean;
  error: string | null;
  loadMe: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  register: (payload: { email: string; username: string; password: string; role: "specialist" | "company" }) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
};

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  loading: false,
  error: null,
  loadMe: async () => {
    set({ loading: true, error: null });
    try {
      const { data } = await api.get<User>("/users/me");
      set({ user: data, loading: false });
    } catch (error) {
      set({ user: null, loading: false });
    }
  },
  login: async (email, password) => {
    set({ loading: true, error: null });
    try {
      await api.post("/auth/login", toFormUrlEncoded({ username: email, password }), {
        headers: { "Content-Type": "application/x-www-form-urlencoded" }
      });
      const { data } = await api.get<User>("/users/me");
      set({ user: data, loading: false });
    } catch (error) {
      set({ loading: false, error: "Login failed" });
      throw error;
    }
  },
  register: async (payload) => {
    set({ loading: true, error: null });
    try {
      await api.post("/auth/register", payload);
      set({ loading: false });
    } catch (error) {
      set({ loading: false, error: "Registration failed" });
      throw error;
    }
  },
  logout: async () => {
    set({ loading: true, error: null });
    try {
      await api.post("/auth/logout");
    } finally {
      set({ user: null, loading: false });
    }
  },
  refresh: async () => {
    set({ loading: true, error: null });
    try {
      await api.post("/auth/refresh");
      const { data } = await api.get<User>("/users/me");
      set({ user: data, loading: false });
    } catch (error) {
      set({ loading: false, error: "Token refresh failed" });
      throw error;
    }
  }
}));
