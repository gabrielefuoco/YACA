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
              ? 'bg-primary text-white font-bold leading-normal rounded-full shadow-md'
              : 'text-slate-600 dark:text-slate-400 font-medium leading-normal hover:text-primary'
          )}
        >
          {label}
        </button>
      ))}
    </nav>
  );
}

