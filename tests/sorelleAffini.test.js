/**
 * L'affinità delle sorelle del grafo (`src/data/sorelle-affini.json`).
 *
 * Il cluster L1 mescola livelli: quello di `princess` è `fairy, princess, enchant, fairy godmother,
 * prince, enchantment`, e `enchant` è una keyword generica (125 titoli, di cui 4 di principesse).
 * Espandere con lei significava sostituire il tema: «tema principesse» restituiva Harry Potter e
 * Il Signore degli Anelli. Qui si difendono le tre cose che tengono:
 *
 *   1. l'artefatto è coerente col grafo (nessuna sorella inventata, tutte nello stesso cluster);
 *   2. le sorelle tenute hanno affinità vera, quelle scartate sono le generiche;
 *   3. un'ancora che non è nell'artefatto non si espande — meglio stretto che sbagliato.
 */
const fs = require('fs');
const path = require('path');

const ARTEFATTO = path.join(__dirname, '../src/data/sorelle-affini.json');
const GRAFO = path.join(__dirname, '../src/data/hierarchical_graph.json');

const { affini, soglia } = JSON.parse(fs.readFileSync(ARTEFATTO, 'utf8'));
const grafo = JSON.parse(fs.readFileSync(GRAFO, 'utf8'));
const { espandiConcetto } = require('../src/ricerca/risolutori');
const { normalizza } = require('../src/infra/testo');

// Le chiavi dell'artefatto sono normalizzate (`9/11` → `9 11`), quelle del grafo no.
const clusterPerAncora = new Map();
for (const [nome, l1] of Object.entries(grafo.kw_to_L1 || {})) {
    const chiave = normalizza(nome);
    if (!clusterPerAncora.has(chiave)) {
        clusterPerAncora.set(chiave, (grafo.L1[l1] && grafo.L1[l1].keywords) || []);
    }
}

describe('sorelle affini: l\'artefatto', () => {
    test('esiste, ha una soglia dichiarata e un numero plausibile di ancore', () => {
        expect(soglia).toEqual({ contenimento: expect.any(Number), comuni: expect.any(Number) });
        expect(soglia.contenimento).toBeGreaterThan(0);
        expect(Object.keys(affini).length).toBeGreaterThan(1000);
    });

    test('nessuna sorella è inventata: stanno tutte nel cluster L1 della loro ancora', () => {
        const fuoriCluster = [];
        for (const [ancora, sorelle] of Object.entries(affini)) {
            const cluster = clusterPerAncora.get(ancora) || [];
            for (const sorella of sorelle) {
                if (!cluster.includes(sorella)) fuoriCluster.push(`${ancora} → ${sorella}`);
            }
        }
        expect(fuoriCluster).toEqual([]);
    });

    test('`principesse` non porta più Harry Potter: enchant e fairy sono fuori', () => {
        expect(affini.princess).toContain('prince');
        expect(affini.princess).not.toContain('enchant');
        expect(affini.princess).not.toContain('fairy');
    });

    test('le famiglie vere restano: mecha tiene i robot, ship il viaggio per mare', () => {
        expect(affini.mecha).toEqual(expect.arrayContaining(['gundam', 'super robot']));
        expect(affini.ship).toContain('sea voyage');
        expect(affini.zombie).toEqual(expect.arrayContaining(['zombie apocalypse']));
    });

    test('isekai non ha sorelle: il suo cluster era un miscuglio di etichette di pubblico', () => {
        expect(affini.isekai).toBeUndefined();
    });
});

describe('espandiConcetto: usa l\'artefatto, non il cluster grezzo', () => {
    test('un\'ancora con sorelle affini le porta con sé', () => {
        const espansione = espandiConcetto('mecha');
        expect(espansione[0]).toBe('mecha');
        expect(espansione).toContain('gundam');
    });

    test('un\'ancora senza affinità resta da sola', () => {
        expect(espandiConcetto('isekai')).toEqual(['isekai']);
        expect(espandiConcetto('princess')).not.toContain('enchant');
    });

    test('un\'ancora che non è nell\'artefatto non si espande: il tema non si inventa', () => {
        expect(espandiConcetto('parola che non esiste xyz')).toEqual(['parola che non esiste xyz']);
    });

    test('la crescita è limitata da RICERCA_ESPANSIONE_MAX', () => {
        const espansione = espandiConcetto('mecha');
        expect(espansione.length).toBeLessThanOrEqual(5);
    });
});
