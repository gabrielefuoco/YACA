/**
 * src/ricerca/generi.js
 *
 * I 19 generi TMDB, con i nomi italiani e i sinonimi che la gente scrive davvero.
 *
 * Perché un modulo e non una tabella dentro il parser: gli stessi generi servono a tre posti —
 * la ricerca per genere della porta (`door.cerca`), il parser della sintassi (`generi`, `tema`) e
 * il compilatore. Se le tre copie divergono, `tema horror` e `tipo=genere&q=horror` rispondono
 * cose diverse e nessuno se ne accorge.
 *
 * `id` è l'id TMDB del genere (stabile, non cambia con la lingua).
 */

const { normalizza, distanza } = require('../infra/testo');

const GENERI_TMDB = Object.freeze([
    // `idTv` esiste solo dove TMDB usa un id diverso per le serie: Fantasy e Fantascienza sono
    // entrambi «Sci-Fi & Fantasy» (10765), Azione e Avventura «Action & Adventure» (10759), Guerra
    // «War & Politics» (10768). Gli altri id sono condivisi fra film e serie.
    { id: 28, idTv: 10759, nome: 'Azione', sinonimi: ['azione', 'azione e avventura'] },
    { id: 12, idTv: 10759, nome: 'Avventura', sinonimi: ['avventura', 'avventuroso'] },
    { id: 16, nome: 'Animazione', sinonimi: ['animazione', 'animato', 'cartoni', 'cartone', 'cartoni animati'] },
    { id: 35, nome: 'Commedia', sinonimi: ['commedia', 'comico', 'comiche', 'divertente'] },
    { id: 80, nome: 'Crime', sinonimi: ['crime', 'poliziesco', 'crimine', 'gangster', 'mafia'] },
    { id: 99, nome: 'Documentario', sinonimi: ['documentario', 'documentari', 'docu'] },
    { id: 18, nome: 'Dramma', sinonimi: ['dramma', 'drammatico', 'drama'] },
    { id: 10751, nome: 'Famiglia', sinonimi: ['famiglia', 'familiare', 'per famiglie', 'ragazzi'] },
    { id: 14, idTv: 10765, nome: 'Fantasy', sinonimi: ['fantasy', 'fantastico'] },
    { id: 36, nome: 'Storia', sinonimi: ['storia', 'storico', 'storici'] },
    { id: 27, nome: 'Horror', sinonimi: ['horror', 'orrore', 'spaventoso', 'paura'] },
    { id: 10402, nome: 'Musica', sinonimi: ['musica', 'musical', 'musicale'] },
    { id: 9648, nome: 'Mistero', sinonimi: ['mistero', 'misterioso', 'giallo'] },
    { id: 10749, nome: 'Romantico', sinonimi: ['romantico', 'romantici', 'romance', 'amore'] },
    { id: 878, idTv: 10765, nome: 'Fantascienza', sinonimi: ['fantascienza', 'sci-fi', 'scifi', 'fanta'] },
    { id: 10770, nome: 'Film TV', sinonimi: ['film tv', 'film per la tv', 'tv movie'] },
    { id: 53, nome: 'Thriller', sinonimi: ['thriller', 'suspense', 'tensione'] },
    { id: 10752, idTv: 10768, nome: 'Guerra', sinonimi: ['guerra', 'bellico', 'guerra e pace'] },
    { id: 37, nome: 'Western', sinonimi: ['western', 'spaghetti western'] }
]);

/**
 * Nome canonico o sinonimo → id del genere. `null` se non è un genere.
 *
 * `tipo` conta: per le serie alcuni generi hanno un altro id (vedi `idTv`).
 *
 * @param {string} nome
 * @param {{ tipo?: 'movie'|'tv'|'series' }} [opzioni]
 */
function genereDaNome(nome, { tipo = 'movie' } = {}) {
    const serie = tipo === 'series' || tipo === 'tv';
    const idDi = (genere) => (serie && genere.idTv ? genere.idTv : genere.id);
    const cercato = normalizza(nome);
    if (!cercato) return null;
    for (const genere of GENERI_TMDB) {
        if (normalizza(genere.nome) === cercato) return idDi(genere);
        if (genere.sinonimi.some(s => normalizza(s) === cercato)) return idDi(genere);
    }
    // Refuso (distanza ≤ 1): i nomi sono corti e pochi, e «horor» deve funzionare. La soglia
    // resta 1 perché a distanza 2 «storia» diventerebbe «storico» e viceversa.
    if (cercato.length < 4) return null;
    for (const genere of GENERI_TMDB) {
        if (distanza(cercato, normalizza(genere.nome), 1) <= 1) return idDi(genere);
        if (genere.sinonimi.some(s => distanza(cercato, normalizza(s), 1) <= 1)) return idDi(genere);
    }
    return null;
}

/** La lista per i consumatori che mostrano i generi (porta, form web): forma `{ id, name }`. */
function elencoGeneri() {
    return GENERI_TMDB.map(({ id, nome }) => ({ id, name: nome }));
}

module.exports = {
    GENERI_TMDB,
    genereDaNome,
    elencoGeneri
};
