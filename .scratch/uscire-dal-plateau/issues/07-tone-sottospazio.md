Status: needs-info
Type: research
Blocked by: 05, 01

# TONE: un sottospazio di affinità tonale

## Il problema

Quindici varianti sulle keyword hanno fallito perché sommano 1-grammi di soggetto: `feminism` porta ai
documentari, `doll` agli horror con le bambole. Il tono non è un sostantivo: è ciò che resta quando si
toglie il soggetto dalla rappresentazione, più l'interazione fra estetica, registro e posizionamento
culturale.

## L'ipotesi da testare

1. **Proiezione ortogonale al soggetto.** Dalle rappresentazioni di trama si rimuove la componente
   spiegata dal soggetto letterale (keyword di ambientazione/oggetto, nomi propri dopo il ticket 05).
   Il residuo è il candidato "tono".
2. **Coppie positive auto-supervisionate**: coppie che condividono regia o alta co-occorrenza in liste
   curate **ma** hanno genere primario diverso o basso coseno di trama letterale. Sono i casi in cui
   l'affinità non può venire dal soggetto.
3. **Hard negative lessicali**: coppie con ≥2 keyword rare o alto coseno di trama ma **zero**
   sovrapposizione comportamentale (*Barbie* vs *La bambola assassina*, *Barbie* vs *The Red Pill*).
4. InfoNCE su un MLP leggero con interazione bilineare (LayerNorm(W_p·trama ⊙ W_k·kwsem)) → embedding
   TONE a 256 dimensioni → tipo `TONE.npz`.

## Cosa misurare

- Su *Barbie*: nei primi 15 devono comparire *Povere creature!* / *The Substance* / *EEAAO* **e** non
  devono comparire documentari a tema né horror con le bambole.
- Banco (IC del ticket 01), quota >5k.
- Un test su 8 seed (il protocollo di `.scratch/distillazione-grafo/test-spirito/`), con la
  dichiarazione esplicita che le etichette sono dell'assistente e non dell'utente.

## Criterio di fallimento dichiarato

Se dopo il ticket 05 e il 02 *Barbie* non si muove di un rango, l'ipotesi "il tono è nel residuo" è
falsa su questi dati: fermarsi e chiedere il dato nuovo (recensioni utente TMDB o Wikipedia
intro + sezione Themes/Style) invece di insistere con i metadati esistenti.

---

## Esito della prima metà: **l'ipotesi è falsa su questi dati**

Implementato `services/graph_dense/tone.py`: direzione del soggetto per titolo = media pesata idf degli
embedding delle sue keyword; residuo `r = z − (z·ŝ)ŝ`; tipo TONE = coseno sui residui.
7.185.500 archi, 66 s. 3 test.

La riga grezza di TONE dice tutto:

| titolo | primi vicini per residuo |
|---|---|
| *Barbie* | **Super Mario Bros. - Il Superfilm** · Vicini del terzo tipo · Tre uomini in barca · V - Visitors · Doctor Who · La via della prostituzione |
| *Povere creature!* | Margarita with a Straw · Il diavolo veste Prada · Cortigiana · Matilda The Musical |
| *Drive* | Faster · L'autista · Glassland · Kiler · Taxxi 2 |

Il residuo non è il tono: è il **rumore specifico** — nomi propri, dettagli minori, ambientazioni — che
la media delle keyword non cattura e che quindi resta nel vettore. *The Substance*, *Josie*, *Lady Bird*
non compaiono in nessuna delle tre righe.

Questo è il criterio di fallimento dichiarato in testa al ticket: *«Se dopo il ticket 05 e il 02 Barbie
non si muove di un rango, l'ipotesi "il tono è nel residuo" è falsa su questi dati»*. È falsa.

**Conclusione**: la seconda metà (contrastivo con coppie positive/negative e MLP) costruirebbe un
classificatore addestrato su coppie scelte a mano, sopra un residuo che si è dimostrato rumore — non
aggiunge informazione, aggiunge parametri. **Non la faccio.**

## Serve il dato nuovo

Il tono, se è nei dati, sta in un testo che *parla* di tono: le recensioni utente TMDB (aggettivi
estetici: «campy», «surreal», «satirical», «plastic», «lynchian») o Wikipedia (intro + sezione
Themes/Style). Costo: ~15.000 richieste TMDB per i film con ≥200 voti, ore 1, oppure il dump Wikipedia.
Da decidere con l'utente: è una fonte nuova, non un'altra prova sui metadati esistenti.

---

## Seconda strada, pilota: le recensioni funzionano dove il residuo falliva

`services/graph_dense/critica.py`: scarica `/movie/{id}/reviews` da TMDB (chiave da `.env`), tiene le
prime 6 recensioni per film, embedda con Qwen3-Embedding (stesso modello delle trame) e mette tutto in
cache (`services/graph_dense/data/recensioni.parquet`). Pilota su **2.061 film** con ≥500 voti.

*Barbie*, primi 8 vicini per recensioni:

```
Piccole donne · Lady Bird · Bombshell · La babysitter · Free Guy · Bad Moms · Parasite · Babe
```

Ranghi dei casi che ci interessano:

| film | giudizio | rango (recensioni) | per confronto, rango in KWLAT |
|---|---|---:|---:|
| Lady Bird | affine | **#2** | #19 (V19) |
| The Substance | affine | #58 | assente |
| Povere creature! | affine | #267 | #122 |
| EEAAO | affine | #908 | — |
| Dragon Trainer | falso amico | **#992** | **#23** |
| Annabelle | falso amico | **#1239** | assente |
| American Sniper | falso amico | **#1505** | **#40** |

**Il fatto nuovo**: le recensioni **separano i falsi amici**. Dove KWLAT metteva *Dragon Trainer* al #23
e *American Sniper* al #40 — cioè vicini a *Barbie* — le recensioni li mandano oltre il #990. È la
proprietà che nessun segnale basato su trama/keyword aveva.

**Il limite**: la precisione sui veri positivi è mediocre (*Povere creature!* #267, *EEAAO* #908), e il
campione è 2.061 film su 76.497. Servono due cose: scala (tutti i film con ≥200 voti, ~15.000, circa
1,5 h di fetch) e forse un testo più mirato del corpo intero della recensione.

---

## Analisi del pilota: perché le recensioni non bastano

Su richiesta dell'utente ("non mi convince, fermiamoci e analizziamola, con riserva"). Tre misure.

### 1. La densità del tono nel testo è 0,13%

Su 300 recensioni (146.483 parole): **193 parole di tono** — camp, satirico, surreale, kitsch, deadpan,
melodramma, grottesco, onirico, sovversivo... **0,13%**. Una recensione media ha 488 parole, di cui
~0,6 di tono. L'embedding di un documento così è al 99,87% trama e lodi generiche: il segnale che
cerchiamo è tre ordini di grandezza sotto il rumore. **Questo spiega esattamente i ranghi misurati**,
non è un caso.

Il 44% dei film (913/2.061) ha almeno un marcatore di tono.

### 2. Sullo stesso pool di 2.061 film, i tre segnali si dividono il lavoro

| film | giudizio | recensioni | trama | grafo V19 |
|---|---|---:|---:|---:|
| Lady Bird | affine | **#2** | #1263 | #3 |
| The Substance | affine | **#58** | #1871 | assente |
| Povere creature! | affine | #267 | #601 | assente |
| EEAAO | affine | #908 | **#60** | #36 |
| Annabelle | falso amico | #1239 | **#348** | assente |
| Dragon Trainer | falso amico | #992 | #1344 | assente |
| American Sniper | falso amico | #1505 | #978 | assente |

Le recensioni trovano *Lady Bird* (#2) e *The Substance* (#58) dove la trama non li vede (#1263, #1871);
la trama trova *EEAAO* (#60) dove le recensioni lo perdono (#908). **Sono complementari — ma nessuno
dei due mette *Povere creature!* vicino a *Barbie*.**

### 3. Filtrare le frasi di tono peggiora

Tenendo solo le frasi con un marcatore: 698 film su 2.061, e la riga di *Barbie* diventa
*Willy Wonka e la fabbrica di cioccolato* (1971) · *Tucker & Dale vs. Evil* · *Fantastic Mr. Fox* ·
*Last Action Hero* · *Shadowhunters*. Il pool si svuota e il rumore prende il posto del segnale.

### Conclusione

**La strada è chiusa in questa forma, e per un motivo misurabile**: la densità del tono nelle recensioni
è 0,13%, e nessuna aggregazione di un documento al 99,87% di trama può isolarla. Scalare a 15.000 film
allarga il pool ma non cambia la densità: *Povere creature!* resterebbe a metà classifica.

Quello che servirebbe è un **asse di tono etichettato**: qualche centinaio di coppie giudicate
("stesso tono / no") da cui imparare, oppure un LLM che legge le recensioni e restituisce etichette di
tono su un campione (poche centinaia di film, costo basso). Non altre aggregazioni di testo non
etichettato.

Il pilota resta utile per una cosa: **la separazione dei falsi amici** (#992, #1239, #1505 contro i #23
e #40 di KWLAT). Quella proprietà è reale e va ricordata se un giorno si costruisce l'asse etichettato.
