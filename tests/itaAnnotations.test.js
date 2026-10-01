/**
 * Test del lettore delle annotazioni ITA (contratto del ticket 04 della mappa doppiaggio-ita:
 * chiave (tipo, id), `true` doppiato, `null` indecisione, assenza di riga = false).
 * Offline: il file è una fixture temporanea, il percorso arriva da ITA_ANNOTATIONS_PATH.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const itaAnnotations = require('../src/data/itaAnnotations');

function withFile(content) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'doppiaggi-ita-'));
    const file = path.join(dir, 'ita_annotations.jsonl');
    if (content !== null) fs.writeFileSync(file, content, 'utf8');
    process.env.ITA_ANNOTATIONS_PATH = file;
    itaAnnotations.reset();
    return file;
}

afterEach(() => {
    delete process.env.ITA_ANNOTATIONS_PATH;
    itaAnnotations.reset();
});

describe('itaAnnotations - lettura delle annotazioni ITA', () => {
    test('i tre stati: true, null, e riga assente = false', async () => {
        withFile('{"t":"movie","id":5,"ita":true}\n' + '{"t":"tv","id":1399,"ita":null}\n');
        const snap = await itaAnnotations.getSnapshot({ force: true });

        expect(itaAnnotations.getStatus(snap, 'movie', 5)).toBe(true);
        expect(itaAnnotations.getStatus(snap, 'tv', 1399)).toBe(null);
        expect(itaAnnotations.getStatus(snap, 'movie', 999)).toBe(false); // riga assente = nessuna traccia
        expect(itaAnnotations.isDubbed(snap, 'movie', 5)).toBe(true);
        expect(itaAnnotations.isDubbed(snap, 'tv', 1399)).toBe(false); // `null` non produce badge
        expect(itaAnnotations.isDubbed(snap, 'movie', 999)).toBe(false);
        expect(snap.count).toBe(2);
        expect(snap.trueCount).toBe(1);
        expect(snap.nullCount).toBe(1);
    });

    test('il tipo fa parte della chiave (5920 è due opere diverse)', async () => {
        withFile('{"t":"movie","id":5920,"ita":true}\n');
        const snap = await itaAnnotations.getSnapshot({ force: true });

        expect(itaAnnotations.getStatus(snap, 'movie', 5920)).toBe(true);
        expect(itaAnnotations.getStatus(snap, 'tv', 5920)).toBe(false);
    });

    test('id stringa e numero danno la stessa chiave', async () => {
        withFile('{"t":"tv","id":"1399","ita":true}\n');
        const snap = await itaAnnotations.getSnapshot({ force: true });
        expect(itaAnnotations.isDubbed(snap, 'tv', 1399)).toBe(true);
        expect(itaAnnotations.isDubbed(snap, 'tv', '1399')).toBe(true);
    });

    test('file assente: snapshot vuoto, nessuna eccezione, nessun badge', async () => {
        withFile(null); // non lo creiamo
        const snap = await itaAnnotations.getSnapshot({ force: true });

        expect(snap.count).toBe(0);
        expect(snap.error).toBeTruthy(); // lo snapshot dichiara il motivo
        expect(itaAnnotations.isDubbed(snap, 'movie', 5)).toBe(false);
    });

    test('riga corrotta ignorata, il resto del file resta valido', async () => {
        withFile(
            '{"t":"movie","id":5,"ita":true}\n' +
            '{questo non è json}\n' +
            '{"t":"boh","id":7,"ita":true}\n' +
            '{"t":"tv","id":9,"ita":"forse"}\n' +
            '{"t":"tv","id":11,"ita":true}\n'
        );
        const snap = await itaAnnotations.getSnapshot({ force: true });

        expect(snap.count).toBe(2); // solo le righe valide entrano
        expect(itaAnnotations.isDubbed(snap, 'movie', 5)).toBe(true);
        expect(itaAnnotations.isDubbed(snap, 'tv', 11)).toBe(true);
        expect(itaAnnotations.isDubbed(snap, 'tv', 9)).toBe(false); // fuori contratto ≠ sì
    });

    test('cache con TTL: due letture senza force danno lo stesso oggetto', async () => {
        withFile('{"t":"movie","id":5,"ita":true}\n');

        const first = await itaAnnotations.getSnapshot({ force: true });
        const second = await itaAnnotations.getSnapshot();
        expect(second).toBe(first); // nessuna rilettura dentro il TTL

        const forced = await itaAnnotations.getSnapshot({ force: true });
        expect(forced).not.toBe(first); // force rilegge
    });

    test('un file riscritto si vede al giro dopo il force', async () => {
        const file = withFile('{"t":"movie","id":5,"ita":true}\n');
        await itaAnnotations.getSnapshot({ force: true });

        fs.writeFileSync(file, '{"t":"movie","id":5,"ita":null}\n', 'utf8');
        const snap = await itaAnnotations.getSnapshot({ force: true });

        expect(itaAnnotations.getStatus(snap, 'movie', 5)).toBe(null);
        expect(itaAnnotations.isDubbed(snap, 'movie', 5)).toBe(false);
    });
});
