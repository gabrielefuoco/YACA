# La bolla 820 non è un minestrone — ritrattazione di due conclusioni

`14/10/2026` · `820.py` e `820b-vicini.py` · nato da un'obiezione dell'utente

> «Mi sembra molto coerente: è una serie di film d'autore con ampio successo sul pubblico, roba grossa
> a livello mediatico ma non schifezze. Film che piacciono tanto al cinefilo quanto al grande pubblico.»

**Aveva ragione, e i numeri sono più netti della descrizione.** Da qui due conclusioni mie che vanno
ritrattate, e una lezione che vale più delle due.

---

## La bolla, per intero

46 titoli, **Thriller 35 · Drama 35 · Mystery 23 · Crime 16**, anni 1995-2023, mediana 2004.

| | |
|---|---|
| voti mediani della bolla | **7.037** |
| voti mediani del catalogo | 51 |
| rapporto | **138×** |
| registi | **34 diversi su 46** — Fincher **7**, Nolan **4**, Shyamalan **3**, Aronofsky 2, Villeneuve 2, Scorsese, Weir, Gondry, Eastwood, Iñárritu |

E i termini del suo centroide:

```
ge:thriller · ge:mystery · kw:psychological thriller · ge:crime · ge:drama ·
di:david fincher · kw:detective · kw:psychiatrist · kw:serial killer · ge:science fiction ·
kw:suspense mystery · kw:neo-noir · kw:investigation · kw:whodunit · kw:amnesia ·
di:christopher nolan · di:m. night shyamalan
```

**Il termine più forte è `ge:thriller`, e c'è `kw:psychological thriller` in terza posizione.** La
bolla non è un minestrone: è **il canone del thriller psicologico**, con Fincher, Nolan e Shyamalan
come firme.

I tre titoli che mi avevano fatto scrivere «minestrone» — *Inception*, *The Truman Show*, *Eiffel* —
sono tre su quarantasei. Guardavo la superficie invece del baricentro, e **lo strumento per guardare
bene era su disco da ore**: i termini del centroide della bolla.

## I vicini sono altri canoni

| bolla | voti mediani | dentro | i suoi termini |
|---|---|---|---|
| 866 | 10.613 | Le ali della libertà, Forrest Gump, Whiplash, Schindler's List | — |
| 1237 | 10.601 | **Pulp Fiction, Django, Bastardi senza gloria, Léon** | — |
| 1330 | 15.174 | **Interstellar, Mad Max, Arrival, Lei** | — |
| 505 | 1.331 | Il momento di uccidere, L'avvocato del diavolo | `kw:legal thriller`, `kw:psychopath` |
| 487 | 2.411 | Get Out, Midsommar, It | `kw:folk horror`, `kw:lovecraftian` |
| 377 | 1.492 | The Judge, Eagle Eye | `kw:suspenseful` |

**Sono mondi, e sono mondi dello stesso tipo**: il canone del cinema popolare e rispettabile, declinato
per genere (thriller, horror, legal, fantascienza, Tarantino). I termini dei vicini sono **temi**
(`kw:time travel`, `kw:legal thriller`, `kw:folk horror`, `kw:hitman`), non «film famosi». La mappa
funziona e la bolla sta dove deve stare.

---

## Ritrattazione 1: «quella bolla non esiste»

Nel report del ticket 05 di `mappa-pesata` avevo scritto:

> «E Verity resta in bolla 820 anche con V3 (coseno 0,107, sopra soglia) [...] **Quella bolla non
> esiste** [...] il difetto è nella PARTIZIONE.»

**Sbagliato.** La bolla esiste, è coerente, e Verity — un thriller psicologico del 2026 da un
bestseller, con Dakota Johnson e Anne Hathaway, prodotto da Amazon MGM — **appartiene a quel mondo**.
Il coseno 0,177 con V3 non era un caso: era corretto. E il termine `kw:psychological thriller` è nei
metadati di *Verity* **e** in terza posizione fra i termini della bolla.

Avevo anche una conferma che ho ignorato: l'indice di chimera dava alla 820 una PMI mediana di
**+0,880**, cioè massima coerenza, e io l'ho letto come «un minestrone *coerente*» invece di
domandarmi se il minestrone fossi io a vederlo.

## Ritrattazione 2: «N_eff 101 significa un mondo polverizzato»

Nel report 02-03 avevo letto `N_eff(psychological thriller) = 101,78` come «il mondo non esiste,
è sparso in venti bolle».

**Sbagliato anche questo, e la spiegazione è più interessante.** Il tag `kw:psychological thriller`
porta 306 titoli: quelli con **migliaia di voti** stanno nella 820 (il canone), quelli con poche
centinaia sono altrove, divisi per epoca, paese e sottotema. **Non è una partizione rotta: è una
partizione che mette insieme i film che il pubblico ha reso canonici, e tratta il resto con criteri
diversi** — che per il prodotto è persino ragionevole, perché un carosello «thriller psicologico» che
mescolasse *Seven* e un film turco del 2014 servirebbe peggio entrambi.

`N_eff` misurava una cosa vera — il tag non coincide con un mondo — ma la conclusione che ne avevo
tratto («il mondo è rotto») non seguiva.

---

## La lezione

Due volte in questa sessione il giudizio dell'utente ha corretto una mia conclusione tratta dalle
metriche: la prima su *Verity*, la seconda su questa bolla. In tutti e due i casi **avevo i dati per
non sbagliare**:

- i **termini del centroide** dicono di cosa parla una bolla, e li avevo letti per dieci bolle su
  1.625 — mai per la 820;
- la **mediana dei voti** dice se una bolla è un canone o una nicchia, e l'avevo calcolata per nessuna
  bolla;
- l'**indice di chimera** mi aveva detto «coerente» e io l'ho interpretato come un'eccezione.

**Prima di chiamare un mondo sbagliato, guardare il suo profilo**: i termini del centroide, i voti, i
registi, gli anni. È un minuto di lavoro, e l'ho saltato due volte su due.

E una nota per i ticket: il «minestrone» era una diagnosi **inventata sul posto**, e da quella
diagnosi sono nati il ticket 09 (il sub-clustering della 820) e l'arbitro mancante. Il sub-clustering
resta utile — ha diviso il true crime in otto mondi leggibili e ha separato i western dagli horror —
ma **il suo caso di prova era falso**: la 820 non andava divisa, e «non si è divisa» era la risposta
giusta, non un fallimento.
