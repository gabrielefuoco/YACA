'use client';
import { cn } from '@/lib/utils';

export type AppTab = 'dashboard' | 'explore' | 'settings' | 'library' | 'creator' | 'gusti';

interface TabNavProps {
  activeTab: AppTab;
  onTabChange: (tab: AppTab) => void;
}

export function TabNav({ activeTab, onTabChange }: TabNavProps) {
  const tabs: { id: AppTab; label: string }[] = [
    { id: 'dashboard', label: 'Dashboard' },
    { id: 'explore', label: 'Esplora' },
    { id: 'settings', label: 'Impostazioni' },
    { id: 'library', label: 'Libreria' },
    { id: 'creator', label: 'Creatore' },
    { id: 'gusti', label: 'Gusti' },
  ];

  return (
    <nav className="flex items-center gap-1 sm:gap-1.5 overflow-x-auto no-scrollbar py-1">
      {tabs.map(({ id, label }) => {
        const isActive = activeTab === id;
        return (
          <button
            key={id}
            type="button"
            onClick={() => onTabChange(id)}
            className={cn(
              'text-xs sm:text-sm transition-all duration-200 flex items-center justify-center px-3.5 sm:px-4 py-2 font-black uppercase tracking-wider whitespace-nowrap min-h-[40px] h-10 touch-manipulation rounded-full',
              isActive
                ? 'bg-primary text-white shadow-lg shadow-primary/30'
                : 'text-marrow-light hover:text-primary hover:bg-primary/5'
            )}
          >
            {label}
          </button>
        );
      })}
    </nav>
  );
}
