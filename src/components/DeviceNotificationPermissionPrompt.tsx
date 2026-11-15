import React, { useEffect } from 'react';
import {
  isWebNotificationSupported,
  requestInitialDevicePermissions,
} from '../utils/notifications';

interface DeviceNotificationPermissionPromptProps {
  onPermissionChanged?: (status: 'granted' | 'denied' | 'default') => void;
  isLight?: boolean;
}

export const DeviceNotificationPermissionPrompt: React.FC<DeviceNotificationPermissionPromptProps> = ({
  onPermissionChanged,
}) => {
  useEffect(() => {
    let cancelled = false;
    let alreadyTriggered = false;

    try {
      alreadyTriggered = localStorage.getItem('ascend_initial_permissions_prompted') === 'true';
    } catch {}

    const runPermissionRequests = () => {
      if (cancelled) return;
      void requestInitialDevicePermissions().then(() => {
        if (!cancelled && onPermissionChanged && isWebNotificationSupported()) {
          onPermissionChanged(Notification.permission);
        }
      });
    };

    // Jika belum pernah diminta pada klik masuk, picu langsung pada sentuhan/klik pertama di aplikasi
    // agar kartu izin resmi dari Google/Chrome muncul (Chrome memblokir popup izin yang dipanggil tanpa klik).
    if (!alreadyTriggered) {
      window.addEventListener('pointerdown', runPermissionRequests, { once: true, capture: true });
      window.addEventListener('keydown', runPermissionRequests, { once: true, capture: true });
    }

    return () => {
      cancelled = true;
      window.removeEventListener('pointerdown', runPermissionRequests, { capture: true });
      window.removeEventListener('keydown', runPermissionRequests, { capture: true });
    };
  }, [onPermissionChanged]);

  return null;
};

