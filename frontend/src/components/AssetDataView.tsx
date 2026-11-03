import { useMemo, useState } from "react";
import { documentDownloadUrl } from "../api/agent";
import type {
  AssetDetailView,
  AssetDocument,
  CategoryView,
  DataValue,
  FactValue,
  FieldEntry,
  RecordsBlock,
  SourceClaim,
} from "../api/assets";

const DOCUMENTS = "Documents";

const METHOD_LABELS: Record<string, string> = {
  api: "API",
  document_parse: "Document parse",
  chain_read: "Chain read",
  ai_extraction: "AI extraction",
  manual: "Manual entry",
};

/** Stored keys such as "fact_sheet" as readable text. */
const humanize = (key: string) => key.charAt(0).toUpperCase() + key.slice(1).replaceAll("_", " ");

/** A value we can show. The view also reports what's missing, and this page leaves that out. */
const hasValue = (value: FactValue) =>
  (value.status === "disclosed" && value.value !== null) || value.status === "attributed_only";

function availableCategories(view: AssetDetailView): CategoryView[] {
  return view.categories
    .map((category) => ({
      ...category,
      blocks: category.blocks.flatMap((block): CategoryView["blocks"] => {
        if (block.kind === "fields") {
          const fields = block.fields.filter(hasValue);
          return fields.length > 0 ? [{ ...block, fields }] : [];
        }
        const keep = block.columns.map((_, i) => block.rows.some((row) => hasValue(row.cells[i])));
        const rows = block.rows.filter((row) => row.cells.some(hasValue));
        if (rows.length === 0) return [];
        return [
          {
            ...block,
            columns: block.columns.filter((_, i) => keep[i]),
            rows: rows.map((row) => ({ ...row, cells: row.cells.filter((_, i) => keep[i]) })),
          },
        ];
      }),
    }))
    .filter((category) => category.blocks.length > 0);
}

function searchCategory(category: CategoryView, query: string): CategoryView {
  const matches = (field: { label: string; key: string }) =>
    field.label.toLowerCase().includes(query) || field.key.includes(query);
  return {
    ...category,
    blocks: category.blocks.flatMap((block): CategoryView["blocks"] => {
      if (block.kind === "fields") {
        const fields = block.fields.filter(matches);
        return fields.length > 0 ? [{ ...block, fields }] : [];
      }
      const keep = block.columns.map(matches);
      if (!keep.includes(true)) return [];
      return [
        {
          ...block,
          columns: block.columns.filter((_, i) => keep[i]),
          rows: block.rows.map((row) => ({ ...row, cells: row.cells.filter((_, i) => keep[i]) })),
        },
      ];
    }),
  };
}

/** Renders one asset's available data. Knows value types and block kinds, never specific categories. */
export function AssetDataView({ view }: { view: AssetDetailView }) {
  const [queryText, setQueryText] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const query = queryText.trim().toLowerCase();

  const available = useMemo(() => availableCategories(view), [view]);

  const categories = available
    .filter((category) => selected === null || category.name === selected)
    .map((category) => (query ? searchCategory(category, query) : category))
    .filter((category) => category.blocks.length > 0);
  const documents =
    selected === null || selected === DOCUMENTS
      ? view.documents.filter((document) => !query || document.title.toLowerCase().includes(query))
      : [];

  const nothingAtAll = available.length === 0 && view.documents.length === 0;
  const railItems = [...available.map((category) => category.name), ...(view.documents.length > 0 ? [DOCUMENTS] : [])];

  if (nothingAtAll) {
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
            aria-label="Search fields and documents"
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
        {categories.length === 0 && documents.length === 0 && (
          <p className="py-12 text-center text-sm text-muted-foreground">Nothing matches your search.</p>
        )}
        {categories.map((category) => (
          <CategorySection key={category.name} category={category} conflictOrders={view.conflictOrders} />
        ))}
        {documents.length > 0 && <DocumentsSection documents={documents} />}
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

function SectionHeader({
  title,
  collapsed,
  onToggle,
}: {
  title: string;
  collapsed: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="flex items-center gap-3">
      <h2 className="text-lg font-medium">{title}</h2>
      <button
        type="button"
        aria-expanded={!collapsed}
        onClick={onToggle}
        className="ml-auto inline-flex h-7 cursor-pointer items-center rounded-lg border border-border px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-canvas-hover hover:text-foreground"
      >
        {collapsed ? "Show" : "Hide"}
      </button>
    </div>
  );
}

function CategorySection({
  category,
  conflictOrders,
}: {
  category: CategoryView;
  conflictOrders: AssetDetailView["conflictOrders"];
}) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <section className="flex min-w-0 flex-col gap-3">
      <SectionHeader title={category.name} collapsed={collapsed} onToggle={() => setCollapsed((c) => !c)} />
      {!collapsed && (
        <div className="flex min-w-0 flex-col gap-6">
          {category.blocks.map((block) =>
            block.kind === "fields" ? (
              <FieldGrid key="fields" fields={block.fields} conflictOrders={conflictOrders} />
            ) : (
              <RecordsTable key={block.key} block={block} />
            ),
          )}
        </div>
      )}
    </section>
  );
}

function FieldGrid({
  fields,
  conflictOrders,
}: {
  fields: FieldEntry[];
  conflictOrders: AssetDetailView["conflictOrders"];
}) {
  const [openKey, setOpenKey] = useState<string | null>(null);
  // Short values first, so long text doesn't leave holes in the grid.
  const ordered = [
    ...fields.filter((field) => field.valueType !== "long_text"),
    ...fields.filter((field) => field.valueType === "long_text"),
  ];

  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(250px,1fr))] gap-x-8">
      {ordered.map((field) => {
        const open = openKey === field.key;
        const wide = open || field.valueType === "long_text";
        return (
          <div
            key={field.key}
            className={`flex min-w-0 flex-col gap-1 border-t border-border py-3 ${wide ? "col-span-full" : ""}`}
          >
            <div className="flex min-h-4 items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                {field.label}
                {field.hasConflict && (
                  <span role="img" aria-label="Sources disagree" className="text-warning-foreground">
                    <WarningIcon />
                  </span>
                )}
              </span>
              <button
                type="button"
                aria-expanded={open}
                aria-label={`Show sources for ${field.label}`}
                onClick={() => setOpenKey(open ? null : field.key)}
                className="inline-flex shrink-0 cursor-pointer items-center gap-1 whitespace-nowrap text-[11px] font-medium text-muted-foreground hover:text-foreground"
              >
                {field.source ?? field.claims[0]?.source}
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
                  <path d={open ? "m6 15 6-6 6 6" : "m6 9 6 6 6-6"} />
                </svg>
              </button>
            </div>

            <FactDisplay fact={field} valueType={field.valueType} />
            {field.requiresAsOf && field.status === "disclosed" && field.asOf && (
              <span className="text-[11px] leading-4 text-muted-foreground">As of {field.asOf}</span>
            )}
            {open && <ClaimsPanel field={field} conflictOrder={conflictOrders[field.conflictPolicy]} />}
          </div>
        );
      })}
    </div>
  );
}

function FactDisplay({ fact, valueType }: { fact: FactValue; valueType: string }) {
  if (fact.status === "attributed_only") {
    const claim = fact.claims.find((c) => c.isAttributedOnly);
    return (
      <span className="text-sm leading-5">
        <span className="text-muted-foreground">{claim?.source ?? "A source"} says</span> “{displayText(claim?.value ?? null)}”
      </span>
    );
  }
  return fact.value === null ? null : <TypedValue value={fact.value} valueType={valueType} />;
}

function displayText(value: DataValue | null): string {
  if (value === null) return "";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return Array.isArray(value) ? value.join(", ") : String(value);
}

function safeHref(value: string): string | null {
  try {
    const { protocol } = new URL(value);
    return protocol === "http:" || protocol === "https:" ? value : null;
  } catch {
    return null;
  }
}

function TypedValue({ value, valueType }: { value: DataValue; valueType: string }) {
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

function ClaimsPanel({ field, conflictOrder }: { field: FieldEntry; conflictOrder: string[] }) {
  return (
    <div className="mt-2 flex flex-col gap-3 rounded-lg bg-muted p-4">
      <p className="text-xs leading-[18px] text-muted-foreground">Conflict order: {conflictOrder.join(", ")}.</p>
      {field.claims.map((claim, index) => (
        <ClaimRow key={index} claim={claim} />
      ))}
    </div>
  );
}

function ClaimRow({ claim }: { claim: SourceClaim }) {
  const meta = [
    claim.asOf && `As of ${claim.asOf}`,
    `Observed ${claim.observedAt.slice(0, 10)}`,
    METHOD_LABELS[claim.method] ?? claim.method,
  ].filter(Boolean);

  return (
    <div className="flex flex-col gap-1 border-t border-border pt-3">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="text-[13px] font-medium">{claim.source}</span>
        {claim.isFact && (
          <span className="rounded-md bg-foreground px-1.5 text-[11px] font-medium leading-[18px] text-primary-foreground">
            Shown
          </span>
        )}
      </div>
      <span className="text-sm leading-5 [overflow-wrap:anywhere]">
        {claim.status === "disclosed" ? displayText(claim.value) : humanize(claim.status)}
      </span>
      {claim.isAttributedOnly && (
        <span className="text-xs leading-[18px] text-muted-foreground">Kept as an attributed claim, never a Fact.</span>
      )}
      <span className="text-xs leading-[18px] text-muted-foreground">{meta.join(" · ")}</span>
      {claim.overrideReason && (
        <span className="text-xs leading-[18px] text-muted-foreground">Pinned: {claim.overrideReason}</span>
      )}
      {claim.citations.map((citation, index) => (
        <span key={index} className="text-xs leading-[18px] text-muted-foreground">
          <a href={documentDownloadUrl(citation.documentId)} className="font-medium text-secondary hover:underline">
            {citation.title}
            {citation.locator ? `, ${citation.locator}` : ""}
          </a>
          {citation.verified ? " (verified)" : " (not verified)"}: “{citation.quote}”
        </span>
      ))}
    </div>
  );
}

function RecordsTable({ block }: { block: RecordsBlock }) {
  const hasRowLabel = block.rowLabelHeader !== null;
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
        <h3 className="text-sm font-medium">{block.title}</h3>
        {block.sources.length > 0 && (
          <span className="text-xs text-muted-foreground">Source: {block.sources.join(", ")}</span>
        )}
      </div>
      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="bg-muted">
              {hasRowLabel && <HeaderCell sticky>{block.rowLabelHeader}</HeaderCell>}
              {block.columns.map((column) => (
                <HeaderCell key={column.key}>
                  {column.label}
                  {column.hasConflict && (
                    <span role="img" aria-label="Sources disagree" className="ml-1 inline-block text-warning-foreground">
                      <WarningIcon />
                    </span>
                  )}
                </HeaderCell>
              ))}
            </tr>
          </thead>
          <tbody>
            {block.rows.map((row) => (
              <tr key={row.key} className="border-t border-border">
                {hasRowLabel && (
                  <th scope="row" className="sticky left-0 whitespace-nowrap bg-background px-3 py-2.5 align-top text-sm font-medium">
                    {row.label}
                  </th>
                )}
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

function RecordCell({ cell, valueType }: { cell: FactValue; valueType: string }) {
  if (!hasValue(cell)) {
    // Another row has a value in this column, and this one doesn't.
    return <td className="px-3 py-2.5 align-top text-sm text-muted-foreground">–</td>;
  }
  const text = displayText(cell.value);
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
      <FactDisplay fact={cell} valueType={valueType} />
    </td>
  );
}

function DocumentsSection({ documents }: { documents: AssetDocument[] }) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <section className="flex min-w-0 flex-col gap-3">
      <SectionHeader title={DOCUMENTS} collapsed={collapsed} onToggle={() => setCollapsed((c) => !c)} />
      {!collapsed && (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="bg-muted">
                <HeaderCell>Document</HeaderCell>
                <HeaderCell>Type</HeaderCell>
                <HeaderCell>Publisher</HeaderCell>
                <HeaderCell>Last checked</HeaderCell>
                <HeaderCell>Saved copy</HeaderCell>
              </tr>
            </thead>
            <tbody>
              {documents.map((document) => (
                <DocumentRow key={document.id} document={document} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function DocumentRow({ document }: { document: AssetDocument }) {
  const href = safeHref(document.url);
  return (
    <tr className="border-t border-border">
      <td className="min-w-[280px] px-3 py-2.5 align-top text-sm leading-5">
        {href ? (
          <a href={href} target="_blank" rel="noreferrer" className="text-secondary hover:underline">
            {document.title}
          </a>
        ) : (
          document.title
        )}
      </td>
      <td className="whitespace-nowrap px-3 py-2.5 align-top text-sm">{humanize(document.category)}</td>
      <td className="whitespace-nowrap px-3 py-2.5 align-top text-sm">{document.isOfficial ? "Official" : "Third party"}</td>
      <td className="whitespace-nowrap px-3 py-2.5 align-top text-sm">{document.lastCheckedAt ?? "–"}</td>
      <td className="whitespace-nowrap px-3 py-2.5 align-top text-sm">
        {document.hasSavedCopy ? (
          <a href={documentDownloadUrl(document.id)} className="text-secondary hover:underline">
            Download
          </a>
        ) : (
          "–"
        )}
      </td>
    </tr>
  );
}

function WarningIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M12 3 2 20h20L12 3Z" />
      <path d="M12 10v4M12 17v.5" />
    </svg>
  );
}
