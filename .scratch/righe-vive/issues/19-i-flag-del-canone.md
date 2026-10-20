Status: resolved
Type: task
Blocked by: 11

# 19 — I flag per-titolo nel canone (anime, adulto): il prerequisito del 12

## Perché esiste

Il ticket **12** (filtri a monte) chiede che `motore.py` mascheri i titoli non idonei **prima** del taglio
`[:cap]`, «usando ciò che già ha in memoria (generi, `IS_TV`, **il flag anime del canone**)». Verificato
eseguendo, **quel flag non esiste**: `metadati-canone.npz` esporta `VOT, VAVE, POP, ANNO, NEP, COZY, IMP`
(più `COLL`/`DIR` dal `18`) e nient'altro. `canon.py`, `bubbles.py` e `motore.py` non contengono nessuna
occorrenza di «anime»; l'anime è deciso **lato Node** (`src/anime/identita.js` + lo store di
`anime_mapping.json` in `.cache/tmdb`), e il kids-mode lato Node (`src/catalog/kidsModeFilters.js`, su
keyword/genere/certificazione).

Quindi il `12` non si può fare: un motore che non sa quali titoli sono anime non può mascherarli. Questo
ticket è il prerequisito, con lo stesso schema del `18` (COLL/DIR): il canone esporta i flag, il motore li
legge con tolleranza per gli artefatti vecchi, e il resto si sblocca.

## Cosa deve uscire

1. **`metadati-canone.npz` versione 3**: due array booleani per titolo,
   - `ANIME`: true se l'id è in `anime_mapping.json` (indici o `certifiedTmdbIds`), false se è in `exclude`,
     false se sconosciuto (l'euristica Node resta la fonte per i casi dubbi, il motore non la inventa);
   - `ADULTO`: true se il titolo ha una keyword adulta o un genere adulto (le stesse liste di
     `src/catalog/kidsModeFilters.js`, portate in `parametri.py` come dato, non ricopiate in due posti).
2. **Lettura tollerante** in `canon.metadati()` e in `Motore`: artefatto senza i flag → `self.ANIME = None`,
   `self.ADULTO = None`, **dichiarato**, e nessun crash (è lo stesso patto di COLL/DIR).
3. **Il dato esiste solo dove ci sono i Parquet**: la rigenerazione dell'artefatto è un passo **sul mate**
   (come `metadati-canone.npz` oggi). Il ticket si chiude col codice e con la prova sul fixture; la
   rigenerazione si dichiara come residuo operativo.
4. **La prova**: un fixture con `ANIME`/`ADULTO` impostati a mano, che mostra che il motore li legge; e un
   artefatto **senza** i flag che degrada dichiarandolo (come il test di tolleranza del `18`).

## Note

- Le liste delle keyword adulte e dei generi adulti vivono **in un posto solo**: oggi sono in
  `kidsModeFilters.js`. Se il motore le vuole, vanno in `parametri.py` e il file Node le legge da lì o
  restano due copie dichiarate — la seconda è il difetto ricorrente di questo cantiere, quindi la scelta va
  scritta nel ticket.
- Le soglie/criteri non si inventano: si portano quelli che il prodotto usa già.

---

## Esito (20/10/2026) — i flag esistono, e l'artefatto vecchio lo dice invece di rompersi

### 1. Cosa è uscito

- **`metadati-canone.npz` versione 3**: due array booleani per titolo,
  - `ANIME`: true per gli id che il **prodotto** ha certificato anime. La fonte è la stessa che usa il
    Node — `.cache/tmdb/anime_mapping.json` (`certifiedTmdbIds`, `animeTmdbIdsMovie`, `animeTmdbIdsShow`,
    `ids.*`) — non una lista riscritta qui. Se il file manca, `ANIME` resta vuoto e lo **dichiara**: nessun
    proxy inventato.
  - `ADULTO`: true se il titolo ha un **genere adulto** o una **keyword adulta**. Le due liste vivono in
    `parametri.py` (`ADULTO_GENERI`, `ADULTO_KEYWORDS`) come **gemelli dichiarati** di
    `src/catalog/kidsModeFilters.js`, e la sonda confronta i due elenchi: se il prodotto ne cambia uno, il
    motore lo scopre.
- **Lettura tollerante** (`canon.metadati` + `Motore.__init__`): artefatto senza i flag → `self.ANIME` e
  `self.ADULTO` sono `None`, il messaggio di avvio dice `senza flag anime/adulto (i filtri a monte restano
  inerti)` e non si solleva niente. È lo stesso patto di `COLL`/`DIR` del ticket 18.
- **L'artefatto si salva con i due array** (`np.savez_compressed(..., ANIME, ADULTO)`) e il costruttore dei
  metadati non chiede niente al di fuori di quello che c'è: se i Parquet non hanno le keyword, `ADULTO` si
  basa sui generi soli.

### 2. La prova (`scripts/qa/probe-ticket-19-flag.py`)

Gli artefatti veri (`spazi-trakt.npz`, `titoli-canone.txt`) vivono sul mate e **in locale non ci sono**: la
sonda usa un canone **sintetico di 4 titoli** e lo dichiara, invece di inventare un artefatto.

```
$ py scripts/qa/probe-ticket-19-flag.py
== Ticket 19: i flag per-titolo nel canone ==
  metadati-canone: questo artefatto non ha il flag anime (ANIME assente, i filtri a monte restano inerti)
  metadati-canone: questo artefatto non ha il flag adulto (ADULTO assente, i filtri a monte restano inerti)
  SENZA i flag (artefatto di oggi): ANIME=assente · ADULTO=assente
  CON i flag: ANIME=2 · ADULTO=1

  generi adulti:   prodotto [27, 53, 80] · motore [27, 53, 80] · uguali: True
  keyword adulte:  prodotto 23 · motore 23 · uguali: True
OK
```

### 3. Il residuo operativo, preciso

**L'artefatto sul mate va rigenerato** perché i flag arrivino in produzione: è lo stesso passo di
`COLL`/`DIR` (ticket 18) e vive dove ci sono i Parquet (`/srv/yaca/.cache/tmdb`). Finché non si rigenera,
il motore parte, lo **dice**, e i filtri a monte del ticket 12 restano inerti (i tagli a valle restano la
rete di sicurezza).

### 4. Suite

Nessun test Node toccato: le modifiche sono Python (canon, motore, parametri). La ricetta cambia — i
parametri del prodotto sono cambiati — ed è giusto che cambi:
`py -c "… parametri.impronta()"` → **`fee303c7e91ebcc3`** (prima: quella del ticket 18).
