Status: ready-for-agent
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
