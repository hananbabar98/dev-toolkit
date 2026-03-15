import { useState, useCallback, useMemo } from "react";
import { useTheme } from "../ThemeContext";
import { getTokens } from "../themeTokens";

// ── Types ────────────────────────────────────────────────────────────────────
type InputFormat = "csv" | "json";
type OperationType = "filter" | "map" | "groupBy" | "sort" | "limit" | "pick";

interface Operation {
  id: string;
  type: OperationType;
  config: Record<string, string>;
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function parseCsv(raw: string): Record<string, string>[] {
  const lines = raw.trim().split("\n").filter(Boolean);
  if (!lines.length) return [];
  const headers = lines[0].split(",").map((h) => h.trim().replace(/^"|"$/g, ""));
  return lines.slice(1).map((line) => {
    const vals = line.split(",").map((v) => v.trim().replace(/^"|"$/g, ""));
    const row: Record<string, string> = {};
    headers.forEach((h, i) => (row[h] = vals[i] ?? ""));
    return row;
  });
}

function parseInput(raw: string, fmt: InputFormat): { data: Record<string, string>[]; error: string } {
  try {
    if (!raw.trim()) return { data: [], error: "" };
    if (fmt === "csv") {
      return { data: parseCsv(raw), error: "" };
    } else {
      const parsed = JSON.parse(raw);
      const arr = Array.isArray(parsed) ? parsed : [parsed];
      return { data: arr, error: "" };
    }
  } catch (e: unknown) {
    return { data: [], error: (e as Error).message };
  }
}

function applyOperation(data: Record<string, string>[], op: Operation): { data: Record<string, string>[]; error: string } {
  try {
    switch (op.type) {
      case "filter": {
        const { field, operator, value } = op.config;
        if (!field) return { data, error: "" };
        return {
          data: data.filter((row) => {
            const v = String(row[field] ?? "");
            if (operator === "equals") return v === value;
            if (operator === "contains") return v.toLowerCase().includes((value ?? "").toLowerCase());
            if (operator === "startsWith") return v.toLowerCase().startsWith((value ?? "").toLowerCase());
            if (operator === "gt") return parseFloat(v) > parseFloat(value ?? "0");
            if (operator === "lt") return parseFloat(v) < parseFloat(value ?? "0");
            if (operator === "notEmpty") return v.trim() !== "";
            return true;
          }),
          error: "",
        };
      }
      case "map": {
        const { newField, expression } = op.config;
        if (!newField || !expression) return { data, error: "" };
        return {
          data: data.map((row) => {
            try {
              // Safe eval-like: replace field names with their values
              let expr = expression;
              Object.keys(row).forEach((k) => {
                expr = expr.replace(new RegExp(`\\b${k}\\b`, "g"), JSON.stringify(row[k]));
              });
              // Allow simple arithmetic and string ops
              // eslint-disable-next-line no-new-func
              const result = new Function(`"use strict"; return (${expr})`)();
              return { ...row, [newField]: String(result) };
            } catch {
              return { ...row, [newField]: "#ERR" };
            }
          }),
          error: "",
        };
      }
      case "groupBy": {
        const { field, aggregate, aggField } = op.config;
        if (!field) return { data, error: "" };
        const groups: Record<string, Record<string, string>[]> = {};
        data.forEach((row) => {
          const key = String(row[field] ?? "null");
          if (!groups[key]) groups[key] = [];
          groups[key].push(row);
        });
        return {
          data: Object.entries(groups).map(([key, rows]) => {
            const result: Record<string, string> = { [field]: key, count: String(rows.length) };
            if (aggField && aggregate) {
              const nums = rows.map((r) => parseFloat(r[aggField] ?? "0")).filter((n) => !isNaN(n));
              if (aggregate === "sum") result[`sum_${aggField}`] = String(nums.reduce((a, b) => a + b, 0));
              if (aggregate === "avg") result[`avg_${aggField}`] = String(nums.reduce((a, b) => a + b, 0) / (nums.length || 1));
              if (aggregate === "min") result[`min_${aggField}`] = String(Math.min(...nums));
              if (aggregate === "max") result[`max_${aggField}`] = String(Math.max(...nums));
            }
            return result;
          }),
          error: "",
        };
      }
      case "sort": {
        const { field, direction } = op.config;
        if (!field) return { data, error: "" };
        const sorted = [...data].sort((a, b) => {
          const va = a[field] ?? "";
          const vb = b[field] ?? "";
          const na = parseFloat(va);
          const nb = parseFloat(vb);
          if (!isNaN(na) && !isNaN(nb)) return direction === "desc" ? nb - na : na - nb;
          return direction === "desc" ? vb.localeCompare(va) : va.localeCompare(vb);
        });
        return { data: sorted, error: "" };
      }
      case "limit": {
        const n = parseInt(op.config.count ?? "10");
        return { data: data.slice(0, n), error: "" };
      }
      case "pick": {
        const fields = (op.config.fields ?? "").split(",").map((f) => f.trim()).filter(Boolean);
        if (!fields.length) return { data, error: "" };
        return { data: data.map((row) => Object.fromEntries(fields.map((f) => [f, row[f] ?? ""]))), error: "" };
      }
      default:
        return { data, error: "" };
    }
  } catch (e: unknown) {
    return { data, error: (e as Error).message };
  }
}

function toCsv(data: Record<string, string>[]): string {
  if (!data.length) return "";
  const headers = Object.keys(data[0]);
  return [headers.join(","), ...data.map((row) => headers.map((h) => `"${(row[h] ?? "").replace(/"/g, '""')}"`).join(","))].join("\n");
}

function uid() { return Math.random().toString(36).slice(2, 8); }

const OP_LABELS: Record<OperationType, string> = {
  filter: "Filter",
  map: "Map / Compute",
  groupBy: "Group By",
  sort: "Sort",
  limit: "Limit",
  pick: "Pick Fields",
};

const OP_ICONS: Record<OperationType, string> = {
  filter: "⊻",
  map: "ƒ",
  groupBy: "▣",
  sort: "⇅",
  limit: "⊤",
  pick: "⊡",
};

const SAMPLES = {
  csv: `id,name,department,salary,active\n1,Alice,Engineering,95000,true\n2,Bob,Marketing,72000,true\n3,Carol,Engineering,105000,false\n4,Dave,HR,68000,true\n5,Eve,Engineering,115000,true\n6,Frank,Marketing,80000,false\n7,Grace,HR,71000,true\n8,Heidi,Engineering,98000,true`,
  json: `[\n  {"id":"1","name":"Alice","dept":"Engineering","salary":"95000"},\n  {"id":"2","name":"Bob","dept":"Marketing","salary":"72000"},\n  {"id":"3","name":"Carol","dept":"Engineering","salary":"105000"},\n  {"id":"4","name":"Dave","dept":"HR","salary":"68000"},\n  {"id":"5","name":"Eve","dept":"Engineering","salary":"115000"}\n]`,
};

// ── Operation Config Panels ───────────────────────────────────────────────────
function OpConfig({ op, fields, onChange, tk }: {
  op: Operation;
  fields: string[];
  onChange: (config: Record<string, string>) => void;
  tk: ReturnType<typeof getTokens>;
}) {
  const inputCls = `w-full px-3 py-2 rounded-lg border text-sm outline-none transition-all duration-150 ${tk.inputBg}`;
  const selectCls = `w-full px-3 py-2 rounded-lg border text-sm outline-none ${tk.inputBg} ${tk.selectBg}`;
  const labelCls = `block text-xs font-medium tracking-wide mb-1 ${tk.textMuted}`;

  const upd = (key: string, val: string) => onChange({ ...op.config, [key]: val });

  if (op.type === "filter") return (
    <div className="grid grid-cols-3 gap-2">
      <div>
        <label className={labelCls}>Field</label>
        <select className={selectCls} value={op.config.field ?? ""} onChange={(e) => upd("field", e.target.value)}>
          <option value="">— pick —</option>
          {fields.map((f) => <option key={f}>{f}</option>)}
        </select>
      </div>
      <div>
        <label className={labelCls}>Operator</label>
        <select className={selectCls} value={op.config.operator ?? "contains"} onChange={(e) => upd("operator", e.target.value)}>
          <option value="equals">equals</option>
          <option value="contains">contains</option>
          <option value="startsWith">starts with</option>
          <option value="gt">&gt; (greater)</option>
          <option value="lt">&lt; (less)</option>
          <option value="notEmpty">not empty</option>
        </select>
      </div>
      <div>
        <label className={labelCls}>Value</label>
        <input className={inputCls} value={op.config.value ?? ""} onChange={(e) => upd("value", e.target.value)} placeholder="value…" />
      </div>
    </div>
  );

  if (op.type === "map") return (
    <div className="grid grid-cols-2 gap-2">
      <div>
        <label className={labelCls}>New field name</label>
        <input className={inputCls} value={op.config.newField ?? ""} onChange={(e) => upd("newField", e.target.value)} placeholder="e.g. salary_k" />
      </div>
      <div>
        <label className={labelCls}>Expression (use field names)</label>
        <input className={inputCls} value={op.config.expression ?? ""} onChange={(e) => upd("expression", e.target.value)} placeholder="e.g. salary / 1000" />
      </div>
    </div>
  );

  if (op.type === "groupBy") return (
    <div className="grid grid-cols-3 gap-2">
      <div>
        <label className={labelCls}>Group by field</label>
        <select className={selectCls} value={op.config.field ?? ""} onChange={(e) => upd("field", e.target.value)}>
          <option value="">— pick —</option>
          {fields.map((f) => <option key={f}>{f}</option>)}
        </select>
      </div>
      <div>
        <label className={labelCls}>Aggregate</label>
        <select className={selectCls} value={op.config.aggregate ?? ""} onChange={(e) => upd("aggregate", e.target.value)}>
          <option value="">none</option>
          <option value="sum">sum</option>
          <option value="avg">avg</option>
          <option value="min">min</option>
          <option value="max">max</option>
        </select>
      </div>
      <div>
        <label className={labelCls}>Aggregate field</label>
        <select className={selectCls} value={op.config.aggField ?? ""} onChange={(e) => upd("aggField", e.target.value)}>
          <option value="">— pick —</option>
          {fields.map((f) => <option key={f}>{f}</option>)}
        </select>
      </div>
    </div>
  );

  if (op.type === "sort") return (
    <div className="grid grid-cols-2 gap-2">
      <div>
        <label className={labelCls}>Sort by field</label>
        <select className={selectCls} value={op.config.field ?? ""} onChange={(e) => upd("field", e.target.value)}>
          <option value="">— pick —</option>
          {fields.map((f) => <option key={f}>{f}</option>)}
        </select>
      </div>
      <div>
        <label className={labelCls}>Direction</label>
        <select className={selectCls} value={op.config.direction ?? "asc"} onChange={(e) => upd("direction", e.target.value)}>
          <option value="asc">Ascending ↑</option>
          <option value="desc">Descending ↓</option>
        </select>
      </div>
    </div>
  );

  if (op.type === "limit") return (
    <div className="w-40">
      <label className={labelCls}>Max rows</label>
      <input type="number" className={inputCls} value={op.config.count ?? "10"} onChange={(e) => upd("count", e.target.value)} min="1" />
    </div>
  );

  if (op.type === "pick") return (
    <div>
      <label className={labelCls}>Fields to keep (comma-separated or click)</label>
      <input className={inputCls} value={op.config.fields ?? ""} onChange={(e) => upd("fields", e.target.value)} placeholder="name, salary, department" />
      <div className="flex flex-wrap gap-1.5 mt-2">
        {fields.map((f) => {
          const current = (op.config.fields ?? "").split(",").map((x) => x.trim()).filter(Boolean);
          const active = current.includes(f);
          return (
            <button key={f} onClick={() => {
              const next = active ? current.filter((x) => x !== f) : [...current, f];
              upd("fields", next.join(", "));
            }} className={`px-2.5 py-1 rounded-md border text-xs font-mono transition-all duration-150 ${active ? (tk.dark ? "bg-white text-black border-white" : "bg-black text-white border-black") : `${tk.border} ${tk.textFaint} ${tk.surfaceHv}`}`}>
              {f}
            </button>
          );
        })}
      </div>
    </div>
  );

  return null;
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function CSVJsonTransformer() {
  const { theme } = useTheme();
  const tk = getTokens(theme);

  const [inputFormat, setInputFormat] = useState<InputFormat>("csv");
  const [outputFormat, setOutputFormat] = useState<InputFormat>("json");
  const [raw, setRaw] = useState(SAMPLES.csv);
  const [operations, setOperations] = useState<Operation[]>([]);
  const [copied, setCopied] = useState(false);

  const { data: parsed, error: parseError } = useMemo(() => parseInput(raw, inputFormat), [raw, inputFormat]);

  const pipeline = useMemo(() => {
    let current = parsed;
    const steps: { op: Operation; result: Record<string, string>[]; error: string }[] = [];
    for (const op of operations) {
      const { data, error } = applyOperation(current, op);
      steps.push({ op, result: data, error });
      if (!error) current = data;
    }
    return { steps, final: current };
  }, [parsed, operations]);

  const outputFields = useMemo(() => (pipeline.final.length ? Object.keys(pipeline.final[0]) : []), [pipeline.final]);
  const inputFields = useMemo(() => (parsed.length ? Object.keys(parsed[0]) : []), [parsed]);

  // Fields available at each step
  const fieldsAtStep = useCallback((idx: number) => {
    if (idx === 0) return inputFields;
    const prev = pipeline.steps[idx - 1];
    return prev?.result.length ? Object.keys(prev.result[0]) : inputFields;
  }, [pipeline.steps, inputFields]);

  const addOp = (type: OperationType) => {
    setOperations((ops) => [...ops, { id: uid(), type, config: {} }]);
  };

  const removeOp = (id: string) => setOperations((ops) => ops.filter((o) => o.id !== id));

  const updateOp = (id: string, config: Record<string, string>) =>
    setOperations((ops) => ops.map((o) => (o.id === id ? { ...o, config } : o)));

  const moveOp = (idx: number, dir: -1 | 1) => {
    setOperations((ops) => {
      const next = [...ops];
      const tmp = next[idx]; next[idx] = next[idx + dir]; next[idx + dir] = tmp;
      return next;
    });
  };

  const outputText = useMemo(() => {
    if (!pipeline.final.length) return "";
    return outputFormat === "json"
      ? JSON.stringify(pipeline.final, null, 2)
      : toCsv(pipeline.final);
  }, [pipeline.final, outputFormat]);

  const copyOutput = () => {
    navigator.clipboard.writeText(outputText).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
  };

  const downloadOutput = () => {
    const ext = outputFormat === "json" ? "json" : "csv";
    const blob = new Blob([outputText], { type: "text/plain" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
    a.download = `transformed.${ext}`; a.click();
  };

  const sectionCls = `rounded-2xl border ${tk.border} ${tk.surface} p-5`;
  const labelCls = `text-xs font-semibold tracking-widest uppercase ${tk.textFaint} mb-3 block`;
  const tabCls = (active: boolean) =>
    `px-4 py-1.5 rounded-lg text-xs font-semibold tracking-wide transition-all duration-150 ${active ? tk.tabActive : `${tk.tabInactive} ${tk.surface} border ${tk.border}`}`;

  return (
    <div className="space-y-5">
      {/* ── Input ── */}
      <div className={sectionCls}>
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <span className={labelCls} style={{ marginBottom: 0 }}>Input Data</span>
          <div className="flex items-center gap-2">
            <div className={`flex gap-1 p-1 rounded-lg border ${tk.border} ${tk.surface}`}>
              {(["csv", "json"] as InputFormat[]).map((f) => (
                <button key={f} className={tabCls(inputFormat === f)} onClick={() => { setInputFormat(f); setRaw(SAMPLES[f]); }}>
                  {f.toUpperCase()}
                </button>
              ))}
            </div>
            <button onClick={() => setRaw(SAMPLES[inputFormat])} className={`px-3 py-1.5 rounded-lg border ${tk.border} ${tk.surface} ${tk.surfaceHv} text-xs ${tk.textFaint} transition-all duration-150`}>
              Load sample
            </button>
          </div>
        </div>
        {parseError && <div className={`mb-2 px-3 py-2 rounded-lg border ${tk.dark ? "border-white/15 text-white/50" : "border-black/15 text-black/50"} text-xs font-mono`}>⚠ {parseError}</div>}
        <textarea
          className={`w-full h-40 px-4 py-3 rounded-xl border text-sm font-mono outline-none resize-none transition-all duration-150 ${tk.inputBg}`}
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          placeholder={`Paste ${inputFormat.toUpperCase()} data here…`}
          spellCheck={false}
        />
        {parsed.length > 0 && (
          <div className={`mt-2 text-xs ${tk.textFaint} font-mono`}>
            ✓ {parsed.length} rows · {inputFields.length} fields: {inputFields.join(", ")}
          </div>
        )}
      </div>

      {/* ── Pipeline ── */}
      <div className={sectionCls}>
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <span className={labelCls} style={{ marginBottom: 0 }}>Pipeline Operations</span>
          <div className="flex flex-wrap gap-1.5">
            {(Object.keys(OP_LABELS) as OperationType[]).map((type) => (
              <button key={type} onClick={() => addOp(type)}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border ${tk.border} ${tk.surface} ${tk.surfaceHv} text-xs ${tk.textMuted} font-medium transition-all duration-150`}>
                <span className="font-mono text-sm">{OP_ICONS[type]}</span>
                {OP_LABELS[type]}
              </button>
            ))}
          </div>
        </div>

        {operations.length === 0 && (
          <div className={`text-center py-8 ${tk.textDim} text-sm border-2 border-dashed ${tk.dark ? "border-white/8" : "border-black/8"} rounded-xl`}>
            Add operations above to build your data pipeline
          </div>
        )}

        <div className="space-y-3">
          {operations.map((op, idx) => {
            const step = pipeline.steps[idx];
            const hasError = step?.error;
            return (
              <div key={op.id}>
                {/* connector */}
                {idx > 0 && (
                  <div className={`flex items-center gap-2 text-xs ${tk.textDim} font-mono ml-4 my-1`}>
                    <div className={`w-px h-4 ${tk.dark ? "bg-white/10" : "bg-black/10"} mx-2`} />
                    {pipeline.steps[idx - 1]?.result.length ?? 0} rows
                  </div>
                )}
                <div className={`rounded-xl border ${hasError ? (tk.dark ? "border-white/20" : "border-black/20") : tk.border} p-4 ${tk.surface}`}>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <span className={`font-mono text-base ${tk.textMuted}`}>{OP_ICONS[op.type]}</span>
                      <span className={`text-sm font-semibold ${tk.text}`}>{OP_LABELS[op.type]}</span>
                      <span className={`text-xs font-mono ${tk.textDim}`}>#{idx + 1}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <button disabled={idx === 0} onClick={() => moveOp(idx, -1)} className={`px-2 py-1 rounded border ${tk.border} ${tk.surface} ${tk.surfaceHv} text-xs ${tk.textFaint} disabled:opacity-30 transition-all duration-150`}>↑</button>
                      <button disabled={idx === operations.length - 1} onClick={() => moveOp(idx, 1)} className={`px-2 py-1 rounded border ${tk.border} ${tk.surface} ${tk.surfaceHv} text-xs ${tk.textFaint} disabled:opacity-30 transition-all duration-150`}>↓</button>
                      <button onClick={() => removeOp(op.id)} className={`px-2 py-1 rounded border ${tk.border} ${tk.surface} ${tk.surfaceHv} text-xs ${tk.textFaint} transition-all duration-150`}>✕</button>
                    </div>
                  </div>
                  <OpConfig op={op} fields={fieldsAtStep(idx)} onChange={(cfg) => updateOp(op.id, cfg)} tk={tk} />
                  {hasError && <p className={`mt-2 text-xs font-mono ${tk.textMuted}`}>⚠ {step.error}</p>}
                  {step && !hasError && (
                    <p className={`mt-2 text-xs font-mono ${tk.textFaint}`}>→ {step.result.length} rows out</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Preview Table ── */}
      {pipeline.final.length > 0 && (
        <div className={sectionCls}>
          <span className={labelCls}>Live Preview — {pipeline.final.length} rows · {outputFields.length} fields</span>
          <div className="overflow-x-auto rounded-xl border ${tk.border}">
            <table className="w-full text-xs font-mono border-collapse">
              <thead>
                <tr className={`${tk.dark ? "bg-white/[0.04]" : "bg-black/[0.04]"}`}>
                  {outputFields.map((f) => (
                    <th key={f} className={`px-3 py-2 text-left font-semibold tracking-wide ${tk.textMuted} border-b ${tk.border} whitespace-nowrap`}>{f}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pipeline.final.slice(0, 20).map((row, i) => (
                  <tr key={i} className={`border-b ${tk.border} ${i % 2 === 0 ? "" : (tk.dark ? "bg-white/[0.015]" : "bg-black/[0.015]")}`}>
                    {outputFields.map((f) => (
                      <td key={f} className={`px-3 py-2 ${tk.textMuted} whitespace-nowrap max-w-[160px] truncate`}>{row[f] ?? ""}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {pipeline.final.length > 20 && (
            <p className={`mt-2 text-xs ${tk.textDim} font-mono`}>Showing 20 of {pipeline.final.length} rows</p>
          )}
        </div>
      )}

      {/* ── Export ── */}
      {pipeline.final.length > 0 && (
        <div className={sectionCls}>
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <span className={labelCls} style={{ marginBottom: 0 }}>Export</span>
            <div className="flex items-center gap-2 flex-wrap">
              <div className={`flex gap-1 p-1 rounded-lg border ${tk.border} ${tk.surface}`}>
                {(["json", "csv"] as InputFormat[]).map((f) => (
                  <button key={f} className={tabCls(outputFormat === f)} onClick={() => setOutputFormat(f)}>
                    {f.toUpperCase()}
                  </button>
                ))}
              </div>
              <button onClick={copyOutput} className={`px-4 py-2 rounded-xl border ${tk.border} ${tk.surface} ${tk.surfaceHv} text-xs font-semibold ${tk.textMuted} transition-all duration-150`}>
                {copied ? "Copied ✓" : "Copy"}
              </button>
              <button onClick={downloadOutput} className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all duration-150 ${tk.cta}`}>
                ↓ Download .{outputFormat}
              </button>
            </div>
          </div>
          <pre className={`text-xs font-mono p-4 rounded-xl border ${tk.border} ${tk.dark ? "bg-white/[0.02]" : "bg-black/[0.02]"} ${tk.textMuted} overflow-x-auto max-h-56`}>
            {outputText.slice(0, 3000)}{outputText.length > 3000 ? "\n…" : ""}
          </pre>
        </div>
      )}
    </div>
  );
}
