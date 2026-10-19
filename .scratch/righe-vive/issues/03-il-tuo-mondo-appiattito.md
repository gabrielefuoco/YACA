Status: ready-for-agent
Type: task
Blocked by: 02

# 03 — "Il tuo mondo": bacino appiattito + pavimento + score

## Verifica prima

- In `services/graph/motore.py`, `lista()` seleziona le bolle (`bolle`) e prende i titoli **bolla per bolla**
  (`titoli_di`) **senza alcun filtro di qualità o popolarità minima**, poi riordina. Se nella bolla principale sono
  finiti titoli da 10 voti, entrano.
- `diffondi()` calcola già l'attivazione esatta `r` per **ogni** titolo del canone (66.259).
- `deduci()` calcola già `canone = median(voti)` della storia utente.
- Esistono `VOT` (numero voti), `VAVE` (media voto), `POP` (popolarità) e `VICINI` (adiacenza fra bolle).

## Cosa deve uscire

1. **Bacino appiattito** per `il_tuo_mondo`: invece di iterare bolla per bolla, si prende un **set unico** composto
   dalle prime *K* bolle accese (fino a coprire **≥80% della massa**, con un **minimo di 250–300 candidati
   grezzi**) **più** i membri dei primi **2–3 `VICINI`** di ciascuna.
2. **Pavimento di qualità** applicato **prima** del ranking, come maschera vettoriale:
   scarta `VAVE < 6.4` **oppure** `VOT < max(150, 0.08 * canone)`.
3. **Ranking combinato**: `score(x) = r[x] * (bayesian_vote(x) / 7.0) ** 1.5`. Mai `r[x]` puro.
4. **Nessun cambiamento al contratto**: le altre liste restano come sono in questo ticket.

## La prova

- Una sonda o un test che, sullo stesso profilo, mostri **prima/dopo**: quanti candidati nel bacino, quanti
  scartati dal pavimento, e i primi 10 titoli con il loro `VOT` / `VAVE` (devono essere tutti sopra il pavimento).
- Un caso costruito a mano in cui un titolo **con altissima attivazione e 8 voti** stia **sotto** un titolo con
  attivazione minore ma voto solido: con il ranking combinato il secondo deve venire prima.
- Suite alla baseline.

## Trappole

- **Il pavimento è adattivo**: `0.08 * canone` dipende dal profilo. Un profilo mainstream e uno d'essai devono
  ricevere soglie diverse — provalo, non darlo per buono.
- La maschera va applicata **prima** del taglio `[:cap]`: filtrare dopo significa restituire meno di `cap` titoli.
- Non allargare il bacino oltre il necessario: il costo è memoria e latenza, e il tetto di RAM del servizio è 512 MB.

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
