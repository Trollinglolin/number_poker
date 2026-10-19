import type { RoomView } from '@numberpoker/shared';

/** the one-line "what is happening" shown in the middle of the table */
export function headline(view: RoomView): { title: string; sub: string } {
  const name = (id: string | null) => view.players.find((p) => p.id === id)?.name ?? 'Someone';
  const me = view.you;
  if (view.pendingSwap) {
    return view.pendingSwap.playerId === me
      ? { title: 'Choose your swap', sub: 'You drew a multiply card.' }
      : { title: `${name(view.pendingSwap.playerId)} drew a multiply`, sub: 'Dealing resumes after their choice.' };
  }
  switch (view.phase) {
    case 'preflop':
    case 'betting1':
    case 'betting2': {
      const round = view.phase === 'preflop' ? 'First' : view.phase === 'betting1' ? 'Second' : 'Final';
      const sub = view.pot === 0 ? `${round} betting round. The pot is empty, raise to play for chips.` : `${round} betting round`;
      if (view.turn === me) return { title: 'Your move', sub };
      return { title: `${name(view.turn)} to act`, sub };
    }
    case 'dealing1':
    case 'dealing2':
      return { title: 'Dealing', sub: 'Cards are on their way.' };
    case 'equation': {
      const live = view.players.filter((p) => !p.folded && !p.eliminated);
      const done = live.filter((p) => p.submitted).length;
      return { title: 'Equation round', sub: `${done} of ${live.length} locked in` };
    }
    case 'ended':
      return { title: 'Hand complete', sub: view.result?.kind === 'showdown' ? 'Equations revealed' : '' };
    default:
      return { title: 'Waiting', sub: '' };
  }
}
