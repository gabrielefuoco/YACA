const { createAxiosInstance } = require('./httpClient');

const lingvaClient = createAxiosInstance('https://lingva.ml');
const MAX_LINGVA_TEXT_LEN = 1500;

async function translateTextToItalian(text, sourceLang = 'en') {
    if (!text || !text.trim() || sourceLang === 'it') {
        return text || '';
    }

    const truncatedText = text.length > MAX_LINGVA_TEXT_LEN
        ? `${text.substring(0, MAX_LINGVA_TEXT_LEN)}...`
        : text;

    try {
        const transRes = await lingvaClient.get(
            `/api/v1/${sourceLang}/it/${encodeURIComponent(truncatedText)}`,
            { timeout: 1500 }
        );

        return transRes.data?.translation || text;
    } catch (_e) {
        return text;
    }
}

module.exports = {
    MAX_LINGVA_TEXT_LEN,
    translateTextToItalian
};
