# 05 — Le tre diagnostiche sulle bolle di oggi

**Status**: `ready-for-agent` · **Type**: `research` · **Blocked by**: nessuno

## What to build

Tre misure economiche sulle partizioni **già salvate**, prima di rigenerare qualunque cosa. Sono
diagnostiche, non il build.

1. **Test dei testimoni disgiunti**: quanti dei ~1.103 vicini mediani di una bolla sopravvivono se si
   chiede che l'arco sia supportato da almeno **3 coppie disgiunte** di titoli, pesate per la purezza
   interna dei due estremi.
2. **Caccia alle chimere**: le 50 bolle con taglia >35 con il rapporto più basso fra il secondo
   autovalore del Laplaciano normalizzato e il grado medio interno.
3. **Estrazione dei ponti *vibe***: per le 100 bolle già lette a mano, le 2 bolle vicine che massimizzano
   il contrasto fra l'asse comportamentale e quello strutturale.

## Acceptance criteria

- [ ] la mediana dei vicini **prima e dopo** il test dei testimoni, come numero
- [ ] le 50 candidate chimere elencate, e il **controcroce**: quante di esse stanno fra le ~12 bolle che la lettura umana ha giudicato sciolte o minestrone
- [ ] per le 100 bolle lette, le 2 bolle *vibe* ciascuna, con un giudizio in una riga sulla plausibilità
- [ ] il tasso di plausibilità dei ponti *vibe*: se è basso, la tassonomia del ticket 10 va ripensata **prima** di costruirla
- [ ] ogni numero porta l'etichetta «diagnostica, non build»

## Da dove nasce

Le tre diagnostiche suggerite dall'esperto, che valgono un giorno di lavoro e informano tre ticket
(09, 10, 08). Farle **prima** evita di costruire su un'ipotesi non verificata.
