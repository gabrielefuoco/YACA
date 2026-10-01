/**
 * overrides.js
 * Loader fail-safe per anime-overrides.json
 * Se il file è assente o invalido, emette un warning su console e restituisce
 * una struttura vuota senza mai lanciare eccezioni o causare crash.
 */

const fs = require('fs');
const path = require('path');

function resolveDefaultOverridesPath() {
    if (process.env.ANIME_OVERRIDES_PATH) {
        return process.env.ANIME_OVERRIDES_PATH;
    }
    const candidates = [
        path.join(__dirname, '../data/anime-overrides.json'),
        path.join(__dirname, '../../services/anime-source/data/anime-overrides.json'),
        path.join(process.cwd(), 'services/anime-source/data/anime-overrides.json'),
        path.join(process.cwd(), 'data/anime-overrides.json')
    ];
    for (const cand of candidates) {
        try {
            if (fs.existsSync(cand)) {
                return cand;
            }
        } catch {
            // Continua la ricerca
        }
    }
    return path.join(__dirname, '../data/anime-overrides.json');
}

function getEmptyOverrides() {
    return {
        version: 1,
        identities: [],
        certify: []
    };
}

function loadAnimeOverrides(filePath) {
    const targetPath = filePath || resolveDefaultOverridesPath();

    try {
        if (!targetPath || !fs.existsSync(targetPath)) {
            console.warn(`[AnimeOverrides] File override non trovato: "${targetPath}". Nessun override applicato.`);
            return getEmptyOverrides();
        }

        const raw = fs.readFileSync(targetPath, 'utf8');
        const parsed = JSON.parse(raw);

        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
            console.warn(`[AnimeOverrides] Contenuto JSON non conforme (atteso oggetto): "${targetPath}". Nessun override applicato.`);
            return getEmptyOverrides();
        }

        const rawIdentities = Array.isArray(parsed.identities) ? parsed.identities : [];
        const rawCertify = Array.isArray(parsed.certify) ? parsed.certify : [];

        const validIdentities = [];
        for (const item of rawIdentities) {
            if (!item || typeof item !== 'object') continue;
            if (item.tmdbId == null || item.tmdbId === '') continue;
            if (item.anilist == null && item.mal == null && item.tvdb == null) continue;

            validIdentities.push({
                tmdbId: String(item.tmdbId).trim(),
                season: Number(item.season) || 1,
                force: Boolean(item.force),
                anilist: item.anilist != null ? Number(item.anilist) : null,
                mal: item.mal != null ? Number(item.mal) : null,
                tvdb: item.tvdb != null ? String(item.tvdb).trim() : null,
                title: item.title ? String(item.title) : null,
                note: item.note ? String(item.note) : null,
                addedAt: item.addedAt ? String(item.addedAt) : null
            });
        }

        const validCertify = [];
        for (const item of rawCertify) {
            if (!item || typeof item !== 'object') continue;
            if (item.tmdbId == null || item.tmdbId === '') continue;

            validCertify.push({
                tmdbId: String(item.tmdbId).trim(),
                title: item.title ? String(item.title) : null,
                note: item.note ? String(item.note) : null
            });
        }

        return {
            version: parsed.version || 1,
            identities: validIdentities,
            certify: validCertify
        };
    } catch (err) {
        console.warn(`[AnimeOverrides] Errore lettura/parsing file override "${targetPath}": ${err.message}. Nessun override applicato.`);
        return getEmptyOverrides();
    }
}

module.exports = {
    loadAnimeOverrides,
    getEmptyOverrides,
    resolveDefaultOverridesPath
};
