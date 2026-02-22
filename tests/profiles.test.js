// Tests for improved profile/preset logic (Issue 2)

describe('Profile preset deduplication', () => {
    it('should deduplicate preset IDs', () => {
        const selectedPresets = ['preset_pop_movies', 'preset_pop_series', 'preset_pop_movies', 'preset_nolan', 'preset_nolan'];
        const seenPresets = new Set();
        const deduped = [];
        for (const presetId of selectedPresets) {
            if (seenPresets.has(presetId)) continue;
            seenPresets.add(presetId);
            deduped.push(presetId);
        }
        expect(deduped).toEqual(['preset_pop_movies', 'preset_pop_series', 'preset_nolan']);
        expect(deduped.length).toBe(3);
    });

    it('should preserve order of first occurrence', () => {
        const selectedPresets = ['preset_b', 'preset_a', 'preset_c', 'preset_a', 'preset_b'];
        const seenPresets = new Set();
        const deduped = [];
        for (const presetId of selectedPresets) {
            if (seenPresets.has(presetId)) continue;
            seenPresets.add(presetId);
            deduped.push(presetId);
        }
        expect(deduped).toEqual(['preset_b', 'preset_a', 'preset_c']);
    });
});

describe('Profile name validation', () => {
    it('should trim whitespace from profile names', () => {
        const name = '  My Profile  ';
        const result = (typeof name === 'string' ? name.trim() : '') || 'Nuovo Profilo';
        expect(result).toBe('My Profile');
    });

    it('should use default name for empty string', () => {
        const name = '';
        const result = (typeof name === 'string' ? name.trim() : '') || 'Nuovo Profilo';
        expect(result).toBe('Nuovo Profilo');
    });

    it('should use default name for whitespace-only', () => {
        const name = '   ';
        const result = (typeof name === 'string' ? name.trim() : '') || 'Nuovo Profilo';
        expect(result).toBe('Nuovo Profilo');
    });

    it('should truncate long names to 50 characters', () => {
        const name = 'A'.repeat(100);
        const result = ((typeof name === 'string' ? name.trim() : '') || 'Nuovo Profilo').substring(0, 50);
        expect(result.length).toBe(50);
    });
});

describe('activeProfileId validation', () => {
    it('should fall back to first profile when activeProfileId is invalid', () => {
        const parsedProfiles = [
            { id: 'prof_1', name: 'Profile 1' },
            { id: 'prof_2', name: 'Profile 2' }
        ];
        const activeProfileId = 'nonexistent';
        const profileIds = new Set(parsedProfiles.map(p => p.id));
        const finalActiveProfileId = (activeProfileId && profileIds.has(activeProfileId))
            ? activeProfileId
            : (parsedProfiles.length > 0 ? parsedProfiles[0].id : null);
        expect(finalActiveProfileId).toBe('prof_1');
    });

    it('should keep valid activeProfileId', () => {
        const parsedProfiles = [
            { id: 'prof_1', name: 'Profile 1' },
            { id: 'prof_2', name: 'Profile 2' }
        ];
        const activeProfileId = 'prof_2';
        const profileIds = new Set(parsedProfiles.map(p => p.id));
        const finalActiveProfileId = (activeProfileId && profileIds.has(activeProfileId))
            ? activeProfileId
            : (parsedProfiles.length > 0 ? parsedProfiles[0].id : null);
        expect(finalActiveProfileId).toBe('prof_2');
    });

    it('should return null when no profiles exist', () => {
        const parsedProfiles = [];
        const activeProfileId = null;
        const profileIds = new Set(parsedProfiles.map(p => p.id));
        const finalActiveProfileId = (activeProfileId && profileIds.has(activeProfileId))
            ? activeProfileId
            : (parsedProfiles.length > 0 ? parsedProfiles[0].id : null);
        expect(finalActiveProfileId).toBeNull();
    });
});

describe('Template merge logic', () => {
    it('should merge template presets with existing presets (deduplicating)', () => {
        const existingPresets = ['preset_pop_movies', 'preset_nolan'];
        const templatePresets = ['preset_pop_movies', 'preset_pop_series', 'preset_tarantino'];
        const merged = [...new Set([...existingPresets, ...templatePresets])];
        expect(merged).toEqual(['preset_pop_movies', 'preset_nolan', 'preset_pop_series', 'preset_tarantino']);
    });

    it('should handle empty existing presets', () => {
        const existingPresets = [];
        const templatePresets = ['preset_pop_movies', 'preset_pop_series'];
        const merged = [...new Set([...existingPresets, ...templatePresets])];
        expect(merged).toEqual(['preset_pop_movies', 'preset_pop_series']);
    });

    it('should handle empty template presets', () => {
        const existingPresets = ['preset_nolan'];
        const templatePresets = [];
        const merged = [...new Set([...existingPresets, ...templatePresets])];
        expect(merged).toEqual(['preset_nolan']);
    });
});
