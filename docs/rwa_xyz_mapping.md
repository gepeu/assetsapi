# RWA.xyz field mapping

The loader only reads the fields listed here (`backend/src/rwaXyz/mapping.ts`); every other API field is ignored. Names were checked against a real response on 2026-11-03.

API: `https://api.rwa.xyz/v4`, with a bearer token. Used: `GET /assets/{id}`, `GET /assets?ticker=`, `GET /tokens?asset_id=`, `GET /tokens?address=`, `GET /networks/{id}`.

**Rules.** A null from the API adds no claim, so the field stays never checked. Organization values are read from `name`, `slug` and `legal_name` only.

## Differences from the published schema

- Assets return `tokenization_types` and `transferability_types` (lists), not the singular fields the schema shows; tokens return the singular ones.
- Primary market data is read from the `primary_markets` array, using `kyc_is_required`, `is_subscription_allowed`, `is_redemption_allowed`, `allowed_investor_types` and `base_asset_ticker`, not the schema's flattened `primary_market__*` names.
- Assets also return undocumented `status`, `asset_status` and `investment_status`.

## Asset fields

| Catalog field | RWA.xyz field |
| --- | --- |
| `identity.name` | `name` |
| `identity.ticker` | `ticker` |
| `identity.website` | `website` |
| `identity.isin` | `isin` |
| `identity.cusip` | `cusip` |
| `identity.inception_date` | `inception_date` |
| `identity.reference_asset` | `pegged_asset.name` |
| `identity.underlying_ticker` | `pegged_asset.ticker` |
| `identity.reference_ratio` | `asset_to_pegged_asset_ratio` |
| `identity.description` | `description` |
| `identity.logo` | `icon_url` |
| `identity.brand_color` | `color_hex` |
| `identity.reference_asset_isin` | `pegged_asset.isin` |
| `identity.rwa_xyz_slug` | `slug` |
| `classification.asset_class` | `asset_class_name` |
| `classification.sector` | `sector_names` |
| `classification.region` | `region_names` |
| `classification.type` | `type` |
| `classification.tokenization_type` | `tokenization_types` |
| `classification.tokenization_sponsorship` | `tokenization_sponsorship_type` |
| `classification.tokenization_structure` | `tokenization_structure` |
| `classification.issuance_status` | `asset_status, status` |
| `issuer.name` | `issuer` |
| `issuer.transparency_url` | `transparency_url` |
| `legal.domicile` | `legal_structure__country_name` |
| `legal.dispute_resolution` | `dispute_resolution_description, dispute_resolution_country_name` |
| `legal.regulator` | `governing_body` |
| `legal.regulatory_framework` | `regulatory_framework` |
| `legal.bankruptcy_remote` | `are_holdings_bankruptcy_remote` |
| `legal.account_segregation` | `are_accounts_segregated` |
| `legal.jurisdiction` | `jurisdiction_country_name` |
| `legal.deposit_insurance` | `has_deposit_insurance` |
| `legal.registration_number` | `regulatory_registration_number` |
| `holder.rights` | `holder_rights_description` |
| `holder.fork_rights` | `fork_rights_description, has_fork_rights` |
| `holder.holdings_security` | `holdings_security_description` |
| `holder.custody_description` | `custody_description` |
| `holder.peg_maintenance` | `peg_maintenance_description` |
| `provider.manager` | `manager` |
| `provider.sub_advisor` | `sub_advisor` |
| `provider.custodian` | `traditional_custodian` |
| `provider.crypto_custodian` | `crypto_custodian` |
| `provider.transfer_agent` | `transfer_agent` |
| `provider.fund_administrator` | `fund_administrator` |
| `provider.traditional_broker` | `traditional_broker` |
| `provider.financial_auditor` | `auditor` |
| `provider.custodian_legal_identifier` | `traditional_custodian.lei` |
| `provider.crypto_broker` | `crypto_broker` |
| `provider.paying_agent` | `paying_agent` |
| `provider.transparency_method` | `transparency_type, transparency_description` |
| `primary.eligible_investors` | `primary_markets[].allowed_investor_types` |
| `primary.kyc_required` | `primary_markets[].kyc_is_required` |
| `primary.base_assets` | `primary_markets[].base_asset_ticker` |
| `primary.open_ended` | `is_open_ended` |
| `primary.kyc_description` | `primary_markets[].kyc_description` |
| `primary.subscription_frequency` | `primary_markets[].subscription_frequency` |
| `primary.redemption_frequency` | `primary_markets[].redemption_frequency` |
| `primary.subscriptions_open` | `primary_markets[].is_subscription_allowed` |
| `primary.redemptions_open` | `primary_markets[].is_redemption_allowed` |
| `primary.subscription_description` | `primary_markets[].subscription_description` |
| `primary.redemption_description` | `primary_markets[].redemption_description` |
| `primary.term` | `term_description, term_length_years` |
| `primary.right_to_redeem` | `holder_has_right_to_redeem` |
| `primary.lockup_period` | `lockup_description, lockup_period_months` |

`provider.platform` is set from the tokens' `platform`, and only when all of an asset's tokens share one.

## Issuer fields (claims about the organization)

| Catalog field | RWA.xyz field |
| --- | --- |
| `issuer.legal_entity` | `issuer.legal_name` |
| `issuer.lei` | `issuer.lei` |
| `issuer.cik` | `issuer.cik` |
| `issuer.website` | `issuer.website` |
| `issuer.legal_structure` | `issuer.legal_structure_type` |
| `issuer.description` | `issuer.description` |
| `issuer.logo` | `issuer.icon_url` |

## Token fields (one set per chain)

| Catalog field | RWA.xyz field |
| --- | --- |
| `token.standard` | `standards` |
| `token.network` | `network.name` |
| `token.contract_address` | `address` |
| `token.decimals` | `decimals` |
| `token.issuance_type` | `issuance_type` |
| `token.tokenization_type` | `tokenization_type` |
| `token.platform` | `platform` |
| `token.transferability` | `transferability_description, transferability_type` |

## Network fields

| Catalog field | RWA.xyz field |
| --- | --- |
| `technology.network_layer` | `layer_description` |
| `technology.chain_id` | `evm_chain_id` |
| `technology.parent_network` | `parent_network.name (looked up by parent_network_id)` |

## Catalog fields with no RWA.xyz source (61)

Official documents, the chain and the AI researcher must cover these.

- **Identity:** `identity.figi`, `identity.coingecko_id`, `identity.equivalent_group_dti`
- **Classification:** `classification.tags`, `classification.claim_type`, `classification.token_function`
- **Issuer:** `issuer.affiliate_entity`
- **Legal and regulatory:** `legal.governing_law`, `legal.governing_law_subdivision`, `legal.mica_marker`, `legal.exemption_basis`
- **Holder rights and backing:** `holder.voting_rights`, `holder.dividend_eligibility`, `holder.dividend_handling`, `holder.reserve_composition`, `holder.storage_location`, `holder.claims_seniority`, `holder.rights_modification`, `holder.authoritative_record`
- **Service providers:** `provider.digital_transfer_agent`, `provider.security_trustee`, `provider.attestation_frequency`
- **Primary market:** `primary.subscription_time`, `primary.redemption_time`, `primary.route`, `primary.eligible_jurisdictions`, `primary.excluded_jurisdictions`, `primary.physical_redemption`
- **Token, per chain:** `token.extensions`, `token.admin_permissions`, `token.first_issued_date`, `token.bridge_platforms`, `token.dti`
- **Control and upgradeability:** `control.contract_or_program`, `control.authority_role`, `control.holder_address`, `control.holder_type`, `control.multisig_threshold`, `control.signers_disclosed`, `control.timelock_delay`, `control.proxy_pattern`, `control.verified_source_status`
- **Security and incidents:** `security.audit_firm`, `security.audit_date`, `security.audit_scope`, `security.bug_bounty_platform`, `security.incident_date`, `security.incident_type`, `security.incident_affected_entity`, `security.incident_directly_affected`, `security.remediation_status`
- **Governance:** `governance.model`, `governance.decision_process`, `governance.governing_entity`, `governance.parent_protocol`
- **Technology and dependencies:** `technology.consensus_mechanism`, `technology.oracle_provider`, `technology.oracle_role`, `technology.protocol_dependencies`, `technology.staking_design`, `technology.slashing_status`

## RWA.xyz fields that stay unmapped

The sample asset has 278 fields and the sample token 160.

**Asset, outside the scope rule (156):** `accounting_basis`, `accounting_basis_description`, `accounting_frequency_type`, `accounting_frequency_type_id`, `adjusted_daily_burns_dollar`, `adjusted_daily_burns_token`, `adjusted_daily_mints_dollar`, `adjusted_daily_mints_token`, `adjusted_holding_addresses_count`, `annual_return_target_description`, `annually_active_addresses_count`, `apy_30_day`, `apy_7_day`, `available_capacity_dollar`, `available_capacity_token`, `bridge_token_count`, `bridged_token_market_cap_dollar`, `bridged_token_supply_token`, `bridged_token_value_dollar`, `cash_drag_percent`, `circulating_asset_value_dollar`, `circulating_market_value_dollar`, `circulating_supply_token`, `cumulative_interest_earned_dollar`, `cumulative_interest_earned_token`, `cumulative_issued_amount_dollar`, `cumulative_issued_amount_token`, `cumulative_repaid_principal_dollar`, `cumulative_repaid_principal_token`, `cumulative_repo_collateral_volume`, `cumulative_repo_issuance_volume`, `cumulative_repo_trade_count`, `daily_active_addresses_count`, `daily_bridge_inflow_volume`, `daily_bridge_outflow_volume`, `daily_bridge_volume`, `daily_burns_dollar`, `daily_burns_token`, `daily_mints_dollar`, `daily_mints_token`, `daily_transfer_volume_dollar`, `daily_transfer_volume_token`, `daily_yield_distributed_dollar`, `daily_yield_distributed_token`, `daily_yield_rate`, `defaulted_loans_amount_dollar`, `defaulted_loans_amount_percent`, `denomination_asset_id`, `denomination_asset_ticker`, `distributes_income`, `distribution_frequency_type`, `drawndown_assets_dollar`, `drawndown_assets_token`, `fair_value_input_level`, `fee_structure_description`, `funded_assets_dollar`, `funded_assets_token`, `has_bridge_tokens`, `holding_addresses_count`, `hypothetical_10_000_performance`, `idle_capital_dollar`, `idle_capital_token`, `interest_paid_dollar`, `interest_paid_token`, `is_investable`, `is_yield_bearing`, `m2_money_stock_dollar`, `market_cap_dollar`, `market_value_dollar`, `maximum_capacity_dollar`, `monthly_active_addresses_count`, `monthly_bridge_inflow_volume`, `monthly_bridge_outflow_volume`, `monthly_bridge_volume`, `monthly_transfer_count`, `monthly_transfer_volume`, `nav_reflects_income_only`, `net_asset_value_dollar`, `net_asset_value_token`, `number_of_active_loans`, `number_of_daily_transactions_count`, `number_of_defaulted_loans`, `number_of_loans_funded`, `other_fees_description`, `outstanding_capital_dollar`, `outstanding_principal_dollar`, `outstanding_principal_token`, `price_dollar`, `primary_market__base_asset_ticker`, `primary_market__investor_types`, `primary_market__is_kyc_required`, `primary_market__kyc_provider_id`, `primary_market__minimum_subscription_amt`, `primary_market__redemption_description`, `primary_market__redemption_fee_bps`, `primary_market__redemption_frequency`, `primary_market__subscription_description`, `primary_market__subscription_fee_bps`, `primary_market__subscription_frequency`, `primary_market_non_pegged_asset`, `primary_market_pegged_asset`, `principal_paid_dollar`, `principal_paid_token`, `quarterly_active_addresses_count`, `ratings`, `raw_supply`, `rebase_multiplier`, `recovered_assets_dollar`, `recovered_assets_token`, `repo_loan_to_value_ratio`, `return_target`, `secured_overnight_financing_rate`, `since_inception_return_percent`, `sp_rating`, `top_10_holder_concentration`, `top_5_holder_concentration`, `top_holder_concentration`, `total_asset_value_dollar`, `total_asset_value_token`, `total_collateralized_funds`, `total_contracts`, `total_issued_funds`, `total_management_fee_bps`, `total_performance_fee_bps`, `total_supply_token`, `total_token_inflow`, `total_token_outflow`, `trailing_1_month_return_percent`, `trailing_1_year_return_percent`, `trailing_30_day_active_addresses_count`, `trailing_30_day_bridge_inflow_volume`, `trailing_30_day_bridge_outflow_volume`, `trailing_30_day_bridge_volume`, `trailing_30_day_transfer_count`, `trailing_30_day_transfer_volume`, `trailing_365_day_active_addresses_count`, `trailing_3_month_return_percent`, `trailing_7_day_active_addresses_count`, `trailing_7_day_bridge_inflow_volume`, `trailing_7_day_bridge_outflow_volume`, `trailing_7_day_bridge_volume`, `trailing_7_day_return_percent`, `trailing_7_day_transfer_count`, `trailing_7_day_transfer_volume`, `trailing_90_day_active_addresses_count`, `weekly_active_addresses_count`, `weekly_bridge_inflow_volume`, `weekly_bridge_outflow_volume`, `weekly_bridge_volume`, `weekly_transfer_count`, `weekly_transfer_volume`, `weighted_average_maturity_years`, `written_off_principal_dollar`, `written_off_principal_token`, `year_to_date_return_percent`, `yield_to_maturity_percent`

**Asset, other (64):** `_created_at`, `_updated_at`, `accounts_segregated_description`, `asset_class`, `asset_class_id`, `asset_id`, `asset_pool_id`, `auditor_id`, `base_protocol_ids`, `crypto_broker_id`, `crypto_custodian_id`, `deployed_contract_id`, `deposit_insurance_description`, `dispute_resolution_country`, `dispute_resolution_country_id`, `exchange_agent`, `exchange_agent_id`, `fund_administrator_id`, `has_native_tokens`, `has_single_holding`, `hidden`, `holdings_are_all_secured`, `holdings_bankruptcy_remote_description`, `id`, `investment_status`, `investment_strategy_type`, `investment_strategy_type_id`, `is_tokenized`, `issuer_id`, `issuer_name`, `jurisdiction_country`, `jurisdiction_country_id`, `legal_structure__country_id`, `legal_structure__description`, `legal_structure__document_description`, `legal_structure__document_name`, `legal_structure__document_url`, `management_mechanism_type`, `management_team_description`, `manager_id`, `master_fund_id`, `native_token_count`, `network_ids`, `network_names`, `paying_agent_id`, `pegged_asset_id`, `pegged_asset_name`, `primary_market`, `protocol_ids`, `real_estate_property`, `region_ids`, `sector_ids`, `stats_available`, `sub_advisor_id`, `token_count`, `tokenization_type_ids`, `tokens`, `traditional_broker_id`, `traditional_custodian_id`, `transfer_agent_id`, `transferability_type_ids`, `transferability_types`, `underlying_asset_classes`, `unit`

**Token, outside the scope rule (122):** `adjusted_daily_burns_dollar`, `adjusted_daily_burns_token`, `adjusted_daily_mints_dollar`, `adjusted_daily_mints_token`, `adjusted_holding_addresses_count`, `annually_active_addresses_count`, `apy_30_day`, `apy_7_day`, `available_capacity_dollar`, `available_capacity_token`, `bridged_token_market_cap_dollar`, `bridged_token_supply_token`, `bridged_token_value_dollar`, `cash_drag_percent`, `circulating_asset_value_dollar`, `circulating_market_value_dollar`, `circulating_supply_token`, `cumulative_interest_earned_dollar`, `cumulative_interest_earned_token`, `cumulative_issued_amount_dollar`, `cumulative_issued_amount_token`, `cumulative_repaid_principal_dollar`, `cumulative_repaid_principal_token`, `cumulative_repo_collateral_volume`, `cumulative_repo_issuance_volume`, `cumulative_repo_trade_count`, `daily_active_addresses_count`, `daily_asset_performance_rate`, `daily_bridge_inflow_volume`, `daily_bridge_outflow_volume`, `daily_bridge_volume`, `daily_burns_dollar`, `daily_burns_token`, `daily_mints_dollar`, `daily_mints_token`, `daily_transfer_volume_dollar`, `daily_transfer_volume_token`, `daily_yield_distributed_dollar`, `daily_yield_distributed_token`, `daily_yield_rate`, `defaulted_loans_amount_dollar`, `defaulted_loans_amount_percent`, `drawndown_assets_dollar`, `drawndown_assets_token`, `funded_assets_dollar`, `funded_assets_token`, `holding_addresses_count`, `hypothetical_10_000_performance`, `idle_capital_dollar`, `idle_capital_token`, `interest_paid_dollar`, `interest_paid_token`, `m2_money_stock`, `market_value_dollar`, `maximum_capacity_dollar`, `monthly_active_addresses_count`, `monthly_bridge_inflow_volume`, `monthly_bridge_outflow_volume`, `monthly_bridge_volume`, `monthly_transfer_count`, `monthly_transfer_volume`, `net_asset_value_dollar`, `net_asset_value_token`, `number_of_active_loans`, `number_of_daily_transactions_count`, `number_of_defaulted_loans`, `number_of_loans_funded`, `outstanding_capital_dollar`, `outstanding_principal_dollar`, `outstanding_principal_token`, `price_dollar`, `principal_paid_dollar`, `principal_paid_token`, `quarterly_active_addresses_count`, `raw_supply`, `rebase_multiplier`, `rebase_transfer_unit`, `recovered_assets_dollar`, `recovered_assets_token`, `repo_loan_to_value_ratio`, `secured_overnight_financing_rate`, `since_inception_return_percent`, `top_10_holder_concentration`, `top_5_holder_concentration`, `top_holder_concentration`, `total_asset_value_dollar`, `total_asset_value_token`, `total_collateralized_funds`, `total_contracts`, `total_issued_funds`, `total_supply_token`, `total_token_inflow`, `total_token_outflow`, `trailing_1_month_return_percent`, `trailing_1_year_return_percent`, `trailing_30_day_active_addresses_count`, `trailing_30_day_bridge_inflow_volume`, `trailing_30_day_bridge_outflow_volume`, `trailing_30_day_bridge_volume`, `trailing_30_day_transfer_count`, `trailing_30_day_transfer_volume`, `trailing_365_day_active_addresses_count`, `trailing_3_month_return_percent`, `trailing_7_day_active_addresses_count`, `trailing_7_day_bridge_inflow_volume`, `trailing_7_day_bridge_outflow_volume`, `trailing_7_day_bridge_volume`, `trailing_7_day_return_percent`, `trailing_7_day_transfer_count`, `trailing_7_day_transfer_volume`, `trailing_90_day_active_addresses_count`, `weekly_active_addresses_count`, `weekly_bridge_inflow_volume`, `weekly_bridge_outflow_volume`, `weekly_bridge_volume`, `weekly_transfer_count`, `weekly_transfer_volume`, `weighted_average_maturity`, `written_off_principal_dollar`, `written_off_principal_token`, `year_to_date_return_percent`, `yield_to_maturity`

**Token, other (29):** `asset`, `asset_class`, `asset_class_id`, `asset_id`, `asset_manager`, `asset_manager_id`, `asset_status`, `base_protocol`, `base_protocol_id`, `base_protocol_name`, `hidden`, `id`, `investment_status`, `issuer`, `name`, `network_id`, `network_name`, `parent_network`, `parent_network_id`, `platform_id`, `platform_name`, `protocol`, `protocol_id`, `protocol_name`, `status`, `token_id`, `tokenization_type_id`, `transferability_type_id`, `wrapped_token_id`
