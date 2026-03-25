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
  return key ? entry.sourceVersions?.[key] : undefined;
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
    .filter(
      (x): x is Record<string, unknown> => x !== null && typeof x === 'object',
    )
    .map(r => {
      const name = typeof r.name === 'string' ? r.name.trim() : '';
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

function findCatalogEntry(
  catalog: CatalogCollection[],
  item: CollectionItem,
): CatalogCollection | undefined {
  if (!item.name?.trim()) {
    return undefined;
  }
  return catalog.find(c => normalize(c.name) === normalize(item.name));
}

function versionExistsInEntry(
  entry: CatalogCollection,
  version: string,
): boolean {
  const vNorm = normalize(version);
  const inFlat = entry.versions?.some(v => normalize(v) === vNorm) ?? false;
  const inNested = Object.values(entry.sourceVersions || {}).some(vers =>
    vers.some(v => normalize(v) === vNorm),
  );
  return inFlat || inNested;
}

function resolveNameOnly(entry: CatalogCollection): CollectionItem {
  return { name: entry.name };
}

function resolveSourceOnly(
  entry: CatalogCollection,
  source: string,
): CollectionItem | undefined {
  const matchedSource = findSourceKey(entry, source);
  if (!matchedSource) {
    return undefined;
  }
  return { name: entry.name, source: matchedSource };
}

function resolveVersionOnly(
  entry: CatalogCollection,
  version: string,
): CollectionItem | undefined {
  if (!versionExistsInEntry(entry, version)) {
    return undefined;
  }
  return { name: entry.name, version };
}

function resolveSourceAndVersion(
  entry: CatalogCollection,
  source: string,
  version: string,
): CollectionItem | undefined {
  const matchedSource = findSourceKey(entry, source);
  if (!matchedSource) {
    return undefined;
  }
  const versForSource = resolveSourceVersions(entry, matchedSource);
  const vOk = versForSource?.some(v => normalize(v) === normalize(version));
  if (!vOk) {
    return undefined;
  }
  return {
    name: entry.name,
    source: matchedSource,
    version,
  };
}

function resolveDefaultItemAgainstEntry(
  item: CollectionItem,
  entry: CatalogCollection,
): CollectionItem | undefined {
  const source = item.source?.trim();
  const version = item.version?.trim();
  const hasSource = !!source;
  const hasVersion = !!version;

  if (!hasSource && !hasVersion) {
    return resolveNameOnly(entry);
  }
  if (hasSource && !hasVersion && source) {
    return resolveSourceOnly(entry, source);
  }
  if (!hasSource && hasVersion && version) {
    return resolveVersionOnly(entry, version);
  }
  if (hasSource && hasVersion && source && version) {
    return resolveSourceAndVersion(entry, source, version);
  }
  return undefined;
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
    const entry = findCatalogEntry(catalog, item);
    if (!entry) {
      continue;
    }
    const resolved = resolveDefaultItemAgainstEntry(item, entry);
    if (resolved) {
      result.push(resolved);
    }
  }

  return dedupeByName(result);
}
