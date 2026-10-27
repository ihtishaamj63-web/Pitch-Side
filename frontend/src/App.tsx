import { useEffect, useState } from 'react';
import { BrowserRouter, Link, Route, Routes, useLocation } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import { api, readableError } from './api';
import { ErrorNotice, PageMotion } from './components/common';
import { readManagerSelection } from './features/manager/storage';
import { CreateLeague } from './pages/CreateLeaguePage';
import { ClubPage } from './pages/ClubPage';
import { LeagueHome } from './pages/HomePage';
import { LeaguePage } from './pages/LeaguePage';
import type { Match } from './types';
import './App.css';

const footerUrl = import.meta.env.VITE_PORTFOLIO_URL;
function App() {
  return <BrowserRouter><AppContent /></BrowserRouter>;
}

function AppContent() {
  const location = useLocation();
  const leagueId = location.pathname.match(/^\/leagues\/([^/]+)/)?.[1];
  const [managerClubId, setManagerClubId] = useState<number | null>(() => leagueId ? readManagerSelection(leagueId).clubId : null);
  useEffect(() => {
    const updateManagerClub = () => setManagerClubId(leagueId ? readManagerSelection(leagueId).clubId : null);
    updateManagerClub();
    window.addEventListener('pitch:manager-team-changed', updateManagerClub);
    return () => window.removeEventListener('pitch:manager-team-changed', updateManagerClub);
  }, [leagueId]);
  return (
      <div className="app-shell">
        <header className="topbar">
          <Link className="brand" to="/" aria-label="Pitch home"><span className="brand-mark">P</span><span>PITCH</span></Link>
          <SeasonDropdown leagueId={leagueId} managerClubId={managerClubId} />
        </header>
        <main className="main-content">
          <AnimatePresence mode="wait" initial={false}>
          <Routes location={location} key={location.pathname}>
            <Route path="/" element={<LeagueHome />} />
            <Route path="/leagues/new" element={<CreateLeague />} />
            <Route path="/leagues/:leagueId" element={<LeaguePage />} />
            <Route path="/leagues/:leagueId/:tab" element={<LeaguePage />} />
            <Route path="/clubs/:clubId" element={<ClubPage />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
          </AnimatePresence>
        </main>
        <footer className="footer"><span>Built by {footerUrl ? <a href={footerUrl} target="_blank" rel="noreferrer">Ihtishaam</a> : 'Ihtishaam'}</span></footer>
      </div>
  );
}

function SeasonDropdown({ leagueId, managerClubId }: { leagueId: string | undefined; managerClubId: number | null }) {
  const [open, setOpen] = useState(false);
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const location = useLocation();
  const activeMatchday = Number(new URLSearchParams(location.search).get('matchday')) || 1;

  useEffect(() => {
    if (!open || !leagueId) return;
    let cancelled = false;
    api.matches(leagueId, activeMatchday)
      .then(data => { if (!cancelled) { setMatches(data); setError(''); } })
      .catch(err => { if (!cancelled) setError(readableError(err)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [open, leagueId, activeMatchday, location.key]);

  const teamMatch = matches.find(match =>
    match.matchday === activeMatchday
    && [match.home_club_id, match.away_club_id].some(id => Number(id) === managerClubId),
  );
  const teamName = teamMatch
    ? Number(teamMatch.home_club_id) === managerClubId ? teamMatch.home_club_name : teamMatch.away_club_name
    : null;
  const openMatchCentre = teamMatch
    ? `/leagues/${leagueId}/match-centre?matchday=${activeMatchday}&match=${teamMatch.id}`
    : `/leagues/${leagueId}/match-centre?matchday=${activeMatchday}`;

  return <div className="season-dropdown">
    <button className="topbar-link season-dropdown-trigger" type="button" aria-expanded={open} onClick={() => {
      const nextOpen = !open;
      setOpen(nextOpen);
      if (nextOpen && leagueId) setLoading(true);
    }}>
      Season centre
    </button>
    {open && <section className="season-dropdown-panel" aria-label="Managed team match summary">
      <header><span className="eyebrow">TEAM MATCH CENTRE</span><strong>Matchday {activeMatchday}</strong></header>
      {!leagueId ? <p>Open a league to see its match centre.</p>
        : managerClubId === null ? <p>Choose a team in this league to follow its match here.</p>
          : loading ? <p>Loading your team&apos;s match…</p>
            : error ? <ErrorNotice message={error} />
              : !teamMatch ? <p>{`No match scheduled for your team on matchday ${activeMatchday}.`}</p>
                : <div className="season-dropdown-match">
                  <div className="season-dropdown-score">
                    <span>{teamMatch.home_club_name}</span>
                    <strong>{teamMatch.home_goals ?? '–'} <i>:</i> {teamMatch.away_goals ?? '–'}</strong>
                    <span>{teamMatch.away_club_name}</span>
                  </div>
                  {teamMatch.goal_events?.length ? <div className="season-dropdown-goals">{teamMatch.goal_events.map((goal, index) =>
                    <span key={`${goal.minute}-${index}`}><b>{goal.minute}&apos;</b> {goal.player_name}{goal.assist_player_name ? ` · ${goal.assist_player_name}` : ''}</span>,
                  )}</div> : <p>{teamMatch.played_at ? 'No goals recorded.' : 'Kick-off pending.'}</p>}
                  <small>{teamName} · xG {Number(teamMatch.home_xg ?? 0).toFixed(2)}–{Number(teamMatch.away_xg ?? 0).toFixed(2)} · YC {teamMatch.yellow_card_count ?? 0} · RC {teamMatch.red_card_count ?? 0}</small>
                </div>}
      {leagueId && <Link className="season-dropdown-link" to={openMatchCentre} onClick={() => setOpen(false)}>Open match centre</Link>}
    </section>}
  </div>;
}

function NotFound() { return <PageMotion className="empty-state"><h2>That page isn't in this fixture.</h2><Link to="/" className="button button-secondary">Back to leagues</Link></PageMotion>; }

export default App;
