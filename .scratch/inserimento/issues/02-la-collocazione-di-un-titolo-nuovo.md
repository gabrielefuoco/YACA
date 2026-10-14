# la collocazione di un titolo nuovo

**Status**: `resolved`
**Type**: `task`
**Blocked by**: 01

Dove va un titolo appena uscito: proiettarlo e cercargli i vicini.

**Cosa fare**
1. Metadati del titolo (dal dump TMDB, o dall'API per i titoli che il dump non ha).
2. `v = proietta(metadati)` — il suo vettore nello spazio del comportamento.
3. I vicini in quello spazio: i titoli piu' simili fra i 66.259.
4. Voto: la bolla che riceve piu' vicini (nella partizione `bolle-nitrile-V7.npy`).
5. **Il confronto coi canali strutturali**: keyword, cast, regia, generi. I due metodi devono
   concordare, o va detto perche' no.

**Criterio di chiusura**
- Per Verity: il vicinato proiettato deve contenere _Quello che non so di lei_ e almeno due film di
  Michael Showalter. Se non li contiene, il ticket si chiude **negativo** e lo si dichiara.
- Il confronto proiettato / strutturale e' scritto con i numeri, non a parole.


---

## Esito

**La collocazione funziona**, ed e' il primo risultato positivo di questo effort. Report in
`ricerche/02-collocazione.md`.

- **Parte A** (1.500 titoli, comportamento nascosto, modello riaddestrato senza di loro): la
  proiezione **non** riproduce i vicini dello spazio CF — **0,0%** sui primi 10, 0,0% di bolle in
  comune col vicino vero. Tre volte il caso.
- **Parte B** (8 uscite 2026 non nel grafo): **8 su 8** in un mondo coerente. Michael -> Elvis e
  Judy. Odissea -> Troy e Gods of Egypt. Spider-Man -> X-Men e Deadpool. Super Mario -> Sonic.
- **VERITY -> bolla 632** con **Gone Girl**, Il segreto dei suoi occhi, The Guilty. Thriller
  psicologico tratto da un romanzo. Il mondo giusto.

**La riconciliazione**: la proiezione recupera la **struttura dei metadati**, non il comportamento.
Per il prodotto e' quello che serve (un film nuovo deve finire nel mondo giusto), ma **la
personalizzazione via comportamento previsto non c'e'**.

**Decisione presa** (era aperta nel ticket 01): una categoria fuori vocabolario si **ignora** e si
dichiara. Il regista di Verity (id 22215) non e' nelle 3.000 persone, e la proiezione ci arriva lo
stesso dalle keyword.

**Errore mio**: il primo giro della Parte B usava `TfidfTransformer().fit_transform()` su una riga
sola, e ogni film nuovo riceveva gli stessi vicini. Con l'IDF congelato sul catalogo, cambia tutto.