import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { BrowserRouter, Link, Route, Routes, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { api, readableError } from './api';
import { ClubCrest } from './Crest';
import type { Club, ClubDetail, LeagueDetail, LeagueSummary, ManagerMatchSummary, Match, MatchDetail, MatchPlayerStats, PlayerStat, Standing, Tactics } from './types';
import './App.css';

const footerUrl = import.meta.env.VITE_PORTFOLIO_URL;
const tabs = [
  ['table', 'Table'],
  ['fixtures', 'Fixtures'],
  ['match-centre', 'Match centre'],
  ['scorers', 'League leaders'],
  ['awards', 'Awards'],
] as const;

interface MatchPlayback {
  match: MatchDetail;
  minute: number;
  complete: boolean;
  startedAt: number;
}

function App() {
  return <BrowserRouter><AppContent /></BrowserRouter>;
}

function AppContent() {
  const location = useLocation();
  const leagueId = location.pathname.match(/^\/leagues\/([^/]+)/)?.[1];
  const [managerClubId, setManagerClubId] = useState<number | null>(() => leagueId ? readManagerClubFromStorage(leagueId) : null);
  useEffect(() => {
    const updateManagerClub = () => setManagerClubId(leagueId ? readManagerClubFromStorage(leagueId) : null);
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

function readManagerClubFromStorage(leagueId: string): number | null {
  const stored = window.localStorage.getItem(`pitch:manager-club:${leagueId}`);
  return stored && /^[1-9]\d*$/.test(stored) && Number.isSafeInteger(Number(stored)) ? Number(stored) : null;
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
    api.matches(leagueId)
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

function PageMotion({ children, className = '' }: { children: ReactNode; className?: string }) {
  const reduceMotion = useReducedMotion();
  return <motion.div className={className} initial={reduceMotion ? false : { opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: reduceMotion ? 0 : 0.32, ease: 'easeOut' }}>{children}</motion.div>;
}

function LeagueHome() {
  const [leagues, setLeagues] = useState<LeagueSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [deletingLeagueId, setDeletingLeagueId] = useState<string | null>(null);
  const load = useCallback(async () => {
    try {
      setLeagues(await api.leagues());
      setError('');
    } catch (err) { setError(readableError(err)); }
    finally { setLoading(false); }
  }, []);
  const deleteLeague = async (league: LeagueSummary) => {
    if (!window.confirm(`Delete "${league.name}" and all of its season data? This cannot be undone.`)) return;
    setDeletingLeagueId(String(league.id));
    setError('');
    try {
      await api.deleteLeague(league.id);
      setLeagues(current => current.filter(item => String(item.id) !== String(league.id)));
    } catch (err) {
      setError(readableError(err));
    } finally {
      setDeletingLeagueId(null);
    }
  };
  useEffect(() => {
    let cancelled = false;
    api.leagues().then(data => { if (!cancelled) { setLeagues(data); setError(''); } })
      .catch(err => { if (!cancelled) setError(readableError(err)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

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
        {error && <ErrorNotice message={error} onRetry={() => { setLoading(true); void load(); }} />}
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

const nameFirst = ['Aster', 'Cinder', 'Morrow', 'Hollow', 'Vesper', 'Thistle', 'Copper', 'Drift', 'Ember', 'Fable', 'Glimmer', 'Juniper', 'Lunar', 'Marrow', 'Nightfall', 'Onyx', 'Quarry', 'Rook', 'Sable', 'Wilder'];
const nameSecond = ['Rovers', 'Athletic', 'Harriers', 'Wanderers', 'City', 'Vale', 'United', 'Comets', 'Foundry', 'Foxes', 'Pilots', 'Oaks', 'Tide', 'Ravens', 'Crest', 'Union'];
const palette = [['#f06d55', '#f7cb72'], ['#58c6b2', '#d3f078'], ['#8378ea', '#f08bc9'], ['#e4a43d', '#89d7eb'], ['#dc6288', '#f3c96d'], ['#4790d2', '#fa886b'], ['#8dbb61', '#f1e399'], ['#be75dc', '#76d7d0'], ['#eb8257', '#8dbce4'], ['#557fca', '#e6a6e3'], ['#d2a447', '#7fceb1'], ['#d06a6b', '#b4d96e']];

function inventClubs(count: number): Array<Omit<Club, 'id'> & { attack: number; defence: number }> {
  const used = new Set<string>();
  const clubs: Array<Omit<Club, 'id'> & { attack: number; defence: number }> = [];
  while (clubs.length < count) {
    const first = nameFirst[Math.floor(Math.random() * nameFirst.length)] ?? 'Aster';
    const second = nameSecond[Math.floor(Math.random() * nameSecond.length)] ?? 'Rovers';
    const name = `${first} ${second}`;
    if (used.has(name)) continue;
    used.add(name);
    const colors = palette[clubs.length % palette.length] ?? ['#f06d55', '#f7cb72'];
    clubs.push({ name, short_name: shortCode(clubs.length), colour_primary: colors[0], colour_secondary: colors[1], attack: 45 + Math.floor(Math.random() * 46), defence: 45 + Math.floor(Math.random() * 46) });
  }
  return clubs;
}

function shortCode(index: number) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  return `${alphabet[Math.floor(index / 676) % 26]}${alphabet[Math.floor(index / 26) % 26]}${alphabet[index % 26]}`;
}

function CreateLeague() {
  const navigate = useNavigate();
  const [clubs, setClubs] = useState(() => inventClubs(10));
  const [name, setName] = useState('');
  const [season, setSeason] = useState('2026/27');
  const [clubCount, setClubCount] = useState(10);
  const [topZone, setTopZone] = useState(4);
  const [bottomZone, setBottomZone] = useState(3);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const regenerate = (count: number) => { setClubCount(count); setClubs(inventClubs(count)); setTopZone(Math.min(topZone, Math.floor(count / 2))); setBottomZone(Math.min(bottomZone, Math.floor(count / 2))); };
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setError('');
    try {
      const created = await api.createLeague({ name, season_label: season, points_win: 3, points_draw: 1, top_zone: topZone, bottom_zone: bottomZone, clubs });
      navigate(`/leagues/${created.id}`);
    } catch (err) { setError(readableError(err)); }
    finally { setBusy(false); }
  }

  return <PageMotion className="narrow-page">
    <BackLink to="/" label="All leagues" />
    <h1 className="page-title">Create your <em>league.</em></h1>
    <p className="page-intro">Pick a name, set the season, and we'll dream up a cast of clubs to get you started.</p>
    <form className="form-panel" onSubmit={submit}>
      <div className="form-section"><div className="form-section-title"><span>01</span><div><h2>League identity</h2><p>Set the scene for your new season.</p></div></div>
        <div className="form-grid"><label>LEAGUE NAME<input required maxLength={48} placeholder="e.g. The Night Division" value={name} onChange={e => setName(e.target.value)} /></label><label>SEASON LABEL<input required maxLength={20} value={season} onChange={e => setSeason(e.target.value)} /></label></div>
      </div>
      <div className="form-section"><div className="form-section-title"><span>02</span><div><h2>Set the stage</h2><p>Choose your field of contenders.</p></div></div>
        <label>NUMBER OF CLUBS<select value={clubCount} onChange={e => regenerate(Number(e.target.value))}>{Array.from({ length: 17 }, (_, i) => i + 4).map(count => <option value={count} key={count}>{count} clubs</option>)}</select></label>
        <div className="club-preview">{clubs.map((club, i) => <div className="preview-club" key={`${club.name}-${i}`}><ClubCrest club={{ ...club, id: `preview-${i}` }} size="small" /><span>{club.name}</span></div>)}</div>
        <button type="button" className="button button-quiet shuffle-button" onClick={() => setClubs(inventClubs(clubCount))}><span>⟳</span> Shuffle the clubs</button>
      </div>
      <div className="form-section"><div className="form-section-title"><span>03</span><div><h2>Season rules</h2><p>Classic three points for a win. Shape the table zones.</p></div></div>
        <div className="form-grid"><label>TOP ZONE<select value={topZone} onChange={e => setTopZone(Number(e.target.value))}>{Array.from({ length: Math.floor(clubCount / 2) }, (_, i) => i + 1).map(v => <option value={v} key={v}>{v} clubs</option>)}</select></label><label>BOTTOM ZONE<select value={bottomZone} onChange={e => setBottomZone(Number(e.target.value))}>{Array.from({ length: Math.floor(clubCount / 2) }, (_, i) => i + 1).map(v => <option value={v} key={v}>{v} clubs</option>)}</select></label></div>
      </div>
      {error && <ErrorNotice message={error} />}
      <button className="button button-primary submit-button" type="submit" disabled={busy}>{busy ? 'Creating your league…' : 'Kick off the season'}</button>
    </form>
  </PageMotion>;
}

function LeaguePage() {
  const { leagueId = '', tab: routeTab = 'table' } = useParams();
  const currentTab = tabs.some(([id]) => id === routeTab) ? routeTab : 'table';
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedMatchday = Math.max(1, Number(searchParams.get('matchday')) || 1);
  const [savedManager] = useState(() => readManagerSelection(leagueId));
  const [detail, setDetail] = useState<LeagueDetail | null>(null);
  const [standings, setStandings] = useState<Standing[]>([]);
  const [error, setError] = useState(savedManager.error);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [managerClubId, setManagerClubId] = useState<number | null>(savedManager.clubId);
  const [managerPickerOpen, setManagerPickerOpen] = useState(false);
  const [pendingManagerClubId, setPendingManagerClubId] = useState<number | null>(null);
  const [managerTactics, setManagerTactics] = useState<Tactics>(savedManager.tactics);
  const [managerMatch, setManagerMatch] = useState<ManagerMatchSummary | null>(null);
  const [upcomingMatches, setUpcomingMatches] = useState<Match[]>([]);
  const [matchPlayback, setMatchPlayback] = useState<MatchPlayback | null>(null);
  const [simulationBusy, setSimulationBusy] = useState(false);
  const playbackMatchId = matchPlayback?.match.id;
  const playbackComplete = matchPlayback?.complete;

  useEffect(() => {
    let cancelled = false;
    Promise.all([api.league(leagueId), api.table(leagueId, selectedMatchday), api.matches(leagueId)])
      .then(([league, table, matches]) => {
        if (cancelled) return;
        if (savedManager.clubId !== null && !league.clubs.some(club => Number(club.id) === savedManager.clubId)) {
          clearManagerClubId(leagueId);
          setManagerClubId(null);
          const message = 'Your saved team is no longer in this league. Choose a team to manage again.';
          setError(message);
        }
        setDetail(league);
        setStandings(table);
        setUpcomingMatches(matches);
      })
      .catch(err => { if (!cancelled) setError(readableError(err)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [leagueId, refreshKey, savedManager, selectedMatchday]);

  useEffect(() => {
    if (playbackMatchId === undefined || playbackComplete) return;
    const timer = window.setInterval(() => {
      setMatchPlayback(current => {
        if (!current) return null;
        const minute = Math.min(90, Math.floor((Date.now() - current.startedAt) / 60000 * 90));
        return { ...current, minute, complete: minute === 90 };
      });
    }, 250);
    return () => window.clearInterval(timer);
  }, [playbackMatchId, playbackComplete]);

  const runSimulation = async (action: 'next' | 'all' | 'reset') => {
    if (simulationBusy) return;
    setSimulationBusy(true);
    try {
      if (action === 'reset') {
        await api.resetLeague(leagueId);
        setManagerMatch(null);
        setMatchPlayback(null);
        setSearchParams({ matchday: '1' }, { replace: true });
      } else if (action === 'next' && managerClubId !== null) {
        const result = await api.simulateWithManager(leagueId, managerClubId, managerTactics);
        const lastMatchday = Math.max(1, ...upcomingMatches.map(match => match.matchday));
        setSearchParams({ matchday: String(Math.min(lastMatchday, result.matchday + 1)) }, { replace: true });
        if (result.managerMatch) {
          const match = await api.match(result.managerMatch.matchId);
          setManagerMatch(result.managerMatch);
          setMatchPlayback({
            match,
            minute: 0,
            complete: false,
            startedAt: Date.now(),
          });
        } else {
          setManagerMatch(null);
        }
      } else {
        const result = await api.simulate(leagueId, action);
        if (action === 'all') {
          setSearchParams({ matchday: String(Math.max(1, ...upcomingMatches.map(match => match.matchday))) }, { replace: true });
        } else if (result.matchday !== undefined) {
          const lastMatchday = Math.max(1, ...upcomingMatches.map(match => match.matchday));
          setSearchParams({ matchday: String(Math.min(lastMatchday, result.matchday + 1)) }, { replace: true });
          const fixture = upcomingMatches.find(match => match.matchday === result.matchday);
          if (fixture) {
            const match = await api.match(fixture.id);
            setMatchPlayback({
              match,
              minute: 0,
              complete: false,
              startedAt: Date.now(),
            });
          }
        }
      }
      setRefreshKey(key => key + 1);
    } catch (err) { setError(readableError(err)); }
    finally { setSimulationBusy(false); }
  };

  const startManaging = () => {
    if (pendingManagerClubId === null) return;
    try {
      saveManagerClubId(leagueId, pendingManagerClubId);
      setManagerClubId(pendingManagerClubId);
      setManagerTactics('balanced');
      setManagerPickerOpen(false);
      setPendingManagerClubId(null);
      setManagerMatch(null);
      setMatchPlayback(null);
      setError('');
    } catch (err) {
      setError(readableError(err));
    }
  };

  const stopManaging = () => {
    try {
      clearManagerClubId(leagueId);
      setManagerClubId(null);
      setManagerMatch(null);
      setMatchPlayback(null);
    } catch (err) {
      setError(readableError(err));
    }
  };

  if (loading && !detail) return <Loading label="Setting up the stadium" />;
  if (!detail) return <PageMotion><BackLink to="/" label="All leagues" /><ErrorNotice message={error || 'League not found.'} onRetry={() => setRefreshKey(k => k + 1)} /></PageMotion>;
  const league = detail.league;
  const playedMatches = typeof detail.progress === 'number'
    ? detail.progress
    : detail.progress.played_matches ?? detail.progress.played ?? league.played_matches ?? 0;
  const totalMatches = typeof detail.progress === 'number'
    ? league.total_matches ?? 0
    : detail.progress.total_matches ?? detail.progress.total ?? league.total_matches ?? 0;
  const progressPercent = totalMatches ? Math.round(playedMatches / totalMatches * 100) : typeof detail.progress === 'object' ? detail.progress.percentage ?? 0 : 0;
  const totalMatchdays = detail.clubs.length % 2 === 0 ? 2 * (detail.clubs.length - 1) : 2 * detail.clubs.length;
  const seasonComplete = totalMatches > 0 && playedMatches === totalMatches;
  const managedClub = detail.clubs.find(club => Number(club.id) === managerClubId);
  return <PageMotion>
    <BackLink to="/" label="All leagues" />
    <section className="league-masthead">
      <div className="masthead-meta"><span className="status-pill"><span className="live-dot" /> SEASON IN PLAY</span><span>{league.season_label}</span><span>{detail.clubs.length} CLUBS</span></div>
      <div className="league-title-row"><div><h1>{league.name}</h1><p>{league.season_label} league competition</p></div><div className="season-progress-ring"><strong>{progressPercent}<small>%</small></strong><span>COMPLETE</span></div></div>
      <div className="season-progress"><span style={{ width: `${Math.min(100, progressPercent)}%` }} /></div>
      <div className="progress-foot"><span>Matchday {Math.max(1, Math.ceil(playedMatches / Math.max(1, detail.clubs.length / 2)) + 1)}</span><span>{playedMatches} / {totalMatches} matches played</span></div>
    </section>
    <div className="league-toolbar"><nav className="league-tabs" aria-label="League sections">
      {tabs.map(([id, label]) => <Link key={id} to={`/leagues/${leagueId}/${id}?matchday=${selectedMatchday}`} className={`league-tab${currentTab === id ? ' is-active' : ''}`}>{label}</Link>)}
    </nav>
    <div className="simulation-actions">
      <label className="active-matchday-picker">MATCHDAY
        <select className="styled-select" value={selectedMatchday} onChange={event => setSearchParams({ matchday: event.target.value })}>
          {Array.from({ length: totalMatchdays }, (_, index) => <option key={index + 1} value={index + 1}>{String(index + 1).padStart(2, '0')}</option>)}
        </select>
      </label>
      {seasonComplete
        ? <Link className="button button-secondary button-small" to={`/leagues/${leagueId}/awards?matchday=${totalMatchdays}`}>End season <span aria-hidden="true">🏆</span></Link>
        : <button className="button button-secondary button-small" disabled={simulationBusy || !!matchPlayback} onClick={() => void runSimulation('next')}>{simulationBusy ? 'Simulating…' : managerClubId === null ? 'Simulate next' : 'Next matchday'}</button>}
      {!seasonComplete && <button className="button button-quiet button-small" disabled={simulationBusy || !!matchPlayback} onClick={() => void runSimulation('all')}>Simulate season</button>}
      <button className="button button-quiet button-small" disabled={simulationBusy || !!matchPlayback} onClick={() => void runSimulation('reset')}>Reset</button>
      {managerClubId === null && <button className="button button-quiet button-small" disabled={!!matchPlayback} onClick={() => { setPendingManagerClubId(null); setManagerPickerOpen(true); }}>Choose your team</button>}
    </div></div>
    {managerClubId !== null && managedClub && <section className="manager-panel" aria-label="Manager controls">
      <div className="manager-team">
        <ClubCrest club={managedClub} size="small" />
        <div><div className="eyebrow">YOUR TEAM</div><strong>{managedClub.name}</strong><small>Attack {managedClub.attack} · Defence {managedClub.defence}</small></div>
      </div>
      <label className="manager-tactics">TACTICS
        <select value={managerTactics} onChange={event => {
          const value = event.target.value;
          if (isTactics(value)) {
            try {
              saveManagerTactics(leagueId, value);
              setManagerTactics(value);
              setError('');
            } catch (err) {
              setError(readableError(err));
            }
          }
        }}>
          <option value="balanced">Balanced</option>
          <option value="attacking">Attacking</option>
          <option value="defensive">Defensive</option>
        </select>
      </label>
      <p className="manager-tactics-note">
        {managerTactics === 'attacking' ? 'More attacking threat, less defensive cover.' : managerTactics === 'defensive' ? 'More defensive cover, less attacking threat.' : 'No rating adjustments.'}
      </p>
      <button className="button button-quiet button-small" onClick={stopManaging}>Leave manager mode</button>
    </section>}
    {managerMatch && managedClub && <div className="manager-result" role="status">
      <strong>Matchday {managerMatch.matchday}</strong>
      <span>{managedClub.name} {managerMatch.goalsFor}–{managerMatch.goalsAgainst}</span>
      <span>{managerMatch.tactics} · xG {managerMatch.expectedGoalsFor.toFixed(2)}–{managerMatch.expectedGoalsAgainst.toFixed(2)}</span>
    </div>}
    {managerPickerOpen && <section className="manager-picker" aria-labelledby="manager-picker-title">
      <div className="manager-picker-heading">
        <div><div className="eyebrow">MANAGER MODE</div><h2 id="manager-picker-title">Choose the team you want to manage</h2><p>Your choice is saved for this league in this browser. You can change it later by leaving manager mode.</p></div>
        <button type="button" className="button button-quiet button-small" onClick={() => setManagerPickerOpen(false)}>Cancel</button>
      </div>
      <div className="manager-club-grid">
        {detail.clubs.map(club => <button type="button" key={club.id} className={`manager-club-option${pendingManagerClubId === Number(club.id) ? ' is-selected' : ''}`} aria-pressed={pendingManagerClubId === Number(club.id)} onClick={() => setPendingManagerClubId(Number(club.id))}>
          <ClubCrest club={club} size="small" /><strong>{club.name}</strong><span>{club.short_name}</span><small>ATT {club.attack} · DEF {club.defence}</small>
        </button>)}
      </div>
      <button type="button" className="button button-primary" disabled={pendingManagerClubId === null} onClick={startManaging}>Manage selected team</button>
    </section>}
    {error && <ErrorNotice message={error} onRetry={() => { setError(''); setRefreshKey(k => k + 1); }} />}
    {loading ? <Loading label="Loading the latest scores" /> : <LeagueTab tab={currentTab} leagueId={leagueId} clubs={detail.clubs} standings={standings} matchday={selectedMatchday} onMatchdayChange={matchday => setSearchParams({ matchday: String(matchday) })} managerClubId={managerClubId} topZone={league.top_zone ?? 4} bottomZone={league.bottom_zone ?? 3} refreshKey={refreshKey} seasonComplete={seasonComplete} />}
    {matchPlayback && <MatchdayPlayback playback={matchPlayback} onClose={() => setMatchPlayback(null)} onFastForward={() => setMatchPlayback(current => current ? { ...current, minute: 90, complete: true } : null)} />}
  </PageMotion>;
}

function managerStorageKey(leagueId: number | string) {
  return `pitch:manager-club:${leagueId}`;
}

function managerTacticsStorageKey(leagueId: number | string) {
  return `pitch:manager-tactics:${leagueId}`;
}

function readManagerClubId(leagueId: number | string): number | null {
  const stored = window.localStorage.getItem(managerStorageKey(leagueId));
  if (stored === null) return null;
  if (!/^[1-9]\d*$/.test(stored) || !Number.isSafeInteger(Number(stored))) {
    throw new Error('The saved manager team is invalid. Clear it and choose a team again.');
  }
  return Number(stored);
}

function readManagerSelection(leagueId: number | string): { clubId: number | null; tactics: Tactics; error: string } {
  try {
    const clubId = readManagerClubId(leagueId);
    const storedTactics = clubId === null ? null : window.localStorage.getItem(managerTacticsStorageKey(leagueId));
    if (storedTactics !== null && !isTactics(storedTactics)) {
      throw new Error('The saved tactics are invalid. Choose your tactics again.');
    }
    return { clubId, tactics: storedTactics ?? 'balanced', error: '' };
  } catch (err) {
    return { clubId: null, tactics: 'balanced', error: readableError(err) };
  }
}

function saveManagerClubId(leagueId: number | string, clubId: number) {
  saveManagerTactics(leagueId, 'balanced');
  window.localStorage.setItem(managerStorageKey(leagueId), String(clubId));
  window.dispatchEvent(new Event('pitch:manager-team-changed'));
}

function saveManagerTactics(leagueId: number | string, tactics: Tactics) {
  window.localStorage.setItem(managerTacticsStorageKey(leagueId), tactics);
}

function clearManagerClubId(leagueId: number | string) {
  window.localStorage.removeItem(managerStorageKey(leagueId));
  window.localStorage.removeItem(managerTacticsStorageKey(leagueId));
  window.dispatchEvent(new Event('pitch:manager-team-changed'));
}

function isTactics(value: string): value is Tactics {
  return value === 'attacking' || value === 'balanced' || value === 'defensive';
}

function LeagueTab({ tab, leagueId, clubs, standings, matchday, onMatchdayChange, managerClubId, topZone, bottomZone, refreshKey, seasonComplete }: { tab: string; leagueId: string; clubs: Club[]; standings: Standing[]; matchday: number; onMatchdayChange: (matchday: number) => void; managerClubId: number | null; topZone: number; bottomZone: number; refreshKey: number; seasonComplete: boolean }) {
  if (tab === 'fixtures') return <FixturesTab key={refreshKey} leagueId={leagueId} matchday={matchday} onMatchdayChange={onMatchdayChange} totalMatchdays={clubs.length % 2 === 0 ? 2 * (clubs.length - 1) : 2 * clubs.length} />;
  if (tab === 'match-centre') return <MatchCentreTab key={refreshKey} leagueId={leagueId} matchday={matchday} managerClubId={managerClubId} />;
  if (tab === 'scorers') return <ScorersTab key={refreshKey} leagueId={leagueId} matchday={matchday} />;
  if (tab === 'awards') return <AwardsTab key={refreshKey} leagueId={leagueId} matchday={matchday} seasonComplete={seasonComplete} />;
  return <TableTab standings={standings} topZone={topZone} bottomZone={bottomZone} />;
}

type MatchEventType = 'goal' | 'yellow' | 'red' | 'foul' | 'substitution';
type MatchEvent = {
  id: number | string;
  club_id: number | string;
  player_name: string;
  minute: number;
  eventType: MatchEventType;
  assist_player_name?: string | null;
  player_off_name?: string;
};

function getMatchEvents(match: MatchDetail): MatchEvent[] {
  return [
    ...(match.goals ?? []).map(goal => ({ ...goal, eventType: 'goal' as const })),
    ...(match.yellow_cards ?? []).map(card => ({ ...card, eventType: 'yellow' as const })),
    ...(match.red_cards ?? []).map(card => ({ ...card, eventType: 'red' as const })),
    ...(match.fouls ?? []).map(foul => ({ ...foul, eventType: 'foul' as const })),
    ...(match.substitutions ?? []).map(substitution => ({
      id: substitution.id,
      club_id: substitution.club_id,
      player_name: substitution.player_on_name,
      player_off_name: substitution.player_off_name,
      minute: substitution.minute,
      eventType: 'substitution' as const,
    })),
  ].sort((left, right) => left.minute - right.minute);
}

function eventLabel(event: MatchEvent): string {
  if (event.eventType === 'goal') return event.assist_player_name ? `GOAL · ASSIST: ${event.assist_player_name}` : 'GOAL · UNASSISTED';
  if (event.eventType === 'yellow') return 'YELLOW CARD';
  if (event.eventType === 'red') return 'RED CARD';
  if (event.eventType === 'substitution') return `SUBSTITUTION · ${event.player_name} on for ${event.player_off_name}`;
  return 'FOUL';
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

function MatchLineup({ clubName, players, substitutions }: { clubName: string; players: MatchPlayerStats[]; substitutions: MatchDetail['substitutions'] }) {
  const starters = players.filter(player => player.is_starter);
  const legacyStarters = [...players]
    .filter(player => player.minutes_played > 0)
    .sort((a, b) => ['GK', 'DEF', 'MID', 'FWD'].indexOf(a.position) - ['GK', 'DEF', 'MID', 'FWD'].indexOf(b.position))
    .slice(0, 11);
  const startingEleven = starters.length ? starters : legacyStarters;
  const startingIds = new Set(startingEleven.map(player => String(player.player_id)));
  const bench = players.filter(player => !startingIds.has(String(player.player_id)));
  const usedSubstitutes = new Set(substitutions.map(substitution => String(substitution.player_on_id)));

  return <section className="lineup-team">
    <h4>{clubName} <small>STARTING XI</small></h4>
    <ol className="lineup-list">{startingEleven.map(player => {
      const subbedOff = substitutions.find(substitution => String(substitution.player_off_id) === String(player.player_id));
      return <li key={player.player_id}><span>{player.position}</span><strong>{player.player_name}</strong>{subbedOff ? <small>OFF {subbedOff.minute}&apos;</small> : player.red_cards > 0 ? <small>SENT OFF</small> : null}</li>;
    })}</ol>
    <h4 className="lineup-subheading">BENCH</h4>
    {bench.length ? <ul className="lineup-list lineup-list--bench">{bench.map(player => <li key={player.player_id}>
      <span>{player.position}</span><strong>{player.player_name}</strong><small>{usedSubstitutes.has(String(player.player_id)) ? 'SUB ON' : player.minutes_played > 0 ? `${player.minutes_played} MIN` : 'UNUSED'}</small>
    </li>)}</ul> : <p className="lineup-empty">No bench players recorded.</p>}
    {substitutions.length > 0 && <div className="substitution-list"><strong>SUBSTITUTIONS</strong>{substitutions.map(substitution =>
      <span key={substitution.id}><b>{substitution.minute}&apos;</b> {substitution.player_on_name} <i>ON</i> for {substitution.player_off_name} <i>OFF</i></span>,
    )}</div>}
  </section>;
}

function MatchdayPlayback({ playback, onClose, onFastForward }: { playback: MatchPlayback; onClose: () => void; onFastForward: () => void }) {
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

function SectionTitle({ title, detail }: { title: string; detail: string }) {
  return <div className="content-heading"><h2>{title}</h2><p>{detail}</p></div>;
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

function FormDots({ form }: { form: string }) {
  if (!form) return <span className="form-empty">—</span>;
  return <span className="form-dots" aria-label={`Form: ${form}`}>{form.split('').map((result, i) => <i key={`${result}-${i}`} className={`form-${result.toLowerCase()}`} title={result} />)}</span>;
}

function FixturesTab({ leagueId, matchday, onMatchdayChange, totalMatchdays }: { leagueId: string; matchday: number; onMatchdayChange: (matchday: number) => void; totalMatchdays: number }) {
  const [matches, setMatches] = useState<Match[]>([]);
  const [error, setError] = useState('');
  useEffect(() => { let cancelled = false; api.matches(leagueId, matchday).then(data => { if (!cancelled) { setMatches(data); setError(''); } }).catch(e => { if (!cancelled) setError(readableError(e)); }); return () => { cancelled = true; }; }, [leagueId, matchday]);
  return <section className="tab-panel"><div className="content-heading"><div><h2>Fixtures <span className="heading-count">/ Matchday {String(matchday).padStart(2, '0')}</span></h2></div><div className="matchday-stepper"><button type="button" disabled={matchday <= 1} onClick={() => onMatchdayChange(Math.max(1, matchday - 1))}>Previous</button><label className="matchday-select">Matchday<select value={matchday} onChange={e => onMatchdayChange(Number(e.target.value))}>{Array.from({ length: totalMatchdays }, (_, i) => <option key={i + 1} value={i + 1}>{String(i + 1).padStart(2, '0')}</option>)}</select></label><button type="button" disabled={matchday >= totalMatchdays} onClick={() => onMatchdayChange(Math.min(totalMatchdays, matchday + 1))}>Next</button></div></div>
    {error && <ErrorNotice message={error} />}
    <MatchList matches={matches} leagueId={leagueId} />
  </section>;
}

function MatchList({ matches, leagueId }: { matches: Match[]; leagueId?: number | string }) {
  return matches.length ? <div className="match-list">{matches.map(match => <Link className="match-card" key={match.id} to={`/leagues/${leagueId || match.league_id || ''}/match-centre?matchday=${match.matchday}&match=${match.id}`}>
    <span className="match-kickoff">{match.played_at ? new Date(match.played_at).toLocaleDateString(undefined, { day: '2-digit', month: 'short' }) : `MD ${match.matchday}`}</span>
    <MatchTeam name={match.home_club_name} shortName={match.home_short_name} id={match.home_club_id} primary={match.home_colour_primary} secondary={match.home_colour_secondary} align="right" />
    <span className={`match-score${match.home_goals === null ? ' upcoming' : ''}`}>{match.home_goals ?? '–'} <i>:</i> {match.away_goals ?? '–'}</span>
    <MatchTeam name={match.away_club_name} shortName={match.away_short_name} id={match.away_club_id} primary={match.away_colour_primary} secondary={match.away_colour_secondary} />
    {match.goal_events?.length ? <span className="match-event-summary">{match.goal_events.map((goal, index) => <span key={`${goal.minute}-${index}`}><strong>{goal.player_name} {goal.minute}&apos;</strong>{goal.assist_player_name ? ` · Assist: ${goal.assist_player_name}` : ' · Unassisted'}</span>)}</span> : null}
    {match.home_xg !== null && match.home_xg !== undefined ? <span className="match-stat-summary">xG {Number(match.home_xg).toFixed(2)} – {Number(match.away_xg).toFixed(2)} · YC {match.yellow_card_count ?? 0} · RC {match.red_card_count ?? 0}</span> : null}
  </Link>)}</div> : <EmptyPanel title="No fixtures in this round" text="Select another matchday or simulate to reveal what's next." />;
}

function MatchTeam({ name, shortName, id, primary, secondary, align = 'left' }: { name: string; shortName: string; id: number | string; primary: string; secondary: string; align?: 'left' | 'right' }) {
  const club = { id: id || name, name: name || 'Club', short_name: shortName || 'CLB', colour_primary: primary || '#4786b8', colour_secondary: secondary || '#f2d277' };
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
  return <section className="tab-panel"><SectionTitle title="Match centre" detail="The moments that make the match." />
    {error && <ErrorNotice message={error} />}
    <label className="match-picker">CHOOSE A FIXTURE<select className="styled-select" value={selected} onChange={e => setSelected(e.target.value)} disabled={!matches.length}>{matches.length
      ? matches.map(game => <option key={game.id} value={game.id}>{game.home_club_name} {game.home_goals ?? '–'} : {game.away_goals ?? '–'} {game.away_club_name}</option>)
      : <option value="">No fixtures for this matchday</option>}</select></label>
    {match ? <div className="match-report">
      <div className="report-scoreboard"><span className="report-round">MATCHDAY {match.matchday}</span><div className="report-teams"><ReportTeam name={match.home_club_name} id={match.home_club_id} shortName={match.home_short_name} primary={match.home_colour_primary} secondary={match.home_colour_secondary} /><div className="report-score">{match.home_goals ?? '–'}<span>:</span>{match.away_goals ?? '–'}</div><ReportTeam name={match.away_club_name} id={match.away_club_id} shortName={match.away_short_name} primary={match.away_colour_primary} secondary={match.away_colour_secondary} /></div><span className="report-date">{match.played_at ? new Date(match.played_at).toLocaleString() : 'KICK-OFF PENDING'}</span></div>
      {!isMatchPlayed ? <div className="pre-match-preview">
        <img src="/matchday/kickoff.jpg" alt="" />
        <div><div className="eyebrow">FIXTURE PREVIEW</div><h3>Ready for kick-off</h3><p>Line-ups, match events and statistics will appear after this matchday is simulated.</p></div>
      </div> : <>
        {manOfTheMatch && <div className="report-motm"><img src="/matchday/motm.jpg" alt="" /><span><small>MAN OF THE MATCH</small><strong>{manOfTheMatch.player_name} <i className="motm-badge">MOTM</i></strong><em>{manOfTheMatch.goals} goals · {manOfTheMatch.assists} assists · {manOfTheMatch.key_passes} key passes</em></span></div>}
        <section className="match-lineups"><h3>Team line-ups</h3><div className="lineup-grid">
          <MatchLineup clubName={match.home_club_name} players={homePlayers} substitutions={homeSubstitutions} />
          <MatchLineup clubName={match.away_club_name} players={awayPlayers} substitutions={awaySubstitutions} />
        </div></section>
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
        {match.player_stats?.length ? <section className="player-match-stats"><h3>Player match stats</h3><div className="player-match-stats-wrap"><table><thead><tr><th>PLAYER</th><th>MIN</th><th>G</th><th>A</th><th>SH</th><th>SOT</th><th>xG</th><th>KP</th><th>T</th><th>F</th><th>YC</th><th>RC</th></tr></thead><tbody>{match.player_stats.map(player => <tr key={player.player_id}><td>{player.player_name} <small>{player.position}</small></td><td>{player.minutes_played}</td><td>{player.goals}</td><td>{player.assists}</td><td>{player.shots}</td><td>{player.shots_on_target}</td><td>{Number(player.xg).toFixed(2)}</td><td>{player.key_passes}</td><td>{player.tackles}</td><td>{player.fouls}</td><td>{player.yellow_cards}</td><td>{player.red_cards}</td></tr>)}</tbody></table></div></section> : null}
      </>}
    </div> : <EmptyPanel title="Pick a match to relive" text="Choose any fixture to see the score and goal timeline." />}
  </section>;
}

function ReportTeam({ name, id, shortName, primary, secondary }: { name: string; id: number | string; shortName: string; primary: string; secondary: string }) {
  return <div className="report-team"><ClubCrest club={{ id, name, short_name: shortName, colour_primary: primary, colour_secondary: secondary }} size="large" /><strong>{name}</strong></div>;
}

function ScorersTab({ leagueId, matchday }: { leagueId: string; matchday: number }) {
  const [players, setPlayers] = useState<PlayerStat[]>([]);
  const [error, setError] = useState('');
  useEffect(() => { api.playerStats(leagueId, matchday).then(setPlayers).catch(e => setError(readableError(e))); }, [leagueId, matchday]);
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
  const [players, setPlayers] = useState<PlayerStat[]>([]);
  const [error, setError] = useState('');
  useEffect(() => {
    let cancelled = false;
    api.playerStats(leagueId, matchday)
      .then(data => { if (!cancelled) setPlayers(data); })
      .catch(err => { if (!cancelled) setError(readableError(err)); });
    return () => { cancelled = true; };
  }, [leagueId, matchday]);

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

function ClubPage() {
  const { clubId = '' } = useParams();
  const [data, setData] = useState<ClubDetail | null>(null);
  const [error, setError] = useState('');
  useEffect(() => { api.club(clubId).then(setData).catch(e => setError(readableError(e))); }, [clubId]);
  if (!data) return <PageMotion><BackLink to="/" label="Back" />{error ? <ErrorNotice message={error} /> : <Loading label="Opening the club house" />}</PageMotion>;
  const form = Array.isArray(data.form) ? data.form.join('') : data.form;
  return <PageMotion><BackLink to={`/leagues/${data.league.id}`} label={data.league.name} />
    <section className="club-profile"><div className="club-profile-art"><div className="profile-halo" /><ClubCrest club={data.club} size="large" /><span>CLUB PROFILE / {data.league.season_label}</span></div><div className="club-profile-info"><div className="eyebrow">THE HOME SIDE</div><h1>{data.club.name}</h1><p>{data.league.name} <span>·</span> {data.league.season_label}</p><div className="club-facts"><div><span>CLUB FORM</span><FormDots form={form} /></div><div><span>SQUAD SIZE</span><strong>{data.squad.length}</strong></div></div></div></section>
    <section className="club-detail-grid"><div className="club-box"><div className="eyebrow">THE SQUAD</div><h2>Players <span className="heading-count">{data.squad.length.toString().padStart(2, '0')}</span></h2>{data.squad.map(player => <div className="squad-row" key={player.id}><span className="player-mark">{player.name.split(' ').map(w => w[0]).join('').slice(0, 2)}</span><strong>{player.name}</strong><span>{player.position || 'PLAYER'}</span>{player.goals !== undefined && <b>{player.goals} <small>G</small></b>}</div>)}</div><div className="club-box"><div className="eyebrow">NEXT UP</div><h2>Fixtures</h2><MatchList matches={data.fixtures} leagueId={data.league.id} /></div></section>
  </PageMotion>;
}

function BackLink({ to, label }: { to: string; label: string }) { return <Link className="back-link" to={to}>{label}</Link>; }
function ErrorNotice({ message, onRetry }: { message: string; onRetry?: () => void }) { return <div className="error-notice" role="alert"><span>!</span><div><strong>We hit a snag.</strong><p>{message}</p></div>{onRetry && <button onClick={onRetry}>Try again ↻</button>}</div>; }
function Loading({ label }: { label: string }) { return <div className="loading-state"><span className="loading-spinner" /><p>{label}…</p></div>; }
function EmptyPanel({ title, text }: { title: string; text: string }) { return <div className="empty-panel"><h3>{title}</h3><p>{text}</p></div>; }
function NotFound() { return <PageMotion className="empty-state"><h2>That page isn't in this fixture.</h2><Link to="/" className="button button-secondary">Back to leagues</Link></PageMotion>; }

export default App;
