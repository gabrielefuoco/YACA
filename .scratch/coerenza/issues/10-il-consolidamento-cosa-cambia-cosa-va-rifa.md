Status: resolved
Type: task

# 10 — Il consolidamento: cosa cambia, cosa va rifatto, cosa resta aperto

Chiudere l'effort con i numeri finali e le decisioni:

- quale partizione va in produzione (V8, V9, o V9 col sub-clustering), e con quale numero;
- la mappa nuova (peso normalizzato × coerenza) e la sua connettività;
- il collocatore: top-M, scoring ibrido, i due livelli, e i contratti di allineamento attivi;
- **l'arbitro**: se `Sim_trama` esiste e quanto discrimina; se no, cosa manca;
- i mondi frantumati: N_eff per le ancore, e quali si possono ricucire;
- cosa resta aperto per `src/`.

E una cosa da scrivere per forza: **quale delle cinque correzioni ha pagato e quale no.** Il senior
ne propone cinque; misurarne cinque e adottarne due è un buon risultato, purché si dica quali.
Esito: `ricerche/10-consolidamento.md` + la mappa aggiornata.

## Esito

Il consolidamento è in `ricerche/10-consolidamento.md`. Le decisioni: **V8** per la partizione; **V1
per la bolla e V3 per i dieci titoli** nel collocatore (due livelli, due pesature, misurate); la
mappa pesata per navigare e quella coerente per mostrare; i tre contratti relazionali attivi; il job
offline e ripartibile.

**Il numero corretto**: la collocazione delle serie è **63,0%**, non 35,3% — quel 35,3% era con V3.
Con V1, il conto completo (propria bolla + promosse) è **87,3%**.

**Le cinque correzioni del senior**: una confermata (il sub-clustering, con tre correzioni), una a
metà (l'ibrido coi top-5), due misurate false (il top-M, il coseno fra centroidi), una **ritirata**
(il §5.5). La diagnosi era migliore della terapia.

**Quattro leak in una sessione**, e l'ultimo commesso **dopo** aver scritto il contratto che lo ferma.
E **due volte il giudizio dell'utente** ha corretto una conclusione presa dalle metriche: *Verity* e
la bolla 820, in tutti e due i casi con i dati per non sbagliare già su disco.
