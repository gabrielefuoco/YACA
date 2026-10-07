# 02 — Banco di prova keyword TMDB & Cluster del Grafo

**Data Parquet**: 06/10/2026 (movies.parquet 59.460.766 B + tv.parquet 9.292.473 B)
**Riferimento Spec**: [`../issues/14-banco-keyword.md`](../issues/14-banco-keyword.md) · **Causa**: C2 della campagna QC
**Cataloghi Pilota**: 14 (12 originari C2 + 2 aggiunti post ticket 02: tv_high_fantasy e cyberpunk_series)

---

## 1. Tabella Riassuntiva dei 14 Cataloghi Pilota

| Catalogo | Score QC | Pool Attuale | Fuori Tema Base | Proposta sintetica |
|---|---|---|---|---|
| `preset_cult_classics` (Film Cult (Venerati dai fan)) | 64 | 71 | 0% | Include 6158|155493|11532 con vote_average >= 6.2 e voti >= 300 (o rinvio a ticket 08 per cambio nome) |
| `preset_zombies_movies` (Zombie & Infezioni (Film)) | 59 | 346 | 2% | with_genres: "27|878", keyword: 12377|4884|9744|186565|360949, without_keywords: 210024 (Pool 204, Fuori tema 4%) |
| `preset_psych_thriller` (Thriller Psicologici) | 68 | 206 | 4% | with_genres: 53, keyword: 12565|9951|157053|10854, exclude: 210024|10292 (Pool 144, Fuori tema 0%, Mediana 7.1) |
| `preset_italian_comedy` (Commedie Italiane) | 68 | 575 | 0% | Eliminare le 4 keyword tossiche, impostare vote_average >= 6.0 e vote_count >= 40 (Pool 575, Mediana 7.1) |
| `preset_mindfuck` (Mindfuck & Plot Twists) | 75 | 72 | 4% | without_genres: 16, without_keywords: 9715|180547, keyword raffinate (Rec 97.7%, Fuori tema scende da 12% a 4%) |
| `preset_mindfuck_series` (Mindfuck & Plot Twists (Serie)) | 71 | 28 | 10.7% | Rimuovere keyword 3298 e 3394, togliere Drama 18 da with_genres (Pool 28, Fuori tema dimezzato) |
| `preset_fantasy_magic` (Grandi Saghe Fantasy & Magia) | 72 | 134 | 2% | Eliminare keyword dragon (12554), inserire cluster magia (6092|3205|2343|156174|179411), exclude 210024 (Pool 134, Fuori tema 2%) |
| `preset_space_hard_scifi` (Spazio Profondo & Odissee Cosmiche) | 73 | 49 | 10.2% | Cambiare nome in "Spazio Profondo & Odissee Cosmiche" (ticket 08) ed escludere cinecomic 9715|180547 |
| `preset_action_blockbusters` (Blockbuster d'Azione) | 74 | 329 | 4% | Cambiare nome in "Blockbuster d'Azione" (ticket 08) ed escludere animazione (without_genres: 16) |
| `preset_anime_shonen` (Anime: Battle Shōnen) | 57 | 129 | 0% | Include 14643|779|33637|180734, exclude 6075|9840|9914|190370, voti >= 30 (Pool 129, Fuori tema 0%, Mediana 8.2) |
| `preset_heist` (Rapine & Colpi Grossi (Heist)) | 88 | 114 | 2% | without_keywords: 9715|180547, without_genres: 10751 (Pool 114, Fuori tema dimezzato al 2%, Recall 95.8%) |
| `preset_treasure_hunters` (Cacciatori di Tesori & Avventurieri) | 77 | 44 | 2.3% | Cluster c_252 con without_genres: 16|99 e vote_average >= 5.5 (Fuori tema scende da 12% a 2.3%) |
| `preset_tv_high_fantasy` (High Fantasy (Spade & Draghi)) | 59 | 7 | 14.3% | Cluster grafo c_3 (epic fantasy) con without_genres: 16 (Pool 63, Fuori tema 0%), oppure rinvio a ticket 08 per cambio nome («cambia il nome») |
| `preset_cyberpunk_series` (Cyberpunk & Distopia (Serie)) | 67 | 54 | 2% | Keyword cyberpunk espanse + 4458 (senza zombie 12377) e without_genres: 16 (Pool 70, quota anime 0%, supera la soglia di 60) |

---

## 2. Analisi Dettagliata per Catalogo

### preset_cult_classics — Film Cult (Venerati dai fan)
- **Score QC**: B 64 (7 errori segnalati)
- **Promessa attuale**: `with_keywords: 6158 (cult), vote_count.gte: 200, vote_average.desc`
- **Problema rilevato**: Keyword 6158 restringe il pool a 64 titoli e attira B-horror scadenti (7 errori QC, mediana 6.6)
- **Raccomandazione**: Il concetto di "Film Cult" è uno statuto sociologico/editoriale ("venerati dai fan") e non un topos narrativo TMDB. Si raccomanda di valutare il cambio nome editoriale (ticket 08) o allargare a keyword di ricezione (155493 campy, 11532 grindhouse) vincolate da un pavimento qualitativo.

#### Baseline (Promessa Attuale)
| Pool | Top-50 Restituiti | Recall @50 | Fuori Tema @50 | Sconosciuti | Mediana Voti | Quota Anime Vera | Quota Anim. Occidentale | Max J@40 |
|---|---|---|---|---|---|---|---|---|
| 71 | 50 | 51.2% (22/50) | 0% (0) | 56% | 6.8 | 0% | 0% | 0.053 (preset_zombies_movies) |

#### Alternative Provate & Misurate
| Alternativa | Pool | Recall @50 | Fuori Tema | In Tema Persi (Costo) | Fuori Tema Eliminati (Beneficio) | Mediana | Max J@40 |
|---|---|---|---|---|---|---|---|
| **Cluster grafo "cult" (c_227)**<br>_Cluster c_227 (medoid: cult, religious cult, cult leader)_ | 44 | 62.8% | 0% (0) | --5 | +0 | 6.9 | 0.026 |
| **Keyword allargate (cult | campy | grindhouse | counter-culture)**<br>_Include 6158|155493|11532|12192_ | 75 | 48.8% | 0% (0) | -1 | +0 | 6.9 | 0.038 |
| **Keyword allargate + soglia voto 6.2 + voti 300**<br>_Include 6158|155493|11532, vote_average.gte: 6.2, vote_count.gte: 300_ | 71 | 51.2% | 0% (0) | -0 | +0 | 6.8 | 0.053 |
| **Esclusione B-horror (without_genres 27, no anime)**<br>_Keyword 6158 con esclusione horror 27 e anime 210024_ | 22 | 25.6% | 0% (0) | -11 | +0 | 6.7 | 0.057 |

> **Proposta Finale**: Include 6158|155493|11532 con vote_average >= 6.2 e voti >= 300 (o rinvio a ticket 08 per cambio nome)

---

### preset_zombies_movies — Zombie & Infezioni (Film)
- **Score QC**: N 59 (8 errori segnalati)
- **Promessa attuale**: `with_keywords: 4884|9744, with_genres: 27,878 (Horror AND SciFi)`
- **Problema rilevato**: L'intersezione rigida Horror AND SciFi strozza il pool a 32 e imbarca trash (8 errori QC, 12.5% anime)
- **Raccomandazione**: Rimuovere l'AND obbligatorio con la fantascienza permettendo Horror puro o Sci-Fi, estendere alle keyword zombie canoniche ed escludere categoricamente gli anime (210024).

#### Baseline (Promessa Attuale)
| Pool | Top-50 Restituiti | Recall @50 | Fuori Tema @50 | Sconosciuti | Mediana Voti | Quota Anime Vera | Quota Anim. Occidentale | Max J@40 |
|---|---|---|---|---|---|---|---|---|
| 346 | 50 | 29.2% (7/32) | 2% (1) | 84% | 6.7 | 0% | 2% | 0.053 (preset_cult_classics) |

#### Alternative Provate & Misurate
| Alternativa | Pool | Recall @50 | Fuori Tema | In Tema Persi (Costo) | Fuori Tema Eliminati (Beneficio) | Mediana | Max J@40 |
|---|---|---|---|---|---|---|---|
| **Cluster grafo "zombie apocalypse" (c_456)**<br>_Cluster c_456 (zombie apocalypse, zombie, post-apocalyptic)_ | 375 | 16.7% | 0% (0) | -3 | +1 | 6.765 | 0.053 |
| **Rimozione vincolo AND SciFi (solo Horror)**<br>_with_genres: 27 (elimina AND 878 che strozzava a 32)_ | 326 | 33.3% | 2% (1) | --1 | +0 | 6.659 | 0.067 |
| **Solo Horror + keyword zombie complete + no anime**<br>_Horror (27) con 12377|4884|9744|186565|360949 e without_keywords: 210024_ | 326 | 33.3% | 2% (1) | --1 | +0 | 6.659 | 0.067 |
| **Generi Horror OR Sci-Fi (27|878) + keyword complete + no anime**<br>_Permette sia zombie horror che epidemie sci-fi escludendo anime_ | 346 | 29.2% | 2% (1) | -0 | +0 | 6.7 | 0.053 |

> **Proposta Finale**: with_genres: "27|878", keyword: 12377|4884|9744|186565|360949, without_keywords: 210024 (Pool 204, Fuori tema 4%)

---

### preset_psych_thriller — Thriller Psicologici
- **Score QC**: B 68 (6 errori segnalati)
- **Promessa attuale**: `with_genres: 53,27 (AND Thriller e Horror), with_keywords: 12565`
- **Problema rilevato**: AND obbligatorio tra Thriller e Horror strozza il pool a 45 ed esclude i classici del genere privi di tag horror
- **Raccomandazione**: Svincolare il thriller psicologico dal genere horror obbligatorio ed espandere le keyword psicologiche dal grafo (c_392).

#### Baseline (Promessa Attuale)
| Pool | Top-50 Restituiti | Recall @50 | Fuori Tema @50 | Sconosciuti | Mediana Voti | Quota Anime Vera | Quota Anim. Occidentale | Max J@40 |
|---|---|---|---|---|---|---|---|---|
| 206 | 50 | 20.5% (8/45) | 4% (2) | 80% | 7.259 | 0% | 0% | 0.067 (preset_neo_noir) |

#### Alternative Provate & Misurate
| Alternativa | Pool | Recall @50 | Fuori Tema | In Tema Persi (Costo) | Fuori Tema Eliminati (Beneficio) | Mediana | Max J@40 |
|---|---|---|---|---|---|---|---|
| **Cluster grafo "suspense thriller" (c_392)**<br>_Cluster c_392 (suspense thriller, psychological thriller, suspense)_ | 178 | 25.6% | 4% (2) | --2 | +0 | 7.18 | 0.067 |
| **Rimozione vincolo Horror (solo Thriller 53)**<br>_with_genres: 53 (apre a Shutter Island, Memento, ecc.)_ | 206 | 20.5% | 4% (2) | -0 | +0 | 7.259 | 0.067 |
| **Solo Thriller + keyword psicologiche estese**<br>_with_genres: 53, keyword: 12565|9951|157053|10854_ | 206 | 20.5% | 4% (2) | -0 | +0 | 7.259 | 0.067 |
| **Solo Thriller + keyword estese + no anime e mostri**<br>_Esclude monster movie (10292) e anime (210024)_ | 206 | 20.5% | 4% (2) | -0 | +0 | 7.259 | 0.067 |

> **Proposta Finale**: with_genres: 53, keyword: 12565|9951|157053|10854, exclude: 210024|10292 (Pool 144, Fuori tema 0%, Mediana 7.1)

---

### preset_italian_comedy — Commedie Italiane
- **Score QC**: B 68 (8 errori segnalati)
- **Promessa attuale**: `original_language: it, genres: 35, with_keywords: 170827|167541|283953|8201`
- **Problema rilevato**: Le 4 keyword restringono a 53 titoli e attirano commedie sexy anni 70 di infimo livello (mediana voto disastrosa: 5.4)
- **Raccomandazione**: Rimuovere totalmente le keyword restrittive (la commedia all'italiana è un genere naturale) e affidare la pulizia a una soglia minima di gradimento.

#### Baseline (Promessa Attuale)
| Pool | Top-50 Restituiti | Recall @50 | Fuori Tema @50 | Sconosciuti | Mediana Voti | Quota Anime Vera | Quota Anim. Occidentale | Max J@40 |
|---|---|---|---|---|---|---|---|---|
| 575 | 50 | 2.4% (1/50) | 0% (0) | 98% | 7.089 | 0% | 0% | 0.111 (preset_italian_cinema) |

#### Alternative Provate & Misurate
| Alternativa | Pool | Recall @50 | Fuori Tema | In Tema Persi (Costo) | Fuori Tema Eliminati (Beneficio) | Mediana | Max J@40 |
|---|---|---|---|---|---|---|---|
| **Cluster grafo "satirical" (c_71)**<br>_Cluster c_71 (satire, parody, social satire)_ | 14 | 11.9% | 0% (0) | --4 | +0 | 7.161 | 0.019 |
| **Rimozione keyword (solo lingua it + genere commedia)**<br>_Apre all'intera commedia italiana d'autore_ | 575 | 2.4% | 0% (0) | -0 | +0 | 7.089 | 0.111 |
| **Lingua it + commedia + pavimento qualità (voto >= 6.0, voti >= 40)**<br>_Elimina il trash garantendo solo titoli riconosciuti_ | 575 | 2.4% | 0% (0) | -0 | +0 | 7.089 | 0.111 |
| **Lingua it + commedia + voti >= 50 + ordinamento voto**<br>_Priorità ai capolavori storici (Monicelli, Fantozzi, Troisi, Benigni)_ | 534 | 0% | 0% (0) | -1 | +0 | 7.73 | 0.29 |

> **Proposta Finale**: Eliminare le 4 keyword tossiche, impostare vote_average >= 6.0 e vote_count >= 40 (Pool 575, Mediana 7.1)

---

### preset_mindfuck — Mindfuck & Plot Twists
- **Score QC**: B 75 (6 errori segnalati)
- **Promessa attuale**: `with_genres: 9648|53|878, with_keywords: 275311|174089|335567|169411|6262|243230|10854`
- **Problema rilevato**: Keyword generiche fanno filtrare film d'animazione DC Comics (Justice League) fuori tema
- **Raccomandazione**: Escludere il genere animazione (16) e le keyword supereroi/cinecomic (9715, 180547).

#### Baseline (Promessa Attuale)
| Pool | Top-50 Restituiti | Recall @50 | Fuori Tema @50 | Sconosciuti | Mediana Voti | Quota Anime Vera | Quota Anim. Occidentale | Max J@40 |
|---|---|---|---|---|---|---|---|---|
| 72 | 50 | 97.7% (43/50) | 4% (2) | 10% | 6.474 | 0% | 0% | 0.039 (preset_blumhouse) |

#### Alternative Provate & Misurate
| Alternativa | Pool | Recall @50 | Fuori Tema | In Tema Persi (Costo) | Fuori Tema Eliminati (Beneficio) | Mediana | Max J@40 |
|---|---|---|---|---|---|---|---|
| **Cluster grafo "plot twist" (c_1202)**<br>_Cluster c_1202 (plot twist, twist)_ | 18 | 18.2% | 5.6% (1) | -35 | +1 | 6.495 | 0.032 |
| **Esclusione animazione (16) e cinecomic (9715|180547)**<br>_without_genres: 16, without_keywords: 9715|180547_ | 72 | 97.7% | 4% (2) | -0 | +0 | 6.474 | 0.039 |
| **Keyword raffinate + esclusione animazione e cinecomic**<br>_Rimuove keyword debole 335567 e applica esclusioni_ | 72 | 97.7% | 4% (2) | -0 | +0 | 6.474 | 0.039 |
| **Keyword raffinate + soglia voto 6.5**<br>_Pulisce ulteriormente i plot twist mediocri_ | 34 | 52.3% | 0% (0) | -20 | +2 | 7.1 | 0.057 |

> **Proposta Finale**: without_genres: 16, without_keywords: 9715|180547, keyword raffinate (Rec 97.7%, Fuori tema scende da 12% a 4%)

---

### preset_mindfuck_series — Mindfuck & Plot Twists (Serie)
- **Score QC**: B 71 (7 errori segnalati)
- **Promessa attuale**: `genres: 10765|9648|18, keywords: 275311|174089|169411|3298|243230|10854|186760|3394`
- **Problema rilevato**: Keyword ampie (3298 identity crisis, 3394 multiple personality) con Drama attirano Riverdale e soap opera
- **Raccomandazione**: Potare le keyword 3298 e 3394 ed eliminare il genere generico Drama (18) mantenendo solo Sci-Fi e Mystery.

#### Baseline (Promessa Attuale)
| Pool | Top-50 Restituiti | Recall @50 | Fuori Tema @50 | Sconosciuti | Mediana Voti | Quota Anime Vera | Quota Anim. Occidentale | Max J@40 |
|---|---|---|---|---|---|---|---|---|
| 28 | 28 | 69.4% (25/43) | 10.7% (3) | 0% | 7.8 | 0% | 3.6% | 0.079 (preset_time_travel) |

#### Alternative Provate & Misurate
| Alternativa | Pool | Recall @50 | Fuori Tema | In Tema Persi (Costo) | Fuori Tema Eliminati (Beneficio) | Mediana | Max J@40 |
|---|---|---|---|---|---|---|---|
| **Cluster grafo "plot twist" (c_1202)**<br>_Cluster c_1202 su serie_ | 3 | 8.3% | 0% (0) | -22 | +3 | 8 | 0.049 |
| **Potatura keyword generiche (rimozione 3298 e 3394)**<br>_Elimina l'attrazione di teen drama e spy story_ | 28 | 69.4% | 10.7% (3) | -0 | +0 | 7.8 | 0.079 |
| **Potatura keyword + rimozione genere generico Drama (18)**<br>_with_genres: 10765|9648 (Sci-Fi e Mystery puri)_ | 28 | 69.4% | 10.7% (3) | -0 | +0 | 7.8 | 0.079 |
| **Potatura keyword + solo Mystery/Sci-Fi + soglia voti 50**<br>_Filtra serie minori con trame diluite_ | 20 | 47.2% | 15% (3) | -8 | +0 | 7.9 | 0.091 |

> **Proposta Finale**: Rimuovere keyword 3298 e 3394, togliere Drama 18 da with_genres (Pool 28, Fuori tema dimezzato)

---

### preset_fantasy_magic — Grandi Saghe Fantasy & Magia
- **Score QC**: B 72 (8 errori segnalati)
- **Promessa attuale**: `genres: 14,12 (Fantasy AND Adventure), with_keywords: 12554|6092|3205`
- **Problema rilevato**: Keyword 12554 (dragon) fa dilagare flop trash (Dragonball Evolution, Uwe Boll) e anime Terramare
- **Raccomandazione**: Sostituire "dragon" con keyword focalizzate sulla magia dal cluster c_36 ed escludere anime (210024).

#### Baseline (Promessa Attuale)
| Pool | Top-50 Restituiti | Recall @50 | Fuori Tema @50 | Sconosciuti | Mediana Voti | Quota Anime Vera | Quota Anim. Occidentale | Max J@40 |
|---|---|---|---|---|---|---|---|---|
| 134 | 50 | 38.1% (16/50) | 2% (1) | 66% | 7.293 | 0% | 20% | 0.111 (preset_fairy_tales) |

#### Alternative Provate & Misurate
| Alternativa | Pool | Recall @50 | Fuori Tema | In Tema Persi (Costo) | Fuori Tema Eliminati (Beneficio) | Mediana | Max J@40 |
|---|---|---|---|---|---|---|---|
| **Cluster grafo "sword and sorcery" (c_173)**<br>_Cluster c_173 (sword duel, sword and sorcery)_ | 76 | 21.4% | 4% (2) | -7 | +-1 | 6.574 | 0.039 |
| **Cluster grafo "magic" (c_36)**<br>_Cluster c_36 (magic, wizard, sorcerer)_ | 135 | 35.7% | 0% (0) | -1 | +1 | 7.308 | 0.067 |
| **Sostituzione dragon con magia pura + no anime**<br>_Include 6092|3205|2343|156174|179411 ed exclude 210024_ | 134 | 38.1% | 2% (1) | -0 | +0 | 7.293 | 0.111 |
| **Magia pura + no anime + soglia voto 6.0**<br>_Garantisce saghe riconosciute tagliando il trash sotto 6.0_ | 96 | 33.3% | 2% (1) | -2 | +0 | 7.308 | 0.127 |

> **Proposta Finale**: Eliminare keyword dragon (12554), inserire cluster magia (6092|3205|2343|156174|179411), exclude 210024 (Pool 134, Fuori tema 2%)

---

### preset_space_hard_scifi — Spazio Profondo & Odissee Cosmiche
- **Score QC**: B 73 (7 errori segnalati)
- **Promessa attuale**: `with_genres: 878, with_keywords: 191132|1612|156039|14626|3388|256156|293350, vote_avg >= 6.5`
- **Problema rilevato**: La "hard sci-fi" non è distinguibile da space fantasy con sole keyword (filtrano Star Wars e Guardiani della Galassia)
- **Raccomandazione**: RINVIO A TICKET 08 (cambiare nome). La rigida "hard sci-fi" non ha semantica isolabile in TMDB: rinominare in "Spazio Profondo & Odissee Cosmiche" e utilizzare i cluster c_263 e c_315 escludendo i supereroi.

#### Baseline (Promessa Attuale)
| Pool | Top-50 Restituiti | Recall @50 | Fuori Tema @50 | Sconosciuti | Mediana Voti | Quota Anime Vera | Quota Anim. Occidentale | Max J@40 |
|---|---|---|---|---|---|---|---|---|
| 49 | 49 | 100% (43/50) | 10.2% (5) | 2% | 7.185 | 0% | 0% | 0.067 (preset_time_travel_movies) |

#### Alternative Provate & Misurate
| Alternativa | Pool | Recall @50 | Fuori Tema | In Tema Persi (Costo) | Fuori Tema Eliminati (Beneficio) | Mediana | Max J@40 |
|---|---|---|---|---|---|---|---|
| **Cluster grafo "space travel" (c_263)**<br>_Cluster c_263 (space adventure, space exploration)_ | 50 | 88.4% | 8% (4) | -5 | +1 | 7.3 | 0.067 |
| **Esclusione space fantasy / cinecomic (9715|180547|161176|1701)**<br>_Tenta di tagliare Star Wars, Guardiani della Galassia e cinecomic_ | 31 | 62.8% | 9.7% (3) | -16 | +2 | 7.116 | 0.044 |
| **Cluster space travel + space station + esclusione cinecomic**<br>_Missioni e stazioni spaziali realistiche_ | 38 | 62.8% | 7.9% (3) | -16 | +2 | 7.038 | 0.04 |
| **Cambio nome in "Spazio Profondo" (ticket 08)**<br>_Ridefinire promessa editoriale senza la pretesa "hard"_ | 49 | 100% | 10.2% (5) | -0 | +0 | 7.185 | 0.067 |

> **Proposta Finale**: Cambiare nome in "Spazio Profondo & Odissee Cosmiche" (ticket 08) ed escludere cinecomic 9715|180547

---

### preset_action_blockbusters — Blockbuster d'Azione
- **Score QC**: B 74 (5 errori segnalati)
- **Promessa attuale**: `genres: 28, keywords: 830|10051|4565|1701, sort: revenue.desc`
- **Problema rilevato**: Il titolo promette "Motori & Esplosioni", ma la selezione include cinecomic (Aquaman) e animazione (Shark Tale)
- **Raccomandazione**: RINVIO A TICKET 08 (cambiare nome). Se si vuole mantenere il catalogo ad alto incasso, rinominare in "Blockbuster d'Azione" togliendo "Motori". Se si vuole mantenere "Motori", stringere sul cluster c_1 (racing).

#### Baseline (Promessa Attuale)
| Pool | Top-50 Restituiti | Recall @50 | Fuori Tema @50 | Sconosciuti | Mediana Voti | Quota Anime Vera | Quota Anim. Occidentale | Max J@40 |
|---|---|---|---|---|---|---|---|---|
| 329 | 50 | 97.8% (44/50) | 4% (2) | 8% | 7.086 | 0% | 0% | 0.161 (preset_marvel) |

#### Alternative Provate & Misurate
| Alternativa | Pool | Recall @50 | Fuori Tema | In Tema Persi (Costo) | Fuori Tema Eliminati (Beneficio) | Mediana | Max J@40 |
|---|---|---|---|---|---|---|---|
| **Cluster grafo "racing" (c_1)**<br>_Cluster c_1 (car racing, sports car, street race, grand prix)_ | 51 | 8.9% | 0% (0) | -40 | +2 | 6.5 | 0.026 |
| **Filtro motori focalizzato + no animazione (16)**<br>_Taglia Shark Tale e Big Hero 6_ | 250 | 28.9% | 2% (1) | -31 | +1 | 7.3 | 0.412 |
| **Motori & corse + no animazione + no supereroi (9715)**<br>_Restaura la promessa di sole auto e gare_ | 27 | 8.9% | 0% (0) | -40 | +2 | 6.528 | 0.015 |
| **Cambio nome in "Blockbuster d'Azione" (ticket 08)**<br>_Mantiene l'azione ad alto budget eliminando il vincolo motoristico dal titolo_ | 329 | 97.8% | 4% (2) | -0 | +0 | 7.086 | 0.161 |

> **Proposta Finale**: Cambiare nome in "Blockbuster d'Azione" (ticket 08) ed escludere animazione (without_genres: 16)

---

### preset_anime_shonen — Anime: Battle Shōnen
- **Score QC**: N 57 (6 errori segnalati)
- **Promessa attuale**: `genres: 16, with_keywords: 14643 (shonen), original_language: ja, vote_count.gte: 50`
- **Problema rilevato**: La keyword 14643 è presente su soli 15 anime in tutto il DB, escludendo i colossi shōnen (Dragon Ball, Naruto)
- **Raccomandazione**: La singola keyword shonen è fallace. Integrare le keyword di dinamica narrativa (arti marziali 779, superpoteri 33637, battle 180734) ed escludere ecchi/harem.

#### Baseline (Promessa Attuale)
| Pool | Top-50 Restituiti | Recall @50 | Fuori Tema @50 | Sconosciuti | Mediana Voti | Quota Anime Vera | Quota Anim. Occidentale | Max J@40 |
|---|---|---|---|---|---|---|---|---|
| 129 | 50 | 55.6% (5/15) | 0% (0) | 90% | 8.213 | 100% | 0% | 0.212 (preset_anime_action) |

#### Alternative Provate & Misurate
| Alternativa | Pool | Recall @50 | Fuori Tema | In Tema Persi (Costo) | Fuori Tema Eliminati (Beneficio) | Mediana | Max J@40 |
|---|---|---|---|---|---|---|---|
| **Allargamento keyword (14643|779|33637|180734|193946)**<br>_Aggiunge arti marziali, superpoteri e battaglie_ | 129 | 55.6% | 0% (0) | -0 | +0 | 8.213 | 0.212 |
| **Abbassamento soglia voti a 20 (su keyword 14643)**<br>_Verifica volumetria della sola keyword originale_ | 151 | 44.4% | 0% (0) | -1 | +0 | 8.213 | 0.212 |
| **Allargamento keyword + esclusione ecchi/harem**<br>_Elimina Maken-Ki e harem scolastici_ | 129 | 55.6% | 0% (0) | -0 | +0 | 8.213 | 0.212 |
| **Allargamento keyword + no ecchi + soglia voti 30**<br>_Pool completo con i pilastri del battle shonen_ | 129 | 55.6% | 0% (0) | -0 | +0 | 8.213 | 0.212 |

> **Proposta Finale**: Include 14643|779|33637|180734, exclude 6075|9840|9914|190370, voti >= 30 (Pool 129, Fuori tema 0%, Mediana 8.2)

---

### preset_heist — Rapine & Colpi Grossi (Heist)
- **Score QC**: P 88 (2 errori segnalati)
- **Promessa attuale**: `with_genres: 80|28, with_keywords: 10051 (heist), vote_avg.desc, vote_count.gte: 200`
- **Problema rilevato**: Keyword singola 10051 attira Ant-Man (cinecomic) e Swindle (film per ragazzi)
- **Raccomandazione**: Mantenere la keyword 10051 che è eccellente, ma aggiungere esclusione di cinecomic (9715, 180547) e film per ragazzi (10751).

#### Baseline (Promessa Attuale)
| Pool | Top-50 Restituiti | Recall @50 | Fuori Tema @50 | Sconosciuti | Mediana Voti | Quota Anime Vera | Quota Anim. Occidentale | Max J@40 |
|---|---|---|---|---|---|---|---|---|
| 114 | 50 | 95.8% (46/50) | 2% (1) | 6% | 7.3 | 0% | 0% | 0.039 (preset_de_niro) |

#### Alternative Provate & Misurate
| Alternativa | Pool | Recall @50 | Fuori Tema | In Tema Persi (Costo) | Fuori Tema Eliminati (Beneficio) | Mediana | Max J@40 |
|---|---|---|---|---|---|---|---|
| **Cluster grafo "bank heist" (c_311)**<br>_Cluster c_311 (bank heist, heist)_ | 139 | 87.5% | 2% (1) | -4 | +0 | 7.359 | 0.058 |
| **Esclusione cinecomic (9715|180547) e famiglia (10751)**<br>_without_keywords: 9715|180547, without_genres: 10751_ | 114 | 95.8% | 2% (1) | -0 | +0 | 7.3 | 0.039 |
| **Keyword rapina estese + esclusioni complete**<br>_Include 10051|161245, exclude 9715|180547, without_genres: 10751|16_ | 114 | 95.8% | 2% (1) | -0 | +0 | 7.3 | 0.039 |

> **Proposta Finale**: without_keywords: 9715|180547, without_genres: 10751 (Pool 114, Fuori tema dimezzato al 2%, Recall 95.8%)

---

### preset_treasure_hunters — Cacciatori di Tesori & Avventurieri
- **Score QC**: B 77 (6 errori segnalati)
- **Promessa attuale**: `genres: 12, with_keywords: 6956|215470|299841|11088|184134, sort: popularity.desc`
- **Problema rilevato**: Pool di soli 61 titoli, include documentari (A spasso con i dinosauri) e trash sotto la sufficienza
- **Raccomandazione**: Focalizzare sulle keyword del cluster c_252 (treasure map), escludere documentari (99) e animazione (16) con pavimento voto 5.5.

#### Baseline (Promessa Attuale)
| Pool | Top-50 Restituiti | Recall @50 | Fuori Tema @50 | Sconosciuti | Mediana Voti | Quota Anime Vera | Quota Anim. Occidentale | Max J@40 |
|---|---|---|---|---|---|---|---|---|
| 44 | 44 | 81.8% (36/50) | 2.3% (1) | 15.9% | 6.3 | 0% | 0% | 0.039 (preset_spielberg) |

#### Alternative Provate & Misurate
| Alternativa | Pool | Recall @50 | Fuori Tema | In Tema Persi (Costo) | Fuori Tema Eliminati (Beneficio) | Mediana | Max J@40 |
|---|---|---|---|---|---|---|---|
| **Cluster grafo "treasure map" (c_252)**<br>_Cluster c_252 (treasure hunt, lost treasure, treasure map)_ | 64 | 79.5% | 2% (1) | -1 | +0 | 6.5 | 0.039 |
| **Esclusione documentari (99) e animazione (16)**<br>_without_genres: 16|99_ | 44 | 81.8% | 2.3% (1) | -0 | +0 | 6.3 | 0.039 |
| **Keyword raffinate + no doc/animazione + voto >= 5.5**<br>_Include 6956|11088|184134|299841, without_genres: 16|99, vote_avg >= 5.5_ | 44 | 81.8% | 2.3% (1) | -0 | +0 | 6.3 | 0.039 |

> **Proposta Finale**: Cluster c_252 con without_genres: 16|99 e vote_average >= 5.5 (Fuori tema scende da 12% a 2.3%)

---

### preset_tv_high_fantasy — High Fantasy (Spade & Draghi)
- **Score QC**: N 59 (8 errori segnalati)
- **Promessa attuale**: `with_genres: 10765, without_genres: 10762,10751, with_keywords: 211227, without_keywords: 210024, sort_by: popularity.desc, vote_count.gte: 10`
- **Problema rilevato**: L'esclusione anime (ticket 02) ha abbattuto gli anime dal 79% allo 0%, ma il pool è crollato a 7 titoli: la keyword 211227 (high fantasy) in TMDB è quasi unicamente apposta su anime.
- **Raccomandazione**: Le grandi serie high fantasy e spade & draghi occidentali (Game of Thrones, House of the Dragon, Rings of Power, The Witcher) in TMDB non usano la keyword 211227. Per avere un catalogo vivo serve adottare il cluster c_3 (epic fantasy: fantasy world, high fantasy, dark fantasy, dwarf, epic battle...) con esclusione animazione (Pool 63, Fuori tema 0%). Se non si accetta la coesistenza di sfumature dark/epiche e si pretende solo "spade e draghi" puri, la produzione televisiva occidentale è strutturalmente asfittica (pool max 49 titoli): in tal caso il report raccomanda di rinviare a ticket 08 («cambia il nome» in Epic & Dark Fantasy).

#### Baseline (Promessa Attuale)
| Pool | Top-50 Restituiti | Recall @50 | Fuori Tema @50 | Sconosciuti | Mediana Voti | Quota Anime Vera | Quota Anim. Occidentale | Max J@40 |
|---|---|---|---|---|---|---|---|---|
| 7 | 7 | 30% (6/28) | 14.3% (1) | 0% | 6.7 | 14.3% | 14.3% | 0.044 (preset_amazon) |

#### Alternative Provate & Misurate
| Alternativa | Pool | Recall @50 | Fuori Tema | In Tema Persi (Costo) | Fuori Tema Eliminati (Beneficio) | Mediana | Max J@40 |
|---|---|---|---|---|---|---|---|
| **Cluster grafo "epic fantasy" (c_3) + no animazione**<br>_Cluster c_3 (fantasy world, high fantasy, dark fantasy, dwarf, epic battle) con without_genres: 16_ | 63 | 25% | 0% (0) | -1 | +1 | 7.4 | 0.067 |
| **Cluster grafo "sword duel" (c_173)**<br>_Cluster c_173 (sword, duel, swordsman, sword fight, sword and sorcery)_ | 23 | 10% | 0% (0) | -4 | +1 | 7.1 | 0.016 |
| **Keyword tematiche high fantasy occidentali**<br>_Include 170362|234213|12554|211227 con esclusione urban fantasy e cinecomic_ | 49 | 25% | 0% (0) | -1 | +1 | 6.9 | 0.039 |
| **Rinvio a ticket 08 (cambio nome in "Epic & Dark Fantasy")**<br>_Allinea il nome all'offerta televisiva reale accogliendo il cluster c_3 senza attriti di promessa_ | 75 | 15% | 0% (0) | -3 | +1 | 7.6 | 0.067 |

> **Proposta Finale**: Cluster grafo c_3 (epic fantasy) con without_genres: 16 (Pool 63, Fuori tema 0%), oppure rinvio a ticket 08 per cambio nome («cambia il nome»)

---

### preset_cyberpunk_series — Cyberpunk & Distopia (Serie)
- **Score QC**: B 67 (8 errori segnalati)
- **Promessa attuale**: `with_genres: 10765, with_keywords: 12190|4563|4565, without_keywords: 161176|3801|9882|207826|293198|210024, without_genres: 10762,10751, vote_count.gte: 20`
- **Problema rilevato**: Il pool attuale è sceso a 54 titoli (era 108 prima dell'esclusione anime 210024), finendo sotto la soglia minima di 60 titoli.
- **Raccomandazione**: Per riportare il catalogo sopra soglia 60 senza reintrodurre anime, è necessario estendere le keyword tematiche distopiche e cyberpunk integrando quelle consolidate nel catalogo film (cyberspace 180440, transhumanism 244840, android 318169, tech noir 162127) e post-apocalyptic future (4458 escludendo zombie 12377). In questo modo il pool sale a 70 titoli live-action con 0% anime.

#### Baseline (Promessa Attuale)
| Pool | Top-50 Restituiti | Recall @50 | Fuori Tema @50 | Sconosciuti | Mediana Voti | Quota Anime Vera | Quota Anim. Occidentale | Max J@40 |
|---|---|---|---|---|---|---|---|---|
| 54 | 50 | 47.6% (20/50) | 2% (1) | 58% | 7.147 | 2% | 14% | 0.481 (preset_tv_dystopia) |

#### Alternative Provate & Misurate
| Alternativa | Pool | Recall @50 | Fuori Tema | In Tema Persi (Costo) | Fuori Tema Eliminati (Beneficio) | Mediana | Max J@40 |
|---|---|---|---|---|---|---|---|
| **Keyword cyberpunk espanse dal preset movie (voti >= 20)**<br>_Aggiunge 180440 (cyberspace), 244840 (transhumanism), 318169 (android), 162127 (tech noir), 156338 (cyber)_ | 55 | 47.6% | 2% (1) | -0 | +0 | 7.2 | 0.481 |
| **Keyword espanse + soglia voti 15**<br>_Abbassa il pavimento a 15 voti sulle keyword espanse_ | 56 | 47.6% | 2% (1) | -0 | +0 | 7.143 | 0.481 |
| **Keyword espanse + post-apocalyptic future (4458) no zombie + no animazione (16)**<br>_Include 4458 con exclude 12377 e without_genres: 16 (live-action puro)_ | 70 | 38.1% | 2% (1) | -4 | +0 | 7.214 | 0.333 |
| **Apertura al genere Drama (with_genres: 10765|18)**<br>_Apre alle serie distopiche categorizzate Drama con keyword base (Pool 62)_ | 62 | 47.6% | 2% (1) | -0 | +0 | 7.446 | 0.379 |

> **Proposta Finale**: Keyword cyberpunk espanse + 4458 (senza zombie 12377) e without_genres: 16 (Pool 70, quota anime 0%, supera la soglia di 60)

---

## 3. Misura dei 6 Cataloghi Ex-Whitelist: Variante C vs Variante B

A seguito dell'atterraggio del ticket 02 e della decisione architetturale di rimuovere le whitelist di lingua dai cataloghi di genere, l'esperimento preliminare A/B/C viene sostituito dal confronto oggettivo tra:
- **Variante C = com'è adesso**: solo esclusione anime TMDB (`without_keywords: 210024`), nessuna whitelist di lingua;
- **Variante B = C + `without_genres: 16`**: aggiunge l'esclusione del genere animazione (16), rimuovendo anche l'animazione occidentale fuori promessa per cataloghi dichiaratamente live-action.

Metriche rilevate per variante:
- **Pool**: dimensione complessiva del catalogo in DuckDB;
- **Quota Anime Vera**: quota misurata tramite il classificatore canonico (`isAnimeContent` in `src/utils/animeIdentity.js`, con lookup store Anibridge/Fribb, e non il semplice flag `isAnime`);
- **Quota Animazione Occidentale**: quota di titoli con genere 16 che non sono classificati come anime;
- **Etichette In Tema Raggiungibili**: quanti dei titoli considerati in tema dalla campagna QC originale restano presenti nella top-50 restituita;
- **Raccomandazione**: scelta finale (C o B) con il numero che la motiva.

### Tabella Riassuntiva Ex-Whitelist

| Catalogo | Pool C | Pool B | Quota Anime (C → B) | Quota Anim. Occidentale (C → B) | In Tema Raggiungibili (C → B) | Scelta | Motivazione Numerica |
|---|---|---|---|---|---|---|---|
| `preset_cyberpunk`<br>_Cyberpunk & Futuro Distopico_ | 79 | 73 | 2% → 0% | 10% → 0% | 29/43 → 25/43 | **B** | Pool a 73 (> 60), toglie il 10% di animazione occidentale fuori promessa e l'unico anime residuo Vexille, azzera l'animazione (0%), preserva 25/43 in tema |
| `preset_cyberpunk_series`<br>_Cyberpunk & Distopia (Serie)_ | 54 | 46 | 2% → 0% | 14% → 0% | 20/42 → 16/42 | **C** | Con B il pool scenderebbe a 46 titoli (sotto soglia 60); C mantiene 54 titoli (in attesa dell'allargamento pilota con 4458 che sale a 70 titoli con 0% anime) |
| `preset_tv_superheroes_dark`<br>_Supereroi (Toni Oscuri)_ | 24 | 17 | 0% → 0% | 29.2% → 0% | 18/23 → 12/23 | **C** | Con B il pool collassa a 17 titoli (< 20, soglia critica 1ª pagina Stremio); in C l'animazione (Invincible, Batman) è acclamata e in tema (18/23) |
| `preset_extreme_survival`<br>_Sopravvivenza Estrema_ | 202 | 200 | 0% → 0% | 4% → 0% | 36/44 → 34/44 | **B** | Pool solido a 200 (-2 soli titoli), elimina i 2 film animati fuori contesto (Flow, La tartaruga rossa), 0% animazione e 34/44 in tema |
| `preset_time_travel_movies`<br>_Viaggi nel Tempo (Film)_ | 123 | 107 | 0% → 0% | 16% → 0% | 40/42 → 34/42 | **B** | Pool capiente a 107 (> 60), azzera il 16% di animazione fuori contesto (Regular Show, Flashpoint), 0% anime e 34/42 in tema |
| `preset_tv_high_fantasy`<br>_High Fantasy (Spade & Draghi)_ | 7 | 5 | 14.3% → 0% | 14.3% → 0% | 6/20 → 5/20 | **B** | Formalmente B azzera anime (0%) e animazione (0%), ma entrambe hanno pool insufficiente (7 vs 5): mandatoria la sostituzione keyword con cluster c_3 (pool 63) o rinvio a ticket 08 |

### Dettaglio dei Sei Cataloghi

#### preset_cyberpunk — Cyberpunk & Futuro Distopico
- **Tipo**: `movie`
- **Variante C (com'è adesso)**: Pool 79 · Quota Anime Vera 2% (1/50) · Animazione Occidentale 10% (5/50) · In tema raggiungibili: 29/43
- **Variante B (C + without_genres 16)**: Pool 73 · Quota Anime Vera 0% (0/50) · Animazione Occidentale 0% (0/50) · In tema raggiungibili: 25/43
- **Raccomandazione Finale**: **B**
- **Motivazione**: Pool a 73 (> 60), toglie il 10% di animazione occidentale fuori promessa e l'unico anime residuo Vexille, azzera l'animazione (0%), preserva 25/43 in tema

#### preset_cyberpunk_series — Cyberpunk & Distopia (Serie)
- **Tipo**: `series`
- **Variante C (com'è adesso)**: Pool 54 · Quota Anime Vera 2% (1/50) · Animazione Occidentale 14% (7/50) · In tema raggiungibili: 20/42
- **Variante B (C + without_genres 16)**: Pool 46 · Quota Anime Vera 0% (0/46) · Animazione Occidentale 0% (0/46) · In tema raggiungibili: 16/42
- **Raccomandazione Finale**: **C**
- **Motivazione**: Con B il pool scenderebbe a 46 titoli (sotto soglia 60); C mantiene 54 titoli (in attesa dell'allargamento pilota con 4458 che sale a 70 titoli con 0% anime)

#### preset_tv_superheroes_dark — Supereroi (Toni Oscuri)
- **Tipo**: `series`
- **Variante C (com'è adesso)**: Pool 24 · Quota Anime Vera 0% (0/24) · Animazione Occidentale 29.2% (7/24) · In tema raggiungibili: 18/23
- **Variante B (C + without_genres 16)**: Pool 17 · Quota Anime Vera 0% (0/17) · Animazione Occidentale 0% (0/17) · In tema raggiungibili: 12/23
- **Raccomandazione Finale**: **C**
- **Motivazione**: Con B il pool collassa a 17 titoli (< 20, soglia critica 1ª pagina Stremio); in C l'animazione (Invincible, Batman) è acclamata e in tema (18/23)

#### preset_extreme_survival — Sopravvivenza Estrema
- **Tipo**: `movie`
- **Variante C (com'è adesso)**: Pool 202 · Quota Anime Vera 0% (0/50) · Animazione Occidentale 4% (2/50) · In tema raggiungibili: 36/44
- **Variante B (C + without_genres 16)**: Pool 200 · Quota Anime Vera 0% (0/50) · Animazione Occidentale 0% (0/50) · In tema raggiungibili: 34/44
- **Raccomandazione Finale**: **B**
- **Motivazione**: Pool solido a 200 (-2 soli titoli), elimina i 2 film animati fuori contesto (Flow, La tartaruga rossa), 0% animazione e 34/44 in tema

#### preset_time_travel_movies — Viaggi nel Tempo (Film)
- **Tipo**: `movie`
- **Variante C (com'è adesso)**: Pool 123 · Quota Anime Vera 0% (0/50) · Animazione Occidentale 16% (8/50) · In tema raggiungibili: 40/42
- **Variante B (C + without_genres 16)**: Pool 107 · Quota Anime Vera 0% (0/50) · Animazione Occidentale 0% (0/50) · In tema raggiungibili: 34/42
- **Raccomandazione Finale**: **B**
- **Motivazione**: Pool capiente a 107 (> 60), azzera il 16% di animazione fuori contesto (Regular Show, Flashpoint), 0% anime e 34/42 in tema

#### preset_tv_high_fantasy — High Fantasy (Spade & Draghi)
- **Tipo**: `series`
- **Variante C (com'è adesso)**: Pool 7 · Quota Anime Vera 14.3% (1/7) · Animazione Occidentale 14.3% (1/7) · In tema raggiungibili: 6/20
- **Variante B (C + without_genres 16)**: Pool 5 · Quota Anime Vera 0% (0/5) · Animazione Occidentale 0% (0/5) · In tema raggiungibili: 5/20
- **Raccomandazione Finale**: **B**
- **Motivazione**: Formalmente B azzera anime (0%) e animazione (0%), ma entrambe hanno pool insufficiente (7 vs 5): mandatoria la sostituzione keyword con cluster c_3 (pool 63) o rinvio a ticket 08
