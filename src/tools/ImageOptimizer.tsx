import { useState, useRef, useCallback, useEffect } from "react";
import { useTheme } from "../ThemeContext";
import { getTokens } from "../themeTokens";

// ── Types ────────────────────────────────────────────────────────────────────
type OutputFormat = "webp" | "avif" | "jpeg" | "png";

interface SrcsetBreakpoint {
  width: number;
  label: string;
  enabled: boolean;
}

interface ImageFile {
  id: string;
  file: File;
  originalUrl: string;
  originalSize: number;
  width: number;
  height: number;
  converted: ConvertedResult[];
  converting: boolean;
  error: string;
}

interface ConvertedResult {
  format: OutputFormat;
  quality: number;
  width: number;
  height: number;
  blob: Blob;
  url: string;
  size: number;
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function uid() { return Math.random().toString(36).slice(2, 10); }
function fmtSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}
function savings(orig: number, comp: number) {
  if (!orig) return "0%";
  const pct = ((orig - comp) / orig) * 100;
  return `${pct > 0 ? "-" : "+"}${Math.abs(pct).toFixed(1)}%`;
}

async function convertImage(
  file: File,
  targetFormat: OutputFormat,
  quality: number,
  targetWidth: number,
  targetHeight: number
): Promise<ConvertedResult> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const srcUrl = URL.createObjectURL(file);
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = targetWidth;
      canvas.height = targetHeight;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0, targetWidth, targetHeight);
      URL.revokeObjectURL(srcUrl);

      const mimeMap: Record<OutputFormat, string> = {
        webp: "image/webp",
        avif: "image/avif",
        jpeg: "image/jpeg",
        png: "image/png",
      };
      const mime = mimeMap[targetFormat];

      canvas.toBlob(
        (blob) => {
          if (!blob) { reject(new Error("Conversion failed")); return; }
          const url = URL.createObjectURL(blob);
          resolve({ format: targetFormat, quality, width: targetWidth, height: targetHeight, blob, url, size: blob.size });
        },
        mime,
        targetFormat === "png" ? undefined : quality / 100
      );
    };
    img.onerror = () => reject(new Error("Failed to load image"));
    img.src = srcUrl;
  });
}

async function loadImageDimensions(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => { resolve({ width: img.naturalWidth, height: img.naturalHeight }); URL.revokeObjectURL(url); };
    img.onerror = () => reject(new Error("Cannot read image"));
    img.src = url;
  });
}

const DEFAULT_BREAKPOINTS: SrcsetBreakpoint[] = [
  { width: 320, label: "xs", enabled: true },
  { width: 640, label: "sm", enabled: true },
  { width: 768, label: "md", enabled: true },
  { width: 1024, label: "lg", enabled: true },
  { width: 1280, label: "xl", enabled: false },
  { width: 1920, label: "2xl", enabled: false },
];

// ── Main Component ────────────────────────────────────────────────────────────
export default function ImageOptimizer() {
  const { theme } = useTheme();
  const tk = getTokens(theme);

  const [images, setImages] = useState<ImageFile[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [format, setFormat] = useState<OutputFormat>("webp");
  const [quality, setQuality] = useState(82);
  const [maintainAspect, setMaintainAspect] = useState(true);
  const [customWidth, setCustomWidth] = useState("");
  const [breakpoints, setBreakpoints] = useState<SrcsetBreakpoint[]>(DEFAULT_BREAKPOINTS);
  const [activeTab, setActiveTab] = useState<"compress" | "srcset">("compress");
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const selected = images.find((img) => img.id === selectedId) ?? images[0] ?? null;

  const processFile = useCallback(async (file: File) => {
    if (!file.type.startsWith("image/")) return;
    const id = uid();
    const originalUrl = URL.createObjectURL(file);
    const { width, height } = await loadImageDimensions(file);
    const img: ImageFile = {
      id, file, originalUrl, originalSize: file.size, width, height,
      converted: [], converting: true, error: "",
    };
    setImages((prev) => [...prev, img]);
    setSelectedId(id);
    try {
      const result = await convertImage(file, format, quality, width, height);
      setImages((prev) => prev.map((i) => i.id === id ? { ...i, converted: [result], converting: false } : i));
    } catch (e: unknown) {
      setImages((prev) => prev.map((i) => i.id === id ? { ...i, converting: false, error: (e as Error).message } : i));
    }
  }, [format, quality]);

  const handleFiles = useCallback((files: FileList | File[]) => {
    Array.from(files).forEach(processFile);
  }, [processFile]);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDragging(false);
    handleFiles(e.dataTransfer.files);
  }, [handleFiles]);

  const reconvert = useCallback(async (imgFile: ImageFile, fmt: OutputFormat, q: number, w?: number) => {
    const targetW = w ?? imgFile.width;
    const targetH = maintainAspect ? Math.round((imgFile.height / imgFile.width) * targetW) : imgFile.height;
    setImages((prev) => prev.map((i) => i.id === imgFile.id ? { ...i, converting: true } : i));
    try {
      const result = await convertImage(imgFile.file, fmt, q, targetW, targetH);
      setImages((prev) => prev.map((i) => i.id === imgFile.id ? { ...i, converted: [result], converting: false } : i));
    } catch (e: unknown) {
      setImages((prev) => prev.map((i) => i.id === imgFile.id ? { ...i, converting: false, error: (e as Error).message } : i));
    }
  }, [maintainAspect]);

  // Re-convert when settings change
  useEffect(() => {
    if (!selected) return;
    const w = customWidth ? parseInt(customWidth) : undefined;
    const debounce = setTimeout(() => reconvert(selected, format, quality, w), 300);
    return () => clearTimeout(debounce);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [format, quality, customWidth]);

  // Srcset generation
  const generateSrcset = useCallback(async (imgFile: ImageFile) => {
    const active = breakpoints.filter((b) => b.enabled && b.width <= imgFile.width);
    setImages((prev) => prev.map((i) => i.id === imgFile.id ? { ...i, converting: true, converted: [] } : i));
    try {
      const results = await Promise.all(
        active.map((bp) => {
          const h = Math.round((imgFile.height / imgFile.width) * bp.width);
          return convertImage(imgFile.file, format, quality, bp.width, h);
        })
      );
      setImages((prev) => prev.map((i) => i.id === imgFile.id ? { ...i, converted: results, converting: false } : i));
    } catch (e: unknown) {
      setImages((prev) => prev.map((i) => i.id === imgFile.id ? { ...i, converting: false, error: (e as Error).message } : i));
    }
  }, [breakpoints, format, quality]);

  const downloadResult = (result: ConvertedResult, name: string) => {
    const a = document.createElement("a");
    a.href = result.url;
    a.download = `${name.replace(/\.[^.]+$/, "")}-${result.width}w.${result.format}`;
    a.click();
  };

  const downloadAll = (imgFile: ImageFile) => {
    imgFile.converted.forEach((r) => downloadResult(r, imgFile.file.name));
  };

  const srcsetString = selected && selected.converted.length > 1
    ? selected.converted.map((r) => `image.${r.format} ${r.width}w`).join(",\n  ")
    : "";

  const sectionCls = `rounded-2xl border ${tk.border} ${tk.surface} p-5`;
  const labelCls = `text-xs font-semibold tracking-widest uppercase ${tk.textFaint} mb-3 block`;
  const tabCls = (active: boolean) =>
    `px-4 py-1.5 rounded-lg text-xs font-semibold tracking-wide transition-all duration-150 ${active ? tk.tabActive : `${tk.tabInactive} ${tk.surface} border ${tk.border}`}`;

  const formats: OutputFormat[] = ["webp", "avif", "jpeg", "png"];

  return (
    <div className="space-y-5">
      {/* ── Drop Zone ── */}
      <div
        className={`relative rounded-2xl border-2 border-dashed transition-all duration-200 cursor-pointer
          ${dragging
            ? (tk.dark ? "border-white/40 bg-white/[0.05]" : "border-black/40 bg-black/[0.04]")
            : `${tk.dark ? "border-white/10 hover:border-white/25" : "border-black/10 hover:border-black/25"} ${tk.surface}`
          } p-10 text-center`}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => fileInputRef.current?.click()}
      >
        <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => e.target.files && handleFiles(e.target.files)} />
        <div className={`text-4xl mb-3 ${tk.textDim}`}>⊞</div>
        <p className={`text-sm font-semibold ${tk.textMuted}`}>Drop images here or click to browse</p>
        <p className={`text-xs mt-1 ${tk.textFaint}`}>PNG, JPEG, WebP, GIF, BMP, SVG — multiple files supported</p>
      </div>

      {images.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {/* ── Left: Image list ── */}
          <div className={`${sectionCls} lg:col-span-1`}>
            <span className={labelCls}>Images ({images.length})</span>
            <div className="space-y-2">
              {images.map((img) => (
                <button key={img.id} onClick={() => setSelectedId(img.id)}
                  className={`w-full text-left flex items-center gap-3 p-3 rounded-xl border transition-all duration-150 ${
                    selected?.id === img.id
                      ? (tk.dark ? "border-white/30 bg-white/[0.06]" : "border-black/30 bg-black/[0.06]")
                      : `${tk.border} ${tk.surfaceHv}`
                  }`}>
                  <div className={`w-12 h-12 rounded-lg border ${tk.border} overflow-hidden shrink-0 ${tk.dark ? "bg-white/[0.04]" : "bg-black/[0.04]"} flex items-center justify-center`}>
                    <img src={img.originalUrl} alt="" className="w-full h-full object-cover" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className={`text-xs font-semibold ${tk.text} truncate`}>{img.file.name}</p>
                    <p className={`text-xs ${tk.textFaint} font-mono`}>{img.width}×{img.height} · {fmtSize(img.originalSize)}</p>
                    {img.converting && <p className={`text-xs ${tk.textDim} font-mono mt-0.5`}>Converting…</p>}
                    {img.error && <p className={`text-xs ${tk.textMuted} mt-0.5`}>⚠ {img.error}</p>}
                    {!img.converting && img.converted.length > 0 && (
                      <p className={`text-xs font-mono mt-0.5 ${tk.dark ? "text-white/45" : "text-black/45"}`}>
                        {fmtSize(img.converted[0]?.size ?? 0)} · {savings(img.originalSize, img.converted[0]?.size ?? img.originalSize)}
                      </p>
                    )}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* ── Right: Settings + Output ── */}
          <div className="lg:col-span-2 space-y-5">
            {/* Settings */}
            <div className={sectionCls}>
              <div className="flex items-center gap-2 mb-4">
                <div className={`flex gap-1 p-1 rounded-lg border ${tk.border} ${tk.surface}`}>
                  {(["compress", "srcset"] as const).map((t) => (
                    <button key={t} className={tabCls(activeTab === t)} onClick={() => setActiveTab(t)}>
                      {t === "compress" ? "Compress & Convert" : "Responsive srcset"}
                    </button>
                  ))}
                </div>
              </div>

              {/* Format */}
              <div className="mb-4">
                <label className={labelCls}>Output Format</label>
                <div className="flex gap-2 flex-wrap">
                  {formats.map((f) => (
                    <button key={f} onClick={() => setFormat(f)}
                      className={`px-4 py-2 rounded-xl border text-xs font-semibold tracking-wide transition-all duration-150 uppercase ${
                        format === f ? tk.tabActive : `${tk.border} ${tk.surface} ${tk.surfaceHv} ${tk.textFaint}`
                      }`}>
                      {f}
                      {f === "webp" && <span className={`ml-1.5 text-[10px] ${format === f ? "opacity-60" : tk.textDim}`}>recommended</span>}
                      {f === "avif" && <span className={`ml-1.5 text-[10px] ${format === f ? "opacity-60" : tk.textDim}`}>best compression</span>}
                    </button>
                  ))}
                </div>
              </div>

              {/* Quality */}
              <div className="mb-4">
                <div className="flex items-center justify-between mb-2">
                  <label className={labelCls} style={{ marginBottom: 0 }}>Quality</label>
                  <span className={`text-sm font-bold font-mono ${tk.text}`}>{format === "png" ? "Lossless" : `${quality}%`}</span>
                </div>
                {format !== "png" && (
                  <div className="relative">
                    <input type="range" min="10" max="100" value={quality} onChange={(e) => setQuality(parseInt(e.target.value))}
                      className={`w-full accent-current ${tk.dark ? "[&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-runnable-track]:bg-white/10" : "[&::-webkit-slider-thumb]:bg-black [&::-webkit-slider-runnable-track]:bg-black/10"}`} />
                    <div className={`flex justify-between text-xs ${tk.textDim} font-mono mt-1`}>
                      <span>10 (smallest)</span><span>100 (best quality)</span>
                    </div>
                  </div>
                )}
              </div>

              {activeTab === "compress" && (
                <div className="mb-4">
                  <label className={labelCls}>Custom Width (px) — leave blank to keep original</label>
                  <div className="flex items-center gap-3">
                    <input type="number" className={`w-40 px-3 py-2 rounded-lg border text-sm outline-none transition-all duration-150 ${tk.inputBg}`}
                      value={customWidth} onChange={(e) => setCustomWidth(e.target.value)} placeholder={selected ? String(selected.width) : "auto"} min="1" />
                    <label className={`flex items-center gap-2 text-xs ${tk.textMuted} cursor-pointer`}>
                      <input type="checkbox" checked={maintainAspect} onChange={(e) => setMaintainAspect(e.target.checked)} className="rounded" />
                      Maintain aspect ratio
                    </label>
                  </div>
                </div>
              )}

              {activeTab === "srcset" && (
                <div>
                  <label className={labelCls}>Responsive Breakpoints</label>
                  <div className="flex flex-wrap gap-2 mb-3">
                    {breakpoints.map((bp, i) => (
                      <button key={bp.width} onClick={() => setBreakpoints((prev) => prev.map((b, j) => j === i ? { ...b, enabled: !b.enabled } : b))}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-mono transition-all duration-150 ${
                          bp.enabled ? tk.tabActive : `${tk.border} ${tk.surface} ${tk.surfaceHv} ${tk.textFaint}`
                        } ${selected && bp.width > (selected.width) ? "opacity-30 cursor-not-allowed" : ""}`}
                        disabled={!!selected && bp.width > selected.width}>
                        {bp.label} / {bp.width}px
                      </button>
                    ))}
                  </div>
                  {selected && (
                    <button onClick={() => generateSrcset(selected)}
                      className={`px-5 py-2.5 rounded-xl text-sm font-semibold transition-all duration-150 ${tk.cta}`}>
                      Generate srcset variants
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* ── Output ── */}
            {selected && selected.converted.length > 0 && (
              <div className={sectionCls}>
                <div className="flex items-center justify-between mb-4">
                  <span className={labelCls} style={{ marginBottom: 0 }}>
                    {selected.converted.length > 1 ? `${selected.converted.length} Variants` : "Result"}
                  </span>
                  {selected.converted.length > 1 && (
                    <button onClick={() => downloadAll(selected)}
                      className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all duration-150 ${tk.cta}`}>
                      ↓ Download all
                    </button>
                  )}
                </div>

                {selected.converted.length === 1 ? (
                  // Single result
                  <div className="grid grid-cols-2 gap-4 mb-4">
                    <div>
                      <p className={`text-xs ${tk.textDim} mb-2 font-semibold tracking-widest uppercase`}>Original</p>
                      <div className={`rounded-xl border ${tk.border} overflow-hidden ${tk.dark ? "bg-white/[0.03]" : "bg-black/[0.03]"} flex items-center justify-center min-h-[120px]`}>
                        <img src={selected.originalUrl} alt="original" className="max-h-40 max-w-full object-contain" />
                      </div>
                      <p className={`text-xs font-mono mt-2 ${tk.textFaint}`}>{fmtSize(selected.originalSize)}</p>
                    </div>
                    <div>
                      <p className={`text-xs ${tk.textDim} mb-2 font-semibold tracking-widest uppercase`}>
                        {selected.converted[0].format.toUpperCase()} · {selected.converted[0].width}×{selected.converted[0].height}
                      </p>
                      <div className={`rounded-xl border ${tk.border} overflow-hidden ${tk.dark ? "bg-white/[0.03] bg-[url('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAGXRFWHRTb2Z0d2FyZQBBZG9iZSBJbWFnZVJlYWR5ccllPAAAABZJREFUeNpiYGBg+M9AAWAcVUihAIAAAP8ABmwBCP8AAAAASUVORK5CYII=')]" : "bg-black/[0.03]"} flex items-center justify-center min-h-[120px]`}>
                        <img src={selected.converted[0].url} alt="converted" className="max-h-40 max-w-full object-contain" />
                      </div>
                      <p className={`text-xs font-mono mt-2 ${tk.textFaint}`}>
                        {fmtSize(selected.converted[0].size)}
                        <span className={`ml-2 font-bold ${tk.textMuted}`}>{savings(selected.originalSize, selected.converted[0].size)}</span>
                      </p>
                    </div>
                  </div>
                ) : (
                  // Srcset variants table
                  <div className="overflow-x-auto mb-4">
                    <table className="w-full text-xs font-mono border-collapse">
                      <thead>
                        <tr className={`${tk.dark ? "bg-white/[0.04]" : "bg-black/[0.04]"}`}>
                          {["Breakpoint", "Dimensions", "Size", "Savings", ""].map((h) => (
                            <th key={h} className={`px-3 py-2 text-left font-semibold tracking-wide ${tk.textMuted} border-b ${tk.border}`}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {selected.converted.map((r, i) => {
                          const bp = breakpoints.find((b) => b.width === r.width);
                          return (
                            <tr key={i} className={`border-b ${tk.border}`}>
                              <td className={`px-3 py-2 ${tk.textMuted}`}>{bp?.label ?? r.width}</td>
                              <td className={`px-3 py-2 ${tk.textFaint}`}>{r.width}×{r.height}</td>
                              <td className={`px-3 py-2 ${tk.textFaint}`}>{fmtSize(r.size)}</td>
                              <td className={`px-3 py-2 font-bold ${tk.textMuted}`}>{savings(selected.originalSize, r.size)}</td>
                              <td className="px-3 py-2">
                                <button onClick={() => downloadResult(r, selected.file.name)}
                                  className={`px-2.5 py-1 rounded-lg border ${tk.border} ${tk.surface} ${tk.surfaceHv} ${tk.textFaint} transition-all duration-150`}>
                                  ↓
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Download single */}
                {selected.converted.length === 1 && (
                  <button onClick={() => downloadResult(selected.converted[0], selected.file.name)}
                    className={`px-5 py-2.5 rounded-xl text-sm font-semibold transition-all duration-150 ${tk.cta}`}>
                    ↓ Download {selected.converted[0].format.toUpperCase()}
                  </button>
                )}

                {/* srcset code snippet */}
                {srcsetString && (
                  <div className="mt-5">
                    <label className={labelCls}>HTML srcset snippet</label>
                    <pre className={`text-xs font-mono p-4 rounded-xl border ${tk.border} ${tk.dark ? "bg-white/[0.02]" : "bg-black/[0.02]"} ${tk.textMuted} overflow-x-auto`}>
{`<img
  src="image.${format}"
  srcset="
  ${srcsetString}
  "
  sizes="(max-width: 640px) 100vw,
         (max-width: 1024px) 50vw,
         33vw"
  alt="your alt text"
  loading="lazy"
/>`}
                    </pre>
                  </div>
                )}
              </div>
            )}

            {/* Converting state */}
            {selected?.converting && (
              <div className={`${sectionCls} flex items-center justify-center py-12`}>
                <div className="text-center">
                  <div className={`text-2xl mb-2 ${tk.textDim} animate-pulse`}>⊙</div>
                  <p className={`text-sm ${tk.textFaint}`}>Processing…</p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
