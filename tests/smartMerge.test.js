// Tests for Smart Merge filter logic (frontend-driven merge algorithm)

/**
 * Replicates the smartMergeFilters function from the frontend.
 * This is extracted here so it can be unit-tested in Node.js.
 */
function smartMergeFilters(filtersA, filtersB, mode) {
    const sep = mode === 'and' ? ',' : '|';
    const merged = { ...filtersA };

    // Merge with_genres
    const genresA = String(filtersA.with_genres || '').split(/[,|]/).map(s => s.trim()).filter(Boolean);
    const genresB = String(filtersB.with_genres || '').split(/[,|]/).map(s => s.trim()).filter(Boolean);
    const allGenres = [...new Set([...genresA, ...genresB])];
    if (allGenres.length > 0) {
        merged.with_genres = allGenres.join(sep);
    }

    // Merge with_keywords
    const kwA = String(filtersA.with_keywords || '').split(/[,|]/).map(s => s.trim()).filter(Boolean);
    const kwB = String(filtersB.with_keywords || '').split(/[,|]/).map(s => s.trim()).filter(Boolean);
    const allKw = [...new Set([...kwA, ...kwB])];
    if (allKw.length > 0) {
        merged.with_keywords = allKw.join(sep);
    }

    // Resolve sort_by: A takes priority, fallback to B, then default
    merged.sort_by = filtersA.sort_by || filtersB.sort_by || 'popularity.desc';

    // Carry over other filter fields from B that A doesn't have
    for (const key of Object.keys(filtersB)) {
        if (merged[key] === undefined || merged[key] === '') {
            merged[key] = filtersB[key];
        }
    }

    return merged;
}

describe('smartMergeFilters', () => {
    it('should merge genres with OR separator (pipe) in "or" mode', () => {
        const a = { with_genres: '28', sort_by: 'popularity.desc' };
        const b = { with_genres: '16', sort_by: 'vote_average.desc' };
        const result = smartMergeFilters(a, b, 'or');
        expect(result.with_genres).toBe('28|16');
    });

    it('should merge genres with AND separator (comma) in "and" mode', () => {
        const a = { with_genres: '28', sort_by: 'popularity.desc' };
        const b = { with_genres: '16', sort_by: 'vote_average.desc' };
        const result = smartMergeFilters(a, b, 'and');
        expect(result.with_genres).toBe('28,16');
    });

    it('should deduplicate genres', () => {
        const a = { with_genres: '28,16' };
        const b = { with_genres: '16,35' };
        const result = smartMergeFilters(a, b, 'or');
        expect(result.with_genres).toBe('28|16|35');
    });

    it('should deduplicate genres in AND mode', () => {
        const a = { with_genres: '28,16' };
        const b = { with_genres: '28,35' };
        const result = smartMergeFilters(a, b, 'and');
        expect(result.with_genres).toBe('28,16,35');
    });

    it('should merge keywords with OR separator', () => {
        const a = { with_keywords: '210024' };
        const b = { with_keywords: '9840' };
        const result = smartMergeFilters(a, b, 'or');
        expect(result.with_keywords).toBe('210024|9840');
    });

    it('should merge keywords with AND separator', () => {
        const a = { with_keywords: '210024' };
        const b = { with_keywords: '9840' };
        const result = smartMergeFilters(a, b, 'and');
        expect(result.with_keywords).toBe('210024,9840');
    });

    it('should deduplicate keywords', () => {
        const a = { with_keywords: '210024' };
        const b = { with_keywords: '210024,9840' };
        const result = smartMergeFilters(a, b, 'or');
        expect(result.with_keywords).toBe('210024|9840');
    });

    it('should prioritize sort_by from A', () => {
        const a = { sort_by: 'vote_average.desc', with_genres: '28' };
        const b = { sort_by: 'popularity.desc', with_genres: '16' };
        const result = smartMergeFilters(a, b, 'or');
        expect(result.sort_by).toBe('vote_average.desc');
    });

    it('should fall back to B sort_by when A has none', () => {
        const a = { with_genres: '28' };
        const b = { sort_by: 'revenue.desc', with_genres: '16' };
        const result = smartMergeFilters(a, b, 'or');
        expect(result.sort_by).toBe('revenue.desc');
    });

    it('should default to popularity.desc when neither has sort_by', () => {
        const a = { with_genres: '28' };
        const b = { with_genres: '16' };
        const result = smartMergeFilters(a, b, 'or');
        expect(result.sort_by).toBe('popularity.desc');
    });

    it('should carry over extra fields from B that A does not have', () => {
        const a = { with_genres: '28', sort_by: 'popularity.desc' };
        const b = { with_genres: '16', 'vote_count.gte': 100, with_original_language: 'ja' };
        const result = smartMergeFilters(a, b, 'or');
        expect(result['vote_count.gte']).toBe(100);
        expect(result.with_original_language).toBe('ja');
    });

    it('should not overwrite A fields with B fields', () => {
        const a = { with_genres: '28', 'vote_count.gte': 50 };
        const b = { with_genres: '16', 'vote_count.gte': 200 };
        const result = smartMergeFilters(a, b, 'or');
        expect(result['vote_count.gte']).toBe(50);
    });

    it('should handle empty filters gracefully', () => {
        const a = {};
        const b = {};
        const result = smartMergeFilters(a, b, 'or');
        expect(result.sort_by).toBe('popularity.desc');
        expect(result.with_genres).toBeUndefined();
        expect(result.with_keywords).toBeUndefined();
    });

    it('should handle one empty filter set', () => {
        const a = { with_genres: '28', with_keywords: '210024', sort_by: 'popularity.desc' };
        const b = {};
        const result = smartMergeFilters(a, b, 'or');
        expect(result.with_genres).toBe('28');
        expect(result.with_keywords).toBe('210024');
        expect(result.sort_by).toBe('popularity.desc');
    });

    it('should handle numeric genre values (from preset constants)', () => {
        const a = { with_genres: 16 };
        const b = { with_genres: 28 };
        const result = smartMergeFilters(a, b, 'and');
        expect(result.with_genres).toBe('16,28');
    });

    it('should handle mixed pipe-separated input genres', () => {
        const a = { with_genres: '28|35' };
        const b = { with_genres: '16|35' };
        const result = smartMergeFilters(a, b, 'or');
        expect(result.with_genres).toBe('28|35|16');
    });
});
