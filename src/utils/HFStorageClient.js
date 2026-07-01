const { S3Client, PutObjectCommand, HeadObjectCommand } = require('@aws-sdk/client-s3');

/**
 * Client proxy for Hugging Face Storage Buckets via S3 API
 */
class HFStorageClient {
    constructor() {
        this.bucketName = process.env.HF_BUCKET_NAME;
        
        // Setup S3 Client pointing to Hugging Face
        // HF typically uses 'us-east-1' as a placeholder region for S3 compatibility
        this.s3Client = new S3Client({
            endpoint: 'https://s3.us.huggingface.co', // S3 Endpoint for Hugging Face (US region)
            region: 'us-east-1',
            credentials: {
                accessKeyId: process.env.HF_S3_ACCESS_KEY_ID || process.env.HF_ACCESS_TOKEN, // In some setups, token works, but HMAC keys are safer
                secretAccessKey: process.env.HF_S3_SECRET_ACCESS_KEY || process.env.HF_ACCESS_TOKEN
            },
            forcePathStyle: true // Needed for many alternative S3 providers
        });
        
        this.enabled = !!(this.bucketName && (process.env.HF_S3_ACCESS_KEY_ID || process.env.HF_ACCESS_TOKEN));
        
        if (!this.enabled) {
            console.warn('[HFStorageClient] Warning: S3 credentials (HF_BUCKET_NAME / HF_S3_ACCESS_KEY_ID) not found. Bucket proxy is disabled.');
        }
    }

    /**
     * Get the public URL for an object (HF buckets CDN URL)
     */
    getPublicUrl(objectKey) {
        // HF bucket public URLs look like:
        // https://tuo-bucket.s3.us.huggingface.co/chiave (Virtual Hosted Style)
        // or https://s3.us.huggingface.co/tuo-bucket/chiave (Path Style)
        // Sticking to path style for safety, or HF might have a dedicated resolver:
        return `https://s3.us.huggingface.co/${this.bucketName}/${objectKey}`;
    }

    /**
     * Check if an object exists in the bucket
     * @param {string} cacheKey 
     * @returns {string|null} The public URL if exists, null otherwise
     */
    async exists(cacheKey) {
        if (!this.enabled) return null;
        
        const objectKey = `badges/${cacheKey}.jpg`;
        
        try {
            const command = new HeadObjectCommand({
                Bucket: this.bucketName,
                Key: objectKey,
            });
            await this.s3Client.send(command);
            return this.getPublicUrl(objectKey);
        } catch (error) {
            if (error.name === 'NotFound' || error.$metadata?.httpStatusCode === 404) {
                return null;
            }
            console.error(`[HFStorageClient] Check exists error for ${objectKey}:`, error.message);
            return null;
        }
    }

    /**
     * Upload an image buffer to the bucket
     * @param {string} cacheKey 
     * @param {Buffer} buffer 
     * @returns {string|null} The public URL of the uploaded image
     */
    async upload(cacheKey, buffer) {
        if (!this.enabled) return null;
        
        const objectKey = `badges/${cacheKey}.jpg`;
        
        try {
            const command = new PutObjectCommand({
                Bucket: this.bucketName,
                Key: objectKey,
                Body: buffer,
                ContentType: 'image/jpeg',
                CacheControl: 'public, max-age=31536000, immutable' // Aggressive caching for generated badge posters
            });
            
            await this.s3Client.send(command);
            return this.getPublicUrl(objectKey);
        } catch (error) {
            console.error(`[HFStorageClient] Upload error for ${objectKey}:`, error.message);
            return null;
        }
    }
}

module.exports = new HFStorageClient();
