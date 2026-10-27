import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, readableError } from '../api';
import { ErrorNotice, Loading, PageMotion } from '../components/common';
import { useApi } from '../features/api/useApi';
import type { LeagueSummary } from '../types';
export function LeagueHome() {
  const { data: leagueData, loading, error, refresh, setData: setLeagues, setError } = useApi('leagues', api.leagues);
  const leagues = leagueData ?? [];
  const [deletingLeagueId, setDeletingLeagueId] = useState<string | null>(null);
  const deleteLeague = async (league: LeagueSummary) => {
    if (!window.confirm(`Delete "${league.name}" and all of its season data? This cannot be undone.`)) return;
    setDeletingLeagueId(String(league.id));
    setError('');
    try {
      await api.deleteLeague(league.id);
      setLeagues(current => (current ?? []).filter(item => String(item.id) !== String(league.id)));
    } catch (err) {
      setError(readableError(err));
    } finally {
      setDeletingLeagueId(null);
    }
  };
  return (
    <PageMotion>
      <section className="hero">
        <div className="hero-copy">
          <h1>Build a league.<br /><em>Run the season.</em></h1>
          <p>Create your clubs, simulate the fixtures and follow the table, match reports and player statistics.</p>
          <Link to="/leagues/new" className="button button-primary">Create a league</Link>
        </div>
        <div className="hero-art">
          <img className="hero-photo" src="/matchday/kickoff.jpg" alt="A football on a grass pitch" />
        </div>
      </section>
      <section className="league-section" id="leagues">
        <div className="section-heading"><div><h2>Leagues <span className="heading-count">{leagues.length.toString().padStart(2, '0')}</span></h2></div><Link className="text-link" to="/leagues/new">Build a new league</Link></div>
        {error && <ErrorNotice message={error} onRetry={refresh} />}
        {loading ? <Loading label="Finding your leagues" /> : leagues.length ? (
          <div className="league-grid">
            {leagues.map((league, index) => <article className="league-card" key={league.id}>
              <Link to={`/leagues/${league.id}`} className="league-card-link">
                <div className={`league-card-art league-card-art--${index % 3}`}><span className="season-stamp">{league.season_label}</span><span className="card-index">{String(index + 1).padStart(2, '0')}</span><div className="mini-pitch"><span /></div></div>
                <div className="league-card-body"><div><h3>{league.name}</h3><p>{league.club_count} clubs <span>·</span> {league.total_matches} fixtures</p></div></div>
                <div className="league-progress"><span style={{ width: `${league.total_matches ? Math.min(100, league.played_matches / league.total_matches * 100) : 0}%` }} /></div>
                <div className="progress-label"><span>SEASON PROGRESS</span><span>{league.played_matches} / {league.total_matches} played</span></div>
              </Link>
              <div className="league-card-actions">
                <button type="button" className="league-delete-button" disabled={deletingLeagueId !== null} onClick={() => void deleteLeague(league)}>
                  {deletingLeagueId === String(league.id) ? 'Deleting…' : 'Delete league'}
                </button>
              </div>
            </article>)}
          </div>
        ) : <div className="empty-state"><h3>A blank page. A whole season.</h3><p>Your first league is one decision away.</p><Link to="/leagues/new" className="button button-secondary">Create your first league</Link></div>}
      </section>
    </PageMotion>
  );
}

