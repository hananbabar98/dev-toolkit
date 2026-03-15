import { createContext, useContext } from "react";

export type Theme = "dark" | "light";

export const ThemeContext = createContext<{
  theme: Theme;
  toggle: () => void;
}>({ theme: "dark", toggle: () => {} });

export const useTheme = () => useContext(ThemeContext);
