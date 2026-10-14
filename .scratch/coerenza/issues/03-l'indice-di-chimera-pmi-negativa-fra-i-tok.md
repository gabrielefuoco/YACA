Status: ready-for-agent
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
