'use client';

import { useState, useEffect } from 'react';
import { adminApi, clearAdminPass } from '@/lib/adminApi';
import { Database, Trash2, RefreshCcw, Activity, Users, Flame, Settings, LogOut, Terminal, Cpu, HardDrive } from 'lucide-react';

interface Log {
    _id: string;
    context: string;
    message: string;
    level: string;
    createdAt: string;
}

interface CacheStat {
    namespace: string;
    l1Count: number | string;
    l2Count: number | string;
}

interface MetricsData {
    activeUsersCount: number;
    cacheStats: CacheStat[];
    recentLogs: Log[];
}

interface AdminDashboardProps {
    onLogout: () => void;
}

export default function AdminDashboard({ onLogout }: AdminDashboardProps) {
    const [data, setData] = useState<MetricsData | null>(null);
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState<string | null>(null);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);

    const fetchMetrics = async () => {
        setLoading(true);
        setErrorMsg(null);
        try {
            const res = await adminApi.getMetrics();
            if (res.success) {
                setData(res);
            } else {
                setErrorMsg(res.error || 'Errore sconosciuto');
            }
        } catch (err: any) {
            setErrorMsg(err.message);
            if (err.message.includes('Non autorizzato')) {
                onLogout();
            }
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchMetrics();
    }, []);

    const handleAction = async (action: string, param?: string) => {
        setActionLoading(action);
        try {
            let res;
            if (action === 'flush') {
                if (!confirm('Svuotare tutta la cache del sistema? Questo resetterà tutti i cataloghi L1/L2.')) {
                    setActionLoading(null);
                    return;
                }
                res = await adminApi.flushSystem(param);
            } else {
                res = await adminApi.triggerScript(action);
            }
            
            if (res.success) {
                alert('Azione eseguita: ' + res.message);
                fetchMetrics();
            } else {
                alert('Errore: ' + res.error);
            }
        } catch (err: any) {
            alert('Errore di rete: ' + err.message);
        } finally {
            setActionLoading(null);
        }
    };

    return (
        <main className="flex flex-1 justify-center py-8">
            <div className="layout-content-container flex flex-col w-full max-w-[1200px] px-6 md:px-10 gap-8">
                
                {/* Header Section */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                        <h1 className="text-3xl font-black tracking-tight text-white flex items-center gap-3">
                            <Activity className="w-8 h-8 text-red-500" />
                            Admin Console
                        </h1>
                        <p className="text-marrow-light/60 mt-2">
                            Dashboard amministrativa del server YACA
                        </p>
                    </div>
                    <div className="flex gap-3">
                        <button
                            onClick={fetchMetrics}
                            disabled={loading}
                            className="p-3 rounded-xl bg-white/5 hover:bg-white/10 text-white transition-all disabled:opacity-50"
                        >
                            <RefreshCcw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
                        </button>
                        <button
                            onClick={onLogout}
                            className="flex items-center gap-2 px-4 py-3 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-500 transition-all font-bold"
                        >
                            <LogOut className="w-4 h-4" />
                            Esci
                        </button>
                    </div>
                </div>

                {errorMsg && (
                    <div className="p-4 bg-red-500/10 border border-red-500/20 text-red-500 rounded-xl">
                        {errorMsg}
                    </div>
                )}

                {/* Metrics Cards */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="p-6 rounded-2xl bg-[#0f1115] border border-white/5 flex items-center gap-4">
                        <div className="p-3 rounded-xl bg-blue-500/10 text-blue-500">
                            <Users className="w-6 h-6" />
                        </div>
                        <div>
                            <div className="text-sm text-marrow-light/60 font-medium">Utenti Registrati</div>
                            <div className="text-2xl font-black text-white mt-1">
                                {data?.activeUsersCount !== undefined ? data.activeUsersCount : '-'}
                            </div>
                        </div>
                    </div>
                    <div className="p-6 rounded-2xl bg-[#0f1115] border border-white/5 flex items-center gap-4">
                        <div className="p-3 rounded-xl bg-emerald-500/10 text-emerald-500">
                            <Database className="w-6 h-6" />
                        </div>
                        <div>
                            <div className="text-sm text-marrow-light/60 font-medium">Namespace in Cache</div>
                            <div className="text-2xl font-black text-white mt-1">
                                {data?.cacheStats ? data.cacheStats.length : '-'}
                            </div>
                        </div>
                    </div>
                    <div className="p-6 rounded-2xl bg-[#0f1115] border border-white/5 flex items-center gap-4">
                        <div className="p-3 rounded-xl bg-purple-500/10 text-purple-500">
                            <Flame className="w-6 h-6" />
                        </div>
                        <div>
                            <div className="text-sm text-marrow-light/60 font-medium">Errori Tracciati</div>
                            <div className="text-2xl font-black text-white mt-1">
                                {data?.recentLogs ? data.recentLogs.length : '-'}
                            </div>
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    {/* Left Column: Actions & Cache */}
                    <div className="lg:col-span-1 flex flex-col gap-8">
                        
                        {/* Actions Panel */}
                        <div className="rounded-2xl bg-[#0f1115] border border-white/5 p-6">
                            <h2 className="text-lg font-bold text-white flex items-center gap-2 mb-6">
                                <Settings className="w-5 h-5 text-marrow-light/60" />
                                Operazioni Rapide
                            </h2>
                            <div className="flex flex-col gap-3">
                                <button
                                    onClick={() => handleAction('flush', 'all')}
                                    disabled={!!actionLoading}
                                    className="flex items-center justify-between p-4 rounded-xl bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-red-500 transition-all font-semibold disabled:opacity-50"
                                >
                                    <div className="flex items-center gap-3">
                                        <Trash2 className="w-5 h-5" />
                                        Svuota Tutto
                                    </div>
                                    {actionLoading === 'flush' && <RefreshCcw className="w-4 h-4 animate-spin" />}
                                </button>
                                <button
                                    onClick={() => handleAction('warmup')}
                                    disabled={!!actionLoading}
                                    className="flex items-center justify-between p-4 rounded-xl bg-white/5 hover:bg-white/10 text-white transition-all font-semibold disabled:opacity-50"
                                >
                                    <div className="flex items-center gap-3">
                                        <Flame className="w-5 h-5 text-orange-500" />
                                        Run Cache Warmer
                                    </div>
                                    {actionLoading === 'warmup' && <RefreshCcw className="w-4 h-4 animate-spin" />}
                                </button>
                                <button
                                    onClick={() => handleAction('analyze_presets')}
                                    disabled={!!actionLoading}
                                    className="flex items-center justify-between p-4 rounded-xl bg-white/5 hover:bg-white/10 text-white transition-all font-semibold disabled:opacity-50"
                                >
                                    <div className="flex items-center gap-3">
                                        <Terminal className="w-5 h-5 text-emerald-500" />
                                        Analizza Preset
                                    </div>
                                    {actionLoading === 'analyze_presets' && <RefreshCcw className="w-4 h-4 animate-spin" />}
                                </button>
                            </div>
                        </div>

                        {/* Cache Stats Table */}
                        <div className="rounded-2xl bg-[#0f1115] border border-white/5 overflow-hidden">
                            <div className="px-6 py-4 border-b border-white/5">
                                <h2 className="text-sm font-bold text-white uppercase tracking-wider">Storage Cache</h2>
                            </div>
                            <div className="overflow-x-auto">
                                <table className="w-full text-left">
                                    <tbody className="divide-y divide-white/5">
                                        {data?.cacheStats?.map(stat => (
                                            <tr key={stat.namespace} className="hover:bg-white/[0.02]">
                                                <td className="px-6 py-3">
                                                    <div className="text-white font-medium text-sm">{stat.namespace}</div>
                                                    <div className="text-xs text-marrow-light/50 flex gap-4 mt-1">
                                                        <span className="flex items-center gap-1"><Cpu className="w-3 h-3"/> L1: {stat.l1Count}</span>
                                                        <span className="flex items-center gap-1"><HardDrive className="w-3 h-3"/> L2: {stat.l2Count}</span>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>

                    {/* Right Column: System Logs */}
                    <div className="lg:col-span-2 rounded-2xl bg-[#0f1115] border border-white/5 overflow-hidden flex flex-col h-[600px]">
                        <div className="px-6 py-4 border-b border-white/5 bg-black/20 flex justify-between items-center">
                            <h2 className="text-lg font-bold text-white flex items-center gap-2">
                                <Terminal className="w-5 h-5 text-marrow-light/60" />
                                System Log
                            </h2>
                            <span className="px-2 py-1 bg-red-500/10 text-red-500 text-[10px] font-bold uppercase rounded">Ultimi 7 Giorni</span>
                        </div>
                        <div className="flex-1 overflow-y-auto p-4 space-y-3 font-mono text-sm">
                            {!data?.recentLogs || data.recentLogs.length === 0 ? (
                                <div className="text-marrow-light/40 text-center py-10">Nessun log trovato. Il sistema è stabile.</div>
                            ) : (
                                data.recentLogs.map(log => (
                                    <div key={log._id} className="p-3 rounded-lg bg-black/30 border border-white/5 flex flex-col gap-1">
                                        <div className="flex items-center justify-between text-[10px] text-marrow-light/50 uppercase">
                                            <span className="flex items-center gap-2">
                                                <span className={`w-2 h-2 rounded-full ${
                                                    log.level === 'error' ? 'bg-red-500' :
                                                    log.level === 'warning' ? 'bg-orange-500' : 'bg-blue-500'
                                                }`} />
                                                {log.context}
                                            </span>
                                            <span>{new Date(log.createdAt).toLocaleString()}</span>
                                        </div>
                                        <div className={`mt-1 ${log.level === 'error' ? 'text-red-400' : 'text-marrow-light/80'}`}>
                                            {log.message}
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </main>
    );
}
