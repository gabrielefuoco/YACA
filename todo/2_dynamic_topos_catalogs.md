# Cataloghi Dinamici basati sui Topoi (L2/L3)

## L'Idea
Generare cataloghi ad-hoc su Stremio/Web che riflettano i Topoi Narrativi (L2) o Macro-Vibe (L3) attualmente più "caldi" nel DNA dell'utente.

## Funzionamento Teorico
Se l'utente sta attraversando una fase in cui mette spesso "Like" o guarda contenuti legati alle **Arti Marziali** (che corrisponde a uno specifico nodo L2 nel nostro `HierarchicalGraph`), il suo VSM (Vector Space Model) avrà un picco su quel nodo L2.

Al momento della generazione della home (in `CatalogRouter.js`), possiamo leggere il `TasteProfile` dell'utente e individuare i 1 o 2 nodi L2 con il punteggio più alto.
Per ognuno di questi nodi, possiamo istanziare dinamicamente un catalogo dal titolo personalizzato, ad esempio:
- *"Perché stai amando le Arti Marziali"*
- *"Perché hai guardato molti Sci-Fi Spaziali"*

## Implementazione (Bozza)
1. In `catalogStrategies.js`, aggiungere un nuovo builder `buildToposDynamicCatalog(userId, toposId)`.
2. Il builder prende il `toposId` (es. `t_44`), espande i suoi nodi L1 e le sue keyword.
3. Esegue un `fetchSmartAndPool` ristretto **esclusivamente** a queste keyword.
4. Valuta l'affinità e restituisce i migliori 50 film.
5. In `CatalogRouter.js`, estrarre dinamicamente i Top L2 dal `TasteProfile` e iniettare i cataloghi dinamicamente nel manifesto di Stremio (questo richiede che Stremio supporti cataloghi dinamici, oppure potremmo pre-registrare slot generici come "YACA: Il tuo Topos Attuale").
