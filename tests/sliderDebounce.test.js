/**
 * Test della logica di debounce degli slider:
 * - Preview refresh debounced a 400ms al livello di valore (valore quantizzato a 0.1).
 * - Auto-save debounced a 1000ms dopo l'ultimo movimento.
 * - Verifica del conteggio chiamate durante un trascinamento continuo di 10 passi.
 */

describe('Slider Debounce & Auto-save Logic', () => {
    beforeEach(() => {
        jest.useFakeTimers();
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    function createSliderDebounceController({
        onPreviewRefresh,
        onProfileSave,
        initialValues = { cozy: 0.0, canone: 0.0 }
    }) {
        let shownValues = { ...initialValues };
        let previewValues = { ...initialValues };
        let savedValues = { ...initialValues };
        let saveStatus = 'saved';

        let previewTimer = null;
        let autoSaveTimer = null;

        function quantize(val) {
            return Math.round(val * 10) / 10;
        }

        function handleMove(key, rawVal) {
            const val = quantize(rawVal);
            const nextValues = { ...shownValues, [key]: val };
            shownValues = nextValues;

            const hasChangedFromSaved = (
                nextValues.cozy !== savedValues.cozy ||
                nextValues.canone !== savedValues.canone
            );

            if (hasChangedFromSaved) {
                saveStatus = 'saving';
            }

            // 1. Debounce anteprima ~400ms
            if (previewTimer) clearTimeout(previewTimer);
            previewTimer = setTimeout(() => {
                previewTimer = null;
                if (previewValues.cozy !== nextValues.cozy || previewValues.canone !== nextValues.canone) {
                    previewValues = nextValues;
                    onPreviewRefresh(nextValues);
                }
            }, 400);

            // 2. Debounce auto-save ~1000ms
            if (autoSaveTimer) clearTimeout(autoSaveTimer);
            autoSaveTimer = setTimeout(() => {
                autoSaveTimer = null;
                if (hasChangedFromSaved) {
                    savedValues = nextValues;
                    onProfileSave(nextValues);
                }
                saveStatus = 'saved';
            }, 1000);
        }

        return {
            handleMove,
            getShownValues: () => shownValues,
            getPreviewValues: () => previewValues,
            getSavedValues: () => savedValues,
            getSaveStatus: () => saveStatus
        };
    }

    test('un trascinamento continuo di 10 passi (ogni 50ms) produce esattamente 1 chiamata di anteprima e 1 di salvataggio', () => {
        const onPreviewRefresh = jest.fn();
        const onProfileSave = jest.fn();

        const controller = createSliderDebounceController({
            onPreviewRefresh,
            onProfileSave,
            initialValues: { cozy: 0.0, canone: 0.0 }
        });

        // Simula trascinamento continuo da 0.1 a 1.0 (10 step, ogni 50ms = 450ms totali di drag)
        for (let i = 1; i <= 10; i++) {
            controller.handleMove('cozy', i * 0.1);
            jest.advanceTimersByTime(50);
        }

        // A fine drag (+50ms dall'ultimo passo):
        // preview (400ms) e autosave (1000ms) non sono ancora scattati
        expect(onPreviewRefresh).not.toHaveBeenCalled();
        expect(onProfileSave).not.toHaveBeenCalled();
        expect(controller.getSaveStatus()).toBe('saving');

        // Avanza di 350ms (totale 400ms dall'ultimo step):
        // Scatta l'anteprima (immediate feedback)
        jest.advanceTimersByTime(350);
        expect(onPreviewRefresh).toHaveBeenCalledTimes(1);
        expect(onPreviewRefresh).toHaveBeenCalledWith({ cozy: 1.0, canone: 0.0 });
        expect(onProfileSave).not.toHaveBeenCalled();
        expect(controller.getSaveStatus()).toBe('saving');

        // Avanza di altri 600ms (totale 1000ms dall'ultimo step):
        // Scatta l'auto-save persistente sul profilo
        jest.advanceTimersByTime(600);
        expect(onProfileSave).toHaveBeenCalledTimes(1);
        expect(onProfileSave).toHaveBeenCalledWith({ cozy: 1.0, canone: 0.0 });
        expect(controller.getSaveStatus()).toBe('saved');

        // Avanza ulteriore tempo per verificare che non ci siano chiamate pendenti
        jest.advanceTimersByTime(2000);
        expect(onPreviewRefresh).toHaveBeenCalledTimes(1);
        expect(onProfileSave).toHaveBeenCalledTimes(1);
    });

    test('trascinare e tornare al valore di partenza non esegue salvataggi ridondanti', () => {
        const onPreviewRefresh = jest.fn();
        const onProfileSave = jest.fn();

        const controller = createSliderDebounceController({
            onPreviewRefresh,
            onProfileSave,
            initialValues: { cozy: 0.0, canone: 0.0 }
        });

        // Muove a 0.5
        controller.handleMove('cozy', 0.5);
        jest.advanceTimersByTime(100);

        // Torna a 0.0 prima che scatti il salvataggio
        controller.handleMove('cozy', 0.0);
        jest.advanceTimersByTime(1100);

        // Il salvataggio viene evitato perché il valore finale è identico a quello iniziale salvato
        expect(onProfileSave).not.toHaveBeenCalled();
        expect(controller.getSaveStatus()).toBe('saved');
    });

    test('pausa durante il drag innesca anteprima intermedia ma un solo salvataggio finale', () => {
        const onPreviewRefresh = jest.fn();
        const onProfileSave = jest.fn();

        const controller = createSliderDebounceController({
            onPreviewRefresh,
            onProfileSave,
            initialValues: { cozy: 0.0, canone: 0.0 }
        });

        // Drag fino a 0.5
        for (let i = 1; i <= 5; i++) {
            controller.handleMove('cozy', i * 0.1);
            jest.advanceTimersByTime(30);
        }

        // Pausa di 450ms a 0.5 (innesca preview per 0.5)
        jest.advanceTimersByTime(450);
        expect(onPreviewRefresh).toHaveBeenCalledTimes(1);
        expect(onPreviewRefresh).toHaveBeenCalledWith({ cozy: 0.5, canone: 0.0 });
        expect(onProfileSave).not.toHaveBeenCalled();

        // Riprende drag fino a 1.0
        for (let i = 6; i <= 10; i++) {
            controller.handleMove('cozy', i * 0.1);
            jest.advanceTimersByTime(30);
        }

        // Attende 400ms -> seconda preview per 1.0
        jest.advanceTimersByTime(400);
        expect(onPreviewRefresh).toHaveBeenCalledTimes(2);
        expect(onPreviewRefresh).toHaveBeenLastCalledWith({ cozy: 1.0, canone: 0.0 });
        expect(onProfileSave).not.toHaveBeenCalled();

        // Attende 600ms -> scatta UN SOLO salvataggio finale per 1.0
        jest.advanceTimersByTime(600);
        expect(onProfileSave).toHaveBeenCalledTimes(1);
        expect(onProfileSave).toHaveBeenCalledWith({ cozy: 1.0, canone: 0.0 });
        expect(controller.getSaveStatus()).toBe('saved');
    });
});
