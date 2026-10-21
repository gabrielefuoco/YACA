'use client';
import { useState } from 'react';
import { TraktAuthModal } from '@/components/modals/TraktAuthModal';
import { Profile } from '@/types';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import {
  Loader2, CheckCircle2, Copy, ExternalLink, LogOut, Save, Rocket, User
} from 'lucide-react';

interface SettingsPageProps {
  profiles: Profile[];
  activeProfileId: string;
  stremioEmail?: string;
  stremioAuthKey?: string;
  traktToken?: string | null;
  traktRefreshToken?: string | null;
  traktExpiresAt?: string | null;
  configVersion?: string;
  userId?: string;
  onUpdateProfile: (id: string, updates: Partial<Profile>) => void;
  onLogout: () => void;
  onDisconnectTrakt: () => void;
  onConnectTrakt: (token: string, refreshToken: string, expiresAt?: string | null) => void;
  onConfigSaved: (userId?: string) => void;
  /** Svuota la coda dell'auto-save e restituisce l'ultima configurazione salvata. */
  onFlushConfig?: () => Promise<any>;
}

export function SettingsPage({
  profiles,
  activeProfileId,
  stremioEmail,
  stremioAuthKey,
  traktToken,
  configVersion,
  userId,
  onUpdateProfile,
  onLogout,
  onDisconnectTrakt,
  onConnectTrakt,
  onConfigSaved,
  onFlushConfig,
}: SettingsPageProps) {
  const activeProfile = profiles.find((p) => p.id === activeProfileId) ?? profiles[0];
  const settings = activeProfile?.settings ?? {};

  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [installUrl, setInstallUrl] = useState('');
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [traktModalOpen, setTraktModalOpen] = useState(false);

  /**
   * «Installa in Stremio». NON scrive la configurazione: l'unico scrittore è l'auto-save
   * (ticket 12). Prima svuota la coda del debounce, poi installa l'ultima versione.
   */
  const handleSave = async () => {
    setLoading(true);
    setError('');
    setSuccess(false);

    const currentDNA = activeProfile?.settings?.manualDNA ?? [];
    const currentSuggestedDNA = activeProfile?.settings?.suggestedDNA ?? [];
    onUpdateProfile(activeProfileId, {
      settings: {
        ...settings,
        manualDNA: currentDNA,
        suggestedDNA: currentSuggestedDNA,
      },
    });

    try {
      const data = onFlushConfig ? await onFlushConfig() : undefined;

      if (data?.userId || userId) {
        onConfigSaved(data?.userId ?? userId);
        const host = window.location.host;
        const effectiveUserId = data?.userId ?? userId;
        const effectiveVersion = data?.configVersion ?? configVersion;
        const manifestPath = effectiveVersion
          ? `/${effectiveUserId}/${effectiveVersion}/manifest.json`
          : `/${effectiveUserId}/manifest.json`;
        const computedInstallUrl = `stremio://${host}${manifestPath}`;
        setInstallUrl(computedInstallUrl);
        setSuccess(true);

        if (stremioAuthKey) {
          const manifestUrl = `${window.location.protocol}//${host}${manifestPath}`;
          try {
            await api.stremioAddonUpdate(stremioAuthKey, manifestUrl);
          } catch { }
        }
      } else {
        setError(data?.error ?? 'Errore nella generazione della configurazione');
      }
    } catch {
      setError('Errore di connessione');
    }
    setLoading(false);
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const manifestUrl = userId
    ? `stremio://${typeof window !== 'undefined' ? window.location.host : ''}${configVersion ? `/${userId}/${configVersion}/manifest.json` : `/${userId}/manifest.json`}`
    : '';

  return (
    <div className="max-w-2xl mx-auto space-y-4 sm:space-y-6">
      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* HERO SECTION: Salva, Aggiorna, Installa & Backup                  */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* HERO SECTION: Salva, Aggiorna, Installa & Backup                  */}
      <section className="rounded-2xl border-2 border-primary/40 bg-white/40 p-3 sm:p-6 space-y-3 sm:space-y-5 shadow-2xl shadow-primary/10 ">
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="size-8 sm:size-10 rounded-xl bg-primary/20 text-primary flex items-center justify-center">
            <Rocket className="h-4 w-4 sm:h-5 sm:w-5" />
          </div>
          <div>
            <h3 className="text-sm sm:text-base font-black text-marrow-deep">Installa in Stremio</h3>
            <p className="text-xs text-marrow-light font-medium hidden sm:block">Salva subito le modifiche in coda e installa l&apos;addon su Stremio</p>
          </div>
        </div>

        {/* Save Button */}
        <Button
          className="w-full py-2 sm:py-3 min-h-[44px] bg-primary text-white hover:bg-accent font-bold text-xs sm:text-sm"
          size="lg"
          onClick={handleSave}
          disabled={loading}
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
          ) : (
            <Save className="h-4 w-4 mr-2" />
          )}
          <span className="hidden sm:inline">Installa in Stremio</span>
          <span className="sm:hidden">Installa</span>
        </Button>

        {/* Error */}
        {error && (
          <div className="rounded-lg border border-destructive/20 bg-destructive/10 p-3">
            <p className="text-sm text-destructive">{error}</p>
          </div>
        )}

        {/* Success state */}
        {success && installUrl && (
          <div className="rounded-xl border border-success/20 bg-success-faded p-4 space-y-3">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-success shrink-0" />
              <p className="text-sm font-bold text-success">Configurazione installata.</p>
            </div>
            <div className="flex flex-col sm:flex-row gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleCopy(installUrl)}
                className="flex-1 text-xs border-success/30 bg-marrow-light/10 hover:bg-success/20 text-success min-h-[44px] h-11 touch-manipulation"
              >
                {copied ? (
                  <CheckCircle2 className="h-3.5 w-3.5 mr-1 text-success" />
                ) : (
                  <Copy className="h-3.5 w-3.5 mr-1" />
                )}
                {copied ? 'Copiato!' : 'Copia link'}
              </Button>
              <Button
                size="sm"
                onClick={() => window.open(installUrl, '_blank')}
                className="flex-1 text-xs bg-success text-white hover:brightness-110 font-black min-h-[44px] h-11 touch-manipulation"
              >
                <ExternalLink className="h-3.5 w-3.5 mr-1" />
                Installa su Stremio
              </Button>
            </div>
          </div>
        )}

        {/* Quick install link (if already configured) */}
        {userId && !success && (
          <div className="rounded-xl border border-success/30 bg-success-faded p-4 space-y-3">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-success shrink-0" />
              <div>
                <p className="text-sm font-black text-success uppercase tracking-wide">Addon già configurato</p>
                <p className="text-xs text-marrow-light font-medium">Reinstalla o copia il link per aggiornare</p>
              </div>
            </div>
            <div className="flex flex-col sm:flex-row gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleCopy(manifestUrl)}
                className="flex-1 text-xs border-success/30 bg-marrow-light/10 hover:bg-success/20 text-success min-h-[44px] h-11 touch-manipulation"
              >
                {copied ? (
                  <CheckCircle2 className="h-3.5 w-3.5 mr-1 text-success" />
                ) : (
                  <Copy className="h-3.5 w-3.5 mr-1" />
                )}
                {copied ? 'Copiato!' : 'Copia link'}
              </Button>
              <Button
                size="sm"
                onClick={() => window.open(manifestUrl, '_blank')}
                className="flex-1 text-xs bg-primary hover:bg-primary-dark text-white transition-all font-black min-h-[44px] h-11 touch-manipulation"
              >
                <ExternalLink className="h-3.5 w-3.5 mr-1" />
                Installa su Stremio
              </Button>
            </div>
          </div>
        )}

      </section>

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* Account                                                            */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      <section className="rounded-xl border border-marrow-light/10 bg-white/40 p-3 sm:p-5 space-y-3 sm:space-y-4 shadow-sm ">
        <div className="flex items-center gap-2 text-primary">
          <User className="h-4.5 w-4.5" />
          <h3 className="text-sm font-black uppercase tracking-widest">Account</h3>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between gap-3 rounded-lg bg-white/60 px-3 sm:px-4 py-2 sm:py-3 border border-marrow-light/10">
            <div className="min-w-0">
              <p className="text-xs font-black uppercase tracking-wider text-marrow-light/60">Stremio</p>
              <p className="text-sm font-bold text-marrow-deep truncate">
                {stremioEmail ?? 'Non connesso'}
              </p>
            </div>
            {stremioEmail && (
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 shadow-sm shadow-emerald-500/50 shrink-0" />
            )}
          </div>

          <div className="flex items-center justify-between rounded-lg bg-white/60 px-3 sm:px-4 py-2 sm:py-3 border border-marrow-light/10">
            <div>
              <p className="text-xs font-black uppercase tracking-wider text-marrow-light/60">Trakt</p>
              <p className="text-sm font-bold text-marrow-deep">
                {traktToken ? 'Connesso' : 'Non connesso'}
              </p>
            </div>
            {traktToken ? (
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 shadow-sm shadow-emerald-500/50" />
            ) : null}
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-2 mt-4">
          {traktToken ? (
            <>
              <Button
                variant="outline"
                onClick={() => setTraktModalOpen(true)}
                className="flex-1 text-xs text-primary border-primary/20 bg-primary/5 hover:bg-primary/10 rounded-xl h-auto py-3 min-h-[44px] touch-manipulation font-bold"
              >
                Aggiorna Login Trakt
              </Button>
              <Button
                variant="outline"
                onClick={onDisconnectTrakt}
                className="flex-1 text-xs text-marrow-deep rounded-xl bg-white/80 border-marrow-light/20 hover:bg-white h-auto py-3 min-h-[44px] touch-manipulation font-bold shadow-sm"
              >
                Disconnetti Trakt
              </Button>
            </>
          ) : (
            <Button
              variant="outline"
              onClick={() => setTraktModalOpen(true)}
              className="flex-1 text-xs text-primary border-primary/20 bg-primary/5 hover:bg-primary/10 rounded-xl h-auto py-3 min-h-[44px] touch-manipulation font-bold"
            >
              Connetti Trakt
            </Button>
          )}
          <Button
            variant="destructive"
            onClick={onLogout}
            className="flex-1 text-xs rounded-xl h-auto py-3 min-h-[44px] touch-manipulation font-bold shadow-sm"
          >
            <LogOut className="h-3.5 w-3.5 mr-1" />
            Logout
          </Button>
        </div>
      </section>

      <TraktAuthModal
        open={traktModalOpen}
        onClose={() => setTraktModalOpen(false)}
        onSuccess={(t, r, exp) => {
          onConnectTrakt(t, r, exp);
          setTraktModalOpen(false);
        }}
      />
    </div>
  );
}
