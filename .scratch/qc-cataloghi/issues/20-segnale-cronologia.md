# 20 — Il segnale della cronologia: 30 recenti + il DNA del resto

**Stato**: `chiuso` 07/10/2026 · sei opzioni simulate, scelta E (decadimento) applicata e in produzione (immagine `19a6d63`)

## Problema

`SEED_SIGNAL_LIMITS.watched = 15` (`src/engines/hybrid/catalogStrategies.js`): il builder ordina i titoli visti per data e
prende **solo i 15 più recenti**. Conseguenza misurata: un utente con 50 e uno con 100 visioni ricevono la **stessa lista,
identica al 100%**. Tutta la cronologia oltre la quindicesima voce è invisibile al motore.

## Soluzione (proposta dell'utente, da simulare prima di applicare)

> «Si potrebbero prendere i 30 più recenti (circa 1-2 mesi di visione) e per tutto il resto fare un calcolo a parte del
> DNA e mediarli (65% nuovo, 35% vecchio), o qualcosa del genere — **simulare e vedere varie opzioni**.»

Quindi: **non** si applica una scelta a scatola chiusa. Si costruisce un banco che misura più opzioni sullo stesso
profilo simulato, e si sceglie sui numeri.

### Le opzioni da confrontare (almeno queste, altre sono benvenute)

| | Segnale usato come semi |
|---|---|
| **A** (oggi) | i 15 visti più recenti |
| **B** | i 30 visti più recenti |
| **C** | 30 recenti + un campione casuale (seed fisso) del resto |
| **D** | 30 recenti + il resto **pesato per affinità col DNA** (i titoli del passato che somigliano al gusto di adesso pesano di più) |
| **E** | tutta la cronologia con peso che decade nel tempo (half-life ~60 giorni) |

La proposta dell'utente è una variante di **D** con pesi espliciti (65% recente / 35% resto): va inclusa come opzione a sé.

### Come si misura (banco offline, sul parquet locale)

Su due profili simulati con cronologia nota (50 e 100 visti, coerente col gusto — riusare gli spec del ticket 19):

1. **Monotonía**: la lista a 100 visti è diversa da quella a 50? (oggi: identica). Misura: Jaccard fra le due liste.
2. **Pertinenza**: quota dei titoli serviti che appartengono ai cluster del gusto (e mediana voto/anno).
3. **Stabilità**: aggiungendo **un** titolo visto, quanti dei primi 20 cambiano? (una lista che si rimescola a ogni
   visione è peggio di una stantia).
4. **Costo**: ms di costruzione dei semi e numero di righe passate a DuckDB.
5. **Copertura della storia**: quanti dei 50/100 titoli visti contribuiscono davvero ai semi (oggi: 15 su 100).

### Criteri di accettazione

- Tabella comparativa delle 5+ opzioni con le 5 misure sopra, per entrambi i profili.
- Una **raccomandazione motivata** con il numero che la sostiene, e l'elenco di ciò che l'opzione scelta peggiora.
- Nessuna modifica a `src/` in questo ticket: prima si misura, poi (con l'ok) si applica.
