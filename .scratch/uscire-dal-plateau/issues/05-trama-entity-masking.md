Status: resolved
Type: task
Blocked by: 02

# TRAMA: mascherare titolo, collezione e nomi propri prima dell'embedding

## Il difetto

`embed-trama2.py:50` costruisce il payload come `f'{t}. {o.strip()}'`: il titolo è **dentro** il testo
da embeddare. E anche togliendolo, le sinossi contengono i nomi propri (*Barbie*, *Ken*, *Barbie Land*,
*Gotham*). Lo spazio TRAMA misura l'omonimia lessicale: è per questo che *Barbie* finisce sui cartoni
Mattel e non su *The Truman Show*.

Esiste `trama-notitle.npy` come esperimento (`emb-senza-titolo.py`), ma **non è nella pipeline**.

## Cosa fare

1. `mask_entities(text, title, title_en, original_title, collection_name)`:
   - rimuove i token significativi dei quattro campi titolo (case-insensitive, solo token lunghezza ≥ 4);
   - sostituisce con `"the protagonist"` quando il token mascherato è il soggetto della frase
     (euristica: token a inizio frase o dopo una virgola, seguito da un verbo), altrimenti rimuove;
   - **non** tocca i nomi propri dei personaggi: i Parquet salvano `cast` con `id/name/order` e **non**
     il campo `character`, quindi la lista dei personaggi non è disponibile a costo zero.
2. Rigenerare i 71.855 embedding con Qwen3 (fp16, ~20 minuti di GPU), payload **senza** prefisso titolo.
3. Misurare: banco (IC del ticket 01), top-10 di *Barbie*, e il trap-set dei 40 cartoni Mattel
   (deve restare fuori).

## Criteri di accettazione

- Nessun payload contiene più il titolo del film (verifica per campione su 200 titoli con controllo di
  sottostringa sui token del titolo).
- Sulla riga TRAMA pura di *Barbie* i cartoni Mattel scendono oltre il rango 50.
- Il banco non perde più di 0,005 di R@20.

## Nota

20 minuti di GPU e nessun dato nuovo: è il rapporto valore/costo migliore dopo il ticket 02.

---

## Esito

`services/graph_dense/maschera.py` (`chiavi`, `maschera`, 6 test) + cablaggio in `embed-trama2.py`:
il payload non porta più `f'{t}. {o}'`, e nella sinossi vengono mascherati i token di titolo, titolo
originale e collezione (≥ 4 caratteri; il soggetto di frase diventa `the protagonist`; tetto di 6
sostituzioni per non ridurre la sinossi a un buco). 71.855 trame ri-embeddare in **1037 s** di GPU.

Esempio: *Barbie* → «The protagonist and Ken are having the time of their lives in the colorful and
seemingly perfect world of the protagonist Land.»

**Risultato onesto: nessun effetto misurabile.**

| grafo | R@5 | R@20 | MRR | >5k | SNIPS |
|---|---:|---:|---:|---:|---:|
| TRAMA con titolo | 0,146 | 0,264 | 0,1023 | 72,3% | 0,156 |
| **TRAMA mascherata** (a parità di COVISION `--semplice`) | 0,145 | 0,262 | 0,1011 | 72,6% | 0,162 |

`R@20 −0,0011 [−0,0048, +0,0025]` · `SNIPS +0,0061` → tutto sotto l'MDE.
Il criterio di accettazione era già soddisfatto prima: i cartoni Mattel stanno al rango **172** con il
titolo e **244** mascherata — il `--damp-coll --damp-titolo` del mixer li aveva già abbattuti.

**Vale la pena tenerlo?** Sì, ma per il motivo giusto: corregge un difetto concettuale (il titolo dentro
l'embedding fa misurare l'omonimia) che su altri titoli può mordere, e non costa niente. **Non** è la
leva per Barbie, e va detto: la seconda misura (la variante `v18mask`, con la COVISION temporale)
mostrava −6,6 punti di coda, ma quello era l'effetto del ticket 03 confuso dentro lo stesso build.
