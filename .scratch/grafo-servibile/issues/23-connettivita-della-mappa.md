# 23 — La connettività della mappa: i ponti fra i grappoli

**Status**: `ready-for-agent` · **Type**: `task` · **Blocked by**: 09, 11 · **Aperto**: 13/10/2026

## Da dove nasce

Il ticket 11 doveva costruire una gerarchia a tre livelli con **25-35 macro-mondi** sopra le 5.297 bolle.
Non è riuscito, e non per la risoluzione di Leiden: **il grafo delle bolle sparsificato dal ticket 09 ha
117 componenti connesse**, quindi qualunque partizione ne ha almeno 117. L1 è uscito a 133 gruppi con
una mediana di **1 bolla**.

**La causa è nel ticket 09**, che ha fatto il suo lavoro: il k-NN **mutuo** con k=8 tiene solo gli archi
in cui *entrambi* gli estremi si scelgono, e su 5.297 bolle questo taglia **proprio i ponti fra i
grappoli**. Il numero lo dice:

```
5.297 nodi con grado massimo 8  ->  al più 21.188 archi in un grafo connesso
ne abbiamo 19.264               ->  il 91% del massimo possibile
```

Il 91% del massimo non basta, perché la struttura reale è a grappoli: basta un legame mancato per fare
un'isola.

E il ticket 20 ha aggiunto la terza conferma: la curatela collega bolle che sono **lo stesso mondo
diviso in due** (MCU ↔ MCU, anime ↔ anime). Tre misure indipendenti dicono la stessa cosa: **la
struttura è troppo frammentata.**

## Cosa deve consegnare

**Una sparsificazione che non frammenti.** Il ticket 12 (gli 8 vicini tipizzati per bolla) e il 13
(la direzionalità pedagogica) costruiscono la mappa: farlo su una base a 117 pezzi è costruire su un
difetto noto.

## Le tre strade, in ordine di semplicità — da provare e misurare, non da scegliere a priori

1. **Albero di copertura sui ponti.** Dopo il filtro mutuo, aggiungere gli archi più forti necessari a
   riconnettere le componenti. Costo: un centinaio di archi su 19.264 (**+0,5%**). Beneficio: una mappa
   connessa. È la strada che promette di più a costo minore, e va provata per prima.
2. **k più alto.** A k=10 la mediana era 7 vicini e le isolate 108 — meglio del k=8 (mediana 5, 121
   isolate) ma **108 componenti restano**. Non risolve, mitiga.
3. **Il k-NN non mutuo** («B fra i primi k di A»): tiene la selettività del lato forte e non richiede
   reciprocità, ma è **asimmetrico**, e una mappa asimmetrica non si naviga senza deciderne la
   direzione (che è il territorio del ticket 13).

## Criteri di accettazione

- [ ] **il numero di componenti connesse scende da 117 a 1** (o a un valore piccolo e dichiarato)
- [ ] **la mediana dei vicini resta sotto 10** — riconnettere non deve voler dire tornare al grafo denso
- [ ] **le adjacency vere sono ancora conservate**: Fassbinder → *Il tamburo di latta*, Star Wars TV → i film di Star Wars (le stesse del ticket 09, rilette)
- [ ] **nessuna bolla con più di 15 titoli resta isolata**
- [ ] il costo in archi di ogni strada è dichiarato (quanti archi aggiunge, e perché quelli)
- [ ] **la scelta fra le tre strade è giustificata leggendo**, non da una metrica: le misure precedenti (modularità, λ₂, purezza, conteggio) hanno premiato quattro volte ciò che l'occhio condanna
- [ ] il grafo risultante è salvato e **il ticket 11 è riprovato sopra**: L1 deve poter avere 25-35 macro-mondi, e quei macro-mondi vanno **nominati e letti**

## Cautele dichiarate

- **Riconnettere riporta rumore.** Un albero di copertura sceglie i ponti più forti, ma i ponti più
  forti fra due grappoli possono essere il legame generico che il filtro mutuo aveva tolto apposta.
  Va misurato quanti dei 100 archi di ricucitura sono «veri» leggendone un campione.
- **Il conflitto col ticket 05 va tenuto presente**: là si è visto che le bolle giudicate cattive sono
  **piccole**, non grandi. Quindi c'è tensione fra «dividere per rendere più specifico» e
  «riconnettare per rendere navigabile»: probabilmente **servono entrambe**, e su popolazioni diverse.
