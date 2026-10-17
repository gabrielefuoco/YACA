/**
 * GUARD TEST: Il client nomina solo il dominio (Ticket 11)
 *
 * Impedisce al client frontend di regredire tornando a nominare rotte infrastrutturali
 * o di riesporre logiche di orchestrazione interna.
 */
const fs = require('fs');
const path = require('path');

const FORBIDDEN_PATTERNS = [
    /\/api\/tmdb\b/,
    /\/api\/sync\b/,
    /\/api\/validate-/,
    /\/api\/clear-cache\b/,
    /\/api\/profiles\b/,
    /\/api\/stremio-auth\b/,
    /\/api\/stremio-addon-update\b/,
    /\/api\/preview-catalog\b/,
    /\/api\/check-user\b/,
    /\/trakt\/device\b/,
    /\/api\/user\/[a-zA-Z0-9_${]/,
    /\/api\/ai\/generate-merged-name\b/
];

function getAllSourceFiles(dir) {
    let results = [];
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            results = results.concat(getAllSourceFiles(fullPath));
        } else if (/\.(ts|tsx|js)$/.test(entry.name)) {
            results.push(fullPath);
        }
    }
    return results;
}

describe('Guardia architetturale: il client nomina solo il dominio (Ticket 11)', () => {
    test('nessun file in frontend/src contiene rotte infrastrutturali proibite', () => {
        const frontendSrc = path.join(__dirname, '..', 'frontend', 'src');
        const files = getAllSourceFiles(frontendSrc);
        const violations = [];

        for (const file of files) {
            const content = fs.readFileSync(file, 'utf8');
            const lines = content.split('\n');

            lines.forEach((line, index) => {
                const trimmed = line.trim();
                // Ignora commenti esplicativi di documentazione
                if (trimmed.startsWith('*') || trimmed.startsWith('//') || trimmed.startsWith('/*')) {
                    return;
                }

                for (const pattern of FORBIDDEN_PATTERNS) {
                    if (pattern.test(line)) {
                        violations.push({
                            file: path.relative(path.join(__dirname, '..'), file),
                            line: index + 1,
                            pattern: pattern.toString(),
                            text: trimmed
                        });
                    }
                }
            });
        }

        expect(violations).toEqual([]);
    });

    test('nessuna chiamata in frontend/src passa userId come parametro di query', () => {
        const frontendSrc = path.join(__dirname, '..', 'frontend', 'src');
        const files = getAllSourceFiles(frontendSrc);
        const violations = [];

        for (const file of files) {
            const content = fs.readFileSync(file, 'utf8');
            const lines = content.split('\n');

            lines.forEach((line, index) => {
                const trimmed = line.trim();
                if (trimmed.startsWith('*') || trimmed.startsWith('//') || trimmed.startsWith('/*')) {
                    return;
                }
                if (/[?&]userId=/.test(line)) {
                    violations.push({
                        file: path.relative(path.join(__dirname, '..'), file),
                        line: index + 1,
                        text: trimmed
                    });
                }
            });
        }

        expect(violations).toEqual([]);
    });
});
