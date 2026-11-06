Status: ready-for-human
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
