'use client';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { TraktAuthModal } from '@/components/modals/TraktAuthModal';
import { api } from '@/lib/api';
import { Loader2, CheckCircle2, ChevronRight, Tv2, Film, KeyRound, Sparkles, Zap } from 'lucide-react';

interface LoginPageProps {
  onComplete: (loginData: {
    userId: string;
    email: string;
    traktToken: string | null;
    traktRefreshToken: string | null;
    profiles: any[];
    activeProfileId: string;
  }) => void;
}

export function LoginPage({ onComplete }: LoginPageProps) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [configuring, setConfiguring] = useState(false);
  const [error, setError] = useState('');
  const [traktModalOpen, setTraktModalOpen] = useState(false);

  // Dati accumulati durante il wizard
  const [loginResult, setLoginResult] = useState<{
    userId: string;
    email: string;
    isNewUser: boolean;
    traktToken: string | null;
    traktRefreshToken: string | null;
    profiles: any[];
    activeProfileId: string;
  } | null>(null);

  // BYOK keys (Step 2)
  const [mistralKey, setMistralKey] = useState('');
  const [tmdbKey, setTmdbKey] = useState('');
  const [savingKeys, setSavingKeys] = useState(false);

  // Step 1: Login Stremio via sessione backend
  const handleStremioLogin = async () => {
    if (!email.trim() || !password.trim()) {
      setError('Inserisci email e password');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const data = await api.authLogin(email, password);
      if (data.success) {
        const result = {
          userId: data.userId,
          email: data.email,
          isNewUser: data.isNewUser,
          traktToken: data.traktToken || null,
          traktRefreshToken: data.traktRefreshToken || null,
          profiles: data.profiles || [],
          activeProfileId: data.activeProfileId || 'global',
        };
        setLoginResult(result);

        if (!data.isNewUser) {
          // Utente esistente: salta onboarding, vai direttamente alla dashboard
          setConfiguring(true);
          onComplete(result);
          setLoading(false);
          return;
        }

        // Nuovo utente: procedi all'onboarding BYOK (Step 2)
        setStep(2);
      } else {
        setError(data.error ?? 'Credenziali non valide');
      }
    } catch {
      setError('Errore di connessione');
    }
    setLoading(false);
  };

  // Step 2: Salva chiavi BYOK
  const handleSaveApiKeys = async () => {
    if (!loginResult) return;
    setSavingKeys(true);
    try {
      await api.configure({
        userId: loginResult.userId,
        tmdbKey: tmdbKey.trim() || undefined,
        mistralKey: mistralKey.trim() || undefined,
      });
    } catch {
      // Non-bloccante: le chiavi verranno salvate al prossimo configure
    }
    setSavingKeys(false);
    setStep(3);
  };

  const handleSkipApiKeys = () => {
    setStep(3);
  };

  // Step 3: Trakt
  const handleTraktSuccess = (token: string, refresh: string) => {
    setTraktModalOpen(false);
    if (loginResult) {
      const updated = { ...loginResult, traktToken: token, traktRefreshToken: refresh };
      setLoginResult(updated);
      finalizeOnboarding(updated);
    }
  };

  const handleSkipTrakt = () => {
    if (loginResult) {
      finalizeOnboarding(loginResult);
    }
  };

  const finalizeOnboarding = (result: NonNullable<typeof loginResult>) => {
    setConfiguring(true);
    onComplete(result);
  };

  if (configuring) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-4">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-white/20 border-t-[#8a5aeb]" />
        <p className="text-sm text-white/50">Configurazione in corso…</p>
      </div>
    );
  }

  const totalSteps = 3;

  return (
    <div className="space-y-6">
      {/* Step indicators */}
      <div className="flex items-center gap-2">
        {[1, 2, 3].map((s) => (
          <div key={s} className="flex items-center gap-2">
            <div
              className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold transition-all ${step > s
                ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/20'
                : step === s
                  ? 'bg-gradient-to-br from-[#8a5aeb] to-[#6d3fd4] text-white shadow-lg shadow-[#8a5aeb]/25'
                  : 'bg-white/[0.06] text-white/30 border border-white/[0.06]'
                }`}
            >
              {step > s ? <CheckCircle2 className="h-4 w-4" /> : s}
            </div>
            {s < totalSteps && <div className={`h-px w-8 transition-colors ${step > s ? 'bg-emerald-500' : 'bg-white/[0.08]'}`} />}
          </div>
        ))}
        <span className="ml-3 text-xs text-white/40 font-medium">
          {step === 1 ? 'Account Stremio' : step === 2 ? 'Chiavi API' : 'Connetti Trakt'}
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
          </div>
        </div>
      )}

      {/* Step 2: BYOK Onboarding — Chiavi API personali */}
      {step === 2 && (
        <div className="space-y-4">
          <div className="flex items-center gap-3 mb-2">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-amber-500/20 shadow-lg shadow-amber-500/10">
              <KeyRound className="h-6 w-6 text-amber-400" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">Benvenuto! Configura le tue chiavi</h2>
              <p className="text-xs text-white/40">Ottieni il massimo da YACA con le tue chiavi API personali</p>
            </div>
          </div>

          <div className="space-y-4">
            {/* Mistral Key */}
            <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-4 space-y-2">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-purple-400" />
                <span className="text-sm font-medium text-white">Chiave Mistral AI</span>
              </div>
              <p className="text-xs text-white/40">
                Sblocca il <strong className="text-purple-300">Motore di Ricerca Semantico AI</strong> e la creazione di <strong className="text-purple-300">Cataloghi AI</strong> personalizzati. Senza questa chiave, le funzionalità AI non saranno disponibili.
              </p>
              <Input
                type="password"
                value={mistralKey}
                onChange={(e) => setMistralKey(e.target.value)}
                placeholder="Incolla la tua chiave Mistral…"
                className="mt-1"
              />
            </div>

            {/* TMDB Key */}
            <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-4 space-y-2">
              <div className="flex items-center gap-2">
                <Zap className="h-4 w-4 text-emerald-400" />
                <span className="text-sm font-medium text-white">Chiave TMDB</span>
              </div>
              <p className="text-xs text-white/40">
                Garantisce <strong className="text-emerald-300">aggiornamenti istantanei</strong>, assenza di rate-limiting e <strong className="text-emerald-300">caricamento fulmineo delle locandine</strong>. Senza chiave personale, YACA userà la chiave condivisa del server (più lenta, con limiti).
              </p>
              <Input
                type="password"
                value={tmdbKey}
                onChange={(e) => setTmdbKey(e.target.value)}
                placeholder="Incolla la tua chiave TMDB…"
                className="mt-1"
              />
            </div>
          </div>

          <Button
            className="w-full bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white shadow-lg shadow-amber-500/20"
            onClick={handleSaveApiKeys}
            disabled={savingKeys}
          >
            {savingKeys ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            {mistralKey.trim() || tmdbKey.trim() ? 'Salva e continua' : 'Continua senza chiavi'}
            <ChevronRight className="h-4 w-4 ml-1" />
          </Button>

          <button
            onClick={handleSkipApiKeys}
            className="w-full text-xs text-white/25 hover:text-white/50 transition-colors py-1"
          >
            Salta per ora
          </button>
        </div>
      )}

      {/* Step 3: Trakt */}
      {step === 3 && (
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
