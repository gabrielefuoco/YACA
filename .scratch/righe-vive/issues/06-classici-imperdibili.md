Status: ready-for-agent
Type: task
Blocked by: 05

# 06 — "Classici imperdibili del tuo mondo"

## Cosa deve uscire

Una riga nuova che non sia la solita Top 250 IMDb uguale per tutti:

1. **Il candidato deve già stare nel top 300 per `r[x]`** del profilo, dentro i mondi accesi. (Questo è il filtro
   che la rende *sua*: senza, è una classifica globale.)
2. **Consenso alto**: `VOT[x] >= max(1500, 1.5 * V_mondo)` e `VAVE[x] >= 7.5` — per le **serie** `>= 7.7` (i voti
   delle serie su TMDB sono gonfiati).
3. **Ordine**: **70% attivazione + 30% Bayesian rating** (normalizza entrambi prima di combinarli).
4. Esclude i visti e rispetta il pavimento e i cap dei ticket precedenti.

## La prova

- Su un profilo costruito ad hoc intorno a **un solo micro-genere** (es. animazione giapponese), i primi 5 titoli
  devono appartenere a quel genere: se compare *Il Padrino*, il filtro del top 300 non sta funzionando.
- Un profilo **mainstream** deve ottenere una riga diversa da quella di un profilo d'essai (stessi dati).
- Suite alla baseline.

## Trappole

- Se `V_mondo` non è disponibile (profilo con pochi semi), **dichiara** che la riga usa il pavimento assoluto e non
  fingere che sia relativa.

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
