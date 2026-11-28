# erdb-legion — ricetta dell'immagine `erdb-patch` (storica)

Gli script che hanno costruito una volta la cache poster con l'immagine patchata
(`erdb-patch:0.7.5`) sono stati rimossi: il percorso attuale è `src/posters/erdb/build.js`
(CLI in `scripts/erdb-builder/build.js`, coperto da test).

Restano qui le **patch** all'immagine upstream, che sono l'unico posto in cui è scritto come
quel binario è stato modificato (badge e formato). Servono solo se un giorno si deve
ricostruire `erdb-patch` a partire dall'immagine originale.

    git apply ops/erdb-legion/patch/erdb-badge.patch
    git apply ops/erdb-legion/patch/erdb-formato.patch
    docker build -t erdb-patch:0.7.5 .
