import { useSyncExternalStore } from 'react';

function subscribe(notify: () => void) {
  window.addEventListener('online', notify);
  window.addEventListener('offline', notify);
  return () => {
    window.removeEventListener('online', notify);
    window.removeEventListener('offline', notify);
  };
}
export default function useOnline() {
  return useSyncExternalStore(subscribe, () => navigator.onLine, () => true);
}
