'use client';
import { useState, useRef } from 'react';
import { TraktAuthModal } from '@/components/modals/TraktAuthModal';
import { Profile, Catalog, MyList, CataloghiEsploraResponse } from '@/types';
import { AppTab } from '@/components/layout/TabNav';
import { UserLibraryPanel } from '@/components/dashboard/UserLibraryPanel';
import { CreatorPanel } from '@/components/dashboard/CreatorPanel';
import { CatalogLivePreview } from '@/components/dashboard/CatalogLivePreview';
import { Slider } from '@/components/ui/slider';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import {
  Loader2, CheckCircle2, Copy, ExternalLink, LogOut, Save, Rocket, User, Sliders, Sparkles
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
  activeTab?: AppTab;
  onTabChange?: (tab: AppTab) => void;
  onAddCatalog?: (profileId: string, catalog: Catalog) => void;
  onSaveMyList?: (list: MyList) => void;
  onConfigChanged?: (configVersion: string) => void;
  cataloghiData?: CataloghiEsploraResponse | null;
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
  activeTab = 'settings',
  onTabChange,
  onAddCatalog,
  onSaveMyList,
  onConfigChanged,
  cataloghiData,
}: SettingsPageProps) {
  const activeProfile = profiles.find((p) => p.id === activeProfileId) ?? profiles[0];
  const settings = activeProfile?.settings ?? {};

  const effectiveTab: AppTab = activeTab === 'dashboard' || activeTab === 'explore' ? 'settings' : activeTab;

  const settingsPills: { id: AppTab; label: string }[] = [
    { id: 'settings', label: 'Impostazioni' },
    { id: 'library', label: 'Libreria' },
    { id: 'creator', label: 'Creatore' },
    { id: 'gusti', label: 'Gusti' },
  ];

  // Cursori Gusti (Tonalità e Notorietà)
  const initialSliders = activeProfile?.settings?.sliders || activeProfile?.sliders || { tonalita: 0, notorieta: 0 };
  const [tonalita, setTonalita] = useState<number>(initialSliders.tonalita ?? initialSliders.cozy ?? 0);
  const [notorieta, setNotorieta] = useState<number>(initialSliders.notorieta ?? initialSliders.canone ?? 0);
  const sliderTimerRef = useRef<NodeJS.Timeout | null>(null);

  const handleSliderChange = (newTonalita: number, newNotorieta: number) => {
    setTonalita(newTonalita);
    setNotorieta(newNotorieta);

    if (sliderTimerRef.current) clearTimeout(sliderTimerRef.current);
    sliderTimerRef.current = setTimeout(async () => {
      try {
        const res = await api.configure({
          sliders: { tonalita: newTonalita, notorieta: newNotorieta },
        });
        if (res?.configVersion && onConfigChanged) {
          onConfigChanged(res.configVersion);
        }
      } catch (err) {
        console.warn('[SettingsPage] Errore salvataggio cursori:', err);
      }
    }, 500);
  };

  const previewCatalog = cataloghiData?.gruppi?.suggerimenti?.[0] || cataloghiData?.gruppi?.tutti?.[0] || null;
  const previewCatalogId = previewCatalog?.id || null;
  const previewMediaType = (previewCatalog?.stremioType === 'series' || (!previewCatalog?.stremioType && previewCatalog?.media === 'series')) ? 'series' : 'movie';

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

    onUpdateProfile(activeProfileId, {
      settings: {
        ...settings,
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
    <div className="w-full flex flex-col items-center gap-6 min-w-0">
      {/* Quattro pillole selezionabili (correzione 7: Impostazioni · Libreria · Creatore · Gusti) */}
      {onTabChange && (
        <div className="flex items-center justify-center w-full">
          <div className="flex items-center gap-1.5 p-1.5 bg-white/40 rounded-2xl border border-marrow-light/10 overflow-x-auto no-scrollbar">
            {settingsPills.map(({ id, label }) => {
              const isActive = effectiveTab === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => onTabChange(id)}
                  className={`flex items-center gap-2 px-4 sm:px-6 py-2.5 rounded-xl text-xs sm:text-sm font-black uppercase tracking-wider transition-all touch-manipulation min-h-[40px] whitespace-nowrap ${
                    isActive
                      ? 'bg-primary text-white shadow-lg shadow-primary/30'
                      : 'text-marrow-deep hover:text-primary hover:bg-white/60'
                  }`}
                >
                  <span>{label}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Pannello 1: Impostazioni */}
      {effectiveTab === 'settings' && (
        <div className="w-full max-w-5xl mx-auto space-y-4 sm:space-y-6 md:space-y-0 md:grid md:grid-cols-2 md:gap-6 items-start">
          {/* HERO SECTION: Salva, Aggiorna, Installa & Backup */}
          <section className="rounded-2xl border-2 border-primary/40 bg-white/40 p-3 sm:p-6 space-y-3 sm:space-y-5 shadow-2xl shadow-primary/10">
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

          {/* Account */}
          <section className="rounded-xl border border-marrow-light/10 bg-white/40 p-3 sm:p-5 space-y-3 sm:space-y-4 shadow-sm">
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
        </div>
      )}

      {/* Pannello 2: Libreria Utente */}
      {effectiveTab === 'library' && (
        <div className="w-full max-w-5xl mx-auto space-y-6 min-w-0">
          <div className="flex flex-col gap-1">
            <h2 className="text-xl sm:text-2xl font-black text-marrow-deep tracking-tight">Libreria Utente</h2>
            <p className="text-xs sm:text-sm text-marrow-light font-medium">
              La libreria dell&apos;account: titoli salvati e watchlist personale.
            </p>
          </div>
          <div className="glass-panel p-3 sm:p-6 bg-white/40 rounded-2xl border border-marrow-light/10">
            {activeProfile && userId && (
              <UserLibraryPanel
                profileId={activeProfile.id}
                userId={userId}
                profile={activeProfile}
                onUpdateProfile={onUpdateProfile}
                onCreateCatalog={(list) => {
                  if (onSaveMyList) onSaveMyList(list);
                  if (onTabChange) onTabChange('dashboard');
                }}
              />
            )}
          </div>
        </div>
      )}

      {/* Pannello 3: Creatore di Cataloghi */}
      {effectiveTab === 'creator' && (
        <div className="w-full max-w-5xl mx-auto space-y-6 min-w-0">
          <div className="flex flex-col gap-1">
            <h2 className="text-xl sm:text-2xl font-black text-marrow-deep tracking-tight">Creatore di Cataloghi</h2>
            <p className="text-xs sm:text-sm text-marrow-light font-medium">
              Crea nuovi cataloghi tematici personalizzati a livello di account.
            </p>
          </div>
          <div className="glass-panel p-3 sm:p-6 bg-white/40 rounded-2xl border border-marrow-light/10">
            <CreatorPanel
              onAddCatalog={(catalog) => {
                if (onAddCatalog) onAddCatalog(activeProfileId, catalog);
                if (onTabChange) onTabChange('dashboard');
              }}
            />
          </div>
        </div>
      )}

      {/* Pannello 4: Gusti (Cursori Raccomandazione) */}
      {effectiveTab === 'gusti' && (
        <div className="w-full max-w-5xl mx-auto space-y-6 min-w-0">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <Sliders className="h-6 w-6 text-primary" />
              <h2 className="text-xl sm:text-2xl font-black text-marrow-deep tracking-tight">
                Gusti (Cursori Raccomandazione)
              </h2>
            </div>
            <p className="text-xs sm:text-sm text-marrow-light font-medium">
              Cursori unici per l&apos;account: regolano l&apos;atmosfera e la rarità delle raccomandazioni generate.
            </p>
          </div>

          <div className="space-y-6 glass-panel p-4 sm:p-6 bg-white/40 rounded-2xl border border-marrow-light/10">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-1">
              {/* Cursore 1: Tonalità */}
              <div className="space-y-2">
                <div className="flex justify-between items-center text-xs">
                  <span className="font-black uppercase tracking-wider text-marrow-deep">Tonalità</span>
                  <span className="font-bold text-primary">
                    {tonalita < -0.2 ? 'Cupa / Intensa' : tonalita > 0.2 ? 'Leggera / Cozy' : 'Bilanciata'} (
                    {tonalita.toFixed(1)})
                  </span>
                </div>
                <Slider
                  value={[tonalita]}
                  min={-1}
                  max={1}
                  step={0.1}
                  onValueChange={([val]) => handleSliderChange(val, notorieta)}
                />
                <div className="flex justify-between text-[11px] text-marrow-light/70 font-semibold px-0.5">
                  <span>Cupa / Tesa</span>
                  <span>Equilibrata</span>
                  <span>Leggera / Cozy</span>
                </div>
              </div>

              {/* Cursore 2: Notorietà */}
              <div className="space-y-2">
                <div className="flex justify-between items-center text-xs">
                  <span className="font-black uppercase tracking-wider text-marrow-deep">Notorietà</span>
                  <span className="font-bold text-primary">
                    {notorieta < -0.2 ? 'Di nicchia / Raro' : notorieta > 0.2 ? 'Mainstream / Popolare' : 'Bilanciata'} (
                    {notorieta.toFixed(1)})
                  </span>
                </div>
                <Slider
                  value={[notorieta]}
                  min={-1}
                  max={1}
                  step={0.1}
                  onValueChange={([val]) => handleSliderChange(tonalita, val)}
                />
                <div className="flex justify-between text-[11px] text-marrow-light/70 font-semibold px-0.5">
                  <span>Di nicchia / Cult</span>
                  <span>Equilibrata</span>
                  <span>Popolari / Mainstream</span>
                </div>
              </div>
            </div>

            {/* Anteprima in tempo reale che reagisce ai cursori */}
            {previewCatalogId && (
              <div className="pt-2 border-t border-marrow-light/10">
                <div className="flex items-center gap-1.5 mb-2">
                  <Sparkles className="h-3.5 w-3.5 text-primary" />
                  <span className="text-xs font-bold text-marrow-deep uppercase tracking-wider">
                    Anteprima in tempo reale
                  </span>
                </div>
                <div className="rounded-xl border border-marrow-light/10 bg-white/30 p-2 overflow-hidden">
                  <CatalogLivePreview
                    catalogId={previewCatalogId}
                    userId={userId || 'global'}
                    profileId={activeProfile?.id || 'global'}
                    sliders={{ tonalita, notorieta }}
                    type={previewMediaType}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      )}

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
