Status: resolved
Type: task

# 17 — Trame in inglese + gate per film (il grafo non deve pesare uguale per tutti)

## Cosa è emerso

Il test di prodotto su due titoli ha trovato due difetti diversi, e una causa comune.

- **Povere creature!** è **isolato**: il top-20 sono *This Beautiful Fantastic*, *Belle*, *Doña bella*,
  *Twilight*, *La bella e la bestia* — coseni 0,23-0,31 contro 0,5-0,8 normali. Il blocco trama
  matcha il **nome del personaggio** («Bella Baxter») nella sinossi italiana.
- **House of the Dragon** è buono ma **"dragon"-dominato**: *Dragonheart 4* a 0,48, *Fantaghirò*,
  *Merlino* — invece del fantasy politico (Vikings, The Witcher, Rome). Token del titolo forte.

**La causa comune**: le trame sono in **due lingue**. I Parquet originali hanno l'`overview` in
italiano per ~38% dei titoli (il resto inglese), le 30.157 sinossi recuperate sono en-US. Il blocco
trama (qwen3, 1024-d) è quindi metà italiano e metà inglese: due film simili ma con trame in lingue
diverse si allontanano, e i match lessicali dominano (coseni di trama compressi: 0,29 per coppie
casuali).

**Il secondo difetto è il peso globale dei blocchi.** Oggi `z = normalize(wp·trama + wk·keyword +
wm·meta)` con pesi uguali per tutti i film. Ma i due casi chiedono cose opposte:

| film | cosa serve | perché |
|---|---|---|
| Perfetti sconosciuti | **blocco semantico** | trova tutti i remake (russo, francese, polacco, spagnolo, vietnamita) |
| Povere creature! | **blocco meta** | il grafo ha un vicinato sensato (Barbie, The Lobster, Oppenheimer, Past Lives — bolla 2023); la trama lo isola |

Con `wm=1` il meta è il 51% della massa e il curato scende a 6,9/9,3; con `wm=0,35` il curato sale a
10,1/11,6 e il grafo scende a 15,7. Un peso unico deve mediare, e media male.

## Obiettivo

1. **Trame in inglese per tutto il canone.** La lingua originale resta in DuckDB; il grafo usa l'EN.
   Il fetch notturno deve portare **anche la trama EN**, tenuta a parte (fuori RAM), così il dato non
   si perde e si può rigenerare.
2. **Gate per film** al posto dei pesi globali: `g = softmax(Linear(feature_meta))`, tre pesi per
   film. Il gate impara a dare peso alla trama quando è informativa, al meta quando il film vive di
   comportamento (uscite, bolle, franchise).
3. **Valutazione** su grafo + curato (calde/fredde) + i due casi + lettura su 20 titoli.

## Fase A — trame EN

- Rifetch `en-US` per i titoli con overview non inglese (~35k; i 30k già en-US sono in
  `data/overview-extra.parquet`). Riusare `fetch_overview.py` con `LINGUE=("en-US",)` e una lista
  "tutti" invece dei soli vuoti; output `data/overview-en.parquet` (chiave, overview).
- Ri-embedding di **tutte** le 66.048 trame (non solo le nuove) con `embed_trama.py`, payload
  «titolo. trama» in inglese.
- Rigenerare `blocks.npz` (Bp) e verificare che i coseni di trama non siano più compressi.

## Fase B — gate per film

- Nel `BlockStudent`: `gate = Linear(d_meta, 3)` sul vettore meta pre-normalizzazione; `g =
  softmax(gate(h))`; `z = normalize(g0·Bp + g1·Bk + g2·h)`.
- Inizializzare il gate verso i pesi attuali (logit ~ log(0.35, 0.35, 0.30)) così parte bilanciato.
- Penalità di entropia leggera per evitare il collasso; monitorare la deviazione standard dei pesi
  per film (se è ~0, il gate non serve e va detto).
- Addestrare con il target attuale (`P = grafo + 0,5·semantica`), 100 epoche, 512-d di meta.
- Confronto: b2 (pesi globali, wm=0,5) vs b3 (gate), su grafo + curato.

## Criteri di accettazione

- Curato @10 **≥ 9,2/11,9** (il grezzo kw+trama) **con grafo ≥ 15%**.
- Povere creature! non più isolato: primi vicini nella bolla 2023 (Barbie, Oppenheimer, Past Lives,
  The Lobster) e coseni ≥ 0,5.
- Perfetti sconosciuti mantiene i remake.
- Il gate si differenzia: deviazione standard dei pesi per film > 0,05; altrimenti si documenta il
  collasso e si torna ai pesi globali.

## Note

- **Non** si usa `vote_average`/`vote_count`/`popularity` in input (leak); restano peso di supporto
  nel target e strati di valutazione.
- Il pavimento semantico resta: i blocchi trama+keyword sono fissi, il gate può solo riponderarli.
- `wm=0,4` globale diventa obsoleto se il gate funziona; se non funziona, resta la scelta del punto
  sulla frontiera (ticket 16 e report §13).

## Esito (eseguito)

- **Trame EN**: 66.014 sinossi scaricate (`data/overview-en.parquet`), 66.049 ri-embeddate in 826 s.
  Peggiora: grafo 12,8% → 10,3%, curato @10 10,1/10,8 → 7,8/9,5. Coseno casuale 0,298 → 0,328;
  whiten 512/1024 non recupera. Blocchi originali ripristinati (copie EN in `*.bak.npy`).
- **Gate b3**: media 0,25/0,15/0,60 (massa ~81% meta), grafo 14,6%, curato 5,5/9,0 — collassa sul
  meta, peggio di b2. Non riprovato con ancora: la frontiera globale resta migliore.
- **Decisione**: si resta su **b2 + pesi globali**; punto similarita'-prima `wm=0,35`
  (grafo 15,7%, curato 10,1/11,6), bilanciato `wm=0,5` (16,8%, 8,6/10,2). Vedi report §14.
- Aperto: trame it-IT per tutte (il misto batte l'EN); gate con ancora KL, se si insiste.
