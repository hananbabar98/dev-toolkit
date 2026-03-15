import { useState } from "react";
import { format } from "sql-formatter";
import { useTheme } from "../ThemeContext";
import { getTokens } from "../themeTokens";

const SAMPLE_SQL   = `SELECT u.id, u.name, u.email, COUNT(o.id) as order_count, SUM(o.total) as total_spent FROM users u LEFT JOIN orders o ON u.id = o.user_id WHERE u.created_at > '2023-01-01' AND u.status = 'active' GROUP BY u.id, u.name, u.email HAVING COUNT(o.id) > 0 ORDER BY total_spent DESC LIMIT 50;`;
const SAMPLE_SQL_2 = `SELECT p.name, p.price, c.name as category, COUNT(r.id) as review_count, AVG(r.rating) as avg_rating FROM products p INNER JOIN categories c ON p.category_id=c.id LEFT JOIN reviews r ON p.id=r.product_id WHERE p.price BETWEEN 10 AND 500 AND p.stock > 0 GROUP BY p.id, p.name, p.price, c.name HAVING AVG(r.rating) >= 4.0 OR COUNT(r.id) = 0 ORDER BY review_count DESC;`;

interface ExplainStep { step: number; operation: string; description: string; cost: "low" | "medium" | "high"; }
interface Suggestion  { type: "warning" | "tip" | "good"; msg: string; }

function explainQuery(sql: string): ExplainStep[] {
  const steps: ExplainStep[] = [];
  let step = 1;
  const tables      = [...sql.matchAll(/(?:FROM|JOIN)\s+([a-zA-Z_][a-zA-Z0-9_]*)/gi)].map((m) => m[1]);
  const hasWhere    = /WHERE/i.test(sql);
  const hasGroupBy  = /GROUP\s+BY/i.test(sql);
  const hasHaving   = /HAVING/i.test(sql);
  const hasOrderBy  = /ORDER\s+BY/i.test(sql);
  const hasLimit    = /LIMIT/i.test(sql);
  const hasSubquery = /\(SELECT/i.test(sql);
  const hasDistinct = /DISTINCT/i.test(sql);
  const hasAggregate = /\b(COUNT|SUM|AVG|MAX|MIN)\s*\(/i.test(sql);
  const joins       = [...sql.matchAll(/(LEFT|RIGHT|INNER|FULL|CROSS)?\s*JOIN/gi)];
  const fromMatch   = sql.match(/FROM\s+([a-zA-Z_][a-zA-Z0-9_]*)/i);

  if (fromMatch) steps.push({ step: step++, operation: `Full Table Scan — ${fromMatch[1]}`, description: `Read all rows from "${fromMatch[1]}". ${hasWhere ? "Rows filtered by WHERE." : "No WHERE — full scan."}`, cost: hasWhere ? "medium" : "high" });
  if (hasSubquery) steps.push({ step: step++, operation: "Subquery Execution", description: "Inner SELECT runs first. Result is materialized into a temp table for the outer query.", cost: "high" });
  joins.forEach((j, i) => { const type = j[1] || "INNER"; const tbl = tables[i + 1] || `table_${i + 1}`; steps.push({ step: step++, operation: `${type} JOIN — ${tbl}`, description: `Merge rows from "${tbl}". ${type === "LEFT" ? "All left rows kept." : type === "RIGHT" ? "All right rows kept." : "Only matching rows kept."}`, cost: "medium" }); });
  if (hasWhere)    steps.push({ step: step++, operation: "WHERE Filter", description: "Apply filter conditions. Indexed columns here improve performance significantly.", cost: "low" });
  if (hasDistinct) steps.push({ step: step++, operation: "DISTINCT Deduplication", description: "Remove duplicate rows. Requires sorting or hashing the entire result set.", cost: "medium" });
  if (hasGroupBy)  { const cols = sql.match(/GROUP\s+BY\s+([\w\s,\.]+?)(?:\s+HAVING|\s+ORDER|\s+LIMIT|$)/i)?.[1]?.trim(); steps.push({ step: step++, operation: "GROUP BY Aggregation", description: `Group by [${cols}]. ${hasAggregate ? "Aggregate functions computed per group." : "No aggregation."}`, cost: "medium" }); }
  if (hasHaving)   steps.push({ step: step++, operation: "HAVING Filter", description: "Filter groups post-aggregation. Can reference aggregate functions unlike WHERE.", cost: "low" });
  if (hasOrderBy)  { const cols = sql.match(/ORDER\s+BY\s+([\w\s,\.]+?)(?:\s+LIMIT|$)/i)?.[1]?.trim(); steps.push({ step: step++, operation: "ORDER BY Sort", description: `Sort by [${cols}]. Without an index, requires a full sort pass.`, cost: "medium" }); }
  if (hasLimit)    { const n = sql.match(/LIMIT\s+(\d+)/i)?.[1]; steps.push({ step: step++, operation: `LIMIT ${n}`, description: `Return only ${n} rows. Greatly reduces data sent to the client.`, cost: "low" }); }
  steps.push({ step: step++, operation: "Result Set Return", description: "Final rows serialized and returned to the client.", cost: "low" });
  return steps;
}

function getSuggestions(sql: string): Suggestion[] {
  const suggestions: Suggestion[] = [];
  const u = sql.toUpperCase();
  if (!u.includes("WHERE"))     suggestions.push({ type: "warning", msg: "No WHERE clause — full table scan on every execution." });
  if (u.includes("SELECT *"))   suggestions.push({ type: "warning", msg: "Avoid SELECT * — specify only needed columns to reduce I/O." });
  if (!u.includes("LIMIT") && !u.includes("TOP")) suggestions.push({ type: "tip", msg: "Add LIMIT to cap accidental large result sets." });
  if (u.includes("OR "))        suggestions.push({ type: "tip", msg: "OR conditions can prevent index usage. Consider UNION or IN() instead." });
  if (u.includes("LIKE '%"))    suggestions.push({ type: "warning", msg: "Leading wildcard LIKE '%...' disables index scans — use full-text search." });
  if ((u.match(/JOIN/g) || []).length > 3) suggestions.push({ type: "warning", msg: "4+ JOINs detected — ensure indexes exist on all join columns." });
  if (u.includes("DISTINCT"))   suggestions.push({ type: "tip", msg: "DISTINCT is expensive. Check if joins are causing duplicates instead." });
  if (u.includes("NOT IN"))     suggestions.push({ type: "tip", msg: "NOT IN is slow on large subqueries. Try NOT EXISTS or LEFT JOIN / IS NULL." });
  if (u.includes("HAVING") && !u.includes("GROUP BY")) suggestions.push({ type: "warning", msg: "HAVING without GROUP BY is unusual — did you mean WHERE?" });
  if (u.includes("ORDER BY") && !u.includes("LIMIT")) suggestions.push({ type: "tip", msg: "ORDER BY without LIMIT sorts the entire result. Add LIMIT if you need top-N." });
  if (u.includes("COUNT(*)"))   suggestions.push({ type: "good", msg: "COUNT(*) is efficient — optimizer handles it without reading column data." });
  if (suggestions.length === 0) suggestions.push({ type: "good", msg: "No obvious issues found. Query looks solid!" });
  return suggestions;
}

const DIALECTS = ["sql", "mysql", "postgresql", "sqlite", "tsql", "bigquery"] as const;

export default function SQLFormatter() {
  const { theme } = useTheme();
  const tk = getTokens(theme);
  const dark = tk.dark;

  const [input,     setInput]     = useState(SAMPLE_SQL);
  const [formatted, setFormatted] = useState("");
  const [dialect,   setDialect]   = useState<(typeof DIALECTS)[number]>("postgresql");
  const [error,     setError]     = useState("");
  const [tab,       setTab]       = useState<"formatted" | "explain" | "suggestions">("formatted");
  const [copied,    setCopied]    = useState(false);

  const src = formatted || input;
  const explainSteps = src ? explainQuery(src) : [];
  const suggestions  = src ? getSuggestions(src) : [];
  const warnCount    = suggestions.filter((s) => s.type === "warning").length;

  const formatSQL = () => {
    try {
      setFormatted(format(input, { language: dialect, tabWidth: 2, keywordCase: "upper" }));
      setError(""); setTab("formatted");
    } catch (e: any) { setError(e.message || "Failed to format SQL"); }
  };

  const copy = () => {
    navigator.clipboard.writeText(formatted || input);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  // Cost badge — opacity tiers, no hue
  const costBadge = (cost: "low" | "medium" | "high") => {
    if (cost === "high")   return dark ? "border-white/25 text-white/55" : "border-black/22 text-black/55";
    if (cost === "medium") return dark ? "border-white/14 text-white/38" : "border-black/14 text-black/38";
    return dark ? "border-white/8 text-white/22" : "border-black/8 text-black/22";
  };

  // Suggestion row
  const suggStyle = (type: Suggestion["type"]) => {
    if (type === "warning") return dark ? "border-white/22 bg-white/[0.04] text-white/70"  : "border-black/18 bg-black/[0.04] text-black/70";
    if (type === "tip")     return dark ? "border-white/10 bg-white/[0.02] text-white/48"  : "border-black/10 bg-black/[0.02] text-black/48";
    return dark ? "border-white/7 bg-white/[0.01] text-white/30" : "border-black/7 bg-black/[0.01] text-black/30";
  };
  const suggLabel = (type: Suggestion["type"]) =>
    type === "warning" ? "WARN" : type === "tip" ? "TIP" : "GOOD";

  return (
    <div className="flex flex-col gap-6">

      {/* Controls Row */}
      <div className="flex flex-wrap items-end gap-4">
        <div>
          <label className={`text-xs font-semibold ${tk.textFaint} uppercase tracking-widest block mb-2`}>Dialect</label>
          <select
            value={dialect}
            onChange={(e) => setDialect(e.target.value as any)}
            className={`border rounded-lg px-4 py-2.5 text-sm focus:outline-none transition-all appearance-none cursor-pointer ${tk.inputBg} ${tk.selectBg}`}
          >
            {DIALECTS.map((d) => (
              <option key={d} value={d} className={dark ? "bg-black text-white" : "bg-white text-black"}>
                {d.toUpperCase()}
              </option>
            ))}
          </select>
        </div>

        <div className="flex gap-2">
          {[{ label: "Sample 1", sql: SAMPLE_SQL }, { label: "Sample 2", sql: SAMPLE_SQL_2 }].map(({ label, sql }) => (
            <button key={label} onClick={() => { setInput(sql); setFormatted(""); }}
              className={`px-3 py-2.5 text-xs rounded-lg ${tk.surface} ${tk.surfaceHv} ${tk.textFaint} border ${tk.border} ${tk.borderHv} transition-all`}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Input */}
      <div>
        <label className={`text-xs font-semibold ${tk.textFaint} uppercase tracking-widest block mb-2`}>Input SQL</label>
        <textarea
          rows={6}
          className={`w-full border rounded-xl p-4 text-sm font-mono focus:outline-none resize-y transition-all ${tk.inputBg}`}
          value={input}
          onChange={(e) => { setInput(e.target.value); setFormatted(""); }}
          placeholder="Paste your SQL query here..."
        />
      </div>

      {/* Format Button */}
      <button onClick={formatSQL} className={`w-full py-3 rounded-xl font-bold text-sm transition-all duration-150 ${tk.cta}`}>
        Format & Analyze
      </button>

      {error && (
        <div className={`${tk.surface} border ${tk.border} rounded-xl px-5 py-4 ${tk.textMuted} text-sm`}>{error}</div>
      )}

      {/* Output Tabs */}
      {(formatted || (!error && input)) && (
        <>
          <div className={`flex gap-1 p-1 rounded-xl ${tk.surface} border ${tk.border} w-fit`}>
            {(["formatted", "explain", "suggestions"] as const).map((t) => (
              <button key={t} onClick={() => setTab(t)}
                className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all duration-150 flex items-center gap-2 ${tab === t ? tk.tabActive : tk.tabInactive}`}>
                {t === "formatted" ? "Formatted" : t === "explain" ? "Execution Plan" : "Suggestions"}
                {t === "suggestions" && warnCount > 0 && (
                  <span className={`text-xs font-mono px-1.5 py-0.5 rounded ${tab === t ? (dark ? "bg-white/15 text-black/60" : "bg-black/12 text-white/60") : (dark ? "bg-white/10 text-white/40" : "bg-black/10 text-black/40")}`}>
                    {warnCount}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Formatted Tab */}
          {tab === "formatted" && (
            <div className="relative">
              <div className={`${tk.surface} border ${tk.border} rounded-xl p-5 overflow-auto max-h-96`}>
                <pre className={`text-sm font-mono ${dark ? "text-white/65" : "text-black/65"} whitespace-pre-wrap leading-relaxed`}>{formatted || input}</pre>
              </div>
              <button onClick={copy}
                className={`absolute top-4 right-4 px-3 py-1.5 ${tk.surface} ${tk.surfaceHv} border ${tk.border} ${tk.borderHv} rounded-lg text-xs ${tk.textFaint} hover:${tk.textMuted} transition-all`}>
                {copied ? "Copied!" : "Copy"}
              </button>
            </div>
          )}

          {/* Explain Tab */}
          {tab === "explain" && (
            <div className="space-y-2">
              {explainSteps.map((s, idx) => (
                <div key={s.step} className={`flex gap-4 items-start ${tk.surface} border ${tk.border} rounded-xl p-4`}>
                  <div className="flex flex-col items-center gap-0 shrink-0">
                    <div className={`w-7 h-7 rounded-lg border ${tk.border} ${dark ? "bg-white/[0.03]" : "bg-black/[0.03]"} flex items-center justify-center text-xs font-mono font-bold ${tk.textFaint}`}>
                      {s.step}
                    </div>
                    {idx < explainSteps.length - 1 && (
                      <div className={`w-px h-3 ${dark ? "bg-white/8" : "bg-black/8"} mt-1`} />
                    )}
                  </div>
                  <div className="flex-1 min-w-0 pt-0.5">
                    <div className="flex items-center gap-3 mb-1.5 flex-wrap">
                      <span className={`text-sm font-semibold ${dark ? "text-white/75" : "text-black/75"}`}>{s.operation}</span>
                      <span className={`ml-auto text-xs px-2 py-0.5 rounded border font-mono ${costBadge(s.cost)}`}>{s.cost}</span>
                    </div>
                    <p className={`${tk.textFaint} text-sm leading-relaxed`}>{s.description}</p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Suggestions Tab */}
          {tab === "suggestions" && (
            <div className="space-y-2">
              {suggestions.map((s, i) => (
                <div key={i} className={`flex items-start gap-4 px-5 py-4 rounded-xl border text-sm ${suggStyle(s.type)}`}>
                  <span className={`shrink-0 text-xs font-bold font-mono px-2 py-0.5 rounded border ${
                    s.type === "warning" ? (dark ? "border-white/22 text-white/55" : "border-black/20 text-black/55") :
                    s.type === "tip"     ? (dark ? "border-white/12 text-white/38" : "border-black/12 text-black/38") :
                                           (dark ? "border-white/8  text-white/24" : "border-black/8  text-black/24")
                  }`}>
                    {suggLabel(s.type)}
                  </span>
                  <span className="leading-relaxed">{s.msg}</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
