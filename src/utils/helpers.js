// UUID v4 format validation
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isValidUUID(uuid) {
    return UUID_REGEX.test(uuid);
}

/**
 * Parsa i parametri "extra" stile Stremio (es. "search=avengers&skip=20")
 */
function parseExtra(extraString) {
    if (!extraString) return {};
    const extra = {};
    const params = extraString.split('&');
    for (const p of params) {
        const [k, v] = p.split('=');
        if (k && v) extra[k] = decodeURIComponent(v);
    }
    return extra;
}

module.exports = { isValidUUID, parseExtra };
