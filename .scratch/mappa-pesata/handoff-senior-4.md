# Handoff — il grafo sa servire, sa accogliere, e sceglie il mondo sbagliato

**Quarto handoff.** I primi tre fotografavano il lavoro prima, i fallimenti di una fase, e il buco
nell'inserimento. Questo arriva dopo altri **14 ticket** in due effort (`todo-grafo` 8, `mappa-pesata`
5 + 1 nato da un'obiezione) e riguarda una cosa che i precedenti non potevano vedere: **due misure in
disaccordo sulla stessa domanda**, e la prova che il limite non è dove lo cercavamo.

---

## 1. Il quadro in una tabella

Collocazione a freddo di un titolo nuovo, dai soli metadati, con il leave-one-out esatto:

| | propria bolla | scollegate | caso | lift | kappa |
|---|---|---|---|---|---|
| **film** (600, `inserimento` 04) | **27,7%** | **0,0%** | 0,062% | 450× | — |
| **serie** — studente dei film | 2,2% | 1,8% | 0,298% | 7× | — |
| **serie** — studente delle serie | 1,3% | 0,2% | — | 4× | — |
| **serie** — voto diretto sui centroidi | **35,3%** | **0,3%** | 0,298% | **119×** | **+0,351** |
| serie, sui 506 con la bolla in gara | **41,9%** | — | — | — | — |

**Il ponte film→serie non funziona**: 0,8% con la ricetta esatta dell'esperto, 2,5% con la mia, contro
il 35,3% del diretto. I due voti concordano su **6 serie su 600** e la fusione peggiora sempre.

**La mappa a 6+2 funziona ma non seleziona**: il grafo delle bolle ha il **95,7%** delle coppie
adiacenti (grado mediano 798) e il rapporto fra il 6° e il 7° vicino è **1,074**. Sul grafo **pesato**
con top-k e unione: 20.918 archi, **una sola componente**, ginocchio a **1,24**.

---

## 2. I fallimenti, e ce ne sono più miei che altrui

**Cinque bug silenziosi, non tre.** L'esperto ne aveva segnalati tre, tutti reali, e il suo 76,3% era
esatto al decimale. Il quarto: `costruisci_insiemi` calcola `networks`, paesi e studi e non li
restituisce. Il quinto, il più grosso: `production_countries` è `["US"]`, una lista di **stringhe**, e
l'helper `leggi()` fa `[x for x in v if isinstance(x, dict)]` — scarta in silenzio **34.331 titoli** con
un paese non angloamericano (JP 5.860, KR 2.097) e **44.279 firme `pg:`**. È esattamente il segnale
che serve alle serie: non era una scelta di progetto, era un `isinstance` di troppo.

**Un numero gonfiato che nessuno fermava.** Il voto diretto ha dato **29,7%**, poi **63,7%**, poi
**35,3%**. Il 63,7% era gonfiato da un leave-one-out incompleto, ed era il più pericoloso perché il più
bello: il doppio del vero, con una spiegazione plausibile pronta. **Nessun contratto lo ferma** — non è
degenere, è solo gonfiato. L'ha fermato rifare la misura per un'altra via.

**Tre contratti sbagliati, scritti da me.** Il retro-test ha smascherato il mio `assert_ordine`
(misurava il verso sbagliato e dava il via libera **proprio** al bug di `verifica-popolare.py`),
`assert_modello` (soglia `|r| > 1e-6`, che non ferma niente) e l'anti-pareggio (un asse solo, e solo
lo span, non i pareggi in testa). E i contratti hanno fermato **me** altre due volte: `tasso_base`
chiamato senza riferimento ha stampato *caso 58,27%* su una misura col caso vero di 0,33%.

**Un'inferenza sbagliata travestita da scoperta.** Avevo misurato che 506 serie su 600 avevano la
bolla vera fra le 336 bolle-serie, e che le 94 escluse erano «94 su 94 a maggioranza film». Ne avevo
dedotto che fossero *escluse dal vincolo di medium*. Sono escluse da quella **lista** per definizione,
non da quel **metodo**: con i centroidi anche delle bolle-film, **600 su 600** hanno la bolla fra i
candidati, e togliere il vincolo dà **lo stesso 35,3%**.

**Il fallimento più utile: un numero che scende mentre la qualità sale.** L'utente ha obiettato su
*Verity*:

> «Non c'entra niente con Fight Club, Inception. Magari con Gone Girl sì, ma non è nella bolla giusta:
> è un thriller psicologico con qualche jump scare e tensione costante.»

Aveva ragione. Il vettore era dominato dal **cast** (i vicini erano *Cinquanta sfumature di grigio* —
Dakota Johnson — e *WeCrashed* — Anne Hathaway) e dalle **keyword rare** (`baffled`, `dreary`,
`tragic`: df 1-3, idf quasi massimo, battevano `kw:psychological thriller`). I 25 vicini stavano in
**24 bolle diverse**.

La correzione (V3: `df ≥ 3`, idf con tetto, generi ×1,5, cast ×0,4) **guarisce l'occhio e peggiora il
banco**: 32,0% contro 35,3%. E **togliere il cast non cambia niente** (192 su 192), quindi la diagnosi
«Dakota Johnson» spiegava un caso, non il metodo. Le due misure rispondono a **domande diverse**: il
banco chiede «atterra dove la **co-visione** l'aveva messo?» — domanda che per un titolo **fuori dal
grafo** non esiste; l'occhio chiede «sono lo stesso genere di film?», ed è l'unica che si possa fare su
un film del 2026.

**⚠️ QUESTA CONCLUSIONE E' STATA RITRATTATA** (14/10/2026, vedi
`coerenza/ricerche/820-la-bolla-che-non-era-un-minestrone.md`). Avevo scritto che *Verity* «resta
nella bolla sbagliata perché quella bolla non esiste»: **sbagliato, e l'obiezione dell'utente era
giusta**. La bolla 820 — 46 titoli, **35 Thriller**, registi Fincher (7), Nolan (4), Shyamalan (3),
**voti mediani 7.037 contro 51 del catalogo** — è **il canone del thriller psicologico**, e i termini
del suo centroide lo dicono: `ge:thriller · ge:mystery · kw:psychological thriller · di:david
fincher`. *Verity* appartiene a quel mondo, e la collocazione era corretta.

Avevo giudicato dalla **superficie** (*Inception*, *The Truman Show*, *Eiffel*: tre titoli su
quarantasei) invece che dal **baricentro**, e i dati per farlo bene erano su disco da ore — i termini
del centroide, la mediana dei voti, i registi. Due volte in questa sessione il giudizio dell'utente ha
corretto una mia conclusione presa dalle metriche, e in tutte e due i casi sbagliavo io.

Quello che resta vero: `N_eff(psychological thriller) = 101,78`, cioè il tag non coincide con un mondo.
Ma la conclusione che ne avevo tratto («il mondo è rotto») non seguiva: i titoli con migliaia di voti
sono nel canone, gli altri sono altrove, divisi per epoca e paese — **una partizione ragionevole**.

---

## 3. Cosa ora funziona

- **V8** (1.625 bolle, mediana 33, la più grossa 552, purezza 0,946): ricetta di V7 con le tre
  correzioni. Componenti che cambiano di **47 volte** (`CAST` da 35.684 a 1.662.368 archi) e una
  partizione che si muove dello 0,5%: **la struttura delle bolle assorbe gli errori dei componenti.**
- **Il voto diretto sui centroidi**: 336 bolle-serie × 122.314 termini, coseno, pesi uniformi,
  regola di medium simmetrica. **8,7 ms per titolo, nessun modello da riaddestrare.** *Verity* →
  i suoi dieci vicini sono *Le Grand Jeu*, *El páramo*, *Dark Cloud*, *Il silenzio della palude*.
- **La mappa pesata**: top-k per bolla con unione → una sola componente, sparsa 60 volte, ginocchio
  1,24. La lettura dei quartieri: il fantasy anni '80 (Goonies) ha *Indiana Jones* e *Stand by Me*;
  il seinen anime ha *Monster*, *Death Note*, *Berserk*; il K-BL ha *HIStory*.
- **I contratti**: 6 artefatti su 6 fermati, zero falsi allarmi, e due che hanno fermato me.
- **Il collocatore**: `colloca_finale.py`, tre funzioni, la confidenza nel punteggio.

---

## 4. Le quattro domande

1. **La partizione è il limite, o lo è il metodo?** V8 non ha una bolla «thriller psicologico»: i
   film di quel mondo stanno in venti bolle diverse. Il ticket 09 di `bolle-nitrile` diceva «RB 200
   frantuma, RB 60 cola» — ma parlava del **numero complessivo** di bolle, non della coerenza dei
   singoli mondi. **Sono due cose diverse, e non è mai stato misurato.** Come si misura la coerenza
   di un mondo senza chiedere a un umano?
2. **Due livelli invece di uno.** La bolla giusta per *navigare* non è la stessa cosa del mondo giusto
   da *mostrare*: il collocatore dovrebbe restituire la bolla (macro) **e** i 10 titoli più vicini
   (micro). Fonderli in una scelta sola è l'errore che ha prodotto l'obiezione su Verity. È la strada
   giusta, o è un modo di non decidere?
3. **Il banco non è l'arbitro.** Il 35,3% misura «atterra dove la co-visione l'aveva messo», e per un
   titolo nuovo quella domanda non esiste. **Serve una misura della qualità semantica**, automatica
   o campionata — perché l'occhio dell'utente non scala.
4. **I contratti non bastano.** Due volte in questo effort un numero gonfiato è passato indenne
   perché non era degenere. Che forma avrebbe un controllo sulla *coerenza* di un risultato, e non
   solo sulla sua degenerazione?

---

## 5. Numeri per chi volesse rifare le misure

```
partizione        bolle-nitrile-V8.npy              1.625 bolle
triangolo         bolle-nitrile-V8-triangolo.npz    5.873.626 archi
mappa pesata      mappa-pesata-6-2.npz              20.918 archi, 1 componente
centroidi V3      05-centroidi.npz + 05-tfidf.npz   1.525 × 79.281 (sparsi)
                  (+ 05-vocab.json e 05-idf.npy, che vanno INSIEME: senza idf i due lati
                   del coseno non parlano la stessa lingua, in silenzio)
banco             600 serie, seed 13, come il ticket 04 di `inserimento`
```

`src/` **non è stato toccato**: la proposta per portare il collocatore in produzione è in
`ricerche/04-proposta-src.md`, ed è un documento. La scelta presa è **job notturno offline**, non
modulo in linea.
