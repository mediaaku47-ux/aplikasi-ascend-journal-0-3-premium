import { useCallback, useEffect, useState } from 'react';

export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

declare global {
  interface Window {
    __ascendDeferredInstallPrompt?: BeforeInstallPromptEvent | null;
    __ascendPWAInstalled?: boolean;
  }
}

export type InstallOutcome = 'accepted' | 'dismissed' | 'unavailable';

function checkStandaloneMode(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    window.matchMedia('(display-mode: minimal-ui)').matches ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true ||
    window.__ascendPWAInstalled === true
  );
}

function checkIsIOS(): boolean {
  if (typeof window === 'undefined') return false;
  const ua = window.navigator.userAgent.toLowerCase();
  const isIOSUA = /iphone|ipad|ipod/.test(ua);
  const isIPadOS =
    navigator.platform === 'MacIntel' && typeof navigator.maxTouchPoints === 'number' && navigator.maxTouchPoints > 1;
  return isIOSUA || isIPadOS;
}

function checkIsAndroid(): boolean {
  if (typeof window === 'undefined') return false;
  return /android/.test(window.navigator.userAgent.toLowerCase());
}

function checkIsInIframe(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
}

export function usePWAInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(() =>
    typeof window !== 'undefined' ? window.__ascendDeferredInstallPrompt || null : null
  );
  const [isInstalled, setIsInstalled] = useState<boolean>(() => checkStandaloneMode());
  const [isAlreadyOnDevice, setIsAlreadyOnDevice] = useState<boolean>(false);
  const [isIOS] = useState<boolean>(() => checkIsIOS());
  const [isAndroid] = useState<boolean>(() => checkIsAndroid());
  const [isInIframe] = useState<boolean>(() => checkIsInIframe());
  const [isInstalling, setIsInstalling] = useState<boolean>(false);

  useEffect(() => {
    setIsInstalled(checkStandaloneMode());
    if (window.__ascendDeferredInstallPrompt) {
      setDeferredPrompt(window.__ascendDeferredInstallPrompt);
    }

    // Cek apakah PWA sudah pernah terpasang di perangkat (Chrome/Android)
    const navAny = navigator as unknown as {
      getInstalledRelatedApps?: () => Promise<Array<{ id?: string; platform?: string }>>;
    };
    if (typeof navAny.getInstalledRelatedApps === 'function') {
      navAny
        .getInstalledRelatedApps()
        .then((apps) => {
          if (Array.isArray(apps) && apps.length > 0) {
            setIsAlreadyOnDevice(true);
          }
        })
        .catch(() => {});
    }

    const syncFromWindow = () => {
      setDeferredPrompt(window.__ascendDeferredInstallPrompt || null);
    };

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      const promptEvent = e as BeforeInstallPromptEvent;
      window.__ascendDeferredInstallPrompt = promptEvent;
      setDeferredPrompt(promptEvent);
    };

    const handleAppInstalled = () => {
      window.__ascendDeferredInstallPrompt = null;
      window.__ascendPWAInstalled = true;
      setIsInstalled(true);
      setIsAlreadyOnDevice(true);
      setDeferredPrompt(null);
    };

    const standaloneMql = window.matchMedia('(display-mode: standalone)');
    const handleDisplayModeChange = (e: MediaQueryListEvent) => {
      if (e.matches) {
        window.__ascendPWAInstalled = true;
        setIsInstalled(true);
        setDeferredPrompt(null);
      }
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);
    window.addEventListener('ascend:pwa-prompt-ready', syncFromWindow);
    window.addEventListener('ascend:pwa-installed', handleAppInstalled);
    standaloneMql.addEventListener?.('change', handleDisplayModeChange);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
      window.removeEventListener('ascend:pwa-prompt-ready', syncFromWindow);
      window.removeEventListener('ascend:pwa-installed', handleAppInstalled);
      standaloneMql.removeEventListener?.('change', handleDisplayModeChange);
    };
  }, []);

  const waitForInstallPrompt = useCallback(async (timeoutMs = 3000): Promise<BeforeInstallPromptEvent | null> => {
    if (typeof window === 'undefined') return null;
    if (window.__ascendDeferredInstallPrompt) {
      return window.__ascendDeferredInstallPrompt;
    }

    // Pastikan service worker sudah terdaftar agar Chrome memicu beforeinstallprompt
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }

    return new Promise((resolve) => {
      let settled = false;
      const cleanup = () => {
        window.removeEventListener('ascend:pwa-prompt-ready', onReady);
        window.removeEventListener('beforeinstallprompt', onNativePrompt);
        clearTimeout(timer);
      };
      const finish = (evt: BeforeInstallPromptEvent | null) => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve(evt);
      };
      const onReady = () => {
        if (window.__ascendDeferredInstallPrompt) {
          finish(window.__ascendDeferredInstallPrompt);
        }
      };
      const onNativePrompt = (e: Event) => {
        e.preventDefault();
        const promptEvent = e as BeforeInstallPromptEvent;
        window.__ascendDeferredInstallPrompt = promptEvent;
        setDeferredPrompt(promptEvent);
        finish(promptEvent);
      };

      window.addEventListener('ascend:pwa-prompt-ready', onReady);
      window.addEventListener('beforeinstallprompt', onNativePrompt);
      const timer = setTimeout(() => {
        finish(window.__ascendDeferredInstallPrompt || null);
      }, timeoutMs);
    });
  }, []);

  const installWithOutcome = useCallback(async (): Promise<InstallOutcome> => {
    let activePrompt =
      deferredPrompt || (typeof window !== 'undefined' ? window.__ascendDeferredInstallPrompt : null);

    setIsInstalling(true);
    try {
      if (!activePrompt) {
        activePrompt = await waitForInstallPrompt(2800);
      }
      if (!activePrompt) return 'unavailable';

      await activePrompt.prompt();
      const { outcome } = await activePrompt.userChoice;
      if (outcome === 'accepted') {
        window.__ascendDeferredInstallPrompt = null;
        window.__ascendPWAInstalled = true;
        setIsInstalled(true);
        setIsAlreadyOnDevice(true);
        setDeferredPrompt(null);
        return 'accepted';
      }
      return 'dismissed';
    } catch (err) {
      console.warn('PWA install prompt notice:', err);
      return 'unavailable';
    } finally {
      setIsInstalling(false);
    }
  }, [deferredPrompt, waitForInstallPrompt]);

  const install = useCallback(async (): Promise<boolean> => {
    const outcome = await installWithOutcome();
    return outcome === 'accepted';
  }, [installWithOutcome]);

  return {
    isInstallable: !isInstalled && !!deferredPrompt,
    isInstalled,
    isAlreadyOnDevice,
    isIOS,
    isAndroid,
    isInIframe,
    isInstalling,
    install,
    installWithOutcome,
  };
}
