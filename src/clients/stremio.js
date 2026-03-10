const { createAxiosInstance } = require('../utils/httpClient');

const stremioClient = createAxiosInstance('https://api.strem.io');
const stremioLikesClient = createAxiosInstance('https://likes.stremio.com');

module.exports = {
    stremioClient,
    stremioLikesClient
};
