import { useCallback } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api';
import { BackLink, EmptyPanel, ErrorNotice, Loading, PageMotion } from '../components/common';
import { useApi } from '../features/api/useApi';

export function PlayerPage() {
  const { playerId = '' } = useParams();
  const loadPlayer = useCallback(() => api.player(playerId), [playerId]);
  const { data, error, loading } = useApi(`player:${playerId}`, loadPlayer);
  if (!data) return <PageMotion><BackLink to="/" label="All leagues" />{error ? <ErrorNotice message={error} /> : <Loading label={loading ? 'Loading player profile' : 'Player not found'} />}</PageMotion>;

  const { player, matches } = data;
  const totals = matches.reduce((sum, match) => ({
    appearances: sum.appearances + 1,
    minutes: sum.minutes + match.minutes_played,
    goals: sum.goals + match.goals,
    assists: sum.assists + match.assists,
    xg: sum.xg + Number(match.xg),
  }), { appearances: 0, minutes: 0, goals: 0, assists: 0, xg: 0 });
  const ratingPoints = matches.map((match, index) => `${matches.length < 2 ? 50 : 8 + index / (matches.length - 1) * 84},${82 - (Number(match.rating) - 5) * 14}`);
  const goals = matches.flatMap(match => match.goals_timeline.map(goal => ({ ...goal, matchday: match.matchday })));
  return <PageMotion>
    <BackLink to={`/clubs/${player.club_id}`} label={player.club_name} />
    <header className="player-profile" style={{ borderColor: player.colour_primary }}>
      <span className="player-profile-mark" style={{ background: player.colour_primary, color: player.colour_secondary }}>{player.name.split(/\s+/).map(part => part[0]).slice(0, 2).join('')}</span>
      <div><span className="eyebrow">{player.position} · {player.season_label}</span><h1>{player.name}</h1><Link to={`/clubs/${player.club_id}`}>{player.club_name} ({player.short_name})</Link><p>{player.league_name}</p></div>
    </header>
    <section className="player-season-line" aria-label="Season totals">
      {[[totals.appearances, 'APPS'], [totals.minutes, 'MIN'], [totals.goals, 'GOALS'], [totals.assists, 'ASSISTS'], [totals.xg.toFixed(2), 'xG']].map(([value, label]) => <div key={label}><strong>{value}</strong><span>{label}</span></div>)}
    </section>
    {matches.length ? <div className="player-story-grid">
      <section className="player-story-panel"><div className="eyebrow">PERFORMANCE</div><h2>Rating trend</h2>
        <svg className="rating-chart" viewBox="0 0 100 100" role="img" aria-label={`Match ratings: ${matches.map(match => match.rating).join(', ')}`}><line x1="8" x2="92" y1="82" y2="82" /><line x1="8" x2="92" y1="40" y2="40" /><polyline points={ratingPoints.join(' ')} /></svg>
      </section>
      <section className="player-story-panel"><div className="eyebrow">GOAL TIMELINE</div><h2>{goals.length} goals</h2>
        {goals.length ? <div className="player-goal-timeline">{goals.map((goal, index) => <span key={`${goal.matchday}-${goal.minute}-${index}`} title={`Matchday ${goal.matchday}, ${goal.minute}${goal.minute_extra ? `+${goal.minute_extra}` : ''} minute`}><b>{goal.minute}{goal.minute_extra ? `+${goal.minute_extra}` : ''}&apos;</b><small>MD {goal.matchday}</small></span>)}</div> : <p>No goals recorded so far.</p>}
      </section>
    </div> : <EmptyPanel title="Season record is waiting" text="Player match ratings and goal history appear after a completed fixture." />}
    <section className="player-match-log"><div className="eyebrow">MATCH LOG</div><h2>Appearances</h2>
      {matches.length ? <div className="table-wrap"><table><thead><tr><th>MD</th><th className="align-left">MATCH</th><th>MIN</th><th>G</th><th>A</th><th>xG</th><th>RATING</th></tr></thead><tbody>{matches.map(match => <tr key={match.id}><td>{match.matchday}</td><td className="align-left">{match.home_club_name} {match.home_goals}–{match.away_goals} {match.away_club_name}</td><td>{match.minutes_played}</td><td>{match.goals}</td><td>{match.assists}</td><td>{Number(match.xg).toFixed(2)}</td><td><strong>{match.rating}</strong></td></tr>)}</tbody></table></div> : <p>Completed match appearances will appear here.</p>}
    </section>
  </PageMotion>;
}
