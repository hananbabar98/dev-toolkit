import type { Theme } from "./ThemeContext";

export interface Tokens {
  dark: boolean;
  bg: string;
  surface: string;
  surfaceHv: string;
  border: string;
  borderHv: string;
  text: string;
  textMuted: string;
  textFaint: string;
  textDim: string;
  tabActive: string;
  tabInactive: string;
  cta: string;
  inputBg: string;
  inputFocus: string;
  selectBg: string;
}

export function getTokens(theme: Theme): Tokens {
  const dark = theme === "dark";
  return {
    dark,
    bg:        dark ? "bg-black"              : "bg-white",
    surface:   dark ? "bg-white/[0.03]"       : "bg-black/[0.03]",
    surfaceHv: dark ? "hover:bg-white/[0.07]" : "hover:bg-black/[0.06]",
    border:    dark ? "border-white/10"       : "border-black/10",
    borderHv:  dark ? "hover:border-white/25" : "hover:border-black/25",
    text:      dark ? "text-white"            : "text-black",
    textMuted: dark ? "text-white/50"         : "text-black/50",
    textFaint: dark ? "text-white/25"         : "text-black/25",
    textDim:   dark ? "text-white/15"         : "text-black/15",
    tabActive:  dark ? "bg-white text-black"  : "bg-black text-white",
    tabInactive: dark ? "text-white/40 hover:text-white/70" : "text-black/40 hover:text-black/70",
    cta:       dark ? "bg-white text-black hover:bg-white/90" : "bg-black text-white hover:bg-black/85",
    inputBg:   dark ? "bg-white/[0.03] border-white/10 text-white placeholder:text-white/20 focus:border-white/30 focus:bg-white/[0.05]"
                    : "bg-black/[0.03] border-black/10 text-black placeholder:text-black/20 focus:border-black/30 focus:bg-black/[0.04]",
    inputFocus: dark ? "focus:border-white/30" : "focus:border-black/30",
    selectBg:  dark ? "bg-black text-white/80" : "bg-white text-black/80",
  };
}
