# 07 — I componenti: pesi di specificità, maschere di formato, firma produttiva

**Status**: `resolved` · **Type**: `task` · **Blocked by**: 06 · **Chiuso**: 13/10/2026

**Esito**: [report](../ricerche/07-componenti.md) · i quattro interventi **non sono dimostrati un miglioramento**. Il conteggio delle bolle utilizzabili sale da 1.293 a **1.550 (+19,9%)** — ma il giudice automatico dice **F 51,0% contro A 53,3%**, cioè niente (p ≈ 0,65, e con 200 bolle non si risolvono differenze sotto i 5 punti). Due indicatori, due storie opposte, e il ticket 05 ha già mostrato che il conteggio è un proxy che sbaglia: **serve la lettura**, che il ticket 08 deve fare. Tre negativi dichiarati: il controllo di ubiquità del cast **fallisce** (i 16 più prolifici pesano 1,2× meno del tipico), il KW2 tiene **esattamente il 50%** (tautologia: la soglia è la mediana) e pota anche **wuxia**, e l'ablation non è stata rifatta (E aggiunge PROD senza togliere niente).

## What to build

Quattro interventi sui componenti strutturali, che oggi pesano tutti uguale e per questo fanno da
super-colla fra mondi incompatibili.

1. **Cast pesato per posizione e concentrazione.** La presenza di un attore pesa per la **posizione nei
   titoli di testa** (i primi ruoli contano, il nono nome quasi zero) e per la **concentrazione tematica**
   (l'inverso dell'entropia dei generi e dei paesi della carriera). Un caratterista ubiquo smette di
   collegare horror, cinecomic, cinema d'autore e animazione.
2. **Potatura delle keyword per coerenza comportamentale.** Una keyword sopravvive solo se le coppie di
   titoli che la condividono hanno similarità comportamentale **sopra la media**. Cadono le keyword
   strutturali ma non estetiche: tratto da un libro, sequel, scena dopo i titoli di coda, *flashback*.
3. **Maschere di formato.** Un titolo sotto i 45 minuti ha archi ridotti verso i lungometraggi; un
   documentario ha archi ridotti verso la fiction, salvo comportamento forte.
4. **La firma produttiva (componente nuovo).** Non «entrambi USA», non «entrambi anni '90»: la
   **combinazione**. Studio o rete di nicchia (A24, Ghibli, Shaw Brothers, Toho, Cannon, Hammer, HBO anni
   2000), oppure paese non statunitense + decennio + genere.

## Acceptance criteria

- [ ] **ciascuno dei quattro** è misurato separatamente **prima** di essere combinato con gli altri
- [ ] il giudice automatico (06) migliora rispetto ai componenti attuali
- [ ] controllo di ubiquità: i maggiori ponti di cast per grado **escono** dalla testa della classifica
- [ ] le keyword potate sono elencate e **lette**: devono essere riconoscibili come non estetiche
- [ ] copertura del componente nuovo dichiarata, e i numeri di **recupero invariati** (è un componente per le bolle)
- [ ] l'ablation è rifatta: nessun componente peggiora in silenzio il contributo di un altro

## Da dove nasce

Il ~12% di bolle senza filo nominabile cade quasi sempre in uno di questi quattro casi: bolla-chimera
per un attore o una keyword condivisa, bolla-pattumiera di nodi a basso grado, cortocircuito di formato,
o anacronismo (un film muto del 1925 in una bolla di thriller anni '90 per tre keyword).
