Status: resolved
Type: grilling
Blocked by: 05

# Filtri e diversificazione dopo la diffusione

## Question

Dopo la diffusione V45, quali vincoli si applicano alla lista di un cluster: filtro film/serie, deduplica di remake/recap/edizioni, penalità o cap morbidi per saga e autore? Il grafo deve conservare i ponti; la decisione riguarda solo l'ordinamento e la composizione degli scaffali, con fallback quando il filtro svuoterebbe la lista.

## Evidenza dal prototipo dei cluster

Il filtro di medium va applicato **al cluster, non al profilo**. Nel prototipo (ticket 05) il cluster
anime di `warnok` ha semi che sono tutte serie ma riceve raccomandazioni di soli lungometraggi, perché
il medium era dedotto dal profilo intero. Regola proposta: il medium dei candidati segue quello dei
semi del cluster, con `None` quando il cluster è misto.

Secondo elemento emerso: i cluster di franchise non sono annidati in una sola `collection_id` (MCU,
Jurassic, Apes ne occupano più di una), quindi un cap «per saga» basato sulla collezione TMDB non
basterà; serve un rilevatore di franchise più largo (collezione **oppure** regista+cast ricorrenti
nella stessa lista).


## Regole ereditate dal prototipo (misurate, da confermare in fase di contratto)

- **Medium per macro, non per profilo**: il cluster anime di `warnok` (semi tutte serie) riceveva solo
  lungometraggi perche il medium veniva dal profilo intero.
- **Dedupe di famiglia**: al massimo uno scaffale per famiglia, dove famiglia = collezione TMDB
  dominante; e scarto dello scaffale se il 50% dei suoi top-10 compare in un altro scaffale scelto.
  Nel prototipo questa regola non ha mai prodotto un duplicato su 8 profili.
- **Tetto di scaffale**: un macro oltre 40 semi non e uno scaffale. Con M=30 il vincolo e garantito
  per costruzione.
- **Recenza = `min_eta`** (il seme piu fresco del gruppo), non la mediana: la mediana spinge il gruppo
  piu fresco al rango 28 su 31.

## Esito

Dedup, filtro per medium e cap sono dentro `interessi.py` (clustering e chiusura); il grafo conserva i ponti, l'ordinamento li usa.
