/**
 * tests/configurazione.test.js
 *
 * Test di unità per il modulo configurazione utente (Ticket 26).
 * Verifica:
 * 1. Risoluzione pura delle chiavi API (`chiaveEffettiva`) con precedenza:
 *    richiesta -> account.apiKeys[servizio] -> process.env -> null
 * 2. Chiave globale per i task offline (`chiaveGlobale`)
 * 3. Dichiarazione esplicita del motivo di degrado per assenza chiave (`motivoAssenzaChiave`, `motivoDegradoFeature`)
 * 4. La porta dell'account (`accountDi`, `accountPerAddonUuid`, `contaAccount`)
 * 5. Blocco unificato Trakt (`traktDi`) con pattern del ripiego (read fallback da apiKeys/traktStatus)
 * 6. Operazioni di stato e credenziali Trakt
 */

const {
    SERVIZI,
    DIPENDENZE_SERVIZI,
    chiaveEffettiva,
    chiaveGlobale,
    motivoAssenzaChiave,
    motivoDegradoFeature,
    accountDi,
    accountPerAddonUuid,
    contaAccount,
    traktDi,
    segnaTraktInRinnovo,
    segnaTraktOk,
    segnaTraktDaRiautorizzare,
    segnaTraktDegradato,
    segnaTraktNonConfigurato,
    salvaTraktCredenziali,
    disconnettiTrakt
} = require('../src/configurazione');

const UserAccount = require('../src/models/UserAccount');

jest.mock('../src/models/UserAccount', () => ({
    findOne: jest.fn(),
    findOneAndUpdate: jest.fn(),
    updateOne: jest.fn(),
    countDocuments: jest.fn()
}));

describe('Modulo Configurazione Utente (Ticket 26)', () => {
    describe('1. Risoluzione pura delle chiavi API (chiaveEffettiva)', () => {
        test('restituisce null se il servizio non è specificato', () => {
            expect(chiaveEffettiva()).toBeNull();
            expect(chiaveEffettiva({ servizio: '' })).toBeNull();
        });

        test('precedenza 1: la chiave esplicita nella richiesta vince su account ed env', () => {
            const key = chiaveEffettiva({
                richiesta: 'richiesta_key_123',
                account: { apiKeys: { tmdb: 'account_key_456' } },
                servizio: 'tmdb',
                env: { TMDB_API_KEY: 'env_key_789' }
            });
            expect(key).toBe('richiesta_key_123');
        });

        test('precedenza 2: la chiave dell account vince su env se richiesta è assente', () => {
            const key = chiaveEffettiva({
                richiesta: null,
                account: { apiKeys: { tmdb: 'account_key_456' } },
                servizio: 'tmdb',
                env: { TMDB_API_KEY: 'env_key_789' }
            });
            expect(key).toBe('account_key_456');
        });

        test('precedenza 3: la chiave in env viene usata se richiesta e account sono assenti', () => {
            const key = chiaveEffettiva({
                richiesta: '',
                account: { apiKeys: {} },
                servizio: 'tmdb',
                env: { TMDB_API_KEY: 'env_key_789' }
            });
            expect(key).toBe('env_key_789');
        });

        test('precedenza 4: restituisce null se nessuna sorgente fornisce la chiave', () => {
            const key = chiaveEffettiva({
                richiesta: '   ',
                account: null,
                servizio: 'tmdb',
                env: {}
            });
            expect(key).toBeNull();
        });

        test('ignora stringhe sentinella "null" o "undefined" passate nella richiesta', () => {
            const key = chiaveEffettiva({
                richiesta: 'null',
                account: { apiKeys: { mistral: 'valid_mistral_key' } },
                servizio: 'mistral',
                env: {}
            });
            expect(key).toBe('valid_mistral_key');
        });

        test('risolve token Trakt anche dal blocco unificato trakt.accessToken', () => {
            const key = chiaveEffettiva({
                account: { trakt: { accessToken: 'trakt_tok_abc' } },
                servizio: 'trakt',
                env: {}
            });
            expect(key).toBe('trakt_tok_abc');
        });
    });

    describe('2. Chiave Globale per task offline (chiaveGlobale)', () => {
        const originalEnv = process.env;

        beforeEach(() => {
            process.env = { ...originalEnv };
        });

        afterAll(() => {
            process.env = originalEnv;
        });

        test('restituisce la chiave globale per tmdb e mistral da process.env', () => {
            process.env.TMDB_API_KEY = 'global_tmdb';
            process.env.MISTRAL_API_KEY = 'global_mistral';

            expect(chiaveGlobale('tmdb')).toBe('global_tmdb');
            expect(chiaveGlobale('mistral')).toBe('global_mistral');
            expect(chiaveGlobale('sconosciuto')).toBeNull();
            expect(chiaveGlobale(null)).toBeNull();
        });
    });

    describe('3. Degrado dichiarato e motivi assenza chiave (Decisione 4)', () => {
        test('motivoAssenzaChiave formatta il codice standardizzato', () => {
            expect(motivoAssenzaChiave('mistral')).toBe('chiave_mistral_assente');
            expect(motivoAssenzaChiave('tmdb')).toBe('chiave_tmdb_assente');
            expect(motivoAssenzaChiave('stremio')).toBe('chiave_stremio_assente');
            expect(motivoAssenzaChiave('trakt')).toBe('chiave_trakt_assente');
            expect(motivoAssenzaChiave(null)).toBe('chiave_sconosciuta_assente');
        });

        test('motivoDegradoFeature mappa le feature note al motivo corretto', () => {
            expect(motivoDegradoFeature('ricerca_semantica')).toBe('chiave_mistral_assente');
            expect(motivoDegradoFeature('cataloghi_ai')).toBe('chiave_mistral_assente');
            expect(motivoDegradoFeature('daemon_dump_tmdb')).toBe('chiave_tmdb_assente');
            expect(motivoDegradoFeature('conversione_libreria')).toBe('chiave_tmdb_assente');
        });
    });

    describe('4. La Porta dell Account (accountDi, accountPerAddonUuid, contaAccount)', () => {
        beforeEach(() => {
            jest.clearAllMocks();
        });

        test('accountDi interroga UserAccount con lean()', async () => {
            const mockDoc = { userId: 'u1', addonUuid: 'uuid1' };
            UserAccount.findOne.mockReturnValueOnce({
                lean: jest.fn().mockResolvedValueOnce(mockDoc)
            });

            const res = await accountDi('u1');
            expect(res).toEqual(mockDoc);
            expect(UserAccount.findOne).toHaveBeenCalledWith({ userId: 'u1' });
        });

        test('accountDi ritorna null su input vuoto o errore', async () => {
            expect(await accountDi(null)).toBeNull();

            UserAccount.findOne.mockImplementationOnce(() => {
                throw new Error('Mongo error');
            });
            expect(await accountDi('u2')).toBeNull();
        });

        test('accountPerAddonUuid interroga per addonUuid', async () => {
            const mockDoc = { userId: 'u1', addonUuid: 'target-uuid' };
            UserAccount.findOne.mockReturnValueOnce({
                lean: jest.fn().mockResolvedValueOnce(mockDoc)
            });

            const res = await accountPerAddonUuid('target-uuid');
            expect(res).toEqual(mockDoc);
            expect(UserAccount.findOne).toHaveBeenCalledWith({ addonUuid: 'target-uuid' });
        });

        test('contaAccount interroga UserAccount.countDocuments()', async () => {
            UserAccount.countDocuments.mockResolvedValueOnce(42);
            const count = await contaAccount();
            expect(count).toBe(42);
        });
    });

    describe('5. Blocco Unificato Trakt e Ripiego di Lettura (Decisione 5)', () => {
        beforeEach(() => {
            jest.clearAllMocks();
        });

        test('traktDi legge dal nuovo blocco unificato se presente', async () => {
            const expiry = new Date();
            const mockAccount = {
                userId: 'user_new',
                trakt: {
                    accessToken: 'new_acc',
                    refreshToken: 'new_ref',
                    expiresAt: expiry,
                    status: { status: 'ok', refreshInProgress: false }
                }
            };
            UserAccount.findOne.mockReturnValueOnce({
                lean: jest.fn().mockResolvedValueOnce(mockAccount)
            });

            const res = await traktDi('user_new');
            expect(res).toEqual({
                accessToken: 'new_acc',
                refreshToken: 'new_ref',
                expiresAt: expiry,
                status: { status: 'ok', refreshInProgress: false }
            });
        });

        test('traktDi applica il ripiego di lettura (fallback) su apiKeys.trakt e traktStatus', async () => {
            const expiry = new Date();
            const mockLegacyAccount = {
                userId: 'user_legacy',
                apiKeys: {
                    trakt: 'legacy_acc',
                    traktRefreshToken: 'legacy_ref',
                    traktExpiresAt: expiry
                },
                traktStatus: {
                    status: 'requires_reauth',
                    lastError: 'Session expired'
                }
            };
            UserAccount.findOne.mockReturnValueOnce({
                lean: jest.fn().mockResolvedValueOnce(mockLegacyAccount)
            });

            const res = await traktDi('user_legacy');
            expect(res.accessToken).toBe('legacy_acc');
            expect(res.refreshToken).toBe('legacy_ref');
            expect(res.expiresAt).toBe(expiry);
            expect(res.status.status).toBe('requires_reauth');
            expect(res.status.lastError).toBe('Session expired');
        });

        test('segnaTraktInRinnovo aggiorna lo stato in renewal', async () => {
            UserAccount.updateOne.mockResolvedValueOnce({ acknowledged: true });
            await segnaTraktInRinnovo('user_lock');
            expect(UserAccount.updateOne).toHaveBeenCalledWith(
                { userId: 'user_lock' },
                expect.objectContaining({
                    $set: expect.objectContaining({
                        'trakt.status.refreshInProgress': true,
                        'traktStatus.refreshInProgress': true
                    })
                })
            );
        });

        test('segnaTraktOk aggiorna lo stato a ok', async () => {
            UserAccount.updateOne.mockResolvedValueOnce({ acknowledged: true });
            await segnaTraktOk('user_ok');
            expect(UserAccount.updateOne).toHaveBeenCalledWith(
                { userId: 'user_ok' },
                expect.objectContaining({
                    $set: expect.objectContaining({
                        'trakt.status.status': 'ok',
                        'traktStatus.status': 'ok'
                    })
                })
            );
        });

        test('disconnettiTrakt rimuove le chiavi Trakt', async () => {
            UserAccount.findOneAndUpdate.mockResolvedValueOnce({ userId: 'u_disc' });
            await disconnettiTrakt('u_disc');
            expect(UserAccount.findOneAndUpdate).toHaveBeenCalledWith(
                { userId: 'u_disc' },
                expect.objectContaining({
                    $unset: expect.objectContaining({
                        'apiKeys.trakt': 1,
                        'apiKeys.traktRefreshToken': 1
                    })
                }),
                { returnDocument: 'after' }
            );
        });
    });
});
