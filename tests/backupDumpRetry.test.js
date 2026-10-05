/**
 * Il timer di backup non può usare `withRetry` (è JavaScript, il giro è bash):
 * qui si prova davvero il ciclo di vita dello script `ops/yaca-backup.sh`,
 * con un `mongodump` finto che fa fallire il DNS solo al primo tentativo.
 *
 * È una prova reale del ramo, non una simulazione della sua logica: si esegue
 * lo script vero, con lo stub al posto del driver. Nessuna rete, nessun Atlas:
 * l'URI è finto e `mongodump`/`rclone` sono binari creati al volo in una cartella
 * temporanea che viene rimossa a fine test.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const SCRIPT = path.resolve(__dirname, '..', 'ops', 'yaca-backup.sh');
const BASH = process.platform === 'win32' ? 'bash.exe' : 'bash';

function bashDisponibile() {
    const probe = spawnSync(BASH, ['--version'], { encoding: 'utf8' });
    return probe.status === 0;
}

const SKIP = bashDisponibile() ? false : 'bash non disponibile su questa macchina';
const describeBackup = SKIP ? describe.skip : describe;

function scriviStub(dir, nome, contenuto) {
    const percorso = path.join(dir, nome);
    fs.writeFileSync(percorso, contenuto, { mode: 0o755 });
    return percorso;
}

function creaSandbox() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'yaca-backup-test-'));
    scriviStub(dir, 'mongodump', `#!/usr/bin/env bash
# Finto mongodump: fallisce con ESERVFAIL solo al primo tentativo, poi scrive.
STATO="${dir}/tentativi"
N=$(cat "$STATO" 2>/dev/null || echo 0)
N=$((N+1)); echo "$N" > "$STATO"
for arg in "$@"; do
  case "$arg" in
    --archive=*) ARCHIVE="\${arg#--archive=}" ;;
  esac
done
if [ "$N" -eq 1 ]; then
  echo "error parsing query: lookup _mongodb._tcp.shard-0.acme.mongodb.net: server misbehaving (ESERVFAIL)" >&2
  exit 1
fi
echo "dump finto" > "$ARCHIVE"
exit 0
`);
    scriviStub(dir, 'rclone', '#!/usr/bin/env bash\nexit 0\n');
    return dir;
}

function lanciaBackup(dir, extra = {}) {
    const env = {
        ...process.env,
        PATH: `${dir}${path.delimiter}${process.env.PATH}`,
        MONGODB_URI: 'mongodb://stub.invalid/db',
        DUMP_ATTESA_S: '0',
        DUMP_TENTATIVI: '3',
        R2_DESTINATION: 'stub:yaca-backups'
    };
    return spawnSync(BASH, [SCRIPT], { encoding: 'utf8', env: { ...env, ...extra.env } });
}

describeBackup('ops/yaca-backup.sh: un singhiozzo DNS non chiude il giro', () => {
    let dir;

    beforeAll(() => { dir = creaSandbox(); });
    afterAll(() => { fs.rmSync(dir, { recursive: true, force: true }); });

    it('completa al secondo tentativo e lo dichiara in una riga di log', () => {
        const esito = lanciaBackup(dir);

        expect(esito.status).toBe(0);
        expect(esito.stdout).toMatch(/tentativo 1\/3\): singhiozzo di rete o DNS, ritento fra 0s/);
        expect(esito.stdout).toMatch(/Dump generato con successo/);
        expect(esito.stdout).toMatch(/Backup completato con successo/);
        // due chiamate al driver: una persa, una buona
        expect(fs.readFileSync(path.join(dir, 'tentativi'), 'utf8').trim()).toBe('2');
    });

    it('chiude con un messaggio chiaro quando il fallimento non è un singhiozzo', () => {
        const soloFallimenti = fs.mkdtempSync(path.join(os.tmpdir(), 'yaca-backup-fail-'));
        try {
            scriviStub(soloFallimenti, 'mongodump',
                '#!/usr/bin/env bash\necho "server misbehaving (ESERVFAIL)" >&2\nexit 1\n');
            scriviStub(soloFallimenti, 'rclone', '#!/usr/bin/env bash\nexit 0\n');

            const esito = lanciaBackup(soloFallimenti, { env: { DUMP_TENTATIVI: '2' } });

            expect(esito.status).toBe(1);
            expect(esito.stderr).toMatch(/fallito dopo 2 tentativi/);
            expect(esito.stdout).not.toMatch(/Backup completato con successo/);
        } finally {
            fs.rmSync(soloFallimenti, { recursive: true, force: true });
        }
    });
});

