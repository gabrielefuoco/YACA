"""chiudi-ticket.py — aggiorna lo Status dei ticket di bolle-nitrile e punta al report."""
import pathlib
import re

D = pathlib.Path(__file__).resolve().parent / "issues"

# slug -> (status, una riga di esito che sta nel ticket)
ESITI = {
    "01-banco-sonda": ("resolved",
        "Lo strumento funziona e riproduce le letture a mano. Trova due patologie nuove: "
        "The Mandalorian con Il re leone ed Elf, Star Trek: Discovery con La mummia e MacGyver. "
        "Conferma che le 4 nicchie che il ticket 08 di grafo-servibile aveva dissolto erano perfette."),
    "02-tre-difetti-senza-parametri": ("resolved",
        "D2 (row<col su matrice asimmetrica) e' vero e grave, corretto. D3 (coseno L2) e' vero ma "
        "con la soglia 0,12 su CAST lo uccide (mediana del grado 0). D1 (n_iterations) e' vero ma "
        "IRRILEVANTE: 2 e 6 passate danno la stessa partizione. La lettura: sacchi meglio, "
        "due nicchie rotte (Watamote finisce tra i film horror), intruso NON risolto."),
    "03-shrinkage-di-riga": ("resolved",
        "Difetto vero e meccanismo dimostrato. Le bolle passano da 4.635 a 1.771, mediana da 11 a 30."),
    "04-chiusura-triangolare": ("resolved",
        "L'intervento piu' efficace. L'intruso esce: Star Wars resta solo con i suoi 14 film. "
        "Il meccanismo e' quello previsto, i triangoli non mentono. "
        "Il criterio del ticket 03 attribuiva questo esito allo shrinkage: era qui."),
    "05-potatura-al-nucleo": ("resolved",
        "A V4 non cambia quasi niente (1.413 bolle prima e dopo, 1.302 -> 1.295 con >=15): "
        "l'effetto catena non e' misurabile a questo stadio. Diventa aggressiva solo dopo il "
        "consenso (9.452 titoli espulsi a V6). Non ha mai rotto una nicchia: era il requisito."),
    "06-maschera-genere-e-COLL": ("resolved",
        "Taglia il 76,3% degli archi DIR (317.624 su 416.154) e il 39,5% di CAST. "
        "Percentuale enorme, e la lettura dice che e' benefica: e' qui che emergono i mondi veri. "
        "COLL da 1 a 3 non isolato, dichiarato."),
    "07-consenso-multivista": ("resolved",
        "PREMESSA NON VERIFICATA: solo l'8,6% degli archi ha due o piu' viste, fattore medio 0,992. "
        "Il bonus non premia quasi nulla, di fatto e' solo una penalita' su 1.161.496 archi."),
    "08-LIST-nelle-bolle": ("resolved",
        "IL RISULTATO MIGLIORE DEL GIRO. 1.617 bolle, mediana 34. Le cinque minestrone diventano "
        "film noir americano (114), fantasy anni '80 (37), commedia romantica (53), commedia sexy "
        "all'italiana (162). Le nicchie rotte dal ticket 02 guariscono. Tarkovsky diventa cinema "
        "d'autore europeo. 18 sentinelle su 20 leggono un mondo nominabile. "
        "MA i film e le serie di Star Wars restano in DUE bolle separate: il ponte cross-medium "
        "non viene dalle liste."),
    "09-CPM-e-risoluzione": ("resolved",
        "DEVIATO DAL TICKET e dichiarato: il ticket proponeva risoluzioni piu' basse, ma gli "
        "interventi hanno reso il grafo molto piu' grosso (da 5.297 bolle con mediana 9 a 1.430 con "
        "mediana 39). Provate CPM 0,02 e RB 60 (del ticket) piu' RB 200 (piu' alta della base)."),
    "10-mappa-nuova": ("ready-for-human",
        "Il criterio d'ingresso e' soddisfatto: il banco sonda dice che la partizione nuova e' "
        "migliore. Ma il ticket NON e' eseguito: ricostruire la mappa sulla partizione nuova e' un "
        "lavoro a se'. Materiale pronto: bolle-nitrile-V7.npy (1.617 bolle, mediana 34), "
        ".scratch/grafo-servibile/12-mappa.py e 23-connettivita.py, sonda.py. "
        "Domanda aperta vera: con 114 o 162 titoli in una bolla, un carosello ha ancora senso?"),
}

for slug, (stato, riga) in ESITI.items():
    f = D / f"{slug}.md"
    t = f.read_text(encoding="utf-8")
    t = re.sub(r"\*\*Status\*\*: `[a-z-]+`", "**Status**: `%s`" % stato, t, count=1)
    if "## Esito" not in t:
        t = t.rstrip() + "\n\n---\n\n## Esito\n\n" + riga + "\n"
    f.write_text(t, encoding="utf-8")
    print("  %-38s -> %s" % (slug, stato))
print("\n%d ticket aggiornati" % len(ESITI))
