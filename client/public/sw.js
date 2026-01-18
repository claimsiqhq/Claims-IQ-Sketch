/**
 * Service Worker for Claims IQ Sketch PWA
 *
 * Provides offline functionality:
 * - Cache-first for static assets
 * - Network-first for API calls with offline fallback
 * - Background sync for offline data submission
 */

const CACHE_VERSION = 'v1';
const STATIC_CACHE = `claims-iq-static-${CACHE_VERSION}`;
const DYNAMIC_CACHE = `claims-iq-dynamic-${CACHE_VERSION}`;
const API_CACHE = `claims-iq-api-${CACHE_VERSION}`;

// Static assets to cache on install
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/favicon.png',
];

// API endpoints that can be cached for offline viewing
const CACHEABLE_API_ROUTES = [
  '/api/claims',
  '/api/flow-definitions',
  '/api/photo-categories',
  '/api/organizations',
];

// ============================================
// INSTALL EVENT
// ============================================

self.addEventListener('install', (event) => {
  console.log('[SW] Installing service worker...');

  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => {
        console.log('[SW] Caching static assets');
        return cache.addAll(STATIC_ASSETS);
      })
      .then(() => {
        console.log('[SW] Static assets cached');
        return self.skipWaiting();
      })
      .catch((error) => {
        console.error('[SW] Failed to cache static assets:', error);
      })
  );
});

// ============================================
// ACTIVATE EVENT
// ============================================

self.addEventListener('activate', (event) => {
  console.log('[SW] Activating service worker...');

  event.waitUntil(
    Promise.all([
      // Clean up old caches
      caches.keys().then((cacheNames) => {
        return Promise.all(
          cacheNames
            .filter((name) => {
              return name.startsWith('claims-iq-') &&
                     name !== STATIC_CACHE &&
                     name !== DYNAMIC_CACHE &&
                     name !== API_CACHE;
            })
            .map((name) => {
              console.log('[SW] Deleting old cache:', name);
              return caches.delete(name);
            })
        );
      }),
      // Take control of all clients
      self.clients.claim(),
    ])
  );
});

// ============================================
// FETCH EVENT
// ============================================

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests for caching (we'll handle them with background sync)
  if (request.method !== 'GET') {
    event.respondWith(handleMutationRequest(request));
    return;
  }

  // API requests - network first with cache fallback
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(handleApiRequest(request));
    return;
  }

  // Static assets - cache first
  if (isStaticAsset(url.pathname)) {
    event.respondWith(handleStaticRequest(request));
    return;
  }

  // Dynamic content (HTML pages) - network first
  event.respondWith(handleDynamicRequest(request));
});

/**
 * Check if pathname is a static asset
 */
function isStaticAsset(pathname) {
  return /\.(js|css|png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|eot)$/i.test(pathname);
}

/**
 * Handle static asset requests - Cache First
 */
async function handleStaticRequest(request) {
  const cached = await caches.match(request);
  if (cached) {
    return cached;
  }

  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(DYNAMIC_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    console.error('[SW] Static fetch failed:', error);
    // Return a fallback or error response
    return new Response('Offline', { status: 503, statusText: 'Service Unavailable' });
  }
}

/**
 * Handle dynamic content requests - Network First
 */
async function handleDynamicRequest(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(DYNAMIC_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    console.log('[SW] Network failed, trying cache:', request.url);
    const cached = await caches.match(request);
    if (cached) {
      return cached;
    }

    // For navigation requests, return the cached index.html
    if (request.mode === 'navigate') {
      const indexCache = await caches.match('/index.html');
      if (indexCache) {
        return indexCache;
      }
    }

    return new Response('Offline', { status: 503, statusText: 'Service Unavailable' });
  }
}

/**
 * Handle API requests - Network First with Cache Fallback
 */
async function handleApiRequest(request) {
  const url = new URL(request.url);

  try {
    const response = await fetch(request);

    // Cache successful responses for cacheable routes
    if (response.ok && isCacheableApiRoute(url.pathname)) {
      const cache = await caches.open(API_CACHE);
      cache.put(request, response.clone());
    }

    return response;
  } catch (error) {
    console.log('[SW] API request failed, checking cache:', url.pathname);

    // Try to return cached response
    const cached = await caches.match(request);
    if (cached) {
      // Add header to indicate cached response
      const headers = new Headers(cached.headers);
      headers.set('X-From-Cache', 'true');
      return new Response(cached.body, {
        status: cached.status,
        statusText: cached.statusText,
        headers,
      });
    }

    // Return offline error for API
    return new Response(
      JSON.stringify({
        error: 'Offline',
        message: 'This data is not available offline',
        offline: true
      }),
      {
        status: 503,
        statusText: 'Service Unavailable',
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
}

/**
 * Handle mutation requests (POST, PUT, DELETE)
 */
async function handleMutationRequest(request) {
  try {
    // Try to make the request
    const response = await fetch(request.clone());
    return response;
  } catch (error) {
    console.log('[SW] Mutation request failed, queuing for later:', request.url);

    // Notify clients that the request was queued
    notifyClients({
      type: 'MUTATION_QUEUED',
      url: request.url,
      method: request.method,
    });

    // Return a response indicating the request was queued
    return new Response(
      JSON.stringify({
        queued: true,
        message: 'Request queued for sync when online'
      }),
      {
        status: 202,
        statusText: 'Accepted',
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
}

/**
 * Check if an API route should be cached
 */
function isCacheableApiRoute(pathname) {
  return CACHEABLE_API_ROUTES.some((route) => pathname.startsWith(route));
}

// ============================================
// BACKGROUND SYNC
// ============================================

self.addEventListener('sync', (event) => {
  console.log('[SW] Background sync triggered:', event.tag);

  if (event.tag === 'sync-data') {
    event.waitUntil(syncData());
  }
});

/**
 * Sync queued data when back online
 */
async function syncData() {
  console.log('[SW] Syncing queued data...');

  // Notify all clients to process their sync queue
  await notifyClients({ type: 'SYNC_TRIGGERED' });

  console.log('[SW] Sync notification sent to clients');
}

/**
 * Notify all clients of an event
 */
async function notifyClients(message) {
  const clients = await self.clients.matchAll({ type: 'window' });
  clients.forEach((client) => {
    client.postMessage(message);
  });
}

// ============================================
// PUSH NOTIFICATIONS (Future)
// ============================================

self.addEventListener('push', (event) => {
  console.log('[SW] Push notification received');

  const data = event.data?.json() || {};
  const title = data.title || 'Claims IQ';
  const options = {
    body: data.body || 'You have a new notification',
    icon: '/favicon.png',
    badge: '/favicon.png',
    data: data.data,
    actions: data.actions || [],
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

self.addEventListener('notificationclick', (event) => {
  console.log('[SW] Notification clicked:', event.notification.tag);

  event.notification.close();

  // Open or focus the app
  event.waitUntil(
    self.clients.matchAll({ type: 'window' }).then((clients) => {
      // Check if app is already open
      const appClient = clients.find((client) => {
        return client.url.includes(self.location.origin);
      });

      if (appClient) {
        return appClient.focus();
      }

      // Open new window
      const url = event.notification.data?.url || '/';
      return self.clients.openWindow(url);
    })
  );
});

// ============================================
// MESSAGE HANDLING
// ============================================

self.addEventListener('message', (event) => {
  console.log('[SW] Message received:', event.data);

  const { type, payload } = event.data || {};

  switch (type) {
    case 'SKIP_WAITING':
      self.skipWaiting();
      break;

    case 'CLEAR_CACHE':
      event.waitUntil(clearAllCaches());
      break;

    case 'CACHE_API':
      event.waitUntil(cacheApiResponse(payload));
      break;

    default:
      console.log('[SW] Unknown message type:', type);
  }
});

/**
 * Clear all caches
 */
async function clearAllCaches() {
  const cacheNames = await caches.keys();
  await Promise.all(
    cacheNames
      .filter((name) => name.startsWith('claims-iq-'))
      .map((name) => caches.delete(name))
  );
  console.log('[SW] All caches cleared');
}

/**
 * Manually cache an API response
 */
async function cacheApiResponse({ url, data }) {
  const cache = await caches.open(API_CACHE);
  const response = new Response(JSON.stringify(data), {
    headers: { 'Content-Type': 'application/json' },
  });
  await cache.put(url, response);
  console.log('[SW] Cached API response:', url);
}

console.log('[SW] Service worker loaded');
