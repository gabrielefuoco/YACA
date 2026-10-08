# 15 — La decisione: integrare in `src/` o no

**Status**: `ready-for-human` · **Type**: `task` · **Aperto**: 08/10/2026 · **Blocked by**: 10, 11, 14

## Cosa si decide

Se il secondo segnale (grafo denso + cluster) diventa parte della produzione, con quale forma:

1. **Imbuto completo** — i cluster generano i candidati al posto di `fetchSmartAndPool`. Serve che l'imbuto
   vinca a parità di budget *e* che la statistica regga ([ticket 11](11-statistica-forte.md)).
2. **Blend** — il grafo si aggiunge al pool attuale solo nelle fasce dove vince
   ([ticket 10](10-banco-appaiato-popolarita.md)). Costo minore, rischio minore, guadagno minore.
3. **Nessuna integrazione** — il filone resta un esperimento documentato. Esito legittimo, e va detto con
   franchezza se i numeri non reggono.

## Vincoli

- Il grafo delle keyword **resta la base**: si aggiunge, non si sostituisce senza confronto.
- Nessuna modifica a `src/` prima di questa decisione (output in `.cache/`, gitignorato).
- Se si integra: il server **non compila mai** (GHCR + `docker compose pull`), e serve un dump con i metadati
  necessari al grafo (persone, franchise, lingua) — oggi il dump di produzione non li ha tutti.
