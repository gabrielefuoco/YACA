Status: resolved
Type: task
Blocked by: 01

# 12 — Un solo scrittore della configurazione (e una tirata di slider = 1 POST)

## Perché

D6 del `map.md`. Il ticket 07.6 diceva «due `POST /api/configure` quando si salva». Rimisurato: il
caso vero è più grande.

- **Auto-save senza debounce.** `app/page.tsx:196` lo dichiara: `// 1. DB Sync (No debounce)`;
  l'effetto `:197-218` chiama `api.configure` a ogni cambiamento di `profiles`.
- **Slider legati a `onValueChange`.** `dashboard/DnaAndAiPanel.tsx:385` (e `:415`, `:433`, …) chiama
  `handleSliderChange` a **ogni passo**; lo slider «lontano» ha `step 0.05` su 0..1 → **20 cambi di
  stato per una tirata** → 20 `configure`.
- **Doppio percorso sul salvataggio.** `pages/SettingsPage.tsx:55-100`: `handleSave` chiama
  `onUpdateProfile` (`:62`), aspetta 50 ms (`:70`), mappa su `profiles` (`:72`, closure vecchia),
  e chiama `api.configure` (`:86`) — mentre l'auto-save è già partito. Il bottone però **non è
  ridondante**: è l'unico che calcola `stremio://` e chiama `onConfigSaved` (`:96-108`).

## Cosa fare

1. `app/page.tsx`: l'effetto di auto-save diventa **debounced** (~500 ms, timer in un ref, cleanup
   che lo azzera). L'ultima modifica vince.
2. `DnaAndAiPanel`: gli slider aggiornano uno **stato locale** a `onValueChange` e scrivono con
   `onValueCommit`. Lo stato locale è la verità durante il gesto e si riallinea al profilo quando il
   profilo cambia da fuori: senza questo la manopola torna indietro mentre la trascini.
3. `SettingsPage.handleSave`: smette di chiamare `configure`. Diventa **«Installa in Stremio»**:
   - **flush** del debounce (esporre da `app/page.tsx` una `flushConfigure()` che, se c'è un timer
     pendente, lo esegue subito e restituisce la sua promise);
   - poi calcola `stremio://…` dalla `manifestUrl` già disponibile e chiama `onConfigSaved` /
     `stremioAddonUpdate`.
   **La corsa è il punto**: se installa mentre un salvataggio è in coda, installa la versione
   precedente.
4. Rimuovere `setTimeout(50)` e la `map` sulla closure.

## Done quando

- una tirata di slider produce **1** `POST /api/configure` nel pannello di rete;
- scrivere in tre campi di fila produce **1** POST (non tre);
- «Installa in Stremio» installa l'ultima versione anche se premuto subito dopo una modifica;
- nessun `configure` parte da `SettingsPage`.

## Verifica

Pannello di rete: `POST /api/configure` contati su (a) tirata di slider, (b) tre modifiche rapide,
(c) modifica + «Installa» immediato.

## Esito (21/10)

- Auto-save **debounced** (500 ms) in `page.tsx`, con `flushConfigure()` esposto via `onFlushConfig`.
- Slider: `draftSliders` locale su `onValueChange`, scrittura su `onValueCommit` (una tirata = 1 POST).
- `SettingsPage.handleSave` non chiama più `configure`: svuota la coda, calcola `stremio://` dal
  risultato del flush e installa. Etichetta: **«Installa in Stremio»**.
- `grep -n "api.configure" components/pages/SettingsPage.tsx` → vuoto.
- Il conteggio dei POST nel pannello di rete resta da fare: richiede backend vivo (punto B1.9 di
  `frontend-responsive`).

## Misura (21/10)

Mock di tutte le API + input vero via CDP (`Input.dispatchMouseEvent`), counter sul path esatto
`/api/configurazione` (attenzione: `/api/configurazione/anteprima` è un'altra rotta e gonfia il conteggio):

| azione | POST `/api/configurazione` |
|---|---|
| caricamento pagina | 1 |
| aprire la tab DNA & AI Lab | +0 |
| tirata di slider (12 mosse, 4 → 5) | **+1** |
| tre «Ripristina Default» in ~360 ms | **+1** (coalesciute) |
| riordino in libreria | +0 (una PUT su `/libreria/ordine`) |

Totale della sessione: 4 POST per cinque interazioni distinte. La manopola segue il dito durante il
gesto (etichetta e `aria-valuenow` passano da 4 a 5 senza tornare indietro).
