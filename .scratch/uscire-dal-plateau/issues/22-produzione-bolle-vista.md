Status: ready-for-agent
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
