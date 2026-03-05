'use client';
import { useState } from 'react';
import { Profile, AppConfig } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { api } from '@/lib/api';
import { LOCAL_STORAGE_KEYS } from '@/lib/constants';
import {
  Loader2, CheckCircle2, Copy, ExternalLink, LogOut, Download, Upload, RefreshCw, Save, Rocket
} from 'lucide-react';
import { profilesToApiPayload } from '@/lib/utils';

interface SettingsPageProps {
  profiles: Profile[];
  activeProfileId: string;
  stremioEmail?: string;
  stremioAuthKey?: string;
  traktToken?: string | null;
  traktRefreshToken?: string | null;
  configVersion?: string;
  userId?: string;
  onUpdateProfile: (id: string, updates: Partial<Profile>) => void;
  onLogout: () => void;
  onDisconnectTrakt: () => void;
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
  onUpdateProfile,
  onLogout,
  onDisconnectTrakt,
  onConfigSaved,
}: SettingsPageProps) {
  const activeProfile = profiles.find((p) => p.id === activeProfileId) ?? profiles[0];
  const settings = activeProfile?.settings ?? {};

  const [fastRefresh, setFastRefresh] = useState(settings.fastRefresh ?? false);
  const [tmdbKey, setTmdbKey] = useState(settings.tmdbKey ?? '');
  const [loading, setLoading] = useState(false);
  const [cacheLoading, setCacheLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [installUrl, setInstallUrl] = useState('');
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  const handleSave = async () => {
    setLoading(true);
    setError('');
    setSuccess(false);

    const currentPillars = activeProfile?.settings?.manualPillars ?? [];
    const currentSuggestedPillars = activeProfile?.settings?.suggestedPillars ?? [];
    onUpdateProfile(activeProfileId, {
      settings: {
        fastRefresh,
        tmdbKey,
        manualPillars: currentPillars,
        suggestedPillars: currentSuggestedPillars,
      },
    });

    await new Promise((r) => setTimeout(r, 50));

    const updatedProfiles = profiles.map((p) =>
      p.id === activeProfileId
        ? {
          ...p,
          settings: {
            ...p.settings,
            fastRefresh,
            tmdbKey,
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

  const handleClearCache = async () => {
    setCacheLoading(true);
    try {
      await api.clearCache();
    } catch { }
    setCacheLoading(false);
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleExport = () => {
    const config: AppConfig = {
      profiles,
      activeProfileId,
      stremioAuthKey,
      traktToken: traktToken ?? undefined,
      traktRefreshToken: traktRefreshToken ?? undefined,
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
    <div className="space-y-6">
      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* HERO SECTION: Salva, Aggiorna, Installa & Backup                  */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      <section className="rounded-2xl border-2 border-primary/30 bg-gradient-to-br from-primary/10 via-primary/5 to-transparent p-6 space-y-5 shadow-lg shadow-primary/5">
        <div className="flex items-center gap-3">
          <div className="size-10 rounded-xl bg-primary/20 text-primary flex items-center justify-center">
            <Rocket className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">Salva & Installa</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">Salva la configurazione, installa l&apos;addon su Stremio e gestisci i backup</p>
          </div>
        </div>

        {/* Save Button */}
        <Button
          className="w-full py-3 bg-primary text-white hover:brightness-110 font-bold text-sm shadow-md shadow-primary/20"
          size="lg"
          onClick={handleSave}
          disabled={loading}
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
          ) : (
            <Save className="h-4 w-4 mr-2" />
          )}
          Salva Configurazione & Aggiorna Addon
        </Button>

        {/* Error */}
        {error && (
          <div className="rounded-lg border border-rose-500/20 bg-rose-500/10 p-3">
            <p className="text-sm text-rose-400">{error}</p>
          </div>
        )}

        {/* Success state */}
        {success && installUrl && (
          <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-4 space-y-3">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0" />
              <p className="text-sm font-bold text-emerald-500">Configurazione salvata con successo!</p>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleCopy(installUrl)}
                className="flex-1 text-xs"
              >
                {copied ? (
                  <CheckCircle2 className="h-3.5 w-3.5 mr-1 text-emerald-500" />
                ) : (
                  <Copy className="h-3.5 w-3.5 mr-1" />
                )}
                {copied ? 'Copiato!' : 'Copia link'}
              </Button>
              <Button
                size="sm"
                onClick={() => window.open(installUrl, '_blank')}
                className="flex-1 text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                <ExternalLink className="h-3.5 w-3.5 mr-1" />
                Installa su Stremio
              </Button>
            </div>
          </div>
        )}

        {/* Quick install link (if already configured) */}
        {userId && !success && (
          <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4 space-y-3">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0" />
              <div>
                <p className="text-sm font-semibold text-emerald-500">Addon già configurato</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">Reinstalla o copia il link per aggiornare</p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleCopy(manifestUrl)}
                className="flex-1 text-xs"
              >
                {copied ? (
                  <CheckCircle2 className="h-3.5 w-3.5 mr-1 text-emerald-500" />
                ) : (
                  <Copy className="h-3.5 w-3.5 mr-1" />
                )}
                {copied ? 'Copiato!' : 'Copia link'}
              </Button>
              <Button
                size="sm"
                onClick={() => window.open(manifestUrl, '_blank')}
                className="flex-1 text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                <ExternalLink className="h-3.5 w-3.5 mr-1" />
                Installa su Stremio
              </Button>
            </div>
          </div>
        )}

        <Separator className="bg-slate-200 dark:bg-slate-700/50" />

        {/* Backup & Import */}
        <div className="flex gap-3">
          <Button variant="outline" onClick={handleExport} className="flex-1 font-medium">
            <Download className="h-4 w-4 mr-2" />
            Esporta Backup
          </Button>
          <Button variant="outline" onClick={handleImport} className="flex-1 font-medium">
            <Upload className="h-4 w-4 mr-2" />
            Importa Backup
          </Button>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* Cache & Performance                                                */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      <section className="rounded-xl border border-slate-200 dark:border-slate-700/50 bg-white dark:bg-slate-800/40 p-5 space-y-4">
        <div className="flex items-center gap-2 text-primary">
          <span className="material-symbols-outlined text-lg">bolt</span>
          <h3 className="text-sm font-black uppercase tracking-widest">Cache & Performance</h3>
        </div>

        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-slate-900 dark:text-slate-100">Refresh rapido</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">Aggiorna i cataloghi più frequentemente</p>
          </div>
          <Switch checked={fastRefresh} onCheckedChange={setFastRefresh} />
        </div>

        <Separator className="bg-slate-200 dark:bg-slate-700/50" />

        <Button
          variant="outline"
          onClick={handleClearCache}
          disabled={cacheLoading}
          className="w-full"
        >
          {cacheLoading ? (
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
          ) : (
            <RefreshCw className="h-4 w-4 mr-2" />
          )}
          Svuota Cache
        </Button>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* TMDB API Key                                                       */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      <section className="rounded-xl border border-slate-200 dark:border-slate-700/50 bg-white dark:bg-slate-800/40 p-5 space-y-3">
        <div className="flex items-center gap-2 text-primary">
          <span className="material-symbols-outlined text-lg">key</span>
          <h3 className="text-sm font-black uppercase tracking-widest">API Key TMDB (opzionale)</h3>
        </div>
        <div>
          <Label htmlFor="tmdb-key" className="text-slate-900 dark:text-slate-100">Chiave API TMDB personalizzata</Label>
          <Input
            id="tmdb-key"
            value={tmdbKey}
            onChange={(e) => setTmdbKey(e.target.value)}
            placeholder="La tua API key TMDB..."
            className="mt-1 bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800"
            type="password"
          />
          <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
            Usa una chiave API TMDB personale per limiti più alti
          </p>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* Account                                                            */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      <section className="rounded-xl border border-slate-200 dark:border-slate-700/50 bg-white dark:bg-slate-800/40 p-5 space-y-4">
        <div className="flex items-center gap-2 text-primary">
          <span className="material-symbols-outlined text-lg">person</span>
          <h3 className="text-sm font-black uppercase tracking-widest">Account</h3>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between rounded-lg bg-slate-50 dark:bg-slate-800 px-4 py-3 border border-slate-200 dark:border-slate-700/50">
            <div>
              <p className="text-xs text-slate-500 dark:text-slate-400">Stremio</p>
              <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                {stremioEmail ?? 'Non connesso'}
              </p>
            </div>
            {stremioEmail && (
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 shadow-sm shadow-emerald-500/50" />
            )}
          </div>

          <div className="flex items-center justify-between rounded-lg bg-slate-50 dark:bg-slate-800 px-4 py-3 border border-slate-200 dark:border-slate-700/50">
            <div>
              <p className="text-xs text-slate-500 dark:text-slate-400">Trakt</p>
              <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                {traktToken ? 'Connesso' : 'Non connesso'}
              </p>
            </div>
            {traktToken ? (
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 shadow-sm shadow-emerald-500/50" />
            ) : null}
          </div>
        </div>

        <div className="flex gap-2">
          {traktToken && (
            <Button
              variant="outline"
              size="sm"
              onClick={onDisconnectTrakt}
              className="flex-1 text-xs"
            >
              Disconnetti Trakt
            </Button>
          )}
          <Button
            variant="destructive"
            size="sm"
            onClick={onLogout}
            className="flex-1 text-xs"
          >
            <LogOut className="h-3.5 w-3.5 mr-1" />
            Logout
          </Button>
        </div>
      </section>
    </div>
  );
}
