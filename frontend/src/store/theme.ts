import { create } from "zustand";

type ThemeState = {
  dark: boolean;
  toggle: () => void;
  setDark: (dark: boolean) => void;
};

export const useThemeStore = create<ThemeState>((set) => {
  const saved = localStorage.getItem("junion-theme");
  const initial = saved === "dark";
  return {
    dark: initial,
    toggle: () => set((s) => {
      const next = !s.dark;
      localStorage.setItem("junion-theme", next ? "dark" : "light");
      return { dark: next };
    }),
    setDark: (dark) => {
      localStorage.setItem("junion-theme", dark ? "dark" : "light");
      set({ dark });
    },
  };
});
