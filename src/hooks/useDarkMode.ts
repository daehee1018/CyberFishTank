import { useEffect, useLayoutEffect, useState } from 'react';

const STORAGE_KEY = 'cft-theme';

function readDarkMode() {
  try { return localStorage.getItem(STORAGE_KEY) === 'dark'; }
  catch { return false; }
}

export default function useDarkMode() {
  const [enabled, setEnabled] = useState(readDarkMode);

  useLayoutEffect(() => {
    const theme = enabled ? 'dark' : 'light';
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', enabled ? '#101b22' : '#58b9d8');
    try { localStorage.setItem(STORAGE_KEY, theme); }
    catch { /* The switch still works when browser storage is unavailable. */ }
  }, [enabled]);

  useEffect(() => {
    const sync = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY || event.key === null) setEnabled(readDarkMode());
    };
    window.addEventListener('storage', sync);
    return () => window.removeEventListener('storage', sync);
  }, []);

  return [enabled, setEnabled] as const;
}
