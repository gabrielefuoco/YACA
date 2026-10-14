# Ticket 10 — Consolidamento

`Status: resolved` · 14/10/2026 · chiude l'effort `coerenza` (9 ticket su 10; il 04 rinviato)

## Il numero che va corretto in tutto quello che ho scritto prima

**La collocazione a freddo delle serie non è 35,3%. È 63,0%.**

Il 35,3% che ho ripetuto per ore era misurato con la pesatura **V3**. Rifatta la misura con **V1**
(pesi grezzi), sulle stesse 336 bolle candidate e con lo stesso leave-one-out esatto, il conto è:

| variante | propria bolla | + promosse | «non è colpa del collocatore» |
|---|---|---|---|
| **V1** | **378/600 (63,0%)** | 146 | **87,3%** |
| V3 | 212/600 (35,3%) | 204 | 69,3% |

E la metrica delle promozioni usa **generi e keyword** — cioè proprio i token che V3 pesa ×1,5 —
quindi è **a favore di V3**, e V1 vince lo stesso di 18 punti.

**Per i film** il numero resta quello di `inserimento`: **27,7%**, 0,0% in bolle scollegate.

---

## Le decisioni

| cosa | scelta | perché |
|---|---|---|
| **partizione** | **V8** (1.625 bolle, mediana 33, purezza 0,946) | ricetta di V7 con le tre correzioni; V9 non è giustificata (sotto) |
| **collocatore, macro** | **V1** — la bolla, per navigare il grafo | 63,0% contro 35,3% |
| **collocatore, micro** | **V3** — i 10 titoli da mostrare | V3 legge thriller dove V1 legge *Cinquanta sfumature* |
| **regola di medium** | simmetrica, col margine 1,0 | +1% misurato, e i due cataloghi separati in entrambe le direzioni |
| **mappa per navigare** | top-k pesato + unione (ticket 02 di `mappa-pesata`) | una sola componente, ginocchio 1,24 |
| **mappa per mostrare** | peso normalizzato × coerenza (ticket 07) | i falsi giganti cadono; ginocchio 1,16 |
| **contratti** | i tre relazionali + i tre di non-degenerazione | 4 casi su 4 fermati, zero falsi allarmi |
| **job** | offline, notturno, **ripartibile** | e scrive a pezzi: un job che scrive solo alla fine può perdere mezz'ora |

**Due livelli, due pesature.** Non è un compromesso: sono due domande con due risposte misurate. Il
`colloca_finale.py` le applica entrambe, e verifica l'impronta **giusta per variante** (V1 e V3 hanno
vocabolari diversi, e confrontare l'uno con l'impronta dell'altro fa scattare il contratto a vuoto —
successo, e il contratto aveva ragione lui).

---

## Le cinque correzioni del senior, misurate

| proposta | esito |
|---|---|
| **il sub-clustering delle bolle grandi** | **confermata**, con tre correzioni: la soglia di 60 titoli esclude proprio le due bolle che voleva dividere (la 820 ne ha 46, la 594 ne ha 51); la risoluzione RB non si trasferisce ai sottografi (RB 100 li frantuma in 31.908 singoli); il tetto va stretto. Divide il true crime in otto mondi leggibili e separa i western dagli horror |
| **il top-M sui centroidi (§5.1.1)** | **falsa**: peggiora, 32,0% → 28,5% a M=15. E non c'è nessuna distorsione geometrica: la correlazione fra dimensione della bolla e successo, con V3, è **+0,003** |
| **lo scoring ibrido coi top-5 esemplari (§5.1.2)** | **giusta a metà**: +1,2 punti in tutto, ma **+7,7 sulle bolle sopra i 120 titoli** e −2,2 fra 30 e 60 |
| **il coseno fra centroidi nella mappa (§5.4)** | **falsa**: positivo nel **99,7%** delle coppie (mediana 0,086), e sulla bolla del seinen anime mette *Miss Bala* **al primo posto**. La coerenza va misurata **fra esemplari**, e allora *Miss Bala* va a 0,130 contro 0,50-0,61 dei vicini veri. La divisione per taglia invece **funziona** |
| **V3 dentro la costruzione delle bolle (§5.5)** | **non fatta, e non conviene farla**: il ticket 05 ha appena misurato che V3 **dimezza** la precisione della collocazione. Portare i suoi pesi dentro `matrice_idf` costruirebbe una partizione con un metro che ha appena perso 18 punti. Il §5.5 va ritirato, non eseguito |

**Una su cinque confermata come proposta, una a metà, due misurate false, una ritirata dalla
misura.** È il tipo di consuntivo che vale più dei cinque interventi: le correzioni del senior erano
tutte dirette a un problema **vero** (la bolla 820, i falsi vicini, le bolle-continente), e quattro
volte su cinque il rimedio proposto non era quello giusto. La diagnosi era migliore della terapia.

---

## Cosa resta aperto, e cosa è rinviato

**Rinviato a domani, con la GPU** (decisione dell'utente): la coerenza sulla **trama** (ticket 04). Il
disegno è pronto e la domanda è chiara — la trama è l'unica feature che il collocatore **non usa**, e
quindi l'unico arbitro non circolare. I due ostacoli sono misurati: l'`overview` manca per il **58,8%**
dei film e il **51,5%** delle serie, e le trame presenti sono **in italiano** mentre il modello in casa
(`bge-small-en-v1.5`) è **inglese** — e su un testo italiano **non separa**: *Gone Girl* sta a **+0,542**
da *Toy Story* e a **+0,487** da *Fight Club*. Domani: embeddare tutto con la GPU, e **vedere se serve**
— perché il ticket 05 ha già risposto alla stessa domanda **gratis**, coi generi e le keyword.

**Aperto:**
1. **I 94 cross-medium**: il vincolo di medium **non costa niente** (35,3% con e senza), quindi non è
   un problema di vincolo — sono serie in minestroni generici di film, e il tetto del metodo è 84,3%.
2. **La mappa a due livelli**: quella coerente mostra meglio, quella pesata naviga meglio. Nel
   prodotto servono entrambe, ed è una decisione di prodotto, non tecnica.
3. **`src/`**: la proposta è scritta (7 MB di centroidi, 2 di vocabolario, 130 KB di partizione, ~80
   righe), e la scelta presa è **job notturno offline**.

---

## La lezione, che è il vero risultato di questo giro

**Quattro leak in una sessione**: 63,7% invece di 35,3%, 58,27% invece di 0,33%, 55,8% invece di
33,2%, e **69,2% invece di 63,0%** — quest'ultimo commesso **dopo** aver scritto il contratto che lo
ferma, e senza chiamarlo. Tre volte la disciplina di «rifare la misura per un'altra via» ha
funzionato; la quarta volta non è bastata, perché la disciplina non è un controllo.

E **due volte il giudizio dell'utente ha corretto una conclusione presa dalle metriche** — *Verity* e
la bolla 820 — e in tutte e due i casi **i dati per non sbagliare erano su disco**: i termini del
centroide (letti per dieci bolle su 1.625, mai per la 820), la mediana dei voti (calcolata per nessuna
bolla), e l'indice di chimera che mi diceva «coerente» mentre io continuavo a chiamarla minestrone.

**Prima di chiamare sbagliato un mondo, guardarne il profilo.** Un minuto di lavoro, saltato due volte
su due.
