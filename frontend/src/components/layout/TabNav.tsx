'use client';
import { cn } from '@/lib/utils';

interface TabNavProps {
  activeTab: 'dashboard' | 'settings';
  onTabChange: (tab: 'dashboard' | 'settings') => void;
}

export function TabNav({ activeTab, onTabChange }: TabNavProps) {
  const tabs = [
    { id: 'dashboard' as const, label: 'Dashboard' },
    { id: 'settings' as const, label: 'Impostazioni' },
  ];

  return (
    <nav className="flex items-center gap-1 sm:gap-6 overflow-x-auto no-scrollbar">
      {tabs.map(({ id, label }) => (
        <button
          key={id}
          onClick={() => onTabChange(id)}
          className={cn(
            'text-xs sm:text-sm transition-all duration-300 flex items-center justify-center px-3.5 sm:px-4 font-black uppercase tracking-wider whitespace-nowrap min-h-[44px] h-11 touch-manipulation',
            activeTab === id
              ? 'bg-primary text-white rounded-full shadow-lg shadow-primary/30 scale-105'
              : 'text-marrow-light hover:text-primary hover:bg-primary/5 rounded-full'
          )}
        >
          {label}
        </button>
      ))}
    </nav>
  );
}

