Status: ready-for-agent
Type: task
Blocked by: 13

# 14 — Il ritorno delle impressioni

## Il difetto

`src/profile/impressions.js` (`recordRecommendationImpressions`) scrive su MongoDB
(`RecommendationImpression`) i titoli serviti a **pagina 1**, e **nessun modulo** di `pool/` o `stremio/` li rilegge
(verificato: l'unico chiamante è `src/stremio/hybridServing.js:155`, che **scrive**). Chi apre Stremio per dieci
giorni vede gli stessi titoli in cima.

## Cosa deve uscire

1. **Lettura** delle impressioni degli **ultimi 14 giorni** per l'utente (e per il catalogo), con una funzione che
   oggi non esiste.
2. **Soft-decay sul punteggio**, senza invalidare la cache del grafo:
   `score_effettivo = score * (0.85 ** giorni_mostrato_in_home)` per i titoli mostrati in pagina 1 per **≥3 giorni
   diversi** e **mai visti**.
3. **Non si cancella**: il titolo **scende**, e salgono i candidati dalla posizione 21–60. Questo è il punto: una
   riga che si rinnova senza perdere qualità.
4. **Costo dichiarato**: una lettura per richiesta (o una cache breve, se serve) — si misura e si scrive.

## La prova

- Un caso con un titolo forte mostrato per **5 giorni** senza essere visto: senza decay sta primo, con il decay
  scende e un titolo dalla posizione `25` sale in prima pagina.
- Un titolo **visto** dall'utente **non** subisce decay (è già escluso dai visti, ma provalo).
- Il comportamento è **deterministico** a parità di impressioni: niente casualità, altrimenti i test non tengono.
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
