# Field catalog review

For review: value type, level and applicability were chosen during the build and haven't been agreed. The source of truth is `backend/src/db/catalog/fields.ts`; this file is a snapshot of it from 2026-11-03, with the asset types table updated on 2026-11-04. The stablecoin type (ST) was added that day. The per-field lists below predate it, so check `fields.ts` for where it applies.

## Asset types

Decide which fields normally apply to an asset. A single asset can still mark a field not applicable.

| Code | Asset type | Assets |
| --- | --- | --- |
| EQ | tokenized_equity | AAPLx, COINx, NVDAx, SPYx, CRCLx, FWDI, GLXY, GOOGLx, HOODx, METAx, MSTRx, QQQx, STRCx, TSLAx |
| FD | tokenized_fund | ACRED, AUTO, BUIDL, ONyc, OUSG, PRIME, syrupUSDC, USDY, USYC, nBASIS, nOPAL, oTFY, PST, reUSD, solmF-One, USCC, USTB |
| CM | tokenized_commodity | XAUm, XAUT |
| WR | wrapped_crypto | None currently |
| NT | native_crypto | NEAR |
| DF | defi_yield | sUSDe |
| ST | stablecoin | AUSD, CASH, EURC, EUROP, FDUSD, PYUSD, tGBP, USD1, USDC, USDe, USDG, USDS, USDT, USX |

Conflict order: RWA.xyz is always the primary source. After it, **Token, per chain** and **Control and upgradeability** use chain, official documents. Everything else uses official documents, chain.

The frontend names RWA.xyz once, in the banner on every page, rather than beside each value. Fields that only describe its records (`identity.rwa_xyz_slug`, `identity.logo`, `issuer.logo`) aren't shown to users or given to the agent.

## Identity (17)

| Key | Label | Value type | Level | Applies to | As-of required | Repeats as |
| --- | --- | --- | --- | --- | --- | --- |
| `identity.name` | Name | text | asset | all |  |  |
| `identity.ticker` | Ticker | text | asset | all |  |  |
| `identity.website` | Website | url | asset | all |  |  |
| `identity.isin` | ISIN | identifier | asset | EQ, FD |  |  |
| `identity.cusip` | CUSIP | identifier | asset | EQ, FD |  |  |
| `identity.inception_date` | Inception date | date | asset | all |  |  |
| `identity.reference_asset` | Reference asset | text | asset | EQ, FD, CM, WR, DF |  |  |
| `identity.underlying_ticker` | Underlying ticker | text | asset | EQ, CM, WR |  |  |
| `identity.reference_ratio` | Reference ratio | decimal | asset | EQ, CM, WR, DF | yes |  |
| `identity.description` | Description | long_text | asset | all |  |  |
| `identity.logo` | Logo | url | asset | all |  |  |
| `identity.brand_color` | Brand color | text | asset | all |  |  |
| `identity.reference_asset_isin` | Reference asset ISIN | identifier | asset | EQ |  |  |
| `identity.figi` | FIGI | identifier | asset | EQ, FD |  |  |
| `identity.coingecko_id` | CoinGecko ID | identifier | asset | all |  |  |
| `identity.equivalent_group_dti` | Equivalent group DTI | identifier | asset | all |  |  |
| `identity.rwa_xyz_slug` | RWA.xyz slug | identifier | asset | all |  |  |

## Classification (11)

| Key | Label | Value type | Level | Applies to | As-of required | Repeats as |
| --- | --- | --- | --- | --- | --- | --- |
| `classification.asset_class` | Asset class | enum | asset | all |  |  |
| `classification.sector` | Sector | list | asset | all |  |  |
| `classification.region` | Region | list | asset | EQ, FD, CM |  |  |
| `classification.type` | Type | enum | asset | all |  |  |
| `classification.tags` | Tags | list | asset | all |  |  |
| `classification.tokenization_type` | Tokenization type | list | asset | EQ, FD, CM, WR |  |  |
| `classification.tokenization_sponsorship` | Tokenization sponsorship | enum | asset | EQ, FD, CM, WR |  |  |
| `classification.tokenization_structure` | Tokenization structure | enum | asset | EQ, FD, CM, WR |  |  |
| `classification.claim_type` | Claim type | enum | asset | EQ, FD, CM, WR, DF |  |  |
| `classification.issuance_status` | Issuance status | enum | asset | all | yes |  |
| `classification.token_function` | Token function | enum | asset | all |  |  |

## Issuer (10)

| Key | Label | Value type | Level | Applies to | As-of required | Repeats as |
| --- | --- | --- | --- | --- | --- | --- |
| `issuer.name` | Issuer name | organization | asset | all |  |  |
| `issuer.legal_entity` | Legal entity | text | organization | all |  |  |
| `issuer.lei` | LEI | identifier | organization | EQ, FD, CM, WR |  |  |
| `issuer.cik` | CIK | identifier | organization | EQ, FD |  |  |
| `issuer.website` | Issuer website | url | organization | all |  |  |
| `issuer.legal_structure` | Legal structure | text | organization | all |  |  |
| `issuer.description` | Issuer description | long_text | organization | all |  |  |
| `issuer.logo` | Issuer logo | url | organization | all |  |  |
| `issuer.transparency_url` | Transparency URL | url | asset | EQ, FD, CM, WR, DF |  |  |
| `issuer.affiliate_entity` | Affiliate entity | list | organization | all |  |  |

## Legal and regulatory (13)

| Key | Label | Value type | Level | Applies to | As-of required | Repeats as |
| --- | --- | --- | --- | --- | --- | --- |
| `legal.domicile` | Domicile | text | asset | all |  |  |
| `legal.dispute_resolution` | Dispute resolution | long_text | asset | EQ, FD, CM, WR, DF |  |  |
| `legal.regulator` | Regulator | list | asset | EQ, FD, CM, WR | yes |  |
| `legal.regulatory_framework` | Regulatory framework | list | asset | EQ, FD, CM, WR | yes |  |
| `legal.bankruptcy_remote` | Bankruptcy remote | boolean | asset | EQ, FD, CM, WR |  |  |
| `legal.account_segregation` | Account segregation | boolean | asset | EQ, FD, CM, WR |  |  |
| `legal.jurisdiction` | Jurisdiction | text | asset | all |  |  |
| `legal.deposit_insurance` | Deposit insurance | boolean | asset | EQ, FD, CM |  |  |
| `legal.governing_law` | Governing law | text | asset | EQ, FD, CM, WR, DF |  |  |
| `legal.governing_law_subdivision` | Governing law subdivision | text | asset | EQ, FD, CM, WR, DF |  |  |
| `legal.mica_marker` | MiCA marker | enum | asset | all | yes |  |
| `legal.registration_number` | Registration or licence number | identifier | asset | EQ, FD, CM, WR |  |  |
| `legal.exemption_basis` | Exemption basis | text | asset | EQ, FD |  |  |

## Holder rights and backing (13)

| Key | Label | Value type | Level | Applies to | As-of required | Repeats as |
| --- | --- | --- | --- | --- | --- | --- |
| `holder.rights` | Holder rights | long_text | asset | EQ, FD, CM, WR, DF |  |  |
| `holder.fork_rights` | Fork rights | long_text | asset | WR, DF |  |  |
| `holder.holdings_security` | Holdings security | long_text | asset | EQ, FD, CM, WR |  |  |
| `holder.custody_description` | Custody description | long_text | asset | EQ, FD, CM, WR |  |  |
| `holder.peg_maintenance` | Peg maintenance | long_text | asset | CM, WR, DF, FD |  |  |
| `holder.voting_rights` | Voting rights | long_text | asset | EQ, FD, NT, DF |  |  |
| `holder.dividend_eligibility` | Dividend eligibility | boolean | asset | EQ |  |  |
| `holder.dividend_handling` | Dividend handling | long_text | asset | EQ |  |  |
| `holder.reserve_composition` | Reserve composition | long_text | asset | FD, CM, WR, DF | yes |  |
| `holder.storage_location` | Storage location | text | asset | CM |  |  |
| `holder.claims_seniority` | Claims seniority and loss order | long_text | asset | EQ, FD, CM, WR, DF |  |  |
| `holder.rights_modification` | Rights modification conditions | long_text | asset | EQ, FD, CM, WR, DF |  |  |
| `holder.authoritative_record` | Authoritative ownership record | text | asset | EQ, FD, CM, WR |  |  |

## Service providers (16)

| Key | Label | Value type | Level | Applies to | As-of required | Repeats as |
| --- | --- | --- | --- | --- | --- | --- |
| `provider.platform` | Platform | organization | asset | EQ, FD, CM, WR, DF |  |  |
| `provider.manager` | Manager | organization | asset | FD |  |  |
| `provider.sub_advisor` | Sub-advisor | organization | asset | FD |  |  |
| `provider.custodian` | Custodian | organization | asset | EQ, FD, CM, WR |  |  |
| `provider.crypto_custodian` | Crypto custodian | organization | asset | EQ, FD, CM, WR |  |  |
| `provider.transfer_agent` | Transfer agent | organization | asset | EQ, FD |  |  |
| `provider.fund_administrator` | Fund administrator | organization | asset | FD |  |  |
| `provider.traditional_broker` | Traditional broker | organization | asset | EQ |  |  |
| `provider.financial_auditor` | Financial or reserve auditor | organization | asset | EQ, FD, CM, WR | yes |  |
| `provider.custodian_legal_identifier` | Custodian legal identifier | identifier | asset | EQ, FD, CM, WR |  |  |
| `provider.crypto_broker` | Crypto broker | organization | asset | EQ |  |  |
| `provider.paying_agent` | Paying agent | organization | asset | EQ, FD |  |  |
| `provider.digital_transfer_agent` | Digital transfer agent | organization | asset | EQ, FD |  |  |
| `provider.security_trustee` | Security trustee | organization | asset | EQ, FD, CM |  |  |
| `provider.attestation_frequency` | Attestation frequency | text | asset | EQ, FD, CM, WR |  |  |
| `provider.transparency_method` | Transparency method | text | asset | EQ, FD, CM, WR, DF |  |  |

## Primary market (20)

| Key | Label | Value type | Level | Applies to | As-of required | Repeats as |
| --- | --- | --- | --- | --- | --- | --- |
| `primary.eligible_investors` | Eligible investors | list | asset | EQ, FD, CM, WR, DF |  |  |
| `primary.kyc_required` | KYC required | boolean | asset | EQ, FD, CM, WR, DF |  |  |
| `primary.base_assets` | Base assets | list | asset | EQ, FD, CM, WR, DF |  |  |
| `primary.subscription_time` | Subscription time | text | asset | EQ, FD, CM, WR, DF |  |  |
| `primary.redemption_time` | Redemption time | text | asset | EQ, FD, CM, WR, DF |  |  |
| `primary.open_ended` | Open-ended | boolean | asset | FD |  |  |
| `primary.kyc_description` | KYC description | long_text | asset | EQ, FD, CM, WR, DF |  |  |
| `primary.subscription_frequency` | Subscription frequency | text | asset | EQ, FD, CM, WR, DF |  |  |
| `primary.redemption_frequency` | Redemption frequency | text | asset | EQ, FD, CM, WR, DF |  |  |
| `primary.subscriptions_open` | Subscriptions open | boolean | asset | EQ, FD, CM, WR, DF | yes |  |
| `primary.redemptions_open` | Redemptions open | boolean | asset | EQ, FD, CM, WR, DF | yes |  |
| `primary.subscription_description` | Subscription description | long_text | asset | EQ, FD, CM, WR, DF |  |  |
| `primary.redemption_description` | Redemption description | long_text | asset | EQ, FD, CM, WR, DF |  |  |
| `primary.term` | Term | text | asset | FD |  |  |
| `primary.route` | Primary route | text | asset | EQ, FD, CM, WR, DF |  |  |
| `primary.eligible_jurisdictions` | Eligible jurisdictions | list | asset | EQ, FD, CM, WR, DF | yes |  |
| `primary.excluded_jurisdictions` | Excluded jurisdictions | list | asset | EQ, FD, CM, WR, DF | yes |  |
| `primary.right_to_redeem` | Right to redeem | boolean | asset | EQ, FD, CM, WR, DF |  |  |
| `primary.physical_redemption` | Physical redemption | boolean | asset | EQ, CM, WR |  |  |
| `primary.lockup_period` | Lockup period | text | asset | EQ, FD, CM, WR, DF |  |  |

## Token, per chain (13)

| Key | Label | Value type | Level | Applies to | As-of required | Repeats as |
| --- | --- | --- | --- | --- | --- | --- |
| `token.standard` | Token standard | list | token | all |  |  |
| `token.network` | Network | text | token | all |  |  |
| `token.contract_address` | Contract address | address | token | all |  |  |
| `token.decimals` | Decimals | integer | token | all |  |  |
| `token.issuance_type` | Issuance type | enum | token | all |  |  |
| `token.tokenization_type` | Tokenization type | enum | token | EQ, FD, CM, WR |  |  |
| `token.platform` | Platform | organization | token | EQ, FD, CM, WR, DF |  |  |
| `token.extensions` | Token extensions | list | token | all | yes |  |
| `token.admin_permissions` | Admin permissions | list | token | all | yes |  |
| `token.first_issued_date` | First issued date | date | token | all |  |  |
| `token.bridge_platforms` | Bridge platforms | list | token | all | yes |  |
| `token.dti` | DTI | identifier | token | all |  |  |
| `token.transferability` | Transferability | text | token | all | yes |  |

## Control and upgradeability (9)

| Key | Label | Value type | Level | Applies to | As-of required | Repeats as |
| --- | --- | --- | --- | --- | --- | --- |
| `control.contract_or_program` | Contract or program | text | contract | all |  | control |
| `control.authority_role` | Authority role | enum | contract | all |  | control |
| `control.holder_address` | Holder address | address | contract | all | yes | control |
| `control.holder_type` | Holder type | enum | contract | all | yes | control |
| `control.multisig_threshold` | Multisig threshold | text | contract | all | yes | control |
| `control.signers_disclosed` | Signers disclosed | boolean | contract | all | yes | control |
| `control.timelock_delay` | Timelock delay | text | contract | all | yes | control |
| `control.proxy_pattern` | Proxy pattern | text | contract | all | yes | control |
| `control.verified_source_status` | Verified source status | enum | contract | all | yes | control |

## Security and incidents (9)

| Key | Label | Value type | Level | Applies to | As-of required | Repeats as |
| --- | --- | --- | --- | --- | --- | --- |
| `security.audit_firm` | Smart contract audit firm | organization | asset | all |  | audit |
| `security.audit_date` | Audit date | date | asset | all |  | audit |
| `security.audit_scope` | Audit scope and version | long_text | asset | all |  | audit |
| `security.bug_bounty_platform` | Bug bounty platform | organization | asset | all | yes | bug_bounty |
| `security.incident_date` | Incident date | date | asset | all |  | incident |
| `security.incident_type` | Incident type | enum | asset | all |  | incident |
| `security.incident_affected_entity` | Incident affected entity | text | asset | all |  | incident |
| `security.incident_directly_affected` | Directly affected | boolean | asset | all |  | incident |
| `security.remediation_status` | Remediation status | enum | asset | all | yes | incident |

## Governance (4)

| Key | Label | Value type | Level | Applies to | As-of required | Repeats as |
| --- | --- | --- | --- | --- | --- | --- |
| `governance.model` | Governance model | text | asset | NT, DF | yes |  |
| `governance.decision_process` | Decision process and venue | long_text | asset | NT, DF | yes |  |
| `governance.governing_entity` | Governing entity | organization | asset | NT, DF | yes |  |
| `governance.parent_protocol` | Parent protocol | text | asset | DF, WR |  |  |

## Technology and dependencies (9)

| Key | Label | Value type | Level | Applies to | As-of required | Repeats as |
| --- | --- | --- | --- | --- | --- | --- |
| `technology.consensus_mechanism` | Consensus mechanism | text | network | all |  |  |
| `technology.network_layer` | Network layer | enum | network | all |  |  |
| `technology.parent_network` | Parent network | text | network | all |  |  |
| `technology.chain_id` | Chain ID | identifier | network | all |  |  |
| `technology.oracle_provider` | Oracle provider | organization | asset | all | yes | oracle |
| `technology.oracle_role` | Oracle role | text | asset | all | yes | oracle |
| `technology.protocol_dependencies` | Protocol dependencies | list | asset | all | yes |  |
| `technology.staking_design` | Staking design | long_text | asset | NT, DF |  |  |
| `technology.slashing_status` | Slashing status | enum | asset | NT, DF | yes |  |
