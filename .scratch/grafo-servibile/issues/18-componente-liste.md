# 18 — Il componente LIST dalle liste curate

**Status**: `resolved` · **Type**: `task` · **Blocked by**: 01, 03 · **Chiuso**: 13/10/2026

**Esito**: [report](../ricerche/18-liste.md) · ✅ **le liste portano segnale comportamentale vero**: le coppie che stanno in una lista si somigliano **6,9×** più del caso (+0,160 contro +0,023). ✅ A peso **0,5** migliorano il recupero di **+0,52 al @100** — il guadagno più grande della sessione. ⚠️ **Ma peggiorano mezzo+coda (−1,34 al @500)**: le liste curate sono fatte di titoli noti, quindi spingono sulla testa del catalogo — e la metrica che conta per il prodotto è la coda. ⚠️ E il «megadump da 1.500 titoli» che il peso per lunghezza doveva abbattere **non esiste**: le liste sono cappate a 100 item, il rapporto è **4,20×**.

## What to build

Le **540 liste curate da umani** raccolte da Trakt non sono mai state usate. Diventano un componente di
co-occorrenza, normalizzato per la lunghezza della lista.

Due titoli che compaiono nella stessa lista ricevono un incremento pesato per la lunghezza:

```
delta(i,j) = 1 / log2(1 + |L|)
```

Così una lista di quindici titoli — una scelta precisa di qualcuno — pesa molto, mentre un megadump da
millecinquecento titoli pesa quasi nulla. Il componente si normalizza col grado binario come tutti gli
altri.

È il **ponte naturale fra comportamento e curatela**: una lista è comportamento (qualcuno ha guardato
quelle cose) ed è giudizio (qualcuno le ha scelte insieme).

## Acceptance criteria

- [ ] il componente è costruito, con copertura e numero di archi dichiarati
- [ ] il rumore delle liste lunghe è **verificabilmente** abbattuto: una lista da 15 e una da 1.500 titoli danno pesi per coppia che differiscono del rapporto dichiarato
- [ ] migliora **l'asse comportamentale delle bolle**, misurato con il giudice automatico (06)
- [ ] migliora o non degrada il recupero su **entrambi** i banchi
- [ ] la sovrapposizione fra le liste e gli utenti del banco è verificata e dichiarata (se gli autori delle liste sono gli stessi utenti del banco, va detto)
- [ ] il componente è pesato come gli altri: non entra a peso pieno senza essere passato dall'ablation

## Da dove nasce

Falso negativo 6 dell'handoff. Le liste sono la forma più grande di curatela disponibile — molto più dei
3.417 legami scritti a mano — e non erano mai state toccate.
