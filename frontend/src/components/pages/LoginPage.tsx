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
  const [step, setStep] = useState<1 | 2>(1);
  const [sessionUserId, setSessionUserId] = useState<string | undefined>(undefined);
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
      sessionUserId
    );
  };

  const handleSkipTrakt = () => {
    handleComplete(traktToken, traktRefreshToken);
  };

  const handleTraktSuccess = (token: string, refresh: string) => {
    setTraktToken(token);
    setTraktRefreshToken(refresh);
    setTraktModalOpen(false);
    handleComplete(token, refresh);
  };

  if (configuring) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-4">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-primary/20 border-t-primary" />
        <p className="text-sm text-muted-foreground">Configurazione in corso…</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Step indicators */}
      <div className="flex items-center gap-2">
        {[1, 2].map((s) => (
          <div key={s} className="flex items-center gap-2">
            <div
              className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold transition-all ${step > s
                ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/30'
                : step === s
                  ? 'bg-primary text-primary-foreground shadow-xl shadow-primary/40 scale-110'
                  : 'bg-muted text-muted-foreground border border-border'
                }`}
            >
              {step > s ? <CheckCircle2 className="h-4 w-4" /> : s}
            </div>
            {s < 2 && <div className={`h-[2px] w-8 transition-colors ${step > s ? 'bg-emerald-500' : 'bg-border'}`} />}
          </div>
        ))}
        <span className="ml-3 text-xs text-muted-foreground font-black uppercase tracking-widest">
          {step === 1 ? 'Account Stremio' : 'Connetti Trakt'}
        </span>
      </div>

      {/* Step 1: Stremio login */}
      {step === 1 && (
        <div className="space-y-4">
          <div className="flex flex-col gap-4 mb-6">
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="flex h-10 w-10 sm:h-12 sm:w-12 items-center justify-center rounded-xl bg-primary/20 border border-primary/30 shadow-xl shadow-primary/20 shrink-0">
                <Tv2 className="h-5 w-5 sm:h-6 sm:w-6 text-primary" />
              </div>
              <div>
                <h2 className="text-lg sm:text-xl font-black text-marrow-deep leading-tight">Accedi a Stremio</h2>
                <p className="text-xs sm:text-sm font-bold text-primary">YACA <span className="text-marrow-light/50 font-medium hidden sm:inline">(Yet Another Catalog Addon)</span></p>
              </div>
            </div>
            <p className="text-xs sm:text-sm text-marrow-light/80 leading-relaxed bg-white/40 p-3 sm:p-4 rounded-2xl border border-marrow-light/10 shadow-sm">
              YACA crea cataloghi dinamici e personalizzati sfruttando l'Intelligenza Artificiale. Per iniziare e sincronizzare l'addon, devi fare il login utilizzando le <strong>stesse credenziali del tuo account Stremio</strong>.
            </p>
          </div>

          <div className="space-y-3">
            <div>
              <Label htmlFor="email" className="font-bold text-marrow-deep ml-1">Email Stremio</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="la.tua@email.com"
                className="mt-1.5 bg-white border-2 border-marrow-light/20 focus:border-primary shadow-sm h-10 sm:h-12 px-3 sm:px-4 rounded-xl font-medium text-sm"
                onKeyDown={(e) => e.key === 'Enter' && handleStremioLogin()}
              />
            </div>
            <div>
              <Label htmlFor="password" className="font-bold text-marrow-deep ml-1">Password Stremio</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="mt-1.5 bg-white border-2 border-marrow-light/20 focus:border-primary shadow-sm h-10 sm:h-12 px-3 sm:px-4 rounded-xl font-medium text-sm"
                onKeyDown={(e) => e.key === 'Enter' && handleStremioLogin()}
              />
            </div>

              <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-2.5">
                <p className="text-xs text-destructive">{error}</p>
              </div>

            <Button
              className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-black uppercase tracking-wider h-12 transition-all shadow-xl shadow-primary/30 mt-2"
              onClick={handleStremioLogin}
              disabled={loading}
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Continua
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
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
              <h2 className="text-lg font-semibold text-foreground">Connetti Trakt (opzionale)</h2>
              <p className="text-xs text-muted-foreground">Per personalizzare i cataloghi in base alla tua watchlist</p>
            </div>
          </div>

          <Button className="w-full bg-accent/10 border border-accent/40 text-accent hover:bg-accent/20 h-12 font-bold transition-all shadow-lg shadow-accent/10" variant="outline" onClick={() => setTraktModalOpen(true)}>
            🎬 Connetti Trakt
          </Button>

          <button
            onClick={handleSkipTrakt}
            className="w-full text-xs text-muted-foreground hover:text-foreground transition-colors py-1"
          >
            Salta
          </button>

          {traktToken && (
            <div className="flex items-center gap-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 p-3">
              <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
              <p className="text-sm text-emerald-400 font-medium">Trakt connesso!</p>
              <Button variant="ghost" size="sm" className="ml-auto h-7" onClick={() => handleComplete(traktToken, traktRefreshToken)}>
                Continua <ChevronRight className="h-3 w-3 ml-1" />
              </Button>
            </div>
          )}
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
