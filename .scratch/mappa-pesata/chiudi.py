"""chiudi.py — chiude i ticket di `mappa-pesata` e aggiorna la mappa dell'effort."""
import pathlib

D = pathlib.Path(__file__).resolve().parent
ISSUES = D / "issues"

ESITI = {
    "01": ("resolved",
        "LA MAPPA PESATA FUNZIONA, ma il ginocchio a 6 o 8 NON ESISTE. Il rapporto w_k/w_k+1 e' "
        "massimo a k=2 (1,218) e decresce sempre: 1,074 a 6, 1,082 a 8, 1,057 a 12. Questo grafo non "
        "ha una scala caratteristica: e' un continuum pesato, non una struttura a grappoli. Gli otto "
        "slot sono una convenzione di prodotto, e va dichiarato. I pesi: mediana 0,066, il 57,2% "
        "degli archi sotto 0,1, il top-8 di ogni bolla tiene il 40,9% del peso con l'1% degli archi. "
        "SULLE COSTRUZIONI: la soglia frammenta (al 99° percentile, 206 componenti: la stessa "
        "frammentazione che il ticket 23 di grafo-servibile aveva misurato col k-NN mutuo), il "
        "TOP-K PER BOLLA CON UNIONE tiene sempre UNA SOLA componente. E' quella la costruzione "
        "giusta: sparsa E navigabile."),
    "02": ("resolved",
        "Mappa 6+2 pesata: 20.918 archi (60 volte piu' sparsa dell'adiacenza), 1 sola componente "
        "(1.625/1.625), 0 coppie asimmetriche, e il ginocchio SULLA MAPPA sale da 1,074 a 1,24. "
        "I QUARTIERI SI LEGGONO, ed erano la cosa che il ticket 07 di todo-grafo non poteva "
        "verificare: il fantasy/avventura anni '80 (Goonies, Labyrinth) ha per vicino piu' pesante "
        "Indiana Jones e Stand by Me; il seinen anime (SPYxFAMILY, Golden Kamui) ha Monster, Death "
        "Note, Berserk; il K-BL (Equals, My Love Mix-Up!) ha HIStory e Your Name Engraved Herein; "
        "il K-drama (Reply 1988) ha Mr. Sunshine, Goblin, Alchemy of Souls. Con del rumore, ma le "
        "prime posizioni sono sistematicamente giuste."),
    "03": ("resolved",
        "IL VINCOLO DI MEDIUM NON COSTA NIENTE, e la premessa del ticket era un'inferenza sbagliata "
        "MIA. Con i centroidi anche delle 1.189 bolle-film, TUTTE e 600 le serie hanno la bolla vera "
        "fra i candidati (nel ticket 05 erano 506 fra le sole bolle-serie, e ne avevo dedotto che le "
        "94 fossero escluse 'a causa del medium': sono escluse da quella LISTA per definizione, non "
        "da quel METODO). Misurato: A (solo serie) 35,3%, B (tutte) 35,3%. Le 94 passano da 0,0% a "
        "10,6%, le 506 da 41,9% a 39,9%: netto zero. Le 94 sono serie intrappolate in MINESTRONI "
        "GENERICI DI FILM (65 bolle, da 16 a 151 titoli, mediana 68, col 26% di serie): non e' il "
        "medium a nasconderle, e' che il loro mondo non esiste come bolla. La regola C (il film "
        "ammesso solo se batte il migliore serie di un margine) da' +1% e va in produzione."),
    "04": ("resolved",
        "Il collocatore in una funzione: metadati -> token -> TF-IDF con vocabolario congelato -> "
        "coseno contro i 1.525 centroidi -> regola di medium. 8,7 ms per titolo, nessun modello. "
        "Gli esempi sono la valutazione giusta: The Tonight Show con Jimmy Fallon E con Johnny "
        "Carson finiscono nella STESSA bolla (coi Late Show); Spider-Man: Brand New Day coi Marvel; "
        "Resident Evil coi film di zombie; e VERITY nella bolla 820 con Inception, Fight Club, "
        "L'amore bugiardo - Gone Girl e Shutter Island: la risposta alla domanda da cui e' partita "
        "la sessione, arrivata per una via diversa (coseno invece di Ridge). Corretta una regola "
        "scritta a meta': il medium valeva solo per le serie, e un film poteva atterrare in una "
        "bolla di serie. La proposta per src/ e' un documento (7 MB di centroidi, 2 di vocabolario, "
        "130 KB di partizione, ~80 righe), con i quattro rischi e la domanda che conta: serve un "
        "collocatore in linea, o basta un job notturno? NESSUNA RIGA DI src/."),
}

for chiave, (stato, esito) in ESITI.items():
    for f in sorted(ISSUES.glob(f"{chiave}-*.md")):
        t = f.read_text(encoding="utf-8")
        t = t.replace("Status: ready-for-agent", f"Status: {stato}", 1)
        if "## Esito" not in t:
            t = t.rstrip() + f"\n\n## Esito\n\n{esito}\n"
        f.write_text(t, encoding="utf-8")
        print(f"  {f.name}: {stato}")

m = D / "map.md"
t = m.read_text(encoding="utf-8")
t = t.replace("## Not yet specified", """## Esito, 14/10/2026 — effort chiuso, 4 ticket su 4

**Le due cose aperte sono chiuse, e sono diventate tre scoperte:**

1. **La mappa pesata funziona** (1 componente, il ginocchio da 1,074 a 1,24) — ma **il ginocchio a 6
   o 8 non esiste**: il rapporto `w_k/w_k+1` e' massimo a k=2 e decresce sempre. Gli otto slot sono
   una **convenzione di prodotto**, non una struttura del dato. La costruzione giusta e' il
   **top-k per bolla con unione**: la soglia frammenta (206 componenti al 99° percentile, come il
   k-NN mutuo del ticket 23 di `grafo-servibile`), il top-k no.
2. **Il vincolo di medium non costa niente**: tolto, il totale resta 35,3% (le 94 guadagnano il
   10,6%, le 506 perdono 2 punti). Le 94 sono serie **intrappolate in minestroni generici di film**,
   non in mondi nascosti dal medium. La premessa del ticket era un'inferenza sbagliata mia.
3. **Il collocatore** e' una funzione da 8,7 ms con 7 MB di vettori e nessun modello: *Verity* ->
   *Gone Girl* ci arriva per una via diversa da quella del primo effort.

**La proposta per `src/` e' scritta e non eseguita.** Serve una decisione: un collocatore **in linea**
o un **job notturno**? La raccomandazione in linea non ha bisogno di questo modulo — ha bisogno della
partizione, che e' gia' precalcolata.

## Not yet specified""")
m.write_text(t, encoding="utf-8")
print("  map.md aggiornato")
