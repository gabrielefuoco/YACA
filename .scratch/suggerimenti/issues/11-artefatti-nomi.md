Status: wontfix
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
---

CHIUSO `wontfix` il 16/10/2026 — **non per pigrizia: il beneficio e' cosmetico e il costo rompe una cosa
che funziona.** Due ragioni, verificate oggi:

1. **LA DOMANDA CHE CONTA HA GIA' UNA RISPOSTA MIGLIORE.** `python -m graph.pipeline stato` elenca ogni
   artefatto con dimensione e stato — `VIVO`, `esperimento`, `duplicato` (12 vivi · 7 esperimenti · 0
   mancanti). **Un nome non potra' mai dire questo**: «e' vivo?» e' una proprieta' del sistema OGGI, non
   del file. Rinominare `bolle-nitrile-V8.npy` in `partizione-base-v8.npy` lascerebbe esattamente lo
   stesso dubbio, e l'unica cosa che risponde e' quell'elenco.

2. **RINOMINARE ROMPEREBBE IL CONTRATTO DELLA PARTIZIONE.** `04-impronte.json` e `05-impronte.json`
   registrano il **nome** della partizione, e `canon.assert_partizione` si accende se il nome non
   corrisponde: e' il contratto che impedisce alla trappola del 15/10 di ripetersi. Rinominare
   `bolle-eterogeneo-subvoti.npy` farebbe scattare quel contratto, e per farlo tacere bisognerebbe
   **rigenerare i centroidi**: 30 minuti e 11 GB di picco, per un `ls` piu' carino.

E IL DANNO VERO ERA GIA' CHIUSO: il prefisso `04-` che cattura anche l'artefatto dell'embedding (due
pipeline che se lo spartiscono) e' stato risolto dai **pattern precisi del DAG** (`PASSO`) e dal test
sull'ordine topologico — non da una rinomina.

COSA RESTA, se un giorno servisse: `graph/README.md` dice cosa c'e' in `data/` e da dove cominciare
(`stato`), e la tabella `ARTEFATTI` in `pipeline.py` ha una descrizione e una provenienza per ogni
artefatto. Se si volesse comunque un `ls` leggibile, la strada che NON rompe niente e' un indice in
`graph/data/LEGGIMI.md`: dieci minuti, zero rischio, nessun contratto da rigenerare.
