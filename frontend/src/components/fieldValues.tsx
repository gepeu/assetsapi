import type { DataValue } from "../api/assets";

/** Stored keys such as "fact_sheet" as readable text. */
export const humanize = (key: string) => key.charAt(0).toUpperCase() + key.slice(1).replaceAll("_", " ");

export function displayText(value: DataValue | null): string {
  if (value === null) return "";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number") return value.toLocaleString("en-US", { maximumFractionDigits: 6 });
  return Array.isArray(value) ? value.join(", ") : value;
}

function safeHref(value: string): string | null {
  try {
    const { protocol } = new URL(value);
    return protocol === "http:" || protocol === "https:" ? value : null;
  } catch {
    return null;
  }
}

export function TypedValue({ value, valueType }: { value: DataValue; valueType: string }) {
  if (Array.isArray(value)) {
    return (
      <span className="flex flex-wrap gap-1">
        {value.map((item) => (
          <span key={item} className="rounded-md border border-border px-2 text-xs leading-[18px]">
            {item}
          </span>
        ))}
      </span>
    );
  }
  const raw = displayText(value);
  const text = valueType === "enum" ? humanize(raw) : raw;
  const href = valueType === "url" ? safeHref(text) : null;
  if (href) {
    return (
      <a href={href} target="_blank" rel="noreferrer" className="text-sm leading-5 break-all text-secondary hover:underline">
        {text}
      </a>
    );
  }
  if (valueType === "identifier" || valueType === "address") {
    return <span className="font-mono text-[13px] leading-5 break-all">{text}</span>;
  }
  if (valueType === "long_text") {
    return <span className="max-w-[760px] whitespace-pre-line text-sm leading-[22px]">{text}</span>;
  }
  return <span className="text-sm leading-5 [overflow-wrap:anywhere]">{text}</span>;
}
