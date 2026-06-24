// src/utils/httpClient.js

const axios = require('axios');
const https = require('https');
const http = require('http');

const PROXY_CONFIG = {
    enabled: process.env.PROXY_ENABLED === 'true',
    host: process.env.PROXY_HOST,
    port: process.env.PROXY_PORT,
    protocol: process.env.PROXY_PROTOCOL || 'http',
    auth: process.env.PROXY_USERNAME ? {
        username: process.env.PROXY_USERNAME,
        password: process.env.PROXY_PASSWORD
    } : undefined
};

function createAxiosInstance(baseURL, additionalConfig = {}) {
    const defaultHttpsAgent = new https.Agent({ keepAlive: true, maxSockets: 250, family: 4 });
    const defaultHttpAgent = new http.Agent({ keepAlive: true, maxSockets: 250, family: 4 });

    const config = {
        baseURL,
        timeout: 10000,
        httpsAgent: defaultHttpsAgent,
        httpAgent: defaultHttpAgent,
        ...additionalConfig
    };

    if (PROXY_CONFIG.enabled && PROXY_CONFIG.host && PROXY_CONFIG.port) {
        const proxyConfig = {
            host: PROXY_CONFIG.host,
            port: PROXY_CONFIG.port,
            protocol: PROXY_CONFIG.protocol
        };
        if (PROXY_CONFIG.auth) proxyConfig.auth = PROXY_CONFIG.auth;

        config.proxy = proxyConfig;
        if (PROXY_CONFIG.protocol === 'https') {
            config.httpsAgent = new https.Agent({ rejectUnauthorized: false, keepAlive: true, maxSockets: 250, family: 4 });
        } else {
            config.httpAgent = new http.Agent({ keepAlive: true, maxSockets: 250, family: 4 });
        }
    }

    return axios.create(config);
}

module.exports = { createAxiosInstance };
