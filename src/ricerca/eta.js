/**
 * src/ricerca/eta.js
 *
 * La fascia d'età di `eta`, tradotta in una delle chiavi che il filtro dell'indice conosce.
 *
 * Il dump mescola quattro sistemi di certificazione (italiano `T`/`VM14`/`14+`, americano
 * `G`/`PG-13`/`R`, televisivo `TV-MA`, più i `NR`): un confronto alfabetico non ha senso, quindi
 * l'indice confronta per **fascia** (`ETA_RANK` in `src/indice/filters.js`).
 *
 * Il difetto che questo modulo chiude: `eta 0-6` — la scrittura più naturale che esista per un
 * genitore — passava intatta fino al filtro, che la trattava come un'etichetta letterale
 * (`lower(content_rating) = '0-6'`) e restituiva zero titoli **senza dirlo**. Ora le forme
 * numeriche diventano la fascia che le copre, le forme note restano, il resto è un motivo.
 */

/** Le fasce canoniche, con l'età che coprono. Le chiavi sono quelle di `ETA_RANK`. */
const FASCE = Object.freeze([
    { nome: 'g', anni: 0 },
    { nome: '6+', anni: 6 },
    { nome: 'pg-13', anni: 13 },
    { nome: '14+', anni: 14 },
    { nome: 'r', anni: 17 },
    { nome: '18+', anni: 18 }
]);

/** Le etichette accettate così come sono (minuscolo: è la forma che il filtro confronta). */
const ETICHETTE = Object.freeze([
    'g', '6+', 't', 'pg', 'pg-13', '14+', 'vm14', 'r', '18+', 'vm18', 'nc-17'
]);

/**
 * @param {string|number|null} valore
 * @returns {{ eta: string|null, motivo: string|null }} `eta` è una chiave di `ETA_RANK`
 */
function interpretaEta(valore) {
    const scritto = String(valore === null || valore === undefined ? '' : valore)
        .trim()
        .toUpperCase()
        .replace(/\s+/g, '');
    if (!scritto) return { eta: null, motivo: 'eta_non_valida: (vuoto)' };

    // Forma già canonica («T», «VM14», «PG-13», «18+»): passa così com'è.
    const etichetta = scritto.toLowerCase();
    if (ETICHETTE.includes(etichetta)) return { eta: etichetta, motivo: null };

    // «0-6», «6-14», «3-7»: vale il limite superiore — «fino a 6 anni».
    const intervallo = scritto.match(/^([0-9]{1,2})[-–—]([0-9]{1,2})$/);
    const anni = intervallo ? Number(intervallo[2]) : (/^[0-9]{1,2}$/.test(scritto) ? Number(scritto) : null);
    if (anni === null) return { eta: null, motivo: `eta_non_valida: ${valore}` };

    // La fascia più stretta che copre quell'età: un bambino di 3 anni sta in «6+», uno di 12 in
    // «PG-13» (13), non in «6+».
    const fascia = FASCE.find(f => f.anni >= anni);
    if (!fascia) return { eta: null, motivo: `eta_non_valida: ${valore}` };
    return { eta: fascia.nome, motivo: null };
}

module.exports = { interpretaEta, FASCE, ETICHETTE };
