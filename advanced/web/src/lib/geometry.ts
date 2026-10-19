/**
 * Seat geometry for the oval table. Positions are percentages of the table box.
 * Phones use a portrait oval, larger screens a landscape one, so every seat gets two positions.
 */
export interface Point {
  x: number;
  y: number;
}
export interface SeatSlot {
  /** landscape table (md and up) */
  d: Point;
  /** portrait table (phones) */
  m: Point;
}

const rad = (deg: number) => (deg * Math.PI) / 180;

/** a point on an ellipse centred in the box; 90 degrees is the top, 270 the bottom */
const onEllipse = (deg: number, rx: number, ry: number): Point => ({
  x: 50 + rx * Math.cos(rad(deg)),
  y: 50 - ry * Math.sin(rad(deg)),
});

// landscape / portrait ellipse radii (% of the box) that seat plates sit on
const D = { rx: 41, ry: 36 };
const M = { rx: 37, ry: 38 };

/** where "me" sits: bottom centre, with the rail below the plate */
export const HERO_SLOT: SeatSlot = { d: { x: 50, y: 90 }, m: { x: 50, y: 91 } };

/**
 * `count` seats. With a hero at the bottom, the others share the arc over the top and sides.
 * Without one (spectators, lobby with nobody) they are spread evenly around the whole oval.
 */
export function seatSlots(count: number, hero: boolean): SeatSlot[] {
  if (count <= 0) return [];
  const angles: number[] = [];
  if (hero) {
    if (count === 1) angles.push(90);
    else {
      const from = 208;
      const span = 236;
      for (let i = 0; i < count; i++) angles.push(from - (i * span) / (count - 1));
    }
  } else {
    for (let i = 0; i < count; i++) angles.push(270 - (i * 360) / count);
  }
  return angles.map((a) => ({ d: onEllipse(a, D.rx, D.ry), m: onEllipse(a, M.rx, M.ry) }));
}

/** a table with more people around it is taller, so neighbouring seats never touch */
export function portraitAspect(seats: number): string {
  if (seats <= 3) return '1 / 1.05';
  if (seats <= 5) return '4 / 5.2';
  if (seats <= 7) return '3 / 4.6';
  return '3 / 5.3';
}

export function landscapeAspect(seats: number): string {
  if (seats <= 3) return '2.3 / 1';
  if (seats <= 5) return '2 / 1';
  if (seats <= 7) return '1.7 / 1';
  return '1.38 / 1';
}

/** move a point a fraction of the way towards the table centre (where bets are placed) */
export const towardCentre = (p: Point, t: number): Point => ({ x: p.x + (50 - p.x) * t, y: p.y + (50 - p.y) * t });
