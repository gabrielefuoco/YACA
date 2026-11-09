const express = require('express');
const router = express.Router();
const { richiedeSessione, erroreDominio } = require('./middleware/sessione');

// Ogni rotta di dominio richiede la sessione: l'utente è sempre req.utenteId
router.use(richiedeSessione);

const UserConfig = require('../models/UserConfig');
const { accountDi } = require('../configurazione');
const AddonConfig = require('../models/AddonConfig');
const TasteProfile = require('../models/TasteProfile');
const { getHeroUiGroups } = require('../catalog/registry');
const {
    leggiLibreria,
    trovaItemLibreria,
    salvaItemLibreria,
    normalizeLegacyPosterHost,
    applyDuplicateMarks,
    previewWatchedLibrary,
    removeWatchedLibrary,
    salvaOrdineLibreria,
    LibraryConverterService,
    LibrarySyncService
} = require('../library');
const { syncAllStremioData, updateStremioAddonCollection } = require('../stremio');
const { hybridRecommendationsCache, aiDiscoveryCache } = require('../cache/cacheInstances');

/**
 * GET /api/profilo
 * Restituisce i dati necessari a disegnare la dashboard: anagrafica, profili,
 * cataloghi attivi, chiavi API (mascherate) e heroCatalogs.
 * I dati pesanti (libreria, stato della sincronizzazione, anteprima) stanno su rotte dedicate.
 */
router.get('/', async (req, res) => {
    try {
        const user = await UserConfig.resolveUserConfig(req.utenteId);
        if (!user) {
            return erroreDominio(res, 404, 'non_trovato', 'Profilo utente non trovato.');
        }

        const safeApiKeys = {
            stremio: Boolean(user.apiKeys?.stremio),
            tmdb: user.apiKeys?.tmdb || null,
            mistral: user.apiKeys?.mistral || null,
            trakt: Boolean(user.apiKeys?.trakt),
            traktExpiresAt: user.apiKeys?.traktExpiresAt || null
        };

        const { getCachedProfileShelves } = require('../pool');
        const { resolveProfileShelves } = require('../stremio');
        const activeProfId = (req.query.profileId && String(req.query.profileId).trim())
            || user.activeProfileId
            || 'global';
        const profileObj = (user.profiles || []).find(p => p.id === activeProfId);
        let profileShelves = profileObj?.shelves
            || profileObj?.scaffali
            || getCachedProfileShelves(activeProfId)
            || getCachedProfileShelves(user.userId);

        if (!profileShelves || profileShelves.length === 0) {
            profileShelves = await resolveProfileShelves({ userConfig: user, profileId: activeProfId });
        }

        return res.json({
            userId: user.userId,
            email: user.email || null,
            addonUuid: user.addonUuid || null,
            profiles: user.profiles || [],
            activeProfileId: user.activeProfileId || 'global',
            configVersion: user.configVersion || null,
            customCatalogs: user.customCatalogs || [],
            apiKeys: safeApiKeys,
            hasGlobalErdb: Boolean(process.env.ERDB_CONFIG),
            heroCatalogs: getHeroUiGroups(profileShelves)
        });
    } catch (err) {
        console.error('[ProfiloAPI] Errore lettura profilo:', err.message);
        return erroreDominio(res, 500, 'non_disponibile', 'Impossibile caricare il profilo.');
    }
});

/**
 * GET /api/profilo/modi
 * Le cinque modalità dell'account: nome fisso, emoji, chi è attiva, leve derivate.
 * Rotta spenta con `MODI_ABILITATI` off: il prodotto senza modalità non la espone.
 */
router.get('/modi', async (req, res) => {
    const { modiAbilitati } = require('../profile/modo');
    if (!modiAbilitati()) {
        return erroreDominio(res, 404, 'non_disponibile', 'Le modalità non sono abilitate su questa istanza.');
    }
    try {
        const { elencaModi } = require('../profile/attivazioneModi');
        const user = await UserConfig.resolveUserConfig(req.utenteId);
        if (!user) {
            return erroreDominio(res, 404, 'non_trovato', 'Profilo utente non trovato.');
        }
        const addon = user.addonUuid ? await AddonConfig.findOne({ uuid: user.addonUuid }).lean() : null;
        return res.json({
            ...elencaModi(addon || { profiles: user.profiles }),
            configVersion: addon?.config?.configVersion || user.configVersion || null
        });
    } catch (err) {
        console.error('[ProfiloAPI] Errore lettura modalità:', err.message);
        return erroreDominio(res, 500, 'non_disponibile', 'Impossibile caricare le modalità.');
    }
});

/**
 * POST /api/profilo/modi/attiva
 * Body: { modo: 'generale'|'film'|'serie'|'anime'|'bambini' }
 * Mutuamente esclusivo; un modo sconosciuto è 400, mai un default silenzioso.
 */
router.post('/modi/attiva', async (req, res) => {
    const { modiAbilitati } = require('../profile/modo');
    if (!modiAbilitati()) {
        return erroreDominio(res, 404, 'non_disponibile', 'Le modalità non sono abilitate su questa istanza.');
    }
    try {
        const { attivaModo } = require('../profile/attivazioneModi');
        const risultato = await attivaModo({
            userId: req.utenteId,
            modo: req.body?.modo
        });

        // Propagazione a Stremio (ticket 04): stessa catena della dashboard, con
        // l'URL che porta il nuovo configVersion. Il client vede al prossimo avvio.
        await propagaAStremio(req, risultato);

        return res.json(risultato);
    } catch (err) {
        const status = err.status || 500;
        const code = err.code || (status === 400 ? 'richiesta_non_valida' : 'non_disponibile');
        if (status >= 500) console.error('[ProfiloAPI] Errore attivazione modalità:', err.message);
        return erroreDominio(res, status, code, err.message || 'Impossibile attivare la modalità.');
    }
});

/**
 * Propagazione a Stremio (ticket 04): un cambio di manifest scrive la nuova
 * collezione con l'URL che porta il nuovo `configVersion`. Fire-and-forget: la
 * risposta HTTP non aspetta Stremio Cloud, il client vede al prossimo avvio.
 */
async function propagaAStremio(req, risultato) {
    if (!risultato?.manifestChanged) return;
    try {
        const account = await accountDi(req.utenteId).catch(() => null);
        if (!account?.apiKeys?.stremio) return;
        const hostUrl = req.context?.hostUrl || `${req.protocol}://${req.get('host')}`;
        const manifestUrl = `${hostUrl}/${req.utenteId}/${risultato.configVersion}/manifest.json`;
        updateStremioAddonCollection(account.apiKeys.stremio, manifestUrl)
            .catch(error => console.error('[ProfiloAPI] Aggiornamento Stremio fallito:', error.message));
    } catch (error) {
        console.error('[ProfiloAPI] Aggiornamento Stremio fallito:', error.message);
    }
}

/** Forma d'errore unica per le rotte di dominio (400 dichiarato, mai un default). */
function rispostaErroreDominio(res, err, etichetta) {
    const status = err.status || 500;
    const code = err.code || (status === 400 ? 'richiesta_non_valida' : 'non_disponibile');
    if (status >= 500) console.error(`[ProfiloAPI] ${etichetta}:`, err.message);
    return erroreDominio(res, status, code, err.message || etichetta);
}

/**
 * GET /api/profilo/cataloghi
 * Tutto ciò che Esplora disegna per la modalità attiva: suggerimenti del grafo
 * (stesso resolver del manifest), watchlist, creazioni e «Tutti».
 * I gruppi vuoti sono omessi, non restituiti come `[]`.
 */
router.get('/cataloghi', async (req, res) => {
    const { modiAbilitati } = require('../profile/modo');
    if (!modiAbilitati()) {
        return erroreDominio(res, 404, 'non_disponibile', 'Le modalità non sono abilitate su questa istanza.');
    }
    try {
        const { elencaEsplora } = require('../profile/cataloghiEsplora');
        const user = await UserConfig.resolveUserConfig(req.utenteId);
        if (!user) {
            return erroreDominio(res, 404, 'non_trovato', 'Profilo utente non trovato.');
        }
        return res.json(await elencaEsplora(user, req.query?.modo ?? null));
    } catch (err) {
        return rispostaErroreDominio(res, err, 'Impossibile caricare i cataloghi');
    }
});

/**
 * POST /api/profilo/cataloghi/attiva
 * Body: { id: string, attivo: boolean, modo?: string } — idempotente, in coda
 * all'attivazione. `modo` permette di modificare le liste di una modalità non attiva:
 * i cataloghi appartengono alla modalità, non all'atto di attivarla.
 */
router.post('/cataloghi/attiva', async (req, res) => {
    const { modiAbilitati } = require('../profile/modo');
    if (!modiAbilitati()) {
        return erroreDominio(res, 404, 'non_disponibile', 'Le modalità non sono abilitate su questa istanza.');
    }
    try {
        const { attivaCatalogo } = require('../profile/cataloghiEsplora');
        const user = await UserConfig.resolveUserConfig(req.utenteId);
        if (!user) {
            return erroreDominio(res, 404, 'non_trovato', 'Profilo utente non trovato.');
        }
        const risultato = await attivaCatalogo({ userConfig: user, id: req.body?.id, attivo: req.body?.attivo, modo: req.body?.modo ?? null });
        await propagaAStremio(req, risultato);
        return res.json(risultato);
    } catch (err) {
        return rispostaErroreDominio(res, err, 'Impossibile attivare il catalogo');
    }
});

/**
 * POST /api/profilo/cataloghi/ordine
 * Body: { ids: string[], modo?: string } — permutazione esatta dei cataloghi attivi della modalità.
 */
router.post('/cataloghi/ordine', async (req, res) => {
    const { modiAbilitati } = require('../profile/modo');
    if (!modiAbilitati()) {
        return erroreDominio(res, 404, 'non_disponibile', 'Le modalità non sono abilitate su questa istanza.');
    }
    try {
        const { riordinaCataloghi } = require('../profile/cataloghiEsplora');
        const user = await UserConfig.resolveUserConfig(req.utenteId);
        if (!user) {
            return erroreDominio(res, 404, 'non_trovato', 'Profilo utente non trovato.');
        }
        const risultato = await riordinaCataloghi({ userConfig: user, ids: req.body?.ids, modo: req.body?.modo ?? null });
        await propagaAStremio(req, risultato);
        return res.json(risultato);
    } catch (err) {
        return rispostaErroreDominio(res, err, 'Impossibile riordinare i cataloghi');
    }
});

/**
 * GET /api/profilo/libreria
 * Restituisce i titoli presenti nella libreria dell'utente.
 */
router.get('/libreria', async (req, res) => {
    try {
        const account = await accountDi(req.utenteId);
        if (!account?.addonUuid) {
            return erroreDominio(res, 404, 'non_trovato', 'Account utente non trovato.');
        }

        const items = await leggiLibreria({ addonUuid: account.addonUuid });
        const currentHost = process.env.HOST_URL || `${req.protocol}://${req.get('host')}`;

        const seen = new Set();
        const mappedItems = [];

        for (const item of items) {
            const effectiveId = String(item.itemId || item._id).trim();
            if (!effectiveId || seen.has(effectiveId)) continue;
            seen.add(effectiveId);

            mappedItems.push({
                ...item,
                poster: normalizeLegacyPosterHost(item.poster, currentHost),
                _id: effectiveId,
                itemId: effectiveId
            });
        }

        return res.json(mappedItems);
    } catch (err) {
        console.error('[ProfiloAPI] Errore fetch libreria:', err.message);
        return erroreDominio(res, 500, 'non_disponibile', 'Impossibile recuperare la libreria.');
    }
});

/**
 * POST /api/profilo/libreria
 * Aggiunge un nuovo titolo alla libreria.
 */
router.post('/libreria', async (req, res) => {
    const { item } = req.body || {};
    if (!item || !item.id || !item.type) {
        return erroreDominio(res, 400, 'richiesta_non_valida', 'Dati elemento mancanti (id, type obbligatori).');
    }

    try {
        const account = await accountDi(req.utenteId);
        if (!account?.addonUuid) {
            return erroreDominio(res, 404, 'non_trovato', 'Account utente non trovato.');
        }

        const normalizedItemId = LibrarySyncService.normalizeSyncItemId(item.id);
        if (!normalizedItemId) {
            return erroreDominio(res, 400, 'richiesta_non_valida', 'Identificatore elemento non valido.');
        }

        const now = new Date();
        let poster = item.poster || '';
        if (!poster) {
            const { resolvePoster } = require('../posters/posterResolver');
            const resolved = await resolvePoster({ itemId: normalizedItemId, type: item.type, name: item.name });
            if (resolved) poster = resolved;
        }

        let existing = await trovaItemLibreria({
            addonUuid: account.addonUuid,
            itemId: normalizedItemId
        }) || (normalizedItemId !== item.id ? await trovaItemLibreria({
            addonUuid: account.addonUuid,
            itemId: item.id
        }) : null);

        const ctime = existing?._ctime || (item._ctime ? new Date(item._ctime) : now);

        const doc = {
            addonUuid: account.addonUuid,
            itemId: normalizedItemId,
            type: item.type,
            name: item.name || '',
            poster,
            posterShape: item.posterShape || 'poster',
            background: item.background || '',
            year: item.year ? item.year.toString() : '',
            removed: false,
            temp: false,
            _ctime: ctime,
            _mtime: now,
            mapped: false
        };

        if (existing) {
            Object.assign(existing, doc);
            existing.itemId = normalizedItemId;
            await existing.save();
        } else {
            await salvaItemLibreria(doc);
        }

        await applyDuplicateMarks(account.addonUuid);

        let hostUrl = process.env.BASE_URL;
        if (!hostUrl) {
            const fwdHost = req.headers['x-forwarded-host'];
            hostUrl = fwdHost ? `https://${fwdHost}` : `${req.protocol}://${req.get('host')}`;
        }

        LibraryConverterService.convertAll(req.utenteId, hostUrl)
            .catch(e => console.error('[ProfiloAPI] Errore background converter:', e.message));

        return res.json({ success: true, item: doc });
    } catch (err) {
        console.error('[ProfiloAPI] Errore aggiunta titolo in libreria:', err.message);
        return erroreDominio(res, 500, 'non_disponibile', 'Impossibile aggiungere il titolo alla libreria.');
    }
});

/**
 * DELETE /api/profilo/libreria/:itemId
 * Rimuove un titolo dalla libreria (soft-delete).
 */
router.delete('/libreria/:itemId', async (req, res) => {
    const { itemId } = req.params;
    if (!itemId) {
        return erroreDominio(res, 400, 'richiesta_non_valida', 'Identificatore elemento mancante.');
    }

    try {
        const account = await accountDi(req.utenteId);
        if (!account?.addonUuid) {
            return erroreDominio(res, 404, 'non_trovato', 'Account utente non trovato.');
        }

        const item = await trovaItemLibreria({
            addonUuid: account.addonUuid,
            itemId
        });

        if (item) {
            item.removed = true;
            item._mtime = new Date();
            await item.save();

            if (account.apiKeys?.stremio) {
                const { stremioClient } = require('../stremio');
                await stremioClient.post('/api/datastorePut', {
                    authKey: account.apiKeys.stremio,
                    collection: 'libraryItem',
                    changes: [{
                        _id: item.itemId || item._id,
                        removed: true,
                        _mtime: item._mtime
                    }]
                }).catch(e => console.warn('[ProfiloAPI] Stremio datastorePut warning:', e.message));
            }
        }

        return res.json({ success: true });
    } catch (err) {
        console.error('[ProfiloAPI] Errore rimozione titolo dalla libreria:', err.message);
        return erroreDominio(res, 500, 'non_disponibile', 'Impossibile rimuovere il titolo.');
    }
});

/**
 * PUT /api/profilo/libreria/ordine
 * Aggiorna l'ordine personalizzato della libreria nel profilo.
 */
router.put('/libreria/ordine', async (req, res) => {
    const { itemIds, profileId = 'global' } = req.body || {};
    if (!Array.isArray(itemIds)) {
        return erroreDominio(res, 400, 'richiesta_non_valida', 'itemIds deve essere un array.');
    }

    try {
        const account = await accountDi(req.utenteId);
        if (!account?.addonUuid) {
            return erroreDominio(res, 404, 'non_trovato', 'Account utente non trovato.');
        }

        const addonConfig = await AddonConfig.findOne({ uuid: account.addonUuid });
        if (!addonConfig) {
            return erroreDominio(res, 404, 'non_trovato', 'Configurazione addon non trovata.');
        }

        const profile = (addonConfig.profiles || []).find(p => p.id === profileId);
        if (!profile) {
            return erroreDominio(res, 404, 'non_trovato', 'Profilo specificato non trovato.');
        }

        const cleanOrder = [...new Set(itemIds.map(String))];

        // L'ordine e' della LIBRERIA (ticket 21): si scrive dal suo writer, che scrive il modello
        // nuovo (UserLibraryOrder) E lo specchio di transizione su AddonConfig. Scrivendo qui il
        // solo posto vecchio, la migrazione restava FERMA: il modello nuovo non veniva mai
        // popolato, il ripiego in lettura si attivava sempre, e il ticket 21 non si chiudeva mai.
        await salvaOrdineLibreria({ addonUuid: account.addonUuid, profileId, itemIds: cleanOrder });

        return res.json({ success: true, libraryOrder: cleanOrder });
    } catch (err) {
        console.error('[ProfiloAPI] Errore riordino libreria:', err.message);
        return erroreDominio(res, 500, 'non_disponibile', 'Impossibile riordinare la libreria.');
    }
});

/**
 * GET /api/profilo/libreria/visti
 * Anteprima read-only dei titoli visti che verrebbero rimossi.
 */
router.get('/libreria/visti', async (req, res) => {
    try {
        const account = await accountDi(req.utenteId);
        if (!account?.addonUuid) {
            return erroreDominio(res, 404, 'non_trovato', 'Account utente non trovato.');
        }

        const preview = await previewWatchedLibrary({ addonUuid: account.addonUuid });
        return res.json({
            count: preview.count,
            totalRecords: preview.totalRecords,
            items: preview.items.map(item => ({
                itemId: String(item.itemId || item._id || '').trim(),
                name: item.name || '',
                type: item.type || ''
            }))
        });
    } catch (err) {
        console.error('[ProfiloAPI] Errore anteprima visti:', err.message);
        return erroreDominio(res, 500, 'non_disponibile', 'Impossibile calcolare i titoli visti.');
    }
});

/**
 * POST /api/profilo/libreria/visti
 * Esegue la rimozione dei titoli visti dalla libreria locale e su Stremio.
 */
router.post('/libreria/visti', async (req, res) => {
    try {
        const account = await accountDi(req.utenteId);
        if (!account?.addonUuid) {
            return erroreDominio(res, 404, 'non_trovato', 'Account utente non trovato.');
        }

        if (!account.apiKeys?.stremio) {
            return erroreDominio(res, 400, 'chiave_non_valida', 'Chiave Stremio mancante per sincronizzare la rimozione.');
        }

        const result = await removeWatchedLibrary({
            addonUuid: account.addonUuid,
            stremioAuthKey: account.apiKeys.stremio
        });

        return res.json(result);
    } catch (err) {
        console.error('[ProfiloAPI] Errore rimozione titoli visti:', err.message);
        return erroreDominio(res, 500, 'non_disponibile', 'Impossibile rimuovere i titoli visti.');
    }
});

/**
 * GET /api/profilo/sincronizzazione
 * Restituisce lo stato di avanzamento e i dati della sincronizzazione del profilo.
 */
router.get('/sincronizzazione', async (req, res) => {
    const profileId = (req.query && req.query.profileId) || 'global';
    try {
        const account = await accountDi(req.utenteId);
        const addonConfig = account?.addonUuid
            ? await AddonConfig.findOne({ uuid: account.addonUuid }).lean()
            : null;
        const profileSettings = (addonConfig?.profiles || []).find((p) => p.id === profileId)?.settings || {};
        const profile = await TasteProfile.findOne({ owner: req.utenteId, context: profileId });

        return res.json({
            isSyncing: profile?.syncStatus?.isSyncing || false,
            total: profile?.syncStatus?.total || 0,
            current: profile?.syncStatus?.current || 0,
            lastSync: profile?.syncStatus?.lastSync || null,
            onboardingCompleted: profile?.onboardingCompleted || false
        });
    } catch (err) {
        console.error('[ProfiloAPI] Errore stato sincronizzazione:', err.message);
        return erroreDominio(res, 500, 'non_disponibile', 'Impossibile leggere lo stato di sincronizzazione.');
    }
});

/**
 * POST /api/profilo/sincronizzazione
 * Avvia l'orchestrazione della sincronizzazione: aggiornamento Stremio, conversione metadati.
 */
router.post('/sincronizzazione', async (req, res) => {
    const profileId = (req.body && req.body.profileId) || 'global';
    try {
        const account = await accountDi(req.utenteId);
        if (!account) {
            return erroreDominio(res, 404, 'non_trovato', 'Account utente non trovato.');
        }

        await TasteProfile.updateOne(
            { owner: req.utenteId, context: profileId },
            {
                $set: {
                    'syncStatus.isSyncing': true,
                    'syncStatus.total': 1,
                    'syncStatus.current': 0
                }
            },
            { upsert: true }
        );

        let hostUrl = process.env.BASE_URL;
        if (!hostUrl) {
            const fwdHost = req.headers['x-forwarded-host'];
            hostUrl = fwdHost ? `https://${fwdHost}` : `${req.protocol}://${req.get('host')}`;
        }

        if (account.apiKeys?.stremio) {
            syncAllStremioData(req.utenteId, account.apiKeys.stremio, profileId)
                .catch(err => console.error('[ProfiloAPI] Errore syncAllStremioData:', err.message));
        }

        LibraryConverterService.convertAll(req.utenteId, hostUrl)
            .catch(err => console.error('[ProfiloAPI] Errore convertAll:', err.message));

        return res.json({ success: true, message: 'Sincronizzazione avviata.' });
    } catch (err) {
        console.error('[ProfiloAPI] Errore avvio sincronizzazione:', err.message);
        return erroreDominio(res, 500, 'non_disponibile', 'Impossibile avviare la sincronizzazione.');
    }
});

/**
 * POST /api/profilo/aggiorna
 * Replaces POST /api/clear-cache: intenzione utente «ricostruisci i miei suggerimenti».
 * Invalida le cache di raccomandazione dell'utente.
 */
router.post('/aggiorna', async (req, res) => {
    try {
        await hybridRecommendationsCache.clear();
        await aiDiscoveryCache.clear();
        return res.json({ success: true, message: 'Suggerimenti aggiornati con successo.' });
    } catch (err) {
        console.error('[ProfiloAPI] Errore aggiornamento suggerimenti:', err.message);
        return erroreDominio(res, 500, 'non_disponibile', 'Impossibile aggiornare i suggerimenti.');
    }
});

module.exports = router;
