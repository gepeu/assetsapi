export const SOURCES = [
  { key: "rwa_xyz", name: "RWA.xyz", kind: "api" },
  { key: "official_documents", name: "Official documents", kind: "official_documents" },
  { key: "chain", name: "On-chain data", kind: "chain" },
  { key: "ai_researcher", name: "AI researcher", kind: "ai_researcher" },
  // Holds values a person enters for a manual override, so an override is always traceable.
  { key: "manual_review", name: "Manual review", kind: "manual_review" },
] as const;

/** First wins. AI claims verified against an official document rank as that document. */
export const CONFLICT_ORDER = {
  chain_first: ["chain", "rwa_xyz", "official_documents", "ai_researcher", "manual_review"],
  documents_first: ["official_documents", "rwa_xyz", "chain", "ai_researcher", "manual_review"],
} as const;

/**
 * Case-insensitive Postgres patterns. A claim whose value matches stays an attributed Claim and
 * never becomes a Fact. "Secured" and "Safe" (the multisig) deliberately don't match.
 */
export const SUBJECTIVE_TERMS = [
  { pattern: "\\mdecentrali[sz]ed\\M", note: "decentralized" },
  { pattern: "\\msecure\\M", note: "secure" },
  { pattern: "\\mfully[- ]audited\\M", note: "fully audited" },
  { pattern: "\\mtrustless\\M", note: "trustless" },
  { pattern: "\\mrisk[- ]free\\M", note: "risk-free" },
  { pattern: "\\mcensorship[- ]resistant\\M", note: "censorship-resistant" },
  { pattern: "\\mbattle[- ]tested\\M", note: "battle-tested" },
] as const;
