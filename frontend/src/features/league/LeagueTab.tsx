import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { api, readableError } from '../../api';
import { ClubCrest } from '../../Crest';
import { EmptyPanel, ErrorNotice, SectionTitle } from '../../components/common';
import { clubFromMatch, eventLabel, getMatchEvents, totalMatchdays } from '../../lib/match';
import { useApi } from '../api/useApi';
import type { Club, Match, MatchDetail, MatchPlayerStats, PlayerStat, Standing } from '../../types';

export interface MatchPlayback {
  match: MatchDetail;
  minute: number;
  complete: boolean;
  startedAt: number;
}

export function LeagueTab({ tab, leagueId, clubs, standings, matchday, onMatchdayChange, managerClubId, topZone, bottomZone, refreshKey, seasonComplete }: { tab: string; leagueId: string; clubs: Club[]; standings: Standing[]; matchday: number; onMatchdayChange: (matchday: number) => void; managerClubId: number | null; topZone: number; bottomZone: number; refreshKey: number; seasonComplete: boolean }) {
  if (tab === 'fixtures') return <FixturesTab key={refreshKey} leagueId={leagueId} matchday={matchday} onMatchdayChange={onMatchdayChange} totalMatchdays={totalMatchdays(clubs.length)} />;
  if (tab === 'match-centre') return <MatchCentreTab key={refreshKey} leagueId={leagueId} matchday={matchday} managerClubId={managerClubId} />;
  if (tab === 'scorers') return <ScorersTab key={refreshKey} leagueId={leagueId} matchday={matchday} />;
  if (tab === 'awards') return <AwardsTab key={refreshKey} leagueId={leagueId} matchday={matchday} seasonComplete={seasonComplete} />;
  return <TableTab standings={standings} topZone={topZone} bottomZone={bottomZone} />;
}
function matchPlayerScore(player: MatchPlayerStats): number {
  return player.goals * 4 + player.assists * 3 + player.shots_on_target * 0.5
    + player.key_passes * 0.25 + player.tackles * 0.1 - player.yellow_cards * 0.35 - player.red_cards;
}

function getManOfTheMatch(players: MatchPlayerStats[]): MatchPlayerStats | undefined {
  return [...players].sort((a, b) =>
    matchPlayerScore(b) - matchPlayerScore(a)
    || b.minutes_played - a.minutes_played
    || a.player_name.localeCompare(b.player_name),
  ).find(player => player.minutes_played > 0);
}

function MatchPitch({ homeClub, awayClub, homePlayers, awayPlayers, homeSubs, awaySubs }: {
  homeClub: Club; awayClub: Club;
  homePlayers: MatchPlayerStats[]; awayPlayers: MatchPlayerStats[];
  homeSubs: MatchDetail['substitutions']; awaySubs: MatchDetail['substitutions'];
}) {
  const getStarters = (players: MatchPlayerStats[]) => {
    const starters = players.filter(player => player.is_starter);
    return starters.length ? starters : [...players].filter(player => player.minutes_played > 0)
      .sort((a, b) => ['GK', 'DEF', 'MID', 'FWD'].indexOf(a.position) - ['GK', 'DEF', 'MID', 'FWD'].indexOf(b.position)).slice(0, 11);
  };
  const renderTeam = (players: MatchPlayerStats[], direction: 'up' | 'down') => {
    const order = direction === 'up' ? ['GK', 'DEF', 'MID', 'FWD'] : ['FWD', 'MID', 'DEF', 'GK'];
    const selected = getStarters(players);
    return <div className="pitch-team">{order.map(position => <div className="pitch-line" key={position}>
      {selected.filter(player => player.position === position).map(player => <div className="pitch-player" key={player.player_id}>
        <span className="pitch-player-mark">{player.player_name.split(/\s+/).map(part => part[0]).slice(0, 2).join('')}<i className="pitch-player-rating">{Math.max(5, Math.min(10, 6 + matchPlayerScore(player))).toFixed(1)}</i></span>
        <strong>{player.player_name}</strong>
      </div>)}
    </div>)}</div>;
  };
  const renderBench = (players: MatchPlayerStats[], subs: MatchDetail['substitutions'], name: string) => {
    const starters = new Set(getStarters(players).map(player => String(player.player_id)));
    const bench = players.filter(player => !starters.has(String(player.player_id)));
    if (!bench.length && !subs.length) return null;
    return <details className="pitch-extras"><summary>{name}: bench and changes</summary><div>
      {bench.map(player => <span key={player.player_id}>{player.player_name} <small>{player.position}{player.minutes_played ? ` · ${player.minutes_played} min` : ''}</small></span>)}
      {subs.map(sub => <span key={sub.id}>{sub.minute}&apos; {sub.player_on_name} on for {sub.player_off_name}</span>)}
    </div></details>;
  };
  return <section className="match-pitch" aria-label="Match line-ups on a football pitch">
    <div className="pitch-half pitch-half--away">{renderTeam(awayPlayers, 'up')}<div className="pitch-end"><ClubCrest club={awayClub} size="small" /><strong>{awayClub.short_name}</strong></div></div>
    <div className="pitch-midline"><span /></div>
    <div className="pitch-half pitch-half--home">{renderTeam(homePlayers, 'down')}<div className="pitch-end"><ClubCrest club={homeClub} size="small" /><strong>{homeClub.short_name}</strong></div></div>
    {renderBench(awayPlayers, awaySubs, awayClub.short_name)}{renderBench(homePlayers, homeSubs, homeClub.short_name)}
  </section>;
}

export function MatchdayPlayback({ playback, onClose, onFastForward }: { playback: MatchPlayback; onClose: () => void; onFastForward: () => void }) {
  const { match, minute, complete } = playback;
  const allEvents = getMatchEvents(match);
  const visibleEvents = allEvents.filter(event => event.minute <= minute);
  const goalsSoFar = visibleEvents.filter(event => event.eventType === 'goal');
  const homeScore = goalsSoFar.filter(event => String(event.club_id) === String(match.home_club_id)).length;
  const awayScore = goalsSoFar.filter(event => String(event.club_id) === String(match.away_club_id)).length;
  const latestEvent = visibleEvents[visibleEvents.length - 1];
  const scenes = ['kickoff.jpg', 'fans.jpg', 'corner.jpg', 'ballinnet.jpg', 'referee.jpg', 'goalkeeper.jpg', 'empty-stadium.jpg', 'motm.jpg'];
  const scene = complete ? scenes[scenes.length - 1] : scenes[Math.min(scenes.length - 2, Math.floor(minute / 13))];
  const manOfTheMatch = complete ? getManOfTheMatch(match.player_stats) : undefined;
  const homeStats = match.team_stats.find(stats => String(stats.club_id) === String(match.home_club_id));
  const awayStats = match.team_stats.find(stats => String(stats.club_id) === String(match.away_club_id));

  return <div className="matchday-overlay" role="dialog" aria-modal="true" aria-labelledby="matchday-live-title">
    <section className="matchday-live">
      <header className="matchday-live-header" style={{ backgroundImage: `linear-gradient(90deg, rgba(7, 13, 19, .9), rgba(7, 13, 19, .48)), url('/matchday/${scene}')` }}>
        <div><div className="eyebrow">{complete ? 'FULL TIME' : 'MATCHDAY LIVE'}</div><h2 id="matchday-live-title">{match.home_club_name} <span>v</span> {match.away_club_name}</h2></div>
        <div className="matchday-live-score" aria-live="polite">{homeScore}<span>:</span>{awayScore}</div>
      </header>
      <div className="matchday-progress-meta"><span>{complete ? 'FULL TIME' : 'MATCH IN PROGRESS'}</span><strong>{minute}&apos; <small>/ 90&apos;</small></strong></div>
      <div className="matchday-progress" role="progressbar" aria-label="Match minute" aria-valuemin={0} aria-valuemax={90} aria-valuenow={minute}><span style={{ width: `${minute / 90 * 100}%` }} /></div>
      <div className="matchday-live-feed" aria-live="polite">
        {visibleEvents.length ? [...visibleEvents].reverse().map(event => <div key={`${event.eventType}-${event.id}`} className={`live-event live-event--${event.eventType}`}>
          <b>{event.minute}&apos;</b><span><strong>{event.player_name}</strong><small>{eventLabel(event)}</small></span><i>{event.eventType === 'goal' ? '⚽' : event.eventType === 'yellow' ? '🟨' : event.eventType === 'red' ? '🟥' : event.eventType === 'substitution' ? '↔' : '⚑'}</i>
        </div>) : <p className="live-commentary">{minute < 20 ? 'The teams are feeling each other out. No clear chances yet.' : 'A cagey contest so far. The crowd is waiting for a breakthrough.'}</p>}
        {!complete && latestEvent && <p className="live-commentary">{latestEvent.eventType === 'goal' ? `GOAL! ${latestEvent.player_name}${latestEvent.assist_player_name ? ` finishes a move created by ${latestEvent.assist_player_name}` : ' finds the net'}.` : latestEvent.eventType === 'yellow' ? `${latestEvent.player_name} is booked.` : latestEvent.eventType === 'red' ? `${latestEvent.player_name} is sent off.` : `${latestEvent.player_name} gives away a foul.`}</p>}
      </div>
      {complete && <div className="live-fulltime">
        {manOfTheMatch && <div className="live-motm"><img src="/matchday/motm.jpg" alt="" /><span><small>PLAYER OF THE MATCH</small><strong>{manOfTheMatch.player_name} <i className="motm-badge">MOTM</i></strong></span></div>}
        {homeStats && awayStats && <div className="live-fulltime-stats"><span>Shots <b>{homeStats.shots}–{awayStats.shots}</b></span><span>Corners <b>{homeStats.corners}–{awayStats.corners}</b></span><span>Saves <b>{homeStats.saves}–{awayStats.saves}</b></span></div>}
      </div>}
      <footer className="matchday-live-actions">
        {!complete && <button className="button button-quiet button-small" onClick={onFastForward}>Skip to full-time</button>}
        {complete && <button className="button button-primary button-small" onClick={onClose}>Close match report</button>}
      </footer>
    </section>
  </div>;
}

function TableTab({ standings, topZone, bottomZone }: { standings: Standing[]; topZone: number; bottomZone: number }) {
  const reduceMotion = useReducedMotion();
  const previousStats = useRef(new Map<string, Pick<Standing, 'P' | 'W' | 'D' | 'L' | 'GF' | 'GA' | 'GD' | 'Pts'>>());
  const [changedStats, setChangedStats] = useState(new Set<string>());
  useEffect(() => {
    const nextStats = new Map<string, Pick<Standing, 'P' | 'W' | 'D' | 'L' | 'GF' | 'GA' | 'GD' | 'Pts'>>();
    const changed = new Set<string>();
    const fields = ['P', 'W', 'D', 'L', 'GF', 'GA', 'GD', 'Pts'] as const;
    standings.forEach((row) => {
      const id = String(row.club_id || row.id);
      const prior = previousStats.current.get(id);
      const current = Object.fromEntries(fields.map((field) => [field, row[field] ?? 0])) as Pick<Standing, 'P' | 'W' | 'D' | 'L' | 'GF' | 'GA' | 'GD' | 'Pts'>;
      fields.forEach((field) => {
        if (prior && prior[field] !== current[field]) changed.add(`${id}:${field}`);
      });
      nextStats.set(id, current);
    });
    previousStats.current = nextStats;
    setChangedStats(changed);
    const timeout = window.setTimeout(() => setChangedStats(new Set()), 1400);
    return () => window.clearTimeout(timeout);
  }, [standings]);

  const statCell = (row: Standing, field: 'P' | 'W' | 'D' | 'L' | 'GF' | 'GA' | 'GD' | 'Pts') => {
    const id = String(row.club_id || row.id);
    const value = row[field] ?? 0;
    const displayValue = field === 'GD' && value > 0 ? `+${value}` : value;
    const className = [field === 'Pts' ? 'points-col' : '', field === 'GD' && value > 0 ? 'positive' : '', changedStats.has(`${id}:${field}`) ? 'number-changed' : ''].filter(Boolean).join(' ');
    return <td key={field} className={className}>{field === 'Pts' ? <strong>{displayValue}</strong> : displayValue}</td>;
  };

  return <section className="tab-panel"><SectionTitle title="Standings" detail="Ranked by points, goal difference and goals scored." />
    <div className="legend"><span><i className="legend-top" />Top zone</span><span><i className="legend-bottom" />Bottom zone</span></div>
    {standings.length ? <div className="table-wrap"><table className="standings-table"><thead><tr><th className="align-left">POS</th><th className="align-left">CLUB</th><th>P</th><th>W</th><th>D</th><th>L</th><th>GF</th><th>GA</th><th>GD</th><th className="points-col">PTS</th><th className="form-col">FORM</th></tr></thead>
      <tbody>{standings.map((row, index) => {
        const clubId = row.club_id || row.id;
        const club = { id: clubId, name: row.club_name || row.name, short_name: row.short_name, colour_primary: row.colour_primary, colour_secondary: row.colour_secondary };
        return <motion.tr layout={!reduceMotion} key={clubId} className={index < topZone ? 'zone-top' : index >= standings.length - bottomZone ? 'zone-bottom' : ''}>
          <td className="position-cell"><span>{row.position || index + 1}</span></td><td><Link className="table-club" to={`/clubs/${clubId}`}><ClubCrest club={club} size="small" /><strong>{club.name}</strong>{index === 0 && <span className="table-trophy" role="img" aria-label="League leader" title="League leader">🏆</span>}<span className="club-code">{club.short_name}</span></Link></td>
          {statCell(row, 'P')}{statCell(row, 'W')}{statCell(row, 'D')}{statCell(row, 'L')}{statCell(row, 'GF')}{statCell(row, 'GA')}{statCell(row, 'GD')}{statCell(row, 'Pts')}<td><FormDots form={row.form} /></td>
        </motion.tr>;
      })}</tbody></table></div> : <EmptyPanel title="The table is waiting" text="Simulate a matchday to bring your standings to life." />}
  </section>;
}

export function FormDots({ form }: { form: string }) {
  if (!form) return <span className="form-empty">—</span>;
  return <span className="form-dots" aria-label={`Form: ${form}`}>{form.split('').map((result, i) => <i key={`${result}-${i}`} className={`form-${result.toLowerCase()}`} title={result} />)}</span>;
}

function FixturesTab({ leagueId, matchday, onMatchdayChange, totalMatchdays }: { leagueId: string; matchday: number; onMatchdayChange: (matchday: number) => void; totalMatchdays: number }) {
  const loadMatches = useCallback(() => api.matches(leagueId, matchday), [leagueId, matchday]);
  const { data: matchData, error } = useApi(`matches:${leagueId}:${matchday}`, loadMatches);
  const matches = matchData ?? [];
  return <section className="tab-panel"><div className="content-heading"><div><h2>Fixtures <span className="heading-count">/ Matchday {String(matchday).padStart(2, '0')}</span></h2></div><div className="matchday-stepper"><button type="button" disabled={matchday <= 1} onClick={() => onMatchdayChange(Math.max(1, matchday - 1))}>Previous</button><label className="matchday-select">Matchday<select value={matchday} onChange={e => onMatchdayChange(Number(e.target.value))}>{Array.from({ length: totalMatchdays }, (_, i) => <option key={i + 1} value={i + 1}>{String(i + 1).padStart(2, '0')}</option>)}</select></label><button type="button" disabled={matchday >= totalMatchdays} onClick={() => onMatchdayChange(Math.min(totalMatchdays, matchday + 1))}>Next</button></div></div>
    {error && <ErrorNotice message={error} />}
    <MatchList matches={matches} leagueId={leagueId} />
  </section>;
}

export function MatchList({ matches, leagueId }: { matches: Match[]; leagueId?: number | string }) {
  return matches.length ? <div className="match-list">{matches.map(match => <Link className="match-card" key={match.id} to={`/leagues/${leagueId || match.league_id || ''}/match-centre?matchday=${match.matchday}&match=${match.id}`}>
    <span className="match-kickoff">{match.played_at ? new Date(match.played_at).toLocaleDateString(undefined, { day: '2-digit', month: 'short' }) : `MD ${match.matchday}`}</span>
    <MatchTeam match={match} side="home" align="right" />
    <span className={`match-score${match.home_goals === null ? ' upcoming' : ''}`}>{match.home_goals ?? '–'} <i>:</i> {match.away_goals ?? '–'}</span>
    <MatchTeam match={match} side="away" />
    {match.goal_events?.length ? <span className="match-event-summary">{match.goal_events.map((goal, index) => <span key={`${goal.minute}-${index}`}><strong>{goal.player_name} {goal.minute}&apos;</strong>{goal.assist_player_name ? ` · Assist: ${goal.assist_player_name}` : ' · Unassisted'}</span>)}</span> : null}
    {match.home_xg !== null && match.home_xg !== undefined ? <span className="match-stat-summary">xG {Number(match.home_xg).toFixed(2)} – {Number(match.away_xg).toFixed(2)} · YC {match.yellow_card_count ?? 0} · RC {match.red_card_count ?? 0}</span> : null}
  </Link>)}</div> : <EmptyPanel title="No fixtures in this round" text="Select another matchday or simulate to reveal what's next." />;
}

function MatchTeam({ match, side, align = 'left' }: { match: Match; side: 'home' | 'away'; align?: 'left' | 'right' }) {
  const club = clubFromMatch(match, side);
  return <span className={`match-team match-team--${align}`}>{align === 'left' && <ClubCrest club={club} size="small" />}<strong>{club.name}</strong>{align === 'right' && <ClubCrest club={club} size="small" />}</span>;
}

function MatchCentreTab({ leagueId, matchday, managerClubId }: { leagueId: string; matchday: number; managerClubId: number | null }) {
  const [searchParams] = useSearchParams();
  const requestedMatch = searchParams.get('match');
  const [matches, setMatches] = useState<Match[]>([]);
  const [selected, setSelected] = useState('');
  const [loadedMatch, setMatch] = useState<MatchDetail | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let cancelled = false;
    api.matches(leagueId, matchday).then(data => {
      if (cancelled) return;
      setMatches(data);
      const requested = data.find(game => String(game.id) === requestedMatch);
      const managed = data.find(game => [game.home_club_id, game.away_club_id].some(id => Number(id) === managerClubId));
      setSelected(String(requested?.id ?? managed?.id ?? data[0]?.id ?? ''));
    }).catch(e => { if (!cancelled) setError(readableError(e)); });
    return () => { cancelled = true; };
  }, [leagueId, matchday, managerClubId, requestedMatch]);
  useEffect(() => {
    if (!selected) return;
    let cancelled = false;
    api.match(selected).then(data => { if (!cancelled) { setMatch(data); setError(''); } }).catch(e => { if (!cancelled) setError(readableError(e)); });
    return () => { cancelled = true; };
  }, [selected]);
  const match = loadedMatch && String(loadedMatch.id) === selected ? loadedMatch : null;
  const allMatchEvents = match ? getMatchEvents(match) : [];
  const homeEvents = allMatchEvents.filter(event => String(event.club_id) === String(match?.home_club_id));
  const awayEvents = allMatchEvents.filter(event => String(event.club_id) === String(match?.away_club_id));
  const teamStat = (clubId: number | string) => match?.team_stats?.find(stat => String(stat.club_id) === String(clubId));
  const homeStats = match ? teamStat(match.home_club_id) : undefined;
  const awayStats = match ? teamStat(match.away_club_id) : undefined;
  const manOfTheMatch = match ? getManOfTheMatch(match.player_stats ?? []) : undefined;
  const homeSubstitutions = match?.substitutions?.filter(substitution => String(substitution.club_id) === String(match.home_club_id)) ?? [];
  const awaySubstitutions = match?.substitutions?.filter(substitution => String(substitution.club_id) === String(match.away_club_id)) ?? [];
  const homePlayers = match?.player_stats?.filter(player => String(player.club_id) === String(match.home_club_id)) ?? [];
  const awayPlayers = match?.player_stats?.filter(player => String(player.club_id) === String(match.away_club_id)) ?? [];
  const isMatchPlayed = match?.home_goals !== null && match?.home_goals !== undefined;
  return <section className="tab-panel match-centre-page"><div className="match-centre-heading"><h2>Match centre</h2>
    <select className="styled-select match-picker-select" aria-label="Choose fixture" value={selected} onChange={e => setSelected(e.target.value)} disabled={!matches.length}>{matches.length
      ? matches.map(game => <option key={game.id} value={game.id}>{game.home_club_name} {game.home_goals ?? '–'} : {game.away_goals ?? '–'} {game.away_club_name}</option>)
      : <option value="">No fixtures for this matchday</option>}</select></div>
    {error && <ErrorNotice message={error} />}
    {match ? <div className="match-report">
      <div className="report-scoreboard"><span className="report-round">MATCHDAY {match.matchday}</span><div className="report-teams"><ReportTeam club={clubFromMatch(match, 'home')} /><div className="report-score">{match.home_goals ?? '–'}<span>:</span>{match.away_goals ?? '–'}</div><ReportTeam club={clubFromMatch(match, 'away')} /></div><span className="report-date">{match.played_at ? new Date(match.played_at).toLocaleString() : 'KICK-OFF PENDING'}</span></div>
      {!isMatchPlayed ? <div className="pre-match-preview">
        <img src="/matchday/kickoff.jpg" alt="" />
        <div><div className="eyebrow">FIXTURE PREVIEW</div><h3>Ready for kick-off</h3><p>Line-ups, match events and statistics will appear after this matchday is simulated.</p></div>
      </div> : <>
        {manOfTheMatch && <div className="report-motm"><span><strong>{manOfTheMatch.player_name} <i className="motm-badge">MOTM</i></strong></span></div>}
        <MatchPitch
          homeClub={clubFromMatch(match, 'home')} awayClub={clubFromMatch(match, 'away')}
          homePlayers={homePlayers} awayPlayers={awayPlayers} homeSubs={homeSubstitutions} awaySubs={awaySubstitutions}
        />
        <div className="timeline"><div className="timeline-column">{homeEvents.map(event => <div className={`goal-event goal-event--${event.eventType}`} key={`${event.eventType}-${event.id}`}><b>{event.minute}&apos;</b><span><strong>{event.player_name}</strong><small>{event.eventType === 'goal' ? `GOAL${event.assist_player_name ? ` · ASSIST: ${event.assist_player_name}` : ' · UNASSISTED'}` : event.eventType === 'yellow' ? 'YELLOW CARD' : event.eventType === 'red' ? 'RED CARD' : event.eventType === 'substitution' ? `SUB ON · ${event.player_off_name} OFF` : 'FOUL'}</small></span></div>)}</div><div className="timeline-line"><span>0&apos;</span><i /><span>90&apos;</span></div><div className="timeline-column timeline-column--right">{awayEvents.map(event => <div className={`goal-event goal-event--${event.eventType}`} key={`${event.eventType}-${event.id}`}><b>{event.minute}&apos;</b><span><strong>{event.player_name}</strong><small>{event.eventType === 'goal' ? `GOAL${event.assist_player_name ? ` · ASSIST: ${event.assist_player_name}` : ' · UNASSISTED'}` : event.eventType === 'yellow' ? 'YELLOW CARD' : event.eventType === 'red' ? 'RED CARD' : event.eventType === 'substitution' ? `SUB ON · ${event.player_off_name} OFF` : 'FOUL'}</small></span></div>)}</div></div>
        {!match.goals?.length && !match.yellow_cards?.length && !match.red_cards?.length && !match.fouls?.length && !match.substitutions?.length && <p className="no-goals">No match events recorded for this fixture.</p>}
        {homeStats && awayStats && <section className="match-stats"><h3>Match statistics</h3><div className="match-stats-head"><span>{match.home_short_name}</span><span>STAT</span><span>{match.away_short_name}</span></div>{[
          ['Expected goals (xG)', Number(match.home_xg ?? homeStats.xg).toFixed(2), Number(match.away_xg ?? awayStats.xg).toFixed(2)],
          ['Possession', `${homeStats.possession}%`, `${awayStats.possession}%`],
          ['Shots', homeStats.shots, awayStats.shots],
          ['Shots on target', homeStats.shots_on_target, awayStats.shots_on_target],
          ['Corners', homeStats.corners, awayStats.corners],
          ['Fouls', homeStats.fouls, awayStats.fouls],
          ['Saves', homeStats.saves, awayStats.saves],
        ].map(([label, homeValue, awayValue]) => <div className="match-stats-row" key={label}><strong>{homeValue}</strong><span>{label}</span><strong>{awayValue}</strong></div>)}</section>}
      </>}
    </div> : <EmptyPanel title="No match selected" text="Select a fixture above to view the match." />}
  </section>;
}

function ReportTeam({ club }: { club: Club }) {
  return <div className="report-team"><ClubCrest club={club} size="large" /><strong>{club.name}</strong></div>;
}

function ScorersTab({ leagueId, matchday }: { leagueId: string; matchday: number }) {
  const loadPlayers = useCallback(() => api.playerStats(leagueId, matchday), [leagueId, matchday]);
  const { data: playerData, error } = useApi(`player-stats:${leagueId}:${matchday}`, loadPlayers);
  const players = playerData ?? [];
  const leaderboards = [
    { label: 'Goals', key: 'goals' as const, suffix: 'G' },
    { label: 'Assists', key: 'assists' as const, suffix: 'A' },
    { label: 'Yellow cards', key: 'yellow_cards' as const, suffix: 'YC' },
    { label: 'Red cards', key: 'red_cards' as const, suffix: 'RC' },
    { label: 'Fouls', key: 'fouls' as const, suffix: 'F' },
    { label: 'Shots', key: 'shots' as const, suffix: 'SH' },
    { label: 'Shots on target', key: 'shots_on_target' as const, suffix: 'SOT' },
    { label: 'Expected goals', key: 'xg' as const, suffix: 'xG' },
    { label: 'Key passes', key: 'key_passes' as const, suffix: 'KP' },
    { label: 'Tackles', key: 'tackles' as const, suffix: 'T' },
  ];
  return <section className="tab-panel"><SectionTitle title="Player statistics" detail="Season totals for attacking output, passing and discipline." />
    {error && <ErrorNotice message={error} />}
    {players.length ? <div className="leaderboards">{leaderboards.map(({ label, key, suffix }) => {
      const rows = [...players].sort((a, b) => Number(b[key]) - Number(a[key]) || b.goals - a.goals || a.player_name.localeCompare(b.player_name)).filter(player => Number(player[key]) > 0).slice(0, 5);
      const maximum = Number(rows[0]?.[key]) || 1;
      return <section className="leaderboard-panel" key={key}><h3>{label}</h3>{rows.length ? rows.map((player, index) => <Link to={`/clubs/${player.club_id}`} className="leaderboard-row" key={player.player_id}><span className="scorer-rank">{String(index + 1).padStart(2, '0')}</span><span className="leaderboard-player"><strong>{player.player_name}</strong><small>{player.club_name} · {player.short_name}</small></span><span className="leaderboard-bar"><i style={{ width: `${Math.max(8, Number(player[key]) / maximum * 100)}%` }} /></span><strong className="scorer-goals">{key === 'xg' ? Number(player[key]).toFixed(2) : player[key]}<small>{suffix}</small></strong></Link>) : <p className="leaderboard-empty">No {label.toLowerCase()} recorded.</p>}</section>;
    })}</div> : <EmptyPanel title="No player statistics yet" text="Simulate fixtures to record goals, assists and yellow cards." />}
  </section>;
}

function seasonPlayerScore(player: PlayerStat): number {
  return player.goals * 4 + player.assists * 3 + player.key_passes * 0.15
    + player.tackles * 0.08 + player.minutes / 1000 - player.red_cards * 1.5 - player.yellow_cards * 0.2;
}

function AwardsTab({ leagueId, matchday, seasonComplete }: { leagueId: string; matchday: number; seasonComplete: boolean }) {
  const loadPlayers = useCallback(() => api.playerStats(leagueId, matchday), [leagueId, matchday]);
  const { data: playerData, error } = useApi(`player-stats:${leagueId}:${matchday}`, loadPlayers);
  const players = playerData ?? [];

  const rankedPlayers = [...players].sort((a, b) =>
    seasonPlayerScore(b) - seasonPlayerScore(a)
    || b.goals - a.goals
    || b.assists - a.assists
    || a.player_name.localeCompare(b.player_name),
  );
  const teamOfTheSeason = rankedPlayers.slice(0, 11);
  const playerOfTheYear = rankedPlayers[0];
  return <section className="tab-panel"><SectionTitle title={seasonComplete ? 'Season awards' : 'Potential season awards'} detail="Based on player stats through the selected matchday." />
    {error && <ErrorNotice message={error} />}
    {playerOfTheYear && <section className="poty-card"><img src="/matchday/motm.jpg" alt="" /><div><div className="eyebrow">{seasonComplete ? 'PLAYER OF THE SEASON' : 'POTENTIAL PLAYER OF THE SEASON'}</div><h3>{playerOfTheYear.player_name}</h3><p>{playerOfTheYear.club_name} · {playerOfTheYear.goals} goals · {playerOfTheYear.assists} assists</p></div><strong>{seasonPlayerScore(playerOfTheYear).toFixed(1)}<small> IMPACT</small></strong></section>}
    <section className="team-of-season"><div className="team-of-season-heading"><div><div className="eyebrow">{seasonComplete ? 'FINAL XI' : 'POTENTIAL XI'}</div><h3>{seasonComplete ? 'Team of the season' : 'Potential team of the season'}</h3></div><span>{teamOfTheSeason.length} / 11</span></div>
      {teamOfTheSeason.length ? <div className="award-player-grid">{teamOfTheSeason.map((player, index) => <Link className="award-player" to={`/clubs/${player.club_id}`} key={player.player_id}><span>{String(index + 1).padStart(2, '0')}</span><strong>{player.player_name}</strong><small>{player.club_name}</small><em>{player.goals} G · {player.assists} A</em></Link>)}</div> : <EmptyPanel title="The awards are waiting" text="Play some fixtures to see the season's standout players." />}
    </section>
  </section>;
}

