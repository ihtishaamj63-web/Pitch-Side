import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, readableError } from '../api';
import { ClubCrest } from '../Crest';
import { BackLink, EmptyPanel, ErrorNotice, Loading, PageMotion } from '../components/common';
import { MatchPitch } from '../features/league/LeagueTab';
import { clubFromMatch } from '../lib/match';
import type { MatchDetail, MatchEvent, MatchPlayerStats } from '../types';

type FeedFilter = 'all' | 'key' | 'chances' | 'cards' | 'subs';
const filterOptions: Array<{ id: FeedFilter; label: string }> = [
  { id: 'all', label: 'All' }, { id: 'key', label: 'Key moments' },
  { id: 'chances', label: 'Chances' }, { id: 'cards', label: 'Cards' }, { id: 'subs', label: 'Subs' },
];

export function MatchPage() {
  const { matchId = '' } = useParams();
  const [match, setMatch] = useState<MatchDetail | null>(null);
  const [events, setEvents] = useState<MatchEvent[]>([]);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<FeedFilter>('all');
  const [minute, setMinute] = useState(0);
  const [minuteExtra, setMinuteExtra] = useState(0);
  const [period, setPeriod] = useState('scheduled');
  const [score, setScore] = useState<[number | null, number | null]>([null, null]);
  const cursor = useRef(0);

  useEffect(() => {
    let cancelled = false;
    api.match(matchId).then(data => {
      if (cancelled) return;
      setMatch(data);
      setEvents(data.events ?? []);
      cursor.current = Math.max(0, ...(data.events ?? []).map(event => event.seq));
      setMinute(data.clock?.minute ?? (data.status === 'finished' ? 90 : 0));
      setMinuteExtra(data.clock?.minute_extra ?? 0);
      setPeriod(data.clock?.period ?? data.status ?? 'scheduled');
      setScore([data.home_goals, data.away_goals]);
    }).catch(err => { if (!cancelled) setError(readableError(err)); });
    return () => { cancelled = true; };
  }, [matchId]);

  useEffect(() => {
    if (!match || match.status !== 'live') return;
    let cancelled = false;
    const poll = async () => {
      try {
        const update = await api.matchLive(matchId, cursor.current);
        if (cancelled) return;
        setMinute(update.minute);
        setMinuteExtra(update.minute_extra);
        setPeriod(update.period);
        setScore([update.home_goals, update.away_goals]);
        if (update.events.length) {
          cursor.current = Math.max(cursor.current, ...update.events.map(event => event.seq));
          setEvents(current => [...current, ...update.events]);
        }
        if (update.status === 'finished') {
          const report = await api.match(matchId);
          if (!cancelled) setMatch(report);
        }
      } catch (err) {
        if (!cancelled) setError(readableError(err));
      }
    };
    const timer = window.setInterval(() => void poll(), 1_500);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [match, matchId]);

  const visibleEvents = useMemo(() => events.filter(event => {
    if (filter === 'key') return ['goal', 'yellow', 'red', 'half_time', 'full_time'].includes(event.type);
    if (filter === 'chances') return ['chance', 'shot', 'save', 'corner'].includes(event.type);
    if (filter === 'cards') return event.type === 'yellow' || event.type === 'red';
    if (filter === 'subs') return event.type === 'substitution';
    return !['kickoff', 'possession_spell'].includes(event.type);
  }).slice().reverse(), [events, filter]);

  if (!match) return <PageMotion><BackLink to="/" label="Back" />{error ? <ErrorNotice message={error} /> : <Loading label="Loading match" />}</PageMotion>;
  const homeClub = clubFromMatch(match, 'home');
  const awayClub = clubFromMatch(match, 'away');
  const finished = match.status === 'finished' || period === 'full_time';
  const goals = events.filter(event => event.type === 'goal');
  const homeGoals = score[0] ?? 0;
  const awayGoals = score[1] ?? 0;
  const homeChances = events.filter(event => event.type === 'chance' && String(event.club_id) === String(match.home_club_id));
  const awayChances = events.filter(event => event.type === 'chance' && String(event.club_id) === String(match.away_club_id));
  const homeXg = homeChances.reduce((sum, event) => sum + Number(event.payload.xg ?? 0), 0);
  const awayXg = awayChances.reduce((sum, event) => sum + Number(event.payload.xg ?? 0), 0);
  const homeShots = homeChances.length;
  const awayShots = awayChances.length;
  const latestCommentary = events[events.length - 1]?.commentary;
  const activeLineupIds = new Set((match.lineups ?? []).filter(player => player.is_starter).map(player => String(player.player_id)));
  events.filter(event => event.type === 'substitution').forEach(event => {
    if (event.secondary_player_id !== null) activeLineupIds.delete(String(event.secondary_player_id));
    if (event.player_id !== null) activeLineupIds.add(String(event.player_id));
  });
  const liveLineup: MatchPlayerStats[] = (match.lineups ?? []).map(player => ({
    ...player, minutes_played: activeLineupIds.has(String(player.player_id)) ? minute : 0,
    shots: 0, shots_on_target: 0, xg: 0, key_passes: 0, tackles: 0,
    goals: 0, assists: 0, yellow_cards: 0, red_cards: 0, fouls: 0,
  }));
  const pitchPlayers = finished ? match.player_stats : liveLineup;
  const momentum = Array.from({ length: 18 }, (_, index) => {
    const eventsInRange = events.filter(event => Math.floor(Math.min(89, event.minute) / 5) === index && ['chance', 'goal', 'save', 'corner'].includes(event.type));
    const homePressure = eventsInRange.filter(event => String(event.club_id) === String(match.home_club_id)).length;
    const awayPressure = eventsInRange.filter(event => String(event.club_id) === String(match.away_club_id)).length;
    return { index, homePressure, awayPressure };
  });

  return <PageMotion className="match-page">
    <BackLink to={`/leagues/${match.league_id}/live`} label="Live hub" />
    {error && <ErrorNotice message={error} />}
    <header className="match-page-scoreboard">
      <span className={`match-page-status${finished ? ' is-finished' : ''}`}>{finished ? 'FULL TIME' : match.status === 'live' ? 'LIVE' : 'UPCOMING'}</span>
      <div className="match-page-teams">
        <div><ClubCrest club={homeClub} size="large" /><strong>{homeClub.name}</strong></div>
        <b className="match-page-score">{score[0] ?? '–'} <i>:</i> {score[1] ?? '–'}</b>
        <div><ClubCrest club={awayClub} size="large" /><strong>{awayClub.name}</strong></div>
      </div>
      <p>{finished ? 'Match report' : period === 'half_time' ? 'Half-time' : `${minute}${minuteExtra ? `+${minuteExtra}` : ''}’`}</p>
    </header>

    <section className="match-page-section match-commentary-section">
      <div className="match-page-section-heading"><h2>Commentary</h2><span>{events.length} events</span></div>
      <div className="match-feed-filters" role="group" aria-label="Filter commentary">
        {filterOptions.map(option => <button type="button" key={option.id} aria-pressed={filter === option.id} className={filter === option.id ? 'is-active' : ''} onClick={() => setFilter(option.id)}>{option.label}</button>)}
      </div>
      <p className="match-latest-commentary" aria-live="polite">{latestCommentary ?? (finished ? 'The final whistle has sounded.' : 'The teams are settling into the match.')}</p>
      <ol className="match-commentary-feed">
        {visibleEvents.map(event => <li key={event.seq} className={`match-event match-event--${event.type}`}>
          <b>{event.minute}{event.minute_extra ? `+${event.minute_extra}` : ''}’</b><span className="match-event-icon" aria-hidden="true">{event.type === 'goal' ? '⚽' : event.type === 'yellow' ? '🟨' : event.type === 'red' ? '🟥' : event.type === 'substitution' ? '↔' : event.type === 'chance' ? '◉' : '·'}</span>
          <span>{event.commentary ?? `${event.type.replaceAll('_', ' ')}${event.player_name ? ` · ${event.player_name}` : ''}`}</span>
        </li>)}
        {!visibleEvents.length && <li className="match-feed-empty">No moments in this filter yet.</li>}
      </ol>
    </section>

    <section className="match-page-section match-momentum"><div className="match-page-section-heading"><h2>Pressure</h2><span>{homeClub.short_name} · {awayClub.short_name}</span></div><div className="momentum-bars" role="img" aria-label={`Match pressure by five minute segment for ${homeClub.name} and ${awayClub.name}`}>
      {momentum.map(bar => { const difference = bar.homePressure - bar.awayPressure; return <i key={bar.index} className={difference > 0 ? 'home-pressure' : difference < 0 ? 'away-pressure' : ''} style={{ height: `${Math.max(8, Math.min(100, 12 + (bar.homePressure + bar.awayPressure) * 22))}%` }} />; })}
    </div><div className="momentum-labels"><span>0’</span><span>45’</span><span>90’</span></div></section>

    <section className="match-page-section match-live-stats">
      <div className="match-page-section-heading"><h2>{finished ? 'Full-time stats' : 'Match stats'}</h2><span>{finished ? 'FINAL' : 'LIVE'}</span></div>
      {[
        { label: 'Shots', home: homeShots, away: awayShots },
        { label: 'xG', home: homeXg, away: awayXg, decimal: true },
        { label: 'Goals', home: homeGoals, away: awayGoals },
      ].map(stat => {
        const maximum = Math.max(1, Number(stat.home), Number(stat.away));
        return <div className="match-stat-bar" key={stat.label}><div><b>{stat.decimal ? Number(stat.home).toFixed(2) : stat.home}</b><span>{stat.label}</span><b>{stat.decimal ? Number(stat.away).toFixed(2) : stat.away}</b></div><i><span style={{ width: `${Number(stat.home) / maximum * 100}%` }} /><span style={{ width: `${Number(stat.away) / maximum * 100}%` }} /></i></div>;
      })}
    </section>

    {pitchPlayers.length > 0 && <MatchPitch homeClub={homeClub} awayClub={awayClub}
      homePlayers={pitchPlayers.filter(player => String(player.club_id) === String(match.home_club_id))}
      awayPlayers={pitchPlayers.filter(player => String(player.club_id) === String(match.away_club_id))}
      homeSubs={match.substitutions.filter(event => String(event.club_id) === String(match.home_club_id))}
      awaySubs={match.substitutions.filter(event => String(event.club_id) === String(match.away_club_id))} />}

    {finished && <section className="match-page-section match-report-link"><h2>Match report</h2><p>{goals.length} goals · {events.filter(event => event.type === 'yellow' || event.type === 'red').length} cards</p><Link to={`/leagues/${match.league_id}/match-centre?matchday=${match.matchday}&match=${match.id}`}>Open full report</Link></section>}
    {!match.league_id && <EmptyPanel title="League unavailable" text="This match cannot be linked back to its league." />}
  </PageMotion>;
}
