# Specifica — le righe vive

**Cantiere**: `.scratch/righe-vive/` · **Mappa**: `map.md` · **Data**: 19/10/2026
**Riferimenti**: il piano in `%TEMP%\yaca-grafo-handoff\Piano d'Azione per il Sistema di Raccomandazione.md`,
`HANDOFF.md` e i due digest nella stessa cartella; `docs/RECOMMENDATION_GRAPH.md` (⚠️ parzialmente stantio).

---

## 0. Il contratto che non cambia

- Il motore è un **servizio HTTP** (`services/graph/servizio.py`, porta 7862): `POST /raccomanda` con
  `{semi, medium, opzioni, cap}`, risposta `{liste: [{ruolo, titoli: [{tmdbId, medium, punteggio}]}]}`.
- Le liste **escono già filtrate per medium**; il prodotto **non** ri-filtra per medium.
- L'artefatto e la ricetta restano quelli (`2330b143bc8845a7` / `cf1d80dcba3eddce`): chi legge una riga hero
  **deve** continuare a vedere l'invalidazione della cache legata alle versioni del grafo.

## 1. Semi — la materia prima della pertinenza

| Regola | Oggi | Dopo | Perché |
|---|---|---|---|
| Peso della watchlist | `PESO_TIPO["library"] = 1.5` (più di un film **visto**) | **1.0** | una lista di desideri non è un gusto |
| Titoli in watchlist nelle liste | **non** sono in `visti`, quindi ci rientrano | **esclusi** come i visti | si auto-illuminano (`ALPHA = 0.60` di restart su sé stessi) |
| Ripescaggio dalla watchlist | — | **max 1–2**, solo se `r_indotta` nel top 15% dei candidati non visti e `VAVE >= 7.0` | promemoria ad alto match, non invasione |
| I semi portano il peso vero | `pool/index.js` manda `peso: w`, che in `pesi_semi` **sovrascrive** `PESO_TIPO` | il peso del tipo deve **contare** | si perde la curva `1 + 2*(plays/NEP)` delle serie e i tetti dei film |
| I semi portano la **recenza** | `semiDi` restituisce una Map senza ordine temporale | i primi 12–15 per data di visione sono marcati (o ordinati) | serve alla riga "ultime visioni" |

**Formula del ripescaggio**: `r_indotta[x] = r[x] - ALPHA * e[x]` (con `e[x]` = massa iniziale del seme).
Senza togliere `ALPHA * e[x]` un titolo in watchlist sembra sempre caldissimo.

## 2. "Il tuo mondo" — bacino appiattito, pavimento, ranking

1. **Bacino**: le prime *K* bolle accese (fino a ≥80% della massa, minimo 250–300 candidati grezzi) **più** i
   membri dei primi 2–3 `VICINI` di ciascuna → un **set unico**. Assorbe il ruolo che voleva avere "un passo fuori".
2. **Pavimento di qualità** (prima del ranking, come maschera vettoriale):
   scarta `VAVE < 6.4` oppure `VOT < max(150, 0.08 * canone)` dove `canone = mediana(voti)` della storia utente
   (già calcolato in `deduci()`). Adattivo: severo col profilo mainstream, permissivo con l'essai.
3. **Ranking combinato**: `score(x) = r[x] * (bayesian_vote(x) / 7.0)^1.5` — l'attivazione resta la spina dorsale
   (è la topologia), il voto spinge i titoli solidi senza stravolgerla. Mai `r[x]` puro: premia i nodi connessi
   anche se mediocri.

## 3. "Gemme nascoste nel tuo mondo" — nicchia **relativa**

Oggi: `POP <= 20.0` e `VAVE >= 7.0` **uguali per tutti**, ordinate per `-(VAVE + bonus_liste)`, **buttando via
`r[x]`**. Dopo:

1. **Bacino**: lo stesso allargato del "tuo mondo".
2. **Tetto relativo**: `VOT[x] <= min(0.35 * V_mondo, 2500)` e `POP[x]` sotto il 50° percentile del bacino, dove
   `V_mondo` è la mediana dei voti del bacino acceso (pesata per `att_s[b]`). Così a chi guarda blockbuster basta
   un 1.200 voti per essere "nicchia", a chi guarda indie serve meno.
3. **Pavimento assoluto**: `VOT[x] >= 40` (esistono film con 3 voti e media 9.0).
4. **Voto normalizzato sulla bolla**: `mu_b` = media voto della bolla; premia `VAVE[x] - mu_b >= +0.4` e comunque
   `VAVE[x] >= 6.8` (horror e commedie hanno medie strutturalmente più basse).
5. **Ordine**: `r[x] * (VAVE[x] - mu_b + 1.0) * (1 + 0.15 * (LISTDEG[x] > 0))`.

## 4. "Classici imperdibili del tuo mondo" — high-consensus

Il **candidato** deve già stare nel top 300 per `r[x]` del profilo (dentro i mondi accesi). Poi:
`VOT[x] >= max(1500, 1.5 * V_mondo)`, `VAVE[x] >= 7.5` (serie: **7.7**, i voti delle serie su TMDB sono gonfiati
di `0.3). Ordine: **70% attivazione, 30% bayesian rating**. Obiettivo dichiarato: i capolavori *del suo*
micro-genere, non *Il Padrino* per chi guarda animazione giapponese.

## 5. "Sul filo delle tue ultime visioni" — recenza come **selezione**

Fatto misurato in `parametri.py`: *«la recenza non funziona come peso globale, ma funziona fortissimo come
SELEZIONE: i soli ultimi 15 titoli fanno lift 47,5x contro 18,2x»*. Quindi: se ci sono **almeno 3** semi recenti,
una **seconda diffusione** `ppr(Tr, righe_recenti, pesi_recenti)` (`2 ms: la matrice è già in RAM), bacino
appiattito sulle top 3–4 bolle accese da **quella** diffusione. Effetto: la riga cambia appena l'utente guarda 2–3
film di un filone nuovo.

## 6. Micro-cluster dei filoni

1. **Grafo indotto sui soli semi** (100–300 nodi): due semi sono collegati se stanno nella **stessa bolla**, o in
   bolle **adiacenti** (`VICINI`), o hanno un arco `Tr[i,j] > 0`.
2. **Componenti connesse** (o Leiden/Louvain sul mini-grafo, <1 ms). Si tengono i primi **2–3** cluster con almeno
   **3 semi** o il **10%** del peso totale.
3. **Una diffusione per cluster**, con i **soli** semi di quel cluster: la massa di `r_k` somma a 1.0 **dentro** il
   filone, senza essere schiacciata dal filone dominante (il "frullato unico" di oggi).
4. **Titolo parlante**: la riga porta i 2 titoli-seme più pesanti del cluster (es. *"Perché hai amato Interstellar e
   Arrival"*).

## 7. "Punti d'incontro" — crossover dei gusti

Con `r_1 … r_K` normalizzati a somma 1: `ponte_{a,b}(x) = sqrt(r_a[x] * r_b[x])`. La **media geometrica** è la
scelta giusta: se un titolo è forte in un filone e assente nell'altro, il prodotto è **zero** — sale solo chi
riceve massa da **entrambi**. Pavimento `VAVE >= 6.8`. Fallback elegante se l'utente ha un solo cluster: i due
mondi più **distanti** accesi (`scegli_mondi` con `lontano = 1.0`).

## 8. "Nuove uscite per te" — il bug e la riparazione

**Il sintomo**: la riga è quasi sempre vuota. **Tre cause concatenate**:
1. il canone del grafo è **storico** (66.259 nodi da co-visione Trakt/MovieLens): le uscite 2025–2026 dei Parquet
   TMDB (`117.000 righe) **non ci sono** quasi mai — il `README.md` del servizio lo ammette e `measure/liste.py` lo
   stampa ("nessuna uscita 2025+ in questi mondi");
2. l'imbuto in `motore.py`: `nuove = [x for x in np.where(self.ANNO >= P.USCITE_NUOVE_DAL)[0] if int(self.MEM[x])
   in set(bolle) and x not in visti]` — cerca le novità **solo dentro le 1–4 bolle** del profilo (50–80 titoli su
   66.259), **senza** i vicini;
3. **soppressione silenziosa**: se la lista è vuota, `servizio.py` fa `if not titoli_raw: continue` e la lista
   **sparisce dalla risposta**; `pool/index.js` mette `assigned[catUscite] = []` e nessuno lo dice.

**La riparazione**: collocare **offline** le uscite recenti (ultimi 18 mesi, o `>= 2025`) che passano un pavimento
permissivo (`vote_count >= 30`, `vote_average >= 6.2`) con `collocator.py` — che **esiste già ed è la "porta
d'ingresso"**, ma `motore.py` non lo chiama mai — e salvarle in una cache su disco
(`graph/data/uscite-collocate.npz`). A runtime: `score_nuovo(y) = att_s[b_y] * confidenza(y) * qualità(y)`.
Latenza <1 ms, **zero** ricostruzione della matrice.

## 9. Quattro meccanismi trasversali (valgono più delle singole righe)

### 9.1 Waterfall dedup
Oggi le righe del grafo sono `SLUG_ADDITIVI` e **non** usano `claimedIds`: lo stesso film può comparire **identico
in 3 righe**. Dopo, un set `gia_assegnati_globali` costruito **in ordine di specificità**:
1. prima le righe a bacino stretto: **nuove uscite, gemme, classici, punti d'incontro**;
2. poi **ultime visioni** e i **micro-cluster**;
3. infine **il tuo mondo** (bacino più grande) che riempie i suoi 60–80 slot **escludendo** ciò che è già preso,
   con al massimo una sovrapposizione ammessa coi micro-cluster.

### 9.2 Filtri a monte, non a valle
Oggi il grafo calcola su tutto e restituisce `cap = 60`; poi `idratazione.js` e `catalogHandler.js` tagliano per
`kidsMode` e `animePolicy`. Se un cluster è al 70% anime e l'utente ha `anime: 'exclude'`, la riga arriva a Stremio
con **8 titoli invece di 60**. Dopo: `animePolicy` e `kidsMode` viaggiano **dentro `opzioni`** della
`POST /raccomanda`; `motore.py` maschera **prima** del taglio `[:cap]`, così ogni lista esce **piena e già conforme**.

### 9.3 Anti-monopolio di saga e regista
`COLL` (peso 3) e `DIR` (peso 1) in `bubbles.py` legano fortissimo: i primi 10 per `r[x]` sono spesso i 6 film di
una saga. Regola: **max 1 titolo per `collection_id` TMDB** e **max 2 per regista** nei primi 20 slot di una riga.
E dentro una collezione si tiene il **titolo con `ANNO` minore** fra i non visti: se non ha visto *Dune — Parte
Uno*, non gli si propone *Parte Due*.

### 9.4 Rotazione morbida sulle impressioni
`recordRecommendationImpressions` scrive in MongoDB (`RecommendationImpression`) i titoli serviti a pagina 1, e
**nessuno li rilegge**: chi apre Stremio per 10 giorni vede gli stessi 5 film in cima. Dopo, senza invalidare la
cache del grafo: si leggono le impressioni degli ultimi **14 giorni** e si applica un soft-decay
`score_effettivo = score * 0.85^giorni_mostrato_in_home` ai titoli mostrati in pagina 1 per **≥3 giorni diversi**
senza essere visti. Non spariscono: scendono, e salgono i candidati dalla posizione 21–60.

## 10. Invarianti (valgono per ogni ticket)

- **Nessuna riga esce vuota in silenzio**: se una lista non si può riempire, lo **dichiara** (un campo, un log, un
  conteggio) — il difetto di `uscite_nuove` è nato esattamente da un silenzio.
- **Il pavimento di qualità non si abbassa** per riempire: meglio una riga corta e dichiarata che una riga piena di
  rumore.
- **La chiave di cache**: se cambia *ciò che entra* in una riga, la chiave va alzata. E un **guasto transitorio non
  si memorizza** (già così dal ticket 55: se le versioni del grafo non si risolvono, la riga non passa dalla cache).
- **La prova non vive nel prodotto** (decisione 34 della mappa `confini`): niente flag `simulate*` nel percorso caldo.
- **Verificare eseguendo, non leggendo**: i numeri di questo documento vengono da un'analisi del codice, non da una
  misura. **Ogni ticket comincia confermandoli** — se il codice dice altro, il ticket si ferma e dichiara la
  divergenza invece di adattare il codice a una premessa sbagliata.
