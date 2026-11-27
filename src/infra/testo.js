/**
 * src/infra/testo.js
 *
 * La normalizzazione del testo, in un posto solo.
 *
 * Perché un modulo: la stessa trasformazione (minuscole, senza accenti, punteggiatura ridotta a
 * spazi) serve a quattro consumatori che **devono** normalizzare allo stesso modo — il parser della
 * sintassi, il lessico italiano, l'indice delle persone e il compilatore dei cataloghi. Se una copia
 * diverge, il nome che l'utente scrive non trova la riga che l'indice ha scritto, e non si vede:
 * era già successo con tre copie identiche in tre file.
 */

/** Minuscole, senza accenti, punteggiatura ridotta a spazio singolo. */
function normalizza(value) {
    return String(value || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/\p{Diacritic}/gu, '')
        .replace(/[^\p{L}\p{N}]+/gu, ' ')
        .trim();
}

/**
 * Distanza di Levenshtein con uscita anticipata: oltre `max` restituisce `max + 1`.
 * Vive qui perché la usano tre consumatori diversi (persone, concetti, generi): la stessa funzione.
 */
function distanza(a, b, max = 2) {
    const s = String(a || '');
    const t = String(b || '');
    if (s === t) return 0;
    if (Math.abs(s.length - t.length) > max) return max + 1;
    if (!s.length) return t.length <= max ? t.length : max + 1;
    if (!t.length) return s.length <= max ? s.length : max + 1;

    let precedente = Array.from({ length: t.length + 1 }, (_, i) => i);
    for (let i = 1; i <= s.length; i++) {
        const corrente = [i];
        let minimoRiga = corrente[0];
        for (let j = 1; j <= t.length; j++) {
            const costo = s[i - 1] === t[j - 1] ? 0 : 1;
            const valore = Math.min(precedente[j] + 1, corrente[j - 1] + 1, precedente[j - 1] + costo);
            corrente.push(valore);
            if (valore < minimoRiga) minimoRiga = valore;
        }
        if (minimoRiga > max) return max + 1;
        precedente = corrente;
    }
    return precedente[t.length] <= max ? precedente[t.length] : max + 1;
}

module.exports = { normalizza, distanza };
