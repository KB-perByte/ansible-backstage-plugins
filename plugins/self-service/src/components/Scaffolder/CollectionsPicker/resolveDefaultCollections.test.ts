import {
  parseSchemaDefaultCollections,
  resolveDefaultCollectionsFromCatalog,
} from './resolveDefaultCollections';

describe('parseSchemaDefaultCollections', () => {
  it('returns empty array when default is missing or not an array', () => {
    expect(parseSchemaDefaultCollections(undefined)).toEqual([]);
    expect(parseSchemaDefaultCollections({})).toEqual([]);
    expect(parseSchemaDefaultCollections({ default: 'x' as any })).toEqual([]);
  });

  it('parses list of dicts with name, source, version', () => {
    expect(
      parseSchemaDefaultCollections({
        default: [
          { name: 'amazon.aws', source: 'Hub / rh', version: '1.0.0' },
          { name: 'x.y' },
        ],
      }),
    ).toEqual([
      { name: 'amazon.aws', source: 'Hub / rh', version: '1.0.0' },
      { name: 'x.y' },
    ]);
  });

  it('drops entries without name', () => {
    expect(
      parseSchemaDefaultCollections({
        default: [{ name: '' }, { name: 'ok' }],
      }),
    ).toEqual([{ name: 'ok' }]);
  });
});

describe('resolveDefaultCollectionsFromCatalog', () => {
  const catalog = [
    {
      name: 'amazon.aws',
      sources: ['Private Automation Hub / rh-certified'],
      sourceVersions: {
        'Private Automation Hub / rh-certified': ['2.0.0', '1.0.0'],
      },
      versions: ['2.0.0', '1.0.0'],
    },
    {
      name: 'community.general',
      versions: ['7.0.0'],
    },
  ];

  it('resolves name-only default when collection exists in catalog', () => {
    expect(
      resolveDefaultCollectionsFromCatalog(
        [{ name: 'community.general' }],
        catalog,
      ),
    ).toEqual([{ name: 'community.general' }]);
  });

  it('omits when name not in catalog', () => {
    expect(
      resolveDefaultCollectionsFromCatalog(
        [{ name: 'missing.collection' }],
        catalog,
      ),
    ).toEqual([]);
  });

  it('resolves name + source when source matches', () => {
    expect(
      resolveDefaultCollectionsFromCatalog(
        [{ name: 'amazon.aws', source: 'rh-certified' }],
        catalog,
      ),
    ).toEqual([
      {
        name: 'amazon.aws',
        source: 'Private Automation Hub / rh-certified',
      },
    ]);
  });

  it('rejects when source does not match', () => {
    expect(
      resolveDefaultCollectionsFromCatalog(
        [{ name: 'amazon.aws', source: 'wrong-source' }],
        catalog,
      ),
    ).toEqual([]);
  });

  it('resolves name + source + version when version exists for source', () => {
    expect(
      resolveDefaultCollectionsFromCatalog(
        [
          {
            name: 'amazon.aws',
            source: 'rh-certified',
            version: '1.0.0',
          },
        ],
        catalog,
      ),
    ).toEqual([
      {
        name: 'amazon.aws',
        source: 'Private Automation Hub / rh-certified',
        version: '1.0.0',
      },
    ]);
  });

  it('resolves name + version without source when version exists in catalog', () => {
    expect(
      resolveDefaultCollectionsFromCatalog(
        [{ name: 'community.general', version: '7.0.0' }],
        catalog,
      ),
    ).toEqual([{ name: 'community.general', version: '7.0.0' }]);
  });

  it('dedupes by collection name', () => {
    expect(
      resolveDefaultCollectionsFromCatalog(
        [
          { name: 'community.general' },
          { name: 'community.general', version: '7.0.0' },
        ],
        catalog,
      ),
    ).toEqual([{ name: 'community.general', version: '7.0.0' }]);
  });
});
