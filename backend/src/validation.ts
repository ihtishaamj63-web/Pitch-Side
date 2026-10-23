import { z } from 'zod';
import { ApiError } from './errors';

const clubSchema = z.object({
  name: z.string().trim().min(1).max(100),
  short_name: z.string().trim().length(3).regex(/^[A-Za-z]{3}$/),
  colour_primary: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  colour_secondary: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  attack: z.number().int().min(1).max(100),
  defence: z.number().int().min(1).max(100),
});

export const createLeagueSchema = z.object({
  name: z.string().trim().min(1).max(100),
  season_label: z.string().trim().min(1).max(50),
  points_win: z.number().int().positive().default(3),
  points_draw: z.number().int().nonnegative().default(1),
  top_zone: z.number().int().nonnegative().default(4),
  bottom_zone: z.number().int().nonnegative().default(3),
  clubs: z.array(clubSchema).min(4).max(20),
}).superRefine(({ clubs }, context) => {
  const names = clubs.map(({ name }) => name.toLocaleLowerCase());
  const shortNames = clubs.map(({ short_name }) => short_name.toUpperCase());

  if (new Set(names).size !== names.length) {
    context.addIssue({ code: 'custom', message: 'Club names must be unique', path: ['clubs'] });
  }
  if (new Set(shortNames).size !== shortNames.length) {
    context.addIssue({ code: 'custom', message: 'Club short names must be unique', path: ['clubs'] });
  }
});

export const forecastSchema = z.object({
  runs: z.number().int().positive().max(50_000).default(10_000),
  seed: z.number().int().optional(),
});

export function parseId(value: string): number {
  if (!/^[1-9]\d*$/.test(value)) throw new ApiError('Invalid id', 400);
  const id = Number(value);
  if (!Number.isSafeInteger(id)) throw new ApiError('Invalid id', 400);
  return id;
}
