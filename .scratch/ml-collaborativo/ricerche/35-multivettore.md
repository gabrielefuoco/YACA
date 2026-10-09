# 35 — Il multi-vettore per macro-temi: idea giusta nella motivazione, chiusa nei fatti

**Data**: 08/10/2026 · set curato raddoppiato (61 sorgenti, 270 collegamenti, 56 falsi amici)
Verifica sulle sole sorgenti pari (mai usate per calibrare).

## L'idea e la motivazione (corretta)

"La media delle keyword introduce rumore; si salga di 2 livelli nella gerarchia (keyword -> L1 -> L2)
e si rappresenti il film con 1-4 macro-temi, ognuno col proprio vettore."

**La motivazione e' sostenuta da un fallimento misurato**: Il gabinetto del dottor Caligari ha **57 voti**
-> il teacher non lo copre -> la sua coordinata e' rumore. Ma il TEMA "espressionismo tedesco" ha
centinaia di film dietro -> il suo centroide dovrebbe essere robusto. Sembrava la cura giusta.

## I test (tutti misurati)

| rappresentazione | p3@10 | p2@20 | falsi | punteggio |
|---|---|---|---|---|
| **il nostro spazio (studente + teacher comportamentale)** | **40,3%** | **27,0%** | 11% | **56,2** |
| scorer di produzione (keyword gerarchiche) | 13,9% | 2,4% | 4% | 12,7 |
| **sacco di macro-temi L1** (overlap pesato con IDF) | **11,3%** | 1,6% | 4% | 9,3 |
| sacco di macro-temi L2 | 7,0% | 0,8% | 4% | 4,2 |
| centroidi dei temi L1, aggregazione a somma | 4,3% | 3,2% | 4% | 4,0 |
| centroidi dei temi L2, aggregazione a somma | 4,3% | 0,8% | 2% | 3,4 |
| centroidi L1, media pesata, top-1/2/4/20 | 0-5,5% | 0-1,8% | | |
| centroidi L1/L2, massimo | 0-5,5% | | | |

## Il bug di disegno trovato per strada (e perche' contava)

La prima versione aggregava con la **media** sui temi del candidato. Diagnostica su un caso reale
(LOTR): i collegamenti condividono **11 temi** con la sorgente — ma la media li **diluisce** (11 temi
condivisi + gli altri no -> la media scende) -> **il candidato che condivide PIU' temi veniva
penalizzato**, e finiva al rango 6.000-14.000. Con la somma/overlap l'ordine si raddrizza (11,3%).

**Lezione**: un'aggregazione a media premia chi ha pochi temi tutti centrati e punisce chi ne ha molti
condivisi — l'opposto di cio' che si vuole. L'aggregazione va scelta in base a cosa significa
"somiglianza", non per comodita'.

## La conclusione che vale piu' del test

| famiglia di rappresentazione | dove arriva |
|---|---|
| **solo contenuto**: keyword gerarchiche (produzione), macro-temi L1/L2, centroidi dei temi | **11-14%** |
| **contenuto + teacher comportamentale** (lo studente) | **40,3%** |

**Qualunque rappresentazione di solo contenuto si ferma all'11-14%, ed e' un soffitto di FAMIGLIA, non
di implementazione**: la produzione (13,9%), il sacco di temi L1 (11,3%), il sacco di temi L2 (7,0%),
i centroidi (4,3%) sono tutte variazioni dello stesso segnale — e nessuna si avvicina al 40%.

**Il vantaggio del nostro spazio viene dal teacher COMPORTAMENTALE** (la co-visione MovieLens via SVD),
non dai metadati: i metadati da soli valgono 11-14%, e il teacher li porta a 40%.

## L'ipotesi del rumore: refutata

Se il problema fossero i film freddi, il tema (robusto) li avrebbe salvati. Ma la rappresentazione a
temi e' **peggiore su tutto il set**, non solo sui film caldi: non e' una cura, e' un downgrade.

## Chiuso

Il multi-vettore per macro-temi e' chiuso. Il motivo non e' l'implementazione (l'ho corretta due volte,
con diagnosi): e' che **i livelli della gerarchia sono troppo grossi** (L1: 108 film per tema, L2: 423)
e i loro centroidi, pur discriminativi fra loro (coseno medio +0,077 contro +0,004 di due film a caso),
non battono il segnale che lo studente gia' estrae.
