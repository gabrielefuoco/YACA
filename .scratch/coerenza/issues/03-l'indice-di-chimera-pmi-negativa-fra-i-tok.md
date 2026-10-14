Status: resolved
Type: task

# 03 — L'indice di chimera: PMI negativa fra i token dominanti

L'Indice di Chimera Interna (§1.B.2): per ogni bolla si prendono i 5 token tematici (`ge:` e `kw:`)
col peso più alto nel centroide V3 e si calcola la PMI di ogni coppia **sul catalogo intero**. Una
PMI negativa fra due descrittori di testa identifica una bolla-chimera: due mondi incompatibili
incollati da un terzo fattore (paese, regista, decennio).

Le chimere che il senior nomina leggendo `bolle-esempi.md`, tutte da verificare:
- **bolla 594** (spaghetti western): `kw:spaghetti western` + `ge:horror` — con dentro *Zeder*,
  *Demoni 3*, *Dabbe*;
- **bolla 289** (supereroi) col vicino 1145 (*Emmanuelle in Space 6 e 7* insieme a *Freedom Fighters*);
- **bolla 820** (il minestrone di Verity).

Esito: `03-chimere.py` + `ricerche/03-chimere.md`, con la classifica delle bolle-chimera peggiori.

## Esito

L'INDICE DI CHIMERA FUNZIONA, dopo un filtro che mancava. La prima esecuzione era inutilizzabile: le prime quindici «chimere» erano tutte bolle da 5-31 titoli con PMI -inf, cioe' le MIGLIORI — perche' in una bolla piccola i token di testa sono rari e non co-occorrono mai. Difetto mio, non dell'idea: mancava il filtro di supporto (df >= 30). Col filtro, 1.261 bolle giudicabili, e le piu' chimeriche sono TUTTE bolle grandi con generi incompatibili: `documentary + action + thriller` (92 titoli), `science fiction + documentary` (110), `horror + animation + action & adventure + thriller + sci-fi` (100). Le piu' coerenti sono nicchie strette (spoof/horror spoof, survival horror, evil spirit). CONFERMA il §5.2 del senior sulle bolle-continente. NON conferma la bolla 594: il suo difetto sta in pochi membri fuori posto su 132, e un indice sui 5 token di testa non puo' vederlo — serve una misura per membro, che il ticket 09 deve aggiungere.
