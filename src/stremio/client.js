const { createAxiosClient } = require('../utils/axiosClient');

const stremioClient = createAxiosClient('https://api.strem.io', { timeout: 15000 });
const stremioLikesClient = createAxiosClient('https://likes.stremio.com');

module.exports = {
    stremioClient,
    stremioLikesClient
};
