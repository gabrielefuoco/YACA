Status: resolved
Type: task
Blocked by: 19

# 12 — I filtri a monte, non a valle

## Il difetto

Oggi il grafo calcola su tutto e restituisce `cap = 60`; poi `src/stremio/idratazione.js` e
`src/stremio/catalogHandler.js` tagliano per `kidsMode` e `animePolicy`. Se un cluster è al 70% anime e l'utente ha
`anime: 'exclude'`, la riga arriva a Stremio con **8 titoli invece di 60** — e nessuno lo dice.

## Cosa deve uscire

1. **`animePolicy` e `kidsMode` viaggiano dentro `opzioni`** della `POST /raccomanda` (il contratto si estende in
   modo **retrocompatibile**: se il campo manca, il servizio si comporta come oggi).
2. **`motore.py` maschera prima del taglio `[:cap]`**: usa ciò che già ha in memoria (generi, `IS_TV`, il flag
   anime del canone) per escludere i titoli non idonei **prima** di riempire la lista.
3. **Ogni lista esce piena e già conforme**: il prodotto **non** deve più avere bisogno di tagliare per quei due
   criteri. I tagli a valle **restano** come rete di sicurezza (difesa in profondità), ma non devono più togliere
   quasi nulla — e il ticket lo **misura**.

## La prova

- Un profilo con `anime: 'exclude'` il cui bacino è **prevalentemente anime**: prima → riga corta; dopo → riga piena
  **e** senza anime. Il conteggio prima/dopo è la prova.
- Un profilo **kidsMode: true**: nessun titolo non-idoneo in uscita, e la riga non si accorcia.
- Il contratto resta retrocompatibile: una richiesta **senza** i nuovi campi si comporta come prima (test).
- Suite alla baseline.

## Regole comuni a ogni ticket di questo cantiere

- **Prima di toccare il codice, conferma le premesse** elencate in "Verifica prima". Vengono da un'analisi
  statica, non da una misura: se il codice dice altro, **fermati** e scrivi la divergenza nell'Esito invece di
  adattare il codice a una premessa sbagliata.
- **Verificare eseguendo, non leggendo.**
- Baseline suite **misurata**: `5 suite rosse / 8 test falliti / 1898 passati` (190 suite). Le sole ammesse:
  `animeOverridesCertify`, `candidateProvider`, `donghuaCatalog`, `duckDbAndMatchmaker`, `presetBurtonOrdering`.
- **Il frontend non si tocca.** Niente `git push`. Niente `npm run build` / `tsc`. Non si tocca la produzione.
- **La prova non vive nel prodotto**: niente flag `simulate*` nel percorso caldo.
- **Ogni riga che non si riesce a riempire lo dichiara**: nessuna lista sparisce senza dirlo.
- **Il pavimento di qualità non si abbassa per riempire.**

## Perché non è stato fatto al suo turno (20/10/2026)

La premessa «il flag anime del canone» è **falsa**: `metadati-canone.npz` non esporta nessun flag per
titolo (né anime né adulto), e l'anime è deciso lato Node. Il prerequisito è il ticket **19**; questo
ticket resta fermo finché il canone non porta i due array. Vedi `19-i-flag-del-canone.md`.

---

## Esito (20/10/2026) — la maschera si applica ai candidati, non alla pagina

### 1. La premessa

Il ticket chiedeva: «il flag anime del canone», che **non esisteva** → il prerequisito è stato il ticket
**19** (`ANIME`, `ADULTO` per titolo, con la lettura tollerante). Ora esiste, e questo ticket lo usa.

### 2. Cosa è uscito

- **`Motore.filtri_a_monte(anime, kids)`**: costruisce **una** maschera booleana sul canone
  (`ANIME` per `only`/`exclude`, `ADULTO` per il kids-mode) e la espone come `self.IDONEI`. Se l'artefatto
  non ha i flag, la maschera resta `None` e la dichiarazione lo dice
  (`artefatto senza i flag ANIME, ADULTO: i filtri a monte restano inerti`).
- **`Motore.filtra_idonei(cand)`**: toglie i non idonei da una lista di `(chiave, punteggio)` e si applica
  **dove i candidati nascono** — `righe_titoli` (un passo fuori e `mondo_*`), il tuo mondo, uscite nuove,
  nicchia, classici, ultime visioni, micro-cluster, ponti (normale e di fallback). Quindi il taglio `[:cap]`
  prende solo idonei: è esattamente «a monte», non un filtro sulla pagina già tagliata.
- **Il contratto del motore**: `opzioni.filtri = {anime, kids}` (validati: 400 se `anime` non è
  `only`/`exclude`), e la risposta dichiara sempre com'è andata (`filtri: {applicato, motivo, scartati}`).
- **Il pool** manda `filtri` dalle fonti che il prodotto usa già: `animePolicy` (con l'ordine di fallback
  che c'era) e `kidsMode`. Se non c'è nulla da filtrare **non manda `opzioni`**, così i default del motore
  valgono ancora (il ticket 41 lo fissa).

### 3. La prova (`scripts/qa/probe-ticket-12-filtri.py`)

Canone sintetico di 200 titoli, i 30 migliori anime e 5 adulti; politica `exclude` + kids.

```
$ py scripts/qa/probe-ticket-12-filtri.py
maschera: anime=exclude kids=True -> applicato=True scartati=35 (atteso 35)
A. taglio a valle:  0/20 idonei in pagina (il resto e' buco)
B. filtro a monte:  20/20 idonei in pagina
   primo idoneo servito: movie:1030 (prima era movie:1000, non idoneo)
artefatto senza flag -> applicato=False · motivo: artefatto senza i flag ANIME, ADULTO: i filtri a monte restano inerti (si rigenera metadati-canone.npz)
confronto: kids=True scarta 5 · anime=only tiene 30
OK
```

È il difetto misurato: con i filtri a valle la riga serviva **zero** titoli idonei (tutti i primi venti erano
anime), mentre 165 idonei stavano più sotto. Con la maschera a monte: **20/20**.

`tests/filtriAMonte.test.js` (3 test) prova il filo lato Node: `anime only` + kids arrivano come `filtri`,
`exclude` senza kids pure, e un profilo neutro non manda niente.

### 4. Suite

```
Test Suites: 5 failed, 193 passed, 198 total
Tests:       8 failed, 1 skipped, 1963 passed, 1972 total
```

### 5. Residui

1. **L'artefatto va rigenerato sul mate**: finché non ha `ANIME`/`ADULTO`, la maschera è inerte e lo
   dichiara (i tagli a valle restano la rete). È lo stesso passo del ticket 19.
2. **La maschera è sul canone intero**, non per riga: un titolo idoneo non compare comunque in una riga
   dove non lo porterebbe il grafo. È il comportamento voluto (si toglie, non si aggiunge).
3. **Il kids-mode non ha una lista «violenza» separata**: usa i generi/keyword adulti del prodotto
   (`ADULTO_GENERI`/`ADULTO_KEYWORDS`). Se il prodotto vuole un kids più severo, la leva è quella lista.
