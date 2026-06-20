const express = require('express');
const router = express.Router();
const { nanoid } = require('nanoid');
const UserList = require('../models/UserList');
const UserAccount = require('../db/models/UserAccount');
const AddonConfig = require('../db/models/AddonConfig');
const { validateAuth } = require('./configure/validators');

/**
 * GET /api/lists
 * Recupera tutte le liste dell'utente loggato.
 */
router.get('/', async (req, res) => {
    try {
        validateAuth(req);
        const lists = await UserList.find({ owner: req.user.userId }).sort({ updatedAt: -1 }).lean();
        res.json({ success: true, lists });
    } catch (err) {
        if (err.status) return res.status(err.status).json({ error: err.message });
        console.error('[ListsAPI] Errore recupero liste:', err.message);
        res.status(500).json({ error: 'Errore interno nel recupero delle liste.' });
    }
});

/**
 * GET /api/lists/:listId
 * Recupera i dettagli di una specifica lista.
 */
router.get('/:listId', async (req, res) => {
    try {
        validateAuth(req);
        const list = await UserList.findOne({ listId: req.params.listId, owner: req.user.userId }).lean();
        if (!list) {
            return res.status(404).json({ error: 'Lista non trovata.' });
        }
        res.json({ success: true, list });
    } catch (err) {
        if (err.status) return res.status(err.status).json({ error: err.message });
        console.error('[ListsAPI] Errore recupero lista:', err.message);
        res.status(500).json({ error: 'Errore interno nel recupero della lista.' });
    }
});

/**
 * POST /api/lists
 * Crea una nuova lista manuale.
 */
router.post('/', async (req, res) => {
    try {
        validateAuth(req);
        const { name, type, sourceType, items, queries } = req.body;

        if (!name) {
            return res.status(400).json({ error: 'Il nome della lista è obbligatorio.' });
        }

        const resolvedType = type === 'series' ? 'series' : 'movie';
        const resolvedSourceType = sourceType || 'manual_items';

        // Filtra gli items in base al tipo della lista per evitare liste miste
        const filteredItems = (items || []).filter(item => {
            const itemType = item.type === 'series' ? 'series' : 'movie';
            return itemType === resolvedType;
        });

        const listId = `list_${nanoid(10)}`;

        const newList = new UserList({
            owner: req.user.userId,
            listId,
            name,
            type: resolvedType,
            sourceType: resolvedSourceType,
            items: filteredItems,
            queries
        });

        await newList.save();
        res.json({ success: true, list: newList });
    } catch (err) {
        if (err.status) return res.status(err.status).json({ error: err.message });
        console.error('[ListsAPI] Errore creazione lista:', err.message);
        res.status(500).json({ error: 'Errore interno durante la creazione della lista.' });
    }
});

/**
 * PUT /api/lists/:listId
 * Aggiorna una lista esistente.
 */
router.put('/:listId', async (req, res) => {
    try {
        validateAuth(req);
        const { name, items, queries, presentation_strategy } = req.body;

        const list = await UserList.findOne({ listId: req.params.listId, owner: req.user.userId });
        if (!list) {
            return res.status(404).json({ error: 'Lista non trovata.' });
        }

        if (name) list.name = name;
        if (presentation_strategy) list.presentation_strategy = presentation_strategy;

        if (items) {
            // Filtra gli items per tipo della lista
            list.items = items.filter(item => {
                const itemType = item.type === 'series' ? 'series' : 'movie';
                return itemType === list.type;
            });
        }
        if (queries) list.queries = queries;

        await list.save();
        res.json({ success: true, list });
    } catch (err) {
        if (err.status) return res.status(err.status).json({ error: err.message });
        console.error('[ListsAPI] Errore aggiornamento lista:', err.message);
        res.status(500).json({ error: 'Errore interno durante l\'aggiornamento.' });
    }
});

/**
 * DELETE /api/lists/:listId
 * Elimina una lista ed elimina i riferimenti dai profili del manifest Stremio.
 */
router.delete('/:listId', async (req, res) => {
    try {
        validateAuth(req);
        const listId = req.params.listId;

        const result = await UserList.deleteOne({ listId, owner: req.user.userId });
        if (result.deletedCount === 0) {
            return res.status(404).json({ error: 'Lista non trovata.' });
        }

        // Rimuove i riferimenti dai profili in AddonConfig
        const account = await UserAccount.findOne({ userId: req.user.userId }).lean();
        if (account?.addonUuid) {
            await AddonConfig.updateOne(
                { uuid: account.addonUuid },
                { $pull: { 'profiles.$[].catalogs': { id: listId } } }
            );
        }

        res.json({ success: true, message: 'Lista eliminata con successo.' });
    } catch (err) {
        if (err.status) return res.status(err.status).json({ error: err.message });
        console.error('[ListsAPI] Errore eliminazione lista:', err.message);
        res.status(500).json({ error: 'Errore interno durante l\'eliminazione.' });
    }
});

/**
 * POST /api/lists/:listId/clone
 * Duplica una lista manuale o dinamica.
 */
router.post('/:listId/clone', async (req, res) => {
    try {
        validateAuth(req);
        const list = await UserList.findOne({ listId: req.params.listId, owner: req.user.userId }).lean();
        if (!list) {
            return res.status(404).json({ error: 'Lista da clonare non trovata.' });
        }

        const listId = `list_${nanoid(10)}`;
        const clonedList = new UserList({
            owner: req.user.userId,
            listId,
            name: `${list.name} (Copia)`,
            type: list.type,
            sourceType: list.sourceType,
            items: list.items,
            queries: list.queries,
            presentation_strategy: list.presentation_strategy,
            rawPrompt: list.rawPrompt
        });

        await clonedList.save();
        res.json({ success: true, list: clonedList });
    } catch (err) {
        if (err.status) return res.status(err.status).json({ error: err.message });
        console.error('[ListsAPI] Errore clonazione lista:', err.message);
        res.status(500).json({ error: 'Errore interno durante la clonazione.' });
    }
});

/**
 * POST /api/lists/merge
 * Unisce due o più liste dello stesso tipo in una nuova lista manuale.
 */
router.post('/merge', async (req, res) => {
    try {
        validateAuth(req);
        const { sourceListIds, targetListName } = req.body;

        if (!sourceListIds || !Array.isArray(sourceListIds) || sourceListIds.length < 2) {
            return res.status(400).json({ error: 'Specificare almeno due liste da unire.' });
        }

        const lists = await UserList.find({ listId: { $in: sourceListIds }, owner: req.user.userId }).lean();
        if (lists.length === 0) {
            return res.status(404).json({ error: 'Liste non trovate.' });
        }

        // Verifica che tutte le liste abbiano lo stesso tipo per evitare liste miste
        const listType = lists[0].type;
        const hasMixedTypes = lists.some(l => l.type !== listType);
        if (hasMixedTypes) {
            return res.status(400).json({ error: 'Impossibile unire liste di tipo diverso (film e serie tv).' });
        }

        const mergedItems = [];
        const seen = new Set();

        for (const list of lists) {
            for (const item of list.items || []) {
                const key = item.tmdbId ? `tmdb:${item.tmdbId}` : `imdb:${item.imdbId}`;
                if (key && !seen.has(key)) {
                    seen.add(key);
                    mergedItems.push(item);
                }
            }
        }

        const listId = `list_${nanoid(10)}`;
        const mergedList = new UserList({
            owner: req.user.userId,
            listId,
            name: targetListName || 'Unione Liste',
            type: listType,
            sourceType: 'manual_items',
            items: mergedItems
        });

        await mergedList.save();
        res.json({ success: true, list: mergedList });
    } catch (err) {
        if (err.status) return res.status(err.status).json({ error: err.message });
        console.error('[ListsAPI] Errore unione liste:', err.message);
        res.status(500).json({ error: 'Errore interno durante l\'unione delle liste.' });
    }
});

module.exports = router;
