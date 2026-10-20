Status: claimed
Type: bug
Blocked by: 09

# 10 — "Nuove uscite per te": il bug e la riparazione

## Il difetto, con le sue tre cause (da confermare una per una)

1. **Il canone è storico**: i 66.259 nodi vengono dalla co-visione Trakt/MovieLens. Le uscite 2025–2026 dei Parquet
   TMDB (`117.000 righe in `movies.parquet` e `tv.parquet`) **non ci sono** quasi mai. Il `README.md` del servizio
   lo ammette; `measure/liste.py` lo stampa (*"nessuna uscita 2025+ in questi mondi: servirebbe la porta d'ingresso
   per collocarle"*).
2. **L'imbuto in `motore.py`**: `nuove = [x for x in np.where(self.ANNO >= P.USCITE_NUOVE_DAL)[0] if
   int(self.MEM[x]) in set(bolle) and x not in visti]` — le novità si cercano **solo dentro le 1–4 bolle** del
   profilo (50–80 titoli su 66.259) e **senza** i vicini.
3. **Soppressione silenziosa**: se `titoli_raw` è vuoto, `servizio.py` fa `if not titoli_raw: continue` e la lista
   **sparisce** dalla risposta; `pool/index.js` mette `assigned[catUscite] = []`. Nessuno lo dice.

## Cosa deve uscire

1. **La porta d'ingresso esiste già e non si usa**: `collocator.py` *colloca* un titolo in una bolla dai suoi
   metadati TMDB. `motore.py` **non lo chiama mai** — verificalo.
2. **Collocazione offline, una volta sola**: si scansionano i Parquet per i titoli degli **ultimi 18 mesi** (o
   `>= 2025`) che passano un pavimento **permissivo per i recenti** (`vote_count >= 30`, `vote_average >= 6.2`);
   se sono già nei 66.259 nodi si legge la loro bolla, altrimenti si chiama `collocator.colloca(…)`. Il risultato si
   salva in **`graph/data/uscite-collocate.npz`** (cache su disco, si rigenera quando i Parquet cambiano).
3. **A runtime**: `score_nuovo(y) = att_s[b_y] * confidenza(y) * qualità(y)`, con `att_s` l'attivazione dei mondi
   dell'utente. **Latenza <1 ms, zero ricostruzione della matrice.**
4. **Mai più in silenzio**: se la lista resta vuota dopo la riparazione, la risposta **lo dichiara** (un campo, un
   log con il conteggio dei candidati collocati e di quelli scartati dal pavimento).

## La prova

- **Il prima**: una misura che mostri la lista vuota (o quasi) con la causa — quanti titoli recenti collocabili
  esistono nei Parquet e quanti ne arrivano oggi nella lista.
- **Il dopo**: la lista non vuota, con titoli **realmente** recenti (controlla le date nel test), e un
  `--fixture` che non dipende dai Parquet veri (altrimenti non è eseguibile in CI).
- Suite alla baseline.

## Trappole

- I Parquet **non sono in git** e in CI possono mancare: la sonda deve degradare dichiarandolo, non esplodere.
- La collocazione è una **stima**: la confidenza va portata nel punteggio, non ignorata.
- Non allargare `USCITE_NUOVE_DAL` per far comparire titoli: sarebbe barare sul significato della riga.

## Regole comuni a ogni ticket di questo cantiere

- **Prima di toccare il codice, conferma le premesse** elencate in "Verifica prima". Vengono da un'analisi
  statica, non da una misura: se il codice dice altro, **fermati** e scrivi la divergenza nell'Esito invece di
  adattare il codice a una premessa sbagliata.
- **Verificare eseguendo, non leggendo.**
- Baseline suite **misurata**: `5 suite rosse / 8 test falliti / 1898 passati` (190 suite). Le sole ammesse:
  `animeOverridesCertify`, `candidateProvider`, `donghuaCatalog`, `duckDbAndMatchmaker`, `presetBurtonOrdering`.
- **Il frontend non si tocca.** Niente `git push`. Niente `npm run build` / `tsc`. Non si tocca la produzione.
- **La prova non vive nel prodotto**: niente flag `simulate*` nel percorso caldo.
- **Ogni riga che non si riesce a riempire lo dichiara**: nessuna lista sparisce senza dirlo.
- **Il pavimento di qualità non si abbassa per riempire.**

---

## Verifica delle premesse (20/10/2026, integratore)

1. **Canone storico — non verificabile qui, dichiarato da due fonti.** I Parquet TMDB non sono in questo checkout
   (`ROOT/.cache/tmdb` assente) e l'artefatto del canone nemmeno: la premessa sta nel `README` del servizio e nella
   riga che `measure/liste.py` stampa («nessuna uscita 2025+ in questi mondi»). Non la si può misurare da qui: la
   sonda la sostituisce con un fixture che **non ha** titoli 2025+ nel canone.
2. **L'imbuto — vero, e ora c'è una prova che morde.** `nuove = [...] if int(self.MEM[x]) in set(bolle)` cercava le
   novità **solo fra le bolle del profilo**, senza i vicini. La sezione 2b della sonda costruisce un grafo a 12
   mondi in cui `bolle` si ferma ai primi quattro e mette un titolo 2026 in un mondo **vicino** (ultimo dell'anello)
   e uno in un mondo **lontano**: entra il primo, non il secondo.
3. **Soppressione silenziosa — non esiste più, l'ha chiusa il `07`.** `servizio.py` non ha più
   `if not titoli_raw: continue`: restituisce la riga con `vuota: true`, `motivo` e il motivo anche nei `motivi`
   della risposta. La premessa del ticket era scritta prima del `07`. Resta vero il lato **consumatore**
   (`src/pool/index.js` mette `assigned[...] = []` e non legge `motivi`), che è del `13` e non si tocca qui.

## Decisioni prese prima del codice (20/10/2026)

- **La cache è un artefatto del modulo**, non una cache scaricata: sta in `services/graph/data/` come gli altri
  (`canon.DATA`), perché è il risultato di un lavoro nostro. Porta `schema`, data di generazione e **impronta dei
  Parquet**: se i Parquet cambiano, la cache lo dichiara (non si rigenera da sola a runtime: la collocazione costa
  minuti e non è un lavoro del servizio).
- **Chi la genera**: `python -m graph.uscite`, **dove ci sono i Parquet TMDB e gli artefatti dei centroidi**
  (il mate, `services/graph/data` montato). Non in CI. Non in questo ticket: generarla qui è impossibile (dati
  assenti) e generarla in produzione sarebbe toccare la produzione — si dichiara e si propone.
- **Due fonti, mai mescolate**: con la cache si usa **solo** la cache (i titoli già nel canone ci sono dentro, con
  bolla letta e confidenza 1.0); senza cache si usa il canone storico **con i vicini**, e la riga dichiara
  `fonte: canone`. Mescolarle darebbe punteggi su scale diverse nella stessa lista.
- **La qualità è quella del motore**: voto bayesiano con `BAYESIAN_M/C` e `RANKING_BAYES_BASE`, nessun numero nuovo.
- **Non si allarga `USCITE_NUOVE_DAL`**: il taglio resta l'anno dichiarato, per la cache e per il canone.
- **`attivazione` della riga**: la media dei punteggi non è confrontabile fra le due fonti, quindi il motore manda
  l'attivazione dei mondi da cui la riga pesca (come per i ponti del `09`).
