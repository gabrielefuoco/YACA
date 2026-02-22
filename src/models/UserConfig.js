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

        const { data, error } = await supabase
            .from('user_configs')
            .upsert({
                uuid,
                apiKeys,
                catalogs,
                profiles,
                activeProfileId,
                updated_at: new Date()
            }, { onConflict: 'uuid' });

        if (error) {
            throw new Error(error.message);
        }
        return data;
    }
};

module.exports = UserConfig;
