/**
 * Every route in the OpenAPI contract must be declared by some test file with coversRoutes([...]),
 * so a new route can't ship without a test. A route hidden from the contract isn't checked.
 */
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, test } from 'node:test';
import { renderOpenApi } from '../../scripts/generateOpenApi.ts';

const TEST_DIR = join(import.meta.dirname, '..');

function findTestFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === 'fixtures' ? [] : findTestFiles(path);
    return entry.name.endsWith('.test.ts') ? [path] : [];
  });
}

/** The routes named in coversRoutes([...]) calls, with comments removed first so a commented-out call doesn't count. */
function declaredRoutes(): Set<string> {
  const declared = new Set<string>();
  for (const file of findTestFiles(TEST_DIR)) {
    const source = readFileSync(file, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');
    for (const call of source.matchAll(/coversRoutes\(\[([^\]]*)\]\)/g)) {
      for (const literal of (call[1] ?? '').matchAll(/["']([^"']+)["']/g)) declared.add(literal[1] ?? '');
    }
  }
  return declared;
}

async function contractRoutes(): Promise<Set<string>> {
  const spec = JSON.parse(await renderOpenApi()) as { paths: Record<string, Record<string, unknown>> };
  return new Set(
    Object.entries(spec.paths).flatMap(([path, methods]) =>
      Object.keys(methods).map((method) => `${method.toUpperCase()} ${path}`)
    )
  );
}

describe('route test coverage', () => {
  test('every route in the contract is declared by a test', async () => {
    const declared = declaredRoutes();
    const missing = [...(await contractRoutes())].filter((route) => !declared.has(route)).sort();
    assert.deepEqual(missing, [], 'Add coversRoutes([...]) to the test file that exercises these routes');
  });

  test("every declared route exists, so a typo can't count as coverage", async () => {
    const routes = await contractRoutes();
    const unknown = [...declaredRoutes()].filter((route) => !routes.has(route)).sort();
    assert.deepEqual(unknown, [], 'These coversRoutes([...]) entries match no route in the contract');
  });
});
