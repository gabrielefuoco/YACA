# Esplora: tre gruppi, un solo posto dove si attiva

Status: resolved
Type: prototype
Blocked by: 01

## Question

Esplora diventa l'unico luogo dove i cataloghi si attivano, con una gerarchia fissa: **Suggerimenti di visione & Watchlist** → **Le mie creazioni** → **Tutti**, e dentro "Tutti" i cataloghi raggruppati per tipo.

Serve un prototipo da guardare, non una descrizione, per decidere:

1. **La forma dei tre gruppi** — tre sezioni una sotto l'altra, tre schede (tab), o tre blocchi con intestazione e collasso? Il vincolo: i suggerimenti cambiano a ogni modalità, le creazioni sono stabili, "Tutti" è il catalogo dei cataloghi (crescerà). Un solo scroll con tre intestazioni è onesto ma diventa lungo; le schede evitano la lunghezza ma nascondono "Le mie creazioni" a chi non sa che esiste.
2. **Il selettore a pillola del tipo** — come si toglie l'ombra che oggi lo fa sembrare contenuto in un blocco. Il prototipo mostra prima/dopo, perché è una correzione visiva e va vista.
3. **Dentro "Tutti", il raggruppamento per tipo** — intestazioni per tipo (Film, Serie, Anime, Bambini) o filtro a pillola che riduce l'elenco? Con 5 modalità e decine di cataloghi, il filtro a pillola è più veloce ma nasconde; le intestazioni mostrano tutto ma sono lunghe.
4. **Un catalogo non servibile nella modalità corrente** — non compare (già deciso). Il prototipo deve mostrare cosa resta quando passi da Generale a Bambini: quanti cataloghi spariscono, e se il vuoto è accettabile o serve una spiegazione ("in questa modalità non ci sono cataloghi per bambini").
5. **Il widget di lista** — identico ai Cataloghi attivi: badge film/serie/anime accanto a preset/anime, niente pulsante Copia, niente descrizione lunga, niente badge col numero di filtri. Va disegnato una volta e usato in due posti, non due volte.
6. **"Le mie creazioni" vuoto** — cosa vede chi non ha mai creato un catalogo: un invito al Creator, o niente affatto?

Esito: un prototipo navigabile (o una sequenza di schermate) con i tre gruppi, il selettore corretto, il widget condiviso, e la lista delle decisioni prese guardandolo.

## Decisioni prese (prima del prototipo)

- **Watchlist in modalità Bambini**: si filtra come tutto il resto. Si vedono solo i titoli ammessi dal filtro; se non ne resta nessuno, la riga **non compare** (non si mostra una riga vuota).
- **Creazioni fuori dal loro tipo**: una creazione si vede in Esplora **solo dove è attivabile**. Una creazione film appare in Generale e in Film, non in Serie, Anime o Bambini. Niente voci spente con spiegazione: se non è servibile in quel modo, in quel modo non esiste.
- Conseguenza sui gruppi: "Le mie creazioni" può essere **vuoto per costruzione** in un modo (es. Bambini senza creazioni per bambini). In quel caso il gruppo sparisce, come per la watchlist.

## Esito

Esplora ha i tre gruppi (Raccomandazioni · Le mie creazioni · Tutti + categorie) in `ExplorePanel`; implementato nel giro `pillole` e corretto in `pillole-fix`.
