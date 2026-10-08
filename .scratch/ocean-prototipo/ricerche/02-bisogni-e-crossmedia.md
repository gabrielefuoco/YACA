# 02 — I «bisogni» dell'utente come gate, e il ponte film↔serie

**Data**: 08/10/2026 · **Tipo**: prototipo · **Mappa**: [../map.md](../map.md)
**Banco**: `sim-differenziazione.js`, `sim-gates.js` · dati reali (Atlas in sola lettura + parquet locale)

Nasce da una precisazione dell'utente: OCEAN non come intero DNA ma come **parte**, cioè una lente sui
*bisogni* (film lunghi o corti, novità o cose complesse, temi dominanti) che **aiuti a discriminare** e
impedisca la contaminazione fra profili (horror → niente emoji per bambini; serio → niente anime; anime →
niente live-action). Più un'ipotesi: **associare i film alle serie** sfruttando meglio il grafo.

---

## 1. «I suggerimenti sono quasi simili fra i profili»: vero solo a metà

**Metodo**: i 5 profili reali (V_final da Atlas) ordinano lo **stesso pool** (3.000 film + 1.500 serie più
popolari), tre varianti di punteggio. Jaccard della top-50 fra tutte le coppie di profili.

| punteggio | Jaccard medio fra profili |
|---|---|
| completo (generi + keyword + gerarchia) | **9,4%** (min 0%, max 41%) |
| **solo generi** | 8,9% (min 0%, **max 85%**) |
| solo keyword e gerarchia | 9,0% (min 1%, max 41%) |

E le liste **non** sono il popolare: 0-2% di sovrapposizione con i 50 titoli più popolari del pool.

Tre letture:

1. **La differenziazione esiste ed è forte**: 9,4% di sovrapposizione media significa che due profili
   dello stesso utente ricevono liste quasi disgiunte. Il dolore descritto non è «liste identiche».
2. **Dove vive la differenza**: con il *solo* genere due profili arrivano all'**85%** di sovrapposizione.
   Sono le keyword (e la gerarchia) a separare i profili — è quella la parte che va potenziata.
3. **La contaminazione è reale, e sta dentro il profilo**: il profilo `global` ha nel top-3 generi
   `16 Animazione`, e la sua top-50 risulta **44/50 titoli per bambini e 44/50 anime**. Il profilo
   «serio» (`0465f104`: Commedia/Dramma/Crime) ne prende **25/50**. Non è il grafo a sbagliare: è il
   **vettore del profilo** a essere composto così, e ciò che lo contiene oggi è la politica anime dei
   hero (`animePolicy`), non lo score. Un gate sui «bisogni» non risolverebbe questo: il rimedio sta
   nella composizione del vettore e nella politica di tipo.

## 2. I «bisogni» come gate: nessuna prova solida

**Metodo**: leave-out sulla storia reale (5 profili), il modello vede *k* titoli e deve recuperare i
nascosti in un pool di ~1.200 fra film e serie. Un gate è un moltiplicatore costruito **dai semi stessi**:
durata (`exp(-Δminuti/40)`), epoca (`exp(-Δanni/25)`), nicchia (affinità di rarità delle keyword), peso 0,35.
40 prove.

| semi k | base @50 | +durata | +epoca | +nicchia | tutti | base @200 | +durata | +epoca | +nicchia | tutti |
|---|---|---|---|---|---|---|---|---|---|---|
| 3 | 6,7% | 6,7% | 6,7% | 6,7% | 6,7% | 21,2% | 19,9% | 20,2% | 21,2% | 18,9% |
| 5 | 15,4% | **17,9%** | 16,7% | 15,4% | **17,9%** | 28,6% | **31,1%** | 23,4% | 28,6% | 25,9% |

**Lettura onesta**: a 3 semi i gate non fanno *nulla*; a 5 semi solo la **durata** ha segno positivo
coerente (@50 +2,5 punti, @200 +2,5). Epoca e nicchia sono incoerenti (l'epoca perde 5 punti @200), e
«tutti insieme» peggiora @200. Con 40 prove l'errore standard è di 3-5 punti: **questa non è una prova
che i bisogni aiutino**. La durata è l'unico candidato che merita un test più grande — e va notato che è
l'unico che il DNA non contiene affatto (il parquet ha `runtime`, il DNA no).

Conclusione provvisoria: **i «bisogni» come moltiplicatore dello score non sono la leva**, almeno non
misurati così. Se devono entrare, non è come gate sul punteggio.

## 3. Il ponte film↔serie: qui c'è segnale forte

**Metodo**: semi composti **solo da film** visti; si cerca fra le **serie** nascoste (pool di ~1.200
serie). Nessun bridge esplicito: solo lo spazio condiviso di keyword e gerarchia.

| misura | valore | caso casuale |
|---|---|---|
| recall@50 delle serie nascoste | **18,2%** | 4,1% |
| recall@200 delle serie nascoste | **57,6%** | — |

**4,4× sopra il caso.** Cioè: il gusto cinematografico **trasferisce** su quello seriale attraverso lo
spazio delle keyword già oggi, senza alcun modello nuovo e senza nessun legame dichiarato fra film e
serie. Questa è l'ipotesi dell'utente che i numeri confermano — ed è anche la più economica da mettere in
produzione, perché il grafo è già caldo: quello che manca è **usarlo** (seminare i cataloghi serie dai
segnali dei film, e viceversa).

## 4. Cosa cambia per la progettazione

1. **OCEAN come lente sui bisogni**: non da integrare come vettore (report 01) né come gate sul punteggio
   (qui). Se una dimensione entra, entra come **filtro/pavimento** (es. `runtime` come vincolo esplicito o
   fascia) e con una misura più grande alle spalle.
2. **La contaminazione non si cura con i bisogni**: si cura nella **composizione del vettore** (cosa pesa
   nel V_final di un profilo generale) e nella **politica di tipo** già esistente. Da misurare sui hero
   veri, non sul proxy.
3. **Il ponte film↔serie è la leva pronta**: 4,4× sopra il caso, zero costo di modello. Da verificare
   sulle liste servite (un catalogo «serie che continuano i tuoi film»).
4. **La domanda «quali elementi devono brillare» resta aperta**: va misurata la *nitidezza* della cima
   (quanto la top-50 sta sopra la mediana del pool) — oggi nessuno la misura.

## 5. Come si riproduce

```bash
node .scratch/ocean-prototipo/sim-differenziazione.js   # quanto si somigliano le liste dei 5 profili reali
node .scratch/ocean-prototipo/sim-gates.js              # gate durata/epoca/nicchia + cross-media film->serie
```
