# Mappa — Profili come modalità e identità di account

## Destination

Cinque **modalità** di profilo predefinite e mutuamente esclusive su un **unico addon**: la configurazione (cursori, cataloghi attivi, creazioni) vive sull'account, il modo decide cosa si recupera e quali cataloghi esistono. Esplora diventa l'unico luogo dove i cataloghi si attivano; la dashboard si riorganizza attorno a account e modalità; l'aspetto smette di tradire il contenitore. Destination = **spec pronta da eseguire**, con le decisioni di modello chiuse.

## Notes

- Questo effort **porta esecuzione**, non solo decisioni: i punti visivi (ombre, top bar, logo, sfondo, Impostazioni) sono consegne, non bivi. Stanno nei ticket come `task`, non come `grilling`.
- Proseguire in italiano; comandi con `py` e `PYTHONPATH=services`.
- Riferimenti: `src/models/AddonConfig.js` (profili dentro `profiles[]`, `settings.typeSelectors`, `settings.kidsMode`, `customCatalogs` a livello config), `src/profile/door.js` (profilo attivo), `src/anime/politica.js` (politica anime: `only`/`exclude`/neutra), `src/pool/index.js` (`filtri.kids` passato al grafo), `src/stremio/{manifest,fingerprint,reconciler}.js`.
- Il motore V45 **non si tocca**: i modi sono filtri sui suoi ingressi e sulle sue uscite, non una nuova fisica.
- Il banco casi è un test set: non si allena e non si tara su di esso.
- Ogni ticket si chiude con la decisione scritta nel ticket, e una riga in *Decisions so far*.

## Decisions so far

- **Review a due assi + filtri prima del taglio.** La review ha trovato un bug reale (i cursori salvati due volte, nel profilo e nell'account) e un buco di contratto: `tipo` non è il medium, quindi ogni scaffale anime di serie veniva disegnato come film. I sei punti che potavano dopo il taglio ora filtrano prima: la watchlist bambini è passata da 0/20 a 20/20 titoli, dieci preset da 1 pieno e 9 corti a 10 pieni. E la verifica sul sistema vivo ha trovato ciò che 2081 test verdi non vedevano: la cache degli scaffali si riempiva un medium alla volta e il manifest restava senza serie — ora è per (profilo, medium).
- **Test: cancellati quelli che difendevano il rimosso.** Sette suite pretendevano i 20 cataloghi hero, i ruoli editoriali e i selettori di tipo cancellati di proposito, e sarebbero andate rosse su codice giusto. Due custodivano qualcosa di vero (un catalogo custom che compare una volta sola, un catalogo anime non appiattito a film) e sono state **riscritte** sulla nuova sorgente `config.cataloghi[modo]`. Suite: 209 verdi, 2070 test.

- [Il profilo diventa modalità: che forma ha il modello?](issues/01-modello-profilo-modo.md) — `modo` esplicito e immutabile, leve derivate non scrivibili, cinque caselle pigre, migrazione a tabula rasa, emoji unica cosa editabile, cataloghi attivi **per modo**, cursori per account, suggerimenti solo del modo attivo.
- [Un DNA o cinque: quali segnali sono dell'account e quali della modalità?](issues/02-dna-e-segnali.md) — un solo DNA per account su tutta la storia; il modo filtra l'uscita (e, solo per Bambini, anche i semi); `dna` sale su `AddonConfig`.
- [Cosa significa esattamente Film, Serie, Anime, Bambini](issues/03-filtri-dei-quattro-modi.md) — il filtro bambini è solo negativo e gira **dopo** il taglio; non esiste alcun dato di età nel canone; in modalità Anime i semi non-anime vengono **cancellati**, non usati; il filtro medium è già prima del taglio.
- [Un addon, cinque modalità: cosa succede al manifest quando cambi modo](issues/04-manifest-e-un-solo-addon.md) — il reconciler scrive URL **e** manifest nell'account Stremio; non esiste push verso il client, che rilegge all'avvio o al cambio di vista; i cataloghi rimossi spariscono puliti; le richieste residue ricevono 200 con lista vuota.
- [La lista nera delle keyword per Bambini](issues/10-lista-nera-keyword-bambini.md) — 400 keyword (62 semi + A + B 224), **decisione: tenerle tutte** accettando due falsi positivi misurati; più le certificazioni; **nessun filtro sui generi**. Esclude 9.042 titoli (11,8%). Artefatto congelato e copiato sul server.
- [I filtri agiscono prima del taglio, sempre](issues/11-filtri-prima-del-taglio.md) — anime e bambini ora mascherano i candidati **dentro la camminata**, prima del taglio; in modalità Anime la storia completa alimenta i semi; non-anime bit-identici; filtro bambini a costo zero (0,95 s).
- [Lo sfondo si muove: onde o bolle, senza diventare un videogioco](issues/08-sfondo-animato.md) — vince un **campo di colore continuo** calcolato per pixel (WebGL): nessuna forma disegnata, velocità 0.375, 30 fps, fermo a movimento ridotto. Applicato in produzione.

## Not yet specified

- **Cold start: i titoli nuovi nel grafo** (`17` genitore, figli `19`–`23`). Deciso il 10/11 in grilling: il titolo nuovo **deve** poter entrare, perché come seme è comportamento dell'utente; assente ≠ debole; non serve ri-chiudere (il runtime simmetrizza al caricamento); **67% del peso** della fusione è calcolabile dal contenuto. Figli: `19` lo scarto parla (il conteggio esiste già e viene buttato), `20` collocazione per contenuto **misurata** sui titoli esistenti (senza GPU, senza studente), `21` pipeline di collocazione, `22` come l'incremento arriva a chi serve, `23` lo studente come encoder (quinta fonte, non prerequisito). Separato: `18` rinominare il triangolo V45 (ha una guardia da non rompere). La spesa grossa — maestro allineato a 76.497 righe — resta confinata nel `23`.

- **Pulizia: quattro ticket aperti.** `13` codice morto del servizio (la pipeline editoriale calcola cataloghi per un `console.log`), `14` archivio del motore V10, `15` dati derivati del grafo (~39 GB, con la lista delle fonti intoccabili), `16` archivio di `graph_dense` e i 5 GB del venv. Ordine: 14 → 15 → 16, e la cancellazione dei dati vuole conferma esplicita.

- **Watchlist condivisa**: in modalità Bambini la watchlist dell'account contiene titoli di tutti i tipi. Cosa si mostra — solo i titoli ammessi, o nulla? E un bambino che aggiunge un titolo alla watchlist da Stremio, dove finisce.
- **Crescita di "Tutti"**: quando i cataloghi disponibili saranno molti, come si trovano (ricerca, filtri, preferiti).
- **Le creazioni e i modi**: una creazione di tipo film è attivabile solo in Film e Generale. Cosa succede se l'utente la crea in modalità Bambini e poi la cerca in Film — viene nascosta o etichettata?

## Out of scope

- Profili oltre i cinque tipi; profili personalizzati con nome libero.
- Famiglie con account separati o condivisione di un profilo fra più persone.
- Modifiche al motore di raccomandazione (V45), alla sua taratura o al banco casi.
- Nuove fonti dati o nuovi segnali di visione.
