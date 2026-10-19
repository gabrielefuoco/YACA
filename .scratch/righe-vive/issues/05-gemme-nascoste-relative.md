Status: ready-for-agent
Type: task
Blocked by: 04

# 05 — "Gemme nascoste nel tuo mondo": nicchia **relativa**

## Verifica prima

- In `motore.py` la nicchia usa **due tagli statici uguali per tutti**: `POP[x] <= 20.0` e `VAVE[x] >= 7.0`.
- Ordina per `-(VAVE[x] + bonus_liste)`, **buttando via `r[x]`**: cioè il titolo più vicino al profilo non ha alcun
  vantaggio rispetto a uno lontano ma con voto alto.
- `deduci()` calcola già `canone = median(voti)` della storia utente e `VOTMED` per bolla.

## Cosa deve uscire

1. **Bacino**: lo stesso allargato di `il_tuo_mondo` (ticket 03).
2. **Tetto relativo di notorietà**: `VOT[x] <= min(0.35 * V_mondo, 2500)`, dove `V_mondo` è la **mediana dei voti
   del bacino acceso**, pesata per `att_s[b]`. E `POP[x]` sotto il **50° percentile** del bacino.
   (Per chi guarda blockbuster, 1.200 voti sono già "nicchia"; per chi guarda indie, no.)
3. **Pavimento assoluto**: `VOT[x] >= 40` — esistono film con 3 voti e media 9.0.
4. **Voto normalizzato sulla bolla**: `mu_b` = media voto della bolla; tiene `VAVE[x] - mu_b >= +0.4` **e**
   `VAVE[x] >= 6.8`.
5. **Ordine**: `r[x] * (VAVE[x] - mu_b + 1.0) * (1 + 0.15 * (LISTDEG[x] > 0))`.

## La prova

- Due profili **opposti** (uno mainstream, uno d'essai) sui stessi dati: la soglia di notorietà che ne esce deve
  essere **diversa**, e le due righe non devono coincidere. Questo è il cuore della ticket: se le due righe
  coincidono, la soglia non è relativa.
- Un titolo con `VOT` altissimo ma `r[x]` basso **non** deve entrare; un titolo con `r[x]` alto e `VOT` nel tetto sì.
- Suite alla baseline.

## Trappole

- Il "tuo mondo" di un profilo d'essai ha già voti bassi: **non** riusare `0.35 * V_mondo` senza il tetto assoluto
  di 2.500, o si apre a tutto.
- I voti delle **serie** su TMDB sono gonfiati di `0.3 rispetto ai film: se applichi la stessa soglia ai due
  medium, le serie vincono sempre.

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
