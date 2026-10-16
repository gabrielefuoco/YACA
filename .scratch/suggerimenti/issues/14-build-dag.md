Status: needs-info
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
