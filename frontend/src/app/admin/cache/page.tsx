'use client';

import { useState, useEffect } from 'react';
import { Header } from '@/components/layout/Header';
import {
    Database,
    Trash2,
    RefreshCcw,
    Server,
    Info,
    CheckCircle2,
    XCircle,
    HardDrive,
    Cpu
} from 'lucide-react';

interface CacheStat {
    namespace: string;
    l1Count: number | string;
    l2Count: number | string;
}

export default function CacheAdminPage() {
    const [stats, setStats] = useState<CacheStat[]>([]);
    const [redisAvailable, setRedisAvailable] = useState<boolean | null>(null);
    const [loading, setLoading] = useState(true);
    const [clearing, setClearing] = useState<string | null>(null);

    const fetchStats = async () => {
        try {
            const res = await fetch('/api/cache/stats');
            const data = await res.json();
            if (data.success) {
                setStats(data.stats);
                setRedisAvailable(data.redisAvailable);
            }
        } catch (err) {
            console.error('Failed to fetch cache stats:', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchStats();
    }, []);

    const handleClear = async (namespace: string = 'all') => {
        if (!confirm(namespace === 'all' ? 'Sei sicuro di voler svuotare TUTTA la cache del sistema?' : `Svuotare la cache "${namespace}"?`)) {
            return;
        }

        setClearing(namespace);
        try {
            const res = await fetch('/api/cache/clear', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ namespace })
            });
            const data = await res.json();
            if (data.success) {
                await fetchStats();
            } else {
                alert('Errore: ' + data.error);
            }
        } catch (err) {
            console.error('Clear failed:', err);
        } finally {
            setClearing(null);
        }
    };

    const getFriendlyName = (ns: string) => {
        const names: Record<string, string> = {
            'tmdb_catalog': 'Cataloghi TMDB',
            'recommendation_cache': 'Raccomandazioni',
            'ai_prompt_cache': 'Cache AI (Prompts)',
            'badge_image_cache': 'Badge Episodi',
            'id_cache': 'Mappatura ID'
        };
        return names[ns] || ns;
    };

    return (
        <>
            <Header />

            <main className="flex flex-1 justify-center py-8">
                <div className="layout-content-container flex flex-col w-full max-w-[1000px] px-6 md:px-10 gap-8">

                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <div>
                            <h1 className="text-3xl font-black tracking-tight text-white flex items-center gap-3">
                                <Database className="w-8 h-8 text-[#8a5aeb]" />
                                Gestione Cache
                            </h1>
                            <p className="text-slate-400 mt-2">
                                Monitora e gestisci le performance del sistema YACA nelle due aree di memorizzazione.
                            </p>
                        </div>

                        <button
                            onClick={() => handleClear('all')}
                            disabled={clearing !== null}
                            className="flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-500 border border-red-500/30 transition-all font-bold disabled:opacity-50"
                        >
                            <Trash2 className="w-4 h-4" />
                            Svuota Tutto
                        </button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="p-6 rounded-2xl bg-[#0f1115] border border-white/5 flex items-center gap-4">
                            <div className={`p-3 rounded-xl ${redisAvailable ? 'bg-emerald-500/10 text-emerald-500' : 'bg-red-500/10 text-red-500'}`}>
                                <Cpu className="w-6 h-6" />
                            </div>
                            <div>
                                <div className="text-sm text-slate-400 font-medium">Stato Redis (L1)</div>
                                <div className="flex items-center gap-2 mt-0.5">
                                    <span className="font-bold text-white">
                                        {redisAvailable === null ? 'Verifica...' : redisAvailable ? 'Connesso' : 'Disconnesso (Fallback RAM)'}
                                    </span>
                                    {redisAvailable ? <CheckCircle2 className="w-4 h-4 text-emerald-500" /> : <XCircle className="w-4 h-4 text-red-500" />}
                                </div>
                            </div>
                        </div>

                        <div className="p-6 rounded-2xl bg-[#0f1115] border border-white/5 flex items-center gap-4">
                            <div className="p-3 rounded-xl bg-blue-500/10 text-blue-500">
                                <HardDrive className="w-6 h-6" />
                            </div>
                            <div>
                                <div className="text-sm text-slate-400 font-medium">Persistenza (L2)</div>
                                <div className="mt-0.5 flex items-center gap-2 text-white font-bold">
                                    MongoDB
                                    <span className="px-2 py-0.5 rounded text-[10px] bg-white/5 text-slate-400 uppercase tracking-wider">Active</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="rounded-2xl bg-[#0f1115] border border-white/5 overflow-hidden shadow-2xl">
                        <div className="px-6 py-4 border-b border-white/5 flex items-center justify-between">
                            <h2 className="font-bold text-white flex items-center gap-2">
                                <Server className="w-4 h-4 text-slate-400" />
                                Dettaglio Categorie
                            </h2>
                            <button
                                onClick={fetchStats}
                                disabled={loading}
                                className="p-2 rounded-lg hover:bg-white/5 text-slate-400 transition-colors"
                            >
                                <RefreshCcw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                            </button>
                        </div>

                        <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="bg-white/[0.02]">
                                        <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Namespace</th>
                                        <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">L1 (Velocità)</th>
                                        <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">L2 (Persistente)</th>
                                        <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider text-right">Azioni</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-white/5">
                                    {loading ? (
                                        Array(4).fill(0).map((_, i) => (
                                            <tr key={i} className="animate-pulse">
                                                <td className="px-6 py-6"><div className="h-4 w-32 bg-white/5 rounded" /></td>
                                                <td className="px-6 py-6"><div className="h-4 w-12 bg-white/5 rounded" /></td>
                                                <td className="px-6 py-6"><div className="h-4 w-12 bg-white/5 rounded" /></td>
                                                <td className="px-6 py-6 text-right"><div className="h-4 w-16 bg-white/5 rounded ml-auto" /></td>
                                            </tr>
                                        ))
                                    ) : stats.length === 0 ? (
                                        <tr>
                                            <td colSpan={4} className="px-6 py-12 text-center text-slate-500">
                                                Nessuna statistica disponibile.
                                            </td>
                                        </tr>
                                    ) : (
                                        stats.map((stat) => (
                                            <tr key={stat.namespace} className="hover:bg-white/[0.01] transition-colors group">
                                                <td className="px-6 py-5">
                                                    <div className="font-bold text-white">{getFriendlyName(stat.namespace)}</div>
                                                    <div className="text-[10px] text-slate-500 font-mono mt-0.5">{stat.namespace}</div>
                                                </td>
                                                <td className="px-6 py-5">
                                                    <span className="inline-flex items-center px-2.5 py-1 rounded-md text-sm font-medium bg-emerald-500/10 text-emerald-500">
                                                        {stat.l1Count} items
                                                    </span>
                                                </td>
                                                <td className="px-6 py-5">
                                                    <span className="inline-flex items-center px-2.5 py-1 rounded-md text-sm font-medium bg-blue-500/10 text-blue-500">
                                                        {stat.l2Count} docs
                                                    </span>
                                                </td>
                                                <td className="px-6 py-5 text-right">
                                                    <button
                                                        onClick={() => handleClear(stat.namespace)}
                                                        disabled={clearing !== null}
                                                        className="text-xs font-bold text-slate-400 hover:text-red-400 p-2 rounded-lg hover:bg-red-500/10 transition-all opacity-0 group-hover:opacity-100 flex items-center gap-1.5 ml-auto"
                                                    >
                                                        <Trash2 className="w-3.5 h-3.5" />
                                                        Svuota
                                                    </button>
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>

                        <div className="px-6 py-4 bg-white/[0.02] border-t border-white/5">
                            <div className="flex items-start gap-3 text-[11px] text-slate-500 max-w-2xl leading-relaxed">
                                <Info className="w-4 h-4 mt-0.5 shrink-0 text-slate-600" />
                                <p>
                                    <strong>Layer 1 (L1)</strong> utilizza Redis (se disponibile) o la memoria RAM locale del server per risposte istantanee.
                                    <strong> Layer 2 (L2)</strong> utilizza MongoDB per la persistenza a lungo termine tra i riavvii del sistema.
                                    Svuotare una categoria rimuoverà i dati da entrambi i livelli.
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            </main>

            <style jsx global>{`
        body {
          background-color: #08090a;
        }
      `}</style>
        </>
    );
}
