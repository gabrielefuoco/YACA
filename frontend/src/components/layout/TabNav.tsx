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
    <nav className="flex items-center gap-6">
      {tabs.map(({ id, label }) => (
        <button
          key={id}
          onClick={() => onTabChange(id)}
          className={cn(
            'text-sm transition-colors flex items-center px-4 py-1.5',
            activeTab === id
              ? 'bg-primary text-white font-black leading-normal rounded-full shadow-lg shadow-primary/30 scale-105'
              : 'text-zinc-500 dark:text-zinc-500 font-medium leading-normal hover:text-primary transition-all'
          )}
        >
          {label}
        </button>
      ))}
    </nav>
  );
}

