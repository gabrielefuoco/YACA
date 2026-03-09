const { addBadgeToImage, getBlurredImageUrl, getImageKitUrl } = require('../src/utils/imageProcessor');

describe('addBadgeToImage', () => {
    // Save and restore env
    const origEnv = process.env.IMAGEKIT_ID;
    afterAll(() => { process.env.IMAGEKIT_ID = origEnv; });

    it('should return an ImageKit CDN URL string (not a buffer) when IMAGEKIT_ID is set', () => {
        process.env.IMAGEKIT_ID = 'test_ik_id';
        // Force re-require to pick up env change
        jest.resetModules();
        const { addBadgeToImage: freshAdd } = require('../src/utils/imageProcessor');
        const result = freshAdd('https://image.tmdb.org/t/p/w500/test.jpg', 'E5');
        expect(typeof result).toBe('string');
        expect(result).toContain('ik.imagekit.io');
        expect(result).toContain('test_ik_id');
        expect(result).toContain('?tr=');
    });

    it('should return null when IMAGEKIT_ID is not configured', () => {
        process.env.IMAGEKIT_ID = 'yaca_placeholder';
        jest.resetModules();
        const { addBadgeToImage: freshAdd } = require('../src/utils/imageProcessor');
        const result = freshAdd('https://image.tmdb.org/t/p/w500/test.jpg', 'E1');
        expect(result).toBeNull();
    });

    it('should embed badge text in ImageKit URL', () => {
        process.env.IMAGEKIT_ID = 'test_ik_id';
        jest.resetModules();
        const { addBadgeToImage: freshAdd } = require('../src/utils/imageProcessor');
        const result = freshAdd('https://image.tmdb.org/t/p/w500/test.jpg', 'S2E10');
        expect(typeof result).toBe('string');
        expect(result).toContain('l-text');
        expect(result).toContain('i-S2E10');
    });

    it('should encode the original poster URL as base64 in the ImageKit path', () => {
        process.env.IMAGEKIT_ID = 'test_ik_id';
        jest.resetModules();
        const { addBadgeToImage: freshAdd } = require('../src/utils/imageProcessor');
        const sourceUrl = 'https://image.tmdb.org/t/p/w500/test.jpg';
        const result = freshAdd(sourceUrl, 'Conclusa');
        expect(result).toContain(encodeURIComponent(Buffer.from(sourceUrl).toString('base64')));
    });
});

describe('getImageKitUrl', () => {
    it('should return original URL when IMAGEKIT_ID is placeholder', () => {
        process.env.IMAGEKIT_ID = 'yaca_placeholder';
        jest.resetModules();
        const { getImageKitUrl: freshGetUrl } = require('../src/utils/imageProcessor');
        const url = freshGetUrl('https://example.com/poster.jpg', 'E5');
        expect(url).toBe('https://example.com/poster.jpg');
    });
});

describe('getBlurredImageUrl', () => {
    it('should return a wsrv.nl URL with blur parameter', () => {
        const url = getBlurredImageUrl('https://image.tmdb.org/t/p/w500/poster.jpg');
        expect(url).toBe('https://wsrv.nl/?url=https%3A%2F%2Fimage.tmdb.org%2Ft%2Fp%2Fw500%2Fposter.jpg&blur=20');
    });

    it('should encode the image URL', () => {
        const url = getBlurredImageUrl('https://example.com/image.jpg?size=large&q=80');
        expect(url).toContain('wsrv.nl');
        expect(url).toContain('blur=20');
        expect(url).toContain(encodeURIComponent('https://example.com/image.jpg?size=large&q=80'));
    });
});
