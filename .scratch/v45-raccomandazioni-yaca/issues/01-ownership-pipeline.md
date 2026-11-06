Status: resolved
Type: grilling

# Ownership della pipeline V45 e dei moduli graph

## Question

Dove deve vivere l'unica implementazione di produzione per costruire e servire V45, e cosa resta di `services/graph_dense`? La proposta iniziale è: `services/graph` diventa il package di prodotto con una CLI offline di build e un runtime sparse; `services/graph_dense` resta archivio/laboratorio, e i soli builder usati da V45 vengono trasferiti fuori da `.scratch`. Scegliere o correggere questa separazione senza portare i trainer storici nel servizio.

## Resolution

La casa canonica è **`services/graph`**: sottopacchetti distinti per build offline e runtime sparse, con il servizio HTTP come adapter. Si trasferisce qui il codice graph attivo, compresi i builder V45; gli esperimenti e i trainer storici restano in `.scratch` e non diventano dipendenze del prodotto. `graph_dense` cessa di essere un package di produzione. Il build legge cache e artefatti congelati; il container di serving non scarica dati, non addestra modelli e non compila il grafo.

Il runtime bubble V10 non resta una modalità permanente: viene rimosso al cutover V45; il rollback consiste nel ripristinare la release precedente.
