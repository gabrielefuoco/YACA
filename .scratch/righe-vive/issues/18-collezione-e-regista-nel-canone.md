Status: ready-for-agent
Type: task

# 18 — La collezione e il regista non esistono a runtime: portali nel canone

**Prerequisito del ticket 04** (anti-monopolio saga/regista), scoperto eseguendolo il 19/10/2026.

## Il fatto

Il ticket 04 chiede due regole: **max 1 titolo per `collection_id`** e **max 2 per regista** nei primi 20 slot
di una riga, più la regola *Dune* (dentro una collezione si propone il titolo con `ANNO` minore fra i non visti).

Eseguendolo si è scoperto che **i dati non ci sono**:

- `canon.metadati()` esporta in `metadati-canone.npz` solo `VOT`, `VAVE`, `POP`, `ANNO`, `NEP`, `COZY`, `IMP`, `TIT`;
- **`collection_id` e il regista non sono per titolo**: in `bubbles.py` esistono solo come **archi della matrice
  dei pesi** (`COLL` peso 3, `DIR` peso 1), cioè come *relazioni*, non come attributi interrogabili;
- quindi a runtime `self.COLL = None` e `self.DIR = None`, e **entrambe le regole non possono scattare**. Nemmeno
  la regola Dune, perché senza la collezione non si sa cosa sia un seguito.

Il codice del 04 è scritto, collaudato su metadati iniettati e **inerte in produzione**. Non è un difetto del 04:
è un pezzo che manca sotto.

## Cosa deve uscire

1. **Nel canone, per ogni titolo**, due attributi nuovi: `COLL` (l'id della collezione TMDB, `0`/`-1` per "nessuna")
   e `DIR` (gli id dei registi, o il primo regista se il canone è monodimensionale). Il resto del canone non cambia.
2. **Nel file**: `metadati-canone.npz` li esporta, con i nomi e i tipi documentati; il codice che lo **scrive** e
   quello che lo **legge** vanno aggiornati **insieme**, e la lettura deve tollerare un `.npz` vecchio (senza le
   chiavi) dichiarandolo — un artefatto vecchio non deve far esplodere il servizio: deve dire «questo artefatto non
   ha la collezione», e il 04 resta inerte finché non si rigenera.
3. **La pipeline**: la rigenerazione dell'artefatto deve produrre le due chiavi. Se i dati grezzi (TMDB) le hanno,
   si prendono da lì; se non le hanno, **si dice** — non si inventa un proxy (niente match sul titolo).
4. **Una prova**: un titolo noto con una collezione reale (es. *Dune*) esce dal canone con `COLL` valorizzato, e due
   titoli della stessa saga hanno lo stesso `COLL`.

## La prova

- L'`.npz` nuovo elenca le chiavi: incolla il comando che le stampa.
- Un titolo con saga nota: `COLL` uguale per i due capitoli, e diverso da un titolo senza saga.
- Il servizio importa e risponde: `/health` 200, `/raccomanda` 200, **senza** errori di chiave mancante.
- Suite alla baseline (**5 rosse / 8 test / 1898 passati**) e i due hash del manifest invariati.
- Il ticket 04, dopo questo, **si può chiudere**: le sue regole diventano vive. Va detto nell'Esito del 04 che il
  prerequisito è arrivato, con la ricetta nuova.

## Trappole

- **L'artefatto è ~138 MB e non è in git**: si rigenera sul mate o dove i dati ci sono. Se non puoi rigenerarlo,
  produci comunque il codice e la prova su un **fixture**, e dichiara che la produzione resta inerte finché
  l'artefatto non è rigenerato.
- La **ricetta** (`parametri.impronta()`) deve cambiare se cambia il contenuto dell'artefatto: altrimenti la cache
  serve righe vecchie.
- I nomi delle chiavi sono un **contratto**: `COLL`, `DIR` — non `collezione`/`registi`. Chi legge il canone li cerca
  con quei nomi (vedi `motore.py`, ticket 04).

## Regole comuni a ogni ticket di questo cantiere

- **Prima di toccare il codice, conferma le premesse**: se il codice dice altro, fermati e dichiara la divergenza.
- **Verificare eseguendo, non leggendo.**
- **Nell'Esito, ogni numero sta dentro un blocco di output incollato, con il comando sopra.**
- **Il frontend non si tocca.** Niente `git push`. Niente `npm run build` / `tsc`. Non si tocca la produzione.
- Commit in steps, ognuno con la sua prova.
