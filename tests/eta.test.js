/**
 * `eta`: la fascia d'età. Il difetto difeso qui è `eta 0-6` — la scrittura più naturale per un
 * genitore — che arrivava al filtro come etichetta letterale e restituiva zero titoli in silenzio.
 */
const { interpretaEta } = require('../src/ricerca/eta');
const { analizza } = require('../src/ricerca/pianificatore');

describe('interpretaEta', () => {
    it('le etichette note passano così come sono', () => {
        expect(interpretaEta('T').eta).toBe('t');
        expect(interpretaEta('vm14').eta).toBe('vm14');
        expect(interpretaEta('PG-13').eta).toBe('pg-13');
        expect(interpretaEta('18+').eta).toBe('18+');
        expect(interpretaEta('G').eta).toBe('g');
        expect(interpretaEta('NC-17').eta).toBe('nc-17');
    });

    it('le fasce numeriche diventano quella che le copre', () => {
        // «fino a 6 anni» → la fascia dei 6+
        expect(interpretaEta('0-6').eta).toBe('6+');
        expect(interpretaEta('3-6').eta).toBe('6+');
        expect(interpretaEta('6').eta).toBe('6+');
        expect(interpretaEta('3').eta).toBe('6+');
        // un dodicenne non sta nei 6+
        expect(interpretaEta('0-12').eta).toBe('pg-13');
        expect(interpretaEta('12').eta).toBe('pg-13');
        expect(interpretaEta('6-14').eta).toBe('14+');
        expect(interpretaEta('18').eta).toBe('18+');
        expect(interpretaEta('0').eta).toBe('g');
    });

    it('quello che non è una fascia è un motivo, non una pagina vuota', () => {
        expect(interpretaEta('21')).toEqual({ eta: null, motivo: 'eta_non_valida: 21' });
        expect(interpretaEta('pippo').eta).toBeNull();
        expect(interpretaEta('').motivo).toContain('eta_non_valida');
        expect(interpretaEta(null).eta).toBeNull();
    });

    it('il parser la usa: `eta 0-6` non arriva più al filtro come stringa letterale', () => {
        expect(analizza('eta 0-6').grezzo.eta).toBe('6+');
        expect(analizza('eta 21').grezzo.eta).toBeNull();
        expect(analizza('eta 21').motivi).toContain('eta_non_valida: 21');
    });
});
