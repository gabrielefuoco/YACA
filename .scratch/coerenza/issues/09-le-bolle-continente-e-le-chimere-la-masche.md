Status: ready-for-agent
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
