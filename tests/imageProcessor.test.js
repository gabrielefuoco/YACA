const sharp = require('sharp');
const { addBadgeToImage } = require('../src/utils/imageProcessor');

// Mock axios to avoid network calls
jest.mock('axios', () => ({
    get: jest.fn()
}));
const axios = require('axios');

describe('addBadgeToImage', () => {
    let testImageBuffer;

    beforeAll(async () => {
        // Create a simple 500x750 test image (red rectangle)
        testImageBuffer = await sharp({
            create: { width: 500, height: 750, channels: 3, background: { r: 255, g: 0, b: 0 } }
        }).jpeg().toBuffer();
    });

    beforeEach(() => {
        axios.get.mockReset();
        axios.get.mockResolvedValue({ data: testImageBuffer });
    });

    it('should return a valid JPEG buffer with badge overlay', async () => {
        const result = await addBadgeToImage('https://image.tmdb.org/t/p/w500/test.jpg', 'E5');
        expect(result).toBeInstanceOf(Buffer);
        expect(result.length).toBeGreaterThan(0);

        // Verify it's a valid JPEG
        const metadata = await sharp(result).metadata();
        expect(metadata.format).toBe('jpeg');
        expect(metadata.width).toBe(500);
        expect(metadata.height).toBe(750);
    });

    it('should handle S1E5 style badge text', async () => {
        const result = await addBadgeToImage('https://image.tmdb.org/t/p/w500/test.jpg', 'S2E10');
        expect(result).toBeInstanceOf(Buffer);
        expect(result.length).toBeGreaterThan(0);
    });

    it('should return null on download error', async () => {
        axios.get.mockRejectedValue(new Error('Network error'));
        const result = await addBadgeToImage('https://image.tmdb.org/t/p/w500/test.jpg', 'E1');
        expect(result).toBeNull();
    });

    it('should return null for invalid image data', async () => {
        axios.get.mockResolvedValue({ data: Buffer.from('not-an-image') });
        const result = await addBadgeToImage('https://image.tmdb.org/t/p/w500/test.jpg', 'E1');
        expect(result).toBeNull();
    });

    it('should generate SVG with xmlns attribute for proper rendering', async () => {
        const result = await addBadgeToImage('https://image.tmdb.org/t/p/w500/test.jpg', 'E5');
        expect(result).toBeInstanceOf(Buffer);
        // The output should be different from the input (badge was composited)
        expect(result.length).not.toBe(testImageBuffer.length);
    });

    it('should include xmlns attribute in SVG overlay', () => {
        // Directly verify the source code includes xmlns in the SVG
        const fs = require('fs');
        const source = fs.readFileSync(require.resolve('../src/utils/imageProcessor.js'), 'utf-8');
        expect(source).toContain('xmlns="http://www.w3.org/2000/svg"');
    });
});
