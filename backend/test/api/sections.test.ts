/** Tests for what `GET /tokenized_assets/{slug}` accepts and returns over HTTP. */
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { coversRoutes } from '../helpers/coversRoutes.ts';
import { type ApiHarness, createApiHarness, makeAsset } from '../helpers/fakeProvider.ts';

const BASE = '/tokenized_assets/asset-1';
const CORE = [
  'asOf',
  'assetClass',
  'assetType',
  'description',
  'issuer',
  'metrics',
  'name',
  'networks',
  'organizations',
  'slug',
  'ticker',
];

coversRoutes(['GET /tokenized_assets/{slug}']);

describe('GET /tokenized_assets/{slug}', () => {
  let harness: ApiHarness;

  before(async () => {
    harness = await createApiHarness([makeAsset({ ref: '1' })]);
  });
  after(() => harness.close());

  const get = (url: string) => harness.get(url);
  const load = async (query: string) => {
    const response = await get(`${BASE}?${query}`);
    assert.equal(response.statusCode, 200, query);
    return response.json().data;
  };

  test('with no parameters, only the core comes back', async () => {
    const data = (await get(BASE)).json().data;
    assert.deepEqual(Object.keys(data).sort(), CORE);
  });

  test('each section appears only when asked for', async () => {
    for (const section of ['financials', 'series', 'valueByNetwork', 'terms', 'fields', 'tokens']) {
      const data = await load(`include=${section}`);
      assert.deepEqual(Object.keys(data).sort(), [...CORE, section].sort(), section);
    }
    assert.deepEqual(Object.keys(await load('history=price_dollar')).sort(), [...CORE, 'history'].sort());
  });

  test('several sections and history come back in one call', async () => {
    const data = await load('include=financials,series,valueByNetwork,terms,fields,tokens&history=price_dollar');
    assert.deepEqual(
      Object.keys(data).sort(),
      [...CORE, 'financials', 'series', 'valueByNetwork', 'terms', 'fields', 'tokens', 'history'].sort()
    );
  });

  test('financials carry their labels and past values', async () => {
    const { financials } = await load('include=financials');
    const price = financials.find((row: { metric: string }) => row.metric === 'price_dollar');
    assert.equal(price.value, 2);
    assert.equal(price.scope, 'asset');
    assert.equal(price.unit, 'dollar');
    assert.equal(price.group, 'Value');
    assert.equal(price.value30d, 0);
  });

  test('every field value type survives serialisation', async () => {
    const { fields } = await load('include=fields');
    assert.deepEqual(Object.keys(fields).sort(), ['categories', 'coverage']);
    const all = fields.categories.flatMap((category: { fields: object[] }) => category.fields) as {
      key: string;
      value: unknown;
    }[];
    assert.equal(all.find((field) => field.key === 'identity.name')?.value, 'Asset 1');
    assert.deepEqual(all.find((field) => field.key === 'classification.sector')?.value, ['Cash']);
    assert.equal(all.find((field) => field.key === 'identity.website')?.value, null);
  });

  test('terms keep their types through serialisation', async () => {
    const { terms } = await load('include=terms');
    assert.equal(terms.find((row: { key: string }) => row.key === 'total_management_fee_bps').value, 25);
  });

  test('tokens have one row each, with a plain metrics map', async () => {
    const { tokens } = await load('include=tokens');
    assert.equal(tokens.length, 2);
    assert.deepEqual(Object.keys(tokens[0]).sort(), [
      'address',
      'asOf',
      'fields',
      'issuanceType',
      'metrics',
      'network',
    ]);
    assert.deepEqual(Object.keys(tokens[0].metrics).sort(), [
      'holding_addresses_count',
      'market_value_dollar',
      'total_asset_value_dollar',
      'total_supply_token',
    ]);
  });

  test('tokens filter by network', async () => {
    const { tokens } = await load('include=tokens&network=solana');
    assert.deepEqual(
      tokens.map((row: { network: { key: string } }) => row.network.key),
      ['solana']
    );
  });

  test('history points serialise as [day, number] pairs, one series per metric', async () => {
    const { history } = await load('history=price_dollar,apy_30_day&range=all');
    assert.deepEqual(history, [
      {
        metric: 'price_dollar',
        label: 'Price',
        unit: 'dollar',
        scope: 'asset',
        points: [
          ['2026-11-01', 2],
          ['2026-11-02', 3],
          ['2026-11-03', 4],
          ['2026-11-04', 5],
        ],
      },
      { metric: 'apy_30_day', label: 'APY (30-day)', unit: 'percent', scope: 'asset', points: [] },
    ]);
  });

  test('every range is accepted', async () => {
    for (const range of ['7d', '30d', '3m', '1y', 'all']) await load(`history=price_dollar&range=${range}`);
  });

  for (const [query, why] of [
    ['unknown=1', 'an unknown parameter'],
    ['include=history', "history isn't a section"],
    ['include=made_up', 'an unknown section'],
    ['include=fields,', 'a trailing comma'],
    ['include=fields, tokens', 'a space in a list'],
    ['include=fields&include=tokens', 'a repeated parameter'],
    ['metrics=made_up', 'an unknown metric'],
    ['metrics=raw_supply', 'an unserved metric'],
    ['metrics=sp_rating', "a term isn't a metric"],
    ['history=made_up', 'an unknown history metric'],
    ['history=sp_rating', 'a term has no history'],
    ['history=raw_supply', 'an unserved history metric'],
    ['history=Bad-Name', 'a malformed history metric'],
    [`history=${Array.from({ length: 11 }, (_, i) => `m${i}`).join(',')}`, 'more history metrics than allowed'],
    ['history=price_dollar&range=2w', 'an unknown range'],
    ['include=financials&groups=made_up', 'an unknown group'],
    ['include=financials&financialMetrics=made_up', 'an unknown financial metric'],
    ['include=fields&categories=made_up', 'an unknown category'],
    ['include=fields&categories=token', 'token fields come with tokens'],
    ['include=fields&empty=maybe', "a value that isn't true or false"],
    ['groups=value', 'groups without financials'],
    ['financialMetrics=price_dollar', 'financialMetrics without financials'],
    ['include=terms&groups=value', 'groups without financials, with another section'],
    ['categories=issuer', 'categories without fields'],
    ['empty=false', 'empty without fields'],
    ['network=solana', 'network without tokens'],
    ['include=fields&network=solana', 'network without tokens, with another section'],
    ['range=1y', 'range without history'],
  ] as const) {
    test(`${why} is a 400`, async () => {
      const response = await get(`${BASE}?${query}`);
      assert.equal(response.statusCode, 400, query);
      assert.equal(response.json().error.code, 'bad_request');
    });
  }

  test('a call that sends every default in the contract is accepted', async () => {
    const spec = harness.app.swagger() as {
      paths: Record<string, { get: { parameters: { name: string; schema: { default?: unknown } }[] } }>;
    };
    const sent = spec.paths['/tokenized_assets/{slug}']?.get.parameters
      .filter((parameter) => parameter.schema.default !== undefined)
      .map((parameter) => `${parameter.name}=${String(parameter.schema.default)}`);
    assert.equal((await get(`${BASE}?${sent?.join('&')}`)).statusCode, 200);
  });

  test('an error says what to fix', async () => {
    assert.match((await get(`${BASE}?metrics=made_up`)).json().error.message, /Unknown metric: made_up/);
    assert.match((await get(`${BASE}?range=1y`)).json().error.message, /range needs history/);
    assert.match((await get(`${BASE}?groups=value`)).json().error.message, /groups needs include=financials/);
  });

  test('an unknown asset is a 404, even with sections', async () => {
    assert.equal((await get('/tokenized_assets/nope?include=fields')).statusCode, 404);
    assert.equal((await get('/tokenized_assets/nope?history=price_dollar')).statusCode, 404);
  });
});
