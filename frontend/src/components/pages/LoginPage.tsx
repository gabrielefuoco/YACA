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
              className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold transition-colors ${
                step > s
                  ? 'bg-emerald-500 text-white'
                  : step === s
                  ? 'bg-[#8a5aeb] text-white'
                  : 'bg-white/10 text-white/40'
              }`}
            >
              {step > s ? <CheckCircle2 className="h-4 w-4" /> : s}
            </div>
            {s < 3 && <div className={`h-px w-8 ${step > s ? 'bg-emerald-500' : 'bg-white/10'}`} />}
          </div>
        ))}
        <span className="ml-2 text-xs text-white/40">
          {step === 1 ? 'Account Stremio' : step === 2 ? 'Connetti Trakt' : 'Genera Config'}
        </span>
      </div>

      {/* Step 1: Stremio login */}
      {step === 1 && (
        <div className="space-y-4">
          <div className="flex items-center gap-3 mb-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#8a5aeb]/20">
              <Tv2 className="h-5 w-5 text-[#8a5aeb]" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-white">Accedi a Stremio</h2>
              <p className="text-xs text-white/50">Connetti il tuo account Stremio</p>
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

            {error && <p className="text-xs text-red-400">{error}</p>}

            <Button
              className="w-full"
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
              className="w-full text-xs text-white/30 hover:text-white/60 transition-colors"
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
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-500/20">
              <Film className="h-5 w-5 text-red-400" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-white">Connetti Trakt (opzionale)</h2>
              <p className="text-xs text-white/50">Per personalizzare i cataloghi in base alla tua watchlist</p>
            </div>
          </div>

          <Button className="w-full" onClick={() => setTraktModalOpen(true)}>
            🎬 Connetti Trakt
          </Button>

          <button
            onClick={handleSkipTrakt}
            className="w-full text-xs text-white/30 hover:text-white/60 transition-colors"
          >
            Salta
          </button>

          {traktToken && (
            <div className="flex items-center gap-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 p-3">
              <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
              <p className="text-sm text-emerald-400">Trakt connesso!</p>
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
          <div className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-2">
            <h3 className="text-sm font-semibold text-white">Riepilogo configurazione</h3>
            <div className="flex items-center gap-2">
              <span className={`h-2 w-2 rounded-full ${stremioAuth ? 'bg-emerald-400' : 'bg-white/20'}`} />
              <span className="text-sm text-white/70">
                Stremio: {stremioAuth ? stremioAuth.email : 'Non connesso'}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className={`h-2 w-2 rounded-full ${traktToken ? 'bg-emerald-400' : 'bg-white/20'}`} />
              <span className="text-sm text-white/70">
                Trakt: {traktToken ? 'Connesso' : 'Non connesso'}
              </span>
            </div>
          </div>

          <Button className="w-full" size="lg" onClick={handleGenerate}>
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
