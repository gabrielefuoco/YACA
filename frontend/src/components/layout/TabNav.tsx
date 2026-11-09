'use client';
import { cn } from '@/lib/utils';

export type AppTab = 'dashboard' | 'explore' | 'settings' | 'library' | 'creator' | 'gusti';

interface TabNavProps {
  activeTab: AppTab;
  onTabChange: (tab: AppTab) => void;
}

export function TabNav({ activeTab, onTabChange }: TabNavProps) {
  const isDashboardActive = activeTab === 'dashboard' || activeTab === 'explore';
  const isSettingsActive = !isDashboardActive;

  return (
    <nav className="flex items-center gap-1 sm:gap-1.5 overflow-x-auto no-scrollbar py-1">
      <button
        type="button"
        onClick={() => onTabChange('dashboard')}
        className={cn(
          'text-[11px] sm:text-sm transition-all duration-200 flex items-center justify-center px-2.5 sm:px-4 py-1.5 sm:py-2 font-black uppercase tracking-wider whitespace-nowrap min-h-[36px] sm:min-h-[40px] h-9 sm:h-10 touch-manipulation rounded-full',
          isDashboardActive
            ? 'bg-primary text-white shadow-lg shadow-primary/30'
            : 'text-marrow-light hover:text-primary hover:bg-primary/5'
        )}
      >
        Dashboard
      </button>
      <button
        type="button"
        onClick={() => onTabChange('settings')}
        className={cn(
          'text-[11px] sm:text-sm transition-all duration-200 flex items-center justify-center px-2.5 sm:px-4 py-1.5 sm:py-2 font-black uppercase tracking-wider whitespace-nowrap min-h-[36px] sm:min-h-[40px] h-9 sm:h-10 touch-manipulation rounded-full',
          isSettingsActive
            ? 'bg-primary text-white shadow-lg shadow-primary/30'
            : 'text-marrow-light hover:text-primary hover:bg-primary/5'
        )}
      >
        Impostazioni
      </button>
    </nav>
  );
}
