import { useSyncExternalStore } from 'react';

/** true while the media query matches; used to pick between the phone and desktop table geometry */
export function useMedia(query: string): boolean {
  return useSyncExternalStore(
    (cb) => {
      const mq = window.matchMedia(query);
      mq.addEventListener('change', cb);
      return () => mq.removeEventListener('change', cb);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}
