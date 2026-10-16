# 15 - Limite 8 KB del manifest Stremio: test da fare sul server

## Il dubbio

Stremio applica un limite di **8192 byte** al manifest quando lo salva nella collezione addon dell'account. Il limite **non è del client**: è del server centrale (`api.strem.io/api/addonCollectionSet`, errore `Max descriptor size reached`). Quindi non dovrebbe rompere l'addon in esecuzione, ma **la sincronizzazione/installazione** della collezione.

Misurato sul codice attuale:

| Voce | Valore |
|---|---|
| Cataloghi fissi/hero | 16 → 2.430 byte |
| Costo per preset utente | ~204 byte |
| Setup tipico (7-20 preset) | 23 cataloghi → **~3,9 KB** |
| Soglia superata a | **28 preset** (44 cataloghi → 8.382 B) |
| Massimo teorico | 176 cataloghi → 37 KB |

Ipotesi da verificare: **non è detto che sia un fallimento vero**. Stremio potrebbe gestirlo con un retry (primo tentativo più lento, secondo riuscito), oppure degradare senza errori visibili. Finché non lo si prova su un server reale, resta un'ipotesi.

## Test da eseguire (quando il server è attivo)

1. Creare un profilo con **N preset crescenti**: 20 → 25 → 28 → 35 → 50.
2. Per ogni N: installare/aggiornare l'addon da Stremio (che passa da `addonCollectionSet`) e osservare:
   - il manifest viene accettato? errore esplicito nel client?
   - se fallisce, **riprova** e vedi se il secondo tentativo riesce (ipotesi retry);
   - quanto tempo impiega il salvataggio (rallenta o fallisce netto?);
   - cosa si vede lato utente (banner, addon mancante, catalogo incompleto).
3. Misurare i byte reali del manifest a ogni N (dal server: `curl` sul manifest e `wc -c`).

## Esito atteso

- **Se non si rompe** (o si rompe solo molto sopra i 28): nessuna azione, il dubbio è chiuso.
- **Se si rompe a ~28 preset**: applicare una delle due strade:
  - **cap a 25 preset per profilo** (semplice, con messaggio chiaro nella UI YACA);
  - **accorpare i cataloghi** (una voce per "tipo" con filtri dentro), che abbassa il costo per preset.

## Contesto tecnico (per chi lo farà)

- Manifest generato per-utente in `src/api/stremio.js`; cataloghi da `src/data/presets.js` + config utente.
- Il costo per preset dipende dai campi della voce catalogo (`extra`, `extraSupported`, `genres`).
- Riferimenti: `.scratch/stremio-sdk/04-manifest-size.md` (misure e fonti), `.scratch/stremio-sdk/01-sdk-research.md` (documentazione protocollo).
