'use client';

import { useState, useEffect } from 'react';
import { getAdminPass, setAdminPass } from '@/lib/adminApi';
import { Header } from '@/components/layout/Header';
import { LockKeyhole, ArrowRight } from 'lucide-react';
import AdminDashboard from '@/components/admin/AdminDashboard';

export default function AdminPage() {
    const [isAuthorized, setIsAuthorized] = useState<boolean>(false);
    const [passwordInput, setPasswordInput] = useState('');
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const pass = getAdminPass();
        if (pass) {
            setIsAuthorized(true);
        }
        setLoading(false);
    }, []);

    const handleLogin = (e: React.FormEvent) => {
        e.preventDefault();
        if (passwordInput.trim()) {
            setAdminPass(passwordInput.trim());
            setIsAuthorized(true);
        }
    };

    if (loading) return null;

    if (!isAuthorized) {
        return (
            <>
                <Header />
                <main className="flex flex-1 items-center justify-center py-8">
                    <div className="w-full max-w-md p-8 rounded-2xl bg-[#0f1115] border border-white/5 shadow-2xl">
                        <div className="flex flex-col items-center text-center mb-8">
                            <div className="p-4 rounded-full bg-red-500/10 text-red-500 mb-4">
                                <LockKeyhole className="w-8 h-8" />
                            </div>
                            <h1 className="text-2xl font-black text-white tracking-tight">Accesso Riservato</h1>
                            <p className="text-sm text-marrow-light/60 mt-2">
                                Inserisci la Master Password definita nel server per accedere alla console di amministrazione.
                            </p>
                        </div>

                        <form onSubmit={handleLogin} className="flex flex-col gap-4">
                            <input
                                type="password"
                                value={passwordInput}
                                onChange={(e) => setPasswordInput(e.target.value)}
                                placeholder="Master Password"
                                className="w-full px-4 py-3 rounded-xl bg-black/40 border border-white/10 text-white placeholder-white/30 focus:outline-none focus:border-red-500/50 transition-colors"
                                autoFocus
                            />
                            <button
                                type="submit"
                                disabled={!passwordInput.trim()}
                                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-red-500 hover:bg-red-600 text-white font-bold transition-all disabled:opacity-50"
                            >
                                Sblocca
                                <ArrowRight className="w-4 h-4" />
                            </button>
                        </form>
                    </div>
                </main>
                <style jsx global>{`
                    body { background-color: var(--background); }
                `}</style>
            </>
        );
    }

    return (
        <>
            <Header />
            <AdminDashboard onLogout={() => { setAdminPass(''); setIsAuthorized(false); }} />
            <style jsx global>{`
                body { background-color: var(--background); }
            `}</style>
        </>
    );
}
