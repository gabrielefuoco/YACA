/**
 * Test per il Modulo Cache (Ticket 24):
 * 1. L'API è la guardia: il consumatore passa una descrizione, mai una chiave.
 * 2. La descrizione: { nome, versione, dipendenze: { varia, invalida }, ttl } -> { chiave, ttl }
 * 3. Distinzione fra dipendenze che variano (chiavi diverse) e che invalidano (voce vecchia).
 * 4. I sei TTL di config.js diventano campi delle descrizioni (letti accanto alla voce).
 * 5. Il bug del TTL in CacheManager: un TTL esplicito di 60s scade a 60s, non a quello in RAM (7 giorni) né a 60s+SWR (3660s).
 * 6. Guard sulle dipendenze: nessun modulo fuori da src/cache importa il client (ioredis).
 */

const fs = require('fs');
const path = require('path');
const cache = require('../src/cache');
const CacheManager = require('../src/cache/CacheManager');

describe('Modulo Cache (Ticket 24)', () => {

    describe('1. L\'API è la guardia: accetta solo descrizioni, mai chiavi a mano', () => {
        test('leggi() rifiuta una stringa e lancia TypeError', async () => {
            await expect(cache.leggi('chiave_a_mano_123'))
                .rejects.toThrow(TypeError);
            await expect(cache.leggi('chiave_a_mano_123'))
                .rejects.toThrow(/accetta solo una descrizione/);
        });

        test('scrivi() rifiuta una stringa e lancia TypeError', async () => {
            await expect(cache.scrivi('chiave_a_mano_123', { dato: 1 }))
                .rejects.toThrow(TypeError);
            await expect(cache.scrivi('chiave_a_mano_123', { dato: 1 }))
                .rejects.toThrow(/accetta solo una descrizione/);
        });

        test('deriva() rifiuta ingressi non validi o senza nome', () => {
            expect(() => cache.deriva('stringa')).toThrow(TypeError);
            expect(() => cache.deriva(null)).toThrow(TypeError);
            expect(() => cache.deriva({})).toThrow(/deve includere il campo "nome"/);
        });

        test('guardia architetturale: nessun file fuori da src/cache importa ioredis', () => {
            const srcDir = path.resolve(__dirname, '../src');
            function scanDir(dir) {
                const entries = fs.readdirSync(dir, { withFileTypes: true });
                const files = [];
                for (const entry of entries) {
                    const fullPath = path.join(dir, entry.name);
                    if (entry.isDirectory()) {
                        files.push(...scanDir(fullPath));
                    } else if (entry.isFile() && entry.name.endsWith('.js')) {
                        files.push(fullPath);
                    }
                }
                return files;
            }

            const allJsFiles = scanDir(srcDir);
            const violations = [];
            for (const file of allJsFiles) {
                const relative = path.relative(srcDir, file).replace(/\\/g, '/');
                if (relative.startsWith('cache/')) continue; // solo il modulo cache può usare il client

                const content = fs.readFileSync(file, 'utf8');
                if (content.includes("require('ioredis')") || content.includes('require("ioredis")')) {
                    violations.push(relative);
                }
            }

            expect(violations).toEqual([]);
        });
    });

    describe('2. La forma della descrizione e la derivazione deterministica', () => {
        test('deriva restituisce { chiave, ttl } e una CacheManager instance', () => {
            const desc = {
                nome: 'heroes',
                versione: 14,
                dipendenze: {
                    varia: {
                        utente: 'u1',
                        profilo: 'p1',
                        media: 'movie',
                        kids: false,
                        selettori: {}
                    },
                    invalida: {
                        artefatto: 'art_123',
                        ricetta: 'ric_456'
                    }
                },
                ttl: 604800000
            };

            const res = cache.deriva(desc);
            expect(res).toHaveProperty('chiave');
            expect(res).toHaveProperty('ttl', 604800000);
            expect(res).toHaveProperty('instance');
            expect(res.chiave).toBe('u1_p1_heroes_v14_art_art_123_ric_ric_456_movie');
        });

        test('stessi ingressi producono la stessa chiave', () => {
            const desc1 = {
                nome: 'recommendations',
                dipendenze: {
                    varia: { utente: 'u1', profilo: 'p1', catalogo: 'preset_nolan', kids: false }
                }
            };
            const desc2 = {
                nome: 'recommendations',
                dipendenze: {
                    varia: { utente: 'u1', profilo: 'p1', catalogo: 'preset_nolan', kids: false }
                }
            };
            expect(cache.deriva(desc1).chiave).toBe(cache.deriva(desc2).chiave);
        });
    });

    describe('3. Distinzione dipendenze: Variare (chiavi diverse) vs Invalidare (voce vecchia)', () => {
        const baseHero = {
            nome: 'heroes',
            versione: 14,
            dipendenze: {
                varia: {
                    utente: 'u1',
                    profilo: 'p1',
                    media: 'movie',
                    kids: false,
                    selettori: {}
                },
                invalida: {
                    artefatto: 'art_v1'
                }
            },
            ttl: 604800000
        };

        test('ciò che varia genera chiavi diverse (profilo, utente, media, kids, selettori)', () => {
            const kBase = cache.deriva(baseHero).chiave;

            // profilo diverso
            const kProfilo = cache.deriva({
                ...baseHero,
                dipendenze: { ...baseHero.dipendenze, varia: { ...baseHero.dipendenze.varia, profilo: 'p2' } }
            }).chiave;
            expect(kProfilo).not.toBe(kBase);

            // utente diverso
            const kUtente = cache.deriva({
                ...baseHero,
                dipendenze: { ...baseHero.dipendenze, varia: { ...baseHero.dipendenze.varia, utente: 'u2' } }
            }).chiave;
            expect(kUtente).not.toBe(kBase);

            // media diverso
            const kMedia = cache.deriva({
                ...baseHero,
                dipendenze: { ...baseHero.dipendenze, varia: { ...baseHero.dipendenze.varia, media: 'series' } }
            }).chiave;
            expect(kMedia).not.toBe(kBase);

            // kids diverso
            const kKids = cache.deriva({
                ...baseHero,
                dipendenze: { ...baseHero.dipendenze, varia: { ...baseHero.dipendenze.varia, kids: true } }
            }).chiave;
            expect(kKids).not.toBe(kBase);
            expect(kKids).toContain('_kids');

            // selettore anime diverso
            const kAnime = cache.deriva({
                ...baseHero,
                dipendenze: { ...baseHero.dipendenze, varia: { ...baseHero.dipendenze.varia, selettori: { anime: 'exclude' } } }
            }).chiave;
            expect(kAnime).not.toBe(kBase);
            expect(kAnime).toContain('_a_exclude');
        });

        test('ciò che invalida cambia la chiave invalidando la voce senza cambiare codice (versione, artefatto)', () => {
            const kBase = cache.deriva(baseHero).chiave;

            // Alzare la versione strutturale è un campo della descrizione
            const kVersione15 = cache.deriva({
                ...baseHero,
                versione: 15
            }).chiave;
            expect(kVersione15).not.toBe(kBase);
            expect(kVersione15).toContain('_heroes_v15_');

            // Cambio di sha artefatto del motore
            const kArtefatto2 = cache.deriva({
                ...baseHero,
                dipendenze: { ...baseHero.dipendenze, invalida: { artefatto: 'art_v2' } }
            }).chiave;
            expect(kArtefatto2).not.toBe(kBase);
            expect(kArtefatto2).toContain('_art_art_v2_');
        });
    });

    describe('4. Copertura delle 4 risposte memorizzate e TTL letti accanto alle voci', () => {
        test('heroes: default TTL 7 giorni', () => {
            const res = cache.deriva({
                nome: 'heroes',
                dipendenze: { varia: { utente: 'u', profilo: 'p', media: 'movie' } }
            });
            expect(res.ttl).toBe(7 * 24 * 60 * 60 * 1000);
        });

        test('recommendations: default TTL 7 giorni', () => {
            const res = cache.deriva({
                nome: 'recommendations',
                dipendenze: { varia: { utente: 'u', profilo: 'p', catalogo: 'cat' } }
            });
            expect(res.ttl).toBe(7 * 24 * 60 * 60 * 1000);
            // LA CHIAVE PORTA LA VERSIONE E IL MEDIA (revisione del 17/10/2026): questo test
            // asseriva la forma vecchia, che ometteva entrambi — e la forma vecchia era il bug:
            // la versione non invalidava niente e film e serie collidevano sullo stesso catalogo.
            expect(res.chiave).toBe('u_p_cat_v14_');
        });

        test('catalog_page: default TTL 14 giorni e hash deterministico', () => {
            const res = cache.deriva({
                nome: 'catalog_page',
                versione: 24,
                dipendenze: {
                    varia: { id: 'preset_top_rated_movies', type: 'movie' },
                    invalida: { catalogDef: '{}' }
                }
            });
            expect(res.ttl).toBe(14 * 24 * 60 * 60 * 1000);
            expect(typeof res.chiave).toBe('string');
            expect(res.chiave.length).toBe(64); // SHA-256
        });

        test('meta: TTL differenziato (14 giorni film, 6 ore serie)', () => {
            const resMovie = cache.deriva({
                nome: 'meta',
                dipendenze: { varia: { id: '123', type: 'movie' } }
            });
            expect(resMovie.ttl).toBe(14 * 24 * 60 * 60 * 1000);
            expect(resMovie.chiave).toBe('meta_123_movie');

            const resSeries = cache.deriva({
                nome: 'meta',
                dipendenze: { varia: { id: '456', type: 'series' } }
            });
            expect(resSeries.ttl).toBe(6 * 60 * 60 * 1000);
            expect(resSeries.chiave).toBe('meta_456_series');
        });

        test('il TTL esplicito specificato accanto alla voce ha la precedenza', () => {
            const res = cache.deriva({
                nome: 'heroes',
                ttl: 60000, // es. fallback E5 transitorio: 60 secondi
                dipendenze: { varia: { utente: 'u', profilo: 'p', media: 'movie' } }
            });
            expect(res.ttl).toBe(60000);
        });
    });

    describe('5. Il bug del TTL in CacheManager (la verifica di E5)', () => {
        let testCache;

        beforeEach(() => {
            // Istanza con RAM TTL = 7 giorni e SWR = 1 ora
            testCache = new CacheManager('test_ttl_bug', {
                ramMax: 50,
                ramTtlMs: 7 * 24 * 60 * 60 * 1000, // 7 giorni in RAM
                redisTtlMs: 7 * 24 * 60 * 60 * 1000,
                swrMs: 60 * 60 * 1000               // 3600 secondi di SWR
            });
            jest.useFakeTimers();
        });

        afterEach(() => {
            jest.useRealTimers();
        });

        test('una voce scritta con TTL esplicito di 60 s scade a 60 s, non a quello in RAM (7 giorni) né a 60+SWR (3660s)', async () => {
            const key = 'voce_con_ttl_breve_60s';
            const value = { dato: 'valore_transitorio_e5' };
            const explicitTtl = 60 * 1000; // 60 secondi

            await testCache.set(key, value, explicitTtl);

            // A 30 secondi: la voce DEVE essere ancora fresh
            jest.advanceTimersByTime(30 * 1000);
            const statusAt30s = await testCache.getWithStatus(key);
            expect(statusAt30s.status).toBe('fresh');
            expect(statusAt30s.value).toEqual(value);

            // A 61 secondi (> 60s): la voce DEVE essere scaduta (status 'miss')
            // NON deve essere fresh (confrontata col TTL RAM di 7 giorni)
            // e NON deve essere stale (gonfiata con 3600s di SWR a 3660s)
            jest.advanceTimersByTime(31 * 1000); // totale 61s
            const statusAt61s = await testCache.getWithStatus(key);
            expect(statusAt61s.status).toBe('miss');
            expect(statusAt61s.value).toBeUndefined();
        });
    });

    describe('6. Flusso leggi() e scrivi() con costruttore', () => {
        test('leggi con costruttore: miss invoca costruttore e memorizza, hit successivo restituisce da cache', async () => {
            const testDesc = {
                nome: 'heroes',
                dipendenze: {
                    varia: { utente: 'test_user', profilo: 'test_prof', media: 'movie' }
                },
                ttl: 60000
            };

            let buildCount = 0;
            const builder = async () => {
                buildCount++;
                return { risultato: 'costruito_da_builder' };
            };

            // Primo accesso: miss -> invoca builder
            const primo = await cache.leggi(testDesc, builder);
            expect(primo).toEqual({ risultato: 'costruito_da_builder' });
            expect(buildCount).toBe(1);

            // Secondo accesso: hit -> non invoca builder
            const secondo = await cache.leggi(testDesc, builder);
            expect(secondo).toEqual({ risultato: 'costruito_da_builder' });
            expect(buildCount).toBe(1);
        });

        test('scrivi aggiorna il valore e leggi lo ritrova', async () => {
            const testDesc = {
                nome: 'heroes',
                dipendenze: {
                    varia: { utente: 'test_user_scrivi', profilo: 'test_prof', media: 'movie' }
                },
                ttl: 60000
            };

            await cache.scrivi(testDesc, { aggiornato: true });
            const letto = await cache.leggi(testDesc);
            expect(letto.status).toBe('fresh');
            expect(letto.value).toEqual({ aggiornato: true });
        });
    });

});
