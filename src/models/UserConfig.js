const { getSupabase } = require('../utils/database');

// Questo file funge da "Model" astratto per facilitare il passaggio da Mongoose a Supabase 
// senza dover stravolgere tutta l'app.

const UserConfig = {
    async findOne({ uuid }) {
        const supabase = getSupabase();
        if (!supabase) throw new Error("Supabase non disponibile");

        const { data, error } = await supabase
            .from('user_configs')
            .select('*')
            .eq('uuid', uuid)
            .single();

        if (error || !data) {
            return null;
        }

        return data; // Ritorna l'oggetto { uuid, apiKeys: {}, catalogs: [] } esattamente come Mongoose
    },

    async saveConfig({ uuid, apiKeys, catalogs, profiles, activeProfileId }) {
        const supabase = getSupabase();
        if (!supabase) throw new Error("Supabase non disponibile");

        const configVersion = Date.now().toString(36);
        const row = {
            uuid,
            apiKeys,
            catalogs,
            profiles,
            activeProfileId,
            configVersion,
            updated_at: new Date()
        };

        const { data, error } = await supabase
            .from('user_configs')
            .upsert(row, { onConflict: 'uuid' })
            .select();

        if (error) {
            throw new Error(error.message);
        }
        // Ritorna i dati salvati (incluso configVersion) per evitare query aggiuntive
        return data?.[0] || { ...row };
    }
};

module.exports = UserConfig;
