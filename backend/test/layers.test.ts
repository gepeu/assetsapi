/**
 * The layer rules: which folders under src/ may import which. The read path is api → services → db
 * and the write path is jobs → providers → db, and they meet only at the database. Type-only imports
 * count too, so a layer can't lean on another's shapes either.
 */
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { describe, test } from 'node:test';

const SRC = resolve(import.meta.dirname, '../src');

/** For each layer, the layers it must never import, and why. */
const FORBIDDEN: Record<string, { layers: string[]; reason: string }> = {
  api: { layers: ['jobs', 'providers'], reason: 'The API never imports jobs or providers' },
  services: { layers: ['jobs', 'providers'], reason: 'Read logic never imports the write path' },
  jobs: { layers: ['api', 'services'], reason: 'Jobs never import the read path' },
  providers: { layers: ['db', 'jobs', 'services', 'api'], reason: 'Providers only fetch and convert' },
  db: { layers: ['jobs', 'providers', 'services', 'api'], reason: 'The database layer knows nothing above it' },
};

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return entry.name.endsWith('.ts') ? [path] : [];
  });
}

/** The first folder under src/, or null for files at its root, such as config.ts. */
function layerOf(path: string): string | null {
  const parts = relative(SRC, path).split(sep);
  return parts.length > 1 ? (parts[0] ?? null) : null;
}

/** Relative specifiers from static imports, re-exports and dynamic imports. Packages are skipped. */
function relativeImports(source: string): string[] {
  const patterns = [
    /\bfrom\s+['"]([^'"]+)['"]/g,
    /\bimport\s+['"]([^'"]+)['"]/g,
    /\bimport\(\s*['"]([^'"]+)['"]\s*\)/g,
  ];
  return patterns.flatMap((pattern) =>
    [...source.matchAll(pattern)].map((match) => match[1] ?? '').filter((specifier) => specifier.startsWith('.'))
  );
}

function violations(): string[] {
  const found: string[] = [];
  for (const file of sourceFiles(SRC)) {
    const layer = layerOf(file);
    const rule = layer === null ? undefined : FORBIDDEN[layer];
    if (!rule) continue;
    for (const specifier of relativeImports(readFileSync(file, 'utf8'))) {
      const target = layerOf(resolve(dirname(file), specifier));
      if (target !== null && rule.layers.includes(target)) {
        found.push(`${relative(SRC, file)} imports ${specifier}: ${rule.reason}`);
      }
    }
  }
  return found.sort();
}

describe('layer rules', () => {
  test('no file imports a layer it must not', () => {
    assert.deepEqual(violations(), []);
  });

  test('every layer under src/ has a rule, so a new folder must be placed deliberately', () => {
    const layers = readdirSync(SRC, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
    assert.deepEqual(layers, Object.keys(FORBIDDEN).sort());
  });
});
