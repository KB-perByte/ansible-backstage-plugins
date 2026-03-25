import { CollectionItem } from './types';

/** Shape returned by scaffolder autocomplete for resource `collections`. */
export type CatalogCollection = {
  name: string;
  versions?: string[];
  sources?: string[];
  sourceVersions?: Record<string, string[]>;
};

function normalize(s: string): string {
  return s.trim().toLowerCase();
}

function sourcesMatch(catalogSource: string, requested: string): boolean {
  const a = normalize(catalogSource);
  const b = normalize(requested);
  return a === b || a.includes(b) || b.includes(a);
}

function findSourceKey(
  entry: CatalogCollection,
  source: string,
): string | undefined {
  return entry.sources?.find(s => sourcesMatch(s, source));
}

function resolveSourceVersions(
  entry: CatalogCollection,
  matchedSource: string,
): string[] | undefined {
  const direct = entry.sourceVersions?.[matchedSource];
  if (direct?.length) return direct;
  const key = Object.keys(entry.sourceVersions || {}).find(k =>
    sourcesMatch(k, matchedSource),
  );
  return key ? entry.sourceVersions![key] : undefined;
}

/**
 * Parses JSON Schema `default` for the collections field (array of objects).
 */
export function parseSchemaDefaultCollections(
  schema: { default?: unknown } | undefined,
): CollectionItem[] {
  const raw = schema?.default;
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((x): x is Record<string, unknown> => x !== null && typeof x === 'object')
    .map(r => {
      const name = String(r.name ?? '').trim();
      const item: CollectionItem = { name };
      if (typeof r.source === 'string' && r.source.trim()) {
        item.source = r.source.trim();
      }
      if (typeof r.version === 'string' && r.version.trim()) {
        item.version = r.version.trim();
      }
      return item;
    })
    .filter(c => c.name.length > 0);
}

function dedupeByName(items: CollectionItem[]): CollectionItem[] {
  const map = new Map<string, CollectionItem>();
  for (const item of items) {
    map.set(normalize(item.name), item);
  }
  return [...map.values()];
}

/**
 * Resolves template defaults against catalog-backed autocomplete results.
 * Only entries that exist in the catalog (with optional source/version checks) are returned.
 */
export function resolveDefaultCollectionsFromCatalog(
  defaults: CollectionItem[],
  catalog: CatalogCollection[],
): CollectionItem[] {
  const result: CollectionItem[] = [];

  for (const item of defaults) {
    if (!item.name?.trim()) continue;
    const entry = catalog.find(
      c => normalize(c.name) === normalize(item.name),
    );
    if (!entry) continue;

    const hasSource = !!item.source?.trim();
    const hasVersion = !!item.version?.trim();

    if (!hasSource && !hasVersion) {
      result.push({ name: entry.name });
      continue;
    }

    if (hasSource && !hasVersion) {
      const matchedSource = findSourceKey(entry, item.source!);
      if (!matchedSource) continue;
      result.push({ name: entry.name, source: matchedSource });
      continue;
    }

    if (!hasSource && hasVersion) {
      const vNorm = normalize(item.version!);
      const inFlat = entry.versions?.some(v => normalize(v) === vNorm);
      const inNested = Object.values(entry.sourceVersions || {}).some(vers =>
        vers.some(v => normalize(v) === vNorm),
      );
      if (!inFlat && !inNested) continue;
      result.push({ name: entry.name, version: item.version });
      continue;
    }

    const matchedSource = findSourceKey(entry, item.source!);
    if (!matchedSource) continue;
    const versForSource = resolveSourceVersions(entry, matchedSource);
    const vOk = versForSource?.some(
      v => normalize(v) === normalize(item.version!),
    );
    if (!vOk) continue;
    result.push({
      name: entry.name,
      source: matchedSource,
      version: item.version,
    });
  }

  return dedupeByName(result);
}
