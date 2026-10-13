# 43 — Il ciclo di bootstrap: la premessa non regge (misurato)

**Domanda di partenza**: il ciclo `cluster → classificatore Pc→foglia → riassegna i titoli a bassa copertura → aggiungi archi → riclusterizza → ripeti`. Il test di bootstrap dava 49,7% di foglia esatta e 84,6% di famiglia, e sembrava autorizzarlo.

**Risposta: no.** Tre misure indipendenti dicono che il ciclo non porta niente — e la terza spiega perché non poteva. In compenso la sessione produce un numero positivo, e più utile: **la curva della curatela**.

Tutti gli script sono in `.scratch/ml-collaborativo/` (`boot-0` … `boot-5`), il protocollo è quello di `etero2.py`: curatela dal solo pari, misurata sui **1.002 legami cross-medium dei dispari**, mai entrati nel grafo.

---

## 1. La prima cosa che salta: la "bassa copertura" per grado non esiste

Il bootstrap doveva "riassegnare i titoli a bassa copertura". Nel grafo unito:

| misura | valore |
|---|---|
| grado minimo di un titolo | **16** |
| titoli con grado ≤ 10 | **0** |
| grado mediano | 55 · media 77,5 |
| titoli a ≤2 salti da una sorgente curata | 62.422 (**94,2%**) |

Il grafo è denso per costruzione (15 vicini di contenuto per nodo): **nessuno è isolato**. Il "titolo a bassa copertura" in questo grafo non è un titolo con pochi archi — è un titolo **che la curatela non ha mai toccato**:

| popolazione | nodi |
|---|---|
| toccati da un legame scritto a mano (tutti i 499) | 2.378 (**3,6%**) |
| toccati dalla sola metà pari (quella nel grafo) | 1.459 (2,2%) |
| **mai toccati da alcun legame curato** | **63.881 (96,4%)** |

Questo è il vero bersaglio del bootstrap, ed è quasi tutto il catalogo. Il che è già un problema: se la struttura curata deve raggiungere il 96,4% dei titoli per via algoritmica, il segnale da propagare è lo 0,07% degli archi.

## 2. Il grafo riprodotto esattamente (la verifica, prima di ogni numero)

Prima di misurare qualsiasi cosa ho ricostruito il grafo da zero e l'ho confrontato con `leiden-graph.npz`:

```
ricostruito 5.136.110 archi · cache 5.136.110 archi
differenza massima per arco: 0.00e+00
archi con differenza > 1e-6: 0
>>> RIPRODUCE ESATTAMENTE
```

**Bit per bit.** Da lì in poi i componenti sono cachati (`boot-C/B/T/Kall/Kpari.npz`) e ogni esperimento compone `M = C + B + T + 6·K` in secondi invece di ricostruire tutto.

## 3. Due grafi, due mestieri (scoperta collaterale, ma importante)

Ricostruire il grafo da zero ha rivelato una cosa che nessuno aveva misurato: **il grafo su cui girano i cluster del report 42 non è il grafo buono per il recupero.**

| composizione | @10 | @50 | @100 | @500 |
|---|---|---|---|---|
| stile `leiden2` (somma non rinormalizzata, curatela ×6) — **quello dei cluster** | 2,8% | 15,0% | 24,6% | 41,9% |
| stile `etero2` (normalizza dopo la somma, curatela 0,88) — **quello del recupero** | **11,2%** | 22,0% | 28,3% | 48,8% |

Il grafo dei cluster vale **4 volte meno** per il recupero. Non è un errore di nessuno: la somma non rinormalizzata fa dipendere il peso di un nodo dalla sua curatela, e per la modularità è un vantaggio — per la random walk è un danno.

**Conseguenza**: la spreading di riferimento riproduce il **10,4%** del report 41 (11,2% con i temi). Il riferimento è riprodotto, e ho anche trovato i temi che valgono **+0,7 punti** (10,5% → 11,2%).

Ho sbagliato io la prima misura: avevo usato la composizione di `leiden2` anche per il recupero, ottenendo 2,8% e credendo di aver sbagliato qualcosa. Non era un bug — era il grafo sbagliato per quel mestiere.

## 4. Il test decisivo: sette armi, un verdetto

Il classificatore predice il cluster dal contenuto (accordo col cluster reale: **71,5%**). Poi ogni arma propone **10 film** per una serie e si conta quanti legami veri cadono nel top-10.

| arma | @10 | @50 | @100 | @500 | @2000 |
|---|---|---|---|---|---|
| **A0 spreading sul grafo (riferimento)** | **11,2%** | **22,0%** | **28,3%** | **48,8%** | **68,5%** |
| A1 contenuto cross-medium | 5,9% | — | — | — | — |
| **A2 contenuto nel cluster PREDETTO (il bootstrap)** | **5,7%** | — | — | — | — |
| A3 contenuto nel cluster che il GRAFO assegna alla sorgente | 8,0% | — | — | — | — |
| A4 nullo · pool casuale di pari taglia | 0,3% | — | — | — | — |
| A5 spreading su grafo arricchito con pseudo-curatela | 5,5% | 20,9% | 27,3% | 44,6% | 66,3% |
| A6 pool = cluster predetto, ordine = spreading | 5,9% | — | — | — | — |

Tre cose, in ordine di importanza:

1. **A2 non batte A1** (5,7% contro 5,9%). Il cluster predetto dal contenuto **non aggiunge niente al contenuto da solo**. Il bootstrap, nella sua forma centrale, è a zero.
2. **A5 peggiora il riferimento di metà** (11,2% → 5,5%). Aggiungere gli archi pseudo-curatela al grafo **distrugge** il recupero: gli archi predetti iniettano risposte sbagliate con sicurezza, e il contributo della spreading che arrivava per camminata viene annegato. Non è un pareggio: è un danno.
3. **A4 conferma che la misura è viva**: il pool casuale fa 0,3%. Se avessi avuto un bug da qualche parte, il nullo non sarebbe a 0,3%.

E una cosa notevole: **A3 (il cluster del grafo) batte A2 (il cluster predetto)** — 8,0% contro 5,7%. Il grafo sa già dove sta un titolo meglio di quanto il contenuto sappia prevederlo. Il classificatore, in questa architettura, **toglie** informazione.

## 5. Il tetto: la copertura del pool

L'architettura "pool + ranking" (quella proposta in chiusura del report 42) ha un tetto ovvio che nessuno aveva misurato: **se il bersaglio non è nel pool, nessun ordinamento lo troverà mai.**

| pool | copertura dei 1.002 legami |
|---|---|
| cluster che il GRAFO assegna alla sorgente `L[s]` | 36,5% |
| cluster PREDETTO dal contenuto | 30,5% |
| uno dei due | 40,7% |

**Il pool copre meno della spreading raggiunge**: 40,7% contro 68,5% @2000. L'architettura non può vincere in profondità, per costruzione.

E la copertura **peggiora** se il pool è più fine, mentre il pool grosso copre ma non informa:

| risoluzione | cluster | coper. `L[s]` | coper. predetto | uno dei due |
|---|---|---|---|---|
| 0,5 | 6 | 47,7% | 48,8% | **55,5%** |
| 1,0 | 19 | 42,3% | 40,4% | 46,7% |
| 2,0 | 42 | 37,4% | 33,6% | 42,5% |
| 3,0 | 74 | 36,5% | 30,5% | 40,7% |
| 5,0 | 163 | 31,6% | 21,9% | 34,3% |
| 10,0 | 325 | 25,6% | 14,7% | 28,6% |

E il pool+ranking, a ogni granularità, non batte mai il riferimento:

| arma | @10 | @50 | @100 | @500 | @2000 |
|---|---|---|---|---|---|
| A0 spreading puro | **11,2%** | **22,0%** | **28,3%** | **48,8%** | **68,5%** |
| pool `L[s]` · res 0,5 (6 cluster) | 9,2% | 16,7% | 21,8% | 35,9% | 43,5% |
| pool `L[s]` · res 1,0 (19) | 10,1% | 17,1% | 21,9% | 34,0% | 40,3% |
| pool `L[s]` · res 2,0 (42) | 9,5% | 15,2% | 19,3% | 29,1% | 35,1% |
| pool `L[s]` · res 3,0 (74) | 9,9% | 16,3% | 20,0% | 29,4% | 34,5% |

**Non esiste una granularità giusta.** Il pool grosso converge verso il riferimento ma resta sotto; il pool fine perde i bersagli. La spreading senza pool li batte tutti.

## 6. Perché il bootstrap non poteva funzionare

Questa è la misura che chiude la questione. Accordo del classificatore col posto che il grafo assegna ai titoli:

| popolazione | accordo |
|---|---|
| nodi **senza alcun legame curato** (63.881) | **72,0%** |
| nodi **toccati dalla curatela** (2.378) | **57,7%** |
| con 1 arco curato | 59,5% |
| con 2-3 archi curati | 52,8% |
| con 4+ archi curati | 57,0% |

E per grado, dentro la fascia che il bootstrap-test aveva letto come incoraggiante:

| grado | accordo su tutti | accordo sui **soli nodi curati** |
|---|---|---|
| 0-30 | 84,2% (6.051 nodi) | 62,5% (8 nodi) |
| 31-50 | 66,9% (24.431) | 54,9% (133) |
| 51-80 | 71,3% (14.924) | 60,6% (193) |
| 81-150 | 73,9% (13.453) | 61,1% (581) |
| 151+ | 72,5% (7.400) | 56,1% (1.463) |

**La lettura del test di bootstrap era rovesciata.** Il "67,5% sui titoli isolati contro 41,5% sui titoli con molti archi" non dice "il classificatore sa collocare l'ignoto": dice **"il classificatore sa riprodurre le collocazioni che il contenuto ha già determinato"**. Dove il titolo è isolato, il suo posto nel grafo *viene dal contenuto* — e il classificatore, che usa il contenuto, lo azzecca. Dove la curatela ha messo lo zaino, il classificatore sbaglia il 42% delle volte.

Cioè: **il classificatore è preciso esattamente dove non c'è niente da imparare, e impreciso esattamente dove servirebbe.** La struttura curata non si trasferisce col contenuto perché il contenuto non la contiene. Era la circolarità che il handoff segnalava come rischio; ora è un numero.

## 7. Il risultato positivo: la curva della curatela

Se il meccanismo che funziona è la camminata (`serie → pari contenutistico → film curato`), allora la leva non è un algoritmo migliore: è **più curatela**. Quanto vale? Grafo costruito con il 25/50/75/100% delle sorgenti pari, sempre misurato sugli stessi 1.002 legami dispari tenuti fuori:

| curatela nel grafo | sorgenti | legami | nodi | @10 | @50 | @100 | @500 | @2000 |
|---|---|---|---|---|---|---|---|---|
| **nessuna** (solo contenuto+co-vis+temi) | 0 | 0 | 0 | 3,1% | 6,1% | 7,9% | 28,4% | 55,6% |
| 25% | 62 | 437 | 458 | 5,8% | 10,8% | 16,2% | 36,2% | 60,1% |
| 50% | 125 | 899 | 853 | 7,8% | 14,2% | 19,8% | 41,3% | 63,7% |
| 75% | 187 | 1.345 | 1.157 | 10,8% | 19,7% | 26,5% | 46,4% | 66,6% |
| 100% | 250 | 1.784 | 1.459 | **11,2%** | **22,0%** | **28,3%** | **48,8%** | **68,5%** |

**Monotona, ancora in salita a 250 sorgenti.** Tre letture:

1. **Ogni 100 sorgenti curate valgono ~3,2 punti di recall@10** per le serie che *non* sono curate. La curatela non serve solo alla serie che la riceve: serve a tutte quelle che le somigliano.
2. La testa satura prima della coda (l'ultimo quartile dà +0,4 @10 ma +2,3 @50 e +1,9 @2000): per scavare in profondità serve ancora volume.
3. Il tetto assoluto è la copertura dei bersagli: **450/1.002 = 44,9%** dei bersagli compare in almeno una lista pari (riproduce esattamente il "55% irraggiungibile" del report 41). Sui raggiungibili la spreading prende il **25,0%** al top-10.

## 8. Errori miei in questa sessione

- **La negazione rovesciata, di nuovo.** Nel diagnostico ho scritto `~is_tv[vicino] != is_tv[nodo]`, che è `is_tv[vicino] == is_tv[nodo]`: ho misurato le SAME-medium e riportato il 94,9% come "cross-medium". Il numero vero è **5,1%**. È esattamente la trappola n. 3 del handoff (il segno rovesciato), rifatta in un contesto nuovo.
- **Ranghi senza senzienza.** Nelle prime armi ho codificato "trovato = 0, non trovato = 1" e poi misurato `rango < 10`: anche l'1 è minore di 10. Tutte le armi a 100,0%, incluso il nullo — che è l'unico motivo per cui me ne sono accorto.
- **La composizione sbagliata del grafo** (2,8% invece di 11,2%), scambiando il grafo dei cluster per quello del recupero. Da qui è nata però la scoperta della sezione 3.

## 9. Cosa NON riprovare

- **Predire il cluster col contenuto per collocare titoli nuovi**: 5,7% contro 5,9% del contenuto puro. Zero.
- **Aggiungere archi pseudo-curatela al grafo**: 5,5% contro 11,2%. Peggio di non farli.
- **Usare il cluster come pool per il ranking**: sotto il riferimento a ogni risoluzione (9,2-10,1% contro 11,2%) e in profondità molto sotto (34-44% contro 68,5%). Il tetto è la copertura, 40,7%.
- **Leggere l'accuratezza del classificatore per fasce di grado come prova di utilità**: il gradiente è circolarità, non capacità (§6).

## 10. Cosa fare adesso

1. **Curatela, non algoritmo.** La curva dice +3,2 punti @10 ogni 100 sorgenti. L'orchestrazione con gli slave ha già prodotto 258 serie in 40 minuti: **è la strada con il rapporto misurato migliore**. Ordine di priorità: le serie popolari e le nicchie scoperte, non le 499 già fatte.
2. **Usare il grafo di `etero2` per il recupero e quello di `leiden2` per i cluster**, senza confonderli (§3). Se il prodotto deve fare entrambe le cose, sono due strutture, non una.
3. **I 1.002 legami dispari come set di verifica permanente**: il protocollo è riproducibile in 3 minuti con i componenti cachati, e il tetto (44,9%) è noto. Qualsiasi idea nuova si misura lì, contro l'11,2%.
4. **La freschezza/serendipità resta registrata per dopo**, come da decisione dell'utente: non ripresa qui.

## 11. Numeri riproducibili

| script | cosa fa | tempo |
|---|---|---|
| `boot-diag.py` | copertura, cross-medium degli archi, protocollo | 5 s |
| `boot-comp.py` | i 4 componenti cachati + la verifica bit-per-bit | 117 s |
| `boot-0.py` | riprodurre il riferimento (griglia composizione × alpha) | 931 s |
| `boot-1.py` | le 7 armi del test decisivo | 143 s |
| `boot-2.py` | copertura del pool + pool/ranking | 43 s |
| `boot-3.py` | la curva della curatela | 211 s |
| `boot-4.py` | copertura del pool a 6 risoluzioni | 122 s |
| `boot-5.py` | pool+ranking a 4 risoluzioni | 91 s |

Artefatti: `.cache/movielens/boot-C.npz` `boot-B.npz` `boot-T.npz` `boot-Kall.npz` `boot-Kpari.npz` (i componenti, riusabili), `boot-1.npz` (cluster, predizioni, soggetti).

**Il riferimento da battere, da qui in poi: 11,2% @10 · 22,0% @50 · 28,3% @100 · 48,8% @500 · 68,5% @2000, su 1.002 legami cross-medium tenuti fuori, con curatela dal solo pari.**
