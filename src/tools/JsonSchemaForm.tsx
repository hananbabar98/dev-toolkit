import { useState, useCallback } from "react";
import { useTheme } from "../ThemeContext";
import { getTokens } from "../themeTokens";

const SAMPLE_SCHEMA = `{
  "title": "User Registration",
  "description": "Create a new user account",
  "type": "object",
  "required": ["fullName", "email", "age", "role", "acceptTerms"],
  "properties": {
    "fullName": {
      "type": "string",
      "title": "Full Name",
      "minLength": 2,
      "maxLength": 80,
      "placeholder": "John Doe"
    },
    "email": {
      "type": "string",
      "title": "Email Address",
      "format": "email",
      "placeholder": "john@example.com"
    },
    "age": {
      "type": "number",
      "title": "Age",
      "minimum": 18,
      "maximum": 120
    },
    "bio": {
      "type": "string",
      "title": "Short Bio",
      "maxLength": 300,
      "multiline": true,
      "placeholder": "Tell us about yourself..."
    },
    "role": {
      "type": "string",
      "title": "Role",
      "enum": ["admin", "developer", "designer", "manager"],
      "enumLabels": ["Administrator", "Developer", "Designer", "Manager"]
    },
    "website": {
      "type": "string",
      "title": "Website",
      "format": "uri",
      "placeholder": "https://example.com"
    },
    "acceptTerms": {
      "type": "boolean",
      "title": "I accept the Terms & Conditions"
    }
  }
}`;

interface SchemaProperty {
  type: string;
  title?: string;
  description?: string;
  minLength?: number;
  maxLength?: number;
  minimum?: number;
  maximum?: number;
  format?: string;
  enum?: string[];
  enumLabels?: string[];
  placeholder?: string;
  multiline?: boolean;
}

interface JSONSchema {
  title?: string;
  description?: string;
  type: string;
  required?: string[];
  properties?: Record<string, SchemaProperty>;
}

interface ValidationError {
  field: string;
  message: string;
}

function parseSchema(text: string): { schema: JSONSchema | null; error: string | null } {
  try {
    const schema = JSON.parse(text);
    return { schema, error: null };
  } catch (e) {
    return { schema: null, error: (e as Error).message };
  }
}

function validateField(key: string, value: unknown, prop: SchemaProperty, required: boolean): string | null {
  if (required && (value === "" || value === null || value === undefined)) {
    return `${prop.title || key} is required`;
  }
  if (value === "" || value === null || value === undefined) return null;

  if (prop.type === "string" && typeof value === "string") {
    if (prop.format === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value))
      return "Invalid email address";
    if (prop.format === "uri" && !/^https?:\/\/.+/.test(value))
      return "Must be a valid URL starting with http:// or https://";
    if (prop.minLength !== undefined && value.length < prop.minLength)
      return `Minimum length is ${prop.minLength} characters`;
    if (prop.maxLength !== undefined && value.length > prop.maxLength)
      return `Maximum length is ${prop.maxLength} characters`;
  }
  if (prop.type === "number") {
    const num = Number(value);
    if (isNaN(num)) return "Must be a valid number";
    if (prop.minimum !== undefined && num < prop.minimum)
      return `Minimum value is ${prop.minimum}`;
    if (prop.maximum !== undefined && num > prop.maximum)
      return `Maximum value is ${prop.maximum}`;
  }
  return null;
}

function generateReactCode(schema: JSONSchema): string {
  const props = schema.properties || {};
  const required = schema.required || [];

  const fields = Object.entries(props).map(([key, prop]) => {
    const isRequired = required.includes(key);
    const req = isRequired ? " *" : "";

    if (prop.type === "boolean") {
      return `      {/* ${prop.title || key} */}
      <div className="flex items-center gap-3">
        <input
          type="checkbox"
          id="${key}"
          {...register("${key}"${isRequired ? `, { required: "${prop.title || key} is required" }` : ""})}
          className="w-4 h-4"
        />
        <label htmlFor="${key}" className="text-sm font-medium">
          ${prop.title || key}${req}
        </label>
        {errors.${key} && <span className="text-red-500 text-xs">{errors.${key}.message}</span>}
      </div>`;
    }

    if (prop.enum) {
      const labels = prop.enumLabels || prop.enum;
      const opts = prop.enum.map((v, i) => `          <option value="${v}">${labels[i] || v}</option>`).join("\n");
      return `      {/* ${prop.title || key} */}
      <div className="flex flex-col gap-1">
        <label htmlFor="${key}" className="text-sm font-medium">${prop.title || key}${req}</label>
        <select
          id="${key}"
          {...register("${key}"${isRequired ? `, { required: "${prop.title || key} is required" }` : ""})}
          className="border rounded px-3 py-2 text-sm"
        >
          <option value="">Select ${prop.title || key}…</option>
${opts}
        </select>
        {errors.${key} && <span className="text-red-500 text-xs">{errors.${key}.message}</span>}
      </div>`;
    }

    if (prop.multiline || (prop.maxLength && prop.maxLength > 100)) {
      return `      {/* ${prop.title || key} */}
      <div className="flex flex-col gap-1">
        <label htmlFor="${key}" className="text-sm font-medium">${prop.title || key}${req}</label>
        <textarea
          id="${key}"
          placeholder="${prop.placeholder || ""}"
          rows={4}
          {...register("${key}"${isRequired ? `, { required: "${prop.title || key} is required"` : "{"}${prop.maxLength ? `, maxLength: { value: ${prop.maxLength}, message: "Max ${prop.maxLength} chars" }` : ""}${prop.minLength ? `, minLength: { value: ${prop.minLength}, message: "Min ${prop.minLength} chars" }` : ""} })}
          className="border rounded px-3 py-2 text-sm resize-none"
        />
        {errors.${key} && <span className="text-red-500 text-xs">{errors.${key}.message}</span>}
      </div>`;
    }

    const inputType = prop.format === "email" ? "email" : prop.format === "uri" ? "url" : prop.type === "number" ? "number" : "text";
    return `      {/* ${prop.title || key} */}
      <div className="flex flex-col gap-1">
        <label htmlFor="${key}" className="text-sm font-medium">${prop.title || key}${req}</label>
        <input
          type="${inputType}"
          id="${key}"
          placeholder="${prop.placeholder || ""}"
          {...register("${key}"${isRequired ? `, {
            required: "${prop.title || key} is required"${prop.minLength ? `,
            minLength: { value: ${prop.minLength}, message: "Min ${prop.minLength} chars" }` : ""}${prop.maxLength ? `,
            maxLength: { value: ${prop.maxLength}, message: "Max ${prop.maxLength} chars" }` : ""}${prop.minimum !== undefined ? `,
            min: { value: ${prop.minimum}, message: "Min value is ${prop.minimum}" }` : ""}${prop.maximum !== undefined ? `,
            max: { value: ${prop.maximum}, message: "Max value is ${prop.maximum}" }` : ""}
          }` : ""})}
          className="border rounded px-3 py-2 text-sm"
        />
        {errors.${key} && <span className="text-red-500 text-xs">{errors.${key}.message}</span>}
      </div>`;
  });

  return `import { useForm } from "react-hook-form";

interface FormData {
${Object.entries(props).map(([k, p]) => `  ${k}${required.includes(k) ? "" : "?"}: ${p.type === "boolean" ? "boolean" : p.type === "number" ? "number" : "string"};`).join("\n")}
}

export default function ${(schema.title || "Generated").replace(/\s+/g, "")}Form() {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormData>();

  const onSubmit = async (data: FormData) => {
    console.log("Form submitted:", data);
    // TODO: handle submission
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-5 max-w-lg mx-auto p-6">
      <div className="mb-2">
        <h2 className="text-xl font-bold">${schema.title || "Form"}</h2>
        ${schema.description ? `<p className="text-sm text-gray-500 mt-1">${schema.description}</p>` : ""}
      </div>
${fields.join("\n\n")}

      <button
        type="submit"
        disabled={isSubmitting}
        className="mt-2 bg-black text-white rounded px-4 py-2.5 text-sm font-semibold hover:bg-black/85 disabled:opacity-50 transition-colors"
      >
        {isSubmitting ? "Submitting…" : "Submit"}
      </button>
    </form>
  );
}`;
}

export default function JsonSchemaForm() {
  const { theme } = useTheme();
  const tk = getTokens(theme);
  const dark = tk.dark;

  const [schemaText, setSchemaText] = useState(SAMPLE_SCHEMA);
  const [activeTab, setActiveTab] = useState<"preview" | "code">("preview");
  const [formValues, setFormValues] = useState<Record<string, unknown>>({});
  const [errors, setErrors] = useState<ValidationError[]>([]);
  const [submitted, setSubmitted] = useState(false);

  const { schema, error: parseError } = parseSchema(schemaText);
  const props = schema?.properties || {};
  const required = schema?.required || [];

  const handleChange = useCallback((key: string, value: unknown) => {
    setFormValues(prev => ({ ...prev, [key]: value }));
    setSubmitted(false);
    // Clear error for this field
    setErrors(prev => prev.filter(e => e.field !== key));
  }, []);

  const handleSubmit = () => {
    const newErrors: ValidationError[] = [];
    Object.entries(props).forEach(([key, prop]) => {
      const val = formValues[key];
      const err = validateField(key, val, prop, required.includes(key));
      if (err) newErrors.push({ field: key, message: err });
    });
    setErrors(newErrors);
    if (newErrors.length === 0) setSubmitted(true);
  };

  const getFieldError = (key: string) => errors.find(e => e.field === key)?.message;

  const inputClass = `w-full border rounded-xl px-3 py-2 text-sm outline-none transition-all duration-150 ${tk.inputBg}`;
  const labelClass = `block text-xs font-semibold tracking-wide mb-1.5 ${tk.textMuted}`;
  const errorClass = `text-xs mt-1 ${dark ? "text-red-400" : "text-red-600"}`;

  const generatedCode = schema ? generateReactCode(schema) : "";

  return (
    <div className="space-y-6">
      {/* Tabs */}
      <div className={`flex gap-1 p-1 rounded-xl border ${tk.border} ${tk.surface} w-fit`}>
        {(["preview", "code"] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-1.5 rounded-lg text-xs font-semibold tracking-wide capitalize transition-all duration-150 ${activeTab === tab ? tk.tabActive : tk.tabInactive}`}
          >
            {tab === "preview" ? "Live Preview" : "Generated Code"}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Schema Input */}
        <div className="space-y-3">
          <div className={`flex items-center justify-between`}>
            <h3 className={`text-xs font-semibold tracking-widest uppercase ${tk.textMuted}`}>JSON Schema Input</h3>
            <button
              onClick={() => setSchemaText(SAMPLE_SCHEMA)}
              className={`text-xs px-2.5 py-1 rounded-lg border ${tk.border} ${tk.surface} ${tk.surfaceHv} ${tk.textFaint} transition-all`}
            >
              Load Sample
            </button>
          </div>

          <div className="relative">
            <textarea
              value={schemaText}
              onChange={e => setSchemaText(e.target.value)}
              className={`w-full h-[520px] border rounded-xl px-4 py-3 text-xs font-mono outline-none resize-none transition-all duration-150 ${tk.inputBg} leading-relaxed`}
              spellCheck={false}
            />
          </div>

          {parseError && (
            <div className={`flex items-start gap-2 px-3 py-2.5 rounded-lg border text-xs ${dark ? "border-red-500/20 bg-red-500/10 text-red-400" : "border-red-300 bg-red-50 text-red-600"}`}>
              <span className="font-bold mt-0.5">✕</span>
              <span>{parseError}</span>
            </div>
          )}

          {!parseError && schema && (
            <div className={`flex items-center gap-2 px-3 py-2.5 rounded-lg border text-xs ${dark ? "border-white/10 bg-white/[0.03] text-white/50" : "border-black/10 bg-black/[0.03] text-black/50"}`}>
              <span>✓</span>
              <span>Valid schema — {Object.keys(props).length} field{Object.keys(props).length !== 1 ? "s" : ""}, {required.length} required</span>
            </div>
          )}
        </div>

        {/* Preview / Code */}
        <div>
          {activeTab === "preview" ? (
            <div className={`border rounded-2xl ${tk.border} ${tk.surface} overflow-hidden`}>
              {schema ? (
                <>
                  {/* Form header */}
                  <div className={`px-6 py-5 border-b ${tk.border}`}>
                    <h3 className={`text-base font-bold ${tk.text}`}>{schema.title || "Form"}</h3>
                    {schema.description && <p className={`text-xs mt-1 ${tk.textFaint}`}>{schema.description}</p>}
                  </div>

                  <div className="px-6 py-5 space-y-4 max-h-[440px] overflow-y-auto">
                    {submitted && (
                      <div className={`flex items-center gap-2 px-3 py-2.5 rounded-lg border text-xs ${dark ? "border-white/15 bg-white/[0.05] text-white/70" : "border-black/15 bg-black/[0.04] text-black/70"}`}>
                        <span>✓</span> Form submitted successfully!
                      </div>
                    )}

                    {Object.entries(props).map(([key, prop]) => {
                      const fieldError = getFieldError(key);
                      const isReq = required.includes(key);

                      return (
                        <div key={key}>
                          {prop.type === "boolean" ? (
                            <label className="flex items-center gap-3 cursor-pointer">
                              <div
                                onClick={() => handleChange(key, !formValues[key])}
                                className={`w-9 h-5 rounded-full border transition-all duration-200 flex items-center cursor-pointer shrink-0 ${
                                  formValues[key]
                                    ? dark ? "bg-white border-white" : "bg-black border-black"
                                    : `${tk.surface} ${tk.border}`
                                }`}
                              >
                                <div className={`w-3.5 h-3.5 rounded-full mx-0.5 transition-all duration-200 ${
                                  formValues[key]
                                    ? dark ? "translate-x-4 bg-black" : "translate-x-4 bg-white"
                                    : dark ? "bg-white/30" : "bg-black/30"
                                }`} />
                              </div>
                              <span className={`text-sm ${tk.textMuted}`}>{prop.title || key}{isReq && <span className={`ml-0.5 ${dark ? "text-white/40" : "text-black/40"}`}>*</span>}</span>
                            </label>
                          ) : prop.enum ? (
                            <div>
                              <label className={labelClass}>{prop.title || key}{isReq && " *"}</label>
                              <select
                                value={(formValues[key] as string) || ""}
                                onChange={e => handleChange(key, e.target.value)}
                                className={`${inputClass} ${dark ? "bg-black" : "bg-white"}`}
                              >
                                <option value="">Select {prop.title || key}…</option>
                                {prop.enum!.map((v, i) => (
                                  <option key={v} value={v}>{(prop.enumLabels || prop.enum)![i]}</option>
                                ))}
                              </select>
                            </div>
                          ) : prop.multiline || ((prop.maxLength || 0) > 100) ? (
                            <div>
                              <label className={labelClass}>{prop.title || key}{isReq && " *"}</label>
                              <textarea
                                value={(formValues[key] as string) || ""}
                                onChange={e => handleChange(key, e.target.value)}
                                placeholder={prop.placeholder}
                                rows={3}
                                className={`${inputClass} resize-none`}
                              />
                              {prop.maxLength && (
                                <div className={`text-xs mt-1 text-right ${tk.textDim}`}>
                                  {((formValues[key] as string) || "").length}/{prop.maxLength}
                                </div>
                              )}
                            </div>
                          ) : (
                            <div>
                              <label className={labelClass}>{prop.title || key}{isReq && " *"}</label>
                              <input
                                type={prop.format === "email" ? "email" : prop.format === "uri" ? "url" : prop.type === "number" ? "number" : "text"}
                                value={(formValues[key] as string) || ""}
                                onChange={e => handleChange(key, e.target.value)}
                                placeholder={prop.placeholder}
                                className={inputClass}
                              />
                            </div>
                          )}
                          {fieldError && <p className={errorClass}>{fieldError}</p>}
                        </div>
                      );
                    })}
                  </div>

                  <div className={`px-6 py-4 border-t ${tk.border} flex items-center justify-between`}>
                    <button
                      onClick={() => { setFormValues({}); setErrors([]); setSubmitted(false); }}
                      className={`text-xs px-3 py-2 rounded-lg border ${tk.border} ${tk.surface} ${tk.surfaceHv} ${tk.textFaint} transition-all`}
                    >
                      Reset
                    </button>
                    <button
                      onClick={handleSubmit}
                      className={`text-xs px-5 py-2 rounded-lg font-semibold transition-all ${tk.cta}`}
                    >
                      Submit Form →
                    </button>
                  </div>
                </>
              ) : (
                <div className={`px-6 py-12 text-center ${tk.textFaint} text-sm`}>Fix schema errors to see preview</div>
              )}
            </div>
          ) : (
            <div className={`border rounded-2xl ${tk.border} overflow-hidden`}>
              <div className={`flex items-center justify-between px-4 py-3 border-b ${tk.border} ${tk.surface}`}>
                <span className={`text-xs font-mono ${tk.textFaint}`}>GeneratedForm.tsx</span>
                <button
                  onClick={() => navigator.clipboard.writeText(generatedCode)}
                  className={`text-xs px-2.5 py-1 rounded border ${tk.border} ${tk.surface} ${tk.surfaceHv} ${tk.textFaint} transition-all`}
                >
                  Copy
                </button>
              </div>
              <pre className={`text-xs font-mono p-4 overflow-auto h-[480px] leading-relaxed ${tk.textMuted} ${dark ? "bg-white/[0.02]" : "bg-black/[0.02]"}`}>
                {generatedCode || "// Fix schema errors to generate code"}
              </pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
