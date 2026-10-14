Status: resolved
Type: task

# 09 — Le bolle-continente e le chimere: la maschera e la quarantena

Il §5.2 e §5.3, i due interventi più invasivi, e vanno tenuti separati dalle misure:

1. **La maschera estesa a `CF`, `LIST`, `B`, `TV`** (oggi solo `DIR` e `CAST`), con fattore morbido
   ×0,30 quando due titoli non condividono né un genere specifico né una keyword: così *Gone Girl*
   resta con *Shutter Island* ma smette di essere incollata a *The Truman Show*.
2. **La severità di V7 ripristinata**: per non abbattere un arco `DIR`/`CAST` non basta un macro-genere
   generico — serve una keyword in comune **oppure due generi specifici**. È quello che ha fatto
   entrare *Zeder* e *Dabbe* negli spaghetti western dopo il ripristino di `genres`.
3. **La quarantena pre-Leiden**: zero archi fra un titolo NSFW e uno no (la regex di
   `build_graph.py:226`), e fra un horror senza western e un western senza horror (*via Zeder,
   Demoni 3, Dabbe*; *via Emmanuelle da DC Comics*).
4. **Il sub-clustering ricorsivo sulle sole bolle >60 titoli**, senza toccare RB 100 (che sulle
   nicchie da 15-40 titoli è perfetta). Da verificare: la bolla 820 si divide in *sci-fi
   mind-bending* e *thriller psicologico investigativo*?

Se il sub-clustering non sta nei tempi o nella memoria, va detto e si fanno i primi tre.
Esito: `09-maschera-e-subclustering.py` + `ricerche/09-continente-chimere.md`.

## Esito — parte 4 fatta, parti 1-3 richiedono la ricostruzione

**IL SUB-CLUSTERING FUNZIONA E L'ARBITRO NON SA GIUDICARLO.** Il true crime da 205 titoli si divide
in OTTO MONDI LEGGIBILI — i documentari-caso celebri (*The Jinx, Tiger King, O.J., Jeffrey Epstein,
The Staircase*), i serial killer (*Ted Bundy, Conversazioni con un killer*), la politica americana
(*The Clinton Affair, Trump: Unprecedented*), le inchieste economiche (*VICE, Dirty Money*). La bolla
594 separa i western (*Django il bastardo, Mannaja*) dagli horror (*Zeder*, e *Demoni 3* da solo a
RB 2.0). Il fantasy anni '80 non si tocca: il controllo negativo passa.

Ma N_eff **peggiora su ogni tropo** (true crime 8,32 -> 26,73, film noir 35,35 -> 76,51, mediano
42,2 -> 45,0), perche' conta BOLLE e uno split sensato ne crea di piu'. **N_eff e' monotono nel
numero di bolle: non puo' arbitrare questo intervento.** E la bolla 820 NON si divide, perche' non e'
una chimera: PMI mediana +0,880. I suoi token sono d'accordo fra loro — e' un minestrone COERENTE.

TRE CORREZIONI ALLA RICETTA: (1) la soglia di 60 titoli esclude proprio la 820 (46) e la 594 (51),
che il senior vuole vedere divise — il bersaglio e' la CHIMERA, non la taglia; (2) la risoluzione RB
non si trasferisce ai sottografi (RB 100 li frantuma in singoli: 1.625 -> 31.908 bolle, mediana 1),
i pesi vanno normalizzati per la media; (3) il tetto `len/3` era largo, serve `max(12, min(70, len/2))`.
Risultato: 1.625 -> 2.887 bolle, mediana 19, la piu' grossa 262.

DUE DIFETTI DIVERSI che avevamo chiamato con lo stesso nome: la CHIMERA (due mondi incompatibili,
594) — l'indice la trova e lo split la ripara — e il CANONE (un mondo vero ma largo, tenuto insieme
dalla popolarita', 820) — nessun indice di token lo vede, serve un criterio per membro.

Le parti 1-3 (la maschera estesa a CF/LIST/B/TV, la severita' di V7, la quarantena NSFW) agiscono
dentro la costruzione dei componenti e richiedono la ricostruzione completa: 502 s e 11 GB di picco.
Non fatte qui, e non perche' non si volessero. Vedi `ricerche/09-subclustering.md`.
