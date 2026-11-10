Status: resolved
Type: grilling
Blocked by: 07

# Contratto degli scaffali per Stremio e API web

## Question

Come si rappresentano i cluster personali sulle superfici YACA che oggi si aspettano ruoli/canali fissi? Decidere se usare slot Stremio stabili riempiti dinamicamente, scaffali nominati per interesse, o una combinazione; definire i campi minimi per titolo, ragione, ordine, vuoto e paginazione mantenendo una migrazione controllata da `/api/mondi` e dal pool.

## Esito

Scaffali personali serviti con slot stabili e nomi per interesse: i cataloghi `yaca_<tmdbId>_<medium>` sono in produzione, con cache per (profilo, medium, modalità).
