const fs = require('fs');

describe('warmup rate limiter wiring', () => {
    let source;

    beforeAll(() => {
        source = fs.readFileSync(require.resolve('../index.js'), 'utf-8');
    });

    it('should import rateLimitedMap in index.js', () => {
        expect(source).toContain('rateLimitedMap');
        expect(source).toContain('rateLimiter');
    });

    it('should use rateLimitedMap in warmup flow', () => {
        const calls = source.match(/await\s+rateLimitedMap\(/g) || [];
        expect(calls.length).toBeGreaterThan(0);
    });
});
