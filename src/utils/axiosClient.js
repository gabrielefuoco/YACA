const axios = require('axios');

/**
 * Creates an Axios instance with automatic retry logic for 429 (Too Many Requests).
 * It reads the 'retry-after' header if present, or defaults to a fallback delay.
 * 
 * @param {string} baseURL The base URL for the API
 * @param {object} options Additional axios config (headers, timeout, etc.)
 * @param {number} maxRetries Maximum number of retries before failing
 * @returns {import('axios').AxiosInstance}
 */
function createAxiosClient(baseURL, options = {}, maxRetries = 2) {
    const client = axios.create({
        baseURL,
        timeout: 10000,
        ...options
    });

    client.interceptors.response.use(
        (response) => response,
        async (error) => {
            const config = error.config;
            if (!config) return Promise.reject(error);

            // Initialize retry count
            config._retryCount = config._retryCount || 0;

            if (error.response && error.response.status === 429 && config._retryCount < maxRetries) {
                config._retryCount += 1;
                
                // Parse retry-after header (in seconds), default to 1 second
                const retryAfterHeader = error.response.headers['retry-after'];
                let waitTimeMs = 1000;
                
                if (retryAfterHeader) {
                    const parsed = parseInt(retryAfterHeader, 10);
                    if (!isNaN(parsed)) {
                        waitTimeMs = parsed * 1000;
                    }
                } else {
                    // Exponential backoff fallback if no header
                    waitTimeMs = 1000 * Math.pow(2, config._retryCount - 1);
                }

                console.warn(`[AxiosClient] 429 Too Many Requests per ${baseURL}${config.url}. Attendendo ${waitTimeMs}ms prima del tentativo ${config._retryCount}/${maxRetries}...`);
                
                await new Promise(resolve => setTimeout(resolve, waitTimeMs));
                return client(config);
            }

            return Promise.reject(error);
        }
    );

    return client;
}

module.exports = { createAxiosClient };
