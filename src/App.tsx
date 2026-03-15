import { useState, useMemo } from "react";
import { ThemeContext, Theme } from "./ThemeContext";
import { getTokens } from "./themeTokens";
import CronBuilder from "./tools/CronBuilder";
import JWTDebugger from "./tools/JWTDebugger";
import SQLFormatter from "./tools/SQLFormatter";
import CSVJsonTransformer from "./tools/CSVJsonTransformer";
import ImageOptimizer from "./tools/ImageOptimizer";
import JsonSchemaForm from "./tools/JsonSchemaForm";
import RegexTester from "./tools/RegexTester";
import GitCommandBuilder from "./tools/GitCommandBuilder";

interface Tool {
  id: string;
  name: string;
  tagline: string;
  description: string;
  icon: React.ReactNode;
  badge: string;
  component: React.ComponentType;
}

const CronIcon = () => (
  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" />
    <polyline points="12 6 12 12 16 14" />
  </svg>
);
const JWTIcon = () => (
  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
  </svg>
);
const SQLIcon = () => (
  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <ellipse cx="12" cy="5" rx="9" ry="3" />
    <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" />
    <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
  </svg>
);
const CSVIcon = () => (
  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
    <line x1="8" y1="13" x2="16" y2="13" />
    <line x1="8" y1="17" x2="16" y2="17" />
    <polyline points="10 9 9 9 8 9" />
  </svg>
);
const ImageIcon = () => (
  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
    <circle cx="8.5" cy="8.5" r="1.5" />
    <polyline points="21 15 16 10 5 21" />
  </svg>
);
const SchemaIcon = () => (
  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
    <line x1="9" y1="13" x2="15" y2="13" />
    <line x1="9" y1="17" x2="15" y2="17" />
    <polyline points="9 9 9 9" />
  </svg>
);
const RegexIcon = () => (
  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="6" r="2" />
    <circle cx="17" cy="12" r="2" />
    <circle cx="11" cy="18" r="2" />
    <line x1="3" y1="6" x2="9" y2="6" />
    <line x1="13" y1="6" x2="21" y2="6" />
    <line x1="3" y1="18" x2="9" y2="18" />
    <line x1="13" y1="18" x2="21" y2="18" />
    <line x1="19" y1="14" x2="19" y2="22" />
    <line x1="15" y1="10" x2="15" y2="14" />
  </svg>
);
const GitIcon = () => (
  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="18" cy="18" r="3" />
    <circle cx="6" cy="6" r="3" />
    <path d="M13 6h3a2 2 0 0 1 2 2v7" />
    <line x1="6" y1="9" x2="6" y2="21" />
  </svg>
);
const BackIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="15 18 9 12 15 6" />
  </svg>
);
const SunIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="5" />
    <line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" />
    <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
    <line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" />
    <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
  </svg>
);
const MoonIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
  </svg>
);

const TOOLS: Tool[] = [
  {
    id: "cron",
    name: "Cron Builder",
    tagline: "Human-friendly scheduler",
    description: "Build cron expressions visually, preview next run times, and use common schedule templates.",
    icon: <CronIcon />,
    badge: "Scheduler",
    component: CronBuilder,
  },
  {
    id: "jwt",
    name: "JWT Debugger",
    tagline: "Decode, verify & generate",
    description: "Inspect JWT tokens, highlight security issues, verify claims, and generate new tokens.",
    icon: <JWTIcon />,
    badge: "Auth",
    component: JWTDebugger,
  },
  {
    id: "sql",
    name: "SQL Formatter",
    tagline: "Format, explain & optimize",
    description: "Beautify messy SQL with dialect support, visualize execution plans, and get optimization tips.",
    icon: <SQLIcon />,
    badge: "Database",
    component: SQLFormatter,
  },
  {
    id: "csv",
    name: "CSV / JSON Transform",
    tagline: "Visual data pipeline builder",
    description: "Filter, map, group, sort, and join data operations with a live preview table and one-click export.",
    icon: <CSVIcon />,
    badge: "Data",
    component: CSVJsonTransformer,
  },
  {
    id: "image",
    name: "Image Optimizer",
    tagline: "Compress, convert & srcset",
    description: "Client-side image compression, format conversion to WebP/AVIF, and responsive srcset generation.",
    icon: <ImageIcon />,
    badge: "Media",
    component: ImageOptimizer,
  },
  {
    id: "schema",
    name: "JSON Schema Form",
    tagline: "Schema → React form instantly",
    description: "Paste any JSON Schema and get a live functional form with validation, plus exportable react-hook-form code.",
    icon: <SchemaIcon />,
    badge: "Forms",
    component: JsonSchemaForm,
  },
  {
    id: "regex",
    name: "Regex Tester",
    tagline: "Test, visualize & explain",
    description: "Real-time regex testing with token-by-token visual breakdown, match highlighting, and a pattern library.",
    icon: <RegexIcon />,
    badge: "Strings",
    component: RegexTester,
  },
  {
    id: "git",
    name: "Git Command Builder",
    tagline: "Visual git command composer",
    description: "Build complex git commands visually — rebase, cherry-pick, stash, reset, merge, tag, bisect, worktree.",
    icon: <GitIcon />,
    badge: "Version Control",
    component: GitCommandBuilder,
  },
];

export default function App() {
  const [theme, setTheme] = useState<Theme>("dark");
  const [activeTool, setActiveTool] = useState<string | null>(null);
  const active = TOOLS.find((t) => t.id === activeTool);

  const toggle = () => setTheme((t) => (t === "dark" ? "light" : "dark"));
  const ctx = useMemo(() => ({ theme, toggle }), [theme]);

  const tk = getTokens(theme);
  const dark = tk.dark;

  const dotColor = dark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.055)";

  const ThemeBtn = ({ compact = false }: { compact?: boolean }) => (
    <button
      onClick={toggle}
      className={`flex items-center gap-2 px-3.5 py-2 rounded-xl border ${tk.border} ${tk.surface} ${tk.surfaceHv} ${tk.textMuted} transition-all duration-200 text-xs font-medium tracking-wide`}
    >
      {dark ? <SunIcon /> : <MoonIcon />}
      {!compact && (dark ? "Light mode" : "Dark mode")}
    </button>
  );

  return (
    <ThemeContext.Provider value={ctx}>
      <div className={`min-h-screen transition-colors duration-300 ${tk.bg} ${tk.text}`}>

        {/* Dot grid */}
        <div
          className="fixed inset-0 pointer-events-none"
          style={{
            backgroundImage: `radial-gradient(circle at 1px 1px, ${dotColor} 1px, transparent 0)`,
            backgroundSize: "32px 32px",
          }}
        />

        <div className="relative z-10 max-w-6xl mx-auto px-6 py-12">

          {/* ── Header ── */}
          <div className="mb-14 text-center relative">
            <div className="absolute right-0 top-0">
              <ThemeBtn />
            </div>

            <div className={`inline-flex items-center gap-2 px-4 py-1.5 rounded-full border ${tk.border} ${tk.surface} text-xs ${tk.textFaint} font-medium tracking-widest uppercase mb-6`}>
              <span className={`w-1.5 h-1.5 rounded-full ${dark ? "bg-white/60" : "bg-black/50"} animate-pulse`} />
              Dev Toolkit
            </div>

            <h1 className={`text-5xl font-black tracking-tight mb-4 leading-none ${tk.text}`}>
              Specialized<br />
              <span className={tk.textFaint}>Utilities</span>
            </h1>
            <p className={`${tk.textMuted} text-base max-w-md mx-auto leading-relaxed`}>
              Precision developer tools. No noise, no clutter — just what you need.
            </p>
          </div>

          {/* ── Tool Grid ── */}
          {!activeTool && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {TOOLS.map((tool, index) => (
                <button
                  key={tool.id}
                  onClick={() => setActiveTool(tool.id)}
                  className={`group relative text-left p-7 rounded-2xl border ${tk.border} ${tk.surface} ${tk.surfaceHv} ${tk.borderHv} transition-all duration-200 cursor-pointer`}
                >
                  {/* index number */}
                  <div className={`absolute top-5 right-5 text-xs font-mono ${tk.textDim} select-none`}>
                    {String(index + 1).padStart(2, "0")}
                  </div>

                  {/* icon */}
                  <div className={`mb-5 ${tk.textMuted} transition-colors duration-200`}>
                    {tool.icon}
                  </div>

                  {/* badge */}
                  <div className={`inline-flex items-center px-2 py-0.5 rounded border ${tk.border} ${tk.textFaint} text-xs font-medium tracking-widest uppercase mb-3`}>
                    {tool.badge}
                  </div>

                  {/* name */}
                  <h2 className={`text-lg font-bold mb-1 ${dark ? "text-white/90 group-hover:text-white" : "text-black/85 group-hover:text-black"} transition-colors duration-200`}>
                    {tool.name}
                  </h2>

                  <p className={`text-sm ${tk.textMuted} mb-3 font-medium`}>{tool.tagline}</p>
                  <p className={`text-sm ${tk.textFaint} leading-relaxed`}>{tool.description}</p>

                  <div className={`mt-6 flex items-center gap-1.5 text-xs font-semibold ${tk.textDim} group-hover:${tk.textMuted} transition-all duration-200 group-hover:gap-2.5`}>
                    Open
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="9 18 15 12 9 6" />
                    </svg>
                  </div>

                  {/* hover underline accent */}
                  <div className={`absolute bottom-0 left-7 right-7 h-px ${dark ? "bg-white/0 group-hover:bg-white/10" : "bg-black/0 group-hover:bg-black/10"} transition-all duration-300 rounded-full`} />
                </button>
              ))}
            </div>
          )}

          {/* ── Active Tool ── */}
          {activeTool && active && (
            <div className="animate-in">
              {/* Nav bar */}
              <div className="flex items-center justify-between mb-8 flex-wrap gap-3">
                <div className="flex items-center gap-4">
                  <button
                    onClick={() => setActiveTool(null)}
                    className={`flex items-center gap-2 px-4 py-2 rounded-xl border ${tk.border} ${tk.surface} ${tk.surfaceHv} ${tk.borderHv} text-sm ${tk.textMuted} transition-all duration-150`}
                  >
                    <BackIcon />
                    Back
                  </button>
                  <div className={`flex items-center gap-2 ${tk.textFaint} text-xs font-mono`}>
                    <span>Tools</span><span>/</span>
                    <span className={tk.textMuted}>{active.name}</span>
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  {TOOLS.filter((t) => t.id !== activeTool).map((tool) => (
                    <button
                      key={tool.id}
                      onClick={() => setActiveTool(tool.id)}
                      className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border ${tk.border} ${tk.surface} ${tk.surfaceHv} ${tk.borderHv} text-xs ${tk.textFaint} transition-all duration-150`}
                    >
                      <span className="[&>svg]:w-3 [&>svg]:h-3">{tool.icon}</span>
                      {tool.name}
                    </button>
                  ))}
                  <ThemeBtn compact />
                </div>
              </div>

              {/* Tool header */}
              <div className={`flex items-start gap-5 mb-8 pb-8 border-b ${tk.border}`}>
                <div className={`w-12 h-12 rounded-xl border ${tk.border} ${tk.surface} flex items-center justify-center ${tk.textMuted} shrink-0`}>
                  {active.icon}
                </div>
                <div>
                  <div className="flex items-center gap-3 mb-1.5">
                    <h2 className={`text-2xl font-black ${tk.text}`}>{active.name}</h2>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded border ${tk.border} ${tk.textFaint} text-xs font-medium tracking-widest uppercase`}>
                      {active.badge}
                    </span>
                  </div>
                  <p className={`${tk.textMuted} text-sm`}>{active.description}</p>
                </div>
              </div>

              {/* Tool component */}
              <active.component />
            </div>
          )}

          {/* ── Footer ── */}
          <div className={`mt-20 flex items-center justify-between text-xs ${tk.textDim} font-mono border-t ${dark ? "border-white/5" : "border-black/5"} pt-6`}>
            <span>{TOOLS.length} tools available</span>
            <span>Dev Toolkit</span>
          </div>
        </div>
      </div>
    </ThemeContext.Provider>
  );
}
