# Rimuovere il DNA da ogni cosa

Status: resolved
Type: task
Blocked by: —

## Perché

Il DNA (il vettore generi/keyword/network del motore V10) **non è più usato dalle raccomandazioni**: le righe di Stremio nascono dai semi della storia di visione, e il grafo V45 non riceve né legge DNA. Sopravvive in tre residui:

- il pannello **DNA & AI LAB** nel frontend, che mostra un dato che nessuno mantiene più a livello d'account;
- il **reranker della Deep AI Search** (`src/stremio/providers/AiDiscoveryProvider.js:368`), unico uso ancora vivo;
- due code morte: il peso `dna: 2` in `src/library/seeds.js:13` (nessuno produce quel tipo di seme) e il ramo della **quota anime** in `src/anime/politica.js:82` (la modalità fornisce già la politica, il ramo non è raggiungibile).

L'utente ha deciso: **via tutto**. La Deep AI Search verrà rifatta da zero in una mappa successiva (obiettivo: togliere Mistral), quindi il reranker va rimosso **alla buona**: la ricerca deve continuare a funzionare senza ordinamento per affinità, non deve rompersi.

## Cosa va rimosso

1. **Frontend**: `DnaAndAiPanel`, `DnaBarChart`, `lib/dnaChart.ts`, i tipi `DNAItem`/`CompiledVector`/`AnalyticsData` nella misura in cui servono solo al DNA, il loro uso in `DashboardPage`/`page.tsx`/`SettingsPage`, le chiamate `api.*dna*`, i riferimenti in `PosterCard` e `ui/useProfiles`.
2. **Backend**: l'endpoint `/api/profilo/dna/conferma`, il blocco di estrazione/scrittura DNA in `src/api/configure/profileProcessor.js`, `src/profile/dnaAccount.js`, `src/profile/dnaEngine.js`, i campi `manualDNA`/`suggestedDNA`/`dna` dove sono solo DNA, il peso `dna` nei semi, il ramo quota in `anime/politica.js`, le voci di cache che li nominano.
3. **Ricerca AI (alla buona)**: togliere `dnaFilters`/`ProfileScorer.calculateItemMatch` da `AiDiscoveryProvider`; l'ordinamento dei risultati resta quello che c'è senza affinità. Non riscrivere la ricerca: quella è materia della mappa futura.
4. **`ProfileScorer` e `ProfileBuilder`**: verificare chi li usa DOPO la rimozione. Se restano senza consumatori, si rimuovono; se restano vivi (es. `library/`, `indice/`), si tengono e si toglie solo la parte DNA. Non cancellare a naso: dire chi resta.

## Vincoli

- **Le raccomandazioni non devono cambiare**: golden fixture a `0.000e+00`, manifest e scaffali identici.
- Niente dati rotti: un documento con `manualDNA` salvato non deve far fallire una lettura (il campo si ignora, non si pretende).
- Test: la suite intera verde. I test che verificano solo il DNA si cancellano con una nota nel ticket; quelli che verificano comportamenti vivi si riscrivono senza DNA.
- Nessun commit, nessun deploy.

## Esito

Il DNA non esiste più nel codice; la Deep AI Search risponde ancora; le raccomandazioni sono identiche; la suite è verde; e resta scritto **quali** moduli sono stati salvati perché avevano altri consumatori.


## Esito (sintesi)

Fatto: pannello, grafico, endpoint, calcolo al salvataggio, `dnaAccount`, `dnaEngine`, peso `dna` nei semi e quota anime rimossi. `ProfileBuilder` e `ProfileScorer` restano perché usati da library/indice. Golden 0.000e+00, 198 suite verdi.
