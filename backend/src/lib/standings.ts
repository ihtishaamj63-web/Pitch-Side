import { ClubId } from './league';

export interface Club {
  id: ClubId;
  name: string;
  attack: number;
  defence: number;
}

export interface PlayedMatch {
  homeClubId: ClubId;
  awayClubId: ClubId;
  homeGoals: number;
  awayGoals: number;
  matchday?: number;
}

export interface TableRow {
  clubId: ClubId;
  clubName: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
  form: string;
  position: number;
}

export interface TableRules {
  pointsWin?: number;
  pointsDraw?: number;
}

export const DEFAULT_TABLE_RULES: Required<TableRules> = { pointsWin: 3, pointsDraw: 1 };

function validateGoals(goals: number): void {
  if (!Number.isInteger(goals) || goals < 0) {
    throw new Error('Match goals must be non-negative integers');
  }
}

/** Builds a standings table, ranking by points, goal difference, goals scored, then name. */
export function computeTable(
  clubs: Club[],
  matches: PlayedMatch[],
  rules: TableRules = DEFAULT_TABLE_RULES,
): TableRow[] {
  const effectiveRules = { ...DEFAULT_TABLE_RULES, ...rules };
  if (!Number.isFinite(effectiveRules.pointsWin) || effectiveRules.pointsWin < 0 ||
      !Number.isFinite(effectiveRules.pointsDraw) || effectiveRules.pointsDraw < 0) {
    throw new Error('Table points rules must be finite non-negative numbers');
  }
  const byId = new Map<ClubId, TableRow>();
  clubs.forEach((club) => {
    if (byId.has(club.id)) throw new Error(`Duplicate club ID: ${club.id}`);
    byId.set(club.id, {
      clubId: club.id,
      clubName: club.name,
      played: 0,
      won: 0,
      drawn: 0,
      lost: 0,
      goalsFor: 0,
      goalsAgainst: 0,
      goalDifference: 0,
      points: 0,
      form: '',
      position: 0,
    });
  });

  const formByTeam = new Map<ClubId, string[]>();
  clubs.forEach((club) => {
    formByTeam.set(club.id, []);
  });

  const orderedMatches = matches.every((match) => match.matchday !== undefined)
    ? matches.slice().sort((left, right) => (left.matchday as number) - (right.matchday as number))
    : matches;
  orderedMatches.forEach((match) => {
    const home = byId.get(match.homeClubId);
    const away = byId.get(match.awayClubId);
    if (!home || !away) throw new Error('Match references an unknown club');
    if (home.clubId === away.clubId) throw new Error('A club cannot play against itself');
    validateGoals(match.homeGoals);
    validateGoals(match.awayGoals);

    home.played += 1;
    away.played += 1;
    home.goalsFor += match.homeGoals;
    home.goalsAgainst += match.awayGoals;
    away.goalsFor += match.awayGoals;
    away.goalsAgainst += match.homeGoals;

    if (match.homeGoals > match.awayGoals) {
      home.won += 1;
      home.points += effectiveRules.pointsWin;
      away.lost += 1;
      formByTeam.get(home.clubId)?.push('W');
      formByTeam.get(away.clubId)?.push('L');
    } else if (match.homeGoals < match.awayGoals) {
      away.won += 1;
      away.points += effectiveRules.pointsWin;
      home.lost += 1;
      formByTeam.get(home.clubId)?.push('L');
      formByTeam.get(away.clubId)?.push('W');
    } else {
      home.drawn += 1;
      away.drawn += 1;
      home.points += effectiveRules.pointsDraw;
      away.points += effectiveRules.pointsDraw;
      formByTeam.get(home.clubId)?.push('D');
      formByTeam.get(away.clubId)?.push('D');
    }
  });

  const table = clubs.map((club) => {
    const standing = byId.get(club.id) as TableRow;
    standing.goalDifference = standing.goalsFor - standing.goalsAgainst;
    standing.form = (formByTeam.get(club.id) || []).slice(-5).join('');
    return standing;
  });

  table.sort((left, right) =>
    right.points - left.points ||
    right.goalDifference - left.goalDifference ||
    right.goalsFor - left.goalsFor ||
    left.clubName.localeCompare(right.clubName, undefined, { sensitivity: 'base' }),
  );
  table.forEach((standing, index) => {
    standing.position = index + 1;
  });
  return table;
}
