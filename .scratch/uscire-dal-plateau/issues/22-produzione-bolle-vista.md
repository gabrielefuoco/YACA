Status: resolved
Type: task

# Produzione: le bolle come vista dinamica sui 76.497 nodi

## Perché

Niente di questo lavoro è in produzione: il motore serve il canone vecchio (66.259, partizione a 3.497
bolle) e V19-V22 non sono servibili. Rifare Leiden azzera gli ID delle bolle e invalida centroidi,
mappa e fixture; togliere le bolle richiede di riscrivere metà di `motore.py`.

## La terza via (senior, round 2)

L'espansione del canone è **append-only**: i primi 66.259 indici sono identici. Quindi:

1. tenere intatti gli ID delle 3.497 bolle per i primi 66.259 nodi;
2. assegnare i 10.238 nuovi con il **voto di maggioranza pesato dei loro vicini** nel grafo nuovo
   (`mem_ext[i] = argmax di bincount(mem_old[vicini], weights=pesi)`);
3. per i pochi isolati, usare `collocator.colloca`, già pronto.

Costo atteso: minuti di CPU, zero rebuild, ID stabili, centroidi e mappa ancora validi.

## Criteri di accettazione

- La partizione estesa copre 76.497 righe senza buchi;
- gli ID 0..3.496 sono invariati al 100%;
- il motore carica e serve i 5.264 titoli 2024-2026;
- le righe servite su 20 semi noti sono identiche a prima (regressione).

---

## Esito: funzione pronta e testata, innesto sicuro; smoke test impossibile in questo checkout

`services/graph/estensione_bolle.py`: `estendi(mem_old, S)` assegna i titoli nuovi con il **voto pesato
dei vicini già collocati**, manda gli isolati in una **bolla di riserva dichiarata** (la più numerosa, e
il fatto viene contato), e verifica che gli ID siano preservati. 4 test.

Provato sul canone reale: partizione 66.259 → **76.497**, **10.237 nuovi assegnati per voto, 1 in
riserva, 3.497 bolle, ID preservati: True**.

Innesto: `parametri.TRIANGOLO` / `parametri.PARTIZIONE` (prima erano un default scritto nella firma di
`transizione_pronta`, e cambiare artefatto voleva dire modificare il codice), e `Motore.__init__` che
**estende da solo** se la partizione è più corta del grafo. Oggi è un no-op — il motore serve ancora
V10 a 66.259.

**Cosa manca**: lo smoke test. In questo checkout `services/graph/data/` non contiene gli artefatti di
prodotto (`nuovo-LIST.npz`, e i sei che `Motore` carica dopo la partizione): vivono sul server. Il
cambio va fatto lì, con la regressione su 20 semi noti.
