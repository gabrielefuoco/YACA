# 39 — Il gate FUNZIONA (e lo strumento era il collo di bottiglia). Il co-amato no.

**Data**: 08/10/2026 · set curato portato a **105 sorgenti, 443 collegamenti** (erano 61/270)

## 1. Lo strumento: 44 sorgenti di NICCHIA scritte a mano

Il gate era risultato **non testabile** (7 sorgenti di nicchia, 1 link = +-14%). Causa: **bias del set
curato** — avevo scelto titoli famosi per agganciarli facilmente al catalogo.

Ho scritto **44 sorgenti di nicchia** (29-626 voti TMDB), tutte verificate presenti nel catalogo **con
le keyword**: avanguardia (Bunuel, Deren, Marker), formalismo francese (Bresson, Resnais, Dreyer),
modernismo italiano (Antonioni, Pasolini, Fellini), nuove ondate dell'est (Paradjanov, Chytilova,
Vlacil), nuovo cinema tedesco (Herzog), cinema cubano/sovietico, horror e giallo italiano (Bava, Fulci,
Argento, Avati). **175 collegamenti nuovi, 44 falsi amici.**

## 2. IL GATE E' VALIDATO

| config | tutti p3@10 | **nicchia** | resto |
|---|---|---|---|
| **pesi FISSI (come oggi)** | 30,5% (29/95) | **17,1%** (7/41) | 40,7% (22/54) |
| **GATE FORTE (nicchia: contenuto 0,2 · comportamento 1,0)** | **37,9%** (36/95) | **34,1%** (14/41) | 40,7% (22/54) |
| controllo UNIFORME (0,2/1,0 sempre) | 33,7% (32/95) | 34,1% (14/41) | **33,3%** (18/54) |

- **la nicchia RADDOPPIA**: 17,1% -> **34,1%** (+7 collegamenti su 41)
- **il resto non peggiora**: 40,7% -> 40,7%
- **il controllo uniforme e' peggiore** (33,7% contro 37,9%) perche' **danneggia il resto** (33,3%
  contro 40,7%): non e' il peso in se', e' **la scelta per query**. E' la prova che il gate e' un gate
  e non una semplice riponderazione.

**+7,4 punti sul set intero, +17 sulla nicchia.**

## 3. Perche' prima falliva (lezione)

Con 7 sorgenti di nicchia il test dava 14,3% contro 28,6% — **rumore**. Con 45 sorgenti lo stesso
identico meccanismo da' 34,1% contro 17,1% — **una vittoria netta**.

**"Non testabile" NON significa "non vero".** Il gate era corretto dal primo giorno; era lo **strumento**
a non avere risoluzione. La lezione operativa: quando una misura non discrimina, la prima ipotesi da
verificare e' che sia **il metro** a essere cieco, non l'idea a essere sbagliata.

## 4. Il co-amato (voti >= 4): PEGGIO. Previsione fallita.

| | baseline (tutti i voti) | **co-amato (voti >= 4)** |
|---|---|---|
| contenuto | 29,3% | **25,5%** |
| comportamento | 26,1% | **23,9%** |
| verifica (pari), con temi | **50,7%** | **41,0%** |

Avevo previsto che "co-amato" fosse piu' affilato di "co-visto". **E' falso**: filtrare ai voti alti
dimezza i dati, la co-occorrenza si dirada e il teacher si indebolisce. **Il volume batte l'affilatura.**
Previsione dichiarata e fallita: la riporto.

## 5. Lo scorer di produzione sul set completo

| | p3@10 | punteggio |
|---|---|---|
| **il nostro spazio (con gate)** | **37,9%** | ~51 |
| **scorer di produzione** | **9,1%** (17/187) | **7,4** |

**4,2 volte sui legami forti, ~7 volte sul punteggio.** E il dettaglio dei tipi dice cosa sa fare:
franchise **52,4%**, tutto il resto fra 0% e 3,1% (niche 3,1%, auteur 1,7%, mainstream 1,9%, era 0%,
cult 0%). **Lo scorer di produzione e' essenzialmente un riconoscitore di saghe.**

## 6. Stato e prossimi passi

| componente | stato |
|---|---|
| spazio (contenuto + comportamento + anno + saga + temi) | 40,7% sui "normali", 17,1% sulla nicchia |
| **+ gate** | **37,9% complessivo, 34,1% sulla nicchia** |
| co-amato (voti alti) | **chiuso** (peggiore) |
| Trakt bulk (related su scala, in background) | **1327+ file in cache**, in corso |

Il prossimo segnale nuovo e' quello in background: **i "related" di Trakt su scala** — la fonte che
avevamo misurato 4 volte piu' vicina al nostro set curato della co-visione MovieLens.
