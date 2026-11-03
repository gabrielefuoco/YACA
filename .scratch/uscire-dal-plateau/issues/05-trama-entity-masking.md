Status: ready-for-agent
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
