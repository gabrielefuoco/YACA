#!/usr/bin/env node
/**
 * Mostra le liste dei tre metodi, con titolo, anno e generi, per giudicarle a occhio.
 *
 *   node .scratch/ricerca-senza-llm/mostra-liste.js "sci-fi moderno" 60
 *
 * I dati vengono da `valutazione-liste.json` (prodotto dalla sonda Python) e i metadati dal
 * DuckDB locale: è l'unico modo per leggere le liste come le vedrebbe una persona.
 */

const fs = require('fs');
const path = require('path');

process.env.DUCKDB_PATH = process.env.DUCKDB_PATH
    || path.resolve(__dirname, '../../.cache/tmdb/catalog.duckdb');

const DATI = JSON.parse(fs.readFileSync(path.join(__dirname, 'valutazione-liste.json'), 'utf8'));
const nome = process.argv[2] || 'sci-fi moderno';
const limite = Number(process.argv[3]) || 60;
const profilo = DATI[nome];
if (!profilo) {
    console.error(`Profilo sconosciuto. Disponibili: ${Object.keys(DATI).join(' · ')}`);
    process.exit(1);
}

function pulisciGenere(testo) {
    if (!testo) return [];
    try {
        const g = JSON.parse(testo);
        return Array.isArray(g) ? g.map(x => x.name).filter(Boolean) : [];
    } catch (_e) {
        return [];
    }
}

(async () => {
    const indice = require('../../src/indice');
    await indice.init();

    const ids = [...new Set([
        ...profilo.semi,
        ...profilo.ppr,
        ...profilo.matrice,
        ...profilo.matrice_norm,
        ...profilo.transizione
    ])];
    const inList = ids.join(',');
    const righe = await indice.queryRaw(`SELECT id, title AS nome, release_date AS data, genres FROM movies WHERE id IN (${inList})`);
    const serie = await indice.queryRaw(`SELECT id, name AS nome, first_air_date AS data, genres FROM tv WHERE id IN (${inList})`);

    const mappa = new Map();
    for (const r of righe) mappa.set(Number(r.id), { nome: r.nome, anno: String(r.data || '').slice(0, 4), generi: pulisciGenere(r.genres), tipo: 'film' });
    for (const r of serie) mappa.set(Number(r.id), { nome: r.nome, anno: String(r.data || '').slice(0, 4), generi: pulisciGenere(r.genres), tipo: 'serie' });

    const descrivi = (id) => {
        const m = mappa.get(Number(id));
        if (!m) return `#${id} (fuori dump)`;
        return `${m.nome}${m.anno ? ` (${m.anno})` : ''} · ${m.generi.slice(0, 3).join('/')}${m.tipo === 'serie' ? ' · serie' : ''}`;
    };

    const impronta = (lista) => {
        const conteggio = new Map();
        for (const id of lista) {
            const m = mappa.get(Number(id));
            if (!m) continue;
            for (const g of m.generi) conteggio.set(g, (conteggio.get(g) || 0) + 1);
        }
        return [...conteggio.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5)
            .map(([g, n]) => `${g} ${n}`).join(' · ') || '(nessun genere)';
    };

    console.log(`\n=== ${nome} ===\nSEMI (${profilo.semi.length}):`);
    for (const id of profilo.semi) console.log(`   ${descrivi(id)}`);

    for (const metodo of ['ppr', 'matrice', 'matrice_norm', 'transizione']) {
        const lista = profilo[metodo].slice(0, limite);
        console.log(`\n--- ${metodo.toUpperCase()} (${lista.length}) — generi: ${impronta(lista)}`);
        lista.forEach((id, i) => console.log(`${String(i + 1).padStart(3)}. ${descrivi(id)}`));
    }

    await indice.close?.();
    process.exit(0);
})();
