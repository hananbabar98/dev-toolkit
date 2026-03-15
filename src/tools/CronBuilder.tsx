import { useState, useEffect } from "react";
import cronstrue from "cronstrue";
import { useTheme } from "../ThemeContext";
import { getTokens } from "../themeTokens";

const TEMPLATES = [
  { label: "Every minute",            value: "* * * * *" },
  { label: "Every hour",              value: "0 * * * *" },
  { label: "Every day at midnight",   value: "0 0 * * *" },
  { label: "Every weekday at 9am",    value: "0 9 * * 1-5" },
  { label: "Every Monday at 8am",     value: "0 8 * * 1" },
  { label: "Every Sunday at noon",    value: "0 12 * * 0" },
  { label: "1st of every month",      value: "0 0 1 * *" },
  { label: "Every 15 minutes",        value: "*/15 * * * *" },
  { label: "Every 6 hours",           value: "0 */6 * * *" },
  { label: "Twice daily (8am & 8pm)", value: "0 8,20 * * *" },
];

function getNextRuns(cron: string, count = 5): string[] {
  try {
    const parts = cron.trim().split(/\s+/);
    if (parts.length !== 5) return [];
    const [minute, hour, dom, month, dow] = parts;
    const results: Date[] = [];
    const now = new Date();
    now.setSeconds(0, 0);
    const limit = new Date(now.getTime() + 1000 * 60 * 60 * 24 * 366);
    let current = new Date(now.getTime() + 60000);

    const matchField = (value: string, curr: number, min: number): boolean => {
      if (value === "*") return true;
      for (const part of value.split(",")) {
        if (part.startsWith("*/")) { if ((curr - min) % parseInt(part.slice(2)) === 0) return true; }
        else if (part.includes("-")) { const [lo, hi] = part.split("-").map(Number); if (curr >= lo && curr <= hi) return true; }
        else if (parseInt(part) === curr) return true;
      }
      return false;
    };

    while (results.length < count && current < limit) {
      if (matchField(minute, current.getMinutes(), 0) && matchField(hour, current.getHours(), 0) &&
          matchField(dom, current.getDate(), 1) && matchField(month, current.getMonth() + 1, 1) &&
          matchField(dow, current.getDay(), 0)) {
        results.push(new Date(current));
      }
      current = new Date(current.getTime() + 60000);
    }

    return results.map((d) => d.toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }));
  } catch { return []; }
}

export default function CronBuilder() {
  const { theme } = useTheme();
  const tk = getTokens(theme);

  const [cron, setCron]             = useState("0 9 * * 1-5");
  const [description, setDescription] = useState("");
  const [nextRuns, setNextRuns]     = useState<string[]>([]);
  const [error, setError]           = useState("");
  const [minute, setMinute]         = useState("0");
  const [hour, setHour]             = useState("9");
  const [dom, setDom]               = useState("*");
  const [month, setMonth]           = useState("*");
  const [dow, setDow]               = useState("1-5");
  const [mode, setMode]             = useState<"visual" | "manual">("visual");

  useEffect(() => {
    const expr = mode === "visual" ? `${minute} ${hour} ${dom} ${month} ${dow}` : cron;
    try {
      setDescription(cronstrue.toString(expr, { throwExceptionOnParseError: true }));
      setNextRuns(getNextRuns(expr));
      setError("");
      if (mode === "visual") setCron(expr);
    } catch {
      setDescription(""); setNextRuns([]); setError("Invalid cron expression");
    }
  }, [minute, hour, dom, month, dow, cron, mode]);

  const applyTemplate = (val: string) => {
    const p = val.split(" ");
    setMinute(p[0]); setHour(p[1]); setDom(p[2]); setMonth(p[3]); setDow(p[4]);
    setCron(val);
  };

  const expr = mode === "visual" ? `${minute} ${hour} ${dom} ${month} ${dow}` : cron;

  const Field = ({ label, value, onChange, placeholder, hint }: { label: string; value: string; onChange: (v: string) => void; placeholder: string; hint: string }) => (
    <div className="flex flex-col gap-1.5">
      <label className={`text-xs font-semibold ${tk.textFaint} uppercase tracking-widest`}>{label}</label>
      <input
        className={`border rounded-lg px-3 py-2.5 text-sm font-mono focus:outline-none transition-all ${tk.inputBg}`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
      <span className={`text-xs font-mono ${tk.textDim}`}>{hint}</span>
    </div>
  );

  return (
    <div className="flex flex-col gap-7">

      {/* Quick Templates */}
      <div>
        <p className={`text-xs font-semibold ${tk.textFaint} uppercase tracking-widest mb-3`}>Quick Templates</p>
        <div className="flex flex-wrap gap-2">
          {TEMPLATES.map((t) => (
            <button
              key={t.value}
              onClick={() => applyTemplate(t.value)}
              className={`px-3 py-1.5 text-xs rounded-lg ${tk.surface} ${tk.surfaceHv} ${tk.textMuted} border ${tk.border} ${tk.borderHv} transition-all duration-150 font-medium`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Mode Toggle */}
      <div className={`flex gap-1 p-1 rounded-xl ${tk.surface} border ${tk.border} w-fit`}>
        {(["visual", "manual"] as const).map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all duration-150 ${mode === m ? tk.tabActive : tk.tabInactive}`}
          >
            {m === "visual" ? "Visual Builder" : "Manual Input"}
          </button>
        ))}
      </div>

      {/* Fields */}
      {mode === "visual" ? (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <Field label="Minute"    value={minute} onChange={setMinute} placeholder="0-59"  hint="0 = top of hour" />
          <Field label="Hour"      value={hour}   onChange={setHour}   placeholder="0-23"  hint="0 = midnight" />
          <Field label="Day/Month" value={dom}    onChange={setDom}    placeholder="1-31"  hint="* = every day" />
          <Field label="Month"     value={month}  onChange={setMonth}  placeholder="1-12"  hint="* = every month" />
          <Field label="Day/Week"  value={dow}    onChange={setDow}    placeholder="0-6"   hint="0 = Sunday" />
        </div>
      ) : (
        <div>
          <label className={`text-xs font-semibold ${tk.textFaint} uppercase tracking-widest block mb-2`}>Cron Expression</label>
          <input
            className={`w-full border rounded-xl px-5 py-4 text-xl font-mono focus:outline-none transition-all ${tk.inputBg}`}
            value={cron}
            onChange={(e) => setCron(e.target.value)}
            placeholder="* * * * *"
          />
          <p className={`text-xs ${tk.textDim} mt-2 font-mono tracking-wider`}>
            minute&nbsp;&nbsp;&nbsp;hour&nbsp;&nbsp;&nbsp;day(month)&nbsp;&nbsp;&nbsp;month&nbsp;&nbsp;&nbsp;day(week)
          </p>
        </div>
      )}

      {/* Expression Display */}
      <div className={`flex items-center gap-4 ${tk.surface} rounded-xl px-5 py-4 border ${tk.border}`}>
        <span className={`text-xs ${tk.textDim} uppercase tracking-widest shrink-0`}>Expression</span>
        <code className={`${tk.text} font-mono text-lg flex-1`}>{expr}</code>
        <button
          onClick={() => navigator.clipboard.writeText(expr)}
          className={`text-xs ${tk.textFaint} border ${tk.border} ${tk.borderHv} px-3 py-1 rounded-lg transition-all hover:${tk.textMuted}`}
        >
          Copy
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className={`flex items-center gap-3 ${tk.surface} border ${tk.border} rounded-xl px-5 py-4`}>
          <span className={`w-1.5 h-1.5 rounded-full ${tk.dark ? "bg-white/60" : "bg-black/50"} shrink-0`} />
          <span className={`${tk.textMuted} text-sm`}>{error}</span>
        </div>
      )}

      {/* Human Readable */}
      {!error && description && (
        <div className={`${tk.surface} border ${tk.border} rounded-xl px-5 py-4`}>
          <p className={`text-xs ${tk.textDim} uppercase tracking-widest mb-2`}>Human Readable</p>
          <p className={`${tk.dark ? "text-white/80" : "text-black/80"} text-base font-medium`}>{description}</p>
        </div>
      )}

      {/* Next Runs */}
      {nextRuns.length > 0 && (
        <div className={`${tk.surface} border ${tk.border} rounded-xl px-5 py-4`}>
          <p className={`text-xs font-semibold ${tk.textFaint} uppercase tracking-widest mb-4`}>
            Next {nextRuns.length} Scheduled Runs
          </p>
          <div className="space-y-2.5">
            {nextRuns.map((run, i) => (
              <div key={i} className="flex items-center gap-4">
                <span className={`w-5 h-5 rounded-full border ${tk.border} ${tk.surface} ${tk.textFaint} text-xs flex items-center justify-center font-mono font-bold shrink-0`}>
                  {i + 1}
                </span>
                <span className={`${tk.textMuted} font-mono text-sm`}>{run}</span>
              </div>
            ))}
          </div>
        </div>
      )}

    </div>
  );
}
