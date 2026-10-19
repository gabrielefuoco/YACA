Status: ready-for-agent
Type: research

# 01 — La sonda della perdita

## Verifica prima

- `scripts/qa/probe-ticket-55-mondi.js` esiste ed è la sonda da **estendere**, non da riscrivere.
- `src/library/seeds.js:90` `semiDi()` — e il fatto che su Mongo non connesso (`readyState !== 1`) restituisce semi
  **vuoti**: una misura fatta così è un artefatto.
- `src/pool/index.js`: `HERO_STRATEGIES` ha una sola voce (`graph_rows`), chiama `graphClient.raccomanda({semi,
  medium, opzioni, cap: 60})` e assegna quattro liste per `ruolo` (`il_tuo_mondo`, `un_passo_fuori`,
  `uscite_nuove`, `nicchia_di_qualita`).
- `src/stremio/idratazione.js` idrata e pagina; `ITEMS_PER_PAGE = 20` in `src/config.js`.

## Cosa deve uscire

**Una sonda committata** — `scripts/qa/probe-perdita-righe.js` — che per **ogni riga hero** (e per i due medium)
stampi una tabella con **sei stadi**:

| stadio | che cosa conta |
|---|---|
| 1. semi | quanti semi, per tipo (`loved` / `liked` / `watched` / `library`) |
| 2. grezzo | quanti titoli tornano da `/raccomanda`, per `ruolo` |
| 3. sovrapposizione | quanti titoli compaiono in **più di una** riga (e quanti doppioni totali) |
| 4. filtri | quanti sopravvivono a `kidsMode` e `animePolicy` (e **quanti** toglie ciascuno) |
| 5. idratazione | quanti si idratano davvero (e **quali** non, con il motivo: TMDB 404, medium sbagliato, …) |
| 6. pagine | quanti escono nelle pagine servite (20 + 20 + …) |

Deve girare in **due modi**: `--fixture` (nessun Mongo, nessuna rete: la sonda si costruisce i suoi dati, come le
altre sonde del repo) e `--live` (profilo reale; gli identificativi si prendono dall'ambiente, **non** si scrivono
nel repo).

## La prova

- L'output della sonda in `--fixture`, con la tabella dei sei stadi.
- **La prova che la sonda misura davvero**: con un filtro disattivato a mano dalla sonda (patch dell'istanza), il
  numero dello stadio corrispondente **cambia**. Se non cambia, la sonda non sta misurando niente.
- Suite alla baseline e i due hash del manifest: in questo ticket **non devono cambiare**.

## Non fare

- Non toccare `motore.py`, `parametri.py`, `pool`, `idratazione`. Questo ticket **misura e basta**.
- Non aggiungere dipendenze.

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
