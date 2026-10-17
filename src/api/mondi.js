/**
 * LA ROTTA DI DOMINIO DEL GRAFO — `POST /api/mondi`.
 *
 * Prende il profilo dalla sessione (`req.utenteId`), legge la sua cronologia da `src/library`
 * e chiede le liste spiegate dei mondi al servizio (`src/clients/graphClient`).
 *
 * Replaces `/api/bolle`: "bolle" è la parola interna dell'engine; la rotta di dominio è "mondi".
 */
const express = require('express');
const router = express.Router();
const { richiedeSessione, erroreDominio } = require('../middleware/sessione');
const { cronologiaDi } = require('../library');
const graphClient = require('../clients/graphClient');

const STORIA_MAX = 300;

router.use(richiedeSessione);

router.post('/', async (req, res) => {
    try {
        const userId = req.utenteId;
        const profileId = (req.body && req.body.profileId) || 'global';
        const quante = Math.max(1, Math.min(8, Number(req.body && req.body.quante) || 4));

        const voci = await cronologiaDi({ userId, profileId, limit: STORIA_MAX });
        if (!voci || voci.length === 0) {
            return res.json({
                ok: true,
                mondi: [],
                liste: [],
                items: [],
                versioni: {},
                esclusi: [],
                quanti_voci: 0,
                profilo: profileId
            });
        }

        const semi = voci.map((v) => {
            const tmdbId = Number(v.tmdbId);
            const med = v.type === 'movie' ? 'movie' : 'series';
            const tipo = (v.signals && v.signals[0] && v.signals[0].type) || 'watched';
            return { tmdbId, medium: med, tipo, peso: v.peso };
        }).filter((s) => Number.isFinite(s.tmdbId));

        let fuori;
        try {
            const opzioni = (req.body && (req.body.sliders || req.body.slider || req.body.opzioni)) || undefined;
            fuori = await graphClient.raccomanda({ semi, opzioni, cap: quante * 15 });
        } catch (err) {
            console.error('[MondiAPI] Errore servizio grafo:', err.message);
            fuori = { liste: [], versioni: {} };
        }

        const liste = (fuori?.liste || []).map((l) => ({
            ...l,
            tipo: l.tipo || l.ruolo
        }));

        const items = liste.flatMap((l) => (l.titoli || []).map((t) => ({
            id: t.tmdbId,
            type: t.medium === 'movie' ? 'movie' : 'tv',
            punteggio: t.punteggio
        })));

        const esclusi = voci.map((v) => `${v.type === 'movie' ? 'movie' : 'tv'}:${v.tmdbId}`);

        return res.json({
            ok: true,
            mondi: liste,
            liste,
            items,
            versioni: fuori?.versioni || {},
            esclusi,
            quanti_voci: voci.length,
            profilo: profileId
        });
    } catch (err) {
        console.error('[MondiAPI] Errore generazione mondi:', err.message);
        return erroreDominio(res, 500, 'non_disponibile', 'Impossibile generare le raccomandazioni dei mondi.');
    }
});

module.exports = router;
