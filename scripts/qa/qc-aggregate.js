#!/usr/bin/env node
/**
 * scripts/qa/qc-aggregate.js
 *
 * Aggrega i verdetti della campagna QC (preset + hero) in un unico report,
 * verificando quello che e' verificabile a macchina:
 *  - copertura: ogni catalogo atteso ha un verdetto (e nessun verdetto orfano);
 *  - forma: campi obbligatori, score 0-100, verdetto coerente con le soglie;
 *  - anti-allucinazione: ogni riga di `errori` deve puntare a un titolo che
 *    esiste davvero in quella posizione nel dump (top50/ o hero-enriched/).
 *
 * Non riscrive i verdetti: le correzioni sono dell'orchestratore (verifica D8
 * della spec) e vanno annotate a mano nel report.
 *
 * Riferimenti: .scratch/qc-cataloghi/issues/01-campagna-qc-cataloghi.md (D6, D8, D9)
 *
 * Uso:
 *   node scripts/qa/qc-aggregate.js --root .scratch/qc-cataloghi [--out <file.json>] [--json]
 */

const fs = require('fs');
const path = require('path');

const WEIGHTS = { pertinenza: 0.35, qualita: 0.20, distintivita: 0.15, coerenza: 0.15, completezza: 0.15 };
const DIMS = Object.keys(WEIGHTS);

const norm = s => String(s || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\(\s*\d{4}\s*\)\s*$/, '')
    .replace(/[^\p{L}\p{N} ]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

function parseArgs() {
    const args = process.argv.slice(2);
    const opts = { root: '.scratch/qc-cataloghi', out: null, json: false };
    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--root' && args[i + 1]) opts.root = args[++i];
        else if (args[i] === '--out' && args[i + 1]) opts.out = args[++i];
        else if (args[i] === '--json') opts.json = true;
    }
    return opts;
}

function readJsonSafe(file) {
    try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { return { __error: e.message }; }
}

function verdictFromScore(score) {
    if (score >= 80) return 'P';
    if (score >= 60) return 'B';
    return 'N';
}

/** Verifica che la riga di errore punti a un titolo reale del dump, alla posizione dichiarata. */
function checkError(error, items) {
    const pos = Number(error.pos);
    const itemAtPos = Number.isFinite(pos) ? items.find(i => i.pos === pos) : null;
    const wanted = norm(error.titolo);
    const atPosMatches = itemAtPos && norm(itemAtPos.titolo) === wanted;
    const anywhere = items.some(i => norm(i.titolo) === wanted);
    if (anywhere) return { ok: true, posCoerente: atPosMatches };
    return { ok: false, posCoerente: false };
}

function validateVerdict(v, index, sourceFile) {
    const problems = [];
    // Per gli hero l'identita' e' profileId::catalogId: senza il prefisso i due media type collidono.
    const id = (v.id && String(v.id).includes('::')) ? v.id : (v.catalogo || v.id);
    if (!id) problems.push('id mancante');
    if (!Number.isFinite(Number(v.score))) problems.push('score non numerico');
    const score = Number(v.score);
    if (score < 0 || score > 100) problems.push('score fuori scala');
    for (const d of DIMS) {
        if (!v.dimensioni || !Number.isFinite(Number(v.dimensioni[d]))) problems.push(`dimensione mancante: ${d}`);
    }
    const weighted = v.dimensioni && DIMS.every(d => Number.isFinite(Number(v.dimensioni[d])))
        ? Math.round(DIMS.reduce((acc, d) => acc + WEIGHTS[d] * Number(v.dimensioni[d]), 0))
        : null;
    if (weighted !== null && Math.abs(weighted - score) > 2) problems.push(`score ${score} incoerente con le dimensioni (atteso ~${weighted})`);
    if (!['P', 'B', 'N'].includes(v.verdetto)) problems.push(`verdetto non valido: ${v.verdetto}`);
    else if (verdictFromScore(score) !== v.verdetto) problems.push(`verdetto ${v.verdetto} incoerente con score ${score}`);
    if (!v.motivo || String(v.motivo).trim().length < 15) problems.push('motivo assente o troppo corto');
    if (!v.fiducia) problems.push('fiducia mancante');

    const items = index.get(id) || [];
    let erroriVerificati = 0;
    let erroriConTitoloInesistente = 0;
    let erroriFuoriPosizione = 0;
    for (const err of v.errori || []) {
        const res = checkError(err, items);
        if (!res.ok) erroriConTitoloInesistente++;
        else {
            erroriVerificati++;
            if (!res.posCoerente) erroriFuoriPosizione++;
        }
    }
    return {
        id, verdetto: v.verdetto, score, dimensioni: v.dimensioni || null, fiducia: v.fiducia || null,
        motivo: v.motivo || '', evidenza: v.evidenza || [], errori: v.errori || [], itemGiudicati: v.itemGiudicati ?? null,
        catalogo: v.catalogo || null, profilo: v.id && v.id.includes('::') ? v.id.split('::')[0] : null,
        tipo: v.tipo || null, nome: v.nome || null,
        // A 1-3 punti da una soglia il verdetto e' un lancio di moneta, non una misura: va detto.
        borderline: [60, 80].some(t => Math.abs(score - t) <= 3),
        problemi: problems, scoreDaDimensioni: weighted, erroriVerificati, erroriConTitoloInesistente, erroriFuoriPosizione,
        sorgente: sourceFile, presenteInDump: items.length > 0
    };
}

function main() {
    const opts = parseArgs();
    const root = path.resolve(opts.root);

    // ── Indici dei dump (per copertura e verifica anti-allucinazione) ──
    const top50Index = readJsonSafe(path.join(root, 'runs/top50/index.json'));
    const presetIndex = new Map();
    const presetMeta = new Map();
    for (const c of top50Index.catalogs || []) {
        const dump = readJsonSafe(path.join(root, 'runs/top50/top50', `${c.id}.json`));
        presetIndex.set(c.id, dump.items || []);
        presetMeta.set(c.id, { category: c.category, type: c.type, name: c.name, pool: c.pool, itemsCount: c.itemsCount, isAnime: c.isAnime });
    }

    const heroEnrichedRoot = path.join(root, 'runs/hero/hero-enriched');
    const heroIndex = readJsonSafe(path.join(heroEnrichedRoot, 'index.json'));
    const heroList = [];
    for (const dir of fs.existsSync(heroEnrichedRoot) ? fs.readdirSync(heroEnrichedRoot) : []) {
        const dirPath = path.join(heroEnrichedRoot, dir);
        if (!fs.statSync(dirPath).isDirectory()) continue;
        for (const f of fs.readdirSync(dirPath).filter(f => f.endsWith('.json'))) {
            const content = readJsonSafe(path.join(dirPath, f));
            if (content.__error) continue;
            heroList.push(content);
        }
    }
    const heroIndexMap = new Map(heroList.map(h => [`${h.profileId}::${h.catalogId}`, h.items || []]));

    // ── Verdetti preset e hero ──
    const presetReviewDir = path.join(root, 'review/preset');
    const heroReviewDir = path.join(root, 'review/hero');
    const presetVerdicts = [];
    const heroVerdicts = [];
    const fileErrors = [];

    const loadDir = (dir, target, useHeroIndex) => {
        if (!fs.existsSync(dir)) return;
        for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.json')).sort()) {
            const arr = readJsonSafe(path.join(dir, f));
            if (!Array.isArray(arr)) { fileErrors.push({ file: f, error: arr.__error || 'non e\' un array JSON' }); continue; }
            for (const v of arr) {
                const index = useHeroIndex
                    ? new Map([[v.id, heroIndexMap.get(v.id) || []]])
                    : presetIndex;
                target.push(validateVerdict(v, index, f));
            }
        }
    };
    // Correzioni dell'orchestratore (verifica D8): primo cittadino, non patch a mano sui verdi.
    const correzioniPath = path.join(root, 'review/correzioni.json');
    const correzioni = fs.existsSync(correzioniPath) ? readJsonSafe(correzioniPath) : [];
    const correzioniById = new Map((Array.isArray(correzioni) ? correzioni : []).map(c => [c.id, c]));

    loadDir(presetReviewDir, presetVerdicts, false);
    // Un id puo' comparire in un solo file: la campagna produce un verdetto per catalogo.
    // I ri-giudizi di controllo stanno fuori da review/ (runs/), non qui.
    const dupes = [];
    const seenIds = new Map();
    for (const v of [...presetVerdicts, ...heroVerdicts]) {
        if (seenIds.has(v.id)) dupes.push({ id: v.id, primoFile: seenIds.get(v.id), secondoFile: v.sorgente });
        else seenIds.set(v.id, v.sorgente);
    }
    loadDir(heroReviewDir, heroVerdicts, true);

    const applicate = [];
    for (const v of [...presetVerdicts, ...heroVerdicts]) {
        const c = correzioniById.get(v.id);
        if (!c) continue;
        applicate.push({ id: v.id, da: { score: v.score, verdetto: v.verdetto, dimensioni: v.dimensioni }, a: { score: c.score, verdetto: c.verdetto, dimensioni: c.dimensioni || v.dimensioni }, motivo: c.motivo, fonte: c.fonte || 'orchestratore' });
        v.originale = { score: v.score, verdetto: v.verdetto, dimensioni: v.dimensioni };
        v.score = c.score;
        v.verdetto = c.verdetto;
        if (c.dimensioni) v.dimensioni = c.dimensioni;
        if (c.motivo) v.motivo = c.motivo;
        v.corretta = true;
    }

    // ── Copertura ──
    const expectedPresets = [...presetMeta.keys()];
    const seenPresets = new Set(presetVerdicts.map(v => v.id));
    const expectedHeroes = [...heroIndexMap.keys()];
    const seenHeroes = new Set(heroVerdicts.map(v => v.id));

    const coverage = {
        presetAttesi: expectedPresets.length,
        presetGiudicati: [...seenPresets].length,
        presetMancanti: expectedPresets.filter(id => !seenPresets.has(id)),
        presetOrfani: [...seenPresets].filter(id => !presetMeta.has(id)),
        heroAttesi: expectedHeroes.length,
        heroGiudicati: [...seenHeroes].filter(id => heroIndexMap.has(id)).length,
        heroMancanti: expectedHeroes.filter(id => !seenHeroes.has(id)),
        heroOrfani: [...seenHeroes].filter(id => !heroIndexMap.has(id))
    };

    const scoreStats = list => {
        const scores = list.map(v => v.score).filter(Number.isFinite).sort((a, b) => a - b);
        if (!scores.length) return null;
        const median = scores.length % 2 ? scores[(scores.length - 1) / 2] : (scores[scores.length / 2 - 1] + scores[scores.length / 2]) / 2;
        return {
            n: scores.length,
            media: +(scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1),
            mediana: median,
            min: scores[0],
            max: scores[scores.length - 1],
            p10: scores[Math.floor(scores.length * 0.1)],
            P: list.filter(v => v.verdetto === 'P').length,
            B: list.filter(v => v.verdetto === 'B').length,
            N: list.filter(v => v.verdetto === 'N').length
        };
    };

    const conProblemi = [...presetVerdicts, ...heroVerdicts].filter(v => v.problemi.length);
    const conTitoliInesistenti = [...presetVerdicts, ...heroVerdicts].filter(v => v.erroriConTitoloInesistente > 0);

    const byCategory = {};
    for (const v of presetVerdicts) {
        const cat = presetMeta.get(v.id)?.category || 'n/d';
        if (!byCategory[cat]) byCategory[cat] = [];
        byCategory[cat].push(v.score);
    }
    const categoriaStats = Object.fromEntries(Object.entries(byCategory).map(([k, arr]) => [k, {
        n: arr.length, media: +(arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(1),
        min: Math.min(...arr), max: Math.max(...arr)
    }]));

    const ranking = [...presetVerdicts].sort((a, b) => a.score - b.score);

    // ── Meccanica: cose che si vedono nei dump senza giudizio ──
    const median = arr => {
        const s = arr.filter(Number.isFinite).sort((a, b) => a - b);
        if (!s.length) return null;
        return s.length % 2 ? s[(s.length - 1) / 2] : +((s[s.length / 2 - 1] + s[s.length / 2]) / 2).toFixed(1);
    };
    const presetMechanics = [];
    for (const [id, items] of presetIndex.entries()) {
        const meta = presetMeta.get(id);
        const n = items.length || 0;
        if (!n) { presetMechanics.push({ id, name: meta.name, categoria: meta.category, tipo: meta.type, items: 0 }); continue; }
        const anime = items.filter(i => i.isAnime).length;
        const ja = items.filter(i => i.lingua === 'ja').length;
        const lowVotes = items.filter(i => i.voti !== null && i.voti < 50).length;
        const noScore = items.filter(i => i.voto === null).length;
        presetMechanics.push({
            id, name: meta.name, categoria: meta.category, tipo: meta.type, isAnime: meta.isAnime,
            items: n, pool: meta.pool, pagine: meta.pool !== null ? Math.ceil(meta.pool / 20) : null,
            animePct: Math.round(100 * anime / n), jaPct: Math.round(100 * ja / n),
            votiSotto50Pct: Math.round(100 * lowVotes / n), senzaVoto: noScore,
            annoMediano: median(items.map(i => Number(i.anno)))
        });
    }
    const heroMechanics = [];
    const heroSets = new Map();
    for (const h of heroList) {
        const items = h.items || [];
        const n = items.length || 0;
        const key = `${h.profileId}::${h.catalogId}`;
        heroMechanics.push({
            id: key, hero: h.kind, tipo: h.mediaType, items: n,
            animePct: n ? Math.round(100 * items.filter(i => i.isAnime).length / n) : null,
            itaPct: n ? Math.round(100 * items.filter(i => i.itaBadge).length / n) : null,
            ratingMediano: median(items.map(i => i.rating)),
            popMediana: median(items.map(i => i.popolarita)),
            sopraPop20: items.filter(i => i.popolarita !== null && i.popolarita > 20).length,
            annoMediano: median(items.map(i => Number(i.anno)))
        });
        const setKey = `${h.profileId}|${h.mediaType}`;
        if (!heroSets.has(setKey)) heroSets.set(setKey, []);
        heroSets.get(setKey).push({ catalogId: h.catalogId, titles: new Set(items.map(i => norm(i.titolo)).filter(t => t.length > 0)) });
    }
    const heroOverlap = [];
    for (const [setKey, list] of heroSets.entries()) {
        const [profileId, mediaType] = setKey.split('|');
        for (let i = 0; i < list.length; i++) {
            for (let j = i + 1; j < list.length; j++) {
                const shared = [...list[i].titles].filter(t => list[j].titles.has(t));
                heroOverlap.push({ profilo: profileId, tipo: mediaType, a: list[i].catalogId, b: list[j].catalogId, condivisi: shared.length, titoli: shared.slice(0, 3) });
            }
        }
    }
    const meccanica = {
        preset: {
            dettaglio: presetMechanics,
            animeInCataloghiNonAnime: presetMechanics.filter(p => p.isAnime === false && (p.animePct || 0) >= 20).sort((a, b) => b.animePct - a.animePct),
            poolSotto60: presetMechanics.filter(p => p.pool !== null && p.pool < 60).sort((a, b) => a.pool - b.pool),
            votiSotto50: presetMechanics.filter(p => (p.votiSotto50Pct || 0) > 30).sort((a, b) => b.votiSotto50Pct - a.votiSotto50Pct),
            senzaVoto: presetMechanics.filter(p => p.senzaVoto > 0)
        },
        hero: { dettaglio: heroMechanics, overlapTraHero: heroOverlap.filter(o => o.condivisi > 0) }
    };

    const report = {
        generatedAt: new Date().toISOString(),
        pesi: WEIGHTS,
        copertura: coverage,
        statistiche: {
            preset: scoreStats(presetVerdicts),
            hero: scoreStats(heroVerdicts),
            perCategoria: categoriaStats
        },
        verifiche: {
            verdettiConProblemiDiForma: conProblemi.map(v => ({ id: v.id, problemi: v.problemi, sorgente: v.sorgente })),
            verdettiConTitoliInesistenti: conTitoliInesistenti.map(v => ({
                id: v.id, quanti: v.erroriConTitoloInesistente, suTotale: (v.errori || []).length, sorgente: v.sorgente
            })),
            fileNonLetti: fileErrors,
            verdettiDuplicati: dupes,
            correzioniApplicate: applicate,
            erroriFuoriPosizione: [...presetVerdicts, ...heroVerdicts].filter(v => v.erroriFuoriPosizione > 0).map(v => ({ id: v.id, quanti: v.erroriFuoriPosizione })),
            borderline: [...presetVerdicts, ...heroVerdicts].filter(v => v.borderline).map(v => ({ id: v.id, score: v.score, verdetto: v.verdetto })),
            aBassaFiducia: [...presetVerdicts, ...heroVerdicts].filter(v => v.fiducia === 'bassa').map(v => ({ id: v.id, score: v.score }))
        },
        verdetti: { preset: presetVerdicts, hero: heroVerdicts },
        meccanica,
        ranking
    };

    const outFile = path.resolve(opts.out || path.join(root, 'ricerche/report.json'));
    fs.mkdirSync(path.dirname(outFile), { recursive: true });
    fs.writeFileSync(outFile, JSON.stringify(report, null, 2), 'utf8');

    if (opts.json) console.log(JSON.stringify(report, null, 2));
    else {
        console.log('=== QC AGGREGATE ===');
        console.log(`Preset: ${coverage.presetGiudicati}/${coverage.presetAttesi} giudicati${coverage.presetMancanti.length ? ' · mancanti: ' + coverage.presetMancanti.join(', ') : ''}`);
        console.log(`Hero:   ${coverage.heroGiudicati}/${coverage.heroAttesi} giudicati${coverage.heroMancanti.length ? ' · mancanti: ' + coverage.heroMancanti.join(', ') : ''}`);
        if (report.statistiche.preset) console.log(`Preset score: media ${report.statistiche.preset.media} · mediana ${report.statistiche.preset.mediana} · P/B/N ${report.statistiche.preset.P}/${report.statistiche.preset.B}/${report.statistiche.preset.N}`);
        if (report.statistiche.hero) console.log(`Hero score:   media ${report.statistiche.hero.media} · mediana ${report.statistiche.hero.mediana} · P/B/N ${report.statistiche.hero.P}/${report.statistiche.hero.B}/${report.statistiche.hero.N}`);
        console.log(`Problemi di forma: ${conProblemi.length} · verdetti con titoli inesistenti: ${conTitoliInesistenti.length} · file non letti: ${fileErrors.length}`);
        console.log(`Meccanica: anime in cataloghi non-anime >=20%: ${meccanica.preset.animeInCataloghiNonAnime.length} · pool<60: ${meccanica.preset.poolSotto60.length} · >30% item sotto 50 voti: ${meccanica.preset.votiSotto50.length} · overlap hero: ${meccanica.hero.overlapTraHero.length}`);
        console.log(`Report: ${outFile}`);
    }
    process.exit(0);
}

main();
