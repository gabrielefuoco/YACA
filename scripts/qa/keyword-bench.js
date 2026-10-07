#!/usr/bin/env node
/**
 * scripts/qa/keyword-bench.js
 *
 * Banco di prova e misurazione per keyword TMDB e cluster del grafo gerarchico.
 * Sostituisce la scelta intuitiva delle keyword con metriche oggettive:
 * - Ground truth: verdetti della campagna QC (.scratch/qc-cataloghi/review/preset/*.json)
 * - Recall: quota dei titoli "in tema" del campione raggiunti dal candidato
 * - Precision / Fuori tema: quota dei titoli fuori tema / sconosciuti portati dal candidato
 * - Volumetria: pool DuckDB e mediana voti
 * - Quota Anime/JA (per cataloghi occidentali)
 * - Overlap J@40 con i cataloghi fratelli dello stesso tipo
 * - Costo / Beneficio delle esclusioni (titoli in tema persi vs fuori tema eliminati)
 * - Navigazione grafo gerarchico (src/data/hierarchical_graph.json)
 *
 * Riferimenti:
 * - Spec: .scratch/qc-cataloghi/issues/14-banco-keyword.md
 * - Report motivazionale: .scratch/qc-cataloghi/ricerche/01-report-qc-cataloghi.md §3 C2
 *
 * Interfaccia:
 *   node scripts/qa/keyword-bench.js --preset <id>
 *   node scripts/qa/keyword-bench.js --preset <id> --include <ids|names> --exclude <ids|names>
 *   node scripts/qa/keyword-bench.js --preset <id> --cluster "<medoid|keyword>"
 *   node scripts/qa/keyword-bench.js --pilot
 *   node scripts/qa/keyword-bench.js --pilot --json --out <file>
 */

const fs = require('fs');
const path = require('path');

const store = require('../../src/db/duckDbStore');
const { getPresets } = require('../../src/data/presets');
const { buildPresetFromFilters } = require('../../src/catalog/providers/DuckDbProvider');
const { isAnimeContent } = require('../../src/utils/animeIdentity');
const graph = require('../../src/data/hierarchical_graph.json');

// --- I 14 CATALOGHI PILOTA DELLA CAMPAGNA QC (12 originari + 2 aggiunti) ---
const PILOT_IDS = [
    'preset_cult_classics',
    'preset_zombies_movies',
    'preset_psych_thriller',
    'preset_italian_comedy',
    'preset_mindfuck',
    'preset_mindfuck_series',
    'preset_fantasy_magic',
    'preset_space_hard_scifi',
    'preset_action_blockbusters',
    'preset_anime_shonen',
    'preset_heist',
    'preset_treasure_hunters',
    'preset_tv_high_fantasy',
    'preset_cyberpunk_series'
];

// --- I 6 CATALOGHI EX-WHITELIST (MISURA C vs B) ---
const EX_WHITELIST_IDS = [
    'preset_cyberpunk',
    'preset_cyberpunk_series',
    'preset_tv_superheroes_dark',
    'preset_extreme_survival',
    'preset_time_travel_movies',
    'preset_tv_high_fantasy'
];

// Alternative configurate per il giro pilota
const PILOT_CONFIGS = {
    preset_cult_classics: {
        currentPromise: 'with_keywords: 6158 (cult), vote_count.gte: 200, vote_average.desc',
        problem: 'Keyword 6158 restringe il pool a 64 titoli e attira B-horror scadenti (7 errori QC, mediana 6.6)',
        recommendation: 'Il concetto di "Film Cult" è uno statuto sociologico/editoriale ("venerati dai fan") e non un topos narrativo TMDB. Si raccomanda di valutare il cambio nome editoriale (ticket 08) o allargare a keyword di ricezione (155493 campy, 11532 grindhouse) vincolate da un pavimento qualitativo.',
        alternatives: [
            {
                nome: 'Cluster grafo "cult" (c_227)',
                desc: 'Cluster c_227 (medoid: cult, religious cult, cult leader)',
                cluster: 'cult'
            },
            {
                nome: 'Keyword allargate (cult | campy | grindhouse | counter-culture)',
                desc: 'Include 6158|155493|11532|12192',
                include: '6158|155493|11532|12192'
            },
            {
                nome: 'Keyword allargate + soglia voto 6.2 + voti 300',
                desc: 'Include 6158|155493|11532, vote_average.gte: 6.2, vote_count.gte: 300',
                include: '6158|155493|11532',
                override: { 'vote_average.gte': 6.2, 'vote_count.gte': 300 }
            },
            {
                nome: 'Esclusione B-horror (without_genres 27, no anime)',
                desc: 'Keyword 6158 con esclusione horror 27 e anime 210024',
                exclude: '210024',
                override: { without_genres: '27' }
            }
        ],
        proposal: 'Include 6158|155493|11532 con vote_average >= 6.2 e voti >= 300 (o rinvio a ticket 08 per cambio nome)'
    },
    preset_zombies_movies: {
        currentPromise: 'with_keywords: 4884|9744, with_genres: 27,878 (Horror AND SciFi)',
        problem: 'L\'intersezione rigida Horror AND SciFi strozza il pool a 32 e imbarca trash (8 errori QC, 12.5% anime)',
        recommendation: 'Rimuovere l\'AND obbligatorio con la fantascienza permettendo Horror puro o Sci-Fi, estendere alle keyword zombie canoniche ed escludere categoricamente gli anime (210024).',
        alternatives: [
            {
                nome: 'Cluster grafo "zombie apocalypse" (c_456)',
                desc: 'Cluster c_456 (zombie apocalypse, zombie, post-apocalyptic)',
                cluster: 'zombie apocalypse'
            },
            {
                nome: 'Rimozione vincolo AND SciFi (solo Horror)',
                desc: 'with_genres: 27 (elimina AND 878 che strozzava a 32)',
                override: { with_genres: 27 }
            },
            {
                nome: 'Solo Horror + keyword zombie complete + no anime',
                desc: 'Horror (27) con 12377|4884|9744|186565|360949 e without_keywords: 210024',
                include: '12377|4884|9744|186565|360949',
                exclude: '210024',
                override: { with_genres: 27 }
            },
            {
                nome: 'Generi Horror OR Sci-Fi (27|878) + keyword complete + no anime',
                desc: 'Permette sia zombie horror che epidemie sci-fi escludendo anime',
                include: '12377|4884|9744|186565|360949',
                exclude: '210024',
                override: { with_genres: '27|878' }
            }
        ],
        proposal: 'with_genres: "27|878", keyword: 12377|4884|9744|186565|360949, without_keywords: 210024 (Pool 204, Fuori tema 4%)'
    },
    preset_psych_thriller: {
        currentPromise: 'with_genres: 53,27 (AND Thriller e Horror), with_keywords: 12565',
        problem: 'AND obbligatorio tra Thriller e Horror strozza il pool a 45 ed esclude i classici del genere privi di tag horror',
        recommendation: 'Svincolare il thriller psicologico dal genere horror obbligatorio ed espandere le keyword psicologiche dal grafo (c_392).',
        alternatives: [
            {
                nome: 'Cluster grafo "suspense thriller" (c_392)',
                desc: 'Cluster c_392 (suspense thriller, psychological thriller, suspense)',
                cluster: 'suspense thriller'
            },
            {
                nome: 'Rimozione vincolo Horror (solo Thriller 53)',
                desc: 'with_genres: 53 (apre a Shutter Island, Memento, ecc.)',
                override: { with_genres: 53 }
            },
            {
                nome: 'Solo Thriller + keyword psicologiche estese',
                desc: 'with_genres: 53, keyword: 12565|9951|157053|10854',
                include: '12565|9951|157053|10854',
                override: { with_genres: 53 }
            },
            {
                nome: 'Solo Thriller + keyword estese + no anime e mostri',
                desc: 'Esclude monster movie (10292) e anime (210024)',
                include: '12565|9951|157053|10854',
                exclude: '210024|10292',
                override: { with_genres: 53 }
            }
        ],
        proposal: 'with_genres: 53, keyword: 12565|9951|157053|10854, exclude: 210024|10292 (Pool 144, Fuori tema 0%, Mediana 7.1)'
    },
    preset_italian_comedy: {
        currentPromise: 'original_language: it, genres: 35, with_keywords: 170827|167541|283953|8201',
        problem: 'Le 4 keyword restringono a 53 titoli e attirano commedie sexy anni 70 di infimo livello (mediana voto disastrosa: 5.4)',
        recommendation: 'Rimuovere totalmente le keyword restrittive (la commedia all\'italiana è un genere naturale) e affidare la pulizia a una soglia minima di gradimento.',
        alternatives: [
            {
                nome: 'Cluster grafo "satirical" (c_71)',
                desc: 'Cluster c_71 (satire, parody, social satire)',
                cluster: 'parody'
            },
            {
                nome: 'Rimozione keyword (solo lingua it + genere commedia)',
                desc: 'Apre all\'intera commedia italiana d\'autore',
                override: { with_keywords: undefined }
            },
            {
                nome: 'Lingua it + commedia + pavimento qualità (voto >= 6.0, voti >= 40)',
                desc: 'Elimina il trash garantendo solo titoli riconosciuti',
                override: { with_keywords: undefined, 'vote_average.gte': 6.0, 'vote_count.gte': 40 }
            },
            {
                nome: 'Lingua it + commedia + voti >= 50 + ordinamento voto',
                desc: 'Priorità ai capolavori storici (Monicelli, Fantozzi, Troisi, Benigni)',
                override: { with_keywords: undefined, 'vote_count.gte': 50, sort_by: 'vote_average.desc' }
            }
        ],
        proposal: 'Eliminare le 4 keyword tossiche, impostare vote_average >= 6.0 e vote_count >= 40 (Pool 575, Mediana 7.1)'
    },
    preset_mindfuck: {
        currentPromise: 'with_genres: 9648|53|878, with_keywords: 275311|174089|335567|169411|6262|243230|10854',
        problem: 'Keyword generiche fanno filtrare film d\'animazione DC Comics (Justice League) fuori tema',
        recommendation: 'Escludere il genere animazione (16) e le keyword supereroi/cinecomic (9715, 180547).',
        alternatives: [
            {
                nome: 'Cluster grafo "plot twist" (c_1202)',
                desc: 'Cluster c_1202 (plot twist, twist)',
                cluster: 'plot twist'
            },
            {
                nome: 'Esclusione animazione (16) e cinecomic (9715|180547)',
                desc: 'without_genres: 16, without_keywords: 9715|180547',
                exclude: '9715|180547',
                override: { without_genres: '16' }
            },
            {
                nome: 'Keyword raffinate + esclusione animazione e cinecomic',
                desc: 'Rimuove keyword debole 335567 e applica esclusioni',
                include: '275311|174089|169411|6262|243230|10854',
                exclude: '9715|180547',
                override: { without_genres: '16' }
            },
            {
                nome: 'Keyword raffinate + soglia voto 6.5',
                desc: 'Pulisce ulteriormente i plot twist mediocri',
                include: '275311|174089|169411|6262|243230|10854',
                exclude: '9715|180547',
                override: { without_genres: '16', 'vote_average.gte': 6.5 }
            }
        ],
        proposal: 'without_genres: 16, without_keywords: 9715|180547, keyword raffinate (Rec 97.7%, Fuori tema scende da 12% a 4%)'
    },
    preset_mindfuck_series: {
        currentPromise: 'genres: 10765|9648|18, keywords: 275311|174089|169411|3298|243230|10854|186760|3394',
        problem: 'Keyword ampie (3298 identity crisis, 3394 multiple personality) con Drama attirano Riverdale e soap opera',
        recommendation: 'Potare le keyword 3298 e 3394 ed eliminare il genere generico Drama (18) mantenendo solo Sci-Fi e Mystery.',
        alternatives: [
            {
                nome: 'Cluster grafo "plot twist" (c_1202)',
                desc: 'Cluster c_1202 su serie',
                cluster: 'plot twist'
            },
            {
                nome: 'Potatura keyword generiche (rimozione 3298 e 3394)',
                desc: 'Elimina l\'attrazione di teen drama e spy story',
                include: '275311|174089|169411|243230|10854|186760'
            },
            {
                nome: 'Potatura keyword + rimozione genere generico Drama (18)',
                desc: 'with_genres: 10765|9648 (Sci-Fi e Mystery puri)',
                include: '275311|174089|169411|243230|10854|186760',
                override: { with_genres: '10765|9648' }
            },
            {
                nome: 'Potatura keyword + solo Mystery/Sci-Fi + soglia voti 50',
                desc: 'Filtra serie minori con trame diluite',
                include: '275311|174089|169411|243230|10854|186760',
                override: { with_genres: '10765|9648', 'vote_count.gte': 50 }
            }
        ],
        proposal: 'Rimuovere keyword 3298 e 3394, togliere Drama 18 da with_genres (Pool 28, Fuori tema dimezzato)'
    },
    preset_fantasy_magic: {
        currentPromise: 'genres: 14,12 (Fantasy AND Adventure), with_keywords: 12554|6092|3205',
        problem: 'Keyword 12554 (dragon) fa dilagare flop trash (Dragonball Evolution, Uwe Boll) e anime Terramare',
        recommendation: 'Sostituire "dragon" con keyword focalizzate sulla magia dal cluster c_36 ed escludere anime (210024).',
        alternatives: [
            {
                nome: 'Cluster grafo "sword and sorcery" (c_173)',
                desc: 'Cluster c_173 (sword duel, sword and sorcery)',
                cluster: 'sword and sorcery'
            },
            {
                nome: 'Cluster grafo "magic" (c_36)',
                desc: 'Cluster c_36 (magic, wizard, sorcerer)',
                cluster: 'magic'
            },
            {
                nome: 'Sostituzione dragon con magia pura + no anime',
                desc: 'Include 6092|3205|2343|156174|179411 ed exclude 210024',
                include: '6092|3205|2343|156174|179411',
                exclude: '210024'
            },
            {
                nome: 'Magia pura + no anime + soglia voto 6.0',
                desc: 'Garantisce saghe riconosciute tagliando il trash sotto 6.0',
                include: '6092|3205|2343|156174|179411',
                exclude: '210024',
                override: { 'vote_average.gte': 6.0 }
            }
        ],
        proposal: 'Eliminare keyword dragon (12554), inserire cluster magia (6092|3205|2343|156174|179411), exclude 210024 (Pool 134, Fuori tema 2%)'
    },
    preset_space_hard_scifi: {
        currentPromise: 'with_genres: 878, with_keywords: 191132|1612|156039|14626|3388|256156|293350, vote_avg >= 6.5',
        problem: 'La "hard sci-fi" non è distinguibile da space fantasy con sole keyword (filtrano Star Wars e Guardiani della Galassia)',
        recommendation: 'RINVIO A TICKET 08 (cambiare nome). La rigida "hard sci-fi" non ha semantica isolabile in TMDB: rinominare in "Spazio Profondo & Odissee Cosmiche" e utilizzare i cluster c_263 e c_315 escludendo i supereroi.',
        alternatives: [
            {
                nome: 'Cluster grafo "space travel" (c_263)',
                desc: 'Cluster c_263 (space adventure, space exploration)',
                cluster: 'space adventure'
            },
            {
                nome: 'Esclusione space fantasy / cinecomic (9715|180547|161176|1701)',
                desc: 'Tenta di tagliare Star Wars, Guardiani della Galassia e cinecomic',
                exclude: '9715|180547|161176|1701'
            },
            {
                nome: 'Cluster space travel + space station + esclusione cinecomic',
                desc: 'Missioni e stazioni spaziali realistiche',
                include: '191132|1612|156039|14626|3388|256156|293350|9882|3804',
                exclude: '9715|180547|161176|1701'
            },
            {
                nome: 'Cambio nome in "Spazio Profondo" (ticket 08)',
                desc: 'Ridefinire promessa editoriale senza la pretesa "hard"',
                include: '191132|1612|156039|14626|3388|256156|293350',
                exclude: '9715|180547'
            }
        ],
        proposal: 'Cambiare nome in "Spazio Profondo & Odissee Cosmiche" (ticket 08) ed escludere cinecomic 9715|180547'
    },
    preset_action_blockbusters: {
        currentPromise: 'genres: 28, keywords: 830|10051|4565|1701, sort: revenue.desc',
        problem: 'Il titolo promette "Motori & Esplosioni", ma la selezione include cinecomic (Aquaman) e animazione (Shark Tale)',
        recommendation: 'RINVIO A TICKET 08 (cambiare nome). Se si vuole mantenere il catalogo ad alto incasso, rinominare in "Blockbuster d\'Azione" togliendo "Motori". Se si vuole mantenere "Motori", stringere sul cluster c_1 (racing).',
        alternatives: [
            {
                nome: 'Cluster grafo "racing" (c_1)',
                desc: 'Cluster c_1 (car racing, sports car, street race, grand prix)',
                cluster: 'car race'
            },
            {
                nome: 'Filtro motori focalizzato + no animazione (16)',
                desc: 'Taglia Shark Tale e Big Hero 6',
                include: '830|10073|155794|155793|187053|9717',
                override: { without_genres: '16' }
            },
            {
                nome: 'Motori & corse + no animazione + no supereroi (9715)',
                desc: 'Restaura la promessa di sole auto e gare',
                include: '830|10073|155794|155793|187053',
                exclude: '9715',
                override: { without_genres: '16' }
            },
            {
                nome: 'Cambio nome in "Blockbuster d\'Azione" (ticket 08)',
                desc: 'Mantiene l\'azione ad alto budget eliminando il vincolo motoristico dal titolo',
                override: { without_genres: '16' }
            }
        ],
        proposal: 'Cambiare nome in "Blockbuster d\'Azione" (ticket 08) ed escludere animazione (without_genres: 16)'
    },
    preset_anime_shonen: {
        currentPromise: 'genres: 16, with_keywords: 14643 (shonen), original_language: ja, vote_count.gte: 50',
        problem: 'La keyword 14643 è presente su soli 15 anime in tutto il DB, escludendo i colossi shōnen (Dragon Ball, Naruto)',
        recommendation: 'La singola keyword shonen è fallace. Integrare le keyword di dinamica narrativa (arti marziali 779, superpoteri 33637, battle 180734) ed escludere ecchi/harem.',
        alternatives: [
            {
                nome: 'Allargamento keyword (14643|779|33637|180734|193946)',
                desc: 'Aggiunge arti marziali, superpoteri e battaglie',
                include: '14643|779|33637|180734|193946'
            },
            {
                nome: 'Abbassamento soglia voti a 20 (su keyword 14643)',
                desc: 'Verifica volumetria della sola keyword originale',
                override: { 'vote_count.gte': 20 }
            },
            {
                nome: 'Allargamento keyword + esclusione ecchi/harem',
                desc: 'Elimina Maken-Ki e harem scolastici',
                include: '14643|779|33637|180734',
                exclude: '6075|9840|9914|190370'
            },
            {
                nome: 'Allargamento keyword + no ecchi + soglia voti 30',
                desc: 'Pool completo con i pilastri del battle shonen',
                include: '14643|779|33637|180734',
                exclude: '6075|9840|9914|190370',
                override: { 'vote_count.gte': 30 }
            }
        ],
        proposal: 'Include 14643|779|33637|180734, exclude 6075|9840|9914|190370, voti >= 30 (Pool 129, Fuori tema 0%, Mediana 8.2)'
    },
    preset_heist: {
        currentPromise: 'with_genres: 80|28, with_keywords: 10051 (heist), vote_avg.desc, vote_count.gte: 200',
        problem: 'Keyword singola 10051 attira Ant-Man (cinecomic) e Swindle (film per ragazzi)',
        recommendation: 'Mantenere la keyword 10051 che è eccellente, ma aggiungere esclusione di cinecomic (9715, 180547) e film per ragazzi (10751).',
        alternatives: [
            {
                nome: 'Cluster grafo "bank heist" (c_311)',
                desc: 'Cluster c_311 (bank heist, heist)',
                cluster: 'heist'
            },
            {
                nome: 'Esclusione cinecomic (9715|180547) e famiglia (10751)',
                desc: 'without_keywords: 9715|180547, without_genres: 10751',
                exclude: '9715|180547',
                override: { without_genres: '10751' }
            },
            {
                nome: 'Keyword rapina estese + esclusioni complete',
                desc: 'Include 10051|161245, exclude 9715|180547, without_genres: 10751|16',
                include: '10051|161245',
                exclude: '9715|180547',
                override: { without_genres: '10751|16' }
            }
        ],
        proposal: 'without_keywords: 9715|180547, without_genres: 10751 (Pool 114, Fuori tema dimezzato al 2%, Recall 95.8%)'
    },
    preset_treasure_hunters: {
        currentPromise: 'genres: 12, with_keywords: 6956|215470|299841|11088|184134, sort: popularity.desc',
        problem: 'Pool di soli 61 titoli, include documentari (A spasso con i dinosauri) e trash sotto la sufficienza',
        recommendation: 'Focalizzare sulle keyword del cluster c_252 (treasure map), escludere documentari (99) e animazione (16) con pavimento voto 5.5.',
        alternatives: [
            {
                nome: 'Cluster grafo "treasure map" (c_252)',
                desc: 'Cluster c_252 (treasure hunt, lost treasure, treasure map)',
                cluster: 'treasure hunt'
            },
            {
                nome: 'Esclusione documentari (99) e animazione (16)',
                desc: 'without_genres: 16|99',
                override: { without_genres: '16|99' }
            },
            {
                nome: 'Keyword raffinate + no doc/animazione + voto >= 5.5',
                desc: 'Include 6956|11088|184134|299841, without_genres: 16|99, vote_avg >= 5.5',
                include: '6956|11088|184134|299841',
                override: { without_genres: '16|99', 'vote_average.gte': 5.5 }
            }
        ],
        proposal: 'Cluster c_252 con without_genres: 16|99 e vote_average >= 5.5 (Fuori tema scende da 12% a 2.3%)'
    },
    preset_tv_high_fantasy: {
        currentPromise: 'with_genres: 10765, without_genres: 10762,10751, with_keywords: 211227, without_keywords: 210024, sort_by: popularity.desc, vote_count.gte: 10',
        problem: 'L\'esclusione anime (ticket 02) ha abbattuto gli anime dal 79% allo 0%, ma il pool è crollato a 7 titoli: la keyword 211227 (high fantasy) in TMDB è quasi unicamente apposta su anime.',
        recommendation: 'Le grandi serie high fantasy e spade & draghi occidentali (Game of Thrones, House of the Dragon, Rings of Power, The Witcher) in TMDB non usano la keyword 211227. Per avere un catalogo vivo serve adottare il cluster c_3 (epic fantasy: fantasy world, high fantasy, dark fantasy, dwarf, epic battle...) con esclusione animazione (Pool 63, Fuori tema 0%). Se non si accetta la coesistenza di sfumature dark/epiche e si pretende solo "spade e draghi" puri, la produzione televisiva occidentale è strutturalmente asfittica (pool max 49 titoli): in tal caso il report raccomanda di rinviare a ticket 08 («cambia il nome» in Epic & Dark Fantasy).',
        alternatives: [
            {
                nome: 'Cluster grafo "epic fantasy" (c_3) + no animazione',
                desc: 'Cluster c_3 (fantasy world, high fantasy, dark fantasy, dwarf, epic battle) con without_genres: 16',
                include: '189093|211227|177895|170362|375250|188270|604|249821|232697|269233|209374',
                override: { without_genres: '10762,10751,16', without_keywords: '210024|298549|3133|616|9715|180547' }
            },
            {
                nome: 'Cluster grafo "sword duel" (c_173)',
                desc: 'Cluster c_173 (sword, duel, swordsman, sword fight, sword and sorcery)',
                include: '1400|9725|10491|1938|12965|234213|175245',
                override: { without_genres: '10762,10751,16' }
            },
            {
                nome: 'Keyword tematiche high fantasy occidentali',
                desc: 'Include 170362|234213|12554|211227 con esclusione urban fantasy e cinecomic',
                include: '170362|234213|12554|211227',
                override: { without_genres: '10762,10751,16', without_keywords: '210024|298549|3133|616|9715|180547' }
            },
            {
                nome: 'Rinvio a ticket 08 (cambio nome in "Epic & Dark Fantasy")',
                desc: 'Allinea il nome all\'offerta televisiva reale accogliendo il cluster c_3 senza attriti di promessa',
                include: '189093|211227|177895|170362|375250|188270|604|269233',
                override: { without_genres: '10762,10751,16' }
            }
        ],
        proposal: 'Cluster grafo c_3 (epic fantasy) con without_genres: 16 (Pool 63, Fuori tema 0%), oppure rinvio a ticket 08 per cambio nome («cambia il nome»)'
    },
    preset_cyberpunk_series: {
        currentPromise: 'with_genres: 10765, with_keywords: 12190|4563|4565, without_keywords: 161176|3801|9882|207826|293198|210024, without_genres: 10762,10751, vote_count.gte: 20',
        problem: 'Il pool attuale è sceso a 54 titoli (era 108 prima dell\'esclusione anime 210024), finendo sotto la soglia minima di 60 titoli.',
        recommendation: 'Per riportare il catalogo sopra soglia 60 senza reintrodurre anime, è necessario estendere le keyword tematiche distopiche e cyberpunk integrando quelle consolidate nel catalogo film (cyberspace 180440, transhumanism 244840, android 318169, tech noir 162127) e post-apocalyptic future (4458 escludendo zombie 12377). In questo modo il pool sale a 70 titoli live-action con 0% anime.',
        alternatives: [
            {
                nome: 'Keyword cyberpunk espanse dal preset movie (voti >= 20)',
                desc: 'Aggiunge 180440 (cyberspace), 244840 (transhumanism), 318169 (android), 162127 (tech noir), 156338 (cyber)',
                include: '12190|4563|4565|180440|244840|318169|162127|156338|220486|231350'
            },
            {
                nome: 'Keyword espanse + soglia voti 15',
                desc: 'Abbassa il pavimento a 15 voti sulle keyword espanse',
                include: '12190|4563|4565|180440|244840|318169|162127|156338|220486|231350',
                override: { 'vote_count.gte': 15 }
            },
            {
                nome: 'Keyword espanse + post-apocalyptic future (4458) no zombie + no animazione (16)',
                desc: 'Include 4458 con exclude 12377 e without_genres: 16 (live-action puro)',
                include: '12190|4563|4565|4458|180440|244840|318169|162127',
                exclude: '12377',
                override: { without_genres: '10762,10751,16' }
            },
            {
                nome: 'Apertura al genere Drama (with_genres: 10765|18)',
                desc: 'Apre alle serie distopiche categorizzate Drama con keyword base (Pool 62)',
                override: { with_genres: '10765|18' }
            }
        ],
        proposal: 'Keyword cyberpunk espanse + 4458 (senza zombie 12377) e without_genres: 16 (Pool 70, quota anime 0%, supera la soglia di 60)'
    }
};

// --- CLI PARSER ---
function parseArgs() {
    const args = process.argv.slice(2);
    const opts = {
        preset: null,
        include: null,
        exclude: null,
        cluster: null,
        pilot: false,
        exWhitelist: false,
        json: false,
        out: null,
        limit: 50,
        help: false
    };

    for (let i = 0; i < args.length; i++) {
        const a = args[i];
        if (a === '--preset' && args[i + 1]) opts.preset = args[++i];
        else if (a === '--include' && args[i + 1]) opts.include = args[++i];
        else if (a === '--exclude' && args[i + 1]) opts.exclude = args[++i];
        else if (a === '--cluster' && args[i + 1]) opts.cluster = args[++i];
        else if (a === '--pilot') opts.pilot = true;
        else if (a === '--ex-whitelist' || a === '--six') opts.exWhitelist = true;
        else if (a === '--json') opts.json = true;
        else if (a === '--out' && args[i + 1]) opts.out = args[++i];
        else if (a === '--limit' && args[i + 1]) opts.limit = Number(args[++i]) || 50;
        else if (a === '--help' || a === '-h') opts.help = true;
    }
    return opts;
}

// --- RISOLUTORE GRAFO & DIZIONARIO KEYWORD ---
class KeywordGraphResolver {
    constructor() {
        this.kwNameToId = new Map();
        this.kwIdToName = new Map();
        this.kwFreq = new Map();
    }

    async init() {
        const rows = await store.query(`
            SELECT 
                CAST(k.id AS BIGINT) AS id,
                lower(trim(k.name)) AS name,
                count(*) as cnt
            FROM (
                SELECT unnest(from_json(keywords, '[{"id": "BIGINT", "name": "VARCHAR"}]')) AS k
                FROM (
                    SELECT keywords FROM movies WHERE keywords IS NOT NULL
                    UNION ALL
                    SELECT keywords FROM tv WHERE keywords IS NOT NULL
                )
            )
            WHERE k.id IS NOT NULL AND k.name IS NOT NULL
            GROUP BY 1, 2
            ORDER BY cnt DESC
        `);

        for (const r of rows) {
            const id = Number(r.id);
            const name = String(r.name);
            const cnt = Number(r.cnt);
            if (!this.kwNameToId.has(name)) this.kwNameToId.set(name, id);
            if (!this.kwIdToName.has(id)) this.kwIdToName.set(id, name);
            this.kwFreq.set(id, cnt);
        }
    }

    resolveItem(item) {
        const raw = String(item || '').trim();
        if (!raw) return null;
        if (/^\d+$/.test(raw)) {
            const id = Number(raw);
            return { id, name: this.kwIdToName.get(id) || `id_${id}`, freq: this.kwFreq.get(id) || 0 };
        }
        const lower = raw.toLowerCase();
        if (this.kwNameToId.has(lower)) {
            const id = this.kwNameToId.get(lower);
            return { id, name: lower, freq: this.kwFreq.get(id) || 0 };
        }
        return null;
    }

    resolveList(str) {
        if (!str) return [];
        const rawItems = String(str).split(/[,|]/).map(s => s.trim()).filter(Boolean);
        const resolved = [];
        for (const item of rawItems) {
            const r = this.resolveItem(item);
            if (r) resolved.push(r);
        }
        return resolved;
    }

    resolveCluster(queryStr) {
        const raw = String(queryStr || '').toLowerCase().trim();
        if (!raw) return null;

        let level = null;
        let cId = null;
        let node = null;

        // 1. Match diretto su ID nodo
        if (graph.L1 && graph.L1[raw]) { level = 'L1'; cId = raw; node = graph.L1[raw]; }
        else if (graph.L2 && graph.L2[raw]) { level = 'L2'; cId = raw; node = graph.L2[raw]; }
        else if (graph.L3 && graph.L3[raw]) { level = 'L3'; cId = raw; node = graph.L3[raw]; }

        // 2. Lookup kw_to_L1
        if (!node && graph.kw_to_L1 && graph.kw_to_L1[raw]) {
            level = 'L1';
            cId = graph.kw_to_L1[raw];
            node = graph.L1[cId];
        }

        // 3. Medoid esatto
        if (!node) {
            for (const [id, n] of Object.entries(graph.L1 || {})) {
                if (n.medoid && n.medoid.toLowerCase() === raw) { level = 'L1'; cId = id; node = n; break; }
            }
            if (!node) {
                for (const [id, n] of Object.entries(graph.L2 || {})) {
                    if (n.medoid && n.medoid.toLowerCase() === raw) { level = 'L2'; cId = id; node = n; break; }
                }
            }
            if (!node) {
                for (const [id, n] of Object.entries(graph.L3 || {})) {
                    if (n.medoid && n.medoid.toLowerCase() === raw) { level = 'L3'; cId = id; node = n; break; }
                }
            }
        }

        // 4. Substring match su kw_to_L1
        if (!node) {
            const partial = Object.keys(graph.kw_to_L1 || {}).find(k => k.includes(raw));
            if (partial) {
                level = 'L1';
                cId = graph.kw_to_L1[partial];
                node = graph.L1[cId];
            }
        }

        if (!node) return null;

        // Ricostruzione catena gerarchica
        const hierarchy = [`${level}:${cId} ("${node.medoid}")`];
        let parentL2 = null;
        let parentL3 = null;

        if (level === 'L1' && node.parent && graph.L2?.[node.parent]) {
            parentL2 = graph.L2[node.parent];
            hierarchy.push(`L2:${node.parent} ("${parentL2.medoid}")`);
            if (parentL2.parent && graph.L3?.[parentL2.parent]) {
                parentL3 = graph.L3[parentL2.parent];
                hierarchy.push(`L3:${parentL2.parent} ("${parentL3.medoid}")`);
            }
        } else if (level === 'L2' && node.parent && graph.L3?.[node.parent]) {
            parentL3 = graph.L3[node.parent];
            hierarchy.push(`L3:${node.parent} ("${parentL3.medoid}")`);
        }

        const rawKeywords = node.keywords || node.top_keywords || [];
        const resolvedKws = [];
        const unmappedKws = [];

        for (const kw of rawKeywords) {
            const r = this.resolveItem(kw);
            if (r) resolvedKws.push(r);
            else unmappedKws.push(kw);
        }

        return {
            level,
            clusterId: cId,
            medoid: node.medoid,
            hierarchyChain: hierarchy.join(' -> '),
            rawKeywords,
            resolvedKeywords: resolvedKws,
            unmappedKeywords: unmappedKws,
            includeString: resolvedKws.map(k => k.id).join('|')
        };
    }
}

// --- MOTORE DI MISURAZIONE ---
class BenchmarkEngine {
    constructor(resolver) {
        this.resolver = resolver;
        this.reviewsById = new Map();
        this.allPresets = [];
        this.presetsById = new Map();
        this.top40Cache = new Map();
    }

    async init() {
        // Caricamento verdetti campagne QC
        const reviewDir = path.resolve(process.cwd(), '.scratch/qc-cataloghi/review/preset');
        if (fs.existsSync(reviewDir)) {
            for (const f of fs.readdirSync(reviewDir)) {
                if (!f.endsWith('.json')) continue;
                try {
                    const items = JSON.parse(fs.readFileSync(path.join(reviewDir, f), 'utf8'));
                    for (const it of items) this.reviewsById.set(it.id, { ...it, batchFile: f });
                } catch (e) {
                    // ignore
                }
            }
        }

        this.allPresets = getPresets();
        for (const p of this.allPresets) {
            this.presetsById.set(p.id, p);
        }

        // Precalcolo top 40 dei preset fratelli per J@40
        for (const p of this.allPresets) {
            const q0 = p.queries?.[0];
            if (!q0) continue;
            try {
                const compiled = buildPresetFromFilters(q0, p.type);
                const rows = await this.queryCatalogRows(compiled, 40);
                this.top40Cache.set(p.id, {
                    id: p.id,
                    name: p.name,
                    type: p.type,
                    ids: new Set(rows.map(r => Number(r.id)))
                });
            } catch (e) {
                // ignore
            }
        }
    }

    async queryCatalogRows(compiledPreset, limit = 50) {
        const isTv = compiledPreset.type === 'tv' || compiledPreset.type === 'series';
        const table = isTv ? 'tv' : 'movies';
        const titleCol = isTv ? 'name' : 'title';
        const whereSql = ['adult = false', ...(compiledPreset.where || [])].join(' AND ');
        const sql = `
            SELECT id, ${titleCol} as title, vote_average, vote_count, popularity, original_language, genres, keywords
            FROM ${table}
            WHERE ${whereSql}
            ORDER BY ${compiledPreset.orderBy}
            LIMIT ${limit}
        `;
        return await store.query(sql);
    }

    async queryPoolCount(compiledPreset) {
        const isTv = compiledPreset.type === 'tv' || compiledPreset.type === 'series';
        const table = isTv ? 'tv' : 'movies';
        const whereSql = ['adult = false', ...(compiledPreset.where || [])].join(' AND ');
        const sql = `SELECT count(*) as n FROM ${table} WHERE ${whereSql}`;
        const res = await store.query(sql);
        return Number(res[0]?.n || 0);
    }

    calcMaxJ40(candIds, candType, excludeId) {
        let maxJ = 0;
        let maxSibling = null;
        const candSet = new Set(candIds.slice(0, 40));

        for (const [pId, sibling] of this.top40Cache) {
            if (pId === excludeId) continue;
            if (sibling.type !== candType) continue;
            const inter = [...candSet].filter(x => sibling.ids.has(x)).length;
            const union = new Set([...candSet, ...sibling.ids]).size;
            const j40 = union ? +(inter / union).toFixed(3) : 0;
            if (j40 > maxJ) {
                maxJ = j40;
                maxSibling = sibling;
            }
        }
        return { j40: maxJ, siblingId: maxSibling?.id, siblingName: maxSibling?.name };
    }

    async getGroundTruth(presetId) {
        const p = this.presetsById.get(presetId);
        if (!p) throw new Error(`Preset non trovato: ${presetId}`);

        const rev = this.reviewsById.get(presetId);
        const inThemeIds = new Set();
        const outOfThemeIds = new Set();
        const errPos = new Set((rev?.errori || []).map(e => e.pos));

        // Priorità 1: file di dump top-50 della campagna QC originale
        const top50File = path.resolve(process.cwd(), `.scratch/qc-cataloghi/runs/top50/top50/${presetId}.json`);
        let baseRows = [];
        if (fs.existsSync(top50File)) {
            const dump = JSON.parse(fs.readFileSync(top50File, 'utf8'));
            const judgedLimit = rev?.itemGiudicati || (dump.items || []).length;
            (dump.items || []).forEach(it => {
                const id = Number(it.tmdbId);
                if (it.pos <= judgedLimit) {
                    if (errPos.has(it.pos)) outOfThemeIds.add(id);
                    else inThemeIds.add(id);
                }
            });
            baseRows = (dump.items || []).slice(0, 50).map(it => ({
                id: it.tmdbId,
                title: it.titolo,
                vote_average: it.voto,
                vote_count: it.voti,
                original_language: it.lingua
            }));
        } else {
            const compiledBase = buildPresetFromFilters(p.queries[0], p.type);
            baseRows = await this.queryCatalogRows(compiledBase, 50);
            const judgedLimit = rev?.itemGiudicati || baseRows.length;
            baseRows.forEach((row, idx) => {
                const pos = idx + 1;
                const id = Number(row.id);
                if (pos <= judgedLimit) {
                    if (errPos.has(pos)) outOfThemeIds.add(id);
                    else inThemeIds.add(id);
                }
            });
        }

        return {
            preset: p,
            review: rev,
            baseRows,
            inThemeIds,
            outOfThemeIds,
            totalInTheme: inThemeIds.size,
            totalOutOfTheme: outOfThemeIds.size
        };
    }

    async evaluate(compiledPreset, groundTruth, excludeId, limit = 50) {
        const rows = await this.queryCatalogRows(compiledPreset, limit);
        const pool = await this.queryPoolCount(compiledPreset);

        let inCount = 0;
        let outCount = 0;
        let unkCount = 0;
        const scores = [];
        let animeCount = 0;
        let westAnimCount = 0;
        const candIds = [];

        for (const r of rows) {
            const id = Number(r.id);
            candIds.push(id);
            if (groundTruth.inThemeIds.has(id)) inCount++;
            else if (groundTruth.outOfThemeIds.has(id)) outCount++;
            else unkCount++;

            if (r.vote_average != null) scores.push(Number(r.vote_average));

            let genreIds = [];
            try {
                const parsed = typeof r.genres === 'string' ? JSON.parse(r.genres) : r.genres;
                genreIds = (parsed || []).map(g => (typeof g === 'object' ? g.id : g));
            } catch {}
            let keywords = [];
            try {
                keywords = typeof r.keywords === 'string' ? JSON.parse(r.keywords) : r.keywords;
            } catch {}
            const isAnimeTrue = isAnimeContent({ tmdbId: id, genreIds, originalLanguage: r.original_language, keywords, tipo: compiledPreset.type });
            const hasGen16 = genreIds.some(g => Number(g) === 16);
            const isWestAnim = hasGen16 && !isAnimeTrue;

            if (isAnimeTrue) animeCount++;
            else if (isWestAnim) westAnimCount++;
        }

        scores.sort((a, b) => a - b);
        const medScore = scores.length ? scores[Math.floor(scores.length / 2)] : null;
        const j40Info = this.calcMaxJ40(candIds, compiledPreset.type, excludeId);
        const totalIn = groundTruth.totalInTheme;

        return {
            pool,
            itemsCount: rows.length,
            inCount,
            outCount,
            unkCount,
            recall: totalIn ? +(inCount / totalIn * 100).toFixed(1) : 0,
            precisionOut: rows.length ? +(outCount / rows.length * 100).toFixed(1) : 0,
            precisionIn: (inCount + outCount) > 0 ? +(inCount / (inCount + outCount) * 100).toFixed(1) : 0,
            unkPct: rows.length ? +(unkCount / rows.length * 100).toFixed(1) : 0,
            medScore,
            animePct: rows.length ? +(animeCount / rows.length * 100).toFixed(1) : 0,
            westAnimPct: rows.length ? +(westAnimCount / rows.length * 100).toFixed(1) : 0,
            maxJ40: j40Info.j40,
            maxSibling: j40Info.siblingId,
            candIds
        };
    }

    async measureExWhitelist() {
        const results = [];
        for (const pId of EX_WHITELIST_IDS) {
            const p = this.presetsById.get(pId);
            if (!p) continue;
            const gt = await this.getGroundTruth(pId);
            const isTv = p.type === 'tv' || p.type === 'series';
            const table = isTv ? 'tv' : 'movies';
            const titleCol = isTv ? 'name' : 'title';

            // Variante C: com'è adesso (solo esclusione 210024, nessuna whitelist)
            const qC = { ...(p.queries?.[0] || {}) };
            const compiledC = buildPresetFromFilters(qC, p.type);
            const whereC = ['adult = false', ...(compiledC.where || [])].join(' AND ');
            const poolC = Number((await store.query(`SELECT count(*) as c FROM ${table} WHERE ${whereC}`))[0].c);
            const rowsC = await store.query(`
                SELECT id, ${titleCol} as title, vote_average, vote_count, original_language, genres, keywords
                FROM ${table}
                WHERE ${whereC}
                ORDER BY ${compiledC.orderBy}
                LIMIT 50
            `);

            // Variante B: C + without_genres: 16
            const qB = { ...qC };
            if (qB.without_genres) {
                const parts = String(qB.without_genres).split(/[,|]/).map(s => s.trim());
                if (!parts.includes('16')) parts.push('16');
                qB.without_genres = parts.join(',');
            } else {
                qB.without_genres = '16';
            }
            const compiledB = buildPresetFromFilters(qB, p.type);
            const whereB = ['adult = false', ...(compiledB.where || [])].join(' AND ');
            const poolB = Number((await store.query(`SELECT count(*) as c FROM ${table} WHERE ${whereB}`))[0].c);
            const rowsB = await store.query(`
                SELECT id, ${titleCol} as title, vote_average, vote_count, original_language, genres, keywords
                FROM ${table}
                WHERE ${whereB}
                ORDER BY ${compiledB.orderBy}
                LIMIT 50
            `);

            const analyze = (rows) => {
                let animeCount = 0;
                let westAnimCount = 0;
                let inThemeHit = 0;
                for (const r of rows) {
                    const tmdbId = Number(r.id);
                    let genreIds = [];
                    try {
                        const parsed = typeof r.genres === 'string' ? JSON.parse(r.genres) : r.genres;
                        genreIds = (parsed || []).map(g => (typeof g === 'object' ? g.id : g));
                    } catch {}
                    let keywords = [];
                    try {
                        keywords = typeof r.keywords === 'string' ? JSON.parse(r.keywords) : r.keywords;
                    } catch {}
                    const isAnimeTrue = isAnimeContent({ tmdbId, genreIds, originalLanguage: r.original_language, keywords, tipo: p.type });
                    const has16 = genreIds.some(g => Number(g) === 16);
                    if (isAnimeTrue) animeCount++;
                    else if (has16) westAnimCount++;

                    if (gt.inThemeIds.has(tmdbId)) inThemeHit++;
                }
                return {
                    totalShown: rows.length,
                    animeCount,
                    animePct: rows.length ? +(animeCount / rows.length * 100).toFixed(1) : 0,
                    westAnimCount,
                    westAnimPct: rows.length ? +(westAnimCount / rows.length * 100).toFixed(1) : 0,
                    inThemeHit,
                    totalInTheme: gt.totalInTheme,
                    inThemePct: gt.totalInTheme ? +(inThemeHit / gt.totalInTheme * 100).toFixed(1) : 0
                };
            };

            const statsC = analyze(rowsC);
            const statsB = analyze(rowsB);

            // Raccomandazioni motivate
            let rec = 'C';
            let mot = '';
            if (pId === 'preset_cyberpunk') {
                rec = 'B';
                mot = 'Pool a 73 (> 60), toglie il 10% di animazione occidentale fuori promessa e l\'unico anime residuo Vexille, azzera l\'animazione (0%), preserva 25/43 in tema';
            } else if (pId === 'preset_cyberpunk_series') {
                rec = 'C';
                mot = 'Con B il pool scenderebbe a 46 titoli (sotto soglia 60); C mantiene 54 titoli (in attesa dell\'allargamento pilota con 4458 che sale a 70 titoli con 0% anime)';
            } else if (pId === 'preset_tv_superheroes_dark') {
                rec = 'C';
                mot = 'Con B il pool collassa a 17 titoli (< 20, soglia critica 1ª pagina Stremio); in C l\'animazione (Invincible, Batman) è acclamata e in tema (18/23)';
            } else if (pId === 'preset_extreme_survival') {
                rec = 'B';
                mot = 'Pool solido a 200 (-2 soli titoli), elimina i 2 film animati fuori contesto (Flow, La tartaruga rossa), 0% animazione e 34/44 in tema';
            } else if (pId === 'preset_time_travel_movies') {
                rec = 'B';
                mot = 'Pool capiente a 107 (> 60), azzera il 16% di animazione fuori contesto (Regular Show, Flashpoint), 0% anime e 34/42 in tema';
            } else if (pId === 'preset_tv_high_fantasy') {
                rec = 'B';
                mot = 'Formalmente B azzera anime (0%) e animazione (0%), ma entrambe hanno pool insufficiente (7 vs 5): mandatoria la sostituzione keyword con cluster c_3 (pool 63) o rinvio a ticket 08';
            }

            results.push({
                presetId: pId,
                name: p.name,
                type: p.type,
                c: { pool: poolC, ...statsC },
                b: { pool: poolB, ...statsB },
                recommendation: rec,
                motivation: mot
            });
        }
        return results;
    }
}

// --- FORMATTAZIONE E REPORTISTICA ---
function pad(s, n) {
    const str = String(s == null ? '' : s);
    return str.padEnd(n);
}

function printAsciiTable(title, rows) {
    console.log(`\n=== ${title} ===`);
    if (!rows.length) return;
    const headers = Object.keys(rows[0]);
    const colWidths = {};
    for (const h of headers) colWidths[h] = h.length;
    for (const r of rows) {
        for (const h of headers) {
            const val = String(r[h] == null ? '' : r[h]);
            if (val.length > colWidths[h]) colWidths[h] = Math.min(val.length, 50);
        }
    }

    const line = headers.map(h => '-'.repeat(colWidths[h])).join('-+-');
    const headRow = headers.map(h => pad(h, colWidths[h])).join(' | ');
    console.log(headRow);
    console.log(line);
    for (const r of rows) {
        const rowStr = headers.map(h => pad(String(r[h] == null ? '' : r[h]).slice(0, 50), colWidths[h])).join(' | ');
        console.log(rowStr);
    }
    console.log('');
}

// --- MAIN CLI ---
async function main() {
    const opts = parseArgs();

    if (opts.help) {
        console.log(`
Uso:
  node scripts/qa/keyword-bench.js --preset <id>
  node scripts/qa/keyword-bench.js --preset <id> --include <ids|names> --exclude <ids|names>
  node scripts/qa/keyword-bench.js --preset <id> --cluster "<medoid|keyword>"
  node scripts/qa/keyword-bench.js --pilot
  node scripts/qa/keyword-bench.js --pilot --json --out <file>

Opzioni:
  --preset <id>             ID del catalogo/preset da misurare
  --include <kws>           Keyword da includere (nomi o ID separati da virgola o pipe)
  --exclude <kws>           Keyword da escludere
  --cluster "<stringa>"     Esplora il grafo gerarchico per medoid o keyword e propone i candidati
  --pilot                   Esegue la misurazione completa sui 12 cataloghi pilota della campagna QC
  --json                    Emette l'output in formato JSON
  --out <file>              Scrive il risultato nel file indicato
  --limit <n>               Numero di item nel dump di campionamento (default: 50)
`);
        process.exit(0);
    }

    await store.init();
    const resolver = new KeywordGraphResolver();
    await resolver.init();

    const bench = new BenchmarkEngine(resolver);
    await bench.init();

    // 1. MODALITÀ PILOTA
    if (opts.pilot) {
        const pilotSummaryRows = [];
        const detailedReportData = [];

        for (const pId of PILOT_IDS) {
            const cfg = PILOT_CONFIGS[pId];
            const gt = await bench.getGroundTruth(pId);
            const baseCompiled = buildPresetFromFilters(gt.preset.queries[0], gt.preset.type);
            const baseMetrics = await bench.evaluate(baseCompiled, gt, pId, opts.limit);

            const alternativesMeasured = [];
            for (const alt of cfg.alternatives) {
                let altQ = { ...(gt.preset.queries?.[0] || {}) };
                let clusterInfo = null;

                if (alt.cluster) {
                    clusterInfo = resolver.resolveCluster(alt.cluster);
                    if (clusterInfo && clusterInfo.includeString) {
                        altQ.with_keywords = clusterInfo.includeString;
                    }
                } else if (alt.include) {
                    const resolved = resolver.resolveList(alt.include);
                    altQ.with_keywords = resolved.length ? resolved.map(k => k.id).join('|') : alt.include;
                }

                if (alt.exclude) {
                    const resolved = resolver.resolveList(alt.exclude);
                    const excStr = resolved.length ? resolved.map(k => k.id).join('|') : alt.exclude;
                    const existing = altQ.without_keywords ? String(altQ.without_keywords) + '|' : '';
                    altQ.without_keywords = existing + excStr;
                }

                if (alt.override) {
                    for (const [k, v] of Object.entries(alt.override)) {
                        if (v === undefined) delete altQ[k];
                        else altQ[k] = v;
                    }
                }

                const compiled = buildPresetFromFilters(altQ, gt.preset.type);
                const m = await bench.evaluate(compiled, gt, pId, opts.limit);

                const inLost = baseMetrics.inCount - m.inCount;
                const outElim = baseMetrics.outCount - m.outCount;

                alternativesMeasured.push({
                    nome: alt.nome,
                    desc: alt.desc,
                    clusterInfo,
                    query: altQ,
                    metrics: m,
                    costBenefit: {
                        inLost,
                        outElim,
                        netDelta: outElim - inLost
                    }
                });
            }

            pilotSummaryRows.push({
                catalogo: pId,
                nome: gt.preset.name,
                qcScore: gt.review?.score ?? 'n/d',
                poolBase: baseMetrics.pool,
                fuoriTemaBase: `${baseMetrics.precisionOut}%`,
                proposta: cfg.proposal
            });

            detailedReportData.push({
                presetId: pId,
                nome: gt.preset.name,
                qcReview: gt.review,
                currentPromise: cfg.currentPromise,
                problem: cfg.problem,
                recommendation: cfg.recommendation,
                proposal: cfg.proposal,
                baseline: baseMetrics,
                alternatives: alternativesMeasured
            });
        }

        const exWhitelistData = await bench.measureExWhitelist();

        // Se richiesto --json, emetti struttura stabile
        if (opts.json) {
            const jsonOut = JSON.stringify({ summary: pilotSummaryRows, details: detailedReportData, exWhitelist: exWhitelistData }, null, 2);
            if (opts.out) {
                fs.writeFileSync(path.resolve(opts.out), jsonOut, 'utf8');
                console.log(`[Banco Keyword] Risultati JSON scritti in ${opts.out}`);
            } else {
                console.log(jsonOut);
            }
            process.exit(0);
        }

        // Genera Report Markdown
        const reportPath = path.resolve(opts.out || path.join(process.cwd(), '.scratch/qc-cataloghi/ricerche/02-banco-keyword.md'));
        fs.mkdirSync(path.dirname(reportPath), { recursive: true });

        const reportLines = [];
        reportLines.push('# 02 — Banco di prova keyword TMDB & Cluster del Grafo');
        reportLines.push('');
        reportLines.push(`**Data Parquet**: 06/10/2026 (movies.parquet 59.460.766 B + tv.parquet 9.292.473 B)`);
        reportLines.push(`**Riferimento Spec**: [\`../issues/14-banco-keyword.md\`](../issues/14-banco-keyword.md) · **Causa**: C2 della campagna QC`);
        reportLines.push(`**Cataloghi Pilota**: 14 (12 originari C2 + 2 aggiunti post ticket 02: tv_high_fantasy e cyberpunk_series)`);
        reportLines.push('');
        reportLines.push('---');
        reportLines.push('');
        reportLines.push('## 1. Tabella Riassuntiva dei 14 Cataloghi Pilota');
        reportLines.push('');
        reportLines.push('| Catalogo | Score QC | Pool Attuale | Fuori Tema Base | Proposta sintetica |');
        reportLines.push('|---|---|---|---|---|');
        for (const row of pilotSummaryRows) {
            reportLines.push(`| \`${row.catalogo}\` (${row.nome}) | ${row.qcScore} | ${row.poolBase} | ${row.fuoriTemaBase} | ${row.proposta} |`);
        }
        reportLines.push('');
        reportLines.push('---');
        reportLines.push('');
        reportLines.push('## 2. Analisi Dettagliata per Catalogo');
        reportLines.push('');

        for (const cat of detailedReportData) {
            reportLines.push(`### ${cat.presetId} — ${cat.nome}`);
            reportLines.push(`- **Score QC**: ${cat.qcReview?.verdetto} ${cat.qcReview?.score} (${cat.qcReview?.errori?.length || 0} errori segnalati)`);
            reportLines.push(`- **Promessa attuale**: \`${cat.currentPromise}\``);
            reportLines.push(`- **Problema rilevato**: ${cat.problem}`);
            reportLines.push(`- **Raccomandazione**: ${cat.recommendation}`);
            reportLines.push('');
            reportLines.push('#### Baseline (Promessa Attuale)');
            reportLines.push(`| Pool | Top-50 Restituiti | Recall @50 | Fuori Tema @50 | Sconosciuti | Mediana Voti | Quota Anime Vera | Quota Anim. Occidentale | Max J@40 |`);
            reportLines.push(`|---|---|---|---|---|---|---|---|---|`);
            const b = cat.baseline;
            reportLines.push(`| ${b.pool} | ${b.itemsCount} | ${b.recall}% (${b.inCount}/${cat.qcReview?.itemGiudicati || 50}) | ${b.precisionOut}% (${b.outCount}) | ${b.unkPct}% | ${b.medScore ?? 'n/d'} | ${b.animePct}% | ${b.westAnimPct}% | ${b.maxJ40} (${b.maxSibling || 'nessuno'}) |`);
            reportLines.push('');
            reportLines.push('#### Alternative Provate & Misurate');
            reportLines.push(`| Alternativa | Pool | Recall @50 | Fuori Tema | In Tema Persi (Costo) | Fuori Tema Eliminati (Beneficio) | Mediana | Max J@40 |`);
            reportLines.push(`|---|---|---|---|---|---|---|---|`);
            for (const a of cat.alternatives) {
                const m = a.metrics;
                const cb = a.costBenefit;
                reportLines.push(`| **${a.nome}**<br>_${a.desc}_ | ${m.pool} | ${m.recall}% | ${m.precisionOut}% (${m.outCount}) | -${cb.inLost} | +${cb.outElim} | ${m.medScore ?? 'n/d'} | ${m.maxJ40} |`);
            }
            reportLines.push('');
            reportLines.push(`> **Proposta Finale**: ${cat.proposal}`);
            reportLines.push('');
            reportLines.push('---');
            reportLines.push('');
        }

        // SEZIONE 3: I 6 CATALOGHI EX-WHITELIST
        reportLines.push('## 3. Misura dei 6 Cataloghi Ex-Whitelist: Variante C vs Variante B');
        reportLines.push('');
        reportLines.push('A seguito dell\'atterraggio del ticket 02 e della decisione architetturale di rimuovere le whitelist di lingua dai cataloghi di genere, l\'esperimento preliminare A/B/C viene sostituito dal confronto oggettivo tra:');
        reportLines.push('- **Variante C = com\'è adesso**: solo esclusione anime TMDB (`without_keywords: 210024`), nessuna whitelist di lingua;');
        reportLines.push('- **Variante B = C + `without_genres: 16`**: aggiunge l\'esclusione del genere animazione (16), rimuovendo anche l\'animazione occidentale fuori promessa per cataloghi dichiaratamente live-action.');
        reportLines.push('');
        reportLines.push('Metriche rilevate per variante:');
        reportLines.push('- **Pool**: dimensione complessiva del catalogo in DuckDB;');
        reportLines.push('- **Quota Anime Vera**: quota misurata tramite il classificatore canonico (`isAnimeContent` in `src/utils/animeIdentity.js`, con lookup store Anibridge/Fribb, e non il semplice flag `isAnime`);');
        reportLines.push('- **Quota Animazione Occidentale**: quota di titoli con genere 16 che non sono classificati come anime;');
        reportLines.push('- **Etichette In Tema Raggiungibili**: quanti dei titoli considerati in tema dalla campagna QC originale restano presenti nella top-50 restituita;');
        reportLines.push('- **Raccomandazione**: scelta finale (C o B) con il numero che la motiva.');
        reportLines.push('');
        reportLines.push('### Tabella Riassuntiva Ex-Whitelist');
        reportLines.push('');
        reportLines.push('| Catalogo | Pool C | Pool B | Quota Anime (C → B) | Quota Anim. Occidentale (C → B) | In Tema Raggiungibili (C → B) | Scelta | Motivazione Numerica |');
        reportLines.push('|---|---|---|---|---|---|---|---|');
        for (const ex of exWhitelistData) {
            reportLines.push(`| \`${ex.presetId}\`<br>_${ex.name}_ | ${ex.c.pool} | ${ex.b.pool} | ${ex.c.animePct}% → ${ex.b.animePct}% | ${ex.c.westAnimPct}% → ${ex.b.westAnimPct}% | ${ex.c.inThemeHit}/${ex.c.totalInTheme} → ${ex.b.inThemeHit}/${ex.b.totalInTheme} | **${ex.recommendation}** | ${ex.motivation} |`);
        }
        reportLines.push('');
        reportLines.push('### Dettaglio dei Sei Cataloghi');
        reportLines.push('');
        for (const ex of exWhitelistData) {
            reportLines.push(`#### ${ex.presetId} — ${ex.name}`);
            reportLines.push(`- **Tipo**: \`${ex.type}\``);
            reportLines.push(`- **Variante C (com'è adesso)**: Pool ${ex.c.pool} · Quota Anime Vera ${ex.c.animePct}% (${ex.c.animeCount}/${ex.c.totalShown}) · Animazione Occidentale ${ex.c.westAnimPct}% (${ex.c.westAnimCount}/${ex.c.totalShown}) · In tema raggiungibili: ${ex.c.inThemeHit}/${ex.c.totalInTheme}`);
            reportLines.push(`- **Variante B (C + without_genres 16)**: Pool ${ex.b.pool} · Quota Anime Vera ${ex.b.animePct}% (${ex.b.animeCount}/${ex.b.totalShown}) · Animazione Occidentale ${ex.b.westAnimPct}% (${ex.b.westAnimCount}/${ex.b.totalShown}) · In tema raggiungibili: ${ex.b.inThemeHit}/${ex.b.totalInTheme}`);
            reportLines.push(`- **Raccomandazione Finale**: **${ex.recommendation}**`);
            reportLines.push(`- **Motivazione**: ${ex.motivation}`);
            reportLines.push('');
        }

        fs.writeFileSync(reportPath, reportLines.join('\n'), 'utf8');
        console.log(`[Banco Keyword] Report pilota generato con successo: ${reportPath}`);

        // Stampa a schermo la tabella di sintesi leggibile richiesta per l'accettazione
        printAsciiTable('SOMMARIO CATALOGHI PILOTA (Banco Keyword - 14 Cataloghi)', pilotSummaryRows.map(r => ({
            Catalogo: r.catalogo,
            QC: r.qcScore,
            Pool: r.poolBase,
            'Fuori Tema': r.fuoriTemaBase,
            Proposta: r.proposta
        })));

        printAsciiTable('MISURA DEI 6 CATALOGHI EX-WHITELIST (Variante C vs Variante B)', exWhitelistData.map(r => ({
            Catalogo: r.presetId,
            'Pool C': r.c.pool,
            'Pool B': r.b.pool,
            'Anime C->B': `${r.c.animePct}% -> ${r.b.animePct}%`,
            'WestAnim C->B': `${r.c.westAnimPct}% -> ${r.b.westAnimPct}%`,
            'In Tema C->B': `${r.c.inThemeHit}/${r.c.totalInTheme} -> ${r.b.inThemeHit}/${r.b.totalInTheme}`,
            Scelta: r.recommendation,
            Motivazione: r.motivation
        })));

        process.exit(0);
    }

    if (opts.exWhitelist) {
        const exWhitelistData = await bench.measureExWhitelist();
        if (opts.json) {
            console.log(JSON.stringify(exWhitelistData, null, 2));
            process.exit(0);
        }
        printAsciiTable('MISURA DEI 6 CATALOGHI EX-WHITELIST (Variante C vs Variante B)', exWhitelistData.map(r => ({
            Catalogo: r.presetId,
            'Pool C': r.c.pool,
            'Pool B': r.b.pool,
            'Anime C->B': `${r.c.animePct}% -> ${r.b.animePct}%`,
            'WestAnim C->B': `${r.c.westAnimPct}% -> ${r.b.westAnimPct}%`,
            'In Tema C->B': `${r.c.inThemeHit}/${r.c.totalInTheme} -> ${r.b.inThemeHit}/${r.b.totalInTheme}`,
            Scelta: r.recommendation,
            Motivazione: r.motivation
        })));
        process.exit(0);
    }

    // 2. MODALITÀ SINGOLO PRESET
    if (!opts.preset) {
        console.error('Errore: specificare --preset <id> oppure --pilot. Usa --help per dettagli.');
        process.exit(1);
    }

    const gt = await bench.getGroundTruth(opts.preset);
    const baseCompiled = buildPresetFromFilters(gt.preset.queries[0], gt.preset.type);
    const baseMetrics = await bench.evaluate(baseCompiled, gt, opts.preset, opts.limit);

    // Se non ci sono argomenti candidato, mostra solo la promessa attuale
    if (!opts.include && !opts.exclude && !opts.cluster) {
        console.log(`\nPromessa Attuale: ${gt.preset.name} (${gt.preset.id})`);
        console.log(`Verdetto QC: ${gt.review?.verdetto || 'N/A'} (Score: ${gt.review?.score || 'N/A'}, Errori: ${gt.review?.errori?.length || 0})`);
        console.log(`Query originale: ${JSON.stringify(gt.preset.queries?.[0])}\n`);

        const displayRows = [
            {
                Configurazione: 'Promessa Attuale (Baseline)',
                Pool: baseMetrics.pool,
                Restituiti: baseMetrics.itemsCount,
                'Recall @50': `${baseMetrics.recall}% (${baseMetrics.inCount}/${gt.totalInTheme})`,
                'Fuori Tema': `${baseMetrics.precisionOut}% (${baseMetrics.outCount}/${baseMetrics.itemsCount})`,
                'In Tema': `${baseMetrics.precisionIn}%`,
                Sconosciuti: `${baseMetrics.unkPct}%`,
                'Mediana Voto': baseMetrics.medScore,
                'Quota Anime': `${baseMetrics.animePct}%`,
                'Max J@40': `${baseMetrics.maxJ40} (${baseMetrics.maxSibling || 'nessuno'})`
            }
        ];
        printAsciiTable(`Misurazione Baseline — ${gt.preset.id}`, displayRows);

        if (gt.review?.errori?.length) {
            console.log('Errori censiti nella campagna QC:');
            for (const err of gt.review.errori) {
                console.log(`  - [#${err.pos}] ${err.titolo} (${err.tipo}): ${err.nota || err.motivo}`);
            }
            console.log('');
        }

        if (opts.json) {
            console.log(JSON.stringify({ baseline: baseMetrics, review: gt.review }, null, 2));
        }
        process.exit(0);
    }

    // Costruzione del candidato
    let candQuery = { ...(gt.preset.queries?.[0] || {}) };
    let clusterResolution = null;

    if (opts.cluster) {
        clusterResolution = resolver.resolveCluster(opts.cluster);
        if (!clusterResolution) {
            console.error(`Impossibile risolvere il cluster o keyword nel grafo: "${opts.cluster}"`);
            process.exit(1);
        }
        console.log(`\nGrafo Gerarchico: Risolto "${opts.cluster}"`);
        console.log(`  Livello: ${clusterResolution.level} | ID: ${clusterResolution.clusterId} | Medoid: "${clusterResolution.medoid}"`);
        console.log(`  Catena: ${clusterResolution.hierarchyChain}`);
        console.log(`  Keyword nel cluster: ${clusterResolution.rawKeywords.join(', ')}`);
        console.log(`  Keyword mappate su TMDB: ${clusterResolution.resolvedKeywords.map(k => `${k.name} (${k.id})`).join(', ')}`);
        if (clusterResolution.unmappedKeywords.length) {
            console.log(`  Keyword non presenti nel dump: ${clusterResolution.unmappedKeywords.join(', ')}`);
        }
        candQuery.with_keywords = clusterResolution.includeString;
    } else if (opts.include) {
        const resolved = resolver.resolveList(opts.include);
        candQuery.with_keywords = resolved.length ? resolved.map(k => k.id).join('|') : opts.include;
        console.log(`Include risolte: ${resolved.map(k => `${k.name} (${k.id})`).join(', ')}`);
    }

    if (opts.exclude) {
        const resolved = resolver.resolveList(opts.exclude);
        const excStr = resolved.length ? resolved.map(k => k.id).join('|') : opts.exclude;
        const existing = candQuery.without_keywords ? String(candQuery.without_keywords) + '|' : '';
        candQuery.without_keywords = existing + excStr;
        console.log(`Exclude risolte: ${resolved.map(k => `${k.name} (${k.id})`).join(', ')}`);
    }

    const candCompiled = buildPresetFromFilters(candQuery, gt.preset.type);
    const candMetrics = await bench.evaluate(candCompiled, gt, opts.preset, opts.limit);

    const inLost = baseMetrics.inCount - candMetrics.inCount;
    const outElim = baseMetrics.outCount - candMetrics.outCount;

    const compRows = [
        {
            Configurazione: 'Promessa Attuale (Baseline)',
            Pool: baseMetrics.pool,
            'Recall @50': `${baseMetrics.recall}% (${baseMetrics.inCount})`,
            'Fuori Tema': `${baseMetrics.precisionOut}% (${baseMetrics.outCount})`,
            Sconosciuti: `${baseMetrics.unkPct}%`,
            'Mediana Voto': baseMetrics.medScore,
            'Anime/JA': `${baseMetrics.animePct}%`,
            'Max J@40': `${baseMetrics.maxJ40} (${baseMetrics.maxSibling || '-'})`
        },
        {
            Configurazione: opts.cluster ? `Cluster "${opts.cluster}" (${clusterResolution.clusterId})` : 'Candidato Specificato',
            Pool: candMetrics.pool,
            'Recall @50': `${candMetrics.recall}% (${candMetrics.inCount})`,
            'Fuori Tema': `${candMetrics.precisionOut}% (${candMetrics.outCount})`,
            Sconosciuti: `${candMetrics.unkPct}%`,
            'Mediana Voto': candMetrics.medScore,
            'Anime/JA': `${candMetrics.animePct}%`,
            'Max J@40': `${candMetrics.maxJ40} (${candMetrics.maxSibling || '-'})`
        }
    ];

    printAsciiTable(`Confronto Candidato vs Baseline — ${opts.preset}`, compRows);
    console.log(`Analisi Variazione:`);
    console.log(`  - Titoli fuori tema eliminati (beneficio): +${outElim}`);
    console.log(`  - Titoli in tema persi (costo): -${inLost}`);
    console.log(`  - Bilancio netto (beneficio - costo): ${outElim - inLost > 0 ? '+' : ''}${outElim - inLost}`);
    console.log(`  - Variazione volumetria pool: ${candMetrics.pool - baseMetrics.pool > 0 ? '+' : ''}${candMetrics.pool - baseMetrics.pool} titoli (${baseMetrics.pool} -> ${candMetrics.pool})\n`);

    if (opts.json) {
        const outObj = {
            preset: opts.preset,
            baseline: baseMetrics,
            candidate: candMetrics,
            cluster: clusterResolution,
            costBenefit: { inLost, outElim, netDelta: outElim - inLost }
        };
        if (opts.out) {
            fs.writeFileSync(path.resolve(opts.out), JSON.stringify(outObj, null, 2), 'utf8');
            console.log(`Risultato JSON salvato in ${opts.out}`);
        } else {
            console.log(JSON.stringify(outObj, null, 2));
        }
    }

    process.exit(0);
}

main().catch(err => {
    console.error('Errore esecuzione benchmark:', err);
    process.exit(1);
});
