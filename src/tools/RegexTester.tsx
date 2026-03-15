import { useState, useMemo } from "react";
import { useTheme } from "../ThemeContext";
import { getTokens } from "../themeTokens";

interface RegexToken {
  type: "literal" | "quantifier" | "anchor" | "group" | "charclass" | "alternation" | "escape" | "flag" | "dot" | "lookahead" | "backreference";
  value: string;
  description: string;
  color: string; // token "slot" 0-7 for theming
}

const COMMON_PATTERNS = [
  { name: "Email", pattern: "^[a-zA-Z0-9._%+\\-]+@[a-zA-Z0-9.\\-]+\\.[a-zA-Z]{2,}$", flags: "i", description: "Validates email addresses" },
  { name: "URL", pattern: "https?:\\/\\/(www\\.)?[-a-zA-Z0-9@:%._\\+~#=]{1,256}\\.[a-zA-Z0-9()]{1,6}\\b([-a-zA-Z0-9()@:%_\\+.~#?&\\/=]*)", flags: "gi", description: "Matches http/https URLs" },
  { name: "IPv4", pattern: "\\b((25[0-5]|2[0-4]\\d|[01]?\\d\\d?)\\.){3}(25[0-5]|2[0-4]\\d|[01]?\\d\\d?)\\b", flags: "g", description: "Matches valid IPv4 addresses" },
  { name: "Phone (US)", pattern: "\\(?\\d{3}\\)?[\\s.\\-]?\\d{3}[\\s.\\-]?\\d{4}", flags: "g", description: "US phone number formats" },
  { name: "Hex Color", pattern: "#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})\\b", flags: "g", description: "Hex color codes" },
  { name: "Date (YYYY-MM-DD)", pattern: "\\b(\\d{4})-(0[1-9]|1[0-2])-(0[1-9]|[12]\\d|3[01])\\b", flags: "g", description: "ISO 8601 date format" },
  { name: "Slug", pattern: "^[a-z0-9]+(?:-[a-z0-9]+)*$", flags: "", description: "URL-friendly slug" },
  { name: "JWT", pattern: "^[A-Za-z0-9\\-_]+\\.[A-Za-z0-9\\-_]+\\.[A-Za-z0-9\\-_]*$", flags: "", description: "JSON Web Token structure" },
  { name: "Semver", pattern: "^(0|[1-9]\\d*)\\.(0|[1-9]\\d*)\\.(0|[1-9]\\d*)(?:-((?:0|[1-9]\\d*|\\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\\.(?:0|[1-9]\\d*|\\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\\+([0-9a-zA-Z-]+(?:\\.[0-9a-zA-Z-]+)*))?$", flags: "", description: "Semantic version number" },
  { name: "Credit Card", pattern: "^(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14}|3[47][0-9]{13}|3(?:0[0-5]|[68][0-9])[0-9]{11}|6(?:011|5[0-9]{2})[0-9]{12})$", flags: "", description: "Major credit card numbers" },
  { name: "HTML Tag", pattern: "<([a-z][\\w\\-]*)(?:\\s+[^>]*)?>.*?<\\/\\1>|<([a-z][\\w\\-]*)(?:\\s+[^>]*)?\\/>", flags: "gis", description: "HTML tags (simple)" },
  { name: "UUID", pattern: "[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}", flags: "gi", description: "UUID v1-v5" },
];

function tokenizeRegex(pattern: string): RegexToken[] {
  const tokens: RegexToken[] = [];
  let i = 0;

  while (i < pattern.length) {
    const ch = pattern[i];

    // Anchors
    if (ch === "^") {
      tokens.push({ type: "anchor", value: "^", description: "Start of string (or line with m flag)", color: "0" });
      i++; continue;
    }
    if (ch === "$") {
      tokens.push({ type: "anchor", value: "$", description: "End of string (or line with m flag)", color: "0" });
      i++; continue;
    }
    if (ch === "\\b") {
      tokens.push({ type: "anchor", value: "\\b", description: "Word boundary", color: "0" });
      i += 2; continue;
    }
    if (ch === "\\B") {
      tokens.push({ type: "anchor", value: "\\B", description: "Non-word boundary", color: "0" });
      i += 2; continue;
    }

    // Dot
    if (ch === ".") {
      tokens.push({ type: "dot", value: ".", description: "Any character except newline", color: "1" });
      i++; continue;
    }

    // Alternation
    if (ch === "|") {
      tokens.push({ type: "alternation", value: "|", description: "Alternation — match left OR right", color: "2" });
      i++; continue;
    }

    // Escape sequences
    if (ch === "\\" && i + 1 < pattern.length) {
      const next = pattern[i + 1];
      const escMap: Record<string, string> = {
        d: "Digit [0-9]", D: "Non-digit [^0-9]",
        w: "Word char [a-zA-Z0-9_]", W: "Non-word char",
        s: "Whitespace", S: "Non-whitespace",
        n: "Newline", r: "Carriage return", t: "Tab",
        b: "Word boundary", B: "Non-word boundary",
      };
      if (escMap[next]) {
        tokens.push({ type: "escape", value: `\\${next}`, description: escMap[next], color: "3" });
      } else {
        tokens.push({ type: "escape", value: `\\${next}`, description: `Escaped literal "${next}"`, color: "3" });
      }
      i += 2; continue;
    }

    // Character class [...]
    if (ch === "[") {
      let end = i + 1;
      if (pattern[end] === "^") end++;
      while (end < pattern.length && pattern[end] !== "]") {
        if (pattern[end] === "\\") end++;
        end++;
      }
      const val = pattern.slice(i, end + 1);
      const negated = val[1] === "^";
      tokens.push({
        type: "charclass",
        value: val,
        description: negated ? `Character class — any char NOT in: ${val.slice(2, -1)}` : `Character class — any one of: ${val.slice(1, -1)}`,
        color: "4",
      });
      i = end + 1; continue;
    }

    // Groups (...)
    if (ch === "(") {
      let depth = 1;
      let j = i + 1;
      let groupType = "Capturing group";
      if (pattern[j] === "?" && pattern[j + 1] === ":") { groupType = "Non-capturing group"; }
      else if (pattern[j] === "?" && pattern[j + 1] === "=") { groupType = "Positive lookahead"; }
      else if (pattern[j] === "?" && pattern[j + 1] === "!") { groupType = "Negative lookahead"; }
      else if (pattern[j] === "?" && pattern[j + 1] === "<" && pattern[j + 2] === "=") { groupType = "Positive lookbehind"; }
      else if (pattern[j] === "?" && pattern[j + 1] === "<" && pattern[j + 2] === "!") { groupType = "Negative lookbehind"; }
      while (j < pattern.length && depth > 0) {
        if (pattern[j] === "\\") { j++; }
        else if (pattern[j] === "(") depth++;
        else if (pattern[j] === ")") depth--;
        j++;
      }
      tokens.push({ type: "group", value: pattern.slice(i, j), description: groupType, color: "5" });
      i = j; continue;
    }

    // Quantifiers
    if ("*+?".includes(ch)) {
      const qMap: Record<string, string> = {
        "*": "Zero or more times (greedy)",
        "+": "One or more times (greedy)",
        "?": "Zero or one time (optional)",
      };
      const isLazy = pattern[i + 1] === "?";
      tokens.push({
        type: "quantifier",
        value: isLazy ? ch + "?" : ch,
        description: isLazy ? qMap[ch].replace("greedy", "lazy") : qMap[ch],
        color: "6",
      });
      i += isLazy ? 2 : 1; continue;
    }
    if (ch === "{") {
      const end = pattern.indexOf("}", i);
      if (end !== -1) {
        const val = pattern.slice(i, end + 1);
        const parts = val.slice(1, -1).split(",");
        let desc = "";
        if (parts.length === 1) desc = `Exactly ${parts[0]} times`;
        else if (parts[1] === "") desc = `At least ${parts[0]} times`;
        else desc = `Between ${parts[0]} and ${parts[1]} times`;
        const isLazy = pattern[end + 1] === "?";
        tokens.push({ type: "quantifier", value: isLazy ? val + "?" : val, description: desc + (isLazy ? " (lazy)" : " (greedy)"), color: "6" });
        i = end + (isLazy ? 2 : 1); continue;
      }
    }

    // Literal
    tokens.push({ type: "literal", value: ch, description: `Literal character "${ch}"`, color: "7" });
    i++;
  }

  return tokens;
}

const TOKEN_DARK_COLORS: Record<string, string> = {
  "0": "text-white/90 bg-white/[0.08] border-white/15",   // anchors
  "1": "text-white/90 bg-white/[0.06] border-white/12",   // dot
  "2": "text-white/90 bg-white/[0.05] border-white/10",   // alternation
  "3": "text-white/85 bg-white/[0.07] border-white/12",   // escape
  "4": "text-white/90 bg-white/[0.09] border-white/15",   // charclass
  "5": "text-white/90 bg-white/[0.06] border-white/12",   // group
  "6": "text-white/90 bg-white/[0.10] border-white/18",   // quantifier
  "7": "text-white/70 bg-white/[0.03] border-white/8",    // literal
};
const TOKEN_LIGHT_COLORS: Record<string, string> = {
  "0": "text-black/90 bg-black/[0.08] border-black/15",
  "1": "text-black/90 bg-black/[0.06] border-black/12",
  "2": "text-black/90 bg-black/[0.05] border-black/10",
  "3": "text-black/85 bg-black/[0.07] border-black/12",
  "4": "text-black/90 bg-black/[0.09] border-black/15",
  "5": "text-black/90 bg-black/[0.06] border-black/12",
  "6": "text-black/90 bg-black/[0.10] border-black/18",
  "7": "text-black/70 bg-black/[0.03] border-black/8",
};

export default function RegexTester() {
  const { theme } = useTheme();
  const tk = getTokens(theme);
  const dark = tk.dark;

  const [pattern, setPattern] = useState("^[a-zA-Z0-9._%+\\-]+@[a-zA-Z0-9.\\-]+\\.[a-zA-Z]{2,}$");
  const [flags, setFlags] = useState("i");
  const [testText, setTestText] = useState(
    `hello@example.com
invalid-email
user.name+tag@company.co.uk
not an email
admin@sub.domain.org
@missing.com
test@`
  );
  const [hoveredToken, setHoveredToken] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<"visualize" | "matches" | "patterns">("visualize");

  const tokenColors = dark ? TOKEN_DARK_COLORS : TOKEN_LIGHT_COLORS;

  const tokens = useMemo(() => {
    try { return tokenizeRegex(pattern); } catch { return []; }
  }, [pattern]);

  const { regex, error: regexError, matches } = useMemo(() => {
    try {
      const f = flags.includes("g") ? flags : flags + "g";
      const r = new RegExp(pattern, f);
      const lines = testText.split("\n");
      const matchList: { line: number; text: string; match: string; index: number; groups: string[] }[] = [];

      for (let li = 0; li < lines.length; li++) {
        const line = lines[li];
        r.lastIndex = 0;
        let m: RegExpExecArray | null;
        while ((m = r.exec(line)) !== null) {
          matchList.push({
            line: li + 1,
            text: line,
            match: m[0],
            index: m.index,
            groups: m.slice(1).filter(Boolean),
          });
          if (!f.includes("g")) break;
        }
      }
      return { regex: r, error: null, matches: matchList };
    } catch (e) {
      return { regex: null, error: (e as Error).message, matches: [] };
    }
  }, [pattern, flags, testText]);

  // Highlight test text
  const highlightedLines = useMemo(() => {
    if (!regex || regexError) return testText.split("\n").map(l => [{ text: l, highlighted: false }]);
    return testText.split("\n").map(line => {
      const segments: { text: string; highlighted: boolean }[] = [];
      const r = new RegExp(pattern, flags.includes("g") ? flags : flags + "g");
      r.lastIndex = 0;
      let last = 0;
      let m: RegExpExecArray | null;
      while ((m = r.exec(line)) !== null) {
        if (m.index > last) segments.push({ text: line.slice(last, m.index), highlighted: false });
        segments.push({ text: m[0], highlighted: true });
        last = m.index + m[0].length;
        if (!flags.includes("g")) break;
      }
      if (last < line.length) segments.push({ text: line.slice(last), highlighted: false });
      if (segments.length === 0) segments.push({ text: line, highlighted: false });
      return segments;
    });
  }, [regex, pattern, flags, testText, regexError]);

  const allFlags = ["g", "i", "m", "s", "u"];
  const flagDesc: Record<string, string> = {
    g: "Global — find all matches",
    i: "Case insensitive",
    m: "Multiline — ^ and $ match line boundaries",
    s: "Dotall — dot matches newlines",
    u: "Unicode mode",
  };

  return (
    <div className="space-y-5">
      {/* Pattern input */}
      <div className={`border rounded-2xl ${tk.border} ${tk.surface} overflow-hidden`}>
        <div className={`flex items-center gap-3 px-5 py-4 border-b ${tk.border}`}>
          <span className={`text-lg font-mono font-bold ${tk.textFaint}`}>/</span>
          <input
            value={pattern}
            onChange={e => setPattern(e.target.value)}
            className={`flex-1 bg-transparent outline-none font-mono text-sm ${tk.text}`}
            placeholder="Enter regex pattern…"
            spellCheck={false}
          />
          <span className={`text-lg font-mono font-bold ${tk.textFaint}`}>/</span>
          <input
            value={flags}
            onChange={e => setFlags(e.target.value.replace(/[^gimsuy]/g, ""))}
            className={`w-16 bg-transparent outline-none font-mono text-sm ${tk.textMuted} border-l ${tk.border} pl-3`}
            placeholder="flags"
            spellCheck={false}
            maxLength={6}
          />
        </div>

        {/* Flags */}
        <div className={`flex items-center gap-1.5 px-5 py-3 border-b ${tk.border}`}>
          <span className={`text-xs ${tk.textDim} mr-1 tracking-widest uppercase font-semibold`}>Flags:</span>
          {allFlags.map(f => (
            <button
              key={f}
              title={flagDesc[f]}
              onClick={() => setFlags(prev => prev.includes(f) ? prev.replace(f, "") : prev + f)}
              className={`text-xs font-mono px-2.5 py-1 rounded-lg border transition-all ${
                flags.includes(f) ? tk.tabActive : `${tk.border} ${tk.surface} ${tk.surfaceHv} ${tk.textFaint}`
              }`}
            >
              {f}
            </button>
          ))}

          <div className="flex-1" />
          {regexError ? (
            <span className={`text-xs ${dark ? "text-red-400" : "text-red-600"}`}>✕ {regexError}</span>
          ) : (
            <span className={`text-xs ${tk.textFaint}`}>
              {matches.length} match{matches.length !== 1 ? "es" : ""}
            </span>
          )}
        </div>

        {/* Tabs */}
        <div className={`flex gap-1 px-5 py-3 border-b ${tk.border}`}>
          {(["visualize", "matches", "patterns"] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold capitalize transition-all ${activeTab === tab ? tk.tabActive : tk.tabInactive}`}
            >
              {tab === "visualize" ? "Visualizer" : tab === "matches" ? "Matches" : "Pattern Library"}
            </button>
          ))}
        </div>

        {/* Tab content */}
        {activeTab === "visualize" && (
          <div className="px-5 py-4 space-y-4">
            <div>
              <div className={`text-xs tracking-widest uppercase font-semibold mb-3 ${tk.textDim}`}>Token Breakdown</div>
              <div className="flex flex-wrap gap-1.5">
                {tokens.map((token, i) => (
                  <div
                    key={i}
                    className="relative group"
                    onMouseEnter={() => setHoveredToken(i)}
                    onMouseLeave={() => setHoveredToken(null)}
                  >
                    <span className={`inline-block px-2 py-1 rounded-lg border text-xs font-mono cursor-default transition-all ${tokenColors[token.color]}`}>
                      {token.value}
                    </span>
                    {hoveredToken === i && (
                      <div className={`absolute bottom-full left-0 mb-2 z-20 px-3 py-2 rounded-xl border text-xs whitespace-nowrap shadow-xl ${dark ? "bg-black border-white/15 text-white/80" : "bg-white border-black/10 text-black/70"}`}>
                        <div className={`font-semibold mb-0.5 capitalize ${tk.text}`}>{token.type}</div>
                        {token.description}
                      </div>
                    )}
                  </div>
                ))}
                {tokens.length === 0 && <span className={`text-sm ${tk.textDim}`}>Enter a pattern above…</span>}
              </div>
            </div>

            <div>
              <div className={`text-xs tracking-widest uppercase font-semibold mb-3 ${tk.textDim}`}>Token Legend</div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {[
                  { label: "Anchor", color: "0", ex: "^ $" },
                  { label: "Any Char", color: "1", ex: "." },
                  { label: "Alternation", color: "2", ex: "|" },
                  { label: "Escape", color: "3", ex: "\\d \\w" },
                  { label: "Char Class", color: "4", ex: "[a-z]" },
                  { label: "Group", color: "5", ex: "(...)" },
                  { label: "Quantifier", color: "6", ex: "+ * {n}" },
                  { label: "Literal", color: "7", ex: "abc" },
                ].map(({ label, color, ex }) => (
                  <div key={label} className={`flex items-center gap-2 px-2.5 py-2 rounded-lg border ${tokenColors[color]}`}>
                    <span className="text-xs font-mono">{ex}</span>
                    <span className={`text-xs ${tk.textMuted}`}>{label}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {activeTab === "matches" && (
          <div className="px-5 py-4">
            <div className={`text-xs tracking-widest uppercase font-semibold mb-3 ${tk.textDim}`}>Match Details</div>
            {matches.length === 0 ? (
              <p className={`text-sm ${tk.textFaint}`}>{regexError ? "Invalid pattern" : "No matches found"}</p>
            ) : (
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {matches.map((m, i) => (
                  <div key={i} className={`flex items-start gap-3 px-3 py-2.5 rounded-xl border ${tk.border} ${tk.surface} text-xs`}>
                    <span className={`font-mono font-bold ${tk.textDim} w-4 shrink-0`}>{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <code className={`font-mono ${tk.text}`}>"{m.match}"</code>
                      <span className={`ml-2 ${tk.textDim}`}>line {m.line}, pos {m.index}</span>
                      {m.groups.length > 0 && (
                        <div className={`mt-1 ${tk.textFaint}`}>Groups: {m.groups.map((g, gi) => <code key={gi} className="mr-2">#{gi + 1}: "{g}"</code>)}</div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === "patterns" && (
          <div className="px-5 py-4">
            <div className={`text-xs tracking-widest uppercase font-semibold mb-3 ${tk.textDim}`}>Common Pattern Library</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {COMMON_PATTERNS.map(p => (
                <button
                  key={p.name}
                  onClick={() => { setPattern(p.pattern); setFlags(p.flags); }}
                  className={`text-left px-3 py-2.5 rounded-xl border ${tk.border} ${tk.surface} ${tk.surfaceHv} transition-all`}
                >
                  <div className={`text-xs font-semibold ${tk.text} mb-0.5`}>{p.name}</div>
                  <div className={`text-xs ${tk.textFaint} truncate`}>{p.description}</div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Test text */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="space-y-2">
          <div className={`text-xs tracking-widest uppercase font-semibold ${tk.textDim}`}>Test Input</div>
          <textarea
            value={testText}
            onChange={e => setTestText(e.target.value)}
            className={`w-full h-52 border rounded-xl px-4 py-3 text-sm font-mono outline-none resize-none transition-all ${tk.inputBg} leading-relaxed`}
            spellCheck={false}
            placeholder="Enter test strings, one per line…"
          />
        </div>

        <div className="space-y-2">
          <div className={`flex items-center justify-between`}>
            <div className={`text-xs tracking-widest uppercase font-semibold ${tk.textDim}`}>Match Highlighting</div>
            <span className={`text-xs ${tk.textFaint}`}>{matches.length} match{matches.length !== 1 ? "es" : ""}</span>
          </div>
          <div className={`w-full h-52 border rounded-xl px-4 py-3 text-sm font-mono overflow-auto leading-relaxed ${dark ? "bg-white/[0.02] border-white/10" : "bg-black/[0.02] border-black/10"}`}>
            {highlightedLines.map((segments, li) => (
              <div key={li}>
                {segments.map((seg, si) =>
                  seg.highlighted ? (
                    <mark
                      key={si}
                      className={`rounded px-0.5 ${dark ? "bg-white text-black" : "bg-black text-white"}`}
                    >
                      {seg.text}
                    </mark>
                  ) : (
                    <span key={si} className={tk.textMuted}>{seg.text}</span>
                  )
                )}
                {li < highlightedLines.length - 1 && <br />}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
