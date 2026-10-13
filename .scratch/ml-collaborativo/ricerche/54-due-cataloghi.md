# 54 — I due cataloghi, finalmente misurati

**Correzione dell'utente**: su Stremio i cataloghi **non sono misti** — se ne restituiscono due, uno di film e uno di serie. Quindi la "invasione del medio" del report 53 non è un difetto: **era un artefatto del mio metro**, che valutava una lista che in produzione non esiste.

**E questo apre la cosa che mancava da tutta la sessione**: il lato serie. L'handoff diceva che era «bloccato dalla mancanza di cronologie reali». **Non mancano**: in `.cache/trakt/users/` ci sono **400 cronologie di serie** con 300 titoli ciascuna e la data di visione, più 370 di film, per gli stessi utenti.

Script: `due-cataloghi.py` (4 s, esplorazione) · `due-cataloghi-2.py` (739 s, la misura).

---

## 1. Il metro giusto

```
CATALOGO FILM    top-N fra i FILM,   gold = i film nascosti dell'utente
CATALOGO SERIE   top-N fra le SERIE, gold = le serie nascoste dell'utente
```
e i due casi incrociati, che sono il mestiere dell'agnosticismo:
```
profilo di FILM -> CATALOGO SERIE      (suggerire serie a chi guarda film)
profilo di SERIE -> CATALOGO FILM
```

**Il banco**: 353 utenti Trakt con ≥20 film e ≥10 serie, split casuale 60/40 per medium. Copertura: 70,0% dei film e **86,9% delle serie** cadono nel catalogo; **100% delle voci ha la data di visione**.

## 2. I risultati

| grafo | catalogo | @10 | @100 | @500 |
|---|---|---|---|---|
| **CF + Kc + B + T + K** | **FILM** (semi film) | 3,96% | 18,79% | 40,26% |
| | **SERIE** (semi serie) | **1,96%** | **15,12%** | **36,22%** |
| | SERIE (semi **film**) | 0,96% | 5,94% | 15,85% |
| | FILM (semi serie) | 0,55% | 2,85% | 6,17% |
| **CF + CFst + Kc + B + T + K** | **FILM** | 3,98% | 18,75% | **41,07%** |
| | **SERIE** (semi serie) | **2,02%** | **16,24%** | **39,90%** |
| | SERIE (semi **film**) | **0,99%** | **7,02%** | **17,81%** |
| | FILM (semi serie) | 0,56% | 3,14% | 7,04% |
| **solo CFst + Kc + B + T + K** | FILM | 2,96% | 14,53% | 32,37% |
| | SERIE (semi serie) | **2,06%** | **16,30%** | **40,05%** |
| | SERIE (semi film) | 0,98% | 6,48% | 17,13% |
| | FILM (semi serie) | 0,55% | 3,11% | 6,96% |

## 3. Quattro cose che ne escono

**1. Il catalogo serie funziona, ed è la prima volta che lo si misura.** Semi di serie → 15,12% @100 e 36,22% @500. Non è un risultato di ripiego: è **quattro quinti** del catalogo film (18,79% / 40,26%). La sessione non lo sapeva, e il handoff lo dava per bloccato dai dati.

**2. `CFst` serve, e il report 49 lo aveva escluso per un metro sbagliato.** Lo studente metadati→comportamento era stato bocciato perché «diluisce» (47,97% contro 50,40% al @500) — ma quella misura era **film contro film**, e `CFst` è l'unica cosa che dà un pubblico alle serie. Aggiungendolo:

| | senza CFst | con CFst | delta |
|---|---|---|---|
| CATALOGO SERIE (semi serie) @100 | 15,12% | **16,24%** | **+1,12** |
| CATALOGO SERIE (semi serie) @500 | 36,22% | **39,90%** | **+3,68** |
| CATALOGO SERIE (semi film) @100 | 5,94% | **7,02%** | **+1,08** |
| CATALOGO SERIE (semi film) @500 | 15,85% | **17,81%** | **+1,96** |
| CATALOGO FILM @100 | 18,79% | 18,75% | −0,04 *(neutro)* |
| CATALOGO FILM @500 | 40,26% | **41,07%** | +0,81 |

**Guadagna sulle serie e sul ponte, non toglie niente ai film.** Va messo nel grafo.

**3. I due componenti sono complementari, e si vede.** Togliendo il comportamento dei film (`solo CFst`) il catalogo serie **resta** (16,30% e 40,05%, anzi il @100 sale) ma **il catalogo film crolla** (18,75% → 14,53% al @100). Servono entrambi: `CF` per i film, `CFst` per le serie.

**4. L'agnosticismo è asimmetrico, e vale la pena saperlo.**

| | @100 | @500 |
|---|---|---|
| profilo di **film** → catalogo **serie** | **5,94%** | **15,85%** |
| profilo di **serie** → catalogo **film** | 2,85% | 6,17% |

**Suggerire serie a chi guarda film funziona il doppio** di suggerire film a chi guarda serie. Il motivo è strutturale: il comportamento (`CF`) copre **solo i film**, quindi un profilo di film ha un appiglio comportamentale che un profilo di serie non ha — da lì la camminata attraversa il ponte. Nell'altra direzione resta solo il ponte dei metadati.

E con `CFst` l'asimmetria si allarga ancora: 7,02% contro 3,14% al @100. **Il caso che interessa di più all'utente (film → serie) è anche il più forte dei due.**

## 4. Rilettura di quello che avevo riportato male

La correzione dei due cataloghi obbliga a ricalcolare i numeri dell'ordinamento (report 52). Il **2,14× al @100** era misurato su una **lista mista**, che in produzione non esiste. Per catalogo, sul catalogo film:

| ordinamento del catalogo FILM | @10 | @100 | @500 |
|---|---|---|---|
| attivazione | 5,21% | 24,57% | 52,85% |
| GBM (24 caratteristiche) | **7,00%** | **34,62%** | **66,30%** |
| guadagno | **1,34×** | **1,41×** | **1,25×** |

**Il guadagno dell'ordinamento è 1,34-1,41×, non 2,14×.** Il resto era il declassamento delle serie, che su una lista mista sembrava un miglioramento e in produzione è semplicemente **il funzionamento corretto dei due cataloghi**.

E il catalogo **serie** non ha ancora un ordinamento misurato: il GBM è addestrato sul comportamento dei film, che per le serie non esiste. **È il prossimo lavoro ovvio.**

## 5. Cosa cambia nella ricetta

```
CF    comportamento dichiarato (film)                       0,40/5 = 0,08
CFst  pubblico previsto (tutte le 16.550 serie)             0,08   <- RIENTRA
Kc    metadati puliti                                       0,08
B     co-visione Trakt                                      0,08
T     temi                                                  0,08
K     curatela                                              0,60
```
Due cataloghi, due pesature per il recupero e l'ordinamento, e **un ordinamento per il catalogo serie ancora da costruire**.

## 5-bis. Da dove vengono le cronologie (e quanto sono rappresentative)

**La fonte**, verificata: `.scratch/ml-collaborativo/fetch-trakt-users.js`, scritto e lanciato **in questa sessione** (file datati 9 ottobre, 21:03-21:28).

```
GET https://api.trakt.tv/users/{username}/watched/movies?page=N&limit=100&extended=full
GET https://api.trakt.tv/users/{username}/watched/shows?page=N&limit=100&extended=full
    autenticazione: TRAKT_CLIENT_ID dell'app · 3 pagine x 100 = max 300 voci per medium
```

**E gli utenti chi sono**: gli **autori delle liste pubbliche popolari** di Trakt, già in `.cache/trakt/lists/` (`popular-*.json`, 40 liste, **1.417 autori distinti**), troncati ai primi **400**.

Il docstring dello script dice anche *perché* erano stati presi: «un UTENTE guarda film E serie: la sua cronologia attraversa i medium per costruzione. È il segnale comportamentale cross-medium, la stessa logica di MovieLens ma dove le serie esistono». **Furono scaricate apposta per questo, e poi l'handoff ha dichiarato il lato serie «bloccato dalla mancanza di cronologie reali»**: erano arrivate a fine sessione (21:03) e non sono mai state usate per una valutazione. Le ho trovate io per caso, cercando un gold per il catalogo serie.

### Quattro cautele, tutte materiali

1. **Non è un campione casuale.** Sono **autori di liste popolari**: profili pubblici, curatori, utenti impegnati, in prevalenza anglofoni. Non sono utenti Stremio e non sono utenti YACA. Il pannello è, per costruzione, «gente che fa liste» — e questo probabilmente **favorisce** i numeri: una cronologia sistematica è più prevedibile di una casuale. Quindi il 16,24% @100 del catalogo serie va letto come **stima ottimistica**, non come il numero degli utenti veri.
2. **Troncamento a 300.** 311 cronologie di film su 400 e **167 di serie su 400 sono esattamente a 300**: sono tagliate. L'ordine è decrescente per data, quindi quello che c'è sono **le 300 voci più recenti** — per uno split temporale va bene (è anzi la cosa giusta), ma la *dimensione* della cronologia non è rappresentativa.
3. **Date quasi tutte vere, ma non tutte**: l'ordinamento per `last_watched_at` è verificato, ma qualche voce ha data epocale (1970-01-01) al posto di un valore mancante.
4. **«Visto» su Trakt significa «segnato come visto»**: per alcuni utenti è una collezione o un arretrato, non una visione reale. E resta autodichiarato.

**In una riga**: è il migliore gold sul lato serie disponibile, **ed è un pannello di curatori, non di utenti**. Va bene per misurare *se un metodo funziona* (confronti interni, come ho fatto: con/senza `CFst`, un verso contro l'altro), **non** per stimare il livello assoluto che vedrà un utente Stremio.

## 6. Limiti

- Le cronologie Trakt sono **400 utenti**, non 200.000: i numeri sono più rumorosi di quelli MovieLens, e — vedi §5-bis — sono **autori di liste popolari**, non un campione casuale. Sono l'unico banco sul lato serie e sono utenti veri con date vere, ma **stimano per eccesso**.
- La copertura è 70% per i film e 87% per le serie: il resto dei titoli visti non è nel catalogo e non entra né nel profilo né nell'oro.
- Split **casuale**. Con le date disponibili si può fare anche uno **split temporale** («cosa guarderò dopo»), che è la domanda vera del prodotto: non l'ho fatto, ed è il secondo lavoro ovvio.
- Le due cronologie di uno stesso utente vengono spezzate in modo indipendente, quindi il caso incrociato (film→serie) usa un profilo di film **e** un oro di serie dello stesso utente ma senza legame temporale fra i due.
