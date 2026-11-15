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

    const triggerDirect = async () => {
      await requestInitialDevicePermissions();
      if (!cancelled && onPermissionChanged && isWebNotificationSupported()) {
        onPermissionChanged(Notification.permission);
      }
    };

    void triggerDirect();

    // Fallback apabila browser mewajibkan interaksi tap pertama untuk memicu dialog izin resmi
    const handleFirstTap = () => {
      if (isWebNotificationSupported() && Notification.permission === 'default') {
        void Notification.requestPermission().then((perm) => {
          if (!cancelled && onPermissionChanged) {
            onPermissionChanged(perm);
          }
        });
      }
    };

    if (isWebNotificationSupported() && Notification.permission === 'default') {
      window.addEventListener('pointerdown', handleFirstTap, { once: true, capture: true });
    }

    return () => {
      cancelled = true;
      window.removeEventListener('pointerdown', handleFirstTap, { capture: true });
    };
  }, [onPermissionChanged]);

  return null;
};

