/**
 * Service Worker Registration
 *
 * Handles registration and lifecycle management of the service worker.
 */

type UpdateCallback = (registration: ServiceWorkerRegistration) => void;

interface Config {
  onSuccess?: (registration: ServiceWorkerRegistration) => void;
  onUpdate?: UpdateCallback;
  onOfflineReady?: () => void;
}

const isLocalhost = Boolean(
  typeof window !== 'undefined' &&
    (window.location.hostname === 'localhost' ||
      window.location.hostname === '[::1]' ||
      window.location.hostname.match(
        /^127(?:\.(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)){3}$/
      ))
);

/**
 * Register the service worker
 */
export function register(config?: Config): void {
  if (typeof window === 'undefined') return;

  if ('serviceWorker' in navigator) {
    // Wait for page load
    window.addEventListener('load', () => {
      const swUrl = '/sw.js';

      if (isLocalhost) {
        // Running on localhost - check if SW exists
        checkValidServiceWorker(swUrl, config);

        // Log info for localhost
        navigator.serviceWorker.ready.then(() => {
          console.log('[SW Registration] Service worker is ready (localhost)');
        });
      } else {
        // Production - register service worker
        registerValidSW(swUrl, config);
      }
    });
  }
}

/**
 * Register service worker for production
 */
async function registerValidSW(swUrl: string, config?: Config): Promise<void> {
  try {
    const registration = await navigator.serviceWorker.register(swUrl, {
      scope: '/',
    });

    console.log('[SW Registration] Service worker registered');

    registration.onupdatefound = () => {
      const installingWorker = registration.installing;
      if (!installingWorker) return;

      installingWorker.onstatechange = () => {
        if (installingWorker.state === 'installed') {
          if (navigator.serviceWorker.controller) {
            // New content available
            console.log('[SW Registration] New content available, will update on reload');
            config?.onUpdate?.(registration);
          } else {
            // Content cached for offline use
            console.log('[SW Registration] Content cached for offline use');
            config?.onSuccess?.(registration);
            config?.onOfflineReady?.();
          }
        }
      };
    };
  } catch (error) {
    console.error('[SW Registration] Error during registration:', error);
  }
}

/**
 * Check if service worker exists (for localhost)
 */
async function checkValidServiceWorker(
  swUrl: string,
  config?: Config
): Promise<void> {
  try {
    // Check if SW script exists
    const response = await fetch(swUrl, {
      headers: { 'Service-Worker': 'script' },
    });

    const contentType = response.headers.get('content-type');

    if (
      response.status === 404 ||
      (contentType != null && contentType.indexOf('javascript') === -1)
    ) {
      // No service worker found - unregister any existing
      const registration = await navigator.serviceWorker.ready;
      await registration.unregister();
      window.location.reload();
    } else {
      // Service worker found - register it
      registerValidSW(swUrl, config);
    }
  } catch {
    console.log('[SW Registration] No internet connection. Running in offline mode.');
  }
}

/**
 * Unregister service worker
 */
export async function unregister(): Promise<void> {
  if ('serviceWorker' in navigator) {
    try {
      const registration = await navigator.serviceWorker.ready;
      await registration.unregister();
      console.log('[SW Registration] Service worker unregistered');
    } catch (error) {
      console.error('[SW Registration] Error unregistering:', error);
    }
  }
}

/**
 * Request service worker to skip waiting
 */
export function skipWaiting(): void {
  if (navigator.serviceWorker.controller) {
    navigator.serviceWorker.controller.postMessage({ type: 'SKIP_WAITING' });
  }
}

/**
 * Clear all service worker caches
 */
export async function clearCaches(): Promise<void> {
  if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
    navigator.serviceWorker.controller.postMessage({ type: 'CLEAR_CACHE' });
  }
}

/**
 * Check if there's a waiting service worker update
 */
export async function checkForUpdate(): Promise<boolean> {
  if (!('serviceWorker' in navigator)) return false;

  try {
    const registration = await navigator.serviceWorker.ready;
    await registration.update();
    return registration.waiting !== null;
  } catch {
    return false;
  }
}

/**
 * Get service worker registration
 */
export async function getRegistration(): Promise<ServiceWorkerRegistration | undefined> {
  if (!('serviceWorker' in navigator)) return undefined;
  return navigator.serviceWorker.ready;
}
