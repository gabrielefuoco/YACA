'use client';
import { Profile, DNAItem } from '@/types';
import { api } from '@/lib/api';

interface ProfileSettingsPanelProps {
    profile: Profile;
    onUpdateProfile: (id: string, updates: Partial<Profile>) => void;
    onSetActive: (id: string) => void;
    onRemove: (id: string) => void;
    isActive: boolean;
    startRename: () => void;
}

export function ProfileSettingsPanel({
    profile,
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
        if (profileDNA.find((p) => String(p.id) === String(item.id))) return;
        const newDNA = [...profileDNA, item];
        onUpdateProfile(profile.id, {
            settings: { ...profile.settings, manualDNA: newDNA },
        });
    };

    const handleRemoveDNA = (id: string) => {
        const newDNA = profileDNA.filter((p) => String(p.id) !== String(id));
        onUpdateProfile(profile.id, {
            settings: { ...profile.settings, manualDNA: newDNA },
        });
    };

    return (
        <div className="flex flex-col glass-panel mt-2 overflow-hidden shadow-xl shadow-marrow-light/5">
            <div className="px-6 py-4 border-b border-primary/10 flex items-center justify-between bg-primary-dark/5">
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
                            <button onClick={startRename} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/40 hover:bg-primary/20 text-marrow-deep text-xs font-black transition-all border border-marrow-light/10 shadow-sm">
                                <span className="material-symbols-outlined text-sm">edit</span>
                                <span>Rinomina</span>
                            </button>
                            <button onClick={() => onRemove(profile.id)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-destructive/10 hover:bg-destructive hover:text-white text-destructive text-xs font-bold transition-all">
                                <span className="material-symbols-outlined text-sm">delete</span>
                                <span>Elimina</span>
                            </button>
                        </>
                    )}
                </div>
            </div>

        </div>
    );
}
