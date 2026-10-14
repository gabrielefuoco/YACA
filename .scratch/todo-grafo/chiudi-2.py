"""chiudi-ticket.py — chiude i ticket 04-08 di `todo-grafo` e aggiorna la mappa.

Seconda parte: la prima (ticket 01-03) sta in `chiudi-1.py`. Qui si chiude il giro con i numeri che
conta, e si scrivono nella mappa le decisioni che valgono per chi viene dopo.
"""
import pathlib

D = pathlib.Path(__file__).resolve().parent
ISSUES = D / "issues"

ESITI = {
    "04": ("resolved",
        "336 bolle-serie — l'esperto ne diceva 349, e la differenza e' il criterio: io chiedo "
        "maggioranza di serie E almeno 5 titoli. 13.594 serie coperte, 122.314 termini (scartati "
        "177.628 con df=1), 1.315.955 valori. IL CONTROLLO DI LEGGIBILITA' PASSA: i centroidi "
        "nominano mondi veri — isekai su Tokyo MX, K-BL, K-drama su KBS2 (Reply 1988), famiglia "
        "reale britannica (Downton Abbey + Harry & Meghan), fantasy anime (Frieren). E si vedono "
        "`pa:JP`, `pa:KR`, `rt:kbs2`: il quinto bug del ticket 01 paga esattamente dove serviva. "
        "Due pesature dei membri (uniforme, per grado interno) da confrontare al ticket 05."),
    "05": ("resolved",
        "DA 2,2% A 35,3%. Voto diretto (coseno, leave-one-out esatto) sulle 336 bolle-serie: "
        "212/600, lift 85x per permutazione, kappa +0,351, scollegate 0,3%. Sui 506 casi con la "
        "bolla in gara: 41,9%. IL TETTO E' 84,3% e le 94 serie escluse sono 94/94 in bolle a "
        "MAGGIORANZA FILM: i casi cross-medium, che il vincolo di medium esclude e che §1.B.2 "
        "voleva recuperare. La pesatura per grado interno NON aiuta (28,7% contro 29,7%): si usa "
        "quella uniforme. E il report racconta i TRE numeri: 29,7% (senza normalizzare il "
        "centroide), 63,7% (leave-one-out incompleto, gonfiato), 35,3% (giusto)."),
    "06": ("resolved",
        "IL PONTE NON FUNZIONA, in nessuna delle due forme: 0,8% con lo studente dei film vero (la "
        "ricetta dell'esperto) e 2,5% con la mia versione, contro il 35,3% del diretto. La fusione "
        "peggiora sempre: lambda migliore 0. I due voti concordano su 6 serie su 600, e il ponte ha "
        "ragione dove il diretto sbaglia 3 volte su 600. Meccanismo: lo studente dei film predice "
        "lo spazio CF, e la proiezione recupera la struttura dei METADATI, non il comportamento "
        "(0,0% di vicini in comune con CF, ticket 02 di inserimento). Il ponte non porta "
        "un'informazione che il diretto non abbia."),
    "07": ("resolved",
        "Fatto e con la simmetria vera: 0 coppie asimmetriche. Il primo tentativo era sbagliato — "
        "sostituire il ponte piu' debole ne evince uno gia' simmetrizzato e lascia 2.264 asimmetrie; "
        "l'unione, come dice l'esperto, le azzera. §2.4 PASSA nei due versi: Guerre stellari (1313, "
        "film) e The Mandalorian (1090, serie) si vedono a vicenda. MA la mappa e' SATURA: 95,7% "
        "delle coppie adiacenti, grado mediano 798, rapporto 6°/7° vicino 1,074 — nessun ginocchio. "
        "Il difetto e' dell'ADIACENZA, non del peso: il peso mediano degli archi e' 0,0 e l'arco "
        "Star Wars-Mandalorian vale 22,4 (34% del massimo). La mappa va rifatta sul grafo pesato."),
    "08": ("resolved",
        "Congelato: V8 (1.625 bolle, mediana 33, purezza 0,946) + la mappa 6+2 + i centroidi + i "
        "contratti. Numeri onesti dell'inserimento: film 27,7% (0,0% scollegate), serie 35,3% "
        "(0,3%). L'esperto aveva ragione sui tre bug, sul congelamento, sulla dimensione delle "
        "bolle e sui metadati sprecati; NON aveva ragione sul ponte. Restano aperti: i 94 casi "
        "cross-medium (0% con entrambi i metodi, tetto 84,3%), la mappa pesata, e la prova "
        "end-to-end sul prodotto. `src/` non e' stato toccato."),
}

for chiave, (stato, esito) in ESITI.items():
    for f in sorted(ISSUES.glob(f"{chiave}-*.md")):
        t = f.read_text(encoding="utf-8")
        t = t.replace("Status: ready-for-agent", f"Status: {stato}", 1)
        if "## Esito" not in t:
            t = t.rstrip() + f"\n\n## Esito\n\n{esito}\n"
        f.write_text(t, encoding="utf-8")
        print(f"  {f.name}: {stato}")

# ---------------------------------------------------------------- la mappa
m = D / "map.md"
t = m.read_text(encoding="utf-8")
t = t.replace("## Not yet specified", """## Esito, 14/10/2026 — effort chiuso, 8 ticket su 8

**Le tre cose che restano da fare, in ordine di rapporto fra valore e costo:**

1. **La mappa pesata.** I 6+2 vanno costruiti sul grafo con una soglia di PESO, non sull'adiacenza
   binaria: l'adiacenza e' satura (95,7% delle coppie, grado mediano 798, rapporto 6°/7° = 1,074)
   ma il peso mediano degli archi e' 0,0 e le relazioni vere sono poche e pesanti.
2. **I 94 casi cross-medium.** 94 serie su 600 vivono in una bolla a maggioranza film e valgono 0%
   con ogni metodo, perche' il vincolo di medium le esclude. Il tetto del voto diretto e' 84,3%:
   c'e' spazio.
3. **`src/`**: i candidati sono il voto diretto sui centroidi (un coseno, nessun modello da
   riaddestrare) e i contratti. Nessuna riga di prodotto e' stata toccata.

**Il numero dell'effort: le serie passano da 2,2% a 35,3%** (212/600, lift 85x, kappa +0,351,
scollegate 0,3%). I film restano al 27,7% del ticket 04 di `inserimento`.

**Il ponte film->serie dell'esperto NON funziona**: 0,8% con la sua ricetta esatta, 2,5% con la mia,
contro il 35,3% del diretto. La fusione peggiora sempre, lambda migliore 0.

## Cosa ha trovato la verifica dei bug

Cinque, non tre. I tre dell'esperto sono tutti reali e il suo 76,3% era esatto al decimale; il quarto
e' che `costruisci_insiemi` calcola `networks`, paesi e studi e non li restituisce; il quinto — il piu'
grosso — e' che `production_countries` e' una lista di STRINGHE e `leggi()` scarta in silenzio tutto
cio' che non e' un dizionario, perdendo 34.331 titoli con un paese non angloamericano e 44.279 firme
`pg:`. E' esattamente il segnale che serve alle serie, e adesso c'e'.

## Not yet specified""")
m.write_text(t, encoding="utf-8")
print(f"  map.md aggiornato")
