export const chips = (n: number) => n.toLocaleString();

/** 13.3333 / 20 / 0.25: whole numbers stay whole, others show up to 4 decimals */
export function value(n: number): string {
  if (Number.isInteger(n)) return String(n);
  return String(Number(n.toFixed(4)));
}

export function initials(name: string): string {
  const parts = name.replace(/\(bot\)/i, '').trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '?') + (parts[1]?.[0] ?? '')).toUpperCase();
}

export const cn = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(' ');
