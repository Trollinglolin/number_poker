import { z } from 'zod';

const cardIds = z.array(z.string().max(16)).max(12);

export const commandSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('fold') }),
  z.object({ type: z.literal('call') }),
  z.object({ type: z.literal('raise'), amount: z.number().int().min(1).max(1_000_000_000) }),
  z.object({ type: z.literal('swap'), op: z.enum(['add', 'subtract']) }),
  z.object({ type: z.literal('noSwap') }),
  z.object({
    type: z.literal('submit'),
    betType: z.enum(['small', 'big', 'both']),
    small: cardIds.optional(),
    big: cardIds.optional(),
  }),
  z.object({ type: z.literal('start') }),
  z.object({ type: z.literal('addBot') }),
  z.object({ type: z.literal('kick'), playerId: z.string().max(64) }),
  z.object({ type: z.literal('leave') }),
  z.object({ type: z.literal('reset') }),
]);

export const createSchema = z.object({ name: z.string().max(80) });

export const joinSchema = z.object({
  code: z.string().min(3).max(12),
  name: z.string().max(80),
  playerId: z.string().max(64).optional(),
  token: z.string().max(128).optional(),
});
