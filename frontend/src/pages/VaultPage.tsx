import { useState } from "react";
import { BigValue, Card, FactLine, Icon, Logo, MockChart, mockSeries, PageFrame, RANGES, type Range, RangeTabs, SectionTitle } from "../components/parts";

// kicUSDC isn't in the API yet, so this page still draws the Figma's own numbers.

/** The Figma's placeholder chart axes, kept as drawn. */
const CHART_Y_LABELS = ["$180M", "$150M", "$100M", "$50M", "$25M", "$0"];
const CHART_X_LABELS = ["01/01", "01/01", "01/01", "01/01", "01/15", "01/31"];

const NAME = "Kamino Institutional Commodity Yield";
const SUMMARY =
  "Kamino Institutional Commodity Yield finances fully collateralized commodity trade with corporates and traders via a regulated lending operation.";

const TABS = [
  { key: "overview", label: "Vault overview", icon: "grid" },
  { key: "loans", label: "Loan book", icon: "list" },
  { key: "faqs", label: "FAQs", icon: "help" },
  { key: "documents", label: "Documents", icon: "doc" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

const TILES = [
  { icon: "lineChart", label: "Vault AUM", value: "$50.70M" },
  { icon: "activity", label: "Vault APY", value: "7.79%", up: true },
  { icon: "tag", label: "Max capacity", value: "$74.98M" },
  { icon: "receipt", label: "Instant liquidity", value: "$3.74M" },
];

const STEPS = [
  "You deposit USDC and receive vault shares representing a pro rata claim on the vault’s net asset value, issued and redeemed at the prevailing share price.",
  "Funds are drawn down by the Institutional Yield SPV, from where it is deployed into a regulated lending operation, approved and supervised by the Cayman Islands Monetary Authority (CIMA).",
  "Lending operation originates short-term Commodity Loans, secured by physical commodities and/or 1:1 by cash segregated in escrow accounts (or backing letters of credit) with tier-1 banks.",
  "Interest and other income flow back through the SPV to the vault. Returns accrue through real-time share price appreciation, which can be realized via share redemptions. Redemptions settle from an instant liquidity buffer; larger requests enter an on-chain FIFO withdrawal queue.",
];

const FRAMEWORK = [
  { icon: "save", label: "Collateral", value: "Physical Commodities and/or Escrowed Cash" },
  { icon: "shieldCheck", label: "Collateral Management", value: "Segregated Escrow, Verified Before Release" },
  { icon: "transfer", label: "Ownership Transfer", value: "Back-to-Back — Fund Retains Title" },
  { icon: "lineChart", label: "Collateralization", value: "Measured Against Contractual Sale Price" },
  { icon: "shield", label: "Insurance", value: "All-Risk Cargo — Financing Entity as Loss Payee" },
  { icon: "refresh", label: "Transaction Structure", value: "Trial → Rolling Programs" },
  { icon: "clock", label: "Loan Duration", value: "~1–3 Months per Commodity Loan" },
  { icon: "alert", label: "Liquidations", value: "Only on Buyer Non-Performance" },
  { icon: "badge", label: "Regulatory Oversight", value: "Commodity Yield Fund Supervised by CIMA" },
  { icon: "doc", label: "Independent Attestation", value: "Monthly — Independent Accounting Firm" },
];

const BORROWER = [
  { label: "Borrower Type", value: "Corporates and commodity traders" },
  { label: "Current Collateral", value: "Physical commodities, Cash" },
  { label: "Weighted Avg. LTV", value: "98.69%" },
  { label: "Maximum LTV", value: "Varies per transaction" },
  { label: "Loan Durations", value: "1–3 months (notice period 1–3 months)" },
];

const TRANSPARENCY = [
  {
    icon: "activity",
    text: "Loan data reflected in the Loan Book tab is sourced directly from the Commodity Yield Fund's loan and risk management systems",
  },
  {
    icon: "badge",
    text: "Monthly signed attestation by an independent accounting firm — verifying loan principal, collateral coverage, and portfolio health indicators",
  },
  {
    icon: "docCheck",
    text: "Regulatory oversight — the Commodity Yield Fund is a regulated off-chain lending operation implemented through an approved fund structure supervised by CIMA",
  },
];

export function VaultPage() {
  const [tab, setTab] = useState<TabKey>("overview");
  return (
    <PageFrame panel={<DepositPanel />}>
      <div className="flex flex-col gap-8">
        <header className="flex flex-col gap-6">
          <div className="flex flex-wrap items-center gap-4">
            <Logo name="kicusdc" size={50} label="kicUSDC" />
            <h1 className="text-[22px] font-medium">{NAME}</h1>
            <span className="inline-flex h-6 items-center gap-1 rounded bg-[#edf2fa] px-2 text-[13px] text-secondary">
              <Icon name="lock" size={13} />
              Permissionless
            </span>
          </div>
          <p className="text-[16px] leading-6 text-sidebar-foreground">
            {SUMMARY}{" "}
            <button type="button" className="inline-flex cursor-pointer items-center gap-1 text-secondary">
              Learn how it works
              <Icon name="info" size={15} />
            </button>
          </p>
        </header>

        <div className="flex flex-wrap gap-1">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              aria-pressed={tab === t.key}
              onClick={() => setTab(t.key)}
              className={`inline-flex h-10 cursor-pointer items-center gap-2 rounded-lg px-3.5 text-[16px] ${
                tab === t.key ? "bg-[#edf2fa] text-secondary" : "text-sidebar-foreground hover:bg-muted"
              }`}
            >
              <Icon name={t.icon} size={16} />
              {t.label}
            </button>
          ))}
        </div>

        {tab === "overview" ? (
          <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
            {TILES.map((tile) => (
              <div key={tile.label} className="flex min-w-0 flex-col gap-3 rounded-xl bg-muted px-4 py-5">
                <span className="flex items-center gap-2 whitespace-nowrap text-[15px] text-sidebar-foreground">
                  <Icon name={tile.icon} size={16} className="text-secondary" />
                  {tile.label}
                </span>
                <span className={`font-mono text-[22px] ${tile.up ? "text-success" : ""}`}>{tile.value}</span>
              </div>
            ))}
          </div>
        ) : (
          <Card className="p-10 text-center text-[15px] text-muted-foreground">
            The Figma only designs the Vault overview tab.
          </Card>
        )}
      </div>

      {tab === "overview" && (
        <>
          <section>
            <SectionTitle>Strategy overview</SectionTitle>
            <p className="text-[16px] leading-6 text-sidebar-foreground">
              {SUMMARY}{" "}
              <button type="button" className="cursor-pointer text-secondary">
                Read more
              </button>
            </p>
          </section>

          <section>
            <SectionTitle>Performance</SectionTitle>
            <SharePriceCard />
          </section>

          <section>
            <SectionTitle>How Does Institutional Commodity Yield Work?</SectionTitle>
            <div className="flex flex-col gap-6 rounded-xl bg-muted p-7">
              <ol className="flex flex-col gap-7">
                {STEPS.map((step, i) => (
                  <li key={step} className="relative flex gap-4">
                    {i < STEPS.length - 1 && <span className="absolute left-[17px] top-9 h-[calc(100%-4px)] border-l border-dashed border-border" />}
                    <span className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border bg-background font-mono text-[12px] text-sidebar-foreground">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <p className="text-[16px] leading-6">{step}</p>
                  </li>
                ))}
              </ol>
              <p className="flex gap-2.5 rounded-xl bg-[#e9f0fa] p-4 text-[14px] leading-5 text-secondary">
                <Icon name="info" size={16} className="mt-0.5" />
                Funds are released only after independent shipment verification and delivery of the agreed documentation. Purchases and onward
                sales are typically contracted back to back at fixed prices, so the lending operation is not expected to take material open
                commodity price exposure.
              </p>
              <div className="grid gap-2.5 md:grid-cols-3">
                {["Product Documentation", "Collateral Reporting", "Loan Agreement"].map((label) => (
                  <button
                    key={label}
                    type="button"
                    className="flex h-10 cursor-pointer items-center justify-between rounded-lg border border-border bg-background px-4 text-[14px] font-medium"
                  >
                    {label}
                    <Icon name="arrowUpRight" size={13} className="text-muted-foreground" />
                  </button>
                ))}
              </div>
            </div>
          </section>

          <section className="flex flex-col gap-5">
            <SectionTitle>About {NAME}</SectionTitle>
            <div className="-mt-1 flex flex-col gap-4 rounded-xl bg-muted p-5">
              <div>
                <h3 className="text-[18px] font-medium">Lending Framework</h3>
                <p className="mt-1.5 text-[15.5px] text-sidebar-foreground">Strict parameters governing how deposited funds are deployed.</p>
              </div>
              <div className="flex flex-col gap-2.5">
                {FRAMEWORK.map((item) => (
                  <FrameworkRow key={item.label} {...item} />
                ))}
              </div>
            </div>

            <div className="grid gap-5 md:grid-cols-2">
              <div className="rounded-xl bg-muted p-5">
                <CardHeading>Borrower Profile</CardHeading>
                {BORROWER.map((r) => (
                  <FactLine key={r.label} label={r.label} value={r.value} />
                ))}
                <p className="mt-3 text-[13.5px] text-sidebar-foreground">
                  Individual loan data is visible on the{" "}
                  <button type="button" onClick={() => setTab("loans")} className="cursor-pointer text-secondary">
                    Loan Book
                  </button>{" "}
                  tab.
                </p>
              </div>
              <div className="rounded-xl bg-muted p-5">
                <CardHeading>Transparency</CardHeading>
                <ul className="flex flex-col gap-6 pt-4">
                  {TRANSPARENCY.map((t) => (
                    <li key={t.text} className="flex gap-4">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border bg-background text-secondary">
                        <Icon name={t.icon} size={15} />
                      </span>
                      <p className="text-[15.5px] font-medium leading-6">{t.text}</p>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <Card className="flex flex-col gap-4 p-5 text-[14px] leading-5 text-sidebar-foreground">
              <h3 className="text-[16px] font-medium text-foreground">Disclaimers</h3>
              <p>
                Kamino Institutional Yield vaults are made available subject to Kamino’s <A>Terms and Conditions</A> and geo-blocking policy. By
                accessing this page or interacting with the vaults, you confirm that you are not located in a restricted jurisdiction and that your
                participation complies with all laws and regulations applicable to you. Nothing on this page or within the associated documentation
                constitutes financial, investment, legal, or tax advice, nor should it be construed as a solicitation or offer to buy or sell any
                security, token, digital asset, or financial instrument, or to participate in any particular investment strategy.
              </p>
              <p>
                Yield is generated from interest on the underlying loan portfolio and depends on the performance of each vault’s lending operation —
                it is not fixed or guaranteed, and deposited capital may be partially or fully lost. Deposits are not bank deposits and are not
                insured or protected by any deposit protection scheme.
              </p>
              <p>
                Regulatory approval and supervision described above apply only to the lending operation for each vault — CIMA for Commodity Yield,
                the FMA for Digital Assets Yield. This supervision covers the lending operation’s licensing, its ongoing reporting obligations, and
                its origination and management of the underlying loans.
              </p>
              <p>
                The SPV, the Kamino Institutional Yield vaults, and Kamino are not licensed, registered, or supervised by CIMA, the FMA, or any other
                financial regulator. Depositors do not receive deposit insurance, a regulatory guarantee, or any regulatory recourse as a result of
                a lending operation’s regulatory status. A depositor’s relationship to the structure is governed solely by the <A>Loan Agreement</A>
                , and their position is that of an unsecured creditor of the SPV.
              </p>
              <p>
                By depositing, you confirm that you have read all product <A>documentation</A>, including the <A>Loan Agreement</A>, and fully
                understood the risks set out in the Risk section.
              </p>
            </Card>
          </section>
        </>
      )}
    </PageFrame>
  );
}

function A({ children }: { children: string }) {
  return <span className="cursor-pointer text-secondary">{children}</span>;
}

function CardHeading({ children }: { children: string }) {
  return (
    <div className="flex items-center justify-between border-b border-border pb-4">
      <h3 className="text-[18px] font-medium">{children}</h3>
      <button type="button" className="flex cursor-pointer items-center gap-1.5 text-[15.5px] text-sidebar-foreground hover:text-foreground">
        Learn more
        <Icon name="arrowUpRight" size={15} />
      </button>
    </div>
  );
}

function FrameworkRow({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <div className="flex min-h-14 items-center gap-3 rounded-lg bg-background px-5 py-3 text-[15.5px]">
      <Icon name={icon} size={18} className="text-sidebar-foreground" />
      <span className="w-56 shrink-0 font-medium">{label}</span>
      <span className="min-w-0 flex-1 text-sidebar-foreground">{value}</span>
      <Icon name="chevronDown" size={15} className="text-sidebar-foreground" />
    </div>
  );
}

function SharePriceCard() {
  const [series, setSeries] = useState<"price" | "apy">("price");
  const [range, setRange] = useState<Range>("1Y");
  return (
    <div className="flex flex-col rounded-xl bg-muted">
      <div className="flex items-center justify-between gap-4 border-b border-border px-5">
        <div className="flex gap-5">
          {(
            [
              ["price", "Vault share price"],
              ["apy", "Vault APY"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              aria-pressed={series === key}
              onClick={() => setSeries(key)}
              className={`flex h-14 cursor-pointer items-center gap-2 border-b-2 px-1 text-[16px] ${
                series === key ? "border-secondary font-medium text-foreground" : "border-transparent text-sidebar-foreground"
              }`}
            >
              {label}
              {key === "apy" && <span className="rounded bg-[#edf2fa] px-1.5 font-mono text-[12px] text-secondary">7.79%</span>}
            </button>
          ))}
        </div>
        <RangeTabs value={range} onChange={setRange} />
      </div>
      <div className="flex flex-col gap-5 p-5">
        <div className="flex flex-col gap-1.5">
          <span className="text-[15.5px] text-sidebar-foreground">{series === "price" ? "Vault share price" : "Vault APY"}</span>
          <div className="flex flex-wrap items-baseline gap-2.5">
            <span className="font-mono text-[29px] font-medium tracking-tight">
              <BigValue value={series === "price" ? "$1.0214" : "7.79%"} />
            </span>
            {series === "price" && <span className="font-mono text-[16px] text-success">+$0.0298 (+2.02%)</span>}
          </div>
        </div>
        <MockChart
          lines={[{ values: mockSeries((series === "price" ? 5 : 9) + RANGES.indexOf(range) * 7), color: "#5381c4" }]}
          yLabels={CHART_Y_LABELS}
          xLabels={CHART_X_LABELS}
        />
      </div>
    </div>
  );
}

const fixed = (value: number, digits: number) =>
  value.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });

const SHARE_PRICE = 1.0214;
const APY = 0.0779;

function DepositPanel() {
  const [amount, setAmount] = useState("0");
  const dollars = Number(amount) || 0;
  const shares = dollars / SHARE_PRICE;
  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-[20px] font-medium">Open position</h2>
      <div className="flex flex-col gap-1 rounded-xl bg-muted p-5">
        <div className="flex items-center justify-between">
          <span className="text-[15.5px] text-sidebar-foreground">Deposit</span>
          <span className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-background px-3 text-[14px] font-medium">
            <Logo name="usdc" size={18} label="USDC" />
            USDC
          </span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <input
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))}
            aria-label="Deposit amount"
            className="w-full min-w-0 bg-transparent font-mono text-[34px] font-medium outline-none"
          />
          <span className="flex shrink-0 items-center gap-1 font-mono text-[13.5px] text-sidebar-foreground">
            ${fixed(dollars, dollars % 1 === 0 ? 0 : 2)}
            <Icon name="swapVertical" size={13} />
          </span>
        </div>
        <div className="flex justify-end gap-1.5">
          <span className="rounded-md bg-background px-2 text-[13px] font-medium">Half</span>
          <span className="rounded-md bg-background px-2 text-[13px] font-medium">Max</span>
        </div>
      </div>
      <div className="flex flex-col gap-1 rounded-xl border border-border p-5">
        <div className="flex items-center justify-between">
          <span className="text-[15.5px] text-sidebar-foreground">You receive</span>
          <span className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-background px-3 text-[14px] font-medium">
            <Logo name="kicusdc" size={18} label="kicUSDC" />
            kicUSDC
          </span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="font-mono text-[34px] font-medium text-muted-foreground">{shares === 0 ? "0" : fixed(shares, 4)}</span>
          <span className="flex shrink-0 items-center gap-1 font-mono text-[13.5px] text-sidebar-foreground">
            ${fixed(dollars, dollars % 1 === 0 ? 0 : 2)}
            <Icon name="swapVertical" size={13} />
          </span>
        </div>
      </div>
      <div className="flex flex-col gap-2.5 text-[14px]">
        <div className="flex justify-between">
          <span className="text-sidebar-foreground">Rate</span>
          <span className="font-mono text-success">7.79% APY</span>
        </div>
        <div className="flex justify-between">
          <span className="text-sidebar-foreground">Proj. Annual Return</span>
          <span className="flex items-center gap-1.5 font-mono">
            <Logo name="usdc" size={15} label="USDC" />
            {fixed(dollars * APY, 2)}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-sidebar-foreground">Instant Liquidity</span>
          <span className="font-mono">$3.74M</span>
        </div>
      </div>
      <button type="button" className="h-12 cursor-pointer rounded-lg bg-[#222] text-[15.5px] font-medium text-white hover:bg-black">
        Connect wallet
      </button>
    </div>
  );
}
