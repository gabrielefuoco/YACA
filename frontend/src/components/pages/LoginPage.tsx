'use client';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { TraktAuthModal } from '@/components/modals/TraktAuthModal';
import { api } from '@/lib/api';
import { StremioAuth } from '@/types';
import { Loader2, CheckCircle2, ChevronRight, Tv2, Film } from 'lucide-react';

interface LoginPageProps {
  onComplete: (stremioAuth: StremioAuth | null, traktToken: string | null, traktRefreshToken: string | null) => void;
}

export function LoginPage({ onComplete }: LoginPageProps) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [stremioAuth, setStremioAuth] = useState<StremioAuth | null>(null);
  const [traktToken, setTraktToken] = useState<string | null>(null);
  const [traktRefreshToken, setTraktRefreshToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [traktModalOpen, setTraktModalOpen] = useState(false);

  const handleStremioLogin = async () => {
    if (!email.trim() || !password.trim()) {
      setError('Inserisci email e password');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const data = await api.stremioAuth(email, password);
      if (data.success && data.authKey) {
        setStremioAuth({ authKey: data.authKey, email: data.email ?? email });
        setStep(2);
      } else {
        setError(data.error ?? 'Credenziali non valide');
      }
    } catch {
      setError('Errore di connessione');
    }
    setLoading(false);
  };

  const handleSkipTrakt = () => {
    setStep(3);
  };

  const handleTraktSuccess = (token: string, refresh: string) => {
    setTraktToken(token);
    setTraktRefreshToken(refresh);
    setTraktModalOpen(false);
    setStep(3);
  };

  const handleGenerate = () => {
    onComplete(stremioAuth, traktToken, traktRefreshToken);
  };

  return (
    <div className="space-y-6">
      {/* Step indicators */}
      <div className="flex items-center gap-2">
        {[1, 2, 3].map((s) => (
          <div key={s} className="flex items-center gap-2">
            <div
              className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold transition-all ${
                step > s
                  ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/20'
                  : step === s
                  ? 'bg-gradient-to-br from-[#8a5aeb] to-[#6d3fd4] text-white shadow-lg shadow-[#8a5aeb]/25'
                  : 'bg-white/[0.06] text-white/30 border border-white/[0.06]'
              }`}
            >
              {step > s ? <CheckCircle2 className="h-4 w-4" /> : s}
            </div>
            {s < 3 && <div className={`h-px w-8 transition-colors ${step > s ? 'bg-emerald-500' : 'bg-white/[0.08]'}`} />}
          </div>
        ))}
        <span className="ml-3 text-xs text-white/40 font-medium">
          {step === 1 ? 'Account Stremio' : step === 2 ? 'Connetti Trakt' : 'Genera Config'}
        </span>
      </div>

      {/* Step 1: Stremio login */}
      {step === 1 && (
        <div className="space-y-4">
          <div className="flex items-center gap-3 mb-2">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#8a5aeb]/20 shadow-lg shadow-[#8a5aeb]/10">
              <Tv2 className="h-6 w-6 text-[#8a5aeb]" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">Accedi a Stremio</h2>
              <p className="text-xs text-white/40">Connetti il tuo account Stremio</p>
            </div>
          </div>

          <div className="space-y-3">
            <div>
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="la.tua@email.com"
                className="mt-1"
                onKeyDown={(e) => e.key === 'Enter' && handleStremioLogin()}
              />
            </div>
            <div>
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="mt-1"
                onKeyDown={(e) => e.key === 'Enter' && handleStremioLogin()}
              />
            </div>

            {error && (
              <div className="rounded-lg bg-red-500/10 border border-red-500/20 p-2.5">
                <p className="text-xs text-red-400">{error}</p>
              </div>
            )}

            <Button
              className="w-full bg-gradient-to-r from-[#8a5aeb] to-[#6d3fd4] hover:from-[#7a4adb] hover:to-[#5d2fc4] shadow-lg shadow-[#8a5aeb]/20"
              onClick={handleStremioLogin}
              disabled={loading}
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Continua
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>

            <button
              onClick={() => {
                setStremioAuth(null);
                setStep(2);
              }}
              className="w-full text-xs text-white/25 hover:text-white/50 transition-colors py-1"
            >
              Salta (configura senza account)
            </button>
          </div>
        </div>
      )}

      {/* Step 2: Trakt */}
      {step === 2 && (
        <div className="space-y-4">
          <div className="flex items-center gap-3 mb-2">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-red-500/20 shadow-lg shadow-red-500/10">
              <Film className="h-6 w-6 text-red-400" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">Connetti Trakt (opzionale)</h2>
              <p className="text-xs text-white/40">Per personalizzare i cataloghi in base alla tua watchlist</p>
            </div>
          </div>

          <Button className="w-full bg-red-500/20 border border-red-500/30 text-red-300 hover:bg-red-500/30" variant="outline" onClick={() => setTraktModalOpen(true)}>
            🎬 Connetti Trakt
          </Button>

          <button
            onClick={handleSkipTrakt}
            className="w-full text-xs text-white/25 hover:text-white/50 transition-colors py-1"
          >
            Salta
          </button>

          {traktToken && (
            <div className="flex items-center gap-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 p-3">
              <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
              <p className="text-sm text-emerald-400 font-medium">Trakt connesso!</p>
              <Button variant="ghost" size="sm" className="ml-auto h-7" onClick={handleSkipTrakt}>
                Continua <ChevronRight className="h-3 w-3 ml-1" />
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Step 3: Generate */}
      {step === 3 && (
        <div className="space-y-4">
          <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-5 space-y-3">
            <h3 className="text-sm font-semibold text-white uppercase tracking-wider">Riepilogo configurazione</h3>
            <div className="space-y-2">
              <div className="flex items-center gap-3 rounded-lg bg-white/[0.03] px-3 py-2.5">
                <span className={`h-2.5 w-2.5 rounded-full ${stremioAuth ? 'bg-emerald-400 shadow-lg shadow-emerald-400/30' : 'bg-white/15'}`} />
                <div>
                  <p className="text-xs text-white/40">Stremio</p>
                  <p className="text-sm text-white font-medium">
                    {stremioAuth ? stremioAuth.email : 'Non connesso'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3 rounded-lg bg-white/[0.03] px-3 py-2.5">
                <span className={`h-2.5 w-2.5 rounded-full ${traktToken ? 'bg-emerald-400 shadow-lg shadow-emerald-400/30' : 'bg-white/15'}`} />
                <div>
                  <p className="text-xs text-white/40">Trakt</p>
                  <p className="text-sm text-white font-medium">
                    {traktToken ? 'Connesso' : 'Non connesso'}
                  </p>
                </div>
              </div>
            </div>
          </div>

          <Button className="w-full bg-gradient-to-r from-[#8a5aeb] to-[#6d3fd4] hover:from-[#7a4adb] hover:to-[#5d2fc4] shadow-lg shadow-[#8a5aeb]/20" size="lg" onClick={handleGenerate}>
            🚀 Genera Configurazione
          </Button>
        </div>
      )}

      <TraktAuthModal
        open={traktModalOpen}
        onClose={() => setTraktModalOpen(false)}
        onSuccess={handleTraktSuccess}
      />
    </div>
  );
}
