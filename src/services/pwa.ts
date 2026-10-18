export let pwaRegistration: ServiceWorkerRegistration | undefined;
export const UPDATE_EVENT = 'cft:pwa-update';

export function registerPwa() {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  // CDN caches may ignore request cache headers on a fixed /sw.js URL.
  // A fresh version lookup selects a stable, content-versioned worker URL.
  const getWorkerUrl = async () => {
    const response = await fetch(`/pwa-version.json?check=${Date.now()}`, { cache: 'no-store' });
    if (!response.ok) throw new Error('웹앱 버전 확인 실패');
    const { version } = await response.json();
    if (typeof version !== 'string' || !/^[a-zA-Z0-9_-]{1,64}$/.test(version)) throw new Error('잘못된 웹앱 버전');
    return `/sw.js?v=${version}`;
  };
  const notify = () => window.dispatchEvent(new Event(UPDATE_EVENT));
  const watched = new WeakSet<ServiceWorkerRegistration>();
  const registerWorker = async (url: string) => {
    const registration = await navigator.serviceWorker.register(url, { scope: '/', updateViaCache: 'none' });
    pwaRegistration = registration;
    if (!watched.has(registration)) {
      watched.add(registration);
      const watchInstalling = () => {
        const worker = registration.installing;
        worker?.addEventListener('statechange', () => {
          if (worker.state === 'installed' && registration.waiting && navigator.serviceWorker.controller) notify();
        });
      };
      registration.addEventListener('updatefound', watchInstalling);
      watchInstalling();
    }
    if (registration.waiting) notify();
    return registration;
  };
  const register = () => {
    let workerUrl = '';
    let lastCheck = 0;
    let checking = false;
    const check = async () => {
      if (checking || document.visibilityState !== 'visible' || !navigator.onLine || (workerUrl && Date.now() - lastCheck < 60000)) return;
      checking = true;
      lastCheck = Date.now();
      try {
        const latestUrl = await getWorkerUrl();
        if (latestUrl !== workerUrl) {
          await registerWorker(latestUrl);
          workerUrl = latestUrl;
        }
      } catch (error) {
        // Listeners remain installed, so an initial failure can recover too.
        console.error('웹앱 버전 확인 실패:', error);
      } finally { checking = false; }
    };
    window.addEventListener('online', check);
    document.addEventListener('visibilitychange', check);
    // Another tab may have activated the new version. Let this tab reload manually.
    let controlled = Boolean(navigator.serviceWorker.controller);
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (controlled) notify();
      controlled = true;
    });
    void check();
  };
  if (document.readyState === 'complete') void register();
  else window.addEventListener('load', () => { void register(); }, { once: true });
}
