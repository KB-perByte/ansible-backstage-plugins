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

  it('resolves sourceVersions by fuzzy key when direct key missing (covers 34,35,37)', () => {
    const scopedCatalog = [
      {
        name: 'amazon.aws',
        sources: ['Private Automation Hub / rh-certified'],
        sourceVersions: {
          'private automation hub / RH-CERTIFIED': ['1.0.0'],
        },
      },
    ];

    const resolved = resolveDefaultCollectionsFromCatalog(
      [{ name: 'amazon.aws', source: 'rh-certified', version: '1.0.0' }],
      scopedCatalog,
    );

    expect(resolved).toEqual([
      {
        name: 'amazon.aws',
        source: 'Private Automation Hub / rh-certified',
        version: '1.0.0',
      },
    ]);
  });

  it('skips defaults with blank collection name (covers 79)', () => {
    const scopedCatalog = [{ name: 'amazon.aws', versions: ['1.0.0'] }];

    const resolved = resolveDefaultCollectionsFromCatalog(
      [{ name: '   ' } as any],
      scopedCatalog,
    );

    expect(resolved).toEqual([]);
  });

  it('matches version via sourceVersions nested values (covers 91)', () => {
    const scopedCatalog = [
      {
        name: 'amazon.aws',
        sourceVersions: {
          'Private Automation Hub / rh-certified': ['9.9.9'],
        },
        versions: [],
      },
    ];

    const resolved = resolveDefaultCollectionsFromCatalog(
      [{ name: 'amazon.aws', version: '9.9.9' }],
      scopedCatalog,
    );

    expect(resolved).toEqual([{ name: 'amazon.aws', version: '9.9.9' }]);
  });

  it('rejects version-only when version is absent (covers 116)', () => {
    const scopedCatalog = [{ name: 'community.general', versions: ['7.0.0'] }];

    const resolved = resolveDefaultCollectionsFromCatalog(
      [{ name: 'community.general', version: '0.0.1' }],
      scopedCatalog,
    );

    expect(resolved).toEqual([]);
  });

  it('rejects source+version when source does not match (covers 128)', () => {
    const scopedCatalog = [
      {
        name: 'amazon.aws',
        sources: ['Private Automation Hub / rh-certified'],
        sourceVersions: { 'Private Automation Hub / rh-certified': ['1.0.0'] },
      },
    ];

    const resolved = resolveDefaultCollectionsFromCatalog(
      [{ name: 'amazon.aws', source: 'wrong-source', version: '1.0.0' }],
      scopedCatalog,
    );

    expect(resolved).toEqual([]);
  });

  it('rejects source+version when source matches but version does not (covers 133)', () => {
    const scopedCatalog = [
      {
        name: 'amazon.aws',
        sources: ['Private Automation Hub / rh-certified'],
        sourceVersions: { 'Private Automation Hub / rh-certified': ['2.0.0'] },
      },
    ];

    const resolved = resolveDefaultCollectionsFromCatalog(
      [{ name: 'amazon.aws', source: 'rh-certified', version: '1.0.0' }],
      scopedCatalog,
    );

    expect(resolved).toEqual([]);
  });
});
