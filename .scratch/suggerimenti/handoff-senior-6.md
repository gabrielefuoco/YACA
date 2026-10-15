# Handoff 6 — il grafo entra nel prodotto, e il meccanismo è misurato

**Sesto handoff, di solo riepilogo.** Il quinto accompagnava il codice finito di `graph/` per la
valutazione. Questo racconta **cosa è successo dopo**: il grafo è entrato in `src/`, il meccanismo dei
suggerimenti è stato progettato da capo e **misurato pezzo per pezzo**, e parecchie cose che credevamo
vere si sono rivelate false.

Chi legge non deve rifare il lavoro: ogni affermazione qui ha un numero e un comando che la riproduce.
E le cose che **non** sono verificate sono elencate come tali, non nascoste.

---

## 1. In una pagina

Prima: `graph/` era un modulo che sapeva **partizionare** i titoli in bolle coerenti (+0,942) e
**collocare** un titolo nuovo (11 ms, ~90/100 all'occhio). Nessuno sapeva **usarlo** per suggerire.

Adesso c'è un **motore** (`graph/motore.py`): entra una storia (i titoli visti, coi segnali) ed escono
**le liste** — i mondi accesi, con quanto sono accesi e chi ci sta dentro. E c'è il **primo pezzo nel
prodotto** (`src/engines/bolle/`): `src/data/bolle.json` è un artefatto di **1,55 MB** che il prodotto
legge, e da una storia produce il portafoglio in **millisecondi**.

Il tutto **senza mai modificare una riga esistente di `src/`**: l'integrazione è fatta di sole aggiunte.

| | |
|---|---|
| il modulo | `graph/` — 7 file di codice, 21 arbitri, 34 iperparametri in tabella |
| il prodotto | `src/data/bolle.json` + `src/engines/bolle/{Bolle.js, README.md}` |
| le decisioni | `.scratch/suggerimenti/map.md` — 15 sezioni, ognuna con la sua misura |
| le misure | `graph/measure/` — 21 arbitri, ognuno riproducibile |

---

## 2. Come funziona, adesso

```
   LA STORIA DI UN PROFILO          titoli + ri-visioni + il tipo di segnale
   (loved / liked / watched / library)
            │
            ▼
   I SEMI E I LORO PESI             film min(plays,3) · serie 1+2×(frazione di episodi)
            │                        × il fattore del tipo di segnale
            ▼
   LA DIFFUSIONE                    PageRank personalizzato, α=0,60, sul grafo potato top-16
            │
            ▼
   IL PORTAFOGLIO                   i mondi accesi, con l'attivazione, i voti mediani,
            │                        i vicini sulla mappa, i membri
            ▼
   LE LISTE                         il tuo mondo · un passo fuori · le uscite nuove ·
            │                        la nicchia di qualità · + un catalogo per ogni mondo diverso
            ▼
   IL PRODOTTO                      src/engines/bolle/Bolle.js — millisecondi
```

**Dove gira cosa** (deciso, e il codice lo rispetta): il **notte** si ricostruisce l'artefatto e si
collocano i titoli nuovi; la **diffusione** gira online, nel prodotto, sulle bolle. La cache — decisa e
non costruita — ha la chiave `hash(storia) · versione artefatto · impronta ricetta · slider`: **le due
versioni** dicono con che cosa è stata calcolata, **i due argomenti** dicono per chi.

**Perché il motore Python non è nel prodotto.** L'engine JS cammina sulle **bolle** (45.194 archi),
quello Python sui **titoli** (13,2 milioni). La conseguenza è una sola e va saputa: **l'attivazione per
titolo non c'è in JS**, quindi l'ordine dentro una bolla lo decide chi invoca — che ha il catalogo.
Un port fedele costerebbe ~110 MB di grafo in RAM e giorni di lavoro.

**E un regalo dell'architettura**: siccome il prodotto cammina sulle bolle, **un titolo nuovo che riceve
una bolla compare fra i suoi membri e ne eredita l'attivazione**. La decisione «i titoli nuovi ereditano
la loro bolla, nei due versi» è **automatica** — nessun arco sintetico, nessuna perturbazione.

---

## 3. I numeri, e come sono misurati

| | valore | metodo |
|---|---|---|
| **coerenza intra-bolla** | **+0,942** | indice di chimera: PMI mediana sui 5 token di testa, solo `kw:`/`ge:` con df ≥ 30 |
| **saghe spezzate** | **0 su 1.994** | collezioni TMDB sulla **mappa navigabile** 6+2 |
| **α (il restart)** | **0,60** | 120 utenti, taglio temporale: il lift si appiattisce, la luce sprecata esplode (65%→91% da 0,6 a 0,9) |
| **potatura** | **top-16 per riga** | 12% degli archi, 8,7× meno lavoro, e le saghe **rafforzate** (26,6%→47,8%) |
| **il motore intero** | precisione **5,0%** · **63×** il pavimento (0,08%) | 100 utenti, taglio temporale, liste complete nell'ordine in cui escono |
| **dove sta il futuro trovato** | **38%** in *un passo fuori* · **21%** in *il tuo mondo* | stessa misura, per tipo di lista |
| **l'ordine** | rango mediano **3** · **55%** nelle prime 4 posizioni | stessa misura |
| **il tempo per chiamata** | **115 ms** (p90 128) | misurato, non stimato |
| **il freddo** | si accende da **1** titolo: 36,9× contro lo 0,6× di un titolo a caso | 60 utenti, seme = i primi K visti |

**Il banco misura il comportamento, non il gusto** — e va ricordato ogni volta che lo si legge: chiede
«la luce cade dove l'utente guarderà?», e la risposta giusta può arrivare dal leakage (indovinare la
puntata successiva di una serie a metà, che l'utente guarderebbe comunque). Per le decisioni di
**prodotto** il metro è l'**equilibrio**, non il lift.

---

## 4. Le decisioni non ovvie (e quelle ritirate)

**Prese, con la prova:**

1. **La soglia del portafoglio non esiste.** Una storia *casuale* della stessa lunghezza accende **più**
   mondi di una vera (0,9× costante a ogni soglia): «quanti mondi si accendono» misura quanto è lunga
   la storia, non il gusto. **Il numero di liste lo decide chi invoca.**
2. **Il peso è `min(plays,3)` per i film e `1+2×(frazione di episodi)` per le serie.** Le puntate non
   contano *mai* come play. Sostenuto dall'**equilibrio del seme**, non dal lift: con un cap a 20, a un
   utente di soli film le serie prendevano il **67%** del peso (fino all'85%); con questa formula, il 31%.
3. **La potatura top-16 per riga**, perché gli archi di saga stanno nel top-2% di ogni riga (l'86% dentro
   il top-16): potare non perde i legami forti, li rafforza.
4. **Un asse modula l'attivazione, non la sostituisce.** Misurato: sostituendo (filtrando i titoli o
   riordinando i mondi), il riempimento crolla a 3-14 titoli su 40 e la copertura del futuro va a
   0,0-0,7%; modulando, il riempimento resta 32 e la copertura 2,3-2,6%, e un terzo dei titoli cambia.
5. **Il freddo è zero, non uno-tre** — ma il proprietario ha scelto «sotto i 3» per prudenza, ed è una
   decisione legittima: i cataloghi attivi del profilo diventano un seme sintetico, e i titoli usati come
   seme **non si restituiscono** fra i suggerimenti.

**Ritirate, e sono la parte più utile di questo handoff** — cinque cose che *sembravano* vere:

- **«0 saghe spezzate»** era una **tautologia**: si proiettava il triangolo *intero*, che contiene il
  componente COLL (una clique per ogni saga), quindi due bolle con la stessa saga risultavano adiacenti
  *per identità matematica*. Sulla mappa vera: 77,6% in una bolla, 8,2% adiacenti a un passo, 3,7% a due,
  **10,5% davvero spezzate**;
- **la «testa alta» come rilevatore di mondità**: dipende da quanti semi ci sono, non da quanto sono
  coerenti (24,7% con 10 semi coerenti, 5,0% con 10 casuali, **2,9% con uno storico vero da 100**);
- **la stabilità fra due metà** come criterio di qualità: **premia l'output generico** (con α basso la
  luce finisce nei mondi popolari, uguali per tutti);
- **l'attivazione per membro** per correggere la taglia: il grezzo trova **più** titoli futuri (7% contro
  4%), e il timore che la giustificava non si materializza (i primi 10 mondi hanno taglia mediana 12, non
  123);
- **«oltre il quarto titolo è rumore»**: falso, il rango mediano dell'oro è 3 e il 55% sta nelle prime 4.

---

## 5. Le trappole

1. **Il triangolo non dipende dalla risoluzione**: è il grafo *prima* di Leiden. Il file `-r100` e quello
   senza suffisso sono **lo stesso file** (39.336.281 byte identici).
2. **Le bolle non hanno id stabili fra partizioni**: la partizione e i centroidi sono un artefatto solo.
   Verity passa da bolla 1682 a 3213 fra due costruzioni, senza che niente vada in errore. Nel modulo
   c'è un contratto (`canon.assert_partizione`, sha256 nelle impronte) che lo rende un **errore**.
3. **NUOVA — «lontano» non vuol dire «diverso»**: sulla mappa la distanza mediana è **3 hop** e la massima
   5. La diversità dei cataloghi si prende dalla **fascia di voti × il medium**, non dagli hop.
4. **NUOVA — l'indice di chimera ha un falso negativo**: la bolla 820 (il canone del thriller psicologico,
   mediana 7.037 voti, un mondo verissimo) su quell'indice prende un punteggio basso. Un guardiano basato
   su di esso **butterebbe via mondi veri** — per questo è stato scartato.

---

## 6. Cosa NON è verificato — leggerlo prima di fidarsi

1. **Il giro notturno completo non è mai stato eseguito.** `esporta --colloca` compila e l'opzione è
   spenta di default, ma non l'ho portato a termine: rilegge tutti i parquet TMDB, e oggi collocherebbe
   **zero** titoli (il canone *è* il grafo). Va provato quando il catalogo crescerà davvero.
2. **I quattro segnali del prodotto (like, love, libreria, voti) non sono calibrati.** L'engine li accetta
   e i fattori sono in tabella marcati **INVENTATI**: stanno nel database del prodotto, non offline. Con
   un *proxy* dichiarato (ri-visto ≥ 2 = loved) i titoli cambiano del 17% e la precisione sale da 5,0% a
   **6,1%** — quindi valgono l'integrazione, ma la calibrazione va rifatta.
3. **Tutta la calibrazione dei pesi è parziale**: è stata fatta sulle **ri-visioni sole**, perché era
   l'unico segnale disponibile offline.
4. **La composizione delle liste nel feed non è decisa**: i numeri dicono di mostrare **prima** *un passo
   fuori* (38% del futuro trovato) e poi *il tuo mondo* (21%).
5. **La cache non è costruita**: la chiave è decisa, il codice no.
6. **I voti Trakt non li abbiamo**: le 540 liste in cache sono quelle **pubbliche** di Trakt (prese per la
   co-occorrenza cross-medium), quindi `my_rating` è il voto di chi le ha create, non dei nostri utenti.
7. **Il modulo non ha una suite di test**: i contratti sono assert a runtime, e i 21 arbitri misurano, non
   verificano.

---

## 7. Come si usa

```bash
python -m graph.pipeline stato              # inventario, dimensioni, hash di allineamento
python -m graph.pipeline ricetta            # i 34 iperparametri con stato e motivo
python -m graph.pipeline lista --utente NOME # IL MOTORE: entra una storia, escono le liste
python -m graph.pipeline lettura            # dieci portafogli lungo la scala del canone, in un documento
python -m graph.pipeline esporta            # l'artefatto per il prodotto
python -m graph.pipeline esporta --colloca  # il job notturno (colloca i titoli nuovi)

python graph/measure/intero.py              # il motore intero misurato (~1 min)
python graph/measure/alfa.py                # α su 120 utenti
python graph/measure/equilibrio.py          # chi tiene il seme (deterministico, 15 s)
python graph/parametri.py                   # la tabella, e cosa c'è da rivedere

node -e "console.log(require('./src/engines/bolle/Bolle').portafoglio([{chiave:'tv:314',plays:3}]))"
```

---

## 8. Una nota sul metodo, che vale più dei numeri

In questa sessione **l'occhio ha corretto le metriche sei volte**, e ha avuto ragione ogni volta: il
banco al 27,7% che sembrava un fallimento ed era un ~90% letto a mano; la bolla 820 che era un canone e
non un minestrone; «la similarità di trama non discrimina» che era il modello sbagliato; e tre volte le
misure costruite *dall'autore* per difendere un'idea, smentite dai dati che dovevano difenderla.

La regola che ne è uscita, e che vale la pena ereditare: **le misure dicono se una cosa cambia; solo la
lettura dice se cambia in meglio.** E quando una misura è comoda, il sospetto deve venire prima della
soddisfazione: le cinque cose ritirate al §4 erano tutte misure *comode*.

Il resto lo trovi in `.scratch/suggerimenti/map.md`, dove ogni decisione sta con la sua misura accanto —
e dove i valori ancora da sistemare sono elencati da `graph/parametri.py` con la funzione `da_rivedere()`.
