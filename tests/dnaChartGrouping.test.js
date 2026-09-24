const fs = require('fs');
const path = require('path');

let ts;
try {
    ts = require('../frontend/node_modules/typescript');
} catch (e) {
    try {
        ts = require('typescript');
    } catch (e2) {
        ts = require('C:/Users/gabri/APP/YACA/frontend/node_modules/typescript');
    }
}

describe('DNA Chart Grouping, Formatting & Rendering Tests', () => {
    let groupDnaItems;
    let formatDnaLabel;
    let calculatePercentage;
    let calculateDnaPercentages;
    let DnaBarChart;
    let ReactDOMServer;
    let React;

    beforeAll(() => {
        // 1. Transpile frontend/src/lib/dnaChart.ts
        const dnaChartPath = path.resolve(__dirname, '../frontend/src/lib/dnaChart.ts');
        expect(fs.existsSync(dnaChartPath)).toBe(true);

        const source = fs.readFileSync(dnaChartPath, 'utf8');
        const transpiled = ts.transpileModule(source, {
            compilerOptions: { module: ts.ModuleKind.CommonJS }
        });

        const customRequire = (id) => {
            if (id === 'react') {
                return require(path.resolve(__dirname, '../frontend/node_modules/react'));
            }
            if (id === 'react-dom/server') {
                return require(path.resolve(__dirname, '../frontend/node_modules/react-dom/server'));
            }
            try {
                return require(id);
            } catch (err) {
                return require(path.resolve(__dirname, '../frontend/node_modules', id));
            }
        };

        const mDna = { exports: {} };
        const fnDna = new Function('require', 'exports', 'module', transpiled.outputText);
        fnDna(customRequire, mDna.exports, mDna);

        groupDnaItems = mDna.exports.groupDnaItems;
        formatDnaLabel = mDna.exports.formatDnaLabel;
        calculatePercentage = mDna.exports.calculatePercentage;
        calculateDnaPercentages = mDna.exports.calculateDnaPercentages;

        expect(typeof groupDnaItems).toBe('function');
        expect(typeof formatDnaLabel).toBe('function');
        expect(typeof calculatePercentage).toBe('function');
        expect(typeof calculateDnaPercentages).toBe('function');

        // 2. Transpile and load frontend/src/components/dashboard/DnaBarChart.tsx
        const barChartPath = path.resolve(__dirname, '../frontend/src/components/dashboard/DnaBarChart.tsx');
        expect(fs.existsSync(barChartPath)).toBe(true);

        const barChartSource = fs.readFileSync(barChartPath, 'utf8');
        const transpiledBarChart = ts.transpileModule(barChartSource, {
            compilerOptions: {
                module: ts.ModuleKind.CommonJS,
                jsx: ts.JsxEmit.React,
                esModuleInterop: true
            }
        });

        const rawReact = customRequire('react');
        React = rawReact.default || rawReact;
        if (!React.default) React.default = React;

        ReactDOMServer = customRequire('react-dom/server');
        if (!ReactDOMServer.default) ReactDOMServer.default = ReactDOMServer;

        const mChart = { exports: {} };
        const customRequireChart = (id) => {
            if (id === '@/lib/dnaChart') return mDna.exports;
            if (id === 'react') return React;
            if (id === 'react-dom/server') return ReactDOMServer;
            return customRequire(id);
        };

        const fnChart = new Function('require', 'exports', 'module', transpiledBarChart.outputText);
        fnChart(customRequireChart, mChart.exports, mChart);

        DnaBarChart = mChart.exports.DnaBarChart || mChart.exports.default;
        expect(typeof DnaBarChart).toBe('function');
    });

    describe('1. formatDnaLabel sui casi sporchi e nomi corretti', () => {
        it('formatta correttamente "keyword:210024" in forma presentabile', () => {
            expect(formatDnaLabel('keyword:210024')).toBe('Keyword #210024');
        });

        it('formatta correttamente "network 49" in forma presentabile', () => {
            expect(formatDnaLabel('network 49')).toBe('Network #49');
        });

        it('gestisce stringa vuota o whitespace restituendo stringa vuota', () => {
            expect(formatDnaLabel('')).toBe('');
            expect(formatDnaLabel('   ')).toBe('');
            expect(formatDnaLabel(null)).toBe('');
            expect(formatDnaLabel(undefined)).toBe('');
        });

        it('preserva un nome buono senza alterarlo', () => {
            expect(formatDnaLabel('Animazione')).toBe('Animazione');
            expect(formatDnaLabel('Denzel Washington')).toBe('Denzel Washington');
            expect(formatDnaLabel('HBO')).toBe('HBO');
            expect(formatDnaLabel('Commedia')).toBe('Commedia');
        });

        it('formatta codici con prefisso a lettera singola (g:28, k:123, d:456, a:789, n:49, c:33)', () => {
            expect(formatDnaLabel('g:28')).toBe('Genere #28');
            expect(formatDnaLabel('k:123')).toBe('Keyword #123');
            expect(formatDnaLabel('d:456')).toBe('Regista #456');
            expect(formatDnaLabel('a:789')).toBe('Attore #789');
            expect(formatDnaLabel('n:49')).toBe('Network #49');
            expect(formatDnaLabel('c:33')).toBe('Casa #33');
        });

        it('formatta combinazioni prefisso spazio ID (Genere 28, Regista 10, Attore 20)', () => {
            expect(formatDnaLabel('Genere 28')).toBe('Genere #28');
            expect(formatDnaLabel('Regista 10')).toBe('Regista #10');
            expect(formatDnaLabel('Attore 20')).toBe('Attore #20');
        });

        it('usa rawKey come fallback quando il label è una stringa vuota', () => {
            expect(formatDnaLabel('', 'k:210024')).toBe('Keyword #210024');
            expect(formatDnaLabel(null, 'n:49')).toBe('Network #49');
        });
    });

    describe('2. Raggruppamento per categoria e assenza di sezioni fantasma', () => {
        it('raggruppa le voci nelle categorie attese nell ordine canonico', () => {
            const rawVector = {
                'g:16': 100,
                'k:364043': 60,
                'a:52263': 40,
                'c:33': 30,
                'n:49': 25,
            };

            const labelMap = {
                'g:16': 'Animazione',
                'k:364043': 'anime',
                'a:52263': 'Denzel Washington',
                'c:33': 'Universal Pictures',
                'n:49': 'HBO',
            };

            const groups = groupDnaItems(rawVector, (k) => labelMap[k]);

            expect(groups.length).toBe(5);
            expect(groups.map(g => g.id)).toEqual(['genres', 'keywords', 'people', 'companies', 'networks']);
            expect(groups[0].title).toBe('GENERI');
            expect(groups[1].title).toBe('KEYWORD');
            expect(groups[2].title).toBe('PERSONE');
            expect(groups[3].title).toBe('CASE DI PRODUZIONE');
            expect(groups[4].title).toBe('NETWORK');
        });

        it('una categoria vuota non produce sezioni fantasma', () => {
            // Solo generi e keyword nel profilo: niente persone, case o network
            const rawVector = {
                'g:16': 100,
                'g:35': 50,
                'k:12190': 40,
            };

            const groups = groupDnaItems(rawVector, (k) => k);

            expect(groups.length).toBe(2);
            expect(groups.some(g => g.id === 'people')).toBe(false);
            expect(groups.some(g => g.id === 'companies')).toBe(false);
            expect(groups.some(g => g.id === 'networks')).toBe(false);
            expect(groups.some(g => g.id === 'countries')).toBe(false);
            expect(groups.some(g => g.id === 'other')).toBe(false);
        });

        it('gestisce input nullo o vuoto restituendo array vuoto', () => {
            expect(groupDnaItems(null)).toEqual([]);
            expect(groupDnaItems(undefined)).toEqual([]);
            expect(groupDnaItems({})).toEqual([]);
            expect(groupDnaItems([])).toEqual([]);
        });
    });

    describe('3. Ordinamento decrescente e calcolo percentuali proporzionali', () => {
        it('ordina le voci dentro ogni categoria dalla più pesante alla più leggera', () => {
            const rawVector = {
                'g:18': 20,
                'g:16': 100,
                'g:35': 70,
                'g:28': 45,
            };

            const groups = groupDnaItems(rawVector);
            const genreGroup = groups.find(g => g.id === 'genres');
            expect(genreGroup).toBeDefined();

            const weights = genreGroup.items.map(i => i.weight);
            expect(weights).toEqual([100, 70, 45, 20]);
        });

        it('la voce più forte ottiene il 100% e le altre sono in proporzione (massimo 100%)', () => {
            const rawVector = {
                'g:16': 200, // Voce più forte in assoluto (100%)
                'g:35': 100, // 50%
                'k:121': 50,  // 25%
                'n:49': 20,  // 10%
            };

            const groups = groupDnaItems(rawVector);

            const allItems = groups.flatMap(g => g.items);
            const strongest = allItems.find(i => i.key === 'g:16');
            expect(strongest.percentage).toBe(100);

            const half = allItems.find(i => i.key === 'g:35');
            expect(half.percentage).toBe(50);

            const quarter = allItems.find(i => i.key === 'k:121');
            expect(quarter.percentage).toBe(25);

            const tenth = allItems.find(i => i.key === 'n:49');
            expect(tenth.percentage).toBe(10);

            // Nessuna percentuale supera il 100%
            allItems.forEach(item => {
                expect(item.percentage).toBeLessThanOrEqual(100);
                expect(item.percentage).toBeGreaterThanOrEqual(0);
            });
        });

        it('calculatePercentage gestisce correttamente pesi negativi o nulli', () => {
            expect(calculatePercentage(0, 100)).toBe(0);
            expect(calculatePercentage(50, 0)).toBe(0);
            expect(calculatePercentage(-10, 100)).toBe(0);
            expect(calculatePercentage(150, 100)).toBe(100); // capped at 100%
        });
    });

    describe('4. Render visivo SSR senza browser (react-dom/server) e ispezione HTML', () => {
        it('renderizza correttamente 5 categorie senza etichette numeriche grezze e salva l anteprima', () => {
            const compiledVectors = {
                V_final: {
                    'g:16': 100,
                    'g:35': 70,
                    'k:364043': 60,
                    'a:52263': 40,
                    'c:33': 30,
                    'n:49': 25,
                    'k:210024': 15, // Non risolto: deve apparire come "Keyword #210024"
                },
                idNames: {
                    '16': 'Animazione',
                    '35': 'Commedia',
                    '364043': 'anime',
                    '52263': 'Denzel Washington',
                    '33': 'Universal Pictures',
                    '49': 'HBO',
                }
            };

            const getDnaName = (vectorKey) => {
                const id = vectorKey.substring(2);
                if (compiledVectors.idNames[id]) {
                    return compiledVectors.idNames[id];
                }
                return formatDnaLabel(vectorKey);
            };

            const element = React.createElement(DnaBarChart, {
                compiledVectors,
                getDnaName,
            });

            const html = ReactDOMServer.renderToString(element);

            // 1. Verifiche di integrità dell'HTML
            expect(html).toContain('GENERI');
            expect(html).toContain('KEYWORD');
            expect(html).toContain('PERSONE');
            expect(html).toContain('CASE DI PRODUZIONE');
            expect(html).toContain('NETWORK');

            // 2. Presenza dei nomi risolti
            expect(html).toContain('Animazione');
            expect(html).toContain('Commedia');
            expect(html).toContain('anime');
            expect(html).toContain('Denzel Washington');
            expect(html).toContain('Universal Pictures');
            expect(html).toContain('HBO');

            // 3. Etichetta sporca non risolta convertita in formato presentabile
            expect(html).toContain('Keyword #210024');
            // MAI etichette numeriche grezze tipo "keyword:210024" o "k:210024" nel testo
            expect(html).not.toMatch(/>\s*keyword:210024\s*</);
            expect(html).not.toMatch(/>\s*k:210024\s*</);
            expect(html).not.toMatch(/>\s*network 49\s*</);

            // 4. Presenza delle percentuali attese
            expect(html).toContain('100%');
            expect(html).toContain('70%');
            expect(html).toContain('60%');
            expect(html).toContain('40%');
            expect(html).toContain('30%');
            expect(html).toContain('25%');
            expect(html).toContain('15%');

            // 5. Presenza di barre progressbar accessibili (7 elementi)
            const progressbarMatches = html.match(/role="progressbar"/g) || [];
            expect(progressbarMatches.length).toBe(7);

            // 6. Salvataggio preview HTML in .scratch/dna-chart-preview.html
            const scratchDir = path.resolve(__dirname, '../.scratch');
            if (!fs.existsSync(scratchDir)) {
                fs.mkdirSync(scratchDir, { recursive: true });
            }

            const previewHtml = `<!DOCTYPE html>
<html lang="it">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>YACA DNA Bar Chart Preview</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    body { background-color: #EED9B9; color: #5E0006; font-family: system-ui, -apple-system, sans-serif; padding: 2rem; }
    .bg-marrow-light\\/5 { background-color: rgba(94, 0, 6, 0.05); }
    .bg-marrow-light\\/10 { background-color: rgba(94, 0, 6, 0.10); }
    .border-marrow-light\\/5 { border-color: rgba(94, 0, 6, 0.05); }
    .border-marrow-light\\/10 { border-color: rgba(94, 0, 6, 0.10); }
    .text-marrow-deep { color: #4A0005; }
    .text-marrow-light\\/60 { color: rgba(94, 0, 6, 0.6); }
    .text-marrow-light\\/50 { color: rgba(94, 0, 6, 0.5); }
    .text-marrow-light\\/40 { color: rgba(94, 0, 6, 0.4); }
    .text-primary { color: #9B0F06; }
    .bg-gradient-to-r { background-image: linear-gradient(to right, #9B0F06, #D53E0F); }
  </style>
</head>
<body class="max-w-4xl mx-auto">
  <div class="mb-4">
    <h1 class="text-xl font-black uppercase tracking-wider text-marrow-deep">Preview SSR Componente DnaBarChart</h1>
    <p class="text-xs text-marrow-light/60">Generato per verifica visiva senza browser (Fixture a 5 categorie, pesi scalati).</p>
  </div>
  ${html}
</body>
</html>`;

            fs.writeFileSync(path.join(scratchDir, 'dna-chart-preview.html'), previewHtml, 'utf8');
            expect(fs.existsSync(path.join(scratchDir, 'dna-chart-preview.html'))).toBe(true);
        });
    });
});
