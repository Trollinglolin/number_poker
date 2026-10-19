type Level = 'info' | 'warn' | 'error';

/** one JSON object per line: easy for any cloud log viewer to index */
export function log(level: Level, msg: string, data: Record<string, unknown> = {}) {
  const line = JSON.stringify({ t: new Date().toISOString(), level, msg, ...data });
  (level === 'error' ? console.error : console.log)(line);
}
