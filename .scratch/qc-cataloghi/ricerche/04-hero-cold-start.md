# 04 — Misurazione Hero: Comportamento a 0, 50 e 100 Titoli Visti

**Data**: 07/10/2026 · **Ambiente**: Produzione (`https://mate.hyena-alphard.ts.net`) via Harness `scripts/qa/simulate.js`  
**Autore**: Executor autonomo (Ticket 19) · **Riferimenti**: [Issue 19](../issues/19-hero-cold-start.md), [Report 01](01-report-qc-cataloghi.md) §6, [Ricerca 03](03-trakt-reale.md)

---

## 1. Executive Summary e Numeri Chiave

Questa campagna risponde alla domanda centrale del ticket 19: **cosa accade ai cataloghi hero di YACA mentre i dati dell'utente si accumulano (0, 50 e 100 titoli visti)?**

Sono state misurate le **48 combinazioni** (6 profili di test × 8 cataloghi hero), coprendo due archetipi di gusto distinti:
1. **Generale**: DNA reale clonato dal context `4159713d` (1.406 chiavi VSM cult, sci-fi, cinema d'autore).
2. **Otaku**: DNA reale clonato dal context `1c1da0af` (1.388 chiavi VSM anime, keyword numeriche TMDB).

Tutti i profili condividono la medesima configurazione: gli 8 hero abilitati, nessun selettore forzato, no kids mode. I livelli di cronologia (0, 50, 100) sono stati popolati con titoli TMDB reali, tipizzati e distribuiti temporalmente da 1 a 112 giorni fa.

### I "Money Numbers"
- **Somiglianza con il catalogo Fallback Popolare** (`preset_pop_movies` / `preset_pop_series`, Jaccard sui primi 40 titoli):
  - **`true_blend` (Scelti per Te)**: **1.3%** a 0 visti · **1.3%** a 50 visti · **1.3%** a 100 visti (1 solo titolo comune su 40). **Non è un fallback travestito** se l'utente ha completato l'onboarding (DNA presente).
  - **`seed_network` (La Rete dei Preferiti)**: **4.3%** a 0 visti (3/40) · **5.3%** a 50 visti (4/40) · **5.3%** a 100 visti (4/40).
  - **`trakt_filtered` (Suggeriti dalla Community)**: **12.7%** a 0 visti (9/40) · **12.7%** a 50 visti (9/40) · **12.7%** a 100 visti (9/40).
- **Invariante di Disgiunzione Intra-Hero** (zero titoli condivisi tra i 4 hero dello stesso media type): **100% rispettata (0 titoli condivisi in tutte le 72 coppie misurate)**.
- **Soglia di Personalizzazione Reale**: scatta a **50 titoli visti** per `seed_network`. Oltre i 50 titoli, la personalizzazione **non cresce in modo monotono**: 50 e 100 producono liste **identiche al 100%** a causa del cap architetturale `SEED_SIGNAL_LIMITS.watched = 15`.

---

## 2. Tabella Strutturale Completa (48 Combinazioni)

*Riferimenti Jaccard: Fallback Popolare = `preset_pop_movies` / `preset_pop_series` (J@40); Fallback Top Rated = `preset_top_rated_movies` / `preset_top_rated_series` (J@40).*

| Profilo | Catalogo Hero | Item | Anime % | ITA % | Voto med | Anno med | Pop med | Jaccard Pop (comuni/40) | Jaccard TR (comuni/40) |
|---|---|---|---|---|---|---|---|---|---|
| **sim_prof_gen_0** | true_blend_movies | 50 | 0.0% | 66.0% | 7.8 | 2003.5 | 19.2 | 1.3% (1/40) | 3.9% (3/40) |
| sim_prof_gen_0 | true_blend_series | 50 | 0.0% | 88.0% | 8.0 | 2018 | 43.2 | 3.9% (3/40) | 6.7% (5/40) |
| sim_prof_gen_0 | seed_network_movies | **33** | 0.0% | 30.3% | 7.9 | 2023 | 22.0 | 4.3% (3/40) | 5.8% (4/40) |
| sim_prof_gen_0 | seed_network_series | **38** | 0.0% | 71.1% | 8.3 | 2022 | 24.6 | 1.3% (1/40) | 2.6% (2/40) |
| sim_prof_gen_0 | hidden_gems_movies | 50 | 0.0% | 20.0% | 7.5 | 1990.5 | 4.5 | 0.0% (0/40) | 0.0% (0/40) |
| sim_prof_gen_0 | hidden_gems_series | 50 | 0.0% | 50.0% | 7.8 | 2019 | 11.6 | 0.0% (0/40) | 1.3% (1/40) |
| sim_prof_gen_0 | trakt_filtered_movies | 50 | 0.0% | 30.0% | 6.9 | 2026 | 36.3 | 12.7% (9/40) | 0.0% (0/40) |
| sim_prof_gen_0 | trakt_filtered_series | 50 | 0.0% | 58.0% | 7.8 | 2026 | 15.7 | 0.0% (0/40) | 2.6% (2/40) |
| **sim_prof_gen_50** | true_blend_movies | 50 | 0.0% | 66.0% | 7.8 | 2003.5 | 19.2 | 1.3% (1/40) | 3.9% (3/40) |
| sim_prof_gen_50 | true_blend_series | 50 | 0.0% | 88.0% | 8.0 | 2018 | 43.2 | 3.9% (3/40) | 6.7% (5/40) |
| sim_prof_gen_50 | seed_network_movies | **50** | 0.0% | 50.0% | 7.7 | 2022 | 21.7 | 5.3% (4/40) | 5.3% (4/40) |
| sim_prof_gen_50 | seed_network_series | **32** | 0.0% | 68.8% | 8.3 | 2022 | 22.7 | 1.4% (1/40) | 2.9% (2/40) |
| sim_prof_gen_50 | hidden_gems_movies | 50 | 0.0% | 20.0% | 7.5 | 1990.5 | 4.5 | 0.0% (0/40) | 0.0% (0/40) |
| sim_prof_gen_50 | hidden_gems_series | 50 | 0.0% | 50.0% | 7.8 | 2019 | 11.6 | 0.0% (0/40) | 1.3% (1/40) |
| sim_prof_gen_50 | trakt_filtered_movies | 50 | 0.0% | 28.0% | 6.9 | 2026 | 36.3 | 12.7% (9/40) | 0.0% (0/40) |
| sim_prof_gen_50 | trakt_filtered_series | 50 | 0.0% | 58.0% | 7.8 | 2026 | 15.7 | 0.0% (0/40) | 2.6% (2/40) |
| **sim_prof_gen_100** | true_blend_movies | 50 | 0.0% | 66.0% | 7.8 | 2003.5 | 19.2 | 1.3% (1/40) | 3.9% (3/40) |
| sim_prof_gen_100 | true_blend_series | 50 | 0.0% | 88.0% | 8.0 | 2018 | 43.2 | 3.9% (3/40) | 6.7% (5/40) |
| sim_prof_gen_100 | seed_network_movies | **50** | 0.0% | 50.0% | 7.7 | 2022 | 21.7 | 5.3% (4/40) | 5.3% (4/40) |
| sim_prof_gen_100 | seed_network_series | **32** | 0.0% | 68.8% | 8.3 | 2022 | 22.7 | 1.4% (1/40) | 2.9% (2/40) |
| sim_prof_gen_100 | hidden_gems_movies | 50 | 0.0% | 20.0% | 7.5 | 1990.5 | 4.5 | 0.0% (0/40) | 0.0% (0/40) |
| sim_prof_gen_100 | hidden_gems_series | 50 | 0.0% | 50.0% | 7.8 | 2019 | 11.6 | 0.0% (0/40) | 1.3% (1/40) |
| sim_prof_gen_100 | trakt_filtered_movies | 50 | 0.0% | 28.0% | 6.9 | 2026 | 36.3 | 12.7% (9/40) | 0.0% (0/40) |
| sim_prof_gen_100 | trakt_filtered_series | 50 | 0.0% | 58.0% | 7.8 | 2026 | 15.7 | 0.0% (0/40) | 2.6% (2/40) |
| **sim_prof_otaku_0** | true_blend_movies | 50 | 100.0% | 78.0% | 7.8 | 2009.5 | 10.0 | 0.0% (0/40) | 3.9% (3/40) |
| sim_prof_otaku_0 | true_blend_series | 50 | 100.0% | 78.0% | 8.5 | 2015 | 32.1 | 0.0% (0/40) | 0.0% (0/40) |
| sim_prof_otaku_0 | seed_network_movies | **19** | 100.0% | 57.9% | 7.6 | 2018 | 7.2 | 0.0% (0/40) | 0.0% (0/40) |
| sim_prof_otaku_0 | seed_network_series | **50** | 100.0% | 64.0% | 8.3 | 2019 | 42.6 | 0.0% (0/40) | 0.0% (0/40) |
| sim_prof_otaku_0 | hidden_gems_movies | 50 | 100.0% | 32.0% | 7.5 | 2010.5 | 4.7 | 0.0% (0/40) | 0.0% (0/40) |
| sim_prof_otaku_0 | hidden_gems_series | **17** | 100.0% | 70.6% | 8.1 | 1998 | 14.8 | 0.0% (0/40) | 0.0% (0/40) |
| sim_prof_otaku_0 | trakt_filtered_movies | **39** | 100.0% | 46.2% | 7.3 | 2014 | 5.3 | 0.0% (0/40) | 0.0% (0/40) |
| sim_prof_otaku_0 | trakt_filtered_series | **19** | 100.0% | 57.9% | 8.2 | 2013 | 33.0 | 0.0% (0/40) | 0.0% (0/40) |
| **sim_prof_otaku_50** | true_blend_movies | 50 | 100.0% | 78.0% | 7.8 | 2009.5 | 10.0 | 0.0% (0/40) | 3.9% (3/40) |
| sim_prof_otaku_50 | true_blend_series | 50 | 100.0% | 78.0% | 8.5 | 2015 | 32.1 | 0.0% (0/40) | 0.0% (0/40) |
| sim_prof_otaku_50 | seed_network_movies | **37** | 100.0% | 54.1% | 7.4 | 2019 | 7.7 | 0.0% (0/40) | 0.0% (0/40) |
| sim_prof_otaku_50 | seed_network_series | **19** | 100.0% | 57.9% | 8.3 | 2016 | 46.9 | 0.0% (0/40) | 0.0% (0/40) |
| sim_prof_otaku_50 | hidden_gems_movies | 50 | 100.0% | 32.0% | 7.5 | 2011.5 | 4.8 | 0.0% (0/40) | 0.0% (0/40) |
| sim_prof_otaku_50 | hidden_gems_series | **17** | 100.0% | 70.6% | 8.1 | 1998 | 14.8 | 0.0% (0/40) | 0.0% (0/40) |
| sim_prof_otaku_50 | trakt_filtered_movies | **39** | 100.0% | 46.2% | 7.3 | 2014 | 5.1 | 0.0% (0/40) | 0.0% (0/40) |
| sim_prof_otaku_50 | trakt_filtered_series | **19** | 100.0% | 57.9% | 8.2 | 2012 | 34.5 | 0.0% (0/40) | 0.0% (0/40) |
| **sim_prof_otaku_100** | true_blend_movies | 50 | 100.0% | 78.0% | 7.8 | 2009.5 | 10.0 | 0.0% (0/40) | 3.9% (3/40) |
| sim_prof_otaku_100 | true_blend_series | 50 | 100.0% | 78.0% | 8.5 | 2015 | 32.1 | 0.0% (0/40) | 0.0% (0/40) |
| sim_prof_otaku_100 | seed_network_movies | **37** | 100.0% | 54.1% | 7.4 | 2019 | 7.7 | 0.0% (0/40) | 0.0% (0/40) |
| sim_prof_otaku_100 | seed_network_series | **19** | 100.0% | 57.9% | 8.3 | 2016 | 46.9 | 0.0% (0/40) | 0.0% (0/40) |
| sim_prof_otaku_100 | hidden_gems_movies | 50 | 100.0% | 32.0% | 7.5 | 2011.5 | 4.8 | 0.0% (0/40) | 0.0% (0/40) |
| sim_prof_otaku_100 | hidden_gems_series | **17** | 100.0% | 70.6% | 8.1 | 1998 | 14.8 | 0.0% (0/40) | 0.0% (0/40) |
| sim_prof_otaku_100 | trakt_filtered_movies | **39** | 100.0% | 46.2% | 7.3 | 2014 | 5.1 | 0.0% (0/40) | 0.0% (0/40) |
| sim_prof_otaku_100 | trakt_filtered_series | **19** | 100.0% | 57.9% | 8.2 | 2012 | 34.5 | 0.0% (0/40) | 0.0% (0/40) |

---

## 3. Risposte ai Quattro Quesiti della Spec

### 3.1 A zero dati: cosa vede l'utente e lo stato del degrado

Il comportamento a zero titoli visti dipende radicalmente dalla presenza del documento `TasteProfile`:

1. **Con TasteProfile presente (onboarding eseguito, clonato dai profili reali)**:
   - `true_blend` («⭐ Scelti per Te»): **Non degrada**. Mostra fin da subito una selezione d'autore e cult eccezionale (rating 7.8, anno mediano 2003, Jaccard vs popolare 1.3%). I titoli includono *Il Signore degli Anelli - Il ritorno del re*, *Interstellar*, *L'Impero colpisce ancora*, *2001: Odissea nello spazio*, *Blade Runner*. **Proposta: SERVIRE.** L'onboarding fa il suo dovere.
   - `seed_network` («🕸️ La Rete dei tuoi Preferiti»): **Degrado silenzioso e travestito**. Non avendo semi cronologici né libreria, il builder cade sul fallback interno: serve una lista **mozzata a 33 film e 38 serie**, inquinata da cartoni slapstick per bambini (*SpongeBob*, *Wonder Park*, *Ron*, *Raya*). **Proposta: NASCONDERE** il catalogo finché `seeds.size >= 1`, oppure rinominare: *«Aggiungi ai preferiti per tessere la Rete»*.
   - `hidden_gems` («💎 Gemme Nascoste»): **Onesto e solido**. Rating 7.5, popolarità bassissima (4.5). Non dipende dalla cronologia e rispetta in pieno la promessa. **Proposta: SERVIRE.**
   - `trakt_filtered` («🌐 Suggeriti dalla Community»): **Degrado travestito**. Senza token Trakt configurato, serve 50 titoli del 2026 non ancora usciti o a basso voto (rating mediano 6.9). I log del server confermano `fallbackUsed=true, traktAvailable=false`. **Proposta: NASCONDERE** se l'account non ha Trakt collegato.

2. **Senza TasteProfile (profilo freddo totale `cold_absent`)**:
   - Come misurato nella campagna §6, `true_blend` diventa una copia 50/50 identica di `preset_pop_movies`. **Proposta: Rinominare in «I più visti del momento»** fino al completamento dell'onboarding.

---

### 3.2 A 50 e 100: da quale livello la lista smette di essere il fallback?

1. **Soglia di personalizzazione**:
   - `true_blend`: È scorrelato dal fallback popolare già a **livello 0** (Jaccard 1.3%) grazie al vettore VSM statico.
   - `seed_network`: La svolta avviene a **50 titoli visti**. A livello 0 è una lista spuria di 33 titoli; a 50 titoli si riempie a 50 item e la testa della lista diventa una vera rete di collegamenti ai titoli visti (*Project Hail Mary*, *Avengers: Infinity War*, *Dune*, *Harry Potter*, *Terminator*).
2. **Crescita monotona della personalizzazione: NO (Falso)**:
   - Tra 50 e 100 titoli visti, `seed_network` è **identico al 100% (50 titoli su 50 identici, nello stesso ordine)**.
   - **Causa architetturale**: `src/engines/hybrid/catalogStrategies.js:66`:
     ```javascript
     const SEED_SIGNAL_LIMITS = Object.freeze({ loved: 20, liked: 15, watched: 15, library: 15 });
     ```
     Il builder ordina i titoli visti per data (`timestamp DESC`) e ne estrae tassativamente **solo i primi 15**. Poiché i 15 titoli più recenti coincidono tra la cronologia a 50 e quella a 100, il pool di semi in ingresso a DuckDB è matematicamente identico.
   - L'accumulo di cronologia oltre 15 titoli è **cieco per il motore dei seed**.

---

### 3.3 I tre difetti noti misurati ai tre livelli

#### Difetto 1: Corti e animazione per famiglie nella `seed_network`
- **Misurazione**:
  - **Cortometraggi (< 60 minuti)**: **0 su 50 (0%)**. Il filtro introdotto dal ticket 07 (`F.minRuntime(60)`) ha eliminato completamente trailer, corti e speciali. **Risolto.**
  - **Animazione per famiglie**: **CONFERMATO e CRITICO**. Su 50 film serviti a livello 50 e 100 nel profilo Generale adulto, ben **22 titoli su 50 (44%)** sono film per famiglie (*Phineas e Ferb*, *Ritorno al Bosco dei 100 Acri*, *Ron*, *Flow*, *Super Mario Galaxy*, *Il robot selvaggio*, *Luck*, *Elio*, *Swapped*).
- **Causa**: I seed blockbuster/sci-fi (*Avengers*, *Dune*, *Harry Potter*) condividono keyword avventurose e franchise collegati nel grafo TMDB a lungometraggi animati per ragazzi. `seed_network` non applica un diversity cap sul genere `Famiglia` (id 10751).
- **Rimedio**: Introdurre un cap esplicito in `HERO_DIVERSITY_CAPS` per il genere `Famiglia` (massimo 2 item per catalogo) nei profili con `kidsMode: false`.

#### Difetto 2: Reflusso live-action nel profilo anime
- **Misurazione**:
  - **Film Anime reali nei hero Otaku**: **100.0% (50 su 50 nei film)** sia a 0, sia a 50, sia a 100 titoli visti.
  - Zero intrusioni di film occidentali live-action. I titoli serviti sono capolavori anime autentici (*Miyo - Un amore felino*, *Demon Slayer: Mugen Train*, *Weathering with You*, *La tomba delle lucciole*, *Jujutsu Kaisen 0*, *La Forma della Voce*, *Evangelion*, *Chainsaw Man*).
- **Conclusione**: **CONFUTATO / RISOLTO**. Il filtro tipizzato `animePolicy: ONLY` (ticket 13/17) opera sia nel pool SQL sia nel refill dei diversity caps, bloccando alla radice il reflusso live-action misurato nella campagna del 06/10.

#### Difetto 3: Pochi item nella lista Trakt serie (e contrazione cataloghi seriali)
- **Misurazione**:
  - **Profilo Generale**: nessun problema (50 item in tutte le serie hero).
  - **Profilo Otaku**: **CONFERMATO e SEVERO**.
    - `seed_network_series`: **19 titoli** (a 50 e 100 visti).
    - `hidden_gems_series`: **17 titoli** (a 0, 50 e 100 visti).
    - `trakt_filtered_series`: **19 titoli** (a 0, 50 e 100 visti).
- **Causa**: L'assegnazione esclusiva pairwise (`assignHeroPools` in `hybridRecommendations.js`) consuma il pool in ordine rigido di priorità:
  1. `true_blend_series` prende per primo 50 titoli anime.
  2. Il pool residuo di serie anime qualificate è esaurito. `seed_network`, `hidden_gems` e `trakt_filtered` rimangono con briciole (< 20 titoli).
- **Rimedio**: Rilassare l'invariante di disgiunzione esclusiva nei contesti verticali a catalogo ristretto (es. serie anime), consentendo un overlap controllato del 15-20% oppure ampliando il pool di candidati a monte a 250 titoli.

---

### 3.4 Il flag `fallbackUsed` e l'inganno del top-up

I log catturati durante il fetch di questa campagna confermano la riga esplicita di degrado:
```text
[HeroPool] Degrado Trakt rilevato per movie: fallbackUsed=true, traktAvailable=false
[HeroPool] Degrado Trakt confermato per pool yaca_trakt_filtered_movies: fallbackUsed=true, traktAvailable=false
```
Tuttavia, la ricerca [03-trakt-reale.md](03-trakt-reale.md) sul profilo reale con credenziali Trakt ha dimostrato che quando Trakt risponde con 0 titoli conformi alla policy anime, il sistema logga:
```text
[HeroPool] Trakt Filtered Anime top-up per movie: trovati solo 0 item, integro con fallback anime.
```
e serve un catalogo al 100% di fallback **marcandolo con `fallbackUsed=false`** per non nascondere l'hero.

**Proposta di correzione**:
Sdoppiare e tipizzare il flag nei metadati del catalogo:
- `traktAvailable: boolean` (token presente e valido).
- `traktSourcedCount: number` (numero di raccomandazioni Trakt effettivamente giunte a schermo).
- `fallbackTopUpCount: number` (numero di titoli inseriti dall'algoritmo di riempimento interno).
- `isDegradedFallback: boolean` (`true` se `traktSourcedCount === 0`).

---

## 4. Revisione Manuale: I 9 Cataloghi dell'Archetipo Generale

Valutati secondo la rubrica standard della campagna QC (5 dimensioni: `pertinenza` 35%, `qualita` 20%, `distintivita` 15%, `coerenza` 15%, `completezza` 15%).  
Tutti i 9 file JSON completi sono salvati in `.scratch/qc-cataloghi/review/hero-coldstart/`.

### 4.1 Sintesi dei Verdetti

| Catalogo | Livello 0 | Livello 50 | Livello 100 | Diagnosi |
|---|---|---|---|---|
| **`true_blend_movies`** | **P (93)** | **P (93)** | **P (93)** | Eccellente, guidato dal DNA VSM. Non subisce degrado a 0 visti e non muta con la cronologia. |
| **`seed_network_movies`** | **B (68)** | **B (76)** | **B (76)** | A 0 è un falso network incompleto (33 item); a 50 diventa personale ma soffre di inquinamento family (44%). A 100 è identico a 50 per cap a 15 seed. |
| **`trakt_filtered_movies`** | **B (66)** | **B (66)** | **B (66)** | Degrado silenzioso fisso: senza token serve film rumor/b-movie del 2026. Cronologia ininfluente. |

---

### 4.2 Dettaglio dei Verdetti

#### 1. `sim_prof_gen_0::yaca_true_blend_movies` · **P 93**
- **Score**: Pertinenza 95, Qualità 95, Distintività 95, Coerenza 90, Completezza 90.
- **Evidenza**: *Il Signore degli Anelli - Il ritorno del re (2003)*, *Interstellar (2014)*, *L'Impero colpisce ancora (1980)*, *2001: Odissea nello spazio (1968)*, *Blade Runner (1982)*.
- **Motivo**: Il catalogo è già impeccabile grazie al DNA statico. Non è una copia del popolare (Jaccard 1.3%). Uniche presenze discutibili: *Shrek* e *Il gatto con gli stivali 2*.

#### 2. `sim_prof_gen_50::yaca_true_blend_movies` · **P 93**
- **Score**: 93 (identico a livello 0).
- **Motivo**: La cronologia utente non tocca questo hero, che è legato al TasteProfile.

#### 3. `sim_prof_gen_100::yaca_true_blend_movies` · **P 93**
- **Score**: 93 (identico a livello 50).

#### 4. `sim_prof_gen_0::yaca_seed_network_movies` · **B 68**
- **Score**: Pertinenza 55, Qualità 75, Distintività 90, Coerenza 60, Completezza 60.
- **Evidenza**: *Raya e l'ultimo drago (2021)*, *Resident Evil (2026)*, *SpongeBob - Amici in fuga (2020)*, *Maze Runner (2015)*, *Wonder Park (2019)*.
- **Errori**: Solo 33 item serviti. Presenza di cartoni slapstick per bambini (*SpongeBob*) e film per famiglie spacciati per rete dei preferiti.
- **Motivo**: Degrado travestito. Senza preferiti la rete non esiste e serve un fallback arbitrario.

#### 5. `sim_prof_gen_50::yaca_seed_network_movies` · **B 76**
- **Score**: Pertinenza 75, Qualità 80, Distintività 95, Coerenza 65, Completezza 100.
- **Evidenza**: *L'ultima missione: Project Hail Mary (2026)*, *Avengers: Infinity War (2018)*, *Dune (2021)*, *Harry Potter e il calice di fuoco (2005)*, *Terminator (1984)*.
- **Errori**: 22 film per famiglie su 50 (*Phineas e Ferb*, *Ritorno al Bosco dei 100 Acri*, *Boxtrolls*, *Ron*, *Super Mario Galaxy*).
- **Motivo**: La personalizzazione si attiva ed è tangibile sui primi 10 titoli, ma l'espansione dei seed raccoglie un diluvio di animazione per famiglie.

#### 6. `sim_prof_gen_100::yaca_seed_network_movies` · **B 76**
- **Score**: 76 (50 su 50 titoli identici a livello 50).
- **Motivo**: Il cap architetturale di 15 seed blocca qualsiasi evoluzione progressiva della rete.

#### 7. `sim_prof_gen_0::yaca_trakt_filtered_movies` · **B 66**
- **Score**: Pertinenza 60, Qualità 65, Distintività 85, Coerenza 65, Completezza 90.
- **Evidenza**: *Motor City (2026)*, *The Brink of War (2026)*, *Idiots (2026)*, *The Last Photograph (2026)*, *Super Troopers 3 (2026)*.
- **Errori**: Voto mediano 6.9, saturazione di titoli futuri del 2026 non distribuiti o di scarsa levatura.
- **Motivo**: Fallback anonimo travestito da raccomandazione della community.

#### 8. `sim_prof_gen_50::yaca_trakt_filtered_movies` · **B 66**
- **Score**: 66 (identico al livello 0).

#### 9. `sim_prof_gen_100::yaca_trakt_filtered_movies` · **B 66**
- **Score**: 66 (identico al livello 50).

---

## 5. Stato dell'Invariante di Disgiunzione

Verifica automatica su tutti i 6 profili (12 coppie intra-media per profilo = 72 confronti pairwise):
- **sim_prof_gen_0**: Movies 0 sovrapposizioni · Series 0 sovrapposizioni.
- **sim_prof_gen_50**: Movies 0 sovrapposizioni · Series 0 sovrapposizioni.
- **sim_prof_gen_100**: Movies 0 sovrapposizioni · Series 0 sovrapposizioni.
- **sim_prof_otaku_0**: Movies 0 sovrapposizioni · Series 0 sovrapposizioni.
- **sim_prof_otaku_50**: Movies 0 sovrapposizioni · Series 0 sovrapposizioni.
- **sim_prof_otaku_100**: Movies 0 sovrapposizioni · Series 0 sovrapposizioni.

**Esito**: L'invariante di disgiunzione intra-hero è **rispettata al 100% in tutti i profili e a tutti i livelli**.

---

## 6. Proposte di Intervento e Nuovi Ticket

1. **Ticket: Nascondere `seed_network` a zero semi**: Non servire il catalogo se l'utente non ha almeno 1 titolo in cronologia o watchlist, evitando la falsa rete con SpongeBob e titoli per bambini.
2. **Ticket: Diversity Cap su Genere Famiglia in `seed_network`**: Aggiungere un vincolo a `HERO_DIVERSITY_CAPS` per limitare i film con genere Famiglia (id 10751) a un massimo di 2 titoli nei profili non-kids.
3. **Ticket: Espansione Finestra Seed Watched**: Alzare `SEED_SIGNAL_LIMITS.watched` da 15 a 30-40, con campionamento pesato per decadimento temporale esponenziale anziché taglio netto a 15, per consentire una reale evoluzione monotona della personalizzazione da 50 a 100 titoli.
4. **Ticket: Relax della Disgiunzione su Cataloghi Ristretti (Anime Series)**: Evitare la desertificazione di `hidden_gems_series` (17 titoli) e `trakt_filtered_series` (19 titoli) consentendo overlap parziale controllato quando il pool residuo scende sotto i 30 candidati.
5. **Ticket: Trasparenza Metadati `trakt_filtered`**: Sdoppiare il flag `fallbackUsed` per dichiarare chiaramente quando il catalogo è al 100% un top-up anime interno o un fallback di titoli del 2026.

---

## 7. Cold Start Vero (Senza DNA e Senza Cronologia)

Misurazione dedicata richiesta per isolare il profilo al punto zero assoluto: **nessun documento `TasteProfile` su Atlas** (`cold_absent`), **nessuna riga in `watchhistories`** e **nessuna watchlist**. Verificato su Atlas prima del fetch: `TasteProfile: 0 documenti`, `WatchHistory: 0 documenti`.

I log del server confermano il mancato caricamento del profilo:
```text
[Hybrid Debug] profile loaded: false, isKidsMode=false, cacheKey=sim_user_yaca_sim_prof_true_cold_heroes_v2_movie
[HeroPool] Degrado Trakt rilevato per movie: fallbackUsed=true, traktAvailable=false
[HeroPool] Degrado Trakt confermato per pool yaca_trakt_filtered_movies: fallbackUsed=true, traktAvailable=false
[HeroPool] Degrado Trakt rilevato per series: fallbackUsed=true, traktAvailable=false
[HeroPool] Degrado Trakt confermato per pool yaca_trakt_filtered_series: fallbackUsed=true, traktAvailable=false
```

### 7.1 Tabella Strutturale dei Quattro Hero (Movie e Series)

| Catalogo | Tipo | Item | Anime % | ITA % | Voto med | Anno med | Pop med | Jaccard Pop (comuni/40) | Jaccard TR (comuni/40) |
|---|---|---|---|---|---|---|---|---|---|
| **`true_blend_movies`** | movie | 50 | 2.0% | 52.0% | 7.6 | **2026** | **72.1** | **56.9% (29/40)** | 5.3% (4/40) |
| **`true_blend_series`** | series | 50 | 20.0% | 74.0% | 8.1 | 2024.5 | 52.6 | 2.6% (2/40) | 5.3% (4/40) |
| **`seed_network_movies`** | movie | 50 | 12.0% | 48.0% | **8.0** | 2023 | 12.3 | 0.0% (0/40) | 1.3% (1/40) |
| **`seed_network_series`** | series | 50 | 18.0% | 52.0% | 8.4 | 2022 | 22.8 | 0.0% (0/40) | 3.9% (3/40) |
| **`hidden_gems_movies`** | movie | 50 | 8.0% | 54.0% | 7.4 | 2025 | 14.5 | 0.0% (0/40) | 0.0% (0/40) |
| **`hidden_gems_series`** | series | 50 | 28.0% | 56.0% | 7.8 | 2017 | 19.6 | 0.0% (0/40) | 0.0% (0/40) |
| **`trakt_filtered_movies`** | movie | 50 | 0.0% | 18.0% | 6.7 | 2026 | 15.1 | 2.6% (2/40) | 0.0% (0/40) |
| **`trakt_filtered_series`** | series | 50 | 14.0% | 58.0% | 7.8 | 2026 | 14.3 | 0.0% (0/40) | 0.0% (0/40) |

---

### 7.2 Confronto col Dato del 06/10: Confermato o Cambiato?

- **Nella campagna del 06/10**: `true_blend_movies` era stato registrato come «50 titoli su 50 identici a `preset_pop_movies` nello stesso ordine».
- **Nella misurazione odierna col codice attuale**: la sovrapposizione Jaccard @40 è del **56.9% (29 titoli su 40 in comune)**.
- **Perché il numero è cambiato?** Il codice introdotto con i ticket 07 (`F.minRuntime(60)`) e `mapStableFallbackIds` applica nel fallback di `true_blend` deduplicazioni assenti nel preset popolare grezzo: **massimo 1 titolo per saga/collection** (`seenCollections`) e **massimo 1 titolo per regista** (`seenDirectors`). I titoli che mancano nei primi 40 (*Digger*, *The Love Hypothesis*, ecc.) sono stati scartati da queste regole di diversificazione o shiftati nelle posizioni successive.
- **La sostanza del problema è CONFERMATA al 100%**: Anno mediano **2026** e Popolarità **72.1**. I primi 2 titoli (*Spider-Man: Brand New Day*, *Resident Evil*) sono identici in prima e seconda posizione. L'utente senza DNA riceve alla lettera il fallback commerciale TMDB delle uscite 2026, mascherato da «Scelti per Te».

---

### 7.3 Verdetti Manuali QC (Rubrica della Campagna)

#### `sim_prof_true_cold::yaca_true_blend_movies` · **B 68**
- **Score**: Pertinenza 50, Qualità 80, Distintività 70, Coerenza 70, Completezza 100.
- **Evidenza**:
  1. *Spider-Man: Brand New Day (2026)* — tmdb:969681 (Pop: 719.5, Voto: 8.1)
  2. *Resident Evil (2026)* — tmdb:1423191 (Pop: 151.7, Voto: 7.9)
  3. *Odissea (2026)* — tmdb:1368337 (Pop: 73.1, Voto: 8.2)
  4. *The Rush - Corsa contro il tempo (2026)* — tmdb:1377237 (Pop: 51.5, Voto: 7.5)
  5. *Coyote vs. Acme (2026)* — tmdb:1204680 (Pop: 249.8, Voto: 7.5)
- **Motivo**: Popolari del momento travestiti da raccomandazione personale. Un utente appena registrato senza aver fatto l'onboarding non vede alcuna scelta su misura, bensì un elenco di blockbuster in arrivo nel 2026 ad altissima popolarità commerciale (72.1 mediano), con Jaccard del 56.9% rispetto a `preset_pop_movies`.

#### `sim_prof_true_cold::yaca_seed_network_movies` · **B 66**
- **Score**: Pertinenza 45, Qualità 90, Distintività 85, Coerenza 60, Completezza 100.
- **Evidenza**:
  1. *Spider-Man: No Way Home (2021)* — Pop: 57.3, Voto: 7.9
  2. *Oppenheimer (2023)* — Pop: 53.2, Voto: 8.0
  3. *Top Gun: Maverick (2022)* — Pop: 48.8, Voto: 8.2
  4. *Spider-Man: Across the Spider-Verse (2023)* — Pop: 53.5, Voto: 8.3
  5. *Guardiani della Galassia Vol. 3 (2023)* — Pop: 39.8, Voto: 7.9
- **Motivo**: Falsa rete dei preferiti. Non essendoci né semi in cronologia né elementi in libreria, il builder esegue il fallback `fetchTopRatedPeriodFallbackIds` (ultimi 60 mesi). I titoli sono eccezionali per qualità cinematografica (voto mediano 8.0), ma la promessa è tradita: è una generica carrellata dei migliori film dell'ultimo quinquennio presentata come «La Rete dei tuoi Preferiti».

