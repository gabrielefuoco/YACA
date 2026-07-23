function normalizeContentId(id) {
    if (!id) return '';
    const str = String(id);
    // Supporta formati: 'tmdb:123', 'yaca:signature:movie:tt123', 'tt123', '123'
    // Estrae l'ultima parte dopo il due punti, che è l'ID effettivo
    const parts = str.split(':');
    return parts[parts.length - 1].trim();
}

function getBaseId(id) {
    if (!id) return '';
    const str = String(id);
    if (str.startsWith('tmdb:') || str.startsWith('kitsu:') || str.startsWith('anilist:')) {
        const parts = str.split(':');
        return `${parts[0]}:${parts[1]}`;
    }
    return str;
}

module.exports = { normalizeContentId, getBaseId };
