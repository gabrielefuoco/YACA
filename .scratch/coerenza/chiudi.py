"""chiudi.py — chiude i ticket fatti di `coerenza` e aggiorna la mappa."""
import pathlib

D = pathlib.Path(__file__).resolve().parent
ISSUES = D / "issues"

ESITI = {
    "01": ("resolved",
        "I TRE CONTRATTI RELAZIONALI, e funzionano: 4 casi su 4 fermati, zero falsi allarmi. "
        "`assert_loo_esatto` (il brute-force spot check di §4.1) ferma sia il centroide che include "
        "l'item sia l'auto-similarita' nei top-5 — cioe' esattamente i due numeri gonfiati di questa "
        "sessione (63,7% e 55,8%). `assert_universo` stampa il tetto accanto al risultato: l'88% "
        "sintetico esce sempre, e il caso lo calcola la permutazione. `assert_allineamento_spazi` "
        "ferma l'idf rigenerato e il vocabolario cambiato a mano — il bug in cui l'autore di questi "
        "contratti era caduto scrivendo `carica()`. Le impronte sono in `05-impronte.json` e il "
        "collocatore le verifica all'avvio. In `canone.py`.")

    ,
    "02": ("resolved",
        "N_eff FUNZIONA, MA MISURA UN'ALTRA COSA, e le previsioni del senior non tornano. Il film "
        "noir non ha N_eff 2,1: ha 35,35. Il psychological thriller non ha 18,5: ha 101,78. La "
        "direzione e' giusta (35 contro 102), la grandezza no. Il pattern: in cima ci sono FRANCHISE "
        "— super sentai 1,17, James Bond 1,23, Ultraman 1,41, Gundam 1,97, MCU 3,46 — in fondo MODI "
        "che tagliano il catalogo per costruzione (revenge 418, new york city 360, love 354). "
        "N_eff misura quanto un TAG coincide con un MONDO, non quanto un mondo e' coeso: le due cose "
        "coincidono solo per i tag che sono gia' dei mondi. La banda utile e' 5-25 (iyashikei 7,81, "
        "true crime 8,32, spaghetti western 11,39): li' c'e' un mondo imperfetto, ed e' li' che si "
        "ripara. Vedi `ricerche/02-03-coerenza.md`."),
    "03": ("resolved",
        "L'INDICE DI CHIMERA FUNZIONA, dopo un filtro che mancava. La prima esecuzione era "
        "inutilizzabile: le prime quindici «chimere» erano tutte bolle da 5-31 titoli con PMI -inf, "
        "cioe' le MIGLIORI — perche' in una bolla piccola i token di testa sono rari e non "
        "co-occorrono mai. Difetto mio, non dell'idea: mancava il filtro di supporto (df >= 30). "
        "Col filtro, 1.261 bolle giudicabili, e le piu' chimeriche sono TUTTE bolle grandi con "
        "generi incompatibili: `documentary + action + thriller` (92 titoli), `science fiction + "
        "documentary` (110), `horror + animation + action & adventure + thriller + sci-fi` (100). "
        "Le piu' coerenti sono nicchie strette (spoof/horror spoof, survival horror, evil spirit). "
        "CONFERMA il §5.2 del senior sulle bolle-continente. NON conferma la bolla 594: il suo "
        "difetto sta in pochi membri fuori posto su 132, e un indice sui 5 token di testa non puo' "
        "vederlo — serve una misura per membro, che il ticket 09 deve aggiungere."),
    "06": ("resolved",
        "DUE RISULTATI, uno cambia la diagnosi e uno la conferma in modo brutale. (1) IL TOP-M "
        "PEGGIORA: 32,0% -> 28,5% a M=15. E non c'e' nessuna distorsione geometrica da correggere: "
        "la correlazione fra dimensione della bolla e successo, con V3, e' **+0,003**. La curva "
        "100% -> 21% che il senior cita era sulla variante V0; con V3 la fascia 0-10 resta speciale "
        "(mondi di 5-8 film che si trovano per definizione) ma sopra i 10 titoli la dimensione non "
        "predice niente. (2) L'IBRIDO COI TOP-5 ESEMPLARI FUNZIONA, poco e dove serve: 33,2% "
        "contro 32,0%, con +7,7 punti sulle bolle sopra i 120 titoli e -2,2 su quelle fra 30 e 60. "
        "(3) E LA PRIMA MISURA DAVA 55,8%: era TUTTA DATA LEAKAGE — la serie in esame e' membro "
        "della sua bolla, e la sua auto-similarita' (1,0) entrava nei top-5. Azzerando la diagonale: "
        "33,2%. E' il terzo leak della sessione, ed e' esattamente quello che il contratto di §4.1 "
        "ferma. La curva che sembrava appiattita si e' ri-monotizzata. Vedi "
        "`ricerche/06-centroidi-geometria.md`."),
}

for chiave, (stato, esito) in ESITI.items():
    for f in sorted(ISSUES.glob(f"{chiave}-*.md")):
        t = f.read_text(encoding="utf-8")
        t = t.replace("Status: ready-for-agent", f"Status: {stato}", 1)
        if "## Esito" not in t:
            t = t.rstrip() + f"\n\n## Esito\n\n{esito.strip()}\n"
        f.write_text(t, encoding="utf-8")
        print(f"  {f.name}: {stato}")

m = D / "map.md"
t = m.read_text(encoding="utf-8")
t = t.replace("## Not yet specified", """## Eseguito, 14/10/2026 — 4 ticket su 10

**Le due metriche di coerenza ci sono e funzionano**, e la prima corregge il senior:

- **N_eff** misura quanto un **tag** coincide con un **mondo**, non quanto un mondo è coeso. In cima
  i franchise (super sentai 1,17 · Bond 1,23 · Ultraman 1,41), in fondo i modi che tagliano il
  catalogo (revenge 418 · love 354). Le previsioni del senior — noir 2,1, thriller 18,5 — sono
  sbagliate di un ordine di grandezza: misurano **35,35** e **101,78**. La banda utile è **5-25**.
- **L'indice di chimera** funziona (col filtro di supporto `df ≥ 30`, che mancava) e **conferma
  §5.2**: le più chimeriche sono tutte bolle grandi con generi incompatibili
  (`documentary + action + thriller`). Non conferma la bolla 594: serve una misura per membro.

**Il §5.1 va corretto**: il **top-M peggiora** (32,0% → 28,5%) e **non esiste** una distorsione
geometrica (con V3 la correlazione dimensione/successo è **+0,003**). L'**ibrido coi top-5 esemplari
funziona**: **33,2%** (+1,2), con **+7,7 punti** sulle bolle oltre i 120 titoli. E la prima misura
dava **55,8%**: era data leakage, il terzo della sessione.

**I tre contratti relazionali** di §4 fermano 4 casi su 4, zero falsi allarmi — e uno di loro ha
fermato il 55,8% la prima volta che è stato applicato.

## Restano: 04 (la coerenza sulla trama), 05 (le promozioni), 07 (i falsi vicini sulla mappa),
## 08 (V9), 09 (bolle-continente e chimere), 10 (consolidamento).

## Not yet specified""")
m.write_text(t, encoding="utf-8")
print("  map.md aggiornato")
