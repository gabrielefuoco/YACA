"""fai-ticket.py — genera mappa e ticket di `inserimento`.
Le stringhe si compongono a lista di righe, senza triple-quote annidate.
"""
import pathlib

D = pathlib.Path(__file__).resolve().parent
(D / "issues").mkdir(exist_ok=True)
(D / "ricerche").mkdir(exist_ok=True)
(D / "log").mkdir(exist_ok=True)

MAPPA = "\n".join([
"# inserimento — come entra nel grafo un titolo appena uscito",
"",
"Aperta il 14/10/2026, su una misura: **il test di «Verity»**. `Verity` (id TMDB 1283515, uscito il",
"30/09/2026, 95 voti) e' nel dump TMDB ma **non ha una riga nel grafo**. E non e' un caso isolato:",
"**degli 836 film del 2026 presenti nel dump, solo 1 e' nel grafo.**",
"",
"La causa e' strutturale: **il grafo si costruisce dai comportamenti** (CF, B, TV, LIST), quindi chi",
"non ne ha non entra. Il prodotto serve un catalogo che si rinnova ogni giorno, e ogni uscita e'",
"**invisibile** — non sbagliata: invisibile.",
"",
"## Destination",
"",
"Un titolo nuovo deve poter entrare nel grafo **il giorno stesso**, con i soli metadati, e finire",
"**vicino ai titoli giusti**. Il banco di prova e' pronto e ha una risposta nota: **Verity deve",
"finire accanto a _Quello che non so di lei_** (The Woman in the Window: thriller psicologico tratto",
"da un romanzo) **e ai film di Michael Showalter** (Gli occhi di Tammy Faye, The Big Sick, The",
"Baxter, Spoiler Alert, Hello My Name Is Doris), che sono i suoi vicini veri per regia.",
"",
"## Cosa c'e' gia', e cosa manca",
"",
"Il pezzo e' **progettato e mai collegato**:",
"",
"| | |",
"|---|---|",
"| **CFst** — lo studente *metadati → comportamento* | esiste, copre tutti i 66.259 titoli, ed e' una **Ridge** (`keyword → Cf`, 128 uscite) |",
"| **il modello** | **NON e' salvato.** `cf-studente.npz` contiene solo l'output `P`. Il refit e' in `cf-edges.py:95` |",
"| **le feature `FX`** | costruite in `spazi-trakt.py` (righe ~117-197) mescolando keyword, generi, lingue, paesi, 3.000 persone, 800 collezioni, 600 compagnie, 1.500 sceneggiatori, budget, incassi, rating |",
"| **i vocabolari** | **NON sono salvati**: sono tagliati sul catalogo (`value_counts().head(N)`), quindi senza di essi un titolo nuovo non e' proiettabile |",
"| **il gating λ_cold** | progettato e verificato nel ticket 16 di `grafo-servibile` (i metadati ovunque costano −7,34 al @500), **mai applicato all'inserimento** |",
"| **il banco di prova** | `prova-verity.py` e `prova-verity-2.py`: già misurano che coi soli canali strutturali la collocazione e' sbagliata (bolla 818 = i film svedesi di *Beck*) |",
"",
"## Decisioni prese",
"",
"| | |",
"|---|---|",
"| **Il modello si salva, non si ricalcola** | rifittare la Ridge a ogni titolo nuovo e' assurdo: si salva `coef_`, `intercept_`, i vocabolari e l'IDF, e la proiezione diventa un prodotto scalare |",
"| **I vocabolari si congelano alle scadenze del catalogo** | una categoria che non esiste ancora (una lingua nuova, una compagnia nuova) **non ha colonna**: va deciso cosa farne, e va dichiarato |",
"| **Le feature non cambiano** | si riusa la costruzione di `spazi-trakt.py` **identica**, perche' il modello e' addestrato su quella. Cambiarla invalida il refit |",
"| **Il giudice e' la lettura, non la similarita'** | come per le bolle: il test di Verity vale se finisce accanto ai titoli giusti, non se il coseno e' alto |",
"| **Si misura anche il costo** | quanti secondi per inserire un titolo, e quanto pesa l'inserimento di 100 |",
"",
"## Non ancora specificato",
"",
"- **Chi decide che un titolo e' \"nuovo\"**: la data di uscita, l'assenza di archi, o entrambe.",
"- **Se il titolo entra nella partizione come bolla nuova** o si aggancia a una esistente: il ticket",
"  05 di `grafo-servibile` (potatura al nucleo) suggerisce di agganciarlo.",
"- **Se l'inserimento e' incrementale o batch**: con TMDB che cambia ogni giorno, la differenza conta.",
"- **Cosa fare dei titoli con pochissimi metadati** (0 keyword, cast vuoto): non e' un caso raro nei",
"  film indipendenti e nelle uscite direct-to-video.",
"",
"## Fuori scope",
"",
"- **La mappa a otto slot**: e' il ticket 10 di `bolle-nitrile`, si fa dopo questo effort.",
"- **Il banco nativo di YACA**: resta `wontfix` (gli utenti attuali sono test casuali).",
"- **La ricetta del recupero**: decisa nel ticket 24 di `grafo-servibile`, non si riapre.",
"- **YACA in produzione**: `src/` non si tocca.",
"",
"## Effort collegati",
"",
"- `.scratch/bolle-nitrile/` — la costruzione delle bolle (dove il titolo nuovo deve atterrare)",
"- `.scratch/grafo-servibile/` — il ticket 16 (gating λ_cold) e il 24 (la ricetta)",
])
(D / "map.md").write_text(MAPPA, encoding="utf-8")

T = []

T.append(("01-il-modello-dello-studente", "ready-for-agent", "task", None, [
 "Salvare il modello dello studente, e i vocabolari che gli servono.",
 "",
 "**Il fatto**: la collocazione di un titolo freddo e' una **Ridge** `FX -> Cf` addestrata in",
 "`cf-edges.py:95` con `alpha=10.0`, `solver='lsqr'`. Il modello **non e' salvato**: `cf-studente.npz`",
 "ha solo `P` (66.259 x 128).",
 "",
 "**Cosa fare**",
 "1. **Estrarre la costruzione di `FX`** da `spazi-trakt.py` (righe ~117-197) in un modulo riusabile",
 "   `features.py`, con la stessa identica logica. Non cambiarla: il modello e' addestrato su quella.",
 "2. **Salvare i vocabolari**: generi, lingue (25), paesi (40), persone (3.000), collezioni (800),",
 "   compagnie (600), sceneggiatori (1.500), lingue parlate (30), e il vocabolario delle keyword con",
 "   i pesi IDF. Oggi sono tagliati sul catalogo con `most_common(N)`.",
 "3. **Rifittare la Ridge** e salvare `coef_` (n_feature x 128), `intercept_` (128), e i parametri.",
 "4. **Verifica**: la `P` ricalcolata deve coincidere con `cf-studente.npz`.",
 "",
 "**Criterio di chiusura**",
 "- `P` ricalcolata == `P` salvata (o la differenza e' dichiarata e spiegata).",
 "- Un file `studente.npz` che contiene modello + vocabolari, e una funzione",
 "  `proietta(metadati) -> vettore(128)` che gira in millisecondi."])),

T.append(("02-la-collocazione-di-un-titolo-nuovo", "ready-for-agent", "task", "01", [
 "Dove va un titolo appena uscito: proiettarlo e cercargli i vicini.",
 "",
 "**Cosa fare**",
 "1. Metadati del titolo (dal dump TMDB, o dall'API per i titoli che il dump non ha).",
 "2. `v = proietta(metadati)` — il suo vettore nello spazio del comportamento.",
 "3. I vicini in quello spazio: i titoli piu' simili fra i 66.259.",
 "4. Voto: la bolla che riceve piu' vicini (nella partizione `bolle-nitrile-V7.npy`).",
 "5. **Il confronto coi canali strutturali**: keyword, cast, regia, generi. I due metodi devono",
 "   concordare, o va detto perche' no.",
 "",
 "**Criterio di chiusura**",
 "- Per Verity: il vicinato proiettato deve contenere _Quello che non so di lei_ e almeno due film di",
 "  Michael Showalter. Se non li contiene, il ticket si chiude **negativo** e lo si dichiara.",
 "- Il confronto proiettato / strutturale e' scritto con i numeri, non a parole."])),

T.append(("03-gli-archi-strutturali-e-il-gating", "ready-for-agent", "task", "02", [
 "Gli archi del titolo nuovo, e il gating del ticket 16.",
 "",
 "Un titolo senza comportamento collegato con gli archi strutturali a pieni pesi inquina: il ticket 16",
 "di `grafo-servibile` ha misurato che i metadati ovunque costano **-7,34 al @500**, e il rimedio e'",
 "il gating `lambda(i) = tau0 / (tau0 + d_behav(i))`: l'arco strutturale sopravvive se **almeno un",
 "estremo e' freddo**. Il plateau e' `tau0` in [1, 20], con `tau0 = 5` a +0,25 al @100.",
 "",
 "**Cosa fare**",
 "1. Costruire gli archi KW, CAST, DIR, PROD del titolo nuovo (gli stessi componenti, stessa soglia).",
 "2. Applicare il gating e misurare **quanti** archi sopravvivono e verso chi.",
 "3. Verificare che il titolo nuovo non finisca in una bolla per un solo arco forte (il caso",
 "   J.J. Abrams / Star Trek nella bolla Star Wars: la normalizzazione di riga gonfiava l'arco",
 "   solitario, ed e' il difetto D4 corretto in `bolle.py`).",
 "",
 "**Criterio di chiusura**",
 "- Gli archi del titolo nuovo sono elencati e leggibili (i primi 20, con il titolo dall'altra parte).",
 "- Il gating e' applicato, e l'effetto misurato sul banco di Verity: la collocazione cambia o no?"])),

T.append(("04-il-banco-di-prova", "ready-for-agent", "task", "03", [
 "Il banco: non solo Verity.",
 "",
 "**Il problema**: Verity da' una risposta nota, ma **una sola**. Un banco di un titolo non distingue un",
 "metodo da una coincidenza — ed e' la lezione dei ticket 06 e 22 di `grafo-servibile`.",
 "",
 "**Cosa fare**",
 "1. Scegliere **10-15 titoli recenti** dal dump TMDB che **non sono nel grafo**, coprendo i casi",
 "   patologici: un'uscita con cast stellare, una di nicchia senza keyword, una serie TV, un film",
 "   non-US, un documentario, un titolo con 0 keyword.",
 "2. Per ognuno: la collocazione proiettata, i 5 vicini, la bolla votata.",
 "3. **Leggere**: la bolla e' un mondo nominabile? il titolo ci sta?",
 "4. **Un controllo con i titoli vecchi**: togliere temporaneamente 100 titoli dal grafo, ricollocarli",
 "   con lo stesso metodo, e vedere se tornano nella bolla da cui sono stati tolti. **Questo e'",
 "   l'unico criterio misurabile**, e va fatto prima di fidarsi.",
 "",
 "**Criterio di chiusura**",
 "- Il controllo sui 100 titoli tolti: quanti tornano nella bolla di partenza? Il numero va scritto,",
 "  qualunque sia."])),

T.append(("05-la-tenuta-e-il-costo", "ready-for-agent", "task", "04", [
 "Inserire un titolo non deve rompere niente, e deve costare poco.",
 "",
 "**Cosa fare**",
 "1. **La tenuta**: il banco sonda di `bolle-nitrile` prima e dopo l'inserimento di 50 titoli nuovi.",
 "   Le bolle esistenti cambiano? L'intruso resta fuori?",
 "2. **Il costo**: quanti secondi per proiettare un titolo, quanti per 100, quanti per 1.000. E quanto",
 "   pesa in memoria il modello salvato.",
 "3. **La tenuta della partizione**: i titoli nuovi si agganciano a bolle esistenti (via potatura al",
 "   nucleo) o servono bolle nuove? Le bolle di 114-162 titoli della partizione V7 reggono altri",
 "   ingressi?",
 "4. **Cosa succede fra sei mesi**: con 10.000 titoli nuovi dentro, la partizione va rifatta o no?",
 "",
 "**Criterio di chiusura**",
 "- I tempi sono misurati, non stimati.",
 "- La risposta alla domanda \"si aggancia o crea una bolla\" e' scritta con un numero."])),

for slug, stato, tipo, dip, righe in T:
    h = ["# " + slug.split("-", 1)[1].replace("-", " "), "",
         "**Status**: `%s`" % stato, "**Type**: `%s`" % tipo]
    if dip:
        h.append("**Blocked by**: %s" % dip)
    h.append("")
    h.extend(righe)
    (D / "issues" / (slug + ".md")).write_text("\n".join(h) + "\n", encoding="utf-8")

print("mappa + %d ticket in %s" % (len(T), D))
for f in sorted((D / "issues").glob("*.md")):
    print("  %-42s %5d byte" % (f.name, len(f.read_text(encoding="utf-8"))))
