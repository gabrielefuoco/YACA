const { createClient } = require('@supabase/supabase-js');

let supabase = null;

const initSupabase = () => {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_KEY;

    if (!supabaseUrl || !supabaseKey) {
        console.warn("⚠️ SUPABASE_URL o SUPABASE_KEY non definite nel file .env.");
        return null;
    }

    supabase = createClient(supabaseUrl, supabaseKey);
    console.log('✅ Supabase Client Inizializzato.');
    return supabase;
};

const getSupabase = () => {
    if (!supabase) return initSupabase();
    return supabase;
}

module.exports = { initSupabase, getSupabase };
