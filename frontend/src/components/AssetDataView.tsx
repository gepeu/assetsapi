import { useMemo, useState } from "react";
import {
  getAssetFinancials,
  type AssetDetail,
  type AssetFields,
  type AssetToken,
  type DataValue,
  type FieldCategory,
  type FieldValue,
} from "../api/assets";
import { formatValue } from "./financialFormat";
import { displayText, humanize, TypedValue } from "./fieldValues";
import { financialsMatch, FinancialsSection, hasFinancials } from "./FinancialsSection";
import { SectionHeader } from "./SectionHeader";
import { useAsync } from "./useAsync";

const FINANCIALS = "Financials";
const TOKENS = "Tokens";

interface Column {
  key: string;
  label: string;
  valueType: string;
}

interface RecordsBlock {
  key: string;
  title: string;
  rowLabelHeader: string;
  columns: Column[];
  rows: { key: string; label: string; cells: (DataValue | null)[] }[];
}

interface Category {
  name: string;
  fields: FieldValue[];
  tables: RecordsBlock[];
}

/** Columns with nothing in any row are left out, as are rows with nothing in any column. */
function withoutEmpty(block: RecordsBlock): RecordsBlock | null {
  const keep = block.columns.map((_, i) => block.rows.some((row) => row.cells[i] !== null));
  const rows = block.rows.filter((row) => row.cells.some((cell) => cell !== null));
  if (rows.length === 0) return null;
  return {
    ...block,
    columns: block.columns.filter((_, i) => keep[i]),
    rows: rows.map((row) => ({ ...row, cells: row.cells.filter((_, i) => keep[i]) })),
  };
}

function toTables(category: FieldCategory, networkNames: ReadonlyMap<string, string>): RecordsBlock[] {
  const groups = [...new Set(category.records.map((record) => record.group))];
  return groups.flatMap((group) => {
    const records = category.records.filter((record) => record.group === group);
    const isNetwork = group === "network";
    const block = withoutEmpty({
      key: group,
      title: isNetwork ? "Networks" : humanize(group),
      rowLabelHeader: humanize(group),
      columns: records[0].fields.map(({ key, label, valueType }) => ({ key, label, valueType })),
      rows: records.map((record) => ({
        key: record.key,
        label: isNetwork ? (networkNames.get(record.key) ?? record.key) : record.key,
        cells: record.fields.map((field) => field.value),
      })),
    });
    return block ? [block] : [];
  });
}

/** One row per chain, with its figures and any token fields that have a value. */
function toTokensBlock(tokens: AssetToken[]): RecordsBlock | null {
  const dollar = (value: number | null) => (value === null ? null : formatValue(value, "dollar"));
  const count = (value: number | null) => (value === null ? null : formatValue(value, "count"));
  const fieldColumns = tokens[0]?.fields.map(({ key, label, valueType }) => ({ key, label, valueType })) ?? [];

  return withoutEmpty({
    key: TOKENS,
    title: "By network",
    rowLabelHeader: "Network",
    columns: [
      { key: "address", label: "Address", valueType: "address" },
      { key: "issuanceType", label: "Issuance", valueType: "enum" },
      { key: "total_asset_value_dollar", label: "Total value", valueType: "text" },
      { key: "market_value_dollar", label: "Market value", valueType: "text" },
      { key: "total_supply_token", label: "Total supply", valueType: "text" },
      { key: "holding_addresses_count", label: "Holders", valueType: "text" },
      ...fieldColumns,
    ],
    rows: tokens.map((token) => ({
      key: `${token.network.key}:${token.address}`,
      label: token.network.name,
      cells: [
        token.address,
        token.issuanceType,
        dollar(token.figures.total_asset_value_dollar),
        dollar(token.figures.market_value_dollar),
        count(token.figures.total_supply_token),
        count(token.figures.holding_addresses_count),
        ...fieldColumns.map((column) => token.fields.find((field) => field.key === column.key)?.value ?? null),
      ],
    })),
  });
}

function availableCategories(asset: AssetDetail, fields: AssetFields, tokens: AssetToken[]): Category[] {
  const networkNames = new Map(asset.networks.map((network) => [network.key, network.name]));
  const categories: Category[] = fields.categories
    .map((category) => ({
      name: category.name,
      fields: category.fields.filter((field) => field.value !== null),
      tables: toTables(category, networkNames),
    }))
    .filter((category) => category.fields.length > 0 || category.tables.length > 0);

  const tokensBlock = toTokensBlock(tokens);
  return tokensBlock ? [...categories, { name: TOKENS, fields: [], tables: [tokensBlock] }] : categories;
}

function searchCategory(category: Category, query: string): Category {
  const matches = (field: { label: string; key: string }) =>
    field.label.toLowerCase().includes(query) || field.key.toLowerCase().includes(query);
  return {
    ...category,
    fields: category.fields.filter(matches),
    tables: category.tables.flatMap((table) => {
      const keep = table.columns.map(matches);
      if (!keep.includes(true)) return [];
      return [
        {
          ...table,
          columns: table.columns.filter((_, i) => keep[i]),
          rows: table.rows.map((row) => ({ ...row, cells: row.cells.filter((_, i) => keep[i]) })),
        },
      ];
    }),
  };
}

const hasContent = (category: Category) => category.fields.length > 0 || category.tables.length > 0;

/** Renders one asset's available data. Knows value types, never specific categories. */
export function AssetDataView({ asset, fields, tokens }: { asset: AssetDetail; fields: AssetFields; tokens: AssetToken[] }) {
  const [queryText, setQueryText] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const query = queryText.trim().toLowerCase();

  const available = useMemo(() => availableCategories(asset, fields, tokens), [asset, fields, tokens]);
  const { slug } = asset;
  const financials = useAsync(() => getAssetFinancials(slug), slug);
  const financialsView = financials.status === "ready" && hasFinancials(financials.data) ? financials.data : null;
  const financialsFailed = financials.status === "error";

  const categories = available
    .filter((category) => selected === null || category.name === selected)
    .map((category) => (query ? searchCategory(category, query) : category))
    .filter(hasContent);
  const showFinancials =
    (selected === null || selected === FINANCIALS) &&
    (financialsFailed ? !query : financialsView !== null && (!query || financialsMatch(financialsView, query)));

  const nothingAtAll = available.length === 0 && !financialsView && !financialsFailed;
  const railItems = [...(financialsView || financialsFailed ? [FINANCIALS] : []), ...available.map((category) => category.name)];

  if (nothingAtAll) {
    if (financials.status === "loading") return null;
    return <p className="py-12 text-center text-sm text-muted-foreground">No data available for this asset yet.</p>;
  }

  return (
    <div className="flex flex-col gap-8 lg:flex-row lg:items-start lg:gap-10">
      <div className="flex w-full shrink-0 flex-col gap-3 lg:sticky lg:top-4 lg:w-56">
        <label className="flex h-8 items-center gap-2 rounded-lg bg-muted px-3">
          <svg className="shrink-0 text-muted-foreground opacity-60" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          <input
            type="search"
            value={queryText}
            onChange={(e) => setQueryText(e.target.value)}
            placeholder="Search…"
            aria-label="Search fields"
            className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
        </label>
        <nav aria-label="Categories" className="flex flex-col gap-0.5">
          <RailButton name="All" active={selected === null} onClick={() => setSelected(null)} />
          {railItems.map((name) => (
            <RailButton key={name} name={name} active={selected === name} onClick={() => setSelected(name)} />
          ))}
        </nav>
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-10">
        {categories.length === 0 && !showFinancials && (
          <p className="py-12 text-center text-sm text-muted-foreground">Nothing matches your search.</p>
        )}
        {showFinancials &&
          (financialsView ? (
            <FinancialsSection slug={slug} view={financialsView} />
          ) : (
            <p className="text-sm text-muted-foreground">Couldn't load financial data.</p>
          ))}
        {categories.map((category) => (
          <CategorySection key={category.name} category={category} />
        ))}
      </div>
    </div>
  );
}

function RailButton({ name, active, onClick }: { name: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`w-full cursor-pointer rounded-lg px-2.5 py-2 text-left text-[13px] transition-colors hover:bg-canvas-hover ${
        active ? "bg-canvas font-medium" : ""
      }`}
    >
      {name}
    </button>
  );
}

function CategorySection({ category }: { category: Category }) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <section className="flex min-w-0 flex-col gap-3">
      <SectionHeader title={category.name} collapsed={collapsed} onToggle={() => setCollapsed((c) => !c)} />
      {!collapsed && (
        <div className="flex min-w-0 flex-col gap-6">
          {category.fields.length > 0 && <FieldGrid fields={category.fields} />}
          {category.tables.map((table) => (
            <RecordsTable key={table.key} block={table} />
          ))}
        </div>
      )}
    </section>
  );
}

function FieldGrid({ fields }: { fields: FieldValue[] }) {
  // Short values first, so long text doesn't leave holes in the grid.
  const ordered = [
    ...fields.filter((field) => field.valueType !== "long_text"),
    ...fields.filter((field) => field.valueType === "long_text"),
  ];

  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(250px,1fr))] gap-x-8">
      {ordered.map((field) => (
        <div
          key={field.key}
          className={`flex min-w-0 flex-col gap-1 border-t border-border py-3 ${field.valueType === "long_text" ? "col-span-full" : ""}`}
        >
          <span className="text-xs text-muted-foreground">{field.label}</span>
          {field.value !== null && <TypedValue value={field.value} valueType={field.valueType} />}
        </div>
      ))}
    </div>
  );
}

function RecordsTable({ block }: { block: RecordsBlock }) {
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <h3 className="text-sm font-medium">{block.title}</h3>
      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="bg-muted">
              <HeaderCell sticky>{block.rowLabelHeader}</HeaderCell>
              {block.columns.map((column) => (
                <HeaderCell key={column.key}>{column.label}</HeaderCell>
              ))}
            </tr>
          </thead>
          <tbody>
            {block.rows.map((row) => (
              <tr key={row.key} className="border-t border-border">
                <th scope="row" className="sticky left-0 whitespace-nowrap bg-background px-3 py-2.5 align-top text-sm font-medium">
                  {row.label}
                </th>
                {row.cells.map((cell, index) => (
                  <RecordCell key={block.columns[index].key} cell={cell} valueType={block.columns[index].valueType} />
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function HeaderCell({ sticky, children }: { sticky?: boolean; children: React.ReactNode }) {
  return (
    <th
      scope="col"
      className={`whitespace-nowrap px-3 py-2.5 text-xs font-medium text-muted-foreground ${
        sticky ? "sticky left-0 bg-muted" : ""
      }`}
    >
      {children}
    </th>
  );
}

function RecordCell({ cell, valueType }: { cell: DataValue | null; valueType: string }) {
  if (cell === null) {
    // Another row has a value in this column, and this one doesn't.
    return <td className="px-3 py-2.5 align-top text-sm text-muted-foreground">–</td>;
  }
  const text = displayText(cell);
  if (valueType === "address" && text.length > 16) {
    return (
      <td title={text} className="whitespace-nowrap px-3 py-2.5 align-top font-mono text-[13px]">
        {text.slice(0, 6)}…{text.slice(-4)}
      </td>
    );
  }
  // Short values stay on one line, which keeps rows compact; only real sentences wrap.
  return (
    <td className={`px-3 py-2.5 align-top ${text.length > 40 ? "min-w-[280px]" : "whitespace-nowrap"}`}>
      <TypedValue value={cell} valueType={valueType} />
    </td>
  );
}
