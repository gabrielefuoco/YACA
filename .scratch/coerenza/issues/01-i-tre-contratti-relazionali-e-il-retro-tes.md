Status: resolved
Type: task

# 01 — I tre contratti relazionali, e il retro-test sui due incidenti

I tre contratti di §4, e la prova che avrebbero fermato i due numeri gonfiati di questo giro:

1. **`assert_loo_esatto`** — il contratto contro il data leakage nel leave-one-out vettorizzato.
   Prende 5 item a caso, cancella davvero la loro riga, ricalcola il centroide senza di loro e
   verifica che il punteggio veloce coincida. **Il 63,7% sarebbe esploso** alla prima riga.
2. **`assert_universo`** — la copertura (quale frazione di `vero` sta fra i candidati, col tetto
   massimo stampato accanto al risultato) e il tasso base calcolato con **la stessa funzione di
   perdita**, vietando default impliciti. Il `caso 58,27%` e l'equivoco delle 94 nascono qui.
3. **`assert_allineamento_spazi`** — l'hash di `idf` e vocabolario dentro ogni `.npz`, verificato al
   caricamento, più un controllo semantico di boot: dieci bolle pure, il loro titolo archetipico
   passato a `colloca()`, e la bolla #1 deve essere la sua.

Il terzo ha un precedente concreto: l'autore di questo effort ci è **caduto dentro** scrivendo
`carica()` (idf grezzi contro corpus pesato per tipo), e se n'è accorto guardando, non per un crash.

Retro-test: rieseguire i due incidenti coi contratti attivi e mostrare quale assert li ferma.
Esito: i contratti in `canone.py`, `03-contratti.py` + `ricerche/01-contratti-relazionali.md`.

## Esito

I TRE CONTRATTI RELAZIONALI, e funzionano: 4 casi su 4 fermati, zero falsi allarmi. `assert_loo_esatto` (il brute-force spot check di §4.1) ferma sia il centroide che include l'item sia l'auto-similarita' nei top-5 — cioe' esattamente i due numeri gonfiati di questa sessione (63,7% e 55,8%). `assert_universo` stampa il tetto accanto al risultato: l'88% sintetico esce sempre, e il caso lo calcola la permutazione. `assert_allineamento_spazi` ferma l'idf rigenerato e il vocabolario cambiato a mano — il bug in cui l'autore di questi contratti era caduto scrivendo `carica()`. Le impronte sono in `05-impronte.json` e il collocatore le verifica all'avvio. In `canone.py`.
