'use client';

import { useTheme } from '@/contexts/ThemeContext';
import Icon from '@mdi/react';
import { mdiWeatherSunny, mdiWeatherNight } from '@mdi/js';

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();

  return (
    <button
      onClick={toggleTheme}
      className="p-2 rounded-lg bg-card-bg border border-card-border hover:bg-primary/10 transition-colors duration-200"
      aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
      aria-pressed={theme === 'dark'}
    >
      <Icon
        path={theme === 'dark' ? mdiWeatherSunny : mdiWeatherNight}
        size={1}
        className="text-foreground"
      />
    </button>
  );
}
