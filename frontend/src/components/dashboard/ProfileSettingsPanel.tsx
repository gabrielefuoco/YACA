'use client';
import { Profile, ProfileTemplate, Pillar } from '@/types';
import { AutocompleteSearch } from '@/components/shared/AutocompleteSearch';
import { api } from '@/lib/api';
import { X, Plus } from 'lucide-react';

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
    const profileKeywords: Pillar[] = profile?.settings?.manualPillars ?? [];
    const suggestedKeywords: Pillar[] = profile?.settings?.suggestedPillars ?? [];

    const handleAddPillar = (pillar: Pillar) => {
        if (profileKeywords.find((p) => String(p.id) === String(pillar.id))) return;
        const newPillars = [...profileKeywords, pillar];
        onUpdateProfile(profile.id, {
            settings: { ...profile.settings, manualPillars: newPillars },
        });
    };

    const handleRemovePillar = (pillarId: string) => {
        const newPillars = profileKeywords.filter((p) => String(p.id) !== String(pillarId));
        onUpdateProfile(profile.id, {
            settings: { ...profile.settings, manualPillars: newPillars },
        });
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
                    <button onClick={startRename} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-700 hover:bg-primary/20 text-slate-700 dark:text-slate-200 text-xs font-bold transition-all">
                        <span className="material-symbols-outlined text-sm">edit</span>
                        <span>Rinomina</span>
                    </button>
                    <button onClick={() => onRemove(profile.id)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500 hover:text-white text-rose-500 text-xs font-bold transition-all">
                        <span className="material-symbols-outlined text-sm">delete</span>
                        <span>Elimina</span>
                    </button>
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
                                    onClick={() => onApplyTemplate(tpl)}
                                    className="p-3 rounded-lg bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700 hover:border-primary transition-all cursor-pointer"
                                >
                                    <p className="text-slate-900 dark:text-slate-100 font-bold text-xs truncate">{tpl.name}</p>
                                    <p className="text-slate-500 dark:text-slate-400 text-[10px] mt-0.5 line-clamp-2">{tpl.description}</p>
                                </div>
                            ))}
                        </div>
                    </details>
                )}

                {/* Parole Chiave Section */}
                <div className="flex flex-col gap-4">
                    <div className="flex items-center gap-3 text-primary">
                        <span className="material-symbols-outlined">key</span>
                        <p className="text-sm font-black uppercase tracking-widest">Parole Chiave</p>
                    </div>
                    <div className="flex flex-col gap-3">
                        <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                            Vincola le raccomandazioni del profilo <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-100 font-bold"><span className="material-symbols-outlined text-[10px]">home</span> {profile.name}</span> a temi specifici. Troppi vincoli possono ridurre i risultati.
                        </p>

                        <div className="flex flex-wrap gap-2 mb-1">
                            {profileKeywords.map((p) => (
                                <span
                                    key={p.id}
                                    className="inline-flex items-center gap-1 rounded bg-primary/20 text-primary px-3 py-1.5 text-xs font-bold"
                                >
                                    {p.type === 'genre' ? '🎭 ' : p.type === 'country' ? '🌍 ' : ''} {p.name}
                                    <button
                                        onClick={() => handleRemovePillar(String(p.id))}
                                        className="ml-1 text-primary hover:text-primary/70 transition-colors"
                                    >
                                        <X className="h-3 w-3" />
                                    </button>
                                </span>
                            ))}
                        </div>

                        <div className="relative text-black dark:text-white">
                            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 z-10 pointer-events-none">search</span>
                            <div className="w-full relative [&_input]:pl-10 [&_input]:py-3 [&_input]:bg-white dark:[&_input]:bg-slate-800 [&_input]:border-slate-200 dark:[&_input]:border-slate-700 [&_input]:rounded-lg [&_input]:text-sm">
                                <AutocompleteSearch
                                    placeholder="Aggiungi interessi (es. Anime, Sci-Fi...)"
                                    searchFn={api.searchTmdbKeywords}
                                    onSelect={(item) => handleAddPillar({ type: 'keyword', id: String(item.id), name: item.name })}
                                />
                            </div>
                        </div>

                        {suggestedKeywords.filter((sp) => !profileKeywords.find((mp) => String(mp.id) === String(sp.id))).length > 0 && (
                            <div className="pt-2">
                                <p className="text-[11px] text-slate-400 mb-2">Suggeriti per te</p>
                                <div className="flex flex-wrap gap-2">
                                    {suggestedKeywords
                                        .filter((sp) => !profileKeywords.find((mp) => String(mp.id) === String(sp.id)))
                                        .map((p) => (
                                            <button
                                                key={p.id}
                                                onClick={() => handleAddPillar(p)}
                                                className="inline-flex items-center gap-1 rounded-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 px-3 py-1 text-[11px] font-medium hover:border-primary transition-colors"
                                            >
                                                <Plus className="h-3 w-3" />
                                                {p.name}
                                            </button>
                                        ))}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
