# 73 — L'ablation dei componenti nuovi: sono complementari, non ridondanti

**Il mandato**: so che l'insieme migliora (report 72), non so quanto pesa ciascuno. Togliere un componente per volta e **leggere le bolle**.

**L'esito, e non me l'aspettavo**: **togliere un componente qualsiasi non fa crollare niente.** La qualità resta alta, ma **cambia di tipo**:

- **senza `KW`** → bolle **nazionali e d'autore**: cinema danese, taiwanese, polacco, norvegese, Hollywood anni 30
- **senza `COLL`** → bolle **di franchise e formato**: tutto Hellraiser, TV competitiva, adattamenti da videogioco
- **con tutto** → bolle **tematiche**: i Dardenne, Adam Curtis, Uwe Boll, cinema turco, teen series

**I componenti sono complementari, non ridondanti: ognuno aggiunge un asse diverso.** E questo è un risultato migliore di "uno vince": significa che la ricetta è **robusta** e che il sottoinsieme si sceglie in base a **che tipo di bolla si vuole**.

Script: `bolle-3.py` (595 s).

---

## 1. Cosa ho letto

| variante | bolle | mod. | cosa ho visto |
|---|---|---|---|
| **T) TUTTO** | 5.297 | 0,057 | i Dardenne · Adam Curtis · Uwe Boll · cinema turco · teen series · Disney classico |
| **senza `KW`** | 4.850 | 0,070 | **cinema danese** (Riders of Justice · Mænd & høns · Gamle mænd i nye biler) · **taiwanese** (The Tag-Along · 血觀音 · 想見你) · **polacco** (Corpus Christi · Miasto 44 · Powstanie warszawskie) · **norvegese** (Elling · Kompani Orheim) · **Hollywood anni 30** (Addio alle armi · Settimo cielo · Street Angel) · **Total Drama** (tutte le stagioni + 6teen) · **B-movie di mostri anni 50** (L'impero delle termiti giganti · Village of the Giants · The Cyclops) |
| **senza `COLL`** | 5.451 | 0,058 | **tutto Hellraiser** (10 film + Cabal + Il signore delle illusioni) · **TV competitiva** (Battlebots · Robot Wars · The Titan Games · Holey Moley) · **adattamenti da videogioco** (Pokémon · Final Fantasy XV · Granblue Fantasy · Tales of Zestiria) · commedia britannica (Johnny English · St. Trinian's) |

**Tutte e tre le varianti sono buone.** Cambia il *tipo* di bolla, non la qualità.

## 2. Cosa vuol dire

**1. I componenti non si sovrappongono.** Se fossero ridondanti, togliere `KW` avrebbe distrutto le bolle tematiche. Invece ha rivelato bolle **nazionali** — perché `CAST` (gli attori) e `DIR` (i registi) portano la nazionalità, e `KW` porta il tema. Sono **assi ortogonali**.

**2. La ricetta è robusta.** Non c'è un componente critico che regge tutto: c'è un **insieme** che produce bolle ricche, e sottoinsiemi che ne producono di più specializzate. È una proprietà desiderabile: nessun punto singolo di rottura.

**3. E la terza conferma che la modularità non è qualità**: togliendo un componente la modularità **sale** (0,057 → 0,058-0,076) e la qualità **non cambia**. Il grafo con meno componenti è "più modulare" e non è migliore.

## 3. Il limite, di nuovo

**Ho letto ~16 bolle per variante su ~5.000.** Il verdetto è mio e il criterio è quello del report 71 (*il filo comune si deve poter nominare*), ma il campione è piccolo. Quello che è solido:
- le bolle che ho citato **esistono e sono come le descrivo**;
- **nessuna variante è crollata** — e questo è visibile senza statistica, perché se un componente fosse critico la sua rimozione avrebbe prodotto minestrone ovunque, non bolle di tipo diverso.

## 4. Cosa ne ricavo per il prodotto

1. **La struttura a bolle è pronta.** Con tutti i componenti si ottengono ~5.300 bolle, di cui ~1.100-1.300 fra 15 e 45 titoli. È la granularità giusta per navigare.
2. **La scelta dei componenti è una scelta di prodotto**, non tecnica: vuoi bolle **tematiche** (con `KW`) o **nazionali/d'autore** (senza)? Si possono avere entrambe — basta costruire **due mappe** e lasciare che l'utente (o il contesto) scelga.
3. **Il prossimo passo è la navigazione**, che non è mai stata costruita: **bolle vicine nel grafo**, e dentro la bolla la scelta **popolare / nicchia**. È lì che vive la temperatura che regola il "sorprendente".
4. **E `KW`/`TV` andrebbero provati anche nel recupero**: sono entrati solo nel grafo delle bolle, e il report 68 dice che sul lato serie c'è bisogno di tutto.
