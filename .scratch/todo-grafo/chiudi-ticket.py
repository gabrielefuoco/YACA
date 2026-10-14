"""chiudi-ticket.py — aggiorna lo Status dei ticket di `todo-grafo` e punta al report."""
import pathlib

D = pathlib.Path(__file__).resolve().parent / "issues"

ESITI = {
    "01": ("resolved",
        "TRE ACCUSE SU TRE FONDATE, e l'esperto aveva ragione anche sui numeri: la maschera taglia il "
        "76,3% degli archi DIR (23,7% tenuti invece del 76,4%). Una accusa pero' punta al posto "
        "sbagliato: `min_sim=0.12` non e' nel default di `bolle.py` (0,02) ma nel chiamante "
        "`10-vicinanza.py` — e li' e' vero, il grado mediano di CAST e' 0 contro 30 a 0,02. "
        "Il bug della potatura e' GRAVE: su 6.132 membri espulsi, 3.042 (49,6%) ricevevano una bolla "
        "diversa leggendo meta' triangolo; uno leggeva 0 vicini invece di 51. "
        "Trovati DUE bug in piu': (4) `costruisci_insiemi` calcola networks/paesi/studi e non li "
        "restituisce; (5) `production_countries` e' una lista di STRINGHE e `leggi()` scarta tutto "
        "cio' che non e' un dizionario — 34.331 titoli con un paese non angloamericano e 44.279 firme "
        "`pg:` persi in silenzio. Vedi `ricerche/01-bug.md`, `01-bug.py`, `01c-paesi.py`."),
    "02": ("resolved",
        "V8 SOSTITUISCE V7. Ricetta identica, solo le correzioni. Componenti che cambiano di 47 volte "
        "(CAST da 35.684 a 1.662.368 archi) e la partizione che NON si muove: 1.617 -> 1.625 bolle, "
        "mediana 33 identica, la piu' grossa 590 -> 552, purezza 0,943 -> 0,946. La struttura delle "
        "bolle assorbe gli errori dei componenti, e ora lo sappiamo per misura. Tre artefatti noti "
        "riparati: Star Trek Into Darkness esce dalla bolla di Star Wars, Star Trek: Discovery passa "
        "da La mummia/MacGyver a space opera TV, La storia infinita perde Rambo III e i film coi "
        "delfini. Una regressione: l'iyashikei si scioglie dentro la commedia romantica. "
        "18 sentinelle su 20 leggono un mondo nominabile, come V7. Vedi `ricerche/02-v8.md`."),
    "03": ("resolved",
        "6 artefatti su 6 fermati, zero falsi allarmi. Ma ci sono voluti QUATTRO contratti invece dei "
        "tre di §4, perche' il retro-test ha smascherato tre errori nei contratti stessi: "
        "`assert_ordine` misurava il verso sbagliato e dava il via libera proprio al bug di "
        "`verifica-popolare.py`; `assert_modello` chiedeva |r| > 1e-6, che non ferma niente; "
        "l'anti-pareggio guardava un asse solo e solo lo span, non i pareggi in testa. "
        "Resta una lacuna dichiarata: una classifica sparsa ma legittima non si ferma, perche' solo "
        "il chiamante sa quanti candidati dovrebbero avere un punteggio. "
        "Il tasso base applicato al caso che l'ha generato: lift 1,18x. Vedi `ricerche/03-contratti.md`."),
}

for chiave, (stato, esito) in ESITI.items():
    for f in sorted(D.glob(f"{chiave}-*.md")):
        t = f.read_text(encoding="utf-8")
        t = t.replace("Status: ready-for-agent", f"Status: {stato}", 1)
        if "## Esito" not in t:
            t = t.rstrip() + f"\n\n## Esito\n\n{esito}\n"
        f.write_text(t, encoding="utf-8")
        print(f"  {f.name}: {stato}")
