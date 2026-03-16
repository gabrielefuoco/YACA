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
  onConfigSaved,
}: SettingsPageProps) {
  const activeProfile = profiles.find((p) => p.id === activeProfileId) ?? profiles[0];
  const settings = activeProfile?.settings ?? {};

  const [fastRefresh, setFastRefresh] = useState(settings.fastRefresh ?? false);
  const [tmdbKey, setTmdbKey] = useState(globalTmdbKey || settings.tmdbKey || '');
  const [mistralKey, setMistralKey] = useState(globalMistralKey || '');
  const [loading, setLoading] = useState(false);
  const [cacheLoading, setCacheLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [installUrl, setInstallUrl] = useState('');
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [mistralVerifying, setMistralVerifying] = useState(false);
  const [mistralVerified, setMistralVerified] = useState(false);
  const [mistralVerifyError, setMistralVerifyError] = useState('');

  const handleVerifyMistralKey = async () => {
    if (!mistralKey.trim()) return;
    setMistralVerifying(true);
    setMistralVerified(false);
    setMistralVerifyError('');
    try {
      const result = await api.validateMistralKey(mistralKey.trim());
      if (result.valid) {
        setMistralVerified(true);
      } else {
        setMistralVerifyError(result.error || 'Chiave Mistral non valida.');
      }
    } catch {
      setMistralVerifyError('Errore di connessione durante la verifica.');
    }
    setMistralVerifying(false);
  };

  const handleSave = async () => {
    setLoading(true);
    setError('');
    setSuccess(false);

    const currentDNA = activeProfile?.settings?.manualDNA ?? [];
    const currentSuggestedDNA = activeProfile?.settings?.suggestedDNA ?? [];
    onUpdateProfile(activeProfileId, {
      settings: {
        fastRefresh,
        tmdbKey,
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
        tmdbKey,
        mistralKey,
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
    <div className="space-y-6">
      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* HERO SECTION: Salva, Aggiorna, Installa & Backup                  */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      <section className="rounded-2xl border-2 border-primary/40 bg-gradient-to-br from-primary-dark/60 via-primary/5 to-transparent p-6 space-y-5 shadow-2xl shadow-primary/20">
        <div className="flex items-center gap-3">
          <div className="size-10 rounded-xl bg-primary/20 text-primary flex items-center justify-center">
            <Rocket className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-base font-black text-marrow-deep">Salva & Installa</h3>
            <p className="text-xs text-marrow-light font-medium">Salva la configurazione, installa l&apos;addon su Stremio e gestisci i backup</p>
          </div>
        </div>

        {/* Save Button */}
        <Button
          className="w-full py-3 bg-primary text-white hover:bg-accent font-bold text-sm shadow-xl shadow-primary/30"
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
          <div className="rounded-lg border border-destructive/20 bg-destructive/10 p-3">
            <p className="text-sm text-destructive">{error}</p>
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
                className="flex-1 text-xs bg-secondary hover:bg-secondary/80 text-secondary-foreground"
              >
                <ExternalLink className="h-3.5 w-3.5 mr-1" />
                Installa su Stremio
              </Button>
            </div>
          </div>
        )}

        {/* Quick install link (if already configured) */}
        {userId && !success && (
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 space-y-3">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
              <div>
                <p className="text-sm font-black text-emerald-700 uppercase tracking-wide">Addon già configurato</p>
                <p className="text-xs text-marrow-light font-medium">Reinstalla o copia il link per aggiornare</p>
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
                className="flex-1 text-xs bg-primary hover:bg-primary-dark text-white shadow-md shadow-primary/20 transition-all font-black"
              >
                <ExternalLink className="h-3.5 w-3.5 mr-1" />
                Installa su Stremio
              </Button>
            </div>
          </div>
        )}

        <Separator className="bg-marrow-light/10" />

        {/* Backup & Import */}
        <div className="flex gap-3">
          <Button variant="outline" onClick={handleExport} className="flex-1 font-black text-marrow-deep border-marrow-light/30 bg-white/40 hover:bg-white/60">
            <Download className="h-4 w-4 mr-2" />
            Esporta Backup
          </Button>
          <Button variant="outline" onClick={handleImport} className="flex-1 font-black text-marrow-deep border-marrow-light/30 bg-white/40 hover:bg-white/60">
            <Upload className="h-4 w-4 mr-2" />
            Importa Backup
          </Button>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* Cache & Performance                                                */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      <section className="rounded-xl border border-marrow-light/10 bg-white/40 p-5 space-y-4 shadow-sm backdrop-blur-sm">
        <div className="flex items-center gap-2 text-primary">
          <span className="material-symbols-outlined text-lg">bolt</span>
          <h3 className="text-sm font-black uppercase tracking-widest">Cache & Performance</h3>
        </div>

        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-black text-marrow-deep">Refresh rapido</p>
            <p className="text-xs text-marrow-light font-medium">Aggiorna i cataloghi più frequentemente</p>
          </div>
          <Switch checked={fastRefresh} onCheckedChange={setFastRefresh} />
        </div>

        <Separator className="bg-marrow-light/10" />

        <Button
          variant="outline"
          onClick={handleClearCache}
          disabled={cacheLoading}
          className="w-full font-black text-marrow-deep border-marrow-light/30 bg-white/40 hover:bg-white/60"
        >
          {cacheLoading ? (
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
          ) : (
            <RefreshCw className="h-4 w-4 mr-2" />
          )}
          Svuota Cache
        </Button>

        <div className="pt-2">
          <Link
            href="/admin/cache"
            className="flex items-center justify-center gap-2 w-full py-2.5 rounded-lg border border-primary/30 bg-primary/5 text-primary text-xs font-black hover:bg-primary/10 transition-all uppercase tracking-wide"
          >
            <Server className="h-3.5 w-3.5" />
            Gestione Avanzata Cache (Admin)
            <ExternalLink className="h-3 w-3 opacity-50" />
          </Link>
          <p className="mt-2 text-[10px] text-center text-marrow-deep font-black uppercase tracking-tighter opacity-70">
            Visualizza statistiche dettagliate per Redis e MongoDB
          </p>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* Global API Keys                                                    */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      <section className="rounded-xl border border-marrow-light/10 bg-white/40 p-5 space-y-4 shadow-sm backdrop-blur-sm">
        <div className="flex items-center gap-2 text-primary">
          <span className="material-symbols-outlined text-lg">key</span>
          <h3 className="text-sm font-black uppercase tracking-widest">Chiavi API Globale</h3>
        </div>
        
        <div className="space-y-4">
          <div>
            <Label htmlFor="tmdb-key" className="text-marrow-deep font-black uppercase tracking-wide text-[10px]">TMDB API Key (Opzionale)</Label>
            <Input
              id="tmdb-key"
              value={tmdbKey}
              onChange={(e) => setTmdbKey(e.target.value)}
              placeholder="La tua API key TMDB..."
              className="mt-1 bg-white border-marrow-light/10 focus:border-primary/50 text-marrow-deep placeholder:text-marrow-light/30"
              type="password"
            />
            <p className="mt-1.5 text-xs text-marrow-light font-medium">
              Aiuta la rete globale fornendo limiti aumentati o usa il tuo account.
            </p>
          </div>

          <div>
            <Label htmlFor="mistral-key" className="text-marrow-deep font-black uppercase tracking-wide text-[10px]">Mistral API Key (Obbligatoria per AI)</Label>
            <div className="flex gap-2 mt-1">
              <Input
                id="mistral-key"
                value={mistralKey}
                onChange={(e) => {
                  setMistralKey(e.target.value);
                  setMistralVerified(false);
                  setMistralVerifyError('');
                }}
                placeholder="La tua API key Mistral..."
                className="bg-white border-marrow-light/10 focus:border-primary/50 text-marrow-deep placeholder:text-marrow-light/30"
                type="password"
              />
              <Button
                variant="outline"
                size="sm"
                onClick={handleVerifyMistralKey}
                disabled={!mistralKey.trim() || mistralVerifying}
                className="shrink-0"
              >
                {mistralVerifying ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : mistralVerified ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                ) : (
                  <ShieldCheck className="h-4 w-4" />
                )}
                <span className="ml-1">{mistralVerified ? 'Valida' : 'Verifica'}</span>
              </Button>
            </div>
            {mistralVerified && (
              <p className="mt-1.5 text-xs text-emerald-500 font-medium">✓ Chiave Mistral verificata con successo.</p>
            )}
            {mistralVerifyError && (
              <p className="mt-1.5 text-xs text-destructive">{mistralVerifyError}</p>
            )}
            <p className="mt-1.5 text-xs text-marrow-light font-medium">
              Obbligatoria per generare cataloghi AI. Verifica la chiave prima di salvare.
            </p>
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* Account                                                            */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      <section className="rounded-xl border border-marrow-light/10 bg-white/40 p-5 space-y-4 shadow-sm backdrop-blur-sm">
        <div className="flex items-center gap-2 text-primary">
          <span className="material-symbols-outlined text-lg">person</span>
          <h3 className="text-sm font-black uppercase tracking-widest">Account</h3>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between rounded-lg bg-white/60 px-4 py-3 border border-marrow-light/10">
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

          <div className="flex items-center justify-between rounded-lg bg-white/60 px-4 py-3 border border-marrow-light/10">
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
