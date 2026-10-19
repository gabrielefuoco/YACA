Status: ready-for-agent
Type: task
Blocked by: 03

# 04 — Anti-monopolio di saga e regista

## Verifica prima

- In `services/graph/bubbles.py` i componenti `COLL` (peso **3**) e `DIR` (peso **1**) legano fortissimo i film
  della stessa collezione o dello stesso regista.
- Sulle righe del grafo **non** viene applicata nessuna delle due regole di cap che esistono già altrove
  (`src/pool/composer.js`, `src/profile/ProfileScorer.js` `applyDiversityCaps`): verifica che sia vero.
- Nel canone sono disponibili `collection_id`, regista e `ANNO` (o la data di uscita).

## Cosa deve uscire

Nelle righe del grafo (tutte, non solo `il_tuo_mondo`):

1. **Massimo 1 titolo per `collection_id`** TMDB nei primi **20** slot di una riga.
2. **Massimo 2 titoli per lo stesso regista** nei primi **20** slot.
3. Dentro una collezione si tiene il **titolo con `ANNO` minore fra i non visti**: se l'utente non ha visto *Dune —
   Parte Uno*, non gli si propone *Parte Due*. (Questa è la parte che conta più del cap: è un errore di senso, non
   di varietà.)
4. I titoli esclusi dal cap **non spariscono**: scendono sotto i primi 20 (come per il decay delle impressioni).

## La prova

- Un caso costruito con **6 film della stessa saga** e **5 dello stesso regista** a punteggio alto: nei primi 20
  slot deve comparire **1** della saga e **2** del regista, e i titoli esclusi devono essere ancora presenti **dopo**
  la posizione 20.
- Il caso *Dune*: con *Parte Uno* non visto, *Parte Due* non deve precedere *Parte Uno*.
- Suite alla baseline.

## Trappole

- Se `collection_id` o il regista non sono nel canone a runtime, **dillo** invece di inventare un criterio: la
  regola si applica solo a ciò che si sa.
- Il cap è sui **primi 20**, non su tutta la lista: non svuotare la coda.

## Regole comuni a ogni ticket di questo cantiere

- **Prima di toccare il codice, conferma le premesse** elencate in "Verifica prima". Vengono da un'analisi
  statica, non da una misura: se il codice dice altro, **fermati** e scrivi la divergenza nell'Esito invece di
  adattare il codice a una premessa sbagliata.
- **Verificare eseguendo, non leggendo.**
- Baseline suite **misurata**: `5 suite rosse / 8 test falliti / 1898 passati` (190 suite). Le sole ammesse:
  `animeOverridesCertify`, `candidateProvider`, `donghuaCatalog`, `duckDbAndMatchmaker`, `presetBurtonOrdering`.
  Si incolla la lista `FAIL` e i totali: un sottoinsieme scelto a mano non è una prova.
- **Il frontend non si tocca.** Niente `git push`. Niente `npm run build` / `tsc`. Non si tocca la produzione.
- **La prova non vive nel prodotto**: niente flag `simulate*` nel percorso caldo. Se una sonda deve mostrare un
  difetto, lo fa dall'esterno (patch dell'istanza).
- **Ogni riga che non si riesce a riempire lo dichiara**: il difetto di `uscite_nuove` è nato da un silenzio
  (`if not titoli_raw: continue`). Nessuna lista sparisce senza dirlo.
- **Il pavimento di qualità non si abbassa per riempire.**
