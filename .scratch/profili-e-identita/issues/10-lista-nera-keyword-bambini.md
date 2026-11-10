# La lista nera delle keyword per Bambini

Status: resolved
Type: task
Blocked by: —

## Perché

Il ticket 03 ha stabilito che oggi il filtro bambini è **solo negativo** e **gira dopo il taglio**: sceglie venti titoli qualsiasi e poi ne butta via una parte, da cui le righe vuote. Non esiste alcun dato di età nel canone. L'utente ha deciso che il filtro dei Bambini è una **lista nera di keyword**, senza lasciapassare obbligatorio: la copertura keyword è praticamente totale (7 titoli su 76.497 non ne hanno, mediana 17 per titolo), quindi la lista è la politica.

## Cosa va fatto

1. **Seminare la lista** con le keyword esplicitamente inadatte: gore, torture, violenza sessuale, abuso su minori, droga, suicidio, pornografia. Nient'altro: violenza generica, morte, guerra e armi **non** entrano (decisione dell'utente: *Il Signore degli Anelli* non è un film sbagliato per bambini).
2. **Espandere con il grafo delle keyword** — non a mano, non con un LLM che inventa. Le keyword semanticamente vicine ai semi si trovano con l'embedding già esistente (`.scratch/distillazione-grafo/kw-sem.py`, `kw-emb-cache.py`), e l'espansione va **limitata e revisionata**: ogni parola aggiunta deve essere giudicabile da un umano in un secondo.
3. **Produrre l'elenco revisionabile**: un file leggibile con, per ogni keyword, la distanza dal seme più vicino e quanti titoli del canone la portano. L'utente lo legge una volta e dice sì o no. Le parole ambigue (*violence*, *blood*, *revenge*) si scartano, non si pesano.
4. **Congelare l'artefatto** in `services/graph/data/`, con la provenienza (semi, versione del grafo keyword, data) come per gli altri artefatti. Il filtro deve essere riproducibile: chi rigenera ottiene la stessa lista o sa perché è cambiata.
5. **Applicarlo nel grafo, prima del taglio**, non in Node dopo: un titolo con keyword vietata non deve mai occupare uno dei 60 posti. Deve essere registrato in `/health` come artefatto, con l'avviso di avvio se manca — e se manca, la modalità Bambini deve **degradare in modo rumoroso** (righe vuote con avviso), non servire contenuti non filtrati.
6. **Verificare i casi di scuola** dopo l'applicazione: Inside Out ✓, Shrek ✓, Il Signore degli Anelli ✓ (per scelta), Invincible ✗ (gore), Stranger Things ✓ (per scelta). Se *Invincible* passa, la lista è troppo stretta; se *LoTR* esce, è troppo larga.

## Cosa non è

Non è un filtro per età, non è una certificazione, non è un lasciapassare per genere. Un titolo senza keyword (7 casi) resta fuori dalla modalità Bambini: non si può garantire ciò che non si sa.

## Esito

- **Decisione umana**: Approvazione integrale di **Semi + Gruppo A + Gruppo B** (`GRUPPI_APPROVATI = ['A', 'B']`), combinata con il filtro di certificazione esistente (Node.js) e **nessun filtro di genere**.
- **Conteggio keyword**:
  - Semi iniziali: **62**
  - Gruppo A (sicure): **114**
  - Gruppo B (dubbie, approvate): **224**
  - Gruppo C (scartate, falsi positivi / violenza generica): **106**
  - **Totale keyword in blacklist**: **400**
- **Tasso di esclusione sul canone (76.497 titoli)**:
  - Solo semi: 3.388 titoli (4,43%)
  - Semi + Gruppo A: 4.216 titoli (5,51%)
  - **Semi + Gruppo A + Gruppo B**: **9.042 titoli (11,82%)**
- **Artefatto congelato**:
  - Percorso: [`services/graph/data/keyword-bambini/blacklist.json`](file:///services/graph/data/keyword-bambini/blacklist.json)
  - Impronta SHA256 del contenuto (blacklist + meta + provenienza, escluso il solo campo `sha256`): `0808ec46dad41f3c…` — ricalcolabile, vedi `sha256_scope` dentro il file
  - Include provenienza completa con hash dei file di input (`semi.md`, `kwsem-qwen3-0.6b.npz`, `kw-emb.txt`, `vocab.json`, `tfidf.npz`).

### Tabella dei Casi di Scuola

| Caso di scuola | TMDB ID / Tipo | Verdetto | Regola determinante | Dettaglio / Note |
| :--- | :--- | :--- | :--- | :--- |
| **Inside Out** | Movie 150540 | **AMMESSO (✓)** | Passa blacklist & certificazione | Nessun hit su 400 keyword; certificazione `G` ammessa. |
| **Shrek** | Movie 808 | **AMMESSO (✓)** | Passa blacklist & certificazione | Nessun hit su 400 keyword; certificazione `PG` ammessa. |
| **Invincible** | TV 95557 | **ESCLUSO (✗)** | **Blacklist Keyword** (`gore`) | Escluso dal seme `gore` (e ridondante certificazione `TV-MA`). |
| **Stranger Things** | TV 66732 | **ESCLUSO (✗)** | **Certificazione** (`TV-14`) | Passa la blacklist keyword (i tag horror sono in Gruppo C); bloccato dalla regex certificazione `1[4-9]`. |
| **Il Signore degli Anelli** | Movie 120, 121, 122 | **AMMESSO (✓)** | Passa blacklist & certificazione | Nessun hit su 400 keyword (nessun gore); certificazione `PG-13`/`T` ammessa; nessun filtro genere. |

*(Nota su Gruppo B: l'inclusione di `drugs` rimuove la commedia per famiglie 'Un piedipiatti e mezzo' (PG), e `cruelty` rimuove il live action Disney 'Cenerentola' (2015, T/PG).)*

## Decisione finale (dopo verifica indipendente)

L'utente ha scelto di **tenere tutte e 400 le keyword** (62 semi + 114 gruppo A + 224 gruppo B), accettando i due falsi positivi misurati:

- `drugs` esclude *Un piedipiatti e mezzo* (PG, commedia per ragazzi) — 258 titoli esclusi da questa sola parola.
- `cruelty` esclude *Cenerentola* (2015, PG, Disney) — 19 titoli da questa sola parola.

Motivo: coerenza con la regola scelta. La lista è la politica e non si ritocca caso per caso; i due film sono il prezzo di un filtro che non si discute a ogni titolo.

Numeri definitivi: **9.042 titoli esclusi su 76.497 (11,8%)**. Con le certificazioni si sale. *Invincible* fuori per `gore` + TV-MA, *Stranger Things* fuori per TV-14, *Il Signore degli Anelli*, *Shrek* e *Inside Out* dentro.

Artefatto: `services/graph/data/keyword-bambini/blacklist.json` (13.788 byte, SHA256 `0808ec46…` (verificabile: copre blacklist+meta+provenienza, escluso il solo campo sha256)), **non versionato** perché `services/graph/data/` è in `.gitignore`: va copiato sul server a mano, come gli altri artefatti.
