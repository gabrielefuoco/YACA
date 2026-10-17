Status: resolved
Type: task

# 40 — «Il tuo mondo»: almeno 50 titoli, accumulando i mondi vicini

## La decisione (18/10/2026)

`il_tuo_mondo` non deve **scegliere** un mondo: deve **accumularne** finché la riga non ha **almeno 50 titoli**
(quando il grafo può darne tanti). L'ordine è quello dell'attivazione modulata: **prima il mondo del profilo**,
poi i successivi (il più vicino, e se non basta quello dopo ancora, ecc.).

## Perché — la misura che ha ucciso l'ipotesi precedente

Il ticket 38 di questa mappa sospettava che `il_tuo_mondo` scegliesse un mondo **incompatibile coi selettori**.
La sonda (`.scratch/suggerimenti/probe-ticket-38.py`, eseguita sui dati reali dell'utente `REOZrGNRr3`) ha
dimostrato il contrario:

- il mondo scelto (**Bolla 3085**, `att_s = 0.19`, il massimo) è **100% non-anime** → **nessun titolo scartato**
  dai filtri;
- la bolla ha **4 titoli in tutto** nel grafo, e l'utente ne ha già visto uno → **ne esistono solo 3**;
- il motore **esenta il primo mondo** da `MIN_TITOLI_MONDO` (`motore.py:288-296`: *«Il PRIMO resta sempre, anche se
  e' piccolo: e' il mondo del profilo»*).

Quindi i 3 titoli non sono una perdita: sono una **regola di prodotto**. Questa decisione la cambia.

## Cosa deve uscire

1. **`il_tuo_mondo` accumula**: dal mondo del profilo in poi, nell'ordine dell'attivazione, finché la riga non
   raggiunge **50 titoli** (o finché i mondi finiscono).
2. **Il cap dei mondi non-primi va alzato**: oggi `motore.py:336` applica `min(8, cap_main)` ai mondi successivi,
   quindi anche accumulandoli la risposta ne porterebbe 8 per mondo. Il numero da servire deve permettere
   l'obiettivo dei 50.
3. **L'etichetta resta vera**: il mondo del profilo è il **primo** della riga (la riga non è più «un mondo», è
   «il tuo mondo e i vicini») — se il senso del catalogo cambia, va **detto nel commento e nel nome**, non
   lasciato implicito.
4. **La prova è il numero**: la sonda prima/dopo sullo stesso utente — la riga passa da **3 titoli** a **≥ 50**
   (se il grafo li ha). E il conteggio di `yaca_passo_fuori_series` non deve peggiorare (oggi è 20 ✓).
5. **`MIN_TITOLI_MONDO` resta** per i mondi che *seguono* il primo (non si svuota la regola: si evita che il primo
   mondo, da solo, decida la riga).

## Come si verifica

- `services/graph/`: i suoi test (`pytest tests/` — incluso `test_contratto_servizio.py`) verdi.
- La sonda `.scratch/suggerimenti/probe-ticket-38.py` rieseguita: il numero dei titoli di `il_tuo_mondo`.
- `tests/graphRowsInvariant.test.js` + `tests/heroPoolAnimeExcludeCap.test.js` (lato Node) verdi.
- **Non si deploya**: la ricostruzione del servizio sul mate è un passo del ticket 30 (`docker compose build graph`),
  perché il workflow del grafo è bloccato dal ticket 18.

## Attenzione

Il motore è il **contratto** del servizio (`services/graph/`): se il cambio richiede di toccare anche
`src/pool/**` (il consumatore), va fatto — ma **dichiarato nell'Esito**, perché quel file è di un altro modulo e
il prossimo che legge deve sapere perché.

## Esito (18/10/2026)

### 1. Cosa è cambiato nel motore (`services/graph/`)
- **`services/graph/parametri.py`**:
  - Aggiunta la costante `IL_TUO_MONDO_MIN_TITOLI = 50` con stato `DICHIARATO`.
  - Preservata la regola `MIN_TITOLI_MONDO = 5` per i mondi successivi al primo.
- **`services/graph/motore.py`**:
  - `bolle`: la selezione parte dal mondo del profilo (`primo = ordine[0]`, esente da `MIN_TITOLI_MONDO`) e accumula i mondi successivi in ordine decrescente di attivazione modulata (`att_s`) che abbiano almeno `MIN_TITOLI_MONDO` (5) titoli non visti, fino a quando i titoli accumulati raggiungono almeno `IL_TUO_MONDO_MIN_TITOLI` (50) e `len(bolle) >= slider.get("largo", 4)`.
  - `liste["il_tuo_mondo"]`: popolata con `righe_titoli(bolle, quanti_tuo)` (con `quanti_tuo = max(50, cap_main)`), aggregando i titoli di tutti i mondi accumulati e ordinandoli per attivazione nel rispetto della monotonia.
  - `liste["mondo_{b}"]` (linea 336): alzato il cap da `8 if cap is None else min(8, cap_main)` a `cap_main`, consentendo a ciascuna bolla successiva di restituire tutti i suoi titoli disponibili.
  - Aggiornati i commenti in testata e nella funzione `lista()`.
- **`services/graph/servizio.py`**:
  - Aggiornato il ruolo `il_tuo_mondo`: se sono stati accumulati più mondi, la descrizione dichiara esplicitamente i mondi coinvolti (`il tuo mondo ({b}) e i vicini (...)`) e `semi_ids` include i semi di tutti i mondi accumulati.

### 2. Misure della sonda `.scratch/suggerimenti/probe-ticket-38.py` (utente reale REOZrGNRr3)
- **Prima del fix**:
  - Mondi candidati: 3 (Bolla 3085: 3 serie, Bolla 3015: 16 serie, Bolla 1981: 7 serie)
  - `il_tuo_mondo`: Mondo 3085 -> **3 titoli**
  - `un_passo_fuori`: Mondo None -> **47 titoli**
  - `mondo_3015`: **8 titoli** (cappato a 8)
- **Dopo il fix (Ticket 40)**:
  - Mondi candidati accumulati: 6 (3085 [3], 1739 [11], 3015 [16], 3134 [9], 1981 [7], 1350 [11])
  - `il_tuo_mondo`: Mondo 3085 -> **57 titoli** (raggiunto l'obiettivo **≥ 50**, guadagno da 3 a 57 titoli)
  - `un_passo_fuori`: Mondo None -> **47 titoli** (invariato: `yaca_passo_fuori_series` non peggiora e conserva i suoi 20 titoli HTTP)
  - `mondo_1739`: 11 titoli
  - `mondo_3015`: 16 titoli (cap a 8 sbloccato)
  - `mondo_3134`: 9 titoli
  - `mondo_1981`: 7 titoli
  - `mondo_1350`: 11 titoli

### 3. Suite di test eseguite e conteggi
- `pytest tests/test_contratto_servizio.py`: **10 passati su 10** (2.45 s)
- `pytest tests/test_graph_pipeline.py`: **18 passati su 18** (2.90 s)
- `npx jest tests/graphRowsInvariant.test.js --forceExit`: **4 passati su 4** (1.16 s)
- `npx jest tests/heroPoolAnimeExcludeCap.test.js --forceExit`: **1 passato su 1** (6.52 s)
- `npx jest tests/graphClientPoolIntegration.test.js --forceExit`: **6 passati su 6** (1.30 s)

### 4. Modifiche a `src/pool/**`
- **Nessuna modifica a `src/pool/**`**: il consumatore `src/pool/index.js` consuma già direttamente l'array `titoli` restituito per `il_tuo_mondo` (`resGraph.liste.find(l => l.ruolo === 'il_tuo_mondo')`) e lo mappa con `ensurePoolItem`. Poiché il servizio HTTP ora consegna 57 serie con medium coerente, la pipeline a valle riceve la capienza necessaria senza interventi sui file Node.

### 5. Blocker e cosa non è stato possibile fare
- Non è stato effettuato alcun deploy né `docker compose build graph` sul server mate, conformemente alle regole del brief (la ricostruzione sul mate è delegata al ticket 30).
- Nel nostro worktree git locale, la cartella `services/graph/data/` (non tracciata in git) è stata collegata tramite giunzione NTFS verso la copia presente nella repo madre per consentire l'esecuzione locale della sonda e dei test pytest.
