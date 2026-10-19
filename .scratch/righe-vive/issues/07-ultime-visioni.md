Status: ready-for-agent
Type: task
Blocked by: 06

# 07 — "Sul filo delle tue ultime visioni"

## Verifica prima

- In `parametri.py` è **misurato** che *«la recenza non funziona come peso globale, ma funziona fortissimo come
  SELEZIONE: i soli ultimi 15 titoli fanno lift 47,5x contro 18,2x»*. Trova quel commento e riportalo nel ticket.
- **Trappola verificata nel piano**: `semiDi()` in `src/pool/index.js` restituisce una **Map** che **non preserva i
  timestamp né l'ordine cronologico**: prendere "i primi 15" dal dizionario dà i primi **per inserimento**, non gli
  ultimi visti.

## Cosa deve uscire

1. **I semi portano la recenza**: o `semiDi` (o `cronologiaDi`) espone l'ordine temporale (es. un flag `recente` sui
   primi 12–15, o la data), o il pool la ricava — ma **da una fonte vera**, non dall'ordine della Map.
2. **Seconda diffusione**: se ci sono **almeno 3** semi recenti, `ppr(Tr, righe_recenti, pesi_recenti)` — costo
   dichiarato: `2 ms`, la matrice è già in RAM.
3. **Bacino appiattito** sulle top 3–4 bolle accese **da quella** diffusione, con lo stesso pavimento di qualità.
4. La riga **cambia appena l'utente guarda 2–3 film di un filone nuovo**: è l'effetto che la prova deve mostrare.

## La prova

- Due giri con gli stessi semi ma con **ordine temporale diverso** (stessi titoli, date cambiate): le prime
  posizioni **devono cambiare**. Se non cambiano, la recenza non sta selezionando niente.
- Con meno di 3 semi recenti la riga **lo dichiara** (non esce vuota in silenzio) e il ticket dice cosa fa in quel
  caso.
- Suite alla baseline.

## Trappole

- Una data mancante non è "vecchia di zero": decidi e scrivi come la tratti.
- Non toccare `ALPHA` né la diffusione principale: questa è una **seconda** camminata, non un peso sul resto.

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
