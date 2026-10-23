import { pool } from '../db';
import { createLeague } from './league';
import { simulateMatchday } from './simulation';
import { withTransaction } from './transaction';

const demoClubs = [
  ['Amberlight', 'AMB', '#e88c35', '#17212d', 78, 72],
  ['Bracken Vale', 'BRK', '#75c56b', '#18332e', 66, 70],
  ['Cinder Reach', 'CIN', '#d96154', '#26344a', 73, 65],
  ['Duskwater', 'DSK', '#747be8', '#f2cf50', 64, 79],
  ['Emberford', 'EMB', '#ed695b', '#f4dfb3', 83, 61],
  ['Fernhollow', 'FER', '#37a77b', '#d1e1cf', 68, 76],
  ['Glassmere', 'GLA', '#e3bc42', '#354a67', 72, 68],
  ['Hearthside', 'HEA', '#c777a5', '#f2d9e5', 60, 74],
  ['Indigo Field', 'IND', '#4968c8', '#e0c65a', 77, 70],
  ['Juniper Bay', 'JUN', '#38a6a0', '#1b3041', 69, 82],
  ['Kestrel Downs', 'KES', '#d7813d', '#463855', 80, 63],
  ['Larkspur', 'LAR', '#ba6b56', '#ede2c8', 63, 67],
  ['Morrowfen', 'MOR', '#667a58', '#d6bb4b', 74, 73],
  ['Northglass', 'NOR', '#61a8cb', '#edf0e6', 71, 77],
  ['Orchard Row', 'ORC', '#b5bd4b', '#344735', 65, 71],
  ['Pinehaven', 'PIN', '#486d53', '#d2b65f', 76, 66],
] as const;

export async function ensureDemoLeague() {
  return withTransaction(async (client) => {
    await client.query('SELECT pg_advisory_xact_lock(74190231)');
    const existing = await client.query<{ id: number }>('SELECT id FROM leagues LIMIT 1');
    if (existing.rowCount) return existing.rows[0].id;

    const league = await createLeague(client, {
      name: 'Demo league',
      season_label: '2026',
      points_win: 3,
      points_draw: 1,
      top_zone: 4,
      bottom_zone: 3,
      clubs: demoClubs.map(([name, short_name, colour_primary, colour_secondary, attack, defence]) => ({
        name,
        short_name,
        colour_primary,
        colour_secondary,
        attack,
        defence,
      })),
    });

    for (let matchday = 1; matchday <= 10; matchday += 1) {
      await simulateMatchday(client, league.id, matchday);
    }
    return league.id;
  });
}
