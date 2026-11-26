const fs = require('fs');
const os = require('os');
const path = require('path');
const { scriviAtomicoSync, scriviAtomico } = require('../src/infra/atomicWrite');

const conTmpDir = (fn) => async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'atomic-'));
    try { await fn(dir); } finally { fs.rmSync(dir, { recursive: true, force: true }); }
};

describe('scriviAtomico', () => {
    test('scrive il contenuto e non lascia temporanei in giro', conTmpDir((dir) => {
        const target = path.join(dir, 'a.json');
        scriviAtomicoSync(target, '{"a":1}');
        expect(fs.readFileSync(target, 'utf8')).toBe('{"a":1}');
        expect(fs.readdirSync(dir)).toEqual(['a.json']);
    }));

    test('due scritture consecutive sullo stesso file non si scontrano (tmp unico)', conTmpDir((dir) => {
        const target = path.join(dir, 'b.json');
        scriviAtomicoSync(target, 'primo');
        scriviAtomicoSync(target, 'secondo');
        expect(fs.readFileSync(target, 'utf8')).toBe('secondo');
        expect(fs.readdirSync(dir).filter((n) => n.includes('.tmp'))).toHaveLength(0);
    }));

    test('un Buffer non viene ricodificato', conTmpDir((dir) => {
        const target = path.join(dir, 'c.bin');
        const buf = Buffer.from([0xc3, 0xb2, 0x00, 0xff]);
        scriviAtomicoSync(target, buf);
        expect(fs.readFileSync(target).equals(buf)).toBe(true);
    }));

    test('se la scrittura fallisce, il temporaneo viene rimosso e l’errore risale', conTmpDir((dir) => {
        const target = path.join(dir, 'd.json');
        // una cartella al posto del file: writeFileSync sul tmp non c'entra, si forza l'errore
        // rendendo il percorso finale una directory esistente non vuota -> il rename fallisce
        fs.mkdirSync(target);
        fs.writeFileSync(path.join(target, 'occupato'), 'x');
        expect(() => scriviAtomicoSync(target, 'contenuto')).toThrow();
        expect(fs.readdirSync(dir).filter((n) => n.includes('.tmp'))).toHaveLength(0);
    }));

    test('async: scrive, e non lascia temporanei', conTmpDir(async (dir) => {
        const target = path.join(dir, 'e.json');
        await scriviAtomico(target, '{"e":true}');
        expect(fs.readFileSync(target, 'utf8')).toBe('{"e":true}');
        expect(fs.readdirSync(dir)).toEqual(['e.json']);
    }));

    test('mkdir:false non crea la cartella e fallisce', conTmpDir((dir) => {
        const target = path.join(dir, 'mancante', 'f.json');
        expect(() => scriviAtomicoSync(target, 'x', { mkdir: false })).toThrow();
    }));

    test('il file esistente resta intatto se la scrittura fallisce prima del rename', conTmpDir((dir) => {
        const target = path.join(dir, 'g.json');
        scriviAtomicoSync(target, 'buono');
        const orig = fs.writeFileSync;
        fs.writeFileSync = () => { throw new Error('disco pieno'); };
        try {
            expect(() => scriviAtomicoSync(target, 'nuovo')).toThrow('disco pieno');
        } finally {
            fs.writeFileSync = orig;
        }
        expect(fs.readFileSync(target, 'utf8')).toBe('buono');
    }));
});
