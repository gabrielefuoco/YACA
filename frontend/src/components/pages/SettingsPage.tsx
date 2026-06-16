'use client';
import { useState } from 'react';
import { TraktAuthModal } from '@/components/modals/TraktAuthModal';
import { Profile, AppConfig } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { api } from '@/lib/api';
import { LOCAL_STORAGE_KEYS } from '@/lib/constants';
import {
  Loader2, CheckCircle2, Copy, ExternalLink, LogOut, Download, Upload, RefreshCw, Save, Rocket, Server, ShieldCheck
} from 'lucide-react';
import { profilesToApiPayload } from '@/lib/utils';
import Link from 'next/link';

interface SettingsPageProps {
  profiles: Profile[];
  activeProfileId: string;
  stremioEmail?: string;
  stremioAuthKey?: string;
  traktToken?: string | null;
  traktRefreshToken?: string | null;
  configVersion?: string;
  userId?: string;
  globalTmdbKey?: string;
  globalMistralKey?: string;
  onUpdateProfile: (id: string, updates: Partial<Profile>) => void;
  onLogout: () => void;
  onDisconnectTrakt: () => void;
  onConnectTrakt: (token: string, refreshToken: string) => void;
  onConfigSaved: (userId?: string) => void;
}

export function SettingsPage({
  profiles,
  activeProfileId,
  stremioEmail,
  stremioAuthKey,
  traktToken,
  traktRefreshToken,
  configVersion,
  userId,
  globalTmdbKey,
  globalMistralKey,
  onUpdateProfile,
  onLogout,
  onDisconnectTrakt,
  onConnectTrakt,
  onConfigSaved,
}: SettingsPageProps) {
  const activeProfile = profiles.find((p) => p.id === activeProfileId) ?? profiles[0];
  const settings = activeProfile?.settings ?? {};

  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [installUrl, setInstallUrl] = useState('');
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [traktModalOpen, setTraktModalOpen] = useState(false);

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

    await new Promise((r) => setTimeout(r, 50));

    const updatedProfiles = profiles.map((p) =>
      p.id === activeProfileId
        ? {
          ...p,
          settings: {
            ...p.settings,
          },
        }
        : p
    );

    const apiProfiles = profilesToApiPayload(updatedProfiles);

    try {
      const data = await api.configure({
        profiles: apiProfiles,
        activeProfileId,
        userId,
        stremioAuthKey,
        traktToken,
        traktRefreshToken,
        configVersion,
        tmdbKey: globalTmdbKey || settings.tmdbKey || '',
        mistralKey: globalMistralKey || '',
      });

      if (data.userId) {
        onConfigSaved(data.userId);
        const host = window.location.host;
        const manifestPath = data.configVersion
          ? `/${data.userId}/${data.configVersion}/manifest.json`
          : `/${data.userId}/manifest.json`;
        const computedInstallUrl = `stremio://${host}${manifestPath}`;
        setInstallUrl(computedInstallUrl);
        setSuccess(true);

        if (stremioAuthKey) {
          const httpsManifestUrl = `https://${host}${manifestPath}`;
          try {
            await api.stremioAddonUpdate(stremioAuthKey, httpsManifestUrl);
          } catch { }
        }
      } else {
        setError(data.error ?? 'Errore nella generazione della configurazione');
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

  const handleExport = () => {
    // Export only non-sensitive config data (no auth keys/tokens)
    const config: AppConfig = {
      profiles,
      activeProfileId,
      configVersion,
    };
    const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'yaca-backup.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = async () => {
        const content = reader.result as string;
        try {
          const parsed = JSON.parse(content);
          if (parsed.profiles) {
            const apiProfiles = profilesToApiPayload(parsed.profiles);
            const data = await api.configure({
              profiles: apiProfiles,
              activeProfileId: parsed.activeProfileId,
              userId,
              stremioAuthKey: parsed.stremioAuthKey,
              traktToken: parsed.traktToken,
              traktRefreshToken: parsed.traktRefreshToken,
              configVersion,
            });
            if (data.userId) {
              localStorage.setItem(LOCAL_STORAGE_KEYS.USER_ID, data.userId);
              window.location.reload();
            }
          }
        } catch { }
      };
      reader.readAsText(file);
    };
    input.click();
  };

  const manifestUrl = userId
    ? `stremio://${typeof window !== 'undefined' ? window.location.host : ''}${configVersion ? `/${userId}/${configVersion}/manifest.json` : `/${userId}/manifest.json`}`
    : '';

  return (
    <div className="space-y-4 sm:space-y-6">
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
            <h3 className="text-sm sm:text-base font-black text-marrow-deep">Salva & Installa</h3>
            <p className="text-[10px] sm:text-xs text-marrow-light font-medium hidden sm:block">Salva la configurazione, installa l&apos;addon su Stremio e gestisci i backup</p>
          </div>
        </div>

        {/* Save Button */}
        <Button
          className="w-full py-2 sm:py-3 bg-primary text-white hover:bg-accent font-bold text-xs sm:text-sm"
          size="lg"
          onClick={handleSave}
          disabled={loading}
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
          ) : (
            <Save className="h-4 w-4 mr-2" />
          )}
          <span className="hidden sm:inline">Salva Configurazione & Aggiorna Addon</span>
          <span className="sm:hidden">Salva & Aggiorna</span>
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
              <p className="text-sm font-bold text-success">Configurazione salvata con successo!</p>
            </div>
            <div className="flex flex-col sm:flex-row gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleCopy(installUrl)}
                className="flex-1 text-xs border-success/30 bg-marrow-light/10 hover:bg-success/20 text-success"
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
                className="flex-1 text-xs bg-success text-white hover:brightness-110 font-black"
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
                className="flex-1 text-xs border-success/30 bg-marrow-light/10 hover:bg-success/20 text-success"
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
                className="flex-1 text-xs bg-primary hover:bg-primary-dark text-white transition-all font-black"
              >
                <ExternalLink className="h-3.5 w-3.5 mr-1" />
                Installa su Stremio
              </Button>
            </div>
          </div>
        )}

        <Separator className="bg-marrow-light/10" />

        {/* Backup & Import */}
        <div className="flex flex-col sm:flex-row gap-3">
          <Button variant="outline" onClick={handleExport} className="flex-1 font-black text-primary border-primary/20 bg-primary/5 hover:bg-primary/10 shadow-sm rounded-xl py-5">
            <Download className="h-4 w-4 mr-2" />
            Esporta Backup
          </Button>
          <Button variant="outline" onClick={handleImport} className="flex-1 font-black text-marrow-deep border-marrow-light/30 bg-white/80 hover:bg-white shadow-sm rounded-xl py-5">
            <Upload className="h-4 w-4 mr-2" />
            Importa Backup
          </Button>
        </div>
      </section>



      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* Account                                                            */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      <section className="rounded-xl border border-marrow-light/10 bg-white/40 p-3 sm:p-5 space-y-3 sm:space-y-4 shadow-sm ">
        <div className="flex items-center gap-2 text-primary">
          <span className="material-symbols-outlined text-lg">person</span>
          <h3 className="text-sm font-black uppercase tracking-widest">Account</h3>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between rounded-lg bg-white/60 px-3 sm:px-4 py-2 sm:py-3 border border-marrow-light/10">
            <div>
              <p className="text-[10px] font-black uppercase tracking-wider text-marrow-light/60">Stremio</p>
              <p className="text-sm font-bold text-marrow-deep">
                {stremioEmail ?? 'Non connesso'}
              </p>
            </div>
            {stremioEmail && (
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 shadow-sm shadow-emerald-500/50" />
            )}
          </div>

          <div className="flex items-center justify-between rounded-lg bg-white/60 px-3 sm:px-4 py-2 sm:py-3 border border-marrow-light/10">
            <div>
              <p className="text-[10px] font-black uppercase tracking-wider text-marrow-light/60">Trakt</p>
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
                size="sm"
                onClick={() => setTraktModalOpen(true)}
                className="flex-1 text-xs text-primary border-primary/20 bg-primary/5 hover:bg-primary/10 rounded-xl py-4"
              >
                Aggiorna Login Trakt
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={onDisconnectTrakt}
                className="flex-1 text-xs text-marrow-deep rounded-xl bg-white/80 border-marrow-light/20 hover:bg-white py-4 shadow-sm"
              >
                Disconnetti Trakt
              </Button>
            </>
          ) : (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setTraktModalOpen(true)}
              className="flex-1 text-xs text-primary border-primary/20 bg-primary/5 hover:bg-primary/10 rounded-xl py-4"
            >
              Connetti Trakt
            </Button>
          )}
          <Button
            variant="destructive"
            size="sm"
            onClick={onLogout}
            className="flex-1 text-xs rounded-xl py-4 shadow-sm"
          >
            <LogOut className="h-3.5 w-3.5 mr-1" />
            Logout
          </Button>
        </div>
      </section>

      <TraktAuthModal
        open={traktModalOpen}
        onClose={() => setTraktModalOpen(false)}
        onSuccess={(t, r) => {
          onConnectTrakt(t, r);
          setTraktModalOpen(false);
        }}
      />
    </div>
  );
}
