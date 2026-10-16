Status: ready-for-agent
Type: task

# `pipeline build`: gli step come funzioni, con ricostruzione incrementale
**Proposta** (dal senior): (1) incapsulare ogni file di `graph/steps/` in `esegui(dati_dir, params)`;
(2) in `pipeline.py` una lista dichiarativa `(nome, funzione, input, output, parametri_usati)`;
(3) `python -m graph.pipeline build` che confronta gli sha256 di input e parametri con un manifest
(`graph/data/manifest-build.json`) e **riesegue solo gli step a valle** di cio' che e' cambiato.
**Perche' needs-info**: gli step pesano **~30 minuti** e 11 GB di picco (`02-v10.py`). Prima di
riscriverli in funzioni va deciso se il DAG debba **rieseguire** o solo **dire cosa rieseguire** (un
`--dry-run`), e se il manifest debba stare in git (e' un artefatto di build, quindi no: va in
`.gitignore`). La parte (1) ha senso comunque e si puo' fare da sola.
---

**NON COMINCIATO, il 16/10/2026.** Il ticket 13 e' stato fatto per primo — era il prerequisito giusto —
e ha rivelato due cose che vanno risolte *prima* di scrivere un DAG:

1. **un bug che rendeva impossibile rieseguire gli step** (`A().exists()`, vedi il ticket 13): un DAG che
   orchestra passi che non partono non serve a niente, e il suo manifest avrebbe registrato come
   «eseguito» qualcosa che usciva subito. Adesso e' sistemato;
2. **`pipeline esporta` non finisce piu'** (il blocco sta in `collocator.carica`): anche questo va prima.
   Un `build` che non arriva all'ultimo passo — l'artefatto del prodotto — e' peggio di `pesanti()`, che
   almeno *dice* cosa fare e non finge di averlo fatto.

Quindi il ticket resta aperto, ma con due prerequisiti **chiusi o localizzati** invece che ignoti. Le
decisioni che servono al proprietario restano quelle scritte in origine: se `build` debba **eseguire** o
solo **dire** (un `--dry-run`), e se il manifest debba stare in git (no: e' un artefatto di build).

---

**SBLOCCATO il 16/10/2026.** I due prerequisiti che avevo dichiarato sono chiusi:
 1. il bug `A().exists()` che rendeva impossibile rieseguire gli step — sistemato (`canon.esiste`), e gli
    step 03 e 05 adesso **riproducono gli artefatti bit per bit**;
 2. `pipeline esporta` non finisce piu' — risolto, e adesso impiega **5 secondi** invece di 30.
Il DAG si puo' scrivere. Restano le due decisioni del proprietario, che sono le stesse di prima: se `build`
debba **eseguire** o solo **dire** (un `--dry-run` come primo passo), e se il manifest debba stare in git
(no: e' un artefatto di build, va in `.gitignore`).
