'use client';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { TraktAuthModal } from '@/components/modals/TraktAuthModal';
import { api } from '@/lib/api';
import { StremioAuth } from '@/types';
import { Loader2, CheckCircle2, ChevronRight, Tv2, Film, KeyRound } from 'lucide-react';

interface LoginPageProps {
  onComplete: (
    stremioAuth: StremioAuth | null,
    traktToken: string | null,
    traktRefreshToken: string | null,
    existingUserId?: string,
    tmdbKey?: string,
    mistralKey?: string,
    existingProfiles?: any[],
    existingActiveProfileId?: string
  ) => void;
}

export function LoginPage({ onComplete }: LoginPageProps) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [sessionUserId, setSessionUserId] = useState<string | undefined>(undefined);
  const [tmdbKey, setTmdbKey] = useState('');
  const [mistralKey, setMistralKey] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [stremioAuth, setStremioAuth] = useState<StremioAuth | null>(null);
  const [traktToken, setTraktToken] = useState<string | null>(null);
  const [traktRefreshToken, setTraktRefreshToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [configuring, setConfiguring] = useState(false);
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
      // Use the new JWT-based auth endpoint
      const data = await api.authLogin(email, password);
      if (data.success && data.userId) {
        const auth: StremioAuth = {
          authKey: '', // Auth key managed server-side via HttpOnly cookie
          email: data.email ?? email,
        };
        setStremioAuth(auth);
        setSessionUserId(data.userId);

        if (data.isReturningUser) {
          // Returning user: restore Trakt auth if present, complete login directly
          setConfiguring(true);
          onComplete(
            auth,
            data.traktToken || null,
            data.traktRefreshToken || null,
            data.userId || undefined,
            undefined,
            undefined,
            data.profiles || undefined,
            data.activeProfileId || undefined
          );
          setLoading(false);
          return;
        }

        setStep(2);
      } else {
        setError(data.error ?? 'Credenziali non valide');
      }
    } catch {
      setError('Errore di connessione');
    }
    setLoading(false);
  };

  const handleComplete = (tkn: string | null = null, refresh: string | null = null) => {
    setConfiguring(true);
    onComplete(
      stremioAuth,
      tkn,
      refresh,
      sessionUserId,
      tmdbKey.trim() || undefined,
      mistralKey.trim() || undefined
    );
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

  if (configuring) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-4">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-white/20 border-t-primary" />
        <p className="text-sm text-white/50">Configurazione in corso…</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Step indicators */}
      <div className="flex items-center gap-2">
        {[1, 2, 3].map((s) => (
          <div key={s} className="flex items-center gap-2">
            <div
              className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold transition-all ${step > s
                ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/30'
                : step === s
                  ? 'bg-primary text-white shadow-xl shadow-primary/40 scale-110'
                  : 'bg-white/[0.04] text-white/20 border border-white/[0.05]'
                }`}
            >
              {step > s ? <CheckCircle2 className="h-4 w-4" /> : s}
            </div>
            {s < 3 && <div className={`h-[2px] w-8 transition-colors ${step > s ? 'bg-emerald-500' : 'bg-white/[0.08]'}`} />}
          </div>
        ))}
        <span className="ml-3 text-xs text-white/40 font-black uppercase tracking-widest">
          {step === 1 ? 'Account Stremio' : step === 2 ? 'Connetti Trakt' : 'Chiavi API'}
        </span>
      </div>

      {/* Step 1: Stremio login */}
      {step === 1 && (
        <div className="space-y-4">
          <div className="flex items-center gap-3 mb-2">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/20 border border-primary/30 shadow-2xl shadow-primary/20">
              <Tv2 className="h-6 w-6 text-primary" />
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

              <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-2.5">
                <p className="text-xs text-destructive">{error}</p>
              </div>

            <Button
              className="w-full bg-primary hover:bg-accent text-white font-black uppercase tracking-wider h-12 transition-all shadow-xl shadow-primary/30"
              onClick={handleStremioLogin}
              disabled={loading}
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Continua
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>

            <button
              onClick={async () => {
                setError('');
                try {
                  const guestSession = await api.authGuest();
                  if (guestSession?.success && guestSession?.userId) {
                    setSessionUserId(guestSession.userId);
                  }
                } catch {
                  setError('Errore creazione sessione ospite');
                  return;
                }
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
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-accent/20 border border-accent/40 shadow-2xl shadow-accent/20">
              <Film className="h-6 w-6 text-accent" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">Connetti Trakt (opzionale)</h2>
              <p className="text-xs text-white/40">Per personalizzare i cataloghi in base alla tua watchlist</p>
            </div>
          </div>

          <Button className="w-full bg-accent/10 border border-accent/40 text-accent hover:bg-accent/20 h-12 font-bold transition-all shadow-lg shadow-accent/10" variant="outline" onClick={() => setTraktModalOpen(true)}>
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
              <Button variant="ghost" size="sm" className="ml-auto h-7" onClick={() => setStep(3)}>
                Continua <ChevronRight className="h-3 w-3 ml-1" />
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Step 3: API Keys (BYOK) */}
      {step === 3 && (
        <div className="space-y-4">
          <div className="flex items-center gap-3 mb-2">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-secondary/30 border border-secondary/50 shadow-2xl shadow-secondary/30">
              <KeyRound className="h-6 w-6 text-secondary-foreground" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">Configura le API Key</h2>
              <p className="text-xs text-white/40">TMDB opzionale, Mistral necessaria per usare le funzioni AI</p>
            </div>
          </div>

          <div className="space-y-3">
            <div>
              <Label htmlFor="tmdbKey">TMDB API Key (opzionale)</Label>
              <Input
                id="tmdbKey"
                type="password"
                value={tmdbKey}
                onChange={(e) => setTmdbKey(e.target.value)}
                placeholder="Inserisci la tua TMDB API key"
                className="mt-1"
              />
            </div>

            <div>
              <Label htmlFor="mistralKey">Mistral API Key</Label>
              <Input
                id="mistralKey"
                type="password"
                value={mistralKey}
                onChange={(e) => setMistralKey(e.target.value)}
                placeholder="Inserisci la tua Mistral API key"
                className="mt-1"
              />
              <p className="mt-1 text-xs text-white/40">
                Senza chiave Mistral personale le funzioni AI saranno disabilitate.
              </p>
            </div>

            <Button
              className="w-full bg-secondary text-secondary-foreground hover:bg-secondary/80 font-black uppercase tracking-wider h-12 transition-all shadow-xl shadow-secondary/40"
              onClick={() => handleComplete(traktToken, traktRefreshToken)}
            >
              Completa configurazione
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
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
