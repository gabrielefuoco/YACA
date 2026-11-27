/**
 * `regista` su una serie: creatori quando ci sono, registi come ripiego.
 *
 * Il difetto difeso: `regista christopher nolan` sulle serie restituiva null — quindi il motivo
 * `regista_non_risolto`, cioè «quel nome non esiste», che è falso. Ora il nome si risolve e la
 * pagina è vuota perché non ha creato serie: due cose diverse, e la seconda è vera.
 */
const mockRicerca = jest.fn();
jest.mock('../src/indice/people', () => ({
    // `risolutori` construisce un PeopleSearchClient: qui basta la sua unica porta.
    PeopleSearchClient: class { search(...args) { return mockRicerca(...args); } },
    distanza: () => 99
}));

const { risolviCrew } = require('../src/ricerca/risolutori');

describe('risolviCrew', () => {
    beforeEach(() => {
        mockRicerca.mockReset();
    });

    it('sui film cerca fra i registi e basta', () => {
        mockRicerca.mockReturnValue([{ tmdbId: 525 }]);
        expect(risolviCrew('christopher nolan', { type: 'movie' })).toEqual([525]);
        expect(mockRicerca).toHaveBeenCalledTimes(1);
        expect(mockRicerca.mock.calls[0][1]).toMatchObject({ ruolo: 'director' });
    });

    it('sulle serie cerca fra i creatori', () => {
        mockRicerca.mockReturnValue([{ tmdbId: 527 }]);
        expect(risolviCrew('nolan', { type: 'series' })).toEqual([527]);
        expect(mockRicerca.mock.calls[0][1]).toMatchObject({ ruolo: 'creator' });
    });

    it('se fra i creatori non c e, riprova come regista invece di dire nome sconosciuto', () => {
        mockRicerca.mockReturnValueOnce([]).mockReturnValueOnce([{ tmdbId: 525 }]);
        expect(risolviCrew('christopher nolan', { type: 'series' })).toEqual([525]);
        expect(mockRicerca).toHaveBeenCalledTimes(2);
        expect(mockRicerca.mock.calls[1][1]).toMatchObject({ ruolo: 'director' });
    });

    it('se non e nessuno dei due resta null (e il motivo lo dira)', () => {
        mockRicerca.mockReturnValue([]);
        expect(risolviCrew('pinco pallino', { type: 'series' })).toBeNull();
        expect(mockRicerca).toHaveBeenCalledTimes(2);
    });
});
