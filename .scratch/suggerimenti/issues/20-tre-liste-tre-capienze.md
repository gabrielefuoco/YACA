Status: resolved
Type: misura

# LA CONCLUSIONE DI PRODOTTO E' RIBALTATA: si confrontano 30 slot con 10
**Prova, misurata**: `Motore.lista` su un utente vero restituisce `il_tuo_mondo` **10 titoli**,
`un_passo_fuori` **26**, `nicchia_di_qualita` **10**, `uscite_nuove` **3**. `titoli_di(vicini)` concatena
i primi 10 di `vicini[0]`, poi 10 di `vicini[1]`, poi 10 di `vicini[2]` — e non riordina fra i tre mondi.
Ma in `intero.py` la conclusione «*il quartiere vale piu' del mondo*: 31% in `un_passo_fuori` contro 20%
in `il_tuo_mondo`» confronta i **successi totali** di una lista da ~26-30 slot con una da 10.
A parita' di slot: `il_tuo_mondo` 20%/10 ≈ **2,0% per titolo mostrato**, `un_passo_fuori` 31%/30 ≈
**1,03%**. Cioe' **il tuo mondo e' quasi due volte piu' denso** — l'opposto di quello che ho ripetuto tutto
il giorno, e l'opposto della raccomandazione di prodotto («mostrare prima *un passo fuori*»).
**Fix, due parti**: (1) in `titoli_di`, quando raccoglie da piu' bolle per una sola lista, ordinare i
candidati per `-r[x]` e **fissare la capienza** come per le altre liste; (2) in `intero.py` stampare sia i
colpi totali **sia la precisione per titolo mostrato**, e rifare la misura. La raccomandazione di prodotto
va riscritta col numero nuovo, e l'handoff 6 e 7 corretti.

---

RISOLTO E RIMISURATO il 16/10/2026. (1) `righe_titoli` ora ordina i candidati per attivazione e li limita a `quanti` quando raccoglie da PIU' bolle: `un_passo_fuori` e' passata da 26-30 titoli a 10, come le altre. (2) `intero.py` stampa colpi, slot e **PER SLOT**. (3) E LA CONCLUSIONE DI PRODOTTO SI E' RIBALTATA:

    lista                 colpi  quota   slot  PER SLOT
    il_tuo_mondo            107 ( 22%)    835    12.81%
    un_passo_fuori          106 ( 22%)    998    10.62%
    uscite_nuove             49 ( 10%)    347    14.12%
    nicchia_di_qualita       42 (  9%)    974     4.31%

**`il_tuo_mondo` e' piu' denso di `un_passo_fuori`**, non il contrario. La raccomandazione «mostrare prima un passo fuori» era un artefatto del confronto fra 26-30 slot e 10. E la **nicchia di qualita' e' la lista piu' debole di tutte** (4,31% per slot, ed e' anche la piu' lunga): e' quella da ripensare, non quella da mettere in cima. Il rango intanto e' migliorato per gli altri fix: mediana 2 (era 3) e 66% entro le prime quattro posizioni (era 58%); il tempo e' sceso a 92 ms mediani (erano 147) e la precisione generale e' salita a **7,3%**. E anche i FATTORI DI TIPO hanno cambiato verdetto: con le liste corrette *spostano* (il banco ora dice «la calibrazione conta»), non «quasi niente» come quando le liste erano sbagliate.
