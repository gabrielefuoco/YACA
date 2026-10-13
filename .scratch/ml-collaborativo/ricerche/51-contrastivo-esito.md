# 51 — Contrastive: l'idea era giusta, il vantaggio era memorizzazione

**L'idea (dell'utente)**: al posto del `Ridge` — che minimizza l'errore quadratico, quindi predice la **media condizionale** ed è un lisciatore — usare un obiettivo **contrastivo**, che non chiede di riprodurre le coordinate ma che il bersaglio giusto stia *sopra* quelli sbagliati. Serve a dare alle keyword il potere di collocare un titolo **senza comportamento**.

**Esito**: in-sample l'idea vince di **5 volte**. Espellendo i film da collocare dal training, **il vantaggio sparisce**. Il 5× era l'encoder che aveva imparato a memoria dove stanno quei film.

Script: `contrastivo.py` (1.468 s) · `contrastivo-holdout` (1.235 s) · `confronto-spazi.py` (647 s).

---

## 1. Il disegno

Il banco è quello di `titoli-nuovi.py`: 5.000 film **con** comportamento, a cui si cancellano CF, co-visione **e** curatela. Restano loro solo i metadati — come un titolo appena uscito. Si misura il recupero **su quei 5.000**.

L'encoder:
```
f : TF-IDF(7.934) -> 512 -> 128      4.128.384 parametri
positivi  : il vettore CF del film + i suoi 5 vicini di comportamento
negativi  : tutti gli altri film con comportamento (49.041 / 44.041 in-batch)
perdita   : InfoNCE multi-positivo, tau 0,10, 60 epoche
```
E i controlli di sanità, che passano tutti:

| controllo | esito |
|---|---|
| copertura | 0 vettori nulli su 66.259 · le 16.550 serie hanno un vettore |
| il vicino più forte del vettore-metadati è il film col comportamento più simile | **96,9%** (98,8% in holdout) |
| per 500 serie, similarità col film più vicino | **0,576** contro **−0,006** di un film a caso |

L'ultima riga è la cosa che serviva: **le serie ricevono una posizione sensata nello spazio del comportamento**, pur non avendo nessun comportamento.

## 2. Il risultato, e il controllo che l'ha ribaltato

| grafo | NUOVI @10 | NUOVI @100 | NUOVI @500 | NUOVI @2000 | nativi @500 |
|---|---|---|---|---|---|
| E0 · **senza** keyword (nullo) | 0,00% | 0,24% | 1,92% | 7,95% | 52,12% |
| E1 · keyword pulite (SVD TF-IDF) | 0,00% | 0,61% | 3,92% | 15,61% | 49,16% |
| **E2 · contrastivo, in-sample** | **0,02%** | **3,11%** | **18,69%** | **48,75%** | **55,09%** |
| **E2 · contrastivo, HOLDOUT** | 0,00% | **0,58%** | **3,43%** | **13,07%** | 54,95% |
| *riferimento: tutti nativi* | *0,49%* | *13,63%* | *45,95%* | *74,90%* | *49,71%* |

**In-sample: 5,1× al @100, 4,8× al @500, 3,1× al @2000** — e i nativi migliorano anche (55,09% contro 49,16%), cosa che le keyword pulite non facevano. Il divario nativo/nuovo scendeva da 4,8× a 1,54×.

**Holdout: 0,58 / 3,43 / 13,07.** Cioè **quanto le keyword pure** (0,61 / 3,92 / 15,61) — **o un po' meno**.

**Il 5× era memorizzazione.** L'encoder, con 4,1 milioni di parametri su 44.000 esempi, aveva imparato dove stanno *quei* film. Per un titolo che non ha mai visto non sa fare meglio dell'SVD non supervisionato dei metadati.

*Il controllo è costato 25 minuti di training e ha evitato di riportare un 5× falso. È la quarta volta in questa sessione che il numero troppo bello era troppo bello.*

## 3. Cosa resta vero, e la conclusione che vale

**Il difetto del `Ridge` è reale e diagnosticato bene**: minimizza l'errore quadratico, quindi predice la media condizionale, quindi liscia. La correlazione del suo spazio con i metadati puri era 0,169. **L'idea contrastiva è quella giusta in linea di principio** — e in-sample funziona.

**Ma il collo di bottiglia non è il modello, è l'informazione.** Due metodi molto diversi — una regressione lineare e una rete contrastiva multi-positivo — **convergono allo stesso risultato** su un titolo mai visto. E la cosa era già scritta, in un'altra forma, nel report 34: *«il collo di bottiglia non è il modello, è il bersaglio»*.

**La mappa metadati → comportamento non generalizza.** Non è una questione di architettura, di perdita o di capacità: i metadati non contengono l'informazione che serve a prevedere il pubblico di un titolo che non è ancora uscito. E non manca nessuna feature: ho controllato, dentro la matrice ci sono già cast, registi, popolarità, voti, budget, incassi, case di produzione, sceneggiatori, collezioni.

## 4. Cosa questo dice al prodotto (ed è la risposta al requisito dell'utente)

Il requisito era: *«il sistema deve essere così robusto da permettere di inserire nuove serie/film e metterli nel punto giusto, senza curatela»*.

**Si può fare, e c'è il numero**: un titolo nuovo si colloca al **13-16% @2000** della recuperabilità di un titolo nativo (74,90%). Il tetto non si sposta con un encoder migliore.

Per chiuderlo servono due cose, e nessuna è un modello:

1. **Un po' di comportamento vero, anche pochissimo.** L'esperimento dice che è *l'informazione*, non il metodo, a mancare. Un titolo nuovo che riceve anche solo qualche decina di interazioni entra nel CF e passa da ~13% a ~75% alla profondità. **La strada è raccogliere un segnale minimo presto**, non raffinare la mappa.
2. **Sapere quando manca**: il test dei titoli nuovi (`titoli-nuovi.py`, 700 s) è riutilizzabile come collaudo — si fa nascere un titolo e si misura quanto si è degradato.

**E una cosa che invece NON è un problema**: le serie. L'encoder ha dato alle 16.550 serie una posizione sensata nello spazio del comportamento (similarità col film più vicino 0,576 contro −0,006 del caso) pur senza nessuna cronologia. Il fatto che non *generalizzi per un titolo nuovo* non toglie che **per i titoli esistenti la rappresentazione sia buona**: la colonna "nativi @500" passa da 49,16% a 55,09%.

## 5. Dove siamo dopo questa sessione

| cosa | stato | numero |
|---|---|---|
| Grafo migliore | **fatto**: comportamento dichiarato + metadati + temi + curatela | @500 53,16% · @2000 79,45% |
| Grafo attuale (contaminato) | superato dal nuovo | @500 42,12% → 53,16% |
| Ordinamento della testa | **è il collo di bottiglia** | @100 da 16,19% verso 57,13% (oracolo) |
| Metadati per titoli nuovi | **al tetto dell'informazione** | 13-16% di un nativo @2000 |
| Bootstrap / predizione del cluster | chiuso negativo | — |
| Contrastivo sui metadati | **chiuso negativo** (5× era memoria) | holdout = keyword pure |
| Le foglie | buone, non migliorabili spezzandole | coerenza 0,744 · margine nelle 164 grandi |
| Inserimento senza comportamento | **funziona** | 47° percentile contro 50° dell'oracolo |

**Le tre leve che restano, in ordine di rapporto misurato:**
1. **l'ordinamento** (3,5× al @100, e un misto banale ne prende già un quarto) — è dove c'è il guadagno più grande e non richiede né modelli né dati;
2. **il comportamento dichiarato** nel grafo (+20% @500, già fatto);
3. **un minimo di comportamento per i titoli nuovi**, per portarli da 13% a 75%.

## 6. Come si riproduce

```bash
python contrastivo.py                                    # encoder in-sample
YACA_HOLDOUT=1 YACA_OUT_SPAZIO=spazio-contrastivo-holdout.npz python contrastivo.py
python confronto-spazi.py spazio-contrastivo-holdout.npz  # la prova pulita
python titoli-nuovi.py                                    # il banco dei titoli nuovi
```
Artefatti: `.cache/movielens/spazio-contrastivo.npz` · `spazio-contrastivo-holdout.npz` · `cf-spazio.npz` · `cf-studente.npz` · `spazio-pulito.npz`.
