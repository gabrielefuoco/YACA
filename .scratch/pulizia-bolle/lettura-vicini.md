# I 100 vicini, letti a occhio — sei titoli

**Data**: 21/10/2026 · **Artefatti**: triangolo V10 + `bolle.json` (`services/graph/data/`).
**Sonda**: `04-sonda.py` · **classificazione**: `05-lettura.py`.

## Metodo (e il limite)

Per ogni titolo ho preso i 100 archi di peso maggiore — la stessa definizione del report
precedente — e li ho letti uno per uno. Li ho messi in tre livelli:

| livello | cosa significa |
|---|---|
| **giusto** | stesso mondo o stesso pubblico: lo mostrerei |
| **dubbio** | stesso pubblico largo, o legame debole ma spiegabile (regista, remake, genere vicino) |
| **sbagliato** | mondo diverso: non lo mostrerei |

Il confine è **mio**, e qualche titolo sta sul filo. Il numero esatto è quindi discutibile di
qualche unità; il **profilo** no — la curva di degradazione è netta e si ripete su tutti e sei i
titoli.

## Il risultato

| titolo | grado | bolle nel top 100 | giusti | dubbi | sbagliati | 1° dubbio | 1° sbagliato |
|---|---:|---:|---:|---:|---:|---:|---:|
| **Spider-Man (2002)** | 390 | 53 | **64** | 15 | **21** | 20 | 52 |
| **Inkheart (2008)** | 444 | 59 | **54** | 8 | **38** | 21 | 37 |
| **Un ponte per Terabithia (2007)** | 426 | 70 | **52** | 8 | **40** | 46 | 44 |
| **Inception (2010)** | 509 | 66 | **42** | 37 | **21** | 25 | 32 |
| **Perfetti sconosciuti (2016)** | 212 | 76 | **29** | 13 | **58** | 21 | 27 |
| **Breaking Bad (2008)** | 697 | 81 | **40** | 15 | **45** | 11 | 14 |

In media, sul top 100: **47% giusti, 16% dubbi, 37% sbagliati**. Ma la media a 100 è la cosa meno
interessante: quello che conta è **dove** comincia il disastro.

## La curva: precisione a N (aggregata sui 6 titoli)

| taglio | giusti | dubbi | sbagliati |
|---|---:|---:|---:|
| **top 10** | **60/60 (100%)** | 0 | 0 |
| **top 20** | **110/120 (92%)** | 9 | 1 |
| **top 30** | **153/180 (85%)** | 23 | 4 |
| **top 50** | **206/300 (69%)** | 45 | 49 |
| **top 100** | **281/600 (47%)** | 96 | 223 |

Letta per titolo:

| titolo | top 10 | top 20 | top 30 | top 50 | top 100 |
|---|---|---|---|---|---|
| Spider-Man | 10/10 | 19/20 | 29/30 | 45/50 | 64/100 |
| Inkheart | 10/10 | 20/20 | 28/30 | 36/50 | 54/100 |
| Terabithia | 10/10 | 20/20 | 30/30 | 43/50 | 52/100 |
| Inception | 10/10 | 20/20 | 26/30 | 34/50 | 42/100 |
| Perfetti sconosciuti | 10/10 | 20/20 | 24/30 | 28/50 | 29/100 |
| Breaking Bad | 10/10 | 11/20 | 16/30 | 20/50 | 40/100 |

**Il primo dato che sorprende**: i primi **10** sono **60 su 60 giusti**. Il grafo, quando guarda
vicino, ci vede. **Il secondo**: il primo sbagliato arriva al rango **14** (Breaking Bad), **27**
(Perfetti), **32** (Inception), **37** (Inkheart), **44** (Terabithia), **52** (Spider-Man). Il
punto di rottura cambia di 38 posizioni da un titolo all'altro, e non c'entra la popolarità.

## Titolo per titolo

### Spider-Man (2002) — 64 giusti, 15 dubbi, 21 sbagliati

I primi 4 sono i **compagni della sua stessa bolla** (i cinque film live-action di Spider-Man):
corretti, ma è "franchise reflex", non scoperta. Fino al 50 non c'è **un solo** sbagliato netto: al
massimo 5 dubbi (Superhero Movie, Transformers, Men in Black II, R.I.P.D., Minority Report). Il
primo sbagliato è **Pirates of the Caribbean** (52); poi **Shrek** (55), **Hook** (61),
**Monsters & Co.** (63), **Peter Pan** (77), **Alla ricerca di Nemo** (74), **Star Wars II** (87),
**Austin Powers** (88), fino a **Shrek 2** (100). È una coda di **blockbuster per famiglie** — non
film brutti: `vote_average` mediano dei 21 sbagliati **7,13**. Sono semplicemente un altro mondo.

### Inkheart (2008) — 54 giusti, 8 dubbi, 38 sbagliati

I primi **20 sono tutti giusti**, e **8 dei primi 10 stanno nella stessa bolla 1395** (Spiderwick,
Terabithia, La bussola d'oro, Stardust, Tata Matilda, Percy Jackson, Eragon, Water Horse,
Mr. Magorium). Il primo sbagliato è **Piacere Dave** (37). Poi, dal 41 al 58, entra un **grappolo
tedesco di comedy/TV** — *Bullyparade*, *Ich bin ein Star*, *Ijon Tichy*, *Schulz & Böhmermann*,
*Knallerfrauen*, *Pappa ante Portas*, *Pastewka*, *Ödipussi*, *Hubert ohne Staller*, *ZDF Magazin* —
**11 dei 38 sbagliati vengono da una sola bolla (674)**. I 38 sbagliati hanno `vote_count` mediano
**126**: sono titoli oscuri con un pugno di co-spettatori, non film di qualità bassa.

### Un ponte per Terabithia (2007) — 52 giusti, 8 dubbi, 40 sbagliati

Il migliore dei sei fino al 30: **30 su 30 giusti**, **9 dei primi 10 nella bolla 1395**. Il primo
sbagliato è **Hairspray** (44), poi il campionatore: *Il fidanzato della mia ragazza*, *La sfida di
Jace*, *Preferisco il paradiso*, *Jojo Rabbit* (53), *Preacher* (63), *Espiazione* (68), *La ragazza
con l'orecchino di perla* (100). Qui la coda è **eterogenea**, non un mondo: 70 bolle diverse nel
top 100.

**Inkheart e Terabithia si somigliano davvero**: 11 titoli comuni nei rispettivi top 20 (Jaccard
0,38), 13 nei top 100. La bolla 1395 è un mondo vero. Il fallimento non è "il grafo non capisce il
fantasy per famiglie": è la coda oltre la bolla.

### Inception (2010) — 42 giusti, 37 dubbi, 21 sbagliati

I primi 20 sono tutti giusti: Matrix, Interstellar, The Prestige, Memento, Fight Club, Source Code,
Dark Knight, Avatar, Ex Machina, Arrival, Donnie Darko, Shutter Island, Tenet, I soliti sospetti,
Se mi lasci ti cancello, Nightcrawler, Seven, Il cigno nero, Oldboy, Batman Begins. Il primo
sbagliato è **Il Signore degli Anelli – Il ritorno del re** (32). Il numero alto di **dubbi** (37) è
il segno di una coda "film da cineteca": Pulp Fiction, Forrest Gump, Parasite, Il silenzio degli
innocenti, American Psycho — **belli, ma non lo stesso mondo**. È il caso meno volgare: sbaglia di
più per **allargamento** che per spazzatura.

### Perfetti sconosciuti (2016) — 29 giusti, 13 dubbi, 58 sbagliati

Il caso peggiore. I primi 20 sono giusti e intelligenti: The Place, *(Nie)znajomi* (il remake
polacco), Carnage, *Perfectos desconocidos* (il remake spagnolo), Mr. Ove, Dio esiste e vive a
Bruxelles, Who Am I, Storie pazzesche, Contrattempo, Supereroi, El cuerpo, Apri gli occhi, Tesis,
Tangerines, Loveless. Poi il primo sbagliato a **27** (*Без границ*), e dal 33 in avanti è un
campionatore: *Fun Mom Dinner* (34), *Shame* (36), *La leggenda del pianista sull'oceano* (42),
*La Pianista* (58), *Captain Fantastic* (87), *Hachiko* (90), *Perfect Blue* (98), drama cinesi e
coreani sparsi (63-77, 92-94). Il grado è basso (**212**) e il peso totale è **20,4**: il segnale
è poco, e la coda è quasi tutta rumore.

### Breaking Bad (2008) — 40 giusti, 15 dubbi, 45 sbagliati

I primi 10 sono ottimi: Better Call Saul, Narcos, Power, El Chapo, El Camino, A Model Family,
Chernobyl, Prison Break, Squid Game, Le regole del delitto perfetto. Poi **al 14 un drama coreano**
(*은수 좋은 날*), al 22 *בני ערובה*, al 25 **Seinfeld**, al 31 **How I Met Your Mother**, al 33
**Boris**, al 37 **Il Trono di Spade**, al 46 **The Walking Dead**. E il colmo: i vicini giusti del
mondo crime — **The Shield (87), Ozark (89), I Soprano (90), Fargo (93), Sons of Anarchy (79)** —
stanno **dopo** la spazzatura, con pesi 100-1000 volte più piccoli. È la prova più chiara che
**l'ordine, oltre un certo punto, non è un ordine di rilevanza**.

## Come giudico l'ordine

1. **Fino a 10 è affidabile**: 60/60. Il primo vicino è quasi sempre il "fratello" giusto
   (Spider-Man 2, Better Call Saul, Matrix per Inception, Spiderwick per Inkheart/Terabithia).
2. **Fino a 20-30 è buono per i film**, meno per le serie: a 20, cinque titoli su sei sono al
   95-100%, Breaking Bad al 55%; a 30, i film sono all'87-100%, Breaking Bad al 53%.
3. **Oltre 30-40 è un campionatore.** Il primo sbagliato arriva tra il 14 e il 52; a 100, il 37%
   è sbagliato. Non è "meno pertinente": è **attivamente sbagliato**, e in mezzo ci sono titoli che
   non hanno niente a che vedere col seme.
4. **La coda non è ordinata per rilevanza.** Breaking Bad è il caso da manuale: i drama coreani al
   14 e i Soprano al 90. Anche Inkheart: la TV tedesca al 41-58, *Merlin* al 52. L'ordine è
   monotono **nel peso**, non **nel significato**.
5. **La profondità 100 non è comparabile fra titoli.** Il 90% del peso sta nei primi **17** vicini
   di Breaking Bad, **20** di Spider-Man, **31** di Inkheart, **35** di Terabithia, **38** di
   Inception, **90** di Perfetti. Per Breaking Bad il 100 è profondissimo (oltre il 17° c'è il 10%
   del peso, e quasi tutta la spazzatura); per Perfetti il peso è spalmato su 90 vicini, ed è
   proprio quella spalmatura il sintomo che non c'è un nucleo. Un taglio fisso a 100 non dice la
   stessa cosa su due titoli diversi.
6. **Il criterio è il peso, non la similarità.** Il peso è una somma di coseni di co-visione: non
   corregge per **quanti** spettatori condividono un titolo, né per il **supporto** (un titolo con
   10 voti e pochissimi co-spettatori può entrare nella coda con un peso non nullo). Per questo la
   coda è fatta di
   **titoli oscuri** (mediana 70-610 voti per quattro semi) o di **hub** (Shrek, Nemo, Peter Pan per
   Spider-Man), e i 21 sbagliati di Spider-Man hanno `vote_average` mediano **7,13**: non sono
   "film brutti", sono "film di un altro pubblico".

## Cosa ne ricavo (e cosa cambia rispetto alla pulizia di ieri)

**La pulizia col voto non tocca questa coda.** I vicini sbagliati non sono film con voto basso:
mediana `vote_average` **6,3-7,1**. Sono film **estranei**, non film **brutti**. Quindi il filtro
sulla coda del punteggio (715 titoli a 2,5σ) e il filtro sui vicini sono **due mestieri diversi**:

| problema | leva giusta |
|---|---|
| un film **brutto** dentro una bolla | voto / bayesiano (la pulizia di ieri) |
| un film **estraneo** dentro una bolla | coerenza / supporto (non il voto) |
| un **arco** che non dovrebbe esistere | supporto minimo, lift, normalizzazione per grado — non il voto |

Il caso concreto: la bolla di Inception (2088) contiene **Patisserie Coin De Rue**, un film
giapponese con **10 voti**, e il lessico della bolla si porta dietro `kw:patisserie`. Il voto
bayesiano lo tira a 6,5; la mediana della bolla è ~7,6, ma la MAD non basta a buttarlo fuori. Non è
"schifezza di voto": è **supporto insufficiente**. Lo stesso vale per gli 11 titoli tedeschi della
bolla 674 dentro il top 100 di Inkheart.

**La buona notizia**: il prodotto non vede questa coda. La camminata usa la **potatura top-16 per
riga** (più gli archi inversi), e i primi 16 sono quasi tutti difendibili; per Spider-Man la riga
potata ha 28 archi, ma i pesi oltre il 16° sono piccoli. Il top-100 è una **radiografia del
substrato**, non la lista che Stremio mostra. E la parte del substrato che funziona è **la
partizione**, non l'arco: Inkheart e Terabithia nella stessa bolla, Spider-Man con i suoi film,
Breaking Bad con Better Call Saul e Ozark (anche se l'arco verso Ozark è al rango 89). **Il grafo
sa dove guardare; non sa ordinare 100 titoli.**

**Se un giorno si vuole pulire la coda**, la leva non è un'altra soglia sul voto: è un **supporto
minimo** sull'arco (co-spettatori, o un lift rispetto al caso), che il triangolo attuale non porta
con sé. È lo stesso buco che rende rumorosi i 100: il peso non dice **quanta evidenza** c'è dietro.

---

## Riproduzione

```bash
cd .scratch/pulizia-bolle
../../offline_graph_builder/venv/Scripts/python.exe 04-sonda.py     # i 6 top-100 completi
../../offline_graph_builder/venv/Scripts/python.exe 05-lettura.py   # i conteggi e la curva
```
