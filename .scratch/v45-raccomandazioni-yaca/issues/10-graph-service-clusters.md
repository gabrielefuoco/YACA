Status: resolved
Type: grilling

# Il graph service possiede il clustering personale

## Question

Quale modulo è responsabile di formare i cluster d'interesse utente, dato il grafo V45?

## Resolution

Il **graph service** possiede la logica: cluster d'interesse del profilo, diffusione V45 per cluster, risultati e ragioni/evidenze. YACA Node recupera e normalizza gli eventi del profilo, passa i segnali tipizzati e si occupa di presentazione, cataloghi e metadata/UI. Il graph service non conserva account o cronologia utente.

Resta aperta la collocazione della pipeline offline V45 e di `graph_dense`; questa risoluzione riguarda solo il confine di responsabilità del runtime.