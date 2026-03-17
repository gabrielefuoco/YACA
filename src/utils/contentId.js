function normalizeContentId(id) {
    if (!id) return '';
    const str = String(id);
    // Supporta formati: 'tmdb:123', 'yaca:signature:movie:tt123', 'tt123', '123'
    // Estrae l'ultima parte dopo il due punti, che è l'ID effettivo
    const parts = str.split(':');
    return parts[parts.length - 1].trim();
}

module.exports = { normalizeContentId };
