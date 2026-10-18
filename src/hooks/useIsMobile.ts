import { useSyncExternalStore } from 'react';

const query = '(max-width: 720px), (max-height: 720px) and (pointer: coarse)';
let lockedLayout: boolean | null = null;
export function lockResponsiveLayout() {
  lockedLayout = window.matchMedia(query).matches;
  return () => {
    lockedLayout = null;
    window.dispatchEvent(new Event('cft:layout-unlock'));
  };
}
const subscribe = (onChange: () => void) => {
  const media = window.matchMedia(query);
  media.addEventListener('change', onChange);
  window.addEventListener('cft:layout-unlock', onChange);
  return () => {
    media.removeEventListener('change', onChange);
    window.removeEventListener('cft:layout-unlock', onChange);
  };
};

export default function useIsMobile() {
  return useSyncExternalStore(subscribe, () => lockedLayout ?? window.matchMedia(query).matches, () => false);
}
