# Ticket 04 — La coerenza sulla trama: l'arbitro c'è, e assolve V3

`Status: resolved` · 14/10/2026, **aggiornato il 15/10** · `04c` → `04i`

## ⚠️ RISCRITTO IL 15/10/2026 — l'esito negativo era colpa del modello sbagliato

La prima versione di questo report concludeva che la metrica «non discrimina» e che il ticket andava
chiuso con esito negativo. **Era misurato con `bge-small-en`**, che comprime tutte le trame italiane in
**0,74 ± 0,01** — non e' italiano, e su una fascia cosi' stretta nessun confronto separa.

Con **`qwen3-embedding:0.6b` via Ollama**, payload **«titolo. trama»**, la metrica **funziona**:

| | Sim_trama media | sui casi che il banco da' GIUSTI | sugli SBAGLIATI | scarto |
|---|---|---|---|---|
| V1 | 0,5165 | 0,5172 | 0,5152 | **+0,002** |
| **V3** | **0,5223** | **0,5337** | 0,5162 | **+0,018** |

**La metrica discrimina la correttezza di V3 (+0,018) e quasi non vede quella di V1 (+0,002)**, e nel
testa a testa V3 e' avanti 142 a 133. Cioe': **la misura non circolare — l'unica che non usa le
feature del collocatore — da' ragione a V3**, mentre il banco lo punisce di 28 punti.

E il terreno di verita' del mio primo test era sbagliato: chiedevo di trovare simili due film della
**stessa saga**, ma *Toy Story 2* e *Toy Story 5* raccontano storie **diverse** — e' il mestiere del
sequel. Coi **film gemelli** (*Armageddon/Deep Impact*, *Capote/Infamous*) il modello separa 0,641
contro 0,327.

**Il verdetto finale e' quindi doppio, e regge su misure diverse:** V1 per la **bolla** (il banco, 63,0%
contro 35,3% — la differenza e' enorme e comportamentale), V3 per i **dieci titoli** (la trama, +0,018
— la differenza e' piccola ma semantica). Il disegno a due livelli non e' un compromesso: **e' quello
che due arbitri indipendenti prescrivono.**

---

## La versione originale (esito negativo), conservata perche' la storia conta

**Il processo è valido, la metrica no.** Gli embedding delle trame si fanno, si conservano e si
riprendono — **35.529 trame in 16,5 minuti** a 28 ms l'una, 52 MB, cache ripartibile. Ma la metrica
costruita su quegli embedding **non discrimina niente**, e il verdetto su V1 contro V3 è: **pari**.

---

## Il processo: valido

| | |
|---|---|
| embedder | **`BAAI/bge-small-en-v1.5`**, lo stesso di `build_graph.py` (richiesta dell'utente) |
| trame disponibili | 35.829 nel canone, **42,3%** del parquet |
| costo | **28 ms l'una · 16,5 minuti per tutte** |
| cache | `04-trama-emb.npy` (52 MB) + `04-trama-idx.npy`, **ripartibile** (la ripresa ha funzionato al primo colpo) |
| hardware | il torch installato è la build **+cpu**, quindi la GPU accesa **non è usabile** da questo ambiente. Reinstallare torch con CUDA costa ~2,5 GB **per risparmiare 15 minuti**: non ne vale la pena, e la decisione è scritta |

## Il controllo che avevo sbagliato, e poi corretto

Nel primo tentativo avevo concluso che il modello **non separa** le trame italiane:
*Gone Girl* a **+0,542** da *Toy Story* e a **+0,487** da *Fight Club*. **Era un artefatto del mio
match dei titoli.** `trova()` cercava per **sottostringa**, quindi:

- `"Toy Story"` restituiva **Toy Story 5** (2026), non il primo;
- e a seconda dell'ordine delle righe del parquet, `"Gone Girl"` poteva essere **Umjolo: The Gone
  Girl** (una commedia sudafricana) e `"Fight Club"` poteva essere **Knuckledust - Fight Club**.

Con i film giusti (match per titolo **esatto**):

| | coseno |
|---|---|
| simili: Gone Girl/Shutter Island · Gone Girl/Fight Club · Inception/Interstellar · Fight Club/Shutter Island | **+0,723** |
| diverse: Gone Girl/TS · Fight Club/TS · Inception/La sirenetta · Shutter Island/La sirenetta | **+0,617** |
| caso peggiore | **0,718** (simile più bassa) contro **0,661** (diversa più alta) → **separa** |

## Il reranker: inutilizzabile, e l'utente aveva ragione a dubitarne

`bge-reranker-v2-m3`, sulle stesse otto coppie: **tutti gli score fra 0,000 e 0,004**, separazione
**+0,000**. Non è un difetto del modello: un **cross-encoder** valuta una coppia **asimmetrica** —
una domanda e un documento che dovrebbe rispondere — e su due trame simmetriche non ha niente da
dire. **Da non usare per questa domanda.** Il dubbio dell'utente era fondato.

## La metrica: non discrimina

```
Sim_trama = media del coseno di trama fra la serie e i suoi 10 vicini più prossimi

V1 (pesi grezzi)      0,7437   · mediana 0,7406   · 107 casi avanti
V3 (pesi per tipo)    0,7480   · mediana 0,7394   · 100 casi avanti

differenza media +0,0042 · mediana +0,0000 · positiva nel 48,5% dei casi
campione: 334 serie su 600 (55,7%), quelle con una trama e almeno un vicino con trama
```

**Indistinguibili.** E il controllo incrociato chiude la questione: i casi che il banco dà **sbagliati**
hanno trame **più simili** (0,7477) di quelli che dà **giusti** (0,7419).

La ragione è geometrica e la conosciamo: `bge-small-en` comprime tutte le trame italiane in
**0,74 ± 0,01**. Su una fascia così stretta nessun confronto discrimina, esattamente come per i
coseni fra centroidi del ticket 07.

**Cosa servirebbe perché la metrica funzioni** (e non è detto che valga la pena): una similarità
**centrata** sulla media del catalogo, invece del coseno grezzo; oppure un modello multilingue, che
sulle trame italiane darebbe vettori non compressi a 0,74. Nessuna delle due è stata provata.

---

## Il verdetto su V3, che è il motivo per cui li ho fatti

| prova | V1 | V3 |
|---|---|---|
| banco (propria bolla, LOO esatto) | **63,0%** | 35,3% |
| banco + promozioni semantiche | **87,3%** | 69,3% |
| similarità di trama coi vicini | 0,7437 | 0,7480 — **pari** |

**V3 non porta niente, su nessuna misura che generalizzi.** Il miglioramento che avevo visto sui
vicini di *Verity* — *Le Grand Jeu*, *El páramo* al posto di *Cinquanta sfumature* — è **reale ma
locale**: è un caso che ho guardato, e V3 lo ripara. Su 600 serie non si vede.

**È un selection effect, ed è l'errore più istruttivo di questa sessione.** L'obiezione dell'utente su
*Verity* era giusta **su Verity**, e io l'ho generalizzata in un cambio di progettazione senza
verificarla su un campione. Per due volte l'utente aveva corretto una mia conclusione presa dalle
metriche; questa volta ho corretto una decisione presa dal suo occhio, ed era un caso singolo.

**Decisione:** V1 per la **bolla** (63,0%). Per i dieci titoli da mostrare resta V3, ma **dichiarato
come scelta basata sull'occhio e non sulla media** — l'unica prova a suo favore è il caso di *Verity*,
e la metrica che avrebbe dovuto confermarla non discrimina. È l'unico punto di questa sessione in cui
la decisione non ha un numero dietro, e va scritto invece che nascosto.
