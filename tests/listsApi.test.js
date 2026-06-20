const request = require('supertest');
const express = require('express');

// Mock delle dipendenze
jest.mock('nanoid', () => ({
    nanoid: () => 'mock_123'
}));

jest.mock('../src/models/UserList', () => {
    const MockUserList = function(data) {
        Object.assign(this, data);
        this.save = jest.fn().mockResolvedValue(this);
    };
    MockUserList.find = jest.fn();
    MockUserList.findOne = jest.fn();
    MockUserList.deleteOne = jest.fn();
    return MockUserList;
});

jest.mock('../src/db/models/UserAccount', () => ({
    findOne: jest.fn()
}));

jest.mock('../src/db/models/AddonConfig', () => ({
    updateOne: jest.fn()
}));

// Mock validatore auth per evitare la logica dei cookie/jwt reale
jest.mock('../src/api/configure/validators', () => ({
    validateAuth: (req) => {
        req.user = { userId: 'test_user' };
    }
}));

const UserList = require('../src/models/UserList');
const UserAccount = require('../src/db/models/UserAccount');
const AddonConfig = require('../src/db/models/AddonConfig');
const listsRouter = require('../src/api/lists');

const app = express();
app.use(express.json());

// Monta il router
app.use('/api/lists', listsRouter);

describe('Lists API', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('GET /api/lists', () => {
        it('dovrebbe ritornare le liste dell\'utente', async () => {
            const mockLists = [{ listId: 'list_1', name: 'Mia Lista', owner: 'test_user' }];
            UserList.find.mockReturnValue({
                sort: jest.fn().mockReturnValue({
                    lean: jest.fn().mockResolvedValue(mockLists)
                })
            });

            const res = await request(app).get('/api/lists');
            expect(res.statusCode).toBe(200);
            expect(res.body.success).toBe(true);
            expect(res.body.lists).toEqual(mockLists);
            
            expect(UserList.find).toHaveBeenCalledWith({ owner: 'test_user' });
        });
    });

    describe('GET /api/lists/:listId', () => {
        it('dovrebbe ritornare una singola lista se trovata', async () => {
            const mockList = { listId: 'list_1', name: 'Mia Lista', owner: 'test_user' };
            UserList.findOne.mockReturnValue({
                lean: jest.fn().mockResolvedValue(mockList)
            });

            const res = await request(app).get('/api/lists/list_1');
            expect(res.statusCode).toBe(200);
            expect(res.body.success).toBe(true);
            expect(res.body.list).toEqual(mockList);

            expect(UserList.findOne).toHaveBeenCalledWith({ listId: 'list_1', owner: 'test_user' });
        });

        it('dovrebbe ritornare 404 se la lista non esiste', async () => {
            UserList.findOne.mockReturnValue({
                lean: jest.fn().mockResolvedValue(null)
            });

            const res = await request(app).get('/api/lists/list_not_found');
            expect(res.statusCode).toBe(404);
            expect(res.body.error).toBe('Lista non trovata.');
        });
    });

    describe('POST /api/lists', () => {
        it('dovrebbe creare una nuova lista manuale scartando elementi del tipo sbagliato', async () => {
            // Setup mock save behavior se serve
            const saveMock = jest.fn().mockResolvedValue(true);
            UserList.prototype.save = saveMock;

            const res = await request(app)
                .post('/api/lists')
                .send({
                    name: 'Nuova Lista',
                    type: 'movie',
                    items: [
                        { tmdbId: 1, type: 'movie' },
                        { tmdbId: 2, type: 'series' } // Questo dovrebbe essere scartato
                    ]
                });

            expect(res.statusCode).toBe(200);
            expect(res.body.success).toBe(true);
            expect(res.body.list.name).toBe('Nuova Lista');
            expect(res.body.list.type).toBe('movie');
            expect(res.body.list.items.length).toBe(1); // Solo un item di tipo 'movie' è stato mantenuto
            expect(res.body.list.items[0].tmdbId).toBe(1);
            expect(res.body.list.listId).toBe('list_mock_123'); // via nanoid mock
        });
    });

    describe('PUT /api/lists/:listId', () => {
        it('dovrebbe aggiornare una lista esistente filtrando correttamente gli item aggiunti', async () => {
            const mockList = { 
                listId: 'list_1', 
                name: 'Vecchia Lista', 
                type: 'series',
                owner: 'test_user',
                save: jest.fn().mockResolvedValue(true)
            };
            
            UserList.findOne.mockResolvedValue(mockList);

            const res = await request(app)
                .put('/api/lists/list_1')
                .send({
                    name: 'Nome Aggiornato',
                    items: [
                        { tmdbId: 10, type: 'movie' }, // Deve scartarlo
                        { tmdbId: 20, type: 'series' } // Deve tenerlo
                    ]
                });

            expect(res.statusCode).toBe(200);
            expect(res.body.success).toBe(true);
            expect(mockList.name).toBe('Nome Aggiornato');
            expect(mockList.items.length).toBe(1);
            expect(mockList.items[0].tmdbId).toBe(20);
            expect(mockList.save).toHaveBeenCalled();
        });
    });

    describe('DELETE /api/lists/:listId', () => {
        it('dovrebbe eliminare la lista e rimuovere il suo riferimento dai profili in AddonConfig', async () => {
            UserList.deleteOne.mockResolvedValue({ deletedCount: 1 });
            UserAccount.findOne.mockReturnValue({
                lean: jest.fn().mockResolvedValue({ userId: 'test_user', addonUuid: 'uuid_test' })
            });
            AddonConfig.updateOne.mockResolvedValue(true);

            const res = await request(app).delete('/api/lists/list_1');

            expect(res.statusCode).toBe(200);
            expect(res.body.success).toBe(true);
            
            expect(UserList.deleteOne).toHaveBeenCalledWith({ listId: 'list_1', owner: 'test_user' });
            expect(AddonConfig.updateOne).toHaveBeenCalledWith(
                { uuid: 'uuid_test' },
                { $pull: { 'profiles.$[].catalogs': { id: 'list_1' } } }
            );
        });
    });

    describe('POST /api/lists/:listId/clone', () => {
        it('dovrebbe clonare una lista esistente con nome aggiornato', async () => {
            const mockList = { 
                listId: 'list_orig', 
                name: 'Originale', 
                type: 'movie',
                sourceType: 'manual_items',
                items: [{ tmdbId: 5 }],
                owner: 'test_user'
            };
            UserList.findOne.mockReturnValue({
                lean: jest.fn().mockResolvedValue(mockList)
            });

            UserList.prototype.save = jest.fn().mockResolvedValue(true);

            const res = await request(app).post('/api/lists/list_orig/clone');

            expect(res.statusCode).toBe(200);
            expect(res.body.success).toBe(true);
            expect(res.body.list.name).toBe('Originale (Copia)');
            expect(res.body.list.listId).toBe('list_mock_123');
            expect(res.body.list.items).toEqual([{ tmdbId: 5 }]);
        });
    });

    describe('POST /api/lists/merge', () => {
        it('dovrebbe unire due liste scartando i duplicati e creare una nuova lista', async () => {
            const mockLists = [
                { listId: 'l_1', type: 'movie', items: [{ tmdbId: 10 }, { tmdbId: 20 }] },
                { listId: 'l_2', type: 'movie', items: [{ tmdbId: 20 }, { tmdbId: 30 }] }
            ];
            
            UserList.find.mockReturnValue({
                lean: jest.fn().mockResolvedValue(mockLists)
            });
            
            UserList.prototype.save = jest.fn().mockResolvedValue(true);

            const res = await request(app)
                .post('/api/lists/merge')
                .send({
                    sourceListIds: ['l_1', 'l_2'],
                    targetListName: 'Unione Custom'
                });

            expect(res.statusCode).toBe(200);
            expect(res.body.success).toBe(true);
            expect(res.body.list.name).toBe('Unione Custom');
            expect(res.body.list.type).toBe('movie');
            // Il tmdbId 20 è duplicato, quindi ci aspettiamo 3 item totali: 10, 20, 30
            expect(res.body.list.items.length).toBe(3);
            expect(res.body.list.listId).toBe('list_mock_123');
        });

        it('dovrebbe restituire errore 400 se si cerca di unire liste di tipo diverso', async () => {
            const mockLists = [
                { listId: 'l_1', type: 'movie', items: [] },
                { listId: 'l_2', type: 'series', items: [] }
            ];
            
            UserList.find.mockReturnValue({
                lean: jest.fn().mockResolvedValue(mockLists)
            });

            const res = await request(app)
                .post('/api/lists/merge')
                .send({
                    sourceListIds: ['l_1', 'l_2']
                });

            expect(res.statusCode).toBe(400);
            expect(res.body.error).toBe('Impossibile unire liste di tipo diverso (film e serie tv).');
        });
    });
});
