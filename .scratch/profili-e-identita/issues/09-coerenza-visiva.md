# Coerenza visiva: ombre, pillole, top bar, logo, Impostazioni

Status: resolved
Type: task
Blocked by: 07

## Question

Sei correzioni che non sono decisioni ma consegne, tutte sullo stesso tema: gli ombreggi e i contenitori raccontano una struttura che non esiste. Non va deciso niente, va fatto — dopo il ticket 07, perché toccano la stessa pagina e rifarle due volte è spreco.

1. **Pillole Dashboard / Esplora / Impostazioni** e **selettore a pillola in Esplora**: l'ombra rigida sotto fa sembrare la pillola contenuta in un blocco. Togliere l'ombra del contenitore, non quella della pillola attiva: la differenza fra attivo e inattivo deve restare leggibile senza disegnare una scatola.
2. **Creatore**: ombre non coerenti col resto. Sia attorno a «NOME CATALOGO» sia attorno al riquadro che contiene «Aggiorna anteprima» e «Crea catalogo» — quest'ultimo ha un'ombra bianca che mostra il contenitore, e va eliminata. Il riquadro deve sparire come oggetto, restare solo i due pulsanti.
3. **Libreria utente**: i pulsanti hanno uno stile troppo diverso dal resto — riportarli ai token esistenti (`glass-card`, `bg-white/40`, `text-marrow-deep`, `border-marrow-light/10`). La gerarchia nella pagina è sbagliata: va corretta secondo l'ordine deciso nel ticket 07.
4. **Impostazioni**: da web non usa lo spazio (troppo stretto), da mobile è perfetto e **non va rotto**. Intervento sulla larghezza massima e sulla disposizione a colonne, non sul layout mobile.
5. **Top bar**: colore più chiaro, per staccarla dal fondo e metterla in risalto.
6. **Logo YACA**: più grande.

Vincoli: nessun colore nuovo, nessun token inventato; il tema sono i token beige/sabbia esistenti. Verifica con typecheck e build; se c'è un test di snapshot visivo, aggiornarlo con la motivazione.

Esito: le sei correzioni applicate, con un prima/dopo per almeno le due più visibili (top bar e Creatore), e la conferma che il layout mobile di Impostazioni è identico a prima.

## Esito

Coerenza visiva: pillole a tre livelli, top bar `bg-[#F5E2C3]/70` senza blur, card selezionata con anello interno invece del foglio bianco.
