/** Turns rows into `/assets` and `/assets/{slug}`. */
import { ApiError } from '../api/errors.ts';
import type {
  AssetDetailQuery,
  AssetDetailResponse,
  AssetListQuery,
  AssetListResponse,
  Section,
} from '../api/schemas/assets.ts';
import type { Metrics } from '../api/schemas/shared.ts';
import { settings } from '../config.ts';
import type { Queryable } from '../db/pool.ts';
import { type AssetSort, countAssets, findActiveAssetBySlug, listAssetRows } from '../db/queries/assets.ts';
import { findAssetFieldValue } from '../db/queries/fieldValues.ts';
import {
  listAssetMetricValues,
  listServedAssetValues,
  listServedMetrics,
  listServedSolanaValues,
  listSolanaMetricValues,
  type MetricInfo,
} from '../db/queries/financials.ts';
import { listAssetOrganizations } from '../db/queries/organizations.ts';
import { listActiveTokens, listAssetNetworks } from '../db/queries/tokens.ts';
import { loadFields } from './fields.ts';
import { findLatestAsOf, loadSeries, loadValueByNetwork, toFinancials, toTerms } from './financials.ts';
import { HOLDER_SHARE_METRICS, loadHistory, toServableShare } from './history.ts';
import { parseList, toGroupKey } from './names.ts';
import { loadTokens } from './tokens.ts';

/** The numbers an asset carries unless a request names others. */
const KEY_METRICS = [
  'price_dollar',
  'net_asset_value_dollar',
  'total_asset_value_dollar',
  'apy_30_day',
  'holding_addresses_count',
] as const;

const SORT_BY_TICKER = 'ticker';

const isHolderShare = (metric: string): boolean => HOLDER_SHARE_METRICS.includes(metric);

/** Every name must be one the catalog lists, so a typo is a 400 rather than an empty answer. */
function requireKnownMetrics(known: readonly MetricInfo[], names: readonly string[]): void {
  const unknown = names.find((name) => !known.some((metric) => metric.slug === name));
  if (unknown !== undefined) {
    throw new ApiError('bad_request', `Unknown metric: ${unknown}. /assets/catalog lists them`);
  }
}

export async function listAssets(db: Queryable, query: Partial<AssetListQuery>): Promise<AssetListResponse> {
  const sentMetrics = parseList(query.metrics);
  const metrics = sentMetrics ?? KEY_METRICS;
  const sortParameter = query.sort ?? SORT_BY_TICKER;
  const descending = sortParameter.startsWith('-');
  const sortName = descending ? sortParameter.slice(1) : sortParameter;

  const solanaMetrics = parseList(query.solanaMetrics);
  const sentNames = [
    ...(sentMetrics ?? []),
    ...(solanaMetrics ?? []),
    ...(sortName === SORT_BY_TICKER ? [] : [sortName]),
  ];
  if (sentNames.length > 0) requireKnownMetrics(await listServedMetrics(db), sentNames);

  const sort: AssetSort =
    sortName === SORT_BY_TICKER
      ? { by: 'ticker' }
      : { by: 'metric', metric: sortName, scope: isHolderShare(sortName) ? 'solana' : 'asset' };
  const filters = {
    assetClass: query.assetClass ?? null,
    assetType: query.assetType ?? null,
    network: query.network ?? null,
    q: query.q ?? null,
  };
  const limit = query.limit ?? settings.api.defaultPageSize;
  const offset = query.offset ?? 0;

  const [rows, total] = await Promise.all([
    listAssetRows(db, { ...filters, sort, descending, limit, offset }),
    countAssets(db, filters),
  ]);

  const assetIds = rows.map((row) => row.id);
  const holderShares = metrics.filter(isHolderShare);
  const [assetValues, solanaValues, solanaTokenValues, solanaTokens] = await Promise.all([
    listAssetMetricValues(
      db,
      assetIds,
      metrics.filter((metric) => !isHolderShare(metric))
    ),
    holderShares.length > 0 ? listSolanaMetricValues(db, assetIds, holderShares) : [],
    solanaMetrics ? listSolanaMetricValues(db, assetIds, solanaMetrics) : [],
    query.include === 'tokens' ? listActiveTokens(db, assetIds, 'solana') : undefined,
  ]);
  const valueByCell = new Map<string, number | null>([
    ...assetValues.map((row): [string, number | null] => [`${row.asset_id}|${row.metric}`, row.value]),
    ...solanaValues.map((row): [string, number | null] => [
      `${row.asset_id}|${row.metric}`,
      toServableShare(row.value),
    ]),
  ]);
  const solanaValueByCell = new Map(
    solanaTokenValues.map((row): [string, number | null] => [
      `${row.asset_id}|${row.metric}`,
      isHolderShare(row.metric) ? toServableShare(row.value) : row.value,
    ])
  );

  return {
    data: rows.map((row) => ({
      slug: row.slug,
      ticker: row.ticker,
      name: row.name,
      assetClass: row.asset_class,
      assetType: row.asset_type,
      issuer: row.issuer,
      asOf: row.as_of,
      metrics: Object.fromEntries(metrics.map((metric) => [metric, valueByCell.get(`${row.id}|${metric}`) ?? null])),
      ...(solanaMetrics && {
        solanaMetrics: Object.fromEntries(
          solanaMetrics.map((metric) => [metric, solanaValueByCell.get(`${row.id}|${metric}`) ?? null])
        ),
      }),
      ...(solanaTokens && {
        tokens: solanaTokens
          .filter((token) => token.asset_id === row.id)
          .map((token) => ({ network: { key: token.network_key, name: token.network_name }, address: token.address })),
      }),
    })),
    meta: { total, limit, offset },
  };
}

/** A filter for a section that wasn't requested would do nothing, so it's refused rather than ignored. */
function requireSections(query: Partial<AssetDetailQuery>, sections: readonly string[]): void {
  const needs: [string | undefined | boolean, string, string][] = [
    [query.groups, 'groups', 'financials'],
    [query.financialMetrics, 'financialMetrics', 'financials'],
    [query.categories, 'categories', 'fields'],
    [query.empty, 'empty', 'fields'],
    [query.network, 'network', 'tokens'],
  ];
  for (const [value, parameter, section] of needs) {
    if (value !== undefined && !sections.includes(section)) {
      throw new ApiError('bad_request', `${parameter} needs include=${section}`);
    }
  }
  if (query.range !== undefined && query.history === undefined) {
    throw new ApiError('bad_request', 'range needs history');
  }
}

function requireKnownGroups(known: readonly MetricInfo[], groups: readonly string[]): void {
  const names = new Set(known.map((metric) => toGroupKey(metric.group)));
  const unknown = groups.find((group) => !names.has(group));
  if (unknown !== undefined) {
    throw new ApiError('bad_request', `Unknown group: ${unknown}. /assets/catalog lists them`);
  }
}

/**
 * The core, plus whichever sections were asked for. Only those are queried. Null when the asset is
 * unknown or deactivated.
 */
export async function getAsset(
  db: Queryable,
  slug: string,
  query: Partial<AssetDetailQuery> = {}
): Promise<AssetDetailResponse | null> {
  const sections = (parseList(query.include) ?? []) as Section[];
  requireSections(query, sections);
  const wants = (section: Section) => sections.includes(section);

  const asset = await findActiveAssetBySlug(db, slug);
  if (!asset) return null;

  const sentMetrics = parseList(query.metrics);
  const metrics = sentMetrics ?? KEY_METRICS;
  const groups = parseList(query.groups);
  const financialMetrics = parseList(query.financialMetrics);
  const historyMetrics = parseList(query.history);

  const namesAreSent = sentMetrics || groups || financialMetrics || historyMetrics;
  const known = namesAreSent ? await listServedMetrics(db) : [];
  requireKnownMetrics(known, [...(sentMetrics ?? []), ...(financialMetrics ?? []), ...(historyMetrics ?? [])]);
  requireKnownGroups(known, groups ?? []);

  const needsHolderShares = wants('financials') || metrics.some(isHolderShare);
  const [description, organizations, networks, assetRows, solanaRows] = await Promise.all([
    findAssetFieldValue(db, asset.id, 'identity.description'),
    listAssetOrganizations(db, asset.id),
    listAssetNetworks(db, asset.id),
    listServedAssetValues(db, asset.id),
    needsHolderShares ? listServedSolanaValues(db, asset.id, HOLDER_SHARE_METRICS) : [],
  ]);

  const [series, valueByNetwork, fields, tokens, history] = await Promise.all([
    wants('series') ? loadSeries(db, asset.id) : undefined,
    wants('valueByNetwork') ? loadValueByNetwork(db, asset.id) : undefined,
    wants('fields')
      ? loadFields(db, asset.id, networks, { categories: parseList(query.categories), empty: query.empty ?? true })
      : undefined,
    wants('tokens') ? loadTokens(db, asset.id, query.network ?? null) : undefined,
    historyMetrics
      ? loadHistory(
          db,
          asset.id,
          historyMetrics.flatMap((name) => known.find((metric) => metric.slug === name) ?? []),
          query.range
        )
      : undefined,
  ]);

  const readMetric = (metric: string): number | null =>
    isHolderShare(metric)
      ? toServableShare(solanaRows.find((row) => row.metric === metric)?.value ?? null)
      : (assetRows.find((row) => row.metric === metric)?.value ?? null);
  const coreMetrics: Metrics = Object.fromEntries(metrics.map((metric) => [metric, readMetric(metric)]));

  return {
    data: {
      slug: asset.slug,
      ticker: asset.ticker,
      name: asset.name,
      assetClass: asset.asset_class,
      assetType: asset.asset_type,
      description: typeof description === 'string' ? description : null,
      issuer: organizations.find((organization) => organization.role === 'issuer')?.name ?? null,
      organizations: organizations.map((organization) => ({
        slug: organization.slug,
        name: organization.name,
        role: organization.role,
        legalName: organization.legal_name,
      })),
      networks: networks.map((network) => ({ key: network.key, name: network.name })),
      asOf: findLatestAsOf(assetRows),
      metrics: coreMetrics,
      ...(wants('financials') && {
        financials: toFinancials(assetRows, solanaRows, { groups, metrics: financialMetrics }),
      }),
      ...(series && { series }),
      ...(valueByNetwork && { valueByNetwork }),
      ...(wants('terms') && { terms: toTerms(assetRows) }),
      ...(fields && { fields }),
      ...(tokens && { tokens }),
      ...(history && { history }),
    },
  };
}
