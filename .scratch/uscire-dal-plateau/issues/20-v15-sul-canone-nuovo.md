Status: ready-for-agent
Type: task
Blocked by: 16

# Riportare la ricetta V15 sul canone di 76.497

## Perché

V15 vince sul banco tonale (+0,0183 sopra l'MDE) ma gira su **66.259 nodi**: non copre i 5.264 titoli
2024-2026 e non è servibile in produzione. Se il suo vantaggio viene dalla ricetta (studente vecchio,
COVISION 2,2 senza sconto temporale, chiusura a conteggio) e non dal canone, va riprodotta sul canone
nuovo.

## Cosa fare

1. Ricostruire la ricetta V15 sul canone 76.497: COVISION `--semplice` (o sconto temporale spento),
   peso 2,2, chiusura **conteggio**, nessun CREWPROP, nessun gate asimmetrico, studente del ticket 16.
2. Misurare sul dev set e a fine giro sul banco tonale.
3. Confrontare con V21 e V22 **a parità di canone**.

## Criteri di accettazione

- Un artefatto V15-76k con la sua misura;
- verdetto: se il vantaggio sopravvive sul canone nuovo, V15-76k diventa la base di prodotto.
