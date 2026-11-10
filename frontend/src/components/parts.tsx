import { type ReactNode, useEffect, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import type { Tag, Tone } from "../model";

// ----- Icons: 24px line drawings, drawn at 16px unless sized otherwise -----

const PATHS: Record<string, ReactNode> = {
  grid: (
    <>
      <rect x="4" y="4" width="6.5" height="6.5" rx="1" />
      <rect x="13.5" y="4" width="6.5" height="6.5" rx="1" />
      <rect x="4" y="13.5" width="6.5" height="6.5" rx="1" />
      <rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1" />
    </>
  ),
  bank: <path d="M3 9 12 4l9 5M5 10v7M9.5 10v7M14.5 10v7M19 10v7M3 20h18" />,
  pie: <path d="M12 3a9 9 0 1 0 9 9h-9zM15 3.5A9 9 0 0 1 20.5 9H15z" />,
  cube: <path d="M12 3 20 7.5v9L12 21l-8-4.5v-9zM4 7.5 12 12l8-4.5M12 12v9" />,
  coins: (
    <>
      <ellipse cx="9" cy="7" rx="6" ry="2.5" />
      <path d="M3 7v4c0 1.4 2.7 2.5 6 2.5s6-1.1 6-2.5V7M9 16.5c0 1.4 2.7 2.5 6 2.5s6-1.1 6-2.5v-4c0-1.2-1.9-2.2-4.5-2.4" />
    </>
  ),
  briefcase: <path d="M3 8.5A1.5 1.5 0 0 1 4.5 7h15A1.5 1.5 0 0 1 21 8.5v10a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18.5zM8.5 7V5A1.5 1.5 0 0 1 10 3.5h4A1.5 1.5 0 0 1 15.5 5v2M3 12.5h18" />,
  banknote: (
    <>
      <rect x="2.5" y="6" width="19" height="12" rx="2" />
      <circle cx="12" cy="12" r="2.5" />
      <path d="M6 12h.01M18 12h.01" />
    </>
  ),
  rocket: <path d="M5 15c-1.5 1.5-2 5-2 5s3.5-.5 5-2M9 15l-3-3c1-4 5-9 12-9 0 7-5 11-9 12zM14.5 8a1.5 1.5 0 1 0 0 .01" />,
  crosshair: (
    <>
      <circle cx="12" cy="12" r="7" />
      <path d="M12 2v4M12 18v4M2 12h4M18 12h4" />
    </>
  ),
  home: <path d="M3 11 12 4l9 7M5.5 9.5V20h13V9.5M10 20v-5h4v5" />,
  chevronDown: <path d="m6 9 6 6 6-6" />,
  chevronUp: <path d="m6 15 6-6 6 6" />,
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </>
  ),
  filter: <path d="M4 6h16M7 12h10M10 18h4" />,
  wallet: <path d="M4 7.5V18a2 2 0 0 0 2 2h14V9H6a2 2 0 0 1-2-2 2 2 0 0 1 2-2h11v4M16 14.5h.01" />,
  bell: <path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.94 1.94 0 0 0 3.4 0" />,
  arrowLeft: <path d="M19 12H5M11 18l-6-6 6-6" />,
  arrowUpRight: <path d="M7 17 17 7M8 7h9v9" />,
  target: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="m12 8.5 3.5 3.5-3.5 3.5L8.5 12z" />
    </>
  ),
  barChart: <path d="M4 4v16h16M8.5 16v-4M12.5 16V8M16.5 16v-6" />,
  lock: (
    <>
      <rect x="5" y="11" width="14" height="9" rx="1.5" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </>
  ),
  lineChart: <path d="M3 3v18h18M7 15l4-5 3 3 5-6" />,
  activity: <path d="M22 12h-4l-3 8L9 4l-3 8H2" />,
  tag: (
    <>
      <path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8z" />
      <circle cx="7.5" cy="7.5" r="1" />
    </>
  ),
  receipt: <path d="M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6" />,
  building: <path d="M4 21V5a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v16M14 10h5a1 1 0 0 1 1 1v10M3 21h18M8 8h2M8 12h2M8 16h2" />,
  globe: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3a14 14 0 0 1 0 18 14 14 0 0 1 0-18" />
    </>
  ),
  doc: <path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8zM14 3v5h5M9 13h6M9 17h6" />,
  users: (
    <>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M18 14a6 6 0 0 1 3.5 6" />
    </>
  ),
  shieldCheck: <path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6zM9 12l2 2 4-4" />,
  shield: <path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z" />,
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 16v-4M12 8h.01" />
    </>
  ),
  swapHorizontal: <path d="M4 8h16l-4-4M20 16H4l4 4" />,
  swapVertical: <path d="M8 20V4L4 8M16 4v16l4-4" />,
  portfolio: <path d="M3 11 12 4l9 7M5.5 9.5V20h13V9.5" />,
  swap: (
    <>
      <rect x="4" y="9" width="11" height="11" rx="1.5" />
      <path d="M9 9V5.5A1.5 1.5 0 0 1 10.5 4h8A1.5 1.5 0 0 1 20 5.5v8a1.5 1.5 0 0 1-1.5 1.5H15M7.5 14.5h4M9.5 12.5l2 2-2 2" />
    </>
  ),
  earn: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  borrow: (
    <>
      <rect x="4" y="4" width="16" height="16" rx="2" />
      <path d="M12 8v7M8.5 12l3.5 3.5 3.5-3.5" />
    </>
  ),
  layers: <path d="M12 4 3 8.5l9 4.5 9-4.5zM3 12.5l9 4.5 9-4.5M3 16.5 12 21l9-4.5" />,
  megaphone: <path d="M3 10.5v3a1 1 0 0 0 1 1h2.5L13 19V5L6.5 9.5H4a1 1 0 0 0-1 1zM17 8.5a5 5 0 0 1 0 7M8 14.5 9.5 20" />,
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </>
  ),
  list: (
    <>
      <rect x="5" y="3" width="14" height="18" rx="1.5" />
      <path d="M9 8h6M9 12h6M9 16h4" />
    </>
  ),
  help: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .8-1 1.5v.7M12 17h.01" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  alert: <path d="M12 3.5 2.5 20h19zM12 10v4M12 17h.01" />,
  refresh: <path d="M20 11a8 8 0 0 0-14.9-3M4 4v4h4M4 13a8 8 0 0 0 14.9 3M20 20v-4h-4" />,
  transfer: <path d="M4 7h11M12 4l3 3-3 3M20 17H9M12 14l-3 3 3 3M18 4v6M6 14v6" />,
  badge: <path d="M12 3l2.4 1.8 3 .1.9 2.8 2.4 1.8-1 2.8 1 2.8-2.4 1.8-.9 2.8-3 .1L12 21l-2.4-1.8-3-.1-.9-2.8-2.4-1.8 1-2.8-1-2.8 2.4-1.8.9-2.8 3-.1zM9 12l2 2 4-4" />,
  save: <path d="M5 4h11l3 3v12a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1zM8 4v5h7V4M8 20v-6h8v6" />,
  docCheck: <path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8zM14 3v5h5M9 15l2 2 4-4" />,
};

export function Icon({ name, size = 16, className = "" }: { name: string; size?: number; className?: string }) {
  if (name === "assets") {
    return (
      <svg className={`shrink-0 ${className}`} width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M4 3v2h16V3H4ZM2 7v13h20V7H2Z" />
      </svg>
    );
  }
  return (
    <svg
      className={`shrink-0 ${className}`}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {PATHS[name] ?? PATHS.grid}
    </svg>
  );
}

const TAG_COLORS = {
  blue: "bg-[#edf2fa] text-secondary",
  purple: "bg-[#f3effd] text-[#8259e6]",
};

export function TagPill({ tag }: { tag: Tag }) {
  return (
    <span className={`inline-flex h-6 items-center gap-1 rounded px-2 text-[13px] ${TAG_COLORS[tag.color]}`}>
      <Icon name={tag.icon} size={13} />
      {tag.label}
    </span>
  );
}

export const toneClass = (tone: Tone | undefined) =>
  tone === "up" ? "text-success" : tone === "down" ? "text-warning" : "";

export function SectionTitle({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="mb-4 flex items-center justify-between gap-4">
      <h2 className="text-[19px] font-medium">{children}</h2>
      {aside}
    </div>
  );
}

/** White card with a hairline border, as used for most Figma sections. */
export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-xl border border-border bg-background ${className}`}>{children}</div>;
}

/** Label on the left, value on the right, dashed rule below. */
export function FactLine({ label, value, icon, mono }: { label: string; value: ReactNode; icon?: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-6 border-b border-dashed border-border py-3.5 text-[14.5px] last:border-b-0">
      <span className="flex shrink-0 items-center gap-2 text-muted-foreground">
        {icon && <Icon name={icon} size={18} className="text-secondary" />}
        {label}
      </span>
      <span className={`text-right font-medium ${mono ? "font-mono text-[14px]" : ""}`}>{value}</span>
    </div>
  );
}

export function LinkButton({ children, href }: { children: ReactNode; href?: string }) {
  const body = (
    <>
      <span className="font-medium">{children}</span>
      <Icon name="arrowUpRight" size={16} className="text-muted-foreground" />
    </>
  );
  const look = "flex h-12 items-center justify-between rounded-lg bg-muted px-5 text-[14.5px] transition-colors hover:bg-canvas";
  return href ? (
    <a className={look} href={href} target="_blank" rel="noreferrer noopener">
      {body}
    </a>
  ) : (
    <button type="button" className={`${look} w-full cursor-pointer text-left`}>
      {body}
    </button>
  );
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  className = "",
}: {
  options: readonly { key: T; label: ReactNode }[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
}) {
  return (
    <div className={`inline-flex rounded-lg border border-border bg-background p-0.5 ${className}`}>
      {options.map((o) => (
        <button
          key={o.key}
          type="button"
          aria-pressed={o.key === value}
          onClick={() => onChange(o.key)}
          className={`h-8 cursor-pointer rounded-md px-3 text-[13px] transition-colors ${
            o.key === value ? "bg-muted font-medium text-foreground" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export const RANGES = ["1M", "3M", "6M", "1Y"] as const;
export type Range = (typeof RANGES)[number];

export function RangeTabs({ value, onChange }: { value: Range; onChange: (r: Range) => void }) {
  return (
    <div className="flex items-center gap-1">
      {RANGES.map((r) => (
        <button
          key={r}
          type="button"
          aria-pressed={r === value}
          onClick={() => onChange(r)}
          className={`h-7 cursor-pointer rounded-md px-2 text-[14px] transition-colors ${
            r === value ? "font-medium text-foreground" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {r}
        </button>
      ))}
    </div>
  );
}

/** Closes a popover on an outside click or Escape. */
export function useDismiss(open: boolean, setOpen: (open: boolean) => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, setOpen]);
  return ref;
}

// ----- Chart -----

/** A repeatable wavy series in the shape the Figma draws: a quiet start, a step up, then swings. */
export function mockSeries(seed: number, points = 72): number[] {
  let state = seed * 9301 + 49297;
  const random = () => {
    state = (state * 9301 + 49297) % 233280;
    return state / 233280;
  };
  const step = Math.round(points * 0.2);
  return Array.from({ length: points }, (_, i) => {
    const base = i < step ? 0.3 : 0.62;
    const swing = (i < step ? 0.06 : 0.16) * Math.sin(i * 0.9 + seed) + (random() - 0.5) * (i < step ? 0.12 : 0.28);
    return Math.min(0.97, Math.max(0.05, base + swing));
  });
}

/** Smooth path through points, by Catmull-Rom converted to cubic Béziers. */
function smoothPath(points: [number, number][]): string {
  if (points.length === 0) return "";
  let d = `M${points[0][0]},${points[0][1]}`;
  for (let i = 0; i < points.length - 1; i++) {
    const [x0, y0] = points[Math.max(0, i - 1)];
    const [x1, y1] = points[i];
    const [x2, y2] = points[i + 1];
    const [x3, y3] = points[Math.min(points.length - 1, i + 2)];
    d += ` C${x1 + (x2 - x0) / 6},${y1 + (y2 - y0) / 6} ${x2 - (x3 - x1) / 6},${y2 - (y3 - y1) / 6} ${x2},${y2}`;
  }
  return d;
}

export interface ChartLine {
  values: number[];
  color: string;
  fill?: boolean;
}

export function MockChart({
  lines,
  yLabels,
  xLabels,
  height = 260,
}: {
  lines: ChartLine[];
  yLabels: string[];
  xLabels: string[];
  height?: number;
}) {
  const W = 1000;
  const id = useMemo(() => `fill-${Math.random().toString(36).slice(2)}`, []);
  const paths = lines.map((line) => {
    const pts = line.values.map((v, i): [number, number] => [(i / (line.values.length - 1)) * W, (1 - v) * height]);
    const d = smoothPath(pts);
    return { ...line, d, area: `${d} L${W},${height} L0,${height} Z` };
  });
  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-3">
        <div className="relative min-w-0 flex-1" style={{ height }}>
          <div className="absolute inset-0 flex flex-col justify-between">
            {yLabels.map((label, i) => (
              <div key={`${label}-${i}`} className="border-t border-dotted border-[#d4d4d4]" />
            ))}
          </div>
          <svg className="absolute inset-0 h-full w-full overflow-visible" viewBox={`0 0 ${W} ${height}`} preserveAspectRatio="none" aria-hidden="true">
            <defs>
              {paths.map((p, i) => (
                <linearGradient key={i} id={`${id}-${i}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={p.color} stopOpacity="0.16" />
                  <stop offset="100%" stopColor={p.color} stopOpacity="0" />
                </linearGradient>
              ))}
            </defs>
            {paths.map((p, i) => (
              <g key={i}>
                {p.fill !== false && <path d={p.area} fill={`url(#${id}-${i})`} />}
                <path d={p.d} fill="none" stroke={p.color} strokeWidth="1.6" vectorEffect="non-scaling-stroke" />
              </g>
            ))}
          </svg>
        </div>
        <div className="flex w-12 shrink-0 flex-col justify-between font-mono text-[11.5px] text-muted-foreground" style={{ height: height + 8, marginTop: -4 }}>
          {yLabels.map((label, i) => (
            <span key={`${label}-${i}`}>{label}</span>
          ))}
        </div>
      </div>
      <div className="flex justify-between pr-[60px] font-mono text-[11.5px] text-muted-foreground">
        {xLabels.map((label, i) => (
          <span key={`${label}-${i}`}>{label}</span>
        ))}
      </div>
    </div>
  );
}

/** Back button beside the content column, and the side panel to the right, as in every Figma asset page. */
export function PageFrame({ children, panel }: { children: ReactNode; panel: ReactNode }) {
  const navigate = useNavigate();
  return (
    <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_330px] 2xl:grid-cols-[minmax(0,1fr)_410px]">
      <div className="flex min-w-0 gap-6">
        <button
          type="button"
          aria-label="Back"
          onClick={() => navigate("/assets")}
          className="hidden h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-border text-muted-foreground hover:text-foreground xl:flex"
        >
          <Icon name="arrowLeft" size={16} />
        </button>
        <article className="flex min-w-0 flex-1 flex-col gap-16">{children}</article>
      </div>
      <aside className="self-start lg:sticky lg:top-6">{panel}</aside>
    </div>
  );
}

/** "$12,047.98" with the cents in grey, as the Figma sets it. */
export function BigValue({ value }: { value: string }) {
  const dot = value.lastIndexOf(".");
  if (dot < 0) return <>{value}</>;
  return (
    <>
      {value.slice(0, dot)}
      <span className="text-muted-foreground">{value.slice(dot)}</span>
    </>
  );
}

