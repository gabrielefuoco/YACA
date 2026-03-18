const fs = require('fs');
const path = require('path');

describe('CreatorPanel AI -> manual mapping safeguards', () => {
    const creatorPanelPath = path.join(__dirname, '..', 'frontend', 'src', 'components', 'dashboard', 'CreatorPanel.tsx');
    const source = fs.readFileSync(creatorPanelPath, 'utf8');

    it('maps AI discovery aliases into manual block filters', () => {
        expect(source).toContain('parseList(f.with_genres ?? f.genre_ids)');
        expect(source).toContain("} else if (f.keyword) {");
        expect(source).toContain("(f['first_air_date.gte'] as string)");
        expect(source).toContain("(f['first_air_date.lte'] as string)");
    });

    it('builds year filter keys based on selected catalog type', () => {
        expect(source).toContain("const dateKey = type === 'series' ? 'first_air_date' : 'primary_release_date';");
        expect(source).toContain("[`${dateKey}.gte`]");
        expect(source).toContain("[`${dateKey}.lte`]");
    });

    it('extracts AI query arrays from nested filters payloads', () => {
        expect(source).toContain('const rawFilters = result?.filters as Record<string, unknown> | undefined;');
        expect(source).toContain('Array.isArray(rawFilters?.queries)');
        expect(source).toContain("? rawFilters.queries as Record<string, unknown>[]");
        expect(source).toContain(': rawFilters ? [rawFilters] : [];');
    });

    it('normalizes preview filters through block builder instead of raw AI query', () => {
        expect(source).toContain('setPreviewFilters(buildFiltersFromBlock(newBlocks[0]));');
    });
});
