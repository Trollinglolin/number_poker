import { useEffect, useRef, useState } from 'react';
import { MotionConfig } from 'motion/react';
import { IconContext, WifiSlashIcon } from './lib/icons';
import { game, useGame } from './lib/client';
import { ToastProvider } from './components/ui';
import { Home } from './screens/Home';
import { Lobby } from './screens/Lobby';
import { Table } from './screens/Table';

const codeFromUrl = () => /^\/room\/([A-Za-z0-9]{3,12})\/?$/.exec(location.pathname)?.[1]?.toUpperCase();

function Screen() {
  const state = useGame();
  const [initialCode] = useState(codeFromUrl);
  const hadView = useRef(false);

  useEffect(() => {
    game.start();
  }, []);

  // keep the address bar shareable: /room/CODE while seated, back to / after leaving
  useEffect(() => {
    if (state.view) {
      hadView.current = true;
      const path = `/room/${state.view.code}`;
      if (location.pathname !== path) history.replaceState(null, '', path);
    } else if (hadView.current) {
      hadView.current = false;
      history.replaceState(null, '', '/');
    }
  }, [state.view]);

  let body: React.ReactNode;
  if (state.view) body = state.view.phase === 'waiting' ? <Lobby view={state.view} /> : <Table view={state.view} />;
  else if (state.resuming) body = <Resuming />;
  else body = <Home initialCode={initialCode} />;

  return (
    <>
      {state.view && state.status === 'offline' && (
        <div
          role="status"
          className="fixed inset-x-0 top-0 z-50 flex items-center justify-center gap-2 bg-danger px-4 py-2 text-sm font-medium text-white"
        >
          <WifiSlashIcon size={16} aria-hidden /> Connection lost. Reconnecting...
        </div>
      )}
      {body}
    </>
  );
}

function Resuming() {
  return (
    <div className="grid min-h-dvh place-items-center px-6" role="status" aria-live="polite">
      <div className="w-full max-w-sm space-y-4">
        <div className="h-5 w-40 animate-pulse rounded-full bg-surface-3" />
        <div className="h-28 animate-pulse rounded-[24px] bg-surface-2" />
        <p className="text-center text-sm text-muted">Rejoining your table...</p>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <IconContext.Provider value={{ weight: 'regular', size: 20 }}>
      <MotionConfig reducedMotion="user">
        <ToastProvider>
          <Screen />
        </ToastProvider>
      </MotionConfig>
    </IconContext.Provider>
  );
}
