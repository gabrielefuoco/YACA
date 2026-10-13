# 06 — Il giudice automatico delle bolle

**Status**: `resolved` · **Type**: `prototype` · **Blocked by**: nessuno · **Chiuso**: 13/10/2026

**Esito**: [report](../ricerche/06-giudice.md) · lo strumento **funziona** (52,8% contro il 20% del caso, ~388 token e 1,7 s per bolla) e ordina le due partizioni nella direzione giusta (**E 52,8% > A 47,0%**). ⚠️ Ma (a) **la validazione contro la lettura umana è fallita**: 3 delle 5 minestrone stanno fra le bolle *più facili* — lo strumento misura la **separabilità**, non la **nominabilità**; (b) con 200 bolle **non distingue** due partizioni che distano 6 punti (p ≈ 0,25: servono ~1.090 bolle per lato); (c) il campo regia vale **13 punti** del test.

## What to build

La lettura umana non scala e non confronta. Si automatizza la parte che si può: un **intruder test**.

Si campionano almeno 200 bolle di taglia ≥6. Per ciascuna si prendono 4 membri e si inietta 1 **intruso**
pescato da una bolla a distanza ≥2 ma nella **stessa fascia di popolarità**. Un giudice cieco (un modello
linguistico, con la chiave già disponibile) vede solo titolo, anno, regia, generi e trama dei 5 titoli —
mai l'identità della bolla, mai gli altri membri — e deve indicare l'intruso.

Il risultato è **un numero per partizione**, confrontabile fra due configurazioni.

## Acceptance criteria

- [ ] il test gira su almeno 200 bolle e produce un numero singolo per partizione
- [ ] **validato contro le 100 bolle già lette**: deve separare quelle giudicate buone da quelle giudicate sciolte — se non lo fa, è **lo strumento** a essere sbagliato, non le bolle, e va scritto così
- [ ] il giudice non vede mai l'identità della bolla né i suoi altri membri
- [ ] costo e tempo dichiarati (token e secondi per 200 bolle)
- [ ] discrimina due partizioni **note per essere diverse** (per esempio con e senza i componenti nuovi) — se dà lo stesso numero, non serve a niente

## Cautela dichiarata

Questo strumento **traccia** e **ordina**, non sostituisce la lettura. La lettura umana resta il giudice
finale delle bolle: la prima cosa che il giudice automatico deve fare è essere validato contro di essa.
