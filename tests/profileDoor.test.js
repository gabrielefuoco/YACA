const mongoose = require('mongoose');
const {
    selettoriEffettivi,
    profiloDi,
    profiliDi,
    contestoDi,
    risolviProfiloAttivo,
    eliminaProfilo,
    creaProfilo,
    rinominaProfilo,
    duplicaProfilo
} = require('../src/profile');

jest.mock('../src/models/UserAccount');
jest.mock('../src/models/AddonConfig');
const UserAccount = require('../src/models/UserAccount');
const AddonConfig = require('../src/models/AddonConfig');

describe('Profile Module Door (Ticket 21)', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('selettoriEffettivi (pure function)', () => {
        it('returns neutral anime policy and default selectors for empty profile and request', () => {
            const result = selettoriEffettivi(null, null);
            expect(result).toEqual({
                anime: 'neutral'
            });
        });

        it('direct request selectors override profile settings', () => {
            const profile = {
                settings: {
                    typeSelectors: { anime: 'exclude', movie: true }
                }
            };
            const request = {
                typeSelectors: { anime: 'only', series: true }
            };
            const result = selettoriEffettivi(profile, request);
            expect(result).toEqual({
                anime: 'only',
                movie: true,
                series: true
            });
        });

        it('forces anime policy to neutral when kidsMode is active and no manual anime selector is set', () => {
            const profile = {
                settings: {
                    kidsMode: true
                },
                compiledVectors: {
                    V_final: { 'g:16': 5, 'g:18': 95 } // would be exclude in adult mode
                }
            };
            const result = selettoriEffettivi(profile, {});
            expect(result.anime).toBe('neutral');

            const profileAdult = {
                settings: {},
                compiledVectors: {
                    V_final: { 'g:16': 5, 'g:18': 95 }
                }
            };
            const reqKids = { kidsMode: true };
            const resultKids = selettoriEffettivi(profileAdult, reqKids);
            expect(resultKids.anime).toBe('neutral');
        });

        it('deduces anime policy from DNA when no manual selector exists', () => {
            // Animation quota >= 0.60 -> 'only'
            const profileHighAnime = {
                settings: {},
                compiledVectors: {
                    V_final: new Map([
                        ['g:16', 70],
                        ['g:18', 30]
                    ])
                }
            };
            expect(selettoriEffettivi(profileHighAnime, null).anime).toBe('only');

            // Animation quota < 0.10 -> 'exclude'
            const profileLowAnime = {
                settings: {},
                compiledVectors: {
                    V_final: {
                        'g:16': 5,
                        'g:18': 95
                    }
                }
            };
            expect(selettoriEffettivi(profileLowAnime, null).anime).toBe('exclude');
        });
    });

    describe('profiloDi (raw profile)', () => {
        it('returns raw profile without modifying or calculating effective fields', async () => {
            UserAccount.findOne.mockReturnValue({
                lean: jest.fn().mockResolvedValue({ userId: 'u1', addonUuid: 'uuid-1' })
            });
            AddonConfig.findOne.mockReturnValue({
                lean: jest.fn().mockResolvedValue({
                    uuid: 'uuid-1',
                    profiles: [
                        { id: 'global', name: 'Generale', settings: { kidsMode: false, typeSelectors: { anime: 'only' } } },
                        { id: 'kids', name: 'Bambini', settings: { kidsMode: true } }
                    ]
                })
            });

            const raw = await profiloDi({ userId: 'u1', profileId: 'kids' });
            expect(raw.id).toBe('kids');
            expect(raw.name).toBe('Bambini');
            expect(raw.settings.kidsMode).toBe(true);
            // It is raw: selettoriEffettivi is NOT computed inside profiloDi
            expect(raw.selettoriEffettivi).toBeUndefined();
        });

        it('falls back to global profile if user has no profiles', async () => {
            UserAccount.findOne.mockReturnValue({
                lean: jest.fn().mockResolvedValue({ userId: 'u1', addonUuid: 'uuid-1' })
            });
            AddonConfig.findOne.mockReturnValue({
                lean: jest.fn().mockResolvedValue({
                    uuid: 'uuid-1',
                    profiles: []
                })
            });

            const raw = await profiloDi({ userId: 'u1', profileId: 'non-existent' });
            expect(raw.id).toBe('global');
            expect(raw.name).toBe('Generale');
        });
    });

    describe('contestoDi ({ userId, profileId?, richiesta? })', () => {
        it('produces the full descending context with 6 properties', async () => {
            UserAccount.findOne.mockReturnValue({
                lean: jest.fn().mockResolvedValue({ userId: 'u1', addonUuid: 'uuid-abc' })
            });
            AddonConfig.findOne.mockReturnValue({
                lean: jest.fn().mockResolvedValue({
                    uuid: 'uuid-abc',
                    config: { activeProfileId: 'cinema' },
                    profiles: [
                        {
                            id: 'cinema',
                            name: 'Cinema',
                            settings: {
                                kidsMode: false,
                                typeSelectors: { anime: 'exclude' },
                                slider: { ocean_openness: 0.8 }
                            }
                        }
                    ]
                })
            });

            const ctx = await contestoDi({ userId: 'u1' });
            expect(ctx).toEqual({
                userId: 'u1',
                profileId: 'cinema',
                addonUuid: 'uuid-abc',
                selettoriEffettivi: {
                    anime: 'exclude'
                },
                kidsMode: false,
                slider: { ocean_openness: 0.8 }
            });
        });

        it('allows request to override kidsMode and selectors in context', async () => {
            UserAccount.findOne.mockReturnValue({
                lean: jest.fn().mockResolvedValue({ userId: 'u1', addonUuid: 'uuid-abc' })
            });
            AddonConfig.findOne.mockReturnValue({
                lean: jest.fn().mockResolvedValue({
                    uuid: 'uuid-abc',
                    profiles: [
                        {
                            id: 'global',
                            name: 'Generale',
                            settings: { kidsMode: false }
                        }
                    ]
                })
            });

            const ctx = await contestoDi({
                userId: 'u1',
                profileId: 'global',
                richiesta: { kidsMode: true, typeSelectors: { movie: true } }
            });

            expect(ctx.kidsMode).toBe(true);
            expect(ctx.selettoriEffettivi).toEqual({
                anime: 'neutral', // because kidsMode forces neutral in absence of manual anime selector
                movie: true
            });
        });
    });

    describe('Invariant «almeno uno» & commands', () => {
        it('profiliDi guarantees at least global profile exists', async () => {
            UserAccount.findOne.mockReturnValue({
                lean: jest.fn().mockResolvedValue({ userId: 'u1', addonUuid: 'uuid-1' })
            });
            AddonConfig.findOne.mockReturnValue({
                lean: jest.fn().mockResolvedValue({
                    uuid: 'uuid-1',
                    profiles: []
                })
            });

            const list = await profiliDi('u1');
            expect(list.length).toBeGreaterThanOrEqual(1);
            expect(list[0].id).toBe('global');
            expect(list[0].name).toBe('Generale');
        });

        it('eliminaProfilo refuses to delete the last remaining profile', async () => {
            UserAccount.findOne.mockReturnValue({
                lean: jest.fn().mockResolvedValue({ userId: 'u1', addonUuid: 'uuid-1' })
            });
            AddonConfig.findOne.mockResolvedValue({
                uuid: 'uuid-1',
                profiles: [{ id: 'global', name: 'Generale' }]
            });

            await expect(eliminaProfilo({ userId: 'u1', profileId: 'global' }))
                .rejects.toThrow(/almeno un profilo|last profile/i);
        });

        it('risolviProfiloAttivo collapses || "global" copies and returns a valid ID', () => {
            expect(risolviProfiloAttivo()).toBe('global');
            expect(risolviProfiloAttivo({})).toBe('global');
            expect(risolviProfiloAttivo({ activeProfileId: 'custom-1' })).toBe('custom-1');
            expect(risolviProfiloAttivo({
                addonConfig: { config: { activeProfileId: 'from-config' } }
            })).toBe('from-config');
            expect(risolviProfiloAttivo({
                addonConfig: { profiles: [{ id: 'first-prof' }] }
            })).toBe('first-prof');
        });

        it('GUARD TEST: only profile module manages profiles array mutations', async () => {
            UserAccount.findOne.mockReturnValue({
                lean: jest.fn().mockResolvedValue({ userId: 'u1', addonUuid: 'uuid-1' })
            });
            AddonConfig.findOne.mockReturnValue({
                uuid: 'uuid-1',
                profiles: [{ id: 'global', name: 'Generale' }]
            });
            AddonConfig.updateOne = jest.fn().mockResolvedValue({ modifiedCount: 1 });

            await creaProfilo({ userId: 'u1', profileData: { id: 'p2', name: 'Profilo 2' } });
            expect(AddonConfig.updateOne).toHaveBeenCalledWith(
                { uuid: 'uuid-1' },
                expect.objectContaining({
                    $push: expect.objectContaining({ profiles: expect.objectContaining({ id: 'p2' }) })
                }),
                { upsert: true }
            );
        });
    });
});
