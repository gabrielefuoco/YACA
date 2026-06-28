# 12 - Testing su Nuvio

Verificare che l'architettura di YACA sia solida anche su piattaforme di hosting specifiche o reti edge, in questo caso **Nuvio**.

## 1. Requisiti di Compatibilità
**Azioni Dettagliate:**
- Effettuare il deploy in ambiente Nuvio.
- Testare le limitazioni di I/O, eventuali problemi legati a container effimeri o cold starts.
- Verificare le configurazioni di rete in uscita (Outbound Network): assicurarsi che Nuvio permetta le chiamate continue verso Trakt, TMDB e le API di Stremio senza blocchi firewall o restrizioni eccessive.

## 2. Test delle Performance
**Azioni Dettagliate:**
- Eseguire stress test sulle rotte (manifest, catalog, meta) dall'infrastruttura Nuvio per assicurarsi che i tempi di latenza verso il client finale rimangano entro i parametri accettabili (< 300ms se in cache).
