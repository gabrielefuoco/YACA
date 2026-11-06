Status: ready-for-human
Type: prototype
Blocked by: 08

# Prova del runtime sparse e criteri di cutover

## Question

Un runtime V45 può servire le richieste di YACA con latenza e memoria accettabili? Fare una prova end-to-end con un profilo, includendo caricamento sparse, seed pesati, diffusione, filtri retrieval e output degli scaffali. Misurare il picco sotto il limite Docker attuale di 512 MiB e definire soglie misurabili per autorizzare il cutover. La policy V10-off al cutover e rollback tramite release precedente è decisa in [Ownership della pipeline V45 e dei moduli graph](01-ownership-pipeline.md).
