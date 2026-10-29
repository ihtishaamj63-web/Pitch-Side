import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { api, readableError } from '../../api';
import { ClubCrest } from '../../Crest';
import { EmptyPanel, ErrorNotice, SectionTitle } from '../../components/common';
import { clubFromMatch, getMatchEvents, totalMatchdays } from '../../lib/match';
import { useApi } from '../api/useApi';
import type { LiveLeagueState } from '../live/useLiveLeague';
import type { Club, Match, MatchDetail, MatchPlayerStats, PlayerStat, Standing } from '../../types';

export function LeagueTab({ tab, leagueId, clubs, standings, matchday, onMatchdayChange, managerClubId, topZone, bottomZone, refreshKey, seasonComplete, liveState }: { tab: string; leagueId: string; clubs: Club[]; standings: Standing[]; matchday: number; onMatchdayChange: (matchday: number) => void; managerClubId: number | null; topZone: number; bottomZone: number; refreshKey: number; seasonComplete: boolean; liveState: LiveLeagueState }) {
  if (tab === 'fixtures') return <FixturesTab key={refreshKey} leagueId={leagueId} matchday={matchday} onMatchdayChange={onMatchdayChange} totalMatchdays={totalMatchdays(clubs.length)} />;
  if (tab === 'match-centre') return <MatchCentreTab key={refreshKey} leagueId={leagueId} matchday={matchday} managerClubId={managerClubId} />;
  if (tab === 'live') return <LiveHub leagueId={leagueId} managerClubId={managerClubId} liveState={liveState} />;
  if (tab === 'stats') return <ScorersTab key={refreshKey} leagueId={leagueId} matchday={matchday} />;
  if (tab === 'awards') return <AwardsTab key={refreshKey} leagueId={leagueId} matchday={matchday} seasonComplete={seasonComplete} />;
  return <TableTab standings={standings} topZone={topZone} bottomZone={bottomZone} />;
}

function LiveHub({ leagueId, managerClubId, liveState: live }: { leagueId: string; managerClubId: number | null; liveState: LiveLeagueState }) {
  const [standings, setStandings] = useState<Standing[]>([]);
  const [skipping, setSkipping] = useState(false);
  const [skipError, setSkipError] = useState('');
  useEffect(() => {
    let cancelled = false;
    const loadTable = () => api.table(leagueId).then(rows => { if (!cancelled) setStandings(rows); }).catch(() => undefined);
    void loadTable();
    const timer = live.matches.length ? window.setInterval(loadTable, 5_000) : 0;
    return () => { cancelled = true; if (timer) window.clearInterval(timer); };
  }, [leagueId, live.matches.length]);
  const matches = [...live.matches].sort((a, b) => {
    const aFollowed = managerClubId !== null && [a.home_club_id, a.away_club_id].some(id => Number(id) === managerClubId);
    const bFollowed = managerClubId !== null && [b.home_club_id, b.away_club_id].some(id => Number(id) === managerClubId);
    return Number(bFollowed) - Number(aFollowed) || Number(a.id) - Number(b.id);
  });
  return <section className="live-hub-page">
    <header className="live-hub-header"><div><span className="live-hub-indicator"><i /> LIVE NOW</span><h2>{matches.length ? `Matchday ${live.matchday}` : 'No matches in play'}</h2></div><div className="live-hub-tools"><span className="live-connection">{live.connected ? 'LIVE UPDATES ON' : 'RECONNECTING'}</span>{matches.length > 0 && <button className="button button-quiet button-small" disabled={skipping} onClick={() => { setSkipError(''); setSkipping(true); void api.skipLiveMatchday(leagueId).catch(error => setSkipError(readableError(error))).finally(() => setSkipping(false)); }}>{skipping ? 'Finishing…' : 'Skip to full-time'}</button>}</div></header>
    {skipError && <ErrorNotice message={skipError} />}
    <div className="live-hub-grid"><div className="live-scoreboards" aria-live="polite">
      {matches.length ? matches.map(match => <Link className="live-scoreboard" to={`/matches/${match.id}?league=${leagueId}`} key={match.id}>
        <div className="live-scoreboard-top"><b>{match.minute ?? 0}{match.minute_extra ? `+${match.minute_extra}` : ''}&apos;</b><span>LIVE</span></div>
        <div className="live-scoreboard-team"><strong>{match.home_club_name}</strong><b>{match.home_goals ?? 0}</b></div>
        <div className="live-scoreboard-team"><strong>{match.away_club_name}</strong><b>{match.away_goals ?? 0}</b></div>
        <p>{match.last_event?.commentary ?? 'Kick-off. The teams are underway.'}</p>
      </Link>) : <EmptyPanel title="The pitch is quiet" text="Start a matchday to follow every fixture here." />}
    </div><aside className="live-mini-table"><h3>Live table</h3>{standings.slice(0, 6).map((row, index) => <div key={row.id} className="live-mini-row"><b>{index + 1}</b><span>{row.name}</span><strong>{row.Pts}</strong></div>)}</aside></div>
  </section>;
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

export function MatchPitch({ homeClub, awayClub, homePlayers, awayPlayers, homeSubs, awaySubs }: {
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

  return <section className="tab-panel"><SectionTitle title="Standings" />
    <div className="legend"><span><i className="legend-top" />Top zone</span><span><i className="legend-bottom" />Bottom zone</span></div>
    {standings.length ? <div className="table-wrap"><table className="standings-table"><thead><tr><th className="align-left">POS</th><th className="align-left">CLUB</th><th>P</th><th>W</th><th>D</th><th>L</th><th>GF</th><th>GA</th><th>GD</th><th className="points-col">PTS</th><th className="form-col">FORM</th></tr></thead>
      <tbody>{standings.map((row, index) => {
        const clubId = row.club_id || row.id;
        const club = { id: clubId, name: row.club_name || row.name, short_name: row.short_name, colour_primary: row.colour_primary, colour_secondary: row.colour_secondary };
        return <motion.tr layout={!reduceMotion} key={clubId} className={index < topZone ? 'zone-top' : index >= standings.length - bottomZone ? 'zone-bottom' : ''}>
          <td className="position-cell"><span>{row.position || index + 1}</span>{row.movement !== undefined && row.movement !== 0 && <small className={row.movement > 0 ? 'movement-up' : 'movement-down'} aria-label={`${Math.abs(row.movement)} places ${row.movement > 0 ? 'up' : 'down'}`}>{row.movement > 0 ? '↑' : '↓'}{Math.abs(row.movement)}</small>}</td><td><Link className="table-club" to={`/clubs/${clubId}`}><ClubCrest club={club} size="small" /><strong>{club.name}</strong>{row.live && <span className="match-live-badge">LIVE</span>}{index === 0 && <span className="table-trophy" role="img" aria-label="League leader" title="League leader">🏆</span>}<span className="club-code">{club.short_name}</span></Link></td>
          {statCell(row, 'P')}{statCell(row, 'W')}{statCell(row, 'D')}{statCell(row, 'L')}{statCell(row, 'GF')}{statCell(row, 'GA')}{statCell(row, 'GD')}{statCell(row, 'Pts')}<td><FormDots form={row.form} /></td>
        </motion.tr>;
      })}</tbody></table></div> : <EmptyPanel title="The table is waiting" text="Kick off a matchday to bring the standings to life." />}
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
    <span className="match-kickoff">{match.played_at || match.scheduled_at ? new Date(match.played_at ?? match.scheduled_at!).toLocaleDateString(undefined, { day: '2-digit', month: 'short' }) : `MD ${match.matchday}`}</span>
    <MatchTeam match={match} side="home" align="right" />
    <span className={`match-score${match.home_goals === null ? ' upcoming' : ''}`}>{match.home_goals ?? '–'} <i>:</i> {match.away_goals ?? '–'}</span>
    {match.status === 'live' && <span className="match-live-badge">LIVE {match.minute ?? 0}{match.minute_extra ? `+${match.minute_extra}` : ''}&apos;</span>}
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
  const [selected, setSelected] = useState('');
  const [loadedMatch, setMatch] = useState<MatchDetail | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let cancelled = false;
    api.matches(leagueId, matchday).then(data => {
      if (cancelled) return;
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
  const keyEvents = allMatchEvents.filter(event => event.eventType !== 'foul');
  const teamStat = (clubId: number | string) => match?.team_stats?.find(stat => String(stat.club_id) === String(clubId));
  const homeStats = match ? teamStat(match.home_club_id) : undefined;
  const awayStats = match ? teamStat(match.away_club_id) : undefined;
  const manOfTheMatch = match ? getManOfTheMatch(match.player_stats ?? []) : undefined;
  const isMatchPlayed = match?.home_goals !== null && match?.home_goals !== undefined;
  return <section className="tab-panel match-centre-page"><div className="match-centre-heading"><h2>Match report</h2></div>
    {error && <ErrorNotice message={error} />}
    {match ? <div className="match-report">
      <div className="report-scoreboard"><span className="report-round">MATCHDAY {match.matchday}</span><div className="report-teams"><ReportTeam club={clubFromMatch(match, 'home')} /><div className="report-score">{match.home_goals ?? '–'}<span>:</span>{match.away_goals ?? '–'}</div><ReportTeam club={clubFromMatch(match, 'away')} /></div><span className="report-date">{match.played_at ? new Date(match.played_at).toLocaleString() : 'KICK-OFF PENDING'}</span></div>
      {!isMatchPlayed ? <div className="pre-match-preview">
        <img src="/matchday/kickoff.jpg" alt="" />
        <div><div className="eyebrow">FIXTURE PREVIEW</div><h3>Ready for kick-off</h3><p>Line-ups, match events and statistics will appear after this matchday is simulated.</p></div>
      </div> : <>
        {manOfTheMatch && <div className="report-motm"><span><strong>{manOfTheMatch.player_name} <i className="motm-badge">MOTM</i></strong></span></div>}
        <div className="timeline"><div className="timeline-column">{keyEvents.map(event => <div className={`goal-event goal-event--${event.eventType}`} key={`${event.eventType}-${event.id}`}><b>{event.minute}&apos;</b><span><strong>{event.player_name}</strong><small>{event.club_id === match.home_club_id ? match.home_short_name : match.away_short_name} · {event.eventType === 'goal' ? `GOAL${event.assist_player_name ? ` · ASSIST: ${event.assist_player_name}` : ' · UNASSISTED'}` : event.eventType === 'yellow' ? 'YELLOW CARD' : event.eventType === 'red' ? 'RED CARD' : event.eventType === 'substitution' ? `SUB ON · ${event.player_off_name} OFF` : 'FOUL'}</small></span></div>)}</div></div>
        {!match.goals?.length && !match.yellow_cards?.length && !match.red_cards?.length && !match.fouls?.length && !match.substitutions?.length && <p className="no-goals">No match events recorded for this fixture.</p>}
        {homeStats && awayStats && <section className="match-stats"><h3>Match statistics</h3><div className="match-stats-head"><span>{match.home_short_name}</span><span>STAT</span><span>{match.away_short_name}</span></div>{[
          ['Expected goals (xG)', Number(match.home_xg ?? homeStats.xg).toFixed(2), Number(match.away_xg ?? awayStats.xg).toFixed(2)],
          ['Shots', homeStats.shots, awayStats.shots],
          ['Shots on target', homeStats.shots_on_target, awayStats.shots_on_target],
          ['Corners', homeStats.corners, awayStats.corners],
        ].map(([label, homeValue, awayValue]) => <div className="match-stats-row" key={label}><strong>{homeValue}</strong><span>{label}</span><strong>{awayValue}</strong></div>)}</section>}
      </>}
    </div> : <EmptyPanel title="No match on this matchday" text="Open a fixture from the schedule to view its report." />}
  </section>;
}

function ReportTeam({ club }: { club: Club }) {
  return <div className="report-team"><ClubCrest club={club} size="large" /><strong>{club.name}</strong></div>;
}

function ScorersTab({ leagueId, matchday }: { leagueId: string; matchday: number }) {
  const loadPlayers = useCallback(() => api.playerStats(leagueId, matchday), [leagueId, matchday]);
  const { data: playerData, error } = useApi(`player-stats:${leagueId}:${matchday}`, loadPlayers);
  const players = playerData ?? [];
  const [category, setCategory] = useState<'goals' | 'assists' | 'xg' | 'key_passes' | 'tackles' | 'cards' | 'per90'>('goals');
  const [position, setPosition] = useState('ALL');
  const [clubFilter, setClubFilter] = useState('ALL');
  const [ascending, setAscending] = useState(false);
  const categories = {
    goals: { label: 'Goals', value: (player: PlayerStat) => player.goals, format: (value: number) => String(value) },
    assists: { label: 'Assists', value: (player: PlayerStat) => player.assists, format: (value: number) => String(value) },
    xg: { label: 'Expected goals', value: (player: PlayerStat) => Number(player.xg), format: (value: number) => value.toFixed(2) },
    key_passes: { label: 'Key passes', value: (player: PlayerStat) => player.key_passes, format: (value: number) => String(value) },
    tackles: { label: 'Tackles', value: (player: PlayerStat) => player.tackles, format: (value: number) => String(value) },
    cards: { label: 'Cards', value: (player: PlayerStat) => player.yellow_cards + player.red_cards, format: (value: number) => String(value) },
    per90: { label: 'Goal contributions / 90', value: (player: PlayerStat) => player.minutes ? (player.goals + player.assists) * 90 / player.minutes : 0, format: (value: number) => value.toFixed(2) },
  };
  const metric = categories[category];
  const ranked = players.filter(player => (clubFilter === 'ALL' || player.club_name === clubFilter) && (position === 'ALL' || player.position === position))
    .sort((a, b) => (metric.value(a) - metric.value(b)) * (ascending ? 1 : -1) || a.player_name.localeCompare(b.player_name));
  return <section className="tab-panel"><SectionTitle title="Player statistics" detail="Compare season performance by category and position." />
    {error && <ErrorNotice message={error} />}
    <div className="stats-controls">
      <label>Club<select value={clubFilter} onChange={event => setClubFilter(event.target.value)}>
        <option value="ALL">All clubs</option>
        {[...new Set(players.map(player => player.club_name))].map(clubName => <option value={clubName} key={clubName}>{clubName}</option>)}
      </select></label>
      <label>Category<select value={category} onChange={event => { setCategory(event.target.value as typeof category); setAscending(false); }}>
        {Object.entries(categories).map(([key, item]) => <option value={key} key={key}>{item.label}</option>)}
      </select></label>
      <label>Position<select value={position} onChange={event => setPosition(event.target.value)}>
        <option value="ALL">All positions</option><option value="GK">Goalkeepers</option><option value="DEF">Defenders</option><option value="MID">Midfielders</option><option value="FWD">Forwards</option>
      </select></label>
      <span>{ranked.length} players</span>
    </div>
    {ranked.length ? <div className="table-wrap"><table className="player-stats-table"><thead><tr><th>RANK</th><th className="align-left">PLAYER</th><th>POS</th><th className="align-left">CLUB</th><th>APPS</th><th><button type="button" className="stats-sort" onClick={() => setAscending(value => !value)} aria-label={`Sort ${metric.label} ${ascending ? 'descending' : 'ascending'}`}>{metric.label.toUpperCase()} {ascending ? '↑' : '↓'}</button></th></tr></thead>
      <tbody>{ranked.map((player, index) => <tr key={player.player_id}><td>{index + 1}</td><td className="align-left"><Link className="stats-player-link" to={`/players/${player.player_id}`}>{player.player_name}</Link></td><td>{player.position}</td><td className="align-left"><Link to={`/clubs/${player.club_id}`}>{player.club_name}</Link></td><td>{player.appearances}</td><td><strong>{metric.format(metric.value(player))}</strong></td></tr>)}</tbody>
    </table></div> : <EmptyPanel title="No player statistics yet" text="Simulate fixtures to compare the season's players." />}
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
  const teamOfTheSeason = (['GK', 'DEF', 'MID', 'FWD'] as const).flatMap(position =>
    rankedPlayers.filter(player => player.position === position).slice(0, ({ GK: 1, DEF: 4, MID: 4, FWD: 2 })[position]),
  );
  const playerOfTheYear = rankedPlayers[0];
  return <section className="tab-panel"><SectionTitle title={seasonComplete ? 'Season awards' : 'Potential season awards'} detail="Based on player stats through the selected matchday." />
    {error && <ErrorNotice message={error} />}
    {playerOfTheYear && <section className="poty-card"><img src="/matchday/motm.jpg" alt="" /><div><div className="eyebrow">{seasonComplete ? 'PLAYER OF THE SEASON' : 'POTENTIAL PLAYER OF THE SEASON'}</div><h3>{playerOfTheYear.player_name}</h3><p>{playerOfTheYear.club_name} · {playerOfTheYear.goals} goals · {playerOfTheYear.assists} assists</p></div><strong>{seasonPlayerScore(playerOfTheYear).toFixed(1)}<small> IMPACT</small></strong></section>}
    <section className="team-of-season"><div className="team-of-season-heading"><div><div className="eyebrow">{seasonComplete ? 'FINAL XI' : 'POTENTIAL XI'}</div><h3>{seasonComplete ? 'Team of the season' : 'Potential team of the season'}</h3></div><span>{teamOfTheSeason.length} / 11</span></div>
      {teamOfTheSeason.length ? <div className="award-pitch" aria-label="Team of the season in a 4-4-2 formation">
        {(['FWD', 'MID', 'DEF', 'GK'] as const).map(position => <div className={`award-pitch-line award-pitch-line--${position}`} key={position}>
          {teamOfTheSeason.filter(player => player.position === position).map(player => <Link className="award-pitch-player" to={`/players/${player.player_id}`} key={player.player_id} title={`${player.player_name}, ${player.club_name}`}><span>{player.player_name.split(/\s+/).map(part => part[0]).slice(0, 2).join('')}</span><strong>{player.player_name}</strong><small>{player.club_name}</small></Link>)}
        </div>)}
      </div> : <EmptyPanel title="The awards are waiting" text="Play some fixtures to see the season's standout players." />}
    </section>
  </section>;
}

