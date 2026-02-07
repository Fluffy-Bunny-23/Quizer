'use client';

import { useState, useEffect, useCallback } from 'react';
import Icon from '@mdi/react';
import { mdiWifi, mdiWifiOff, mdiLoading } from '@mdi/js';

interface ConnectionStatusProps {
  onRetry?: () => void;
  retryCount?: number;
}

type ConnectionState = 'online' | 'offline' | 'reconnecting';

export function ConnectionStatus({ onRetry, retryCount = 0 }: ConnectionStatusProps) {
  const [state, setState] = useState<ConnectionState>('online');
  const [isVisible, setIsVisible] = useState(false);

  const handleOnline = useCallback(() => {
    setState('online');
    // Hide after 3 seconds when back online
    setTimeout(() => setIsVisible(false), 3000);
  }, []);

  const handleOffline = useCallback(() => {
    setState('offline');
    setIsVisible(true);
  }, []);

  const handleRetry = useCallback(async () => {
    setState('reconnecting');
    if (onRetry) {
      try {
        await onRetry();
        handleOnline();
      } catch (error) {
        setState('offline');
      }
    }
  }, [onRetry, handleOnline]);

  useEffect(() => {
    // Check initial state
    if (!navigator.onLine) {
      setState('offline');
      setIsVisible(true);
    }

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [handleOnline, handleOffline]);

  if (!isVisible) return null;

  const stateConfig = {
    online: {
      bg: 'bg-success',
      icon: mdiWifi,
      text: 'Back online',
    },
    offline: {
      bg: 'bg-error',
      icon: mdiWifiOff,
      text: `Connection lost${retryCount > 0 ? ` (Attempt ${retryCount})` : ''}`,
    },
    reconnecting: {
      bg: 'bg-accent',
      icon: mdiLoading,
      text: 'Reconnecting...',
    },
  };

  const config = stateConfig[state];

  return (
    <div
      className={`fixed top-0 left-0 right-0 z-50 ${config.bg} text-white px-4 py-2 shadow-lg`}
      role="alert"
      aria-live="polite"
    >
      <div className="max-w-6xl mx-auto flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon path={config.icon} size={1} className={state === 'reconnecting' ? 'animate-spin' : ''} />
          <span className="font-medium">{config.text}</span>
        </div>
        {state === 'offline' && onRetry && (
          <button
            onClick={handleRetry}
            className="px-3 py-1 bg-white/20 rounded-lg hover:bg-white/30 transition-colors text-sm font-medium"
            aria-label="Retry connection"
          >
            Retry
          </button>
        )}
      </div>
    </div>
  );
}

// Hook for tracking connection status
export function useConnectionStatus() {
  const [isOnline, setIsOnline] = useState(true);
  const [retryCount, setRetryCount] = useState(0);

  const retry = useCallback(async (operation: () => Promise<void>) => {
    setRetryCount((prev) => prev + 1);
    try {
      await operation();
      setRetryCount(0);
      return true;
    } catch (error) {
      return false;
    }
  }, []);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    setIsOnline(navigator.onLine);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return { isOnline, retry, retryCount };
}
