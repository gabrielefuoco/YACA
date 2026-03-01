'use client';
import { LayoutDashboard, Settings } from 'lucide-react';
import { cn } from '@/lib/utils';

interface TabNavProps {
  activeTab: 'dashboard' | 'settings';
  onTabChange: (tab: 'dashboard' | 'settings') => void;
}

export function TabNav({ activeTab, onTabChange }: TabNavProps) {
  const tabs = [
    { id: 'dashboard' as const, label: 'Dashboard', icon: LayoutDashboard },
    { id: 'settings' as const, label: 'Impostazioni', icon: Settings },
  ];

  return (
    <nav className="flex gap-1 border-b border-white/10 mb-6">
      {tabs.map(({ id, label, icon: Icon }) => (
        <button
          key={id}
          onClick={() => onTabChange(id)}
          className={cn(
            'flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-all border-b-2 -mb-px',
            activeTab === id
              ? 'border-[#8a5aeb] text-[#8a5aeb]'
              : 'border-transparent text-white/50 hover:text-white/80'
          )}
        >
          <Icon className="h-4 w-4" />
          {label}
        </button>
      ))}
    </nav>
  );
}
