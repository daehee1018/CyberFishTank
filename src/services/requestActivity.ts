let pending = 0;
export const getPendingRequests = () => pending;
export const subscribeRequests = (notify: () => void) => {
  window.addEventListener('cft:requests', notify);
  return () => window.removeEventListener('cft:requests', notify);
};

// Track writes for the update button; never queue or retry device commands.
export async function trackedFetch(input: RequestInfo | URL, init?: RequestInit) {
  const method = (init?.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();
  const url = input instanceof Request ? input.url : String(input);
  const write = !['GET', 'HEAD', 'OPTIONS'].includes(method) && !url.endsWith('/api/camera/frame');
  if (write) { pending++; window.dispatchEvent(new Event('cft:requests')); }
  try {
    if (write && !navigator.onLine) throw new TypeError('인터넷 연결을 확인해주세요.');
    return await window.fetch(input, init);
  } finally {
    if (write) { pending--; window.dispatchEvent(new Event('cft:requests')); }
  }
}
