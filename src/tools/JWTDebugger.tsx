import { useState } from "react";
import { useTheme } from "../ThemeContext";
import { getTokens } from "../themeTokens";

interface JWTParts {
  header: Record<string, any>;
  payload: Record<string, any>;
  signature: string;
}
interface SecurityIssue {
  level: "error" | "warn" | "ok";
  msg: string;
}

function base64UrlDecode(str: string): string {
  const base64 = str.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  try {
    return decodeURIComponent(atob(padded).split("").map((c) => "%" + c.charCodeAt(0).toString(16).padStart(2, "0")).join(""));
  } catch { return atob(padded); }
}

function decodeJWT(token: string): { parts: JWTParts | null; error: string | null } {
  const parts = token.trim().split(".");
  if (parts.length !== 3) return { parts: null, error: "Invalid JWT — must have 3 parts (header.payload.signature)" };
  try {
    return { parts: { header: JSON.parse(base64UrlDecode(parts[0])), payload: JSON.parse(base64UrlDecode(parts[1])), signature: parts[2] }, error: null };
  } catch { return { parts: null, error: "Failed to decode JWT — malformed base64 or JSON" }; }
}

function getSecurityIssues(payload: Record<string, any>, header: Record<string, any>): SecurityIssue[] {
  const issues: SecurityIssue[] = [];
  const now = Math.floor(Date.now() / 1000);
  if (payload.exp && payload.exp < now) {
    const ago = Math.round((now - payload.exp) / 60);
    issues.push({ level: "error", msg: `Token expired ${ago} minute${ago !== 1 ? "s" : ""} ago` });
  } else if (payload.exp) {
    const inMin = Math.round((payload.exp - now) / 60);
    issues.push({ level: "ok", msg: `Expires in ${inMin} minute${inMin !== 1 ? "s" : ""}` });
  } else {
    issues.push({ level: "warn", msg: "No expiration (exp) — token never expires" });
  }
  if (payload.nbf && payload.nbf > now) issues.push({ level: "error", msg: "Token not yet valid — nbf claim is in the future" });
  if (header.alg === "none" || header.alg === "None") issues.push({ level: "error", msg: 'alg="none" — signature verification disabled' });
  else if (header.alg?.startsWith("HS")) issues.push({ level: "warn", msg: `Symmetric algorithm (${header.alg}) — guard your secret` });
  else if (header.alg?.startsWith("RS") || header.alg?.startsWith("ES")) issues.push({ level: "ok", msg: `Asymmetric algorithm (${header.alg})` });
  if (!payload.iss) issues.push({ level: "warn", msg: "Missing issuer (iss) claim" });
  if (!payload.sub) issues.push({ level: "warn", msg: "Missing subject (sub) claim" });
  if (!payload.aud) issues.push({ level: "warn", msg: "Missing audience (aud) claim" });
  return issues;
}

function formatTimestamp(val: number): string {
  return new Date(val * 1000).toLocaleString();
}

const SAMPLE_JWT = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c2VyXzEyMyIsIm5hbWUiOiJKYW5lIERvZSIsImlhdCI6MTcwMDAwMDAwMCwiZXhwIjoxNzAwMDM2MDAwLCJyb2xlcyI6WyJhZG1pbiIsImVkaXRvciJdfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c";
const DEFAULT_PAYLOAD = { sub: "user_123", name: "Jane Doe", iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 3600, roles: ["admin", "editor"] };

export default function JWTDebugger() {
  const { theme } = useTheme();
  const tk = getTokens(theme);
  const dark = tk.dark;

  const [token,      setToken]      = useState(SAMPLE_JWT);
  const [tab,        setTab]        = useState<"decode" | "generate">("decode");
  const [genPayload, setGenPayload] = useState(JSON.stringify(DEFAULT_PAYLOAD, null, 2));
  const [genSecret,  setGenSecret]  = useState("my-secret-key");
  const [genError,   setGenError]   = useState("");
  const [copied,     setCopied]     = useState(false);

  const { parts, error } = decodeJWT(token);

  const copy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const generateJWT = async () => {
    try {
      const payload = JSON.parse(genPayload);
      const encoder = new TextEncoder();
      const key = await crypto.subtle.importKey("raw", encoder.encode(genSecret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
      const encHeader  = btoa(JSON.stringify({ alg: "HS256", typ: "JWT" })).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
      const encPayload = btoa(JSON.stringify(payload)).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
      const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(`${encHeader}.${encPayload}`));
      const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
      setToken(`${encHeader}.${encPayload}.${sigB64}`);
      setTab("decode");
      setGenError("");
    } catch (e: any) { setGenError(e.message || "Generation failed"); }
  };

  // Security issue styles — use opacity tiers, no hue change
  const issueStyle = (level: SecurityIssue["level"]) => {
    if (level === "error") return dark
      ? "border-white/25 bg-white/[0.05] text-white/75"
      : "border-black/20 bg-black/[0.05] text-black/75";
    if (level === "warn") return dark
      ? "border-white/12 bg-white/[0.02] text-white/50"
      : "border-black/12 bg-black/[0.02] text-black/50";
    return dark
      ? "border-white/8 bg-white/[0.01] text-white/35"
      : "border-black/8 bg-black/[0.01] text-black/35";
  };

  const issueDot = (level: SecurityIssue["level"]) =>
    level === "error" ? (dark ? "bg-white/75" : "bg-black/65") :
    level === "warn"  ? (dark ? "bg-white/40" : "bg-black/35") :
                        (dark ? "bg-white/20" : "bg-black/18");

  const issueLabel = (level: SecurityIssue["level"]) =>
    level === "error" ? "ERR" : level === "warn" ? "WARN" : "OK";

  // JSON view
  const JsonView = ({ data }: { data: Record<string, any> }) => (
    <pre className={`text-sm font-mono leading-7 ${tk.textMuted} whitespace-pre-wrap break-all`}>
      {"{\n"}
      {Object.entries(data).map(([k, v], i, arr) => {
        const isTs = (k === "exp" || k === "iat" || k === "nbf") && typeof v === "number";
        return (
          <span key={k}>
            {"  "}
            <span className={tk.textFaint}>&quot;{k}&quot;</span>
            <span className={tk.textDim}>: </span>
            <span className={
              typeof v === "string"  ? (dark ? "text-white/80" : "text-black/80") :
              typeof v === "number"  ? (dark ? "text-white/70" : "text-black/70") :
              typeof v === "boolean" ? (dark ? "text-white/60" : "text-black/60") :
                                       (dark ? "text-white/55" : "text-black/55")
            }>
              {JSON.stringify(v)}
            </span>
            {isTs && <span className={`${tk.textDim} text-xs ml-3`}>// {formatTimestamp(v as number)}</span>}
            {i < arr.length - 1 ? "," : ""}
            {"\n"}
          </span>
        );
      })}
      {"}"}
    </pre>
  );

  return (
    <div className="flex flex-col gap-6">

      {/* Tab Toggle */}
      <div className={`flex gap-1 p-1 rounded-xl ${tk.surface} border ${tk.border} w-fit`}>
        {(["decode", "generate"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all duration-150 ${tab === t ? tk.tabActive : tk.tabInactive}`}>
            {t === "decode" ? "Decode & Verify" : "Generate JWT"}
          </button>
        ))}
      </div>

      {tab === "decode" ? (
        <>
          {/* Token Input */}
          <div>
            <div className="flex justify-between items-center mb-2">
              <label className={`text-xs font-semibold ${tk.textFaint} uppercase tracking-widest`}>JWT Token</label>
              <button onClick={() => setToken(SAMPLE_JWT)} className={`text-xs ${tk.textFaint} hover:${tk.textMuted} transition-colors`}>
                Load sample →
              </button>
            </div>
            <textarea
              rows={4}
              className={`w-full border rounded-xl p-4 text-sm font-mono focus:outline-none resize-none transition-all ${tk.inputBg}`}
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="Paste JWT token here..."
            />
          </div>

          {error ? (
            <div className={`${tk.surface} border ${tk.border} rounded-xl px-5 py-4 ${tk.textMuted} text-sm`}>{error}</div>
          ) : parts && (
            <>
              {/* Security Issues */}
              <div className="space-y-2">
                {getSecurityIssues(parts.payload, parts.header).map((issue, i) => (
                  <div key={i} className={`flex items-center gap-3 px-4 py-3 rounded-xl border text-sm ${issueStyle(issue.level)}`}>
                    <span className={`w-5 text-center text-xs font-bold font-mono shrink-0`}>{issueLabel(issue.level)}</span>
                    <span className={`w-px h-4 ${dark ? "bg-white/15" : "bg-black/15"} shrink-0`} />
                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${issueDot(issue.level)}`} />
                    <span>{issue.msg}</span>
                  </div>
                ))}
              </div>

              {/* Token Parts */}
              <div className="grid gap-3">
                {[
                  { label: "Header",  data: parts.header,  marker: "H" },
                  { label: "Payload", data: parts.payload, marker: "P" },
                ].map(({ label, data, marker }) => (
                  <div key={label} className={`${tk.surface} border ${tk.border} rounded-xl p-5`}>
                    <div className="flex items-center gap-3 mb-4">
                      <span className={`w-6 h-6 rounded border ${tk.border} ${dark ? "bg-white/[0.04]" : "bg-black/[0.04]"} ${tk.textFaint} text-xs flex items-center justify-center font-mono font-bold shrink-0`}>
                        {marker}
                      </span>
                      <span className={`text-xs font-semibold ${tk.textFaint} uppercase tracking-widest`}>{label}</span>
                    </div>
                    <JsonView data={data} />
                  </div>
                ))}

                <div className={`${tk.surface} border ${tk.border} rounded-xl p-5`}>
                  <div className="flex items-center gap-3 mb-3">
                    <span className={`w-6 h-6 rounded border ${tk.border} ${dark ? "bg-white/[0.04]" : "bg-black/[0.04]"} ${tk.textFaint} text-xs flex items-center justify-center font-mono font-bold shrink-0`}>S</span>
                    <span className={`text-xs font-semibold ${tk.textFaint} uppercase tracking-widest`}>Signature</span>
                  </div>
                  <p className={`${tk.textFaint} font-mono text-sm break-all leading-relaxed`}>{parts.signature}</p>
                </div>
              </div>

              <button
                onClick={() => copy(token)}
                className={`w-full py-2.5 rounded-xl border ${tk.border} ${tk.surface} ${tk.surfaceHv} ${tk.borderHv} ${tk.textFaint} hover:${tk.textMuted} text-sm font-medium transition-all duration-150`}
              >
                {copied ? "Copied!" : "Copy Token"}
              </button>
            </>
          )}
        </>
      ) : (
        <>
          <div>
            <label className={`text-xs font-semibold ${tk.textFaint} uppercase tracking-widest block mb-2`}>Payload (JSON)</label>
            <textarea
              rows={10}
              className={`w-full border rounded-xl p-4 text-sm font-mono focus:outline-none resize-none transition-all ${tk.inputBg}`}
              value={genPayload}
              onChange={(e) => setGenPayload(e.target.value)}
            />
          </div>

          <div>
            <label className={`text-xs font-semibold ${tk.textFaint} uppercase tracking-widest block mb-2`}>Signing Secret (HS256)</label>
            <input
              className={`w-full border rounded-xl px-4 py-3 text-sm font-mono focus:outline-none transition-all ${tk.inputBg}`}
              value={genSecret}
              onChange={(e) => setGenSecret(e.target.value)}
              placeholder="your-secret-key"
            />
          </div>

          {genError && (
            <div className={`${tk.surface} border ${tk.border} rounded-xl px-5 py-3 ${tk.textMuted} text-sm`}>{genError}</div>
          )}

          <button onClick={generateJWT} className={`w-full py-3 rounded-xl font-bold text-sm transition-all duration-150 ${tk.cta}`}>
            Generate JWT Token
          </button>
        </>
      )}
    </div>
  );
}
