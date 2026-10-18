import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { lockResponsiveLayout } from './useIsMobile';

const portraitQuery = '(orientation: portrait)';
const subscribeOrientation = (notify: () => void) => {
  const media = window.matchMedia(portraitQuery);
  media.addEventListener('change', notify);
  return () => media.removeEventListener('change', notify);
};

export default function useElementFullscreen({ landscapeOnly = false } = {}) {
  const portrait = useSyncExternalStore(subscribeOrientation, () => window.matchMedia(portraitQuery).matches, () => false);
  const elementRef = useRef<HTMLElement>(null);
  const [expanded, setExpanded] = useState(false);
  const active = useRef(false);
  const requestId = useRef(0);
  const unlock = useRef<(() => void) | undefined>(undefined);
  const trigger = useRef<HTMLElement | null>(null);
  const historyKey = useRef('');
  const ownsHistory = useRef(false);
  const orientationLock = useRef<ScreenOrientation | null>(null);
  const releaseOrientation = useCallback(() => {
    try { orientationLock.current?.unlock(); } catch { /* A hidden document may already be unlocked. */ }
    orientationLock.current = null;
  }, []);

  const close = useCallback(() => {
    active.current = false;
    requestId.current++;
    setExpanded(false);
    releaseOrientation();
    if (document.fullscreenElement === elementRef.current) void document.exitFullscreen().catch(() => {});
    if (ownsHistory.current && history.state?.cftFullscreen === historyKey.current) {
      ownsHistory.current = false;
      history.back();
    }
  }, [releaseOrientation]);

  const open = () => {
    const element = elementRef.current;
    if (!element || active.current) return;
    trigger.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    unlock.current = lockResponsiveLayout();
    active.current = true;
    const id = ++requestId.current;
    historyKey.current = `cft-fullscreen-${Date.now()}`;
    history.pushState({ ...history.state, cftFullscreen: historyKey.current }, '', location.href);
    ownsHistory.current = true;
    setExpanded(true);
    const lockLandscape = () => {
      if (!landscapeOnly || !active.current || requestId.current !== id || !screen.orientation?.lock) return;
      const orientation = screen.orientation;
      void orientation.lock('landscape').then(() => {
        if (!active.current) { try { orientation.unlock(); } catch { /* Already exited. */ } }
        // A quick close/reopen may finish the previous lock late. Keep ownership
        // while a viewer is active so its eventual close still releases it.
        else orientationLock.current = orientation;
      }).catch(() => { /* Keep the rotate-device guide when orientation locking is unavailable. */ });
    };
    // Request in the original click handler to preserve user activation.
    // CSS expansion is already available if the API is absent or rejected.
    if (element.requestFullscreen && document.fullscreenEnabled) {
      void element.requestFullscreen().then(() => {
        if (requestId.current !== id) {
          if (document.fullscreenElement === element) void document.exitFullscreen().catch(() => {});
        } else if (document.fullscreenElement !== element) close();
        else lockLandscape();
      }).catch(lockLandscape);
    } else lockLandscape();
  };

  useEffect(() => {
    const changed = () => {
      // Reconcile with the browser even if entry/exit events arrive together.
      // Rejected or unavailable APIs do not emit fullscreenchange, so the CSS
      // fallback remains open until the user closes it.
      if (document.fullscreenElement !== elementRef.current) close();
    };
    document.addEventListener('fullscreenchange', changed);
    return () => document.removeEventListener('fullscreenchange', changed);
  }, [close]);

  useEffect(() => {
    const element = elementRef.current;
    if (!expanded || !element) return;
    const scroll = { x: window.scrollX, y: window.scrollY, url: location.href };
    const overflow = document.body.style.overflow;
    const htmlOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
    // Keep this same renderer/video in place; disable only the surrounding UI.
    const siblings: { element: HTMLElement; inert: boolean }[] = [];
    for (let branch: HTMLElement = element; branch.parentElement; branch = branch.parentElement) {
      for (const sibling of branch.parentElement.children) {
        if (sibling !== branch && sibling instanceof HTMLElement) {
          siblings.push({ element: sibling, inert: sibling.inert });
          sibling.inert = true;
        }
      }
    }
    const frame = requestAnimationFrame(() => element.querySelector<HTMLElement>('.cft-fullscreen-toggle')?.focus({ preventScroll: true }));
    const keys = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); close(); return; }
      if (event.key !== 'Tab') return;
      const controls = [...element.querySelectorAll<HTMLElement>('button:not(:disabled), select:not(:disabled), a[href], [tabindex="0"]')].filter(control => control.getClientRects().length && !control.hidden && getComputedStyle(control).visibility !== 'hidden');
      const first = controls[0], last = controls.at(-1);
      if (event.shiftKey && (document.activeElement === first || !element.contains(document.activeElement))) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || !element.contains(document.activeElement))) { event.preventDefault(); first?.focus(); }
    };
    const back = () => {
      if (history.state?.cftFullscreen !== historyKey.current) { ownsHistory.current = false; close(); }
    };
    document.addEventListener('keydown', keys, true);
    window.addEventListener('popstate', back);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('keydown', keys, true);
      window.removeEventListener('popstate', back);
      document.body.style.overflow = overflow;
      document.documentElement.style.overflow = htmlOverflow;
      for (const sibling of siblings) sibling.element.inert = sibling.inert;
      active.current = false;
      requestId.current++;
      releaseOrientation();
      if (document.fullscreenElement === element) void document.exitFullscreen().catch(() => {});
      if (ownsHistory.current && history.state?.cftFullscreen === historyKey.current) {
        ownsHistory.current = false;
        history.back();
      }
      trigger.current?.focus({ preventScroll: true });
      if (location.href === scroll.url) window.scrollTo(scroll.x, scroll.y);
      unlock.current?.();
      unlock.current = undefined;
    };
  }, [expanded, close, releaseOrientation]);

  const needsLandscape = expanded && landscapeOnly && portrait;
  useEffect(() => {
    if (needsLandscape) elementRef.current?.querySelector<HTMLElement>('.cft-fullscreen-toggle')?.focus({ preventScroll: true });
  }, [needsLandscape]);

  return { elementRef, expanded, needsLandscape, toggleFullscreen: expanded ? close : open };
}
