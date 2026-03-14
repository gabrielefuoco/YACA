function normalizeContentId(id) {
    return String(id ?? '').replace(/^tmdb:/i, '').trim();
}

module.exports = { normalizeContentId };
