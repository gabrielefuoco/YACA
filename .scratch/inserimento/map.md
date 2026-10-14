# inserimento — come entra nel grafo un titolo appena uscito

Aperta il 14/10/2026, su una misura: **il test di «Verity»**. `Verity` (id TMDB 1283515, uscito il
30/09/2026, 95 voti) e' nel dump TMDB ma **non ha una riga nel grafo**. E non e' un caso isolato:
**degli 836 film del 2026 presenti nel dump, solo 1 e' nel grafo.**

La causa e' strutturale: **il grafo si costruisce dai comportamenti** (CF, B, TV, LIST), quindi chi
non ne ha non entra. Il prodotto serve un catalogo che si rinnova ogni giorno, e ogni uscita e'
**invisibile** — non sbagliata: invisibile.

## Destination

Un titolo nuovo deve poter entrare nel grafo **il giorno stesso**, con i soli metadati, e finire
**vicino ai titoli giusti**. Il banco di prova e' pronto e ha una risposta nota: **Verity deve
finire accanto a _Quello che non so di lei_** (The Woman in the Window: thriller psicologico tratto
da un romanzo) **e ai film di Michael Showalter** (Gli occhi di Tammy Faye, The Big Sick, The
Baxter, Spoiler Alert, Hello My Name Is Doris), che sono i suoi vicini veri per regia.

## Cosa c'e' gia', e cosa manca

Il pezzo e' **progettato e mai collegato**:

| | |
|---|---|
| **CFst** — lo studente *metadati → comportamento* | esiste, copre tutti i 66.259 titoli, ed e' una **Ridge** (`keyword → Cf`, 128 uscite) |
| **il modello** | **NON e' salvato.** `cf-studente.npz` contiene solo l'output `P`. Il refit e' in `cf-edges.py:95` |
| **le feature `FX`** | costruite in `spazi-trakt.py` (righe ~117-197) mescolando keyword, generi, lingue, paesi, 3.000 persone, 800 collezioni, 600 compagnie, 1.500 sceneggiatori, budget, incassi, rating |
| **i vocabolari** | **NON sono salvati**: sono tagliati sul catalogo (`value_counts().head(N)`), quindi senza di essi un titolo nuovo non e' proiettabile |
| **il gating λ_cold** | progettato e verificato nel ticket 16 di `grafo-servibile` (i metadati ovunque costano −7,34 al @500), **mai applicato all'inserimento** |
| **il banco di prova** | `prova-verity.py` e `prova-verity-2.py`: già misurano che coi soli canali strutturali la collocazione e' sbagliata (bolla 818 = i film svedesi di *Beck*) |

## Decisioni prese

| | |
|---|---|
| **Il modello si salva, non si ricalcola** | rifittare la Ridge a ogni titolo nuovo e' assurdo: si salva `coef_`, `intercept_`, i vocabolari e l'IDF, e la proiezione diventa un prodotto scalare |
| **I vocabolari si congelano alle scadenze del catalogo** | una categoria che non esiste ancora (una lingua nuova, una compagnia nuova) **non ha colonna**: va deciso cosa farne, e va dichiarato |
| **Le feature non cambiano** | si riusa la costruzione di `spazi-trakt.py` **identica**, perche' il modello e' addestrato su quella. Cambiarla invalida il refit |
| **Il giudice e' la lettura, non la similarita'** | come per le bolle: il test di Verity vale se finisce accanto ai titoli giusti, non se il coseno e' alto |
| **Si misura anche il costo** | quanti secondi per inserire un titolo, e quanto pesa l'inserimento di 100 |

## Non ancora specificato

- **Chi decide che un titolo e' "nuovo"**: la data di uscita, l'assenza di archi, o entrambe.
- **Se il titolo entra nella partizione come bolla nuova** o si aggancia a una esistente: il ticket
  05 di `grafo-servibile` (potatura al nucleo) suggerisce di agganciarlo.
- **Se l'inserimento e' incrementale o batch**: con TMDB che cambia ogni giorno, la differenza conta.
- **Cosa fare dei titoli con pochissimi metadati** (0 keyword, cast vuoto): non e' un caso raro nei
  film indipendenti e nelle uscite direct-to-video.

## Fuori scope

- **La mappa a otto slot**: e' il ticket 10 di `bolle-nitrile`, si fa dopo questo effort.
- **Il banco nativo di YACA**: resta `wontfix` (gli utenti attuali sono test casuali).
- **La ricetta del recupero**: decisa nel ticket 24 di `grafo-servibile`, non si riapre.
- **YACA in produzione**: `src/` non si tocca.

## Effort collegati

- `.scratch/bolle-nitrile/` — la costruzione delle bolle (dove il titolo nuovo deve atterrare)
- `.scratch/grafo-servibile/` — il ticket 16 (gating λ_cold) e il 24 (la ricetta)