import { useState, useRef, useCallback } from "react";
import { useTheme } from "../ThemeContext";
import { getTokens } from "../themeTokens";

// ── Types ─────────────────────────────────────────────────────────────────────
interface FaviconSize {
  size: number;
  filename: string;
  label: string;
  tag: "link" | "meta";
  rel?: string;
  isTouchIcon?: boolean;
  isTile?: boolean;
}

interface GeneratedFavicon extends FaviconSize {
  dataUrl: string;
}

// ── Constants ─────────────────────────────────────────────────────────────────
const FAVICON_SIZES: FaviconSize[] = [
  { size: 16,  filename: "favicon-16x16.png",          label: "Browser Tab",          tag: "link" },
  { size: 32,  filename: "favicon-32x32.png",          label: "Browser Tab (Retina)", tag: "link" },
  { size: 48,  filename: "favicon-48x48.png",          label: "Windows Site",         tag: "link" },
  { size: 64,  filename: "favicon-64x64.png",          label: "Shortcut Icon",        tag: "link" },
  { size: 96,  filename: "favicon-96x96.png",          label: "Google TV",            tag: "link" },
  { size: 128, filename: "favicon-128x128.png",        label: "Chrome Web Store",     tag: "link" },
  { size: 144, filename: "mstile-144x144.png",         label: "MS Tile",              tag: "meta", isTile: true },
  { size: 152, filename: "apple-touch-icon-152x152.png", label: "iPad (Retina)",      tag: "link", isTouchIcon: true },
  { size: 180, filename: "apple-touch-icon.png",       label: "iPhone (Retina)",      tag: "link", isTouchIcon: true },
  { size: 192, filename: "android-chrome-192x192.png", label: "Android Chrome",       tag: "link" },
  { size: 256, filename: "favicon-256x256.png",        label: "Windows",              tag: "link" },
  { size: 512, filename: "android-chrome-512x512.png", label: "PWA / Splash",         tag: "link" },
];

// ── Helpers ───────────────────────────────────────────────────────────────────
function resizeToCanvas(img: HTMLImageElement, size: number): string {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, 0, 0, size, size);
  return canvas.toDataURL("image/png");
}

function buildHtmlTags(favicons: GeneratedFavicon[]): string {
  const lines: string[] = [];

  // Standard icons
  const standards = favicons.filter(
    (f) => !f.isTouchIcon && !f.isTile && f.size <= 96
  );
  for (const f of standards) {
    lines.push(`<link rel="icon" type="image/png" sizes="${f.size}x${f.size}" href="/${f.filename}">`);
  }

  // Apple Touch Icons
  const touchIcons = favicons.filter((f) => f.isTouchIcon);
  for (const f of touchIcons) {
    lines.push(
      f.size === 180
        ? `<link rel="apple-touch-icon" sizes="${f.size}x${f.size}" href="/${f.filename}">`
        : `<link rel="apple-touch-icon" sizes="${f.size}x${f.size}" href="/${f.filename}">`
    );
  }

  // Android / PWA
  const android = favicons.find((f) => f.filename === "android-chrome-192x192.png");
  const pwa     = favicons.find((f) => f.filename === "android-chrome-512x512.png");
  if (android) lines.push(`<link rel="icon" type="image/png" sizes="192x192" href="/${android.filename}">`);
  if (pwa)     lines.push(`<link rel="icon" type="image/png" sizes="512x512" href="/${pwa.filename}">`);

  // Manifest + theme
  lines.push(`<link rel="manifest" href="/site.webmanifest">`);
  lines.push(`<meta name="theme-color" content="#ffffff">`);

  // MS Tile
  const tile = favicons.find((f) => f.isTile);
  if (tile) {
    lines.push(`<meta name="msapplication-TileImage" content="/${tile.filename}">`);
    lines.push(`<meta name="msapplication-TileColor" content="#ffffff">`);
  }

  return lines.join("\n");
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function FaviconGenerator() {
  const { theme } = useTheme();
  const tk = getTokens(theme);

  const [sourceUrl, setSourceUrl]     = useState<string | null>(null);
  const [favicons, setFavicons]       = useState<GeneratedFavicon[]>([]);
  const [generating, setGenerating]   = useState(false);
  const [dragging, setDragging]       = useState(false);
  const [tab, setTab]                 = useState<"preview" | "html">("preview");
  const [copied, setCopied]           = useState(false);
  const [downloading, setDownloading] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const generateFavicons = useCallback((file: File) => {
    if (!file.type.startsWith("image/")) return;
    setGenerating(true);
    setFavicons([]);
    setTab("preview");

    const url = URL.createObjectURL(file);
    setSourceUrl(url);

    const img = new Image();
    img.onload = () => {
      const generated: GeneratedFavicon[] = FAVICON_SIZES.map((spec) => ({
        ...spec,
        dataUrl: resizeToCanvas(img, spec.size),
      }));
      setFavicons(generated);
      setGenerating(false);
    };
    img.onerror = () => setGenerating(false);
    img.src = url;
  }, []);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) generateFavicons(file);
  }, [generateFavicons]);

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) generateFavicons(file);
  };

  const downloadOne = (favicon: GeneratedFavicon) => {
    const a = document.createElement("a");
    a.href = favicon.dataUrl;
    a.download = favicon.filename;
    a.click();
  };

  const downloadAll = async () => {
    setDownloading(true);
    for (let i = 0; i < favicons.length; i++) {
      setTimeout(() => downloadOne(favicons[i]), i * 120);
    }
    setTimeout(() => setDownloading(false), favicons.length * 120 + 200);
  };

  const copyHtml = () => {
    navigator.clipboard.writeText(buildHtmlTags(favicons));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const htmlTags = favicons.length ? buildHtmlTags(favicons) : "";

  const sectionCls = `rounded-2xl border ${tk.border} ${tk.surface} p-5`;
  const labelCls   = `text-xs font-semibold tracking-widest uppercase ${tk.textFaint} mb-3 block`;
  const tabCls = (active: boolean) =>
    `px-4 py-1.5 rounded-lg text-xs font-semibold tracking-wide transition-all duration-150 ${
      active ? tk.tabActive : `${tk.tabInactive} ${tk.surface} border ${tk.border}`
    }`;

  return (
    <div className="space-y-5">

      {/* ── Drop Zone ── */}
      <div
        className={`relative rounded-2xl border-2 border-dashed transition-all duration-200 cursor-pointer p-10 text-center
          ${dragging
            ? (tk.dark ? "border-white/40 bg-white/[0.05]" : "border-black/40 bg-black/[0.04]")
            : `${tk.dark ? "border-white/10 hover:border-white/25" : "border-black/10 hover:border-black/25"} ${tk.surface}`
          }`}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => fileInputRef.current?.click()}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={onFileChange}
        />

        {sourceUrl ? (
          <div className="flex flex-col items-center gap-3">
            <img
              src={sourceUrl}
              alt="source"
              className={`w-20 h-20 object-contain rounded-xl border ${tk.border}`}
            />
            <p className={`text-xs ${tk.textFaint}`}>Click or drop to replace</p>
          </div>
        ) : (
          <>
            <div className={`text-4xl mb-3 ${tk.textDim}`}>⊞</div>
            <p className={`text-sm font-semibold ${tk.textMuted}`}>Drop your image here or click to browse</p>
            <p className={`text-xs mt-1 ${tk.textFaint}`}>PNG, SVG, JPEG — square images work best</p>
          </>
        )}
      </div>

      {/* ── Generating state ── */}
      {generating && (
        <div className={`${sectionCls} flex items-center justify-center py-12`}>
          <div className="text-center">
            <div className={`text-2xl mb-2 ${tk.textDim} animate-pulse`}>⊙</div>
            <p className={`text-sm ${tk.textFaint}`}>Generating all sizes…</p>
          </div>
        </div>
      )}

      {/* ── Results ── */}
      {favicons.length > 0 && !generating && (
        <>
          {/* Tabs + Download All */}
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className={`flex gap-1 p-1 rounded-lg border ${tk.border} ${tk.surface}`}>
              {(["preview", "html"] as const).map((t) => (
                <button key={t} className={tabCls(tab === t)} onClick={() => setTab(t)}>
                  {t === "preview" ? "Preview" : "HTML Tags"}
                </button>
              ))}
            </div>

            <button
              onClick={downloadAll}
              disabled={downloading}
              className={`px-5 py-2.5 rounded-xl text-sm font-semibold transition-all duration-150 ${tk.cta} disabled:opacity-40`}
            >
              {downloading ? "Downloading…" : `↓ Download All (${favicons.length})`}
            </button>
          </div>

          {/* ── Preview Tab ── */}
          {tab === "preview" && (
            <div className={sectionCls}>
              <span className={labelCls}>{favicons.length} sizes generated</span>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                {favicons.map((f) => (
                  <div
                    key={f.filename}
                    className={`group relative rounded-xl border ${tk.border} ${tk.surface} p-4 flex flex-col items-center gap-3`}
                  >
                    {/* Checkerboard bg for transparency */}
                    <div
                      className={`rounded-lg border ${tk.border} flex items-center justify-center overflow-hidden`}
                      style={{
                        width: Math.min(f.size, 64),
                        height: Math.min(f.size, 64),
                        backgroundImage: tk.dark
                          ? "repeating-conic-gradient(#ffffff08 0% 25%, transparent 0% 50%)"
                          : "repeating-conic-gradient(#00000008 0% 25%, transparent 0% 50%)",
                        backgroundSize: "8px 8px",
                      }}
                    >
                      <img
                        src={f.dataUrl}
                        alt={f.filename}
                        style={{
                          width: Math.min(f.size, 64),
                          height: Math.min(f.size, 64),
                          imageRendering: f.size <= 32 ? "pixelated" : "auto",
                        }}
                      />
                    </div>

                    <div className="text-center min-w-0 w-full">
                      <p className={`text-xs font-bold font-mono ${tk.textMuted} truncate`}>
                        {f.size}×{f.size}
                      </p>
                      <p className={`text-[10px] ${tk.textFaint} truncate mt-0.5`}>{f.label}</p>
                    </div>

                    <button
                      onClick={() => downloadOne(f)}
                      className={`w-full text-xs py-1.5 rounded-lg border ${tk.border} ${tk.surface} ${tk.surfaceHv} ${tk.textFaint} transition-all duration-150 font-semibold`}
                    >
                      ↓ .png
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── HTML Tab ── */}
          {tab === "html" && (
            <div className={sectionCls}>
              <div className="flex items-center justify-between mb-4">
                <span className={labelCls} style={{ marginBottom: 0 }}>Paste into your &lt;head&gt;</span>
                <button
                  onClick={copyHtml}
                  className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all duration-150 ${
                    copied ? tk.cta : `border ${tk.border} ${tk.surface} ${tk.surfaceHv} ${tk.textMuted}`
                  }`}
                >
                  {copied ? "✓ Copied!" : "Copy"}
                </button>
              </div>

              <pre
                className={`text-xs font-mono p-4 rounded-xl border ${tk.border} ${
                  tk.dark ? "bg-white/[0.02]" : "bg-black/[0.02]"
                } ${tk.textMuted} overflow-x-auto leading-relaxed whitespace-pre-wrap`}
              >
                {htmlTags}
              </pre>

              {/* Tag explanation */}
              <div className="mt-5 space-y-2">
                <span className={labelCls}>What each tag does</span>
                {[
                  { tag: "favicon-16/32/48/96.png",    desc: "Standard browser favicon — shown in tabs, bookmarks, history" },
                  { tag: "apple-touch-icon.png",        desc: "iOS / macOS home screen icon when saved as web app" },
                  { tag: "apple-touch-icon-152x152.png",desc: "iPad (Retina) home screen icon" },
                  { tag: "android-chrome-192/512.png",  desc: "Android Chrome shortcut & PWA splash screen" },
                  { tag: "site.webmanifest",            desc: "PWA manifest — references android-chrome icons" },
                  { tag: "mstile-144x144.png",          desc: "Windows 8/10 Start screen live tile" },
                  { tag: "theme-color",                 desc: "Browser UI accent color on mobile Chrome / Safari" },
                ].map(({ tag, desc }) => (
                  <div
                    key={tag}
                    className={`flex items-start gap-3 px-4 py-3 rounded-xl border ${tk.border} ${tk.surface}`}
                  >
                    <code className={`text-xs font-mono ${tk.textMuted} shrink-0 mt-0.5`}>{tag}</code>
                    <p className={`text-xs ${tk.textFaint} leading-relaxed`}>{desc}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
