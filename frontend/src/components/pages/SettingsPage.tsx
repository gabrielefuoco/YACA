'use client';
import { useState } from 'react';
import { Profile, AppConfig } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Separator } from '@/components/ui/separator';
import { api } from '@/lib/api';
import { LOCAL_STORAGE_KEYS } from '@/lib/constants';
import {
  Loader2, CheckCircle2, Copy, ExternalLink, LogOut, Trash2, Download, Upload, RefreshCw
} from 'lucide-react';
import { encodeConfig } from '@/lib/configCodec';
import { profilesToApiPayload } from '@/lib/utils';

interface SettingsPageProps {
  profiles: Profile[];
  activeProfileId: string;
  stremioEmail?: string;
  stremioAuthKey?: string;
  traktToken?: string | null;
  traktRefreshToken?: string | null;
  configVersion?: string;
  onUpdateProfile: (id: string, updates: Partial<Profile>) => void;
  onLogout: () => void;
  onDisconnectTrakt: () => void;
  onConfigSaved: (base64: string) => void;
}

export function SettingsPage({
  profiles,
  activeProfileId,
  stremioEmail,
  stremioAuthKey,
  traktToken,
  traktRefreshToken,
  configVersion,
  onUpdateProfile,
  onLogout,
  onDisconnectTrakt,
  onConfigSaved,
}: SettingsPageProps) {
  const activeProfile = profiles.find((p) => p.id === activeProfileId) ?? profiles[0];
  const settings = activeProfile?.settings ?? {};

  const [voteAvgMin, setVoteAvgMin] = useState(settings.voteAverageMin ?? 0);
  const [voteCountMin, setVoteCountMin] = useState(settings.voteCountMin ?? 0);
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

    // Update active profile settings
    onUpdateProfile(activeProfileId, {
      settings: { voteAverageMin: voteAvgMin, voteCountMin, fastRefresh, tmdbKey },
    });

    // Wait a tick for state to update
    await new Promise((r) => setTimeout(r, 50));

    const updatedProfiles = profiles.map((p) =>
      p.id === activeProfileId
        ? { ...p, settings: { voteAverageMin: voteAvgMin, voteCountMin, fastRefresh, tmdbKey } }
        : p
    );

    // Transform frontend Profile shape to the format the backend configure API expects
    const apiProfiles = profilesToApiPayload(updatedProfiles);

    try {
      const data = await api.configure({
        profiles: apiProfiles,
        activeProfileId,
        stremioAuthKey,
        traktToken,
        traktRefreshToken,
        configVersion,
      });

      if (data.configBase64) {
        onConfigSaved(data.configBase64);
        // Compute install URL from configBase64 (backend doesn't return installUrl)
        const host = window.location.host;
        const cv = data.configVersion;
        const manifestPath = cv
          ? `${data.configBase64}/${cv}/manifest.json`
          : `${data.configBase64}/manifest.json`;
        const computedInstallUrl = `stremio://${host}/${manifestPath}`;
        setInstallUrl(computedInstallUrl);
        setSuccess(true);

        // Auto-update addon in Stremio if auth available
        if (stremioAuthKey) {
          const httpsManifestUrl = `https://${host}/${manifestPath}`;
          try {
            await api.stremioAddonUpdate(stremioAuthKey, httpsManifestUrl);
          } catch {}
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
    } catch {}
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
    const blob = new Blob([encodeConfig(config)], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'yaca-backup.txt';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.txt,.json';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        const content = reader.result as string;
        try {
          localStorage.setItem(LOCAL_STORAGE_KEYS.CONFIG, content.trim());
          window.location.reload();
        } catch {}
      };
      reader.readAsText(file);
    };
    input.click();
  };

  return (
    <div className="space-y-6">
      {/* Quality filters */}
      <section className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-4">
        <h3 className="text-sm font-semibold text-white/70 uppercase tracking-wider">
          🎯 Filtri di Qualità
        </h3>

        <div className="space-y-3">
          <div>
            <Label className="mb-2 block">
              Voto medio minimo: {voteAvgMin > 0 ? voteAvgMin.toFixed(1) : 'Disabilitato'}
            </Label>
            <Slider
              min={0}
              max={9}
              step={0.5}
              value={[voteAvgMin]}
              onValueChange={([v]) => setVoteAvgMin(v)}
            />
          </div>

          <div>
            <Label className="mb-2 block">
              Numero voti minimo: {voteCountMin > 0 ? voteCountMin.toLocaleString() : 'Disabilitato'}
            </Label>
            <Slider
              min={0}
              max={5000}
              step={100}
              value={[voteCountMin]}
              onValueChange={([v]) => setVoteCountMin(v)}
            />
          </div>
        </div>
      </section>

      {/* Cache settings */}
      <section className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-4">
        <h3 className="text-sm font-semibold text-white/70 uppercase tracking-wider">
          ⚡ Cache & Performance
        </h3>

        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-white">Refresh rapido</p>
            <p className="text-xs text-white/40">Aggiorna i cataloghi più frequentemente</p>
          </div>
          <Switch checked={fastRefresh} onCheckedChange={setFastRefresh} />
        </div>

        <Separator />

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

      {/* TMDB API Key */}
      <section className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-3">
        <h3 className="text-sm font-semibold text-white/70 uppercase tracking-wider">
          🔑 API Key TMDB (opzionale)
        </h3>
        <div>
          <Label htmlFor="tmdb-key">Chiave API TMDB personalizzata</Label>
          <Input
            id="tmdb-key"
            value={tmdbKey}
            onChange={(e) => setTmdbKey(e.target.value)}
            placeholder="La tua API key TMDB..."
            className="mt-1"
            type="password"
          />
          <p className="mt-1 text-xs text-white/40">
            Usa una chiave API TMDB personale per limiti più alti
          </p>
        </div>
      </section>

      {/* Account status */}
      <section className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-3">
        <h3 className="text-sm font-semibold text-white/70 uppercase tracking-wider">
          👤 Account
        </h3>

        <div className="space-y-2">
          <div className="flex items-center justify-between rounded-lg bg-white/5 px-3 py-2">
            <div>
              <p className="text-xs text-white/40">Stremio</p>
              <p className="text-sm text-white">
                {stremioEmail ?? 'Non connesso'}
              </p>
            </div>
            {stremioEmail && (
              <span className="h-2 w-2 rounded-full bg-emerald-400" />
            )}
          </div>

          <div className="flex items-center justify-between rounded-lg bg-white/5 px-3 py-2">
            <div>
              <p className="text-xs text-white/40">Trakt</p>
              <p className="text-sm text-white">
                {traktToken ? 'Connesso' : 'Non connesso'}
              </p>
            </div>
            {traktToken ? (
              <span className="h-2 w-2 rounded-full bg-emerald-400" />
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

      {/* Backup */}
      <section className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-3">
        <h3 className="text-sm font-semibold text-white/70 uppercase tracking-wider">
          💾 Backup & Ripristino
        </h3>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleExport} className="flex-1">
            <Download className="h-4 w-4 mr-2" />
            Esporta
          </Button>
          <Button variant="outline" onClick={handleImport} className="flex-1">
            <Upload className="h-4 w-4 mr-2" />
            Importa
          </Button>
        </div>
      </section>

      {/* Error */}
      {error && (
        <div className="rounded-lg border border-red-500/20 bg-red-500/10 p-3">
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}

      {/* Success state */}
      {success && installUrl && (
        <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-4 space-y-3">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-emerald-400 shrink-0" />
            <p className="text-sm font-medium text-emerald-400">Configurazione generata!</p>
          </div>

          <div className="rounded-lg bg-black/30 p-3 font-mono text-xs text-white/70 break-all">
            {installUrl}
          </div>

          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleCopy(installUrl)}
              className="flex-1 text-xs"
            >
              {copied ? (
                <CheckCircle2 className="h-3.5 w-3.5 mr-1 text-emerald-400" />
              ) : (
                <Copy className="h-3.5 w-3.5 mr-1" />
              )}
              {copied ? 'Copiato!' : 'Copia link'}
            </Button>
            <Button
              size="sm"
              onClick={() => window.open(installUrl, '_blank')}
              className="flex-1 text-xs"
            >
              <ExternalLink className="h-3.5 w-3.5 mr-1" />
              Installa su Stremio
            </Button>
          </div>
        </div>
      )}

      {/* Save button */}
      <Button
        className="w-full"
        size="lg"
        onClick={handleSave}
        disabled={loading}
      >
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin mr-2" />
        ) : (
          '🔗 '
        )}
        Genera Link di Installazione
      </Button>
    </div>
  );
}
