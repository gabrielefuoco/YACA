'use client';
import { Profile, ProfileTemplate, DNAItem } from '@/types';
import { AutocompleteSearch } from '@/components/shared/AutocompleteSearch';
import { api } from '@/lib/api';
import { X, BrainCircuit } from 'lucide-react';

interface ProfileSettingsPanelProps {
    profile: Profile;
    profileTemplates: ProfileTemplate[];
    onApplyTemplate: (template: ProfileTemplate) => void;
    onUpdateProfile: (id: string, updates: Partial<Profile>) => void;
    onSetActive: (id: string) => void;
    onRemove: (id: string) => void;
    isActive: boolean;
    startRename: () => void;
}

export function ProfileSettingsPanel({
    profile,
    profileTemplates,
    onApplyTemplate,
    onUpdateProfile,
    onSetActive,
    onRemove,
    isActive,
    startRename
}: ProfileSettingsPanelProps) {
    const profileDNA: DNAItem[] = profile?.settings?.manualDNA ?? [];
    const suggestedDNA: DNAItem[] = profile?.settings?.suggestedDNA ?? [];
    const isGlobalProfile = profile.id === 'global';

    const handleAddDNA = (item: DNAItem) => {
        if (isGlobalProfile) return;
        if (profileDNA.find((p) => String(p.id) === String(item.id))) return;
        const newDNA = [...profileDNA, item];
        onUpdateProfile(profile.id, {
            settings: { ...profile.settings, manualDNA: newDNA },
        });
    };

    const handleRemoveDNA = (id: string) => {
        if (isGlobalProfile) return;
        const newDNA = profileDNA.filter((p) => String(p.id) !== String(id));
        onUpdateProfile(profile.id, {
            settings: { ...profile.settings, manualDNA: newDNA },
        });
    };

    const handleApplyTemplate = (template: ProfileTemplate) => {
        const hasExistingDNA = profileDNA.length > 0;
        if (hasExistingDNA) {
            const confirm = window.confirm(
                `Stai applicando il modello "${template.name}".\n\nVuoi che YACA aggiorni automaticamente il "Profile DNA" (generi e temi) basandosi sui nuovi preset?`
            );
            if (confirm) {
                // We'll let the backend handle the DNA inference if possible, 
                // but for now we just apply the template.
                // In a more advanced version, we'd trigger a DNA rebuild.
            }
        }
        onApplyTemplate(template);
        setTimeout(() => {
            window.location.reload();
        }, 600);
    };

    return (
        <div className="flex flex-col rounded-xl border-2 border-primary/30 bg-white/5 dark:bg-slate-800/60 overflow-hidden shadow-lg shadow-primary/5 mt-2">
            <div className="px-6 py-4 border-b border-primary/10 flex items-center justify-between bg-primary/5">
                <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-primary">settings</span>
                    <span className="text-sm font-bold">Impostazioni Profilo: <span className="text-primary">{profile.name}</span></span>
                </div>
                <div className="flex items-center gap-2">
                    {!isActive && (
                        <button onClick={() => onSetActive(profile.id)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-white text-xs font-bold shadow-md hover:brightness-110 transition-all">
                            <span className="material-symbols-outlined text-sm">check</span>
                            <span>Attiva Profilo</span>
                        </button>
                    )}
                    {!isGlobalProfile && (
                        <>
                            <button onClick={startRename} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-700 hover:bg-primary/20 text-slate-700 dark:text-slate-200 text-xs font-bold transition-all">
                                <span className="material-symbols-outlined text-sm">edit</span>
                                <span>Rinomina</span>
                            </button>
                            <button onClick={() => onRemove(profile.id)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500 hover:text-white text-rose-500 text-xs font-bold transition-all">
                                <span className="material-symbols-outlined text-sm">delete</span>
                                <span>Elimina</span>
                            </button>
                        </>
                    )}
                </div>
            </div>

            <div className="p-6 flex flex-col gap-8 bg-slate-100 dark:bg-transparent">
                {/* Modelli Suggeriti Section */}
                {profileTemplates.length > 0 && (
                    <details className="group border border-slate-200 dark:border-slate-700/50 bg-white dark:bg-slate-800/40 rounded-xl p-4 shadow-sm [&_summary::-webkit-details-marker]:hidden">
                        <summary className="flex cursor-pointer items-center justify-between font-bold text-sm select-none">
                            <div className="flex items-center gap-2 text-primary">
                                <span className="material-symbols-outlined">auto_awesome</span>
                                <span className="text-sm font-black uppercase tracking-widest">Modelli Suggeriti</span>
                                <span className="text-xs font-normal normal-case text-slate-400 ml-1">({profileTemplates.length})</span>
                            </div>
                            <span className="transition group-open:rotate-180 text-slate-400">
                                <svg fill="none" height="20" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" viewBox="0 0 24 24" width="20"><path d="M6 9l6 6 6-6"></path></svg>
                            </span>
                        </summary>
                        <div className="mt-3 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                            {profileTemplates.map((tpl) => (
                                <div
                                    key={tpl.id}
                                    onClick={() => handleApplyTemplate(tpl)}
                                    className="p-3 rounded-lg bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700 hover:border-primary transition-all cursor-pointer"
                                >
                                    <p className="text-slate-900 dark:text-slate-100 font-bold text-xs truncate">{tpl.name}</p>
                                    <p className="text-slate-500 dark:text-slate-400 text-[10px] mt-0.5 line-clamp-2">{tpl.description}</p>
                                </div>
                            ))}
                        </div>
                    </details>
                )}

                {/* Profile DNA Section */}
                <div className="flex flex-col gap-4">
                    <div className="flex items-center gap-3 text-primary">
                        <BrainCircuit className="h-5 w-5" />
                        <p className="text-sm font-black uppercase tracking-widest">Profile DNA</p>
                    </div>
                    <div className="flex flex-col gap-3">
                        <div className="rounded-lg border border-slate-200 dark:border-slate-700/60 bg-white dark:bg-slate-900/40 p-4">
                            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-3">L&apos;algoritmo dice che ami...</p>
                            {suggestedDNA.length > 0 ? (
                                <div className="flex flex-wrap gap-2">
                                    {suggestedDNA.map((p) => (
                                        <span
                                            key={`${p.type}-${p.id}`}
                                            className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold ${
                                                p.type === 'genre'
                                                    ? 'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300'
                                                    : p.type === 'keyword'
                                                        ? 'bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-300'
                                                        : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300'
                                            }`}
                                        >
                                            {p.name}
                                        </span>
                                    ))}
                                </div>
                            ) : (
                                <p className="text-xs text-slate-400">Apprendimento in corso: attiva cataloghi o guarda contenuti per arricchire il DNA.</p>
                            )}
                        </div>

                        {!isGlobalProfile && (
                            <div className="rounded-lg border border-slate-200 dark:border-slate-700/60 bg-white dark:bg-slate-900/40 p-4">
                                <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-3">Forza Gusti (DNA Manuale)</p>
                                <div className="flex flex-wrap gap-2 mb-3">
                                    {profileDNA.map((p) => (
                                        <span
                                            key={`${p.type}-${p.id}`}
                                            className="inline-flex items-center gap-1 rounded bg-primary/20 text-primary px-3 py-1.5 text-xs font-bold"
                                        >
                                            {p.type === 'genre' ? '🎭 ' : p.type === 'country' ? '🌍 ' : '🏷️ '} {p.name}
                                            <button
                                                onClick={() => handleRemoveDNA(String(p.id))}
                                                className="ml-1 text-primary hover:text-primary/70 transition-colors"
                                            >
                                                <X className="h-3 w-3" />
                                            </button>
                                        </span>
                                    ))}
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-black dark:text-white">
                                    <div className="relative [&_input]:pl-10 [&_input]:py-3 [&_input]:bg-white dark:[&_input]:bg-slate-800 [&_input]:border-slate-200 dark:[&_input]:border-slate-700 [&_input]:rounded-lg [&_input]:text-sm">
                                        <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 z-10 pointer-events-none">movie</span>
                                        <AutocompleteSearch
                                            placeholder="Aggiungi genere (es. Thriller)"
                                            searchFn={api.searchTmdbGenres}
                                            onSelect={(item) => handleAddDNA({ type: 'genre', id: String(item.id), name: item.name })}
                                        />
                                    </div>
                                    <div className="relative [&_input]:pl-10 [&_input]:py-3 [&_input]:bg-white dark:[&_input]:bg-slate-800 [&_input]:border-slate-200 dark:[&_input]:border-slate-700 [&_input]:rounded-lg [&_input]:text-sm">
                                        <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 z-10 pointer-events-none">tag</span>
                                        <AutocompleteSearch
                                            placeholder="Aggiungi keyword (es. Cyberpunk)"
                                            searchFn={api.searchTmdbKeywords}
                                            onSelect={(item) => handleAddDNA({ type: 'keyword', id: String(item.id), name: item.name })}
                                        />
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
