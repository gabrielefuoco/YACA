Status: ready-for-agent
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
