Status: needs-info
Type: task

# I nomi degli artefatti sono fossili dei ticket, non nomi di dominio
**Prova**: `04-tfidf.npz`/`04-centroidi.npz` sono lo spazio **V1 macro** (per scegliere la bolla), e
`05-tfidf.npz`/`05-centroidi.npz` sono il **V3 micro** (per scegliere i vicini); convivono
`bolle-nitrile-KW.npz` (effort omonimo), `nuovo-TV.npz` (`ml-collaborativo`),
`eterogeneo-TRAMA.npz`, `04-trama-qwen3b.npy`, `bolle-eterogeneo-V10-p1.0-r200.npy`. Fra due mesi
nessuno ricordera' perche' 04 e' macro e 05 e' micro.
**Proposta** (dal senior): nomi di dominio — `comp-KW.npz`, `comp-CAST.npz`, `comp-DIR.npz`,
`comp-PROD.npz`, `comp-COLL.npz`, `comp-TV.npz`, `comp-LIST.npz`, `comp-TRAMA.npz`,
`grafo-miscela.npz`, `partizione-base.npy`, `partizione-finale.npy`, `mappa-bolle.npz`,
`spazio-macro-v1.npz`, `spazio-micro-v3.npz` — con un registro in `canon.py`.
**Perche' needs-info**: la rinomina tocca 655 MB di artefatti e ~20 file di codice, e alcuni artefatti
sono **citati dentro gli sha256** salvati in altri file. Serve decidere se rinominare i **file** o solo
esporre **alias** nel registro (piu' sicuro: registrare i nomi nuovi come chiavi e tenere i vecchi
come alias deprecati). Da decidere col proprietario prima di toccare 655 MB.
