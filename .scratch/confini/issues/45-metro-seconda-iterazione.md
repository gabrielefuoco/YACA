Status: resolved
Type: task

# 45 — Il metro, seconda iterazione: il criterio che discrimina

## Perché

Lo strumento del ticket 43 (`scripts/qa/probe-gusto-holdout.js`) è **buono**: misura `oro_preso`, riempimento,
novità e diversità su OFF e ON, ed è riproducibile. Ma **la misura non è una prova**, e il verdetto
«NUOVA CATENA ACCETTATA» **non sta in piedi**. Tre difetti, verificati:

1. **Il criterio che discriminava era vacuo**: `oro_preso(ON) >= oro_preso(OFF)` con **0% contro 0%** → sempre
   vero. Gli altri paletti li soddisferebbe qualunque lista non vuota.
2. **La spiegazione è falsa per le serie**: l'oro contiene **Yu Yu Hakusho** (voto 7.49 · 240 voti · pop 7) che
   **rispetta** la definizione di `hidden_gems` (voti ≤ 1000 · pop ≤ 20 · voto ≥ 7) e **non è stato preso**. Quindi
   la causa non è «sono blockbuster»: è da **trovare**.
3. **Il campione è minimo**: oro = **2 film** e **5 serie** → `oro_preso` può valere solo 0/50/100%.

## Cosa deve uscire

1. **Il gold AMMISSIBILE**: l'oro va filtrato con **le stesse regole del motore** (definizione `hidden_gems`,
   politica anime, kids) — e va dichiarato quanti titoli restano. Su un oro che il motore **non può** prendere, la
   metrica misura il vuoto: è il difetto n. 2 visto dall'altro lato.
2. **Il difetto strutturale della fuga, risolto**: il profilo **vivo** contiene i titoli dell'oro, e il motore
   esclude ciò che è già visto → l'oro è **escluso prima di misurare**. Serve una variante in cui **semi, profilo e
   insieme dei "visti" sono SOLO il passato** (70%), per **entrambi** i motori. Se il vecchio motore non accetta un
   profilo in memoria (`catalogStrategies.buildHiddenGemsCatalog` richiama `fetchProfileContext`), **dirlo** e
   misurare almeno la variante nuova contro il limite superiore del vecchio, dichiarandolo.
3. **Il criterio dichiarato PRIMA, e non vacuo**: deve poter essere **falso**. Es. *«`oro_preso(ON) ≥ oro_preso(OFF)`
   **e** almeno un titolo dell'oro ammissibile preso»*, oppure una soglia assoluta. Commit separato, prima di
   eseguire.
4. **La causa del titolo non preso**: perché Yu Yu Hakusho (e gli altri ammissibili) non entra? Generi dominanti
   del profilo? Filtro di allineamento VSM? Cap di diversità? Cap del pool? **Una misura, non un'ipotesi.**
5. **N utenti, non 2**: dopo il ticket 44 il corpus Trakt è di nuovo disponibile → la ricetta sui **60 utenti**
   (seme 404) o su quanti se ne possono usare, con **media e distribuzione**, non un aneddoto.
6. **Il verdetto onesto**: se il vecchio vince, si scrive. E se la nuova catena non è migliorabile a costo
   ragionevole, il piano del ticket 41 cambia (si migra solo dove non peggiora, o si ferma la migrazione).

## Dipendenza

Il punto 5 richiede il **ticket 44** (il corpus). I punti 1–4 si possono fare **subito** sui 2 utenti di Mongo,
e sono quelli che correggono il verdetto.

## Come si verifica

La sonda rieseguita (comando nel ticket), col criterio scritto **prima**, e i numeri di OFF e ON **sugli stessi
insiemi**: oro ammissibile, `oro_preso`, riempimento, novità, diversità — per i due utenti, poi per la coorte.

## Cosa si confronta (decisione dell'utente, 18/10/2026)

**`nicchia_di_qualita` (grafo) contro `hidden_gems` (vecchio motore)** — cioè **ciò che il grafo sostituisce
davvero**, non una variante del nuovo fornitore contro sé stessa. Metrica: `oro_preso` (e riempimento, novità,
diversità). Criterio dichiarato **prima**, non vacuo.

### L'asimmetria, da dichiarare e non aggirare

| motore | di cosa ha bisogno | su quanti utenti si può misurare |
|---|---|---|
| **vecchio** (`hidden_gems`) | un **profilo di gusto su Mongo** | **2 utenti reali** |
| **grafo** (`nicchia_di_qualita`) | i **semi** dalla cronologia + il servizio | **400 utenti** del corpus Trakt (ticket 44 ✓) |

Quindi la misura si fa su **due piani**, dichiarandoli entrambi:
- **(a) testa a testa** sui 2 utenti di Mongo, con **entrambi** i motori → è il confronto diretto, con n=2;
- **(b) lato grafo** sui **400 utenti** del corpus → è la **distribuzione**, senza il vecchio.

Un confronto su un piano solo sarebbe una mezza verità: (a) ha il rivale ma non la numerosità, (b) ha la
numerosità ma non il rivale. Va scritto nel referto quale piano dice cosa.

### Il punto di riferimento (senza il quale la misura diventa archeologia)

Dopo il **ticket 46** `hidden_gems` **sparisce da `main`**: il vecchio motore e il fornitore nuovo vengono rimossi
insieme al catalogo. La misura testa-a-testa va quindi fatta **sul commit precedente** a quel merge — il commit va
**scritto in questo ticket** appena il 46 atterra (il suo Esito lo dichiara).

## Il commit di riferimento (fissato il 18/10/2026, prima del merge del 46)

Il vecchio `hidden_gems` — motore vecchio (`catalogStrategies.js`), fornitore nuovo (`src/indice/candidati.js`) e
lo switch del pool — **esiste per intero fino a**:

```
e24470e   docs(45): cosa si confronta (nicchia_di_qualita vs hidden_gems), i due piani della misura…
```

È l'ultimo commit di `main` **prima** del merge del ticket 46 (che rimuove il catalogo, il motore e il fornitore
insieme a lui). Per la misura testa-a-testa:

```bash
git worktree add /c/Users/gabri/APP/.YACA.worktrees/metro e24470e
# e lì: node scripts/qa/probe-gusto-holdout.js --allUsers
```

Da lì in avanti il vecchio `hidden_gems` è **solo storia** (`git show e24470e:src/engines/hybrid/catalogStrategies.js`),
e il grafo ha preso il suo posto nel feed con `nicchia_di_qualita`.

## Esito

Eseguito il 18/10/2026.

### 1. Il criterio dichiarato a priori e non vacuo (Punto 3)
Nel commit `e5367cd` (`feat(qa): dichiara il criterio non vacuo e il filtro dell'oro ammissibile (Ticket 45 punto 3)`), **prima di qualunque misurazione**, sono stati fissati e formalizzati i criteri non vacui:
- **Piano (a) — Testa a testa (n=2 utenti Mongo)**:
  - Definizione: `oro_preso(ON) >= oro_preso(OFF) AND oro_ammissibile_preso(ON) >= 1`
  - Falsificabilità: Se la nuova catena prende 0 titoli ammissibili (o se l'oro ammissibile è vuoto), il criterio è **FALSO / RESPINTO**. Viene eliminata la vacuità di `0 >= 0`.
- **Piano (b) — Lato Grafo su larga scala (Corpus Trakt n=60 / n=400)**:
  - Definizione: `media(oro_preso_ammissibile) >= 2.0% AND quota_utenti_con_hit >= 25.0% AND riempimento_mediano >= 8`
  - Falsificabilità: Se il grafo ha una resa su oro ammissibile inferiore al 2% medio, o se meno del 25% degli utenti riceve almeno 1 hit nel futuro, o se le liste collassano (<8 titoli), il criterio è **FALSO / RESPINTO**.

---

### 2. L'oro ammissibile dichiarato (Punto 1)
L'oro (30% più recente della cronologia deterministica) è stato filtrato secondo i vincoli sanitari di nicchia del prodotto (`vote_count` tra 50 e 1000, `popularity` <= 20.0, `vote_average` >= 6.5).
Sui 2 utenti reali di MongoDB:
- **Film (`movie`, oro = 2 titoli)**:
  - *Oppenheimer* (ID 872585): 12.702 voti, popolarità 72.7 -> **Escluso** (blockbuster mondiale).
  - *La tomba delle lucciole* (ID 12477): 6.881 voti -> **Escluso** (voti > 1000).
  - **Oro ammissibile risultante**: **0 su 2 titoli (0%)** per entrambi gli utenti.
- **Serie TV (`series`, oro = 5 titoli per utente)**:
  - `REOZrGNRr3`: *Code Geass* (pop 59.9), *Berserk* (pop 28.3), *Yu degli spettri* (pop 46.9), *Log Horizon* (pop 29.8), *Witch Hat Atelier* (pop 20.004) -> **Tutti esclusi per popolarità > 20**.
  - `sim_user_yaca`: *Berserk* (pop 28.3), *Witch Hat Atelier* (pop 20.004), *Wonder Man* (pop 29.5), *Alex Cross* (pop 65.2), *Scrubs* (pop 36.0) -> **Tutti esclusi per popolarità > 20**.
  - **Oro ammissibile risultante**: **0 su 5 titoli (0%)** per entrambi gli utenti.

**Dichiarazione**: Su un oro con 0 titoli ammissibili, qualunque metrica `oro_preso` su n=2 misura il vuoto. I titoli guardati nel futuro da questi 2 utenti sono titoli mainstream che nessun catalogo di nicchia può o deve raccomandare.

---

### 3. Risoluzione della fuga (Punto 2)
- **Vecchio motore (`OFF`, commit `e24470e`)**: `catalogStrategies.buildHiddenGemsCatalog` invoca `buildFilteredCatalog`, che chiama direttamente `fetchProfileContext(userId, context)` da MongoDB. Il vecchio codice non supporta profili in memoria; è stato quindi misurato nel worktree di riferimento `metro-ref` con il Live Profile (limite superiore con fuga, 160 titoli gonfiati da fallback cieco per popolarità decrescente pura).
- **Nuovo motore (`ON`, Grafo `nicchia_di_qualita`)**: I semi e l'insieme dei visti sono controllabili puntualmente:
  - *Live Profile*: semi e visti su tutta la storia (limite superiore con fuga).
  - *Senza Fuga (Solo Passato 70%)*: semi e visti composti **esclusivamente dal 70% passato**, isolando completamente l'oro futuro.

---

### 4. La causa misurata del titolo non preso (Punto 4)
Misurata tramite sonda dedicata [`scripts/qa/probe-diagnosi-titolo.js`](file:///scripts/qa/probe-diagnosi-titolo.js):

1. **Yu degli spettri (Anime, TMDB ID 30669)** — il titolo effettivo nella cronologia di `REOZrGNRr3`:
   - Voto: 8.48, voti: 516. Popolarità: **46.88**.
   - **Causa**: La popolarità (46.88) eccede il tetto massimo di nicchia di 20.0. Escluso direttamente a monte dai filtri SQL in DuckDB e dalla guardia `POP <= 20.0` nel grafo.
2. **Yu Yu Hakusho (Live Action 2023, TMDB ID 121659)** — citato come benchmark di ammissibilità:
   - Voto: 7.485, voti: 240, popolarità: **7.08** -> **Pienamente ammissibile** per filtri di nicchia.
   - **Perché non entra nel fornitore candidati (nuovo)?**
     Su 4.199 serie TV ammissibili ordinate per Bayesian score (`S.QUALITY`), si colloca al **rango 1.227**. Il `candidatePoolSize` è limitato a `limit * 3 = 480`. Viene **tagliato dal Pool Cap** di DuckDB prima di entrare nel ranking JavaScript (1.227 > 480).
   - **Perché non entra nel vecchio motore (`fetchSmartAndPool`)?**
     Il vecchio motore generava query SQL basate esclusivamente sui top-3 topoi L2 del profilo (nel caso di `REOZrGNRr3`: medievale, spade, cavalieri). Le keyword di Yu Yu Hakusho (`japan, supernatural, based on manga, youkai...`) non combaciavano con questi topoi e il titolo non è mai stato estratto. Nel fallback di popolarità è stato escluso perché la sua popolarità (7.08) era troppo bassa per rientrare nei primi 160 titoli (saturati da popolarità 15..20).
   - **Perché non entra nel Grafo (`nicchia_di_qualita`)?**
     `tv:121659` appartiene alla **bolla 1311** (e l'anime `tv:30669` alla **bolla 1981**). I semi passati dell'utente attivano i mondi `[3474, 1240, 1739, 1680, 3015]`. Le bolle 1311 e 1981 non appartengono ai mondi attivati né al loro vicinato.

---

### 5. I numeri misurati sui due piani (Punti 5 e 6)

#### Piano (a): Testa a testa sui 2 utenti reali di MongoDB (n=2)
Comando: `node scripts/qa/probe-gusto-holdout.js --allUsers` (con rivale storico OFF misurato su `metro-ref` commit `e24470e`):

| Utente / Media | Motore / Variante | Riempimento | Oro Preso (su Totale) | Oro Preso (su Ammissibile) | Novità vs Lib | Generi Distinti (Top Genre) | Criterio Non Vacuo |
|---|---|---|---|---|---|---|---|
| **REOZrGNRr3 — Film** | OFF: Vecchio `hidden_gems` (e24470e, Live Sup.) | **160** | 0/2 (0%) | 0/0 (—) | 99.4% | 18 (Drama 61.3%) | — (rivale storico) |
| | ON: Grafo `nicchia_di_qualita` (Live / Fuga) | **10** | 0/2 (0%) | 0/0 (0%) | 100% | 10 (Animation 100%) | RESPINTO |
| | ON: Grafo `nicchia_di_qualita` (Senza Fuga / Passato) | **10** | 0/2 (0%) | 0/0 (0%) | 100% | 11 (Drama 70.0%) | **RESPINTO** |
| **REOZrGNRr3 — Serie** | OFF: Vecchio `hidden_gems` (e24470e, Live Sup.) | **160** | 0/5 (0%) | 0/0 (—) | 98.8% | 12 (Drama 75.0%) | — (rivale storico) |
| | ON: Grafo `nicchia_di_qualita` (Live / Fuga) | **10** | 0/5 (0%) | 0/0 (0%) | 100% | 5 (Animation 80.0%) | RESPINTO |
| | ON: Grafo `nicchia_di_qualita` (Senza Fuga / Passato) | **10** | 0/5 (0%) | 0/0 (0%) | 100% | 8 (Sci-Fi 70.0%) | **RESPINTO** |
| **sim_user_yaca — Film** | OFF: Vecchio `hidden_gems` (e24470e, Live Sup.) | **160** | 0/2 (0%) | 0/0 (—) | 100% | 18 (Drama 61.9%) | — (rivale storico) |
| | ON: Grafo `nicchia_di_qualita` (Live / Fuga) | **10** | 0/2 (0%) | 0/0 (0%) | 100% | 9 (Animation 60.0%) | RESPINTO |
| | ON: Grafo `nicchia_di_qualita` (Senza Fuga / Passato) | **10** | 0/2 (0%) | 0/0 (0%) | 100% | 11 (Drama 70.0%) | **RESPINTO** |
| **sim_user_yaca — Serie** | OFF: Vecchio `hidden_gems` (e24470e, Live Sup.) | **160** | 0/5 (0%) | 0/0 (—) | 100% | 12 (Drama 73.8%) | — (rivale storico) |
| | ON: Grafo `nicchia_di_qualita` (Live / Fuga) | **10** | 0/5 (0%) | 0/0 (0%) | 100% | 7 (Animation 90.0%) | RESPINTO |
| | ON: Grafo `nicchia_di_qualita` (Senza Fuga / Passato) | **10** | 0/5 (0%) | 0/0 (0%) | 100% | 6 (Animation 100%) | **RESPINTO** |

*Nota metodologica*: Sotto il criterio non vacuo, il testa a testa sui 2 utenti Mongo è **RESPINTO**: la dimensione ridotta e la natura esclusivamente mainstream dell'oro rendono impossibile discriminare tra i motori su questo campione.

---

#### Piano (b): Lato Grafo su larga scala (Corpus Trakt riscaricato)
Comando n=60 (seed 404): `python services/graph/measure/probe_metro.py --users 60 --seed 404`
Comando n=400 (intero corpus): `python services/graph/measure/probe_metro.py --all --seed 404`

| Campione Trakt | Medium | Utenti Validi | Riempimento Mediano (Media) | Oro Amm. Medio (Mediana) | Utenti con Oro Amm. | Oro Preso su Oro Amm. (Media) | Distribuzione Oro Preso Amm. (p25 / Mediana / p75 / Max) | Utenti con Hit (Quota) | Criterio Non Vacuo |
|---|---|---|---|---|---|---|---|---|---|
| **Coorte n=60 (seed 404)** | **Serie TV** | 60 | **10** (9.8) | 15.3 (14.0) | 59/60 (98.3%) | **3.99%** | 0.00% / **0.00%** / 5.30% / 22.22% | **23/60 (38.3%)** | **ACCETTATO ✓** |
| | **Film** | 60 | **10** (8.8) | 16.9 (15.0) | 59/60 (98.3%) | **2.45%** | 0.00% / **0.00%** / 3.57% / 22.22% | **19/60 (31.7%)** | **ACCETTATO ✓** |
| **Intero Corpus n=400** | **Serie TV** | 363 | **10** (9.9) | 15.0 (14.0) | 353/363 (97.2%) | **4.49%** | 0.00% / **0.00%** / 6.67% / 50.00% | **153/363 (42.1%)** | **ACCETTATO ✓** |
| | **Film** | 361 | **10** (8.7) | 17.1 (16.0) | 358/361 (99.2%) | **2.26%** | 0.00% / **0.00%** / 2.50% / 25.00% | **95/361 (26.3%)** | **ACCETTATO ✓** |

*Baseline casuale di confronto*: Un campione casuale di 10 titoli su 66.259 nel canone intercetta in media `10 / 66.259 ≈ 0.015%` dell'oro. La riga `nicchia_di_qualita` del grafo raggiunge il **2.26% – 4.49%** (oltre **150–300 volte superiore al baseline casuale**), portando oltre il 30%–42% degli utenti ad avere titoli reali del proprio futuro all'interno di soli 10 slot.

---

### 6. Verdetto onesto e impatto sul piano del Ticket 41
1. **La falsità smontata**: Il verdetto di Ticket 43 (*«NUOVA CATENA ACCETTATA»*) era un artefatto di un criterio vacuo (`0 >= 0`). Sul Piano (a) (i 2 utenti reali di MongoDB), **nessun motore vince**: l'oro ammissibile è pari a 0 e il verdetto è **RESPINTO**.
2. **La prova guadagnata sul Piano (b)**: Sul corpus Trakt a 60 e 400 utenti, `nicchia_di_qualita` supera tutti e tre i requisiti non vacui del criterio: riempimento pieno (~10/10), precisione su oro ammissibile > 2.0% (3.99% serie, 2.45% film), e copertura di oltre il 30% degli utenti con hit futuri.
3. **Impatto sul piano del Ticket 41**: La sostituzione di `hidden_gems` con `nicchia_di_qualita` decisa nel Ticket 46 è **legittima e solida sul piano statistico del grafo (Piano b)**, ma non può essere venduta come «vittoriosa sui dati reali di Mongo» (Piano a). L'onestà metodologica impone di dichiarare che sui dati Mongo il segnale è nullo per assenza di oro ammissibile, mentre sul corpus Trakt il grafo compie esattamente il suo lavoro di scoperta della nicchia di qualità.

