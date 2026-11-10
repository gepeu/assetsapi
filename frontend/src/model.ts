// What the Figma pages draw. src/api/toView.ts fills these shapes from the API.

export type Tone = "up" | "down" | "plain";

export type ClassKey = "fixed-income" | "equities" | "commodities" | "crypto" | "alternatives";

export interface ClassTab {
  key: ClassKey;
  label: string;
  icon: string;
}

export const CLASS_TABS: ClassTab[] = [
  { key: "fixed-income", label: "Fixed income", icon: "bank" },
  { key: "equities", label: "Equities", icon: "pie" },
  { key: "commodities", label: "Commodities", icon: "cube" },
  { key: "crypto", label: "Crypto", icon: "coins" },
  { key: "alternatives", label: "Alternatives", icon: "briefcase" },
];

export interface MoreCategory {
  key: string;
  label: string;
  icon: string;
}

export const MORE_CATEGORIES: MoreCategory[] = [
  { key: "stablecoins", label: "Stablecoins", icon: "coins" },
  { key: "us-treasury-funds", label: "U.S. Treasury funds", icon: "bank" },
  { key: "non-us-government-debt", label: "Non-U.S. government debt", icon: "banknote" },
  { key: "private-equity", label: "Private equity", icon: "briefcase" },
  { key: "venture-capital", label: "Venture capital", icon: "rocket" },
  { key: "active-strategies", label: "Active strategies", icon: "crosshair" },
  { key: "real-estate", label: "Real estate", icon: "home" },
];

export interface Tag {
  label: string;
  icon: string;
  color: "blue" | "purple";
}

export const CLASS_TAGS: Record<ClassKey, Tag> = {
  "fixed-income": { label: "Fixed income", icon: "bank", color: "blue" },
  equities: { label: "Equities", icon: "barChart", color: "blue" },
  commodities: { label: "Commodities", icon: "cube", color: "blue" },
  crypto: { label: "Crypto", icon: "target", color: "purple" },
  alternatives: { label: "Alternatives", icon: "briefcase", color: "blue" },
};

export interface ListAsset {
  slug: string;
  ticker: string;
  name: string;
  classKey: ClassKey;
  className: string;
  subclass: string;
  /** Categories under "More categories". */
  categories: string[];
  issuer: string | null;
  yield: string | null;
  yieldRate: number | null;
  yoy: string | null;
  tvl: string | null;
  tvlValue: number | null;
}

export interface StatTile {
  icon: string;
  label: string;
  value: string;
  tone?: Tone;
}

export type Points = [string, number][];

export interface ChartSeries {
  label: string;
  points: Points;
}

export interface FactRow {
  label: string;
  value: string;
}

export interface IconFactRow extends FactRow {
  icon: string;
}

export interface LinkRow {
  label: string;
  href: string;
}

export interface OrgCard {
  name: string;
  subtitle?: string;
  link?: LinkRow;
  rows: IconFactRow[];
  buttons: LinkRow[];
}

export interface SimilarCard {
  slug: string;
  ticker: string;
  issuer: string;
  tvl: string;
  tag: Tag;
  /** For yield products: the yield and how it compares with this asset. */
  yield?: { value: string; versus: string; tone: Tone };
}

export interface ChainRow {
  name: string;
  detail: string;
  value: string;
}

export interface DocumentRow {
  kind: string;
  title: string;
  href: string;
}

export interface AssetPageData {
  slug: string;
  ticker: string;
  name: string;
  tag: Tag;
  description?: string;
  overview: StatTile[];
  growth?: ChartSeries;
  performance?: ChartSeries;
  returns?: { asOf: string | null; lastColumn: string; values: (string | null)[]; note: string };
  underlying?: {
    intro?: string;
    chart?: { title: string; lines: [ChartSeries, ChartSeries] };
    rows: FactRow[];
  };
  organization?: OrgCard;
  similar: SimilarCard[];
  onchain?: {
    token: FactRow[];
    explorer?: LinkRow;
    activity: FactRow[];
    activityNote?: string;
    chains: ChainRow[];
  };
  documents: DocumentRow[];
  buy: {
    /** Buy + Multiply tabs, for yield products. */
    multiply: boolean;
    price: number | null;
    yieldRate: number | null;
    minimum: string | null;
  };
}

/** Columns of the historical returns table, before the last one. */
export const RETURN_COLUMNS = ["1M", "3M", "6M", "YTD", "1Y"];

/** The vault page has its own layout in the Figma. It isn't in the API yet. */
export const VAULT_SLUG = "kicusdc";
