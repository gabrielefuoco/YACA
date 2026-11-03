Status: needs-triage
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
