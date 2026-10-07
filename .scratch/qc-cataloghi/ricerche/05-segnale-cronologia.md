# 05 — Segnale della cronologia: benchmark offline delle opzioni di seed (Ticket 20)

**Stato**: completato · **Data**: Ottobre 2026 · **Ambiente**: Offline (DuckDB in-memory su `.cache/tmdb/movies.parquet`)  
**Riferimento issue**: [.scratch/qc-cataloghi/issues/20-segnale-cronologia.md](../issues/20-segnale-cronologia.md)  
**Contesto precedente**: [04-hero-cold-start.md](04-hero-cold-start.md) §3.2

---

## 1. Problema e Motivazione

Nel catalogo hero Seed Network (`src/engines/hybrid/catalogStrategies.js`), il builder dei seed reali applicava la costante rigida:
```javascript
const SEED_SIGNAL_LIMITS = Object.freeze({ loved: 20, liked: 15, watched: 15, library: 15 });
```
I titoli della cronologia (`WatchHistory`) vengono ordinati per data decrescente e ne vengono estratti tassativamente **solo i primi 15**.

### Conseguenza misurata
Un utente con 50 visioni e uno con 100 visioni (con i 15 titoli recenti coincidenti) ricevono **esattamente la stessa lista, identica al 100% (Jaccard = 1.000)**. Tutta la cronologia dal 16° titolo in poi è cieca per il motore.

La proposta iniziale del proprietario suggeriva:
> *«Si potrebbero prendere i 30 più recenti (circa 1-2 mesi di visione) e per tutto il resto fare un calcolo a parte del DNA e mediarli (65% nuovo, 35% vecchio), o qualcosa del genere — simulare e vedere varie opzioni.»*

Questo report documenta il benchmark offline che confronta 6 opzioni sullo stesso profilo simulato (**Otaku Hardcore**, contesto `1c1da0af`), misurando numericamente il trade-off fra monotonia, pertinenza, stabilità, costo e copertura.

---

## 2. Le 6 Opzioni a Confronto

| Sigla | Strategia | Logica di selezione e pesi dei semi |
|---|---|---|
| **A** (Oggi) | 15 più recenti | `slice(0, 15)`, peso uniforme $w = 2.0$. Cap fisso a 15 semi. |
| **B** | 30 più recenti | `slice(0, 30)`, peso uniforme $w = 2.0$. Cap fisso a 30 semi. |
| **C** | 30 recenti + sample | 30 recenti ($w = 2.0$) + campione deterministico (PRNG Mulberry32, seed 42) del resto fino a 15 titoli ($w = 1.0$). |
| **D** | 30 recenti + affinità DNA | 30 recenti ($w = 2.0$) + fino a 15 titoli storici con la più alta affinità VSM con il DNA Otaku ($w \propto \text{affinità}$). |
| **E** | Decadimento temporale continuo | Tutta la storia con decadimento esponenziale (half-life = 60 giorni): $w_i = 2.0 \cdot 2^{-\Delta t / 60}$. Nessun cutoff rigido. |
| **F** | Variante proprietario (65/35) | 30 recenti ($w \approx 2.0$, 65% della massa semi) + calcolo del DNA storico $V_{\text{past}}$ sul resto della storia miscelato al DNA attivo (65% base + 35% storico) e top 10 semi storici ($w \approx 1.05$). |

---

## 3. Tabella Comparativa dei Risultati

La simulazione è stata eseguita su due profili: **User 50** (25 film / 50 visioni totali) e **User 100** (50 film / 100 visioni totali) estratti dalle specifiche ufficiali `.scratch/qc-cataloghi/runs/hero-coldstart.spec.json`.

| Opzione | Monotonia (Jaccard 50 vs 100) | Copertura U50 (film / tot) | Copertura U100 (film / tot) | Pertinenza Cluster (U50 / U100) | Voto Mediano (U50 / U100) | Anno Mediano (U50 / U100) | Stabilità (+1 titolo) U50 / U100 | Latenza Pipeline U50 / U100 | Righe DuckDB U50 / U100 |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| **A** (Oggi) | **1.000** (20/20 uguali) | 15/25 (60%) | 15/50 (30%) | 100% / 100% | 7.75 / 7.75 | 2016 / 2016 | 1/20 / 1/20 | 995 ms / 927 ms | 110 / 110 |
| **B** | **1.000** (20/20 uguali) | 25/25 (100%) | 30/50 (60%) | 100% / 100% | 7.88 / 7.88 | 2016 / 2016 | 1/20 / 1/20 | 2316 ms / 2209 ms | 184 / 218 |
| **C** | **0.600** (15/20 uguali) | 25/25 (100%) | 45/50 (90%) | 100% / 100% | 7.88 / 7.81 | 2016 / 2016 | 1/20 / 1/20 | 1628 ms / 4134 ms | 184 / 346 |
| **D** | **0.667** (16/20 uguali) | 25/25 (100%) | 45/50 (90%) | 100% / 100% | 7.88 / 7.81 | 2016 / 2016 | 1/20 / 1/20 | 1630 ms / 3018 ms | 184 / 350 |
| **E** | **0.600** (15/20 uguali) | **25/25 (100%)** | **50/50 (100%)** | 100% / 100% | 7.88 / 7.81 | 2016 / 2016 | **1/20 / 0/20** | **1623 ms / 2990 ms** | 184 / 386 |
| **F** | **0.818** (18/20 uguali) | 25/25 (100%) | 50/50 (100%) | 100% / 100% | 7.88 / 7.66 | 2016 / 2016 | 1/20 / 1/20 | 1889 ms / 4003 ms | 184 / 301 |

---

## 4. Analisi Dettagliata per Dimensione

### 4.1 Monotonia (Differenziazione tra 50 e 100 visti)
- **Opzione A e B falliscono completamente**: entrambe restituiscono Jaccard = **1.000**. Portare il cap da 15 a 30 (Opzione B) non differenzia l'utente a 50 dall'utente a 100 perché i primi 25 film della cronologia sono identici e i soli 5 film extra non hanno peso sufficiente per superare i filtri di qualità e i diversity caps.
- **Opzione F mitiga poco**: con Jaccard = **0.818**, 18 titoli su 20 rimangono identici. Il peso dominante del 65% sui 30 recenti continua a schiacciare il 35% del segnale storico.
- **Opzioni C ed E eccellono**: Jaccard = **0.600** (5 titoli nuovi su 20, 25% di differenziazione attiva), garantendo che l'utente a 100 visioni percepisca un catalogo evoluto rispetto a quando ne aveva 50.

### 4.2 Pertinenza e Qualità del Gusto
- Tutte le opzioni mantengono il **100.0%** dei titoli raccomandati all'interno dei cluster tematici Otaku (`seinen`, `isekai`, `mecha`, `battle`).
- Il voto mediano sale da 7.75 (Opzione A) a 7.81–7.88 (Opzioni B, C, D, E), poiché l'espansione dei semi fa emergere un pool più ricco di candidati ad alto rating (es. *Demon Slayer: Mugen Train*, *Your Name*, *La città incantata*, *A Silent Voice*).
- Nell'Opzione F si nota un lieve degrado qualitativo su User 100 (voto mediano 7.66) causato dalla miscelazione artificiale di vettori DNA che attenua la focalizzazione dei cluster primari.

### 4.3 Stabilità (+1 titolo visto)
All'aggiunta di *La tomba delle lucciole* (TMDB 12477, daysAgo: 0):
- Su User 50, tutte le opzioni registrano 1 solo titolo modificato nella top 20 (95% di stabilità, entra il nuovo capolavoro e slitta il 20°).
- Su User 100, **l'Opzione E è l'unica a registrare 0 modifiche (100% di stabilità)**. La ponderazione continua su 50 semi con decadimento graduale assorbe la nuova visione senza shock o rimescolamenti caotici della lista.

### 4.4 Copertura della Storia
- **Opzione A**: solo 15 su 50 film (30%) contribuiscono. Il 70% della storia dell'utente è sprecato.
- **Opzione B**: solo 30 su 50 film (60%) contribuiscono.
- **Opzioni C e D**: 45 su 50 film (90%).
- **Opzioni E ed F**: **50 su 50 film (100%)** contribuiscono al segnale di personalizzazione.

### 4.5 Costo Computazionale (DuckDB)
- Opzione A è la più rapida (~927 ms per 15 query).
- Opzioni C ed F pagano un costo elevato (~4.0–4.1 s) a causa di sample non indicizzati e overhead di ricomputo del DNA.
- **Opzione E richiede solo 2.99 s per interrogare tutti i 50 semi in memoria**, rimanendo ben al di sotto della soglia di latenza dei cataloghi hero (interamente calcolati in background o durante la prima build del profilo).

---

## 5. Raccomandazione Finale e Razionale

### Raccomandazione: **Opzione E (Decadimento temporale continuo, half-life 60 giorni)**

#### Il numero che la sostiene:
1. **Copertura**: **100% della storia visioni attiva** (50/50 film su User 100 e 25/25 su User 50), contro il 30% dell'Opzione A e il 60% dell'Opzione B.
2. **Monotonia**: Jaccard **0.600** (5 titoli distintivi su 20 tra User 50 e User 100, risolvendo il blocco dell'1.000).
3. **Stabilità**: **0 cambi su 20 (100% stabilità)** all'aggiunta di una visione su User 100, garantendo che la lista non vibri ad ogni visione.
4. **Costo**: **2.99 s** su 50 semi, oltre 1 secondo più veloce dell'Opzione C (4.13 s) e dell'Opzione F (4.00 s).

### Cosa peggiora l'Opzione E rispetto a oggi (Trade-off):
1. **Latenza DuckDB**: passa da 927 ms (Opzione A con 15 semi) a 2.990 ms (+2.06 s). Su profili con storie molto lunghe (es. 200+ film), è consigliabile applicare un floor $w \ge 0.20$ (~180 giorni) o un cap massimo di 60 semi per evitare che il tempo superi i 4 secondi.
2. **Volume di candidati**: le righe estratte da DuckDB passano da 110 a 386 (+250%), aumentando l'uso di memoria transitoria durante lo scoring VSM.

---

## 6. Limiti e Aspetti non Misurati Offline

1. **Token Trakt reale**: nel benchmark offline non sono state effettuate chiamate all'API remota di Trakt (vietata dalla natura offline del ticket). I semi analizzati provengono unicamente dai segnali reali memorizzati (`WatchHistory`).
2. **Rendering Stremio**: è stato misurato l'output strutturale dell'engine (ID TMDB, score VSM, ranking, metadata DuckDB); non è stato simulato l'arricchimento poster/badge su client Stremio.
3. **Cache Redis**: in ambiente offline locale su Windows Redis non è attivo; le misure di costo rappresentano il calcolo *cold-run* puro a latenza zero di DuckDB.
