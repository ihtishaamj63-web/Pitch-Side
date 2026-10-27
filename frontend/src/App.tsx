import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { BrowserRouter, Link, Route, Routes, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { api, readableError } from './api';
import { ClubCrest } from './Crest';
import type { Club, ClubDetail, LeagueDetail, LeagueSummary, ManagerMatchSummary, ManagerState, Match, MatchDetail, MatchPlayerStats, PlayerStat, Standing, Tactics } from './types';
import { appendManagerMatch, generateHeadline, managerMatchRating } from './manager';
import './App.css';

const footerUrl = import.meta.env.VITE_PORTFOLIO_URL;
const tabs = [
  ['table', 'Table'],
  ['fixtures', 'Fixtures'],
  ['match-centre', 'Match centre'],
  ['scorers', 'League leaders'],
  ['awards', 'Awards'],
] as const;

const emptyManagerState: ManagerState = { currentStreak: 0, bestStreak: 0, averageRating: 0, matchesManaged: 0 };

interface MatchPlayback {
  match: MatchDetail;
  minute: number;
  complete: boolean;
  headline: string;
}

function App() {
  return <BrowserRouter><AppContent /></BrowserRouter>;
}

function AppContent() {
  const location = useLocation();
  return (
      <div className="app-shell">
        <header className="topbar">
          <Link className="brand" to="/" aria-label="Pitch home"><span className="brand-mark">P</span><span>PITCH</span></Link>
          <span className="topbar-note"><span className="live-dot" /> LEAGUE MANAGEMENT</span>
          <a className="topbar-link" href={footerUrl || '#leagues'} target={footerUrl ? '_blank' : undefined} rel={footerUrl ? 'noreferrer' : undefined}>Explore the season <span aria-hidden="true">↗</span></a>
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
        <footer className="footer"><span>THE GAME, REIMAGINED.</span><span>Built by {footerUrl ? <a href={footerUrl} target="_blank" rel="noreferrer">Ihtishaam <span aria-hidden="true">↗</span></a> : 'Ihtishaam'}</span></footer>
      </div>
  );
}

function PageMotion({ children, className = '' }: { children: ReactNode; className?: string }) {
  const reduceMotion = useReducedMotion();
  return <motion.div className={className} initial={reduceMotion ? false : { opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: reduceMotion ? 0 : 0.32, ease: 'easeOut' }}>{children}</motion.div>;
}

function LeagueHome() {
  const [leagues, setLeagues] = useState<LeagueSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    try {
      setLeagues(await api.leagues());
      setError('');
    } catch (err) { setError(readableError(err)); }
    finally { setLoading(false); }
  }, []);
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
          <div className="eyebrow"><span className="eyebrow-line" /> YOUR FOOTBALL COMPETITION</div>
          <h1>Build a league.<br /><em>Run the season.</em></h1>
          <p>Create your clubs, simulate the fixtures and follow the table, match reports and player statistics.</p>
          <Link to="/leagues/new" className="button button-primary">Create a league <span aria-hidden="true">↗</span></Link>
        </div>
        <div className="hero-art" aria-hidden="true">
          <div className="stadium-glow" /><div className="pitch-lines"><span /><span /><span /></div>
          <div className="hero-orbit orbit-one" /><div className="hero-orbit orbit-two" />
          <div className="hero-ball"><span /><span /><span /></div>
          <div className="hero-caption"><span>01 / 90</span><span>LIGHTS ON. GAME ON.</span></div>
        </div>
      </section>
      <section className="league-section" id="leagues">
        <div className="section-heading"><div><div className="eyebrow">YOUR UNIVERSE</div><h2>Leagues <span className="heading-count">{leagues.length.toString().padStart(2, '0')}</span></h2></div><Link className="text-link" to="/leagues/new">Build a new league <span>↗</span></Link></div>
        {error && <ErrorNotice message={error} onRetry={() => { setLoading(true); void load(); }} />}
        {loading ? <Loading label="Finding your leagues" /> : leagues.length ? (
          <div className="league-grid">
            {leagues.map((league, index) => <Link to={`/leagues/${league.id}`} className="league-card" key={league.id}>
              <div className={`league-card-art league-card-art--${index % 3}`}><span className="season-stamp">{league.season_label}</span><span className="card-index">{String(index + 1).padStart(2, '0')}</span><div className="mini-pitch"><span /></div></div>
              <div className="league-card-body"><div><h3>{league.name}</h3><p>{league.club_count} clubs <span>·</span> {league.total_matches} fixtures</p></div><span className="card-arrow">↗</span></div>
              <div className="league-progress"><span style={{ width: `${league.total_matches ? Math.min(100, league.played_matches / league.total_matches * 100) : 0}%` }} /></div>
              <div className="progress-label"><span>SEASON PROGRESS</span><span>{league.played_matches} / {league.total_matches} played</span></div>
            </Link>)}
          </div>
        ) : <div className="empty-state"><div className="empty-icon">✳</div><h3>A blank page. A whole season.</h3><p>Your first league is one decision away.</p><Link to="/leagues/new" className="button button-secondary">Create your first league <span>↗</span></Link></div>}
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
    <div className="eyebrow"><span className="eyebrow-line" /> THE FIRST WHISTLE</div><h1 className="page-title">Create your <em>league.</em></h1>
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
      <button className="button button-primary submit-button" type="submit" disabled={busy}>{busy ? 'Creating your league…' : 'Kick off the season'} <span aria-hidden="true">↗</span></button>
    </form>
  </PageMotion>;
}

function LeaguePage() {
  const { leagueId = '', tab: routeTab = 'table' } = useParams();
  const currentTab = tabs.some(([id]) => id === routeTab) ? routeTab : 'table';
  const [searchParams] = useSearchParams();
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
  const [managerBye, setManagerBye] = useState<number | null>(null);
  const [managerState, setManagerState] = useState<ManagerState>(savedManager.managerState);
  const [upcomingMatches, setUpcomingMatches] = useState<Match[]>([]);
  const [matchPlayback, setMatchPlayback] = useState<MatchPlayback | null>(null);
  const [simulationBusy, setSimulationBusy] = useState(false);
  const playbackMatchId = matchPlayback?.match.id;
  const playbackComplete = matchPlayback?.complete;

  useEffect(() => {
    let cancelled = false;
    Promise.all([api.league(leagueId), api.table(leagueId), api.matches(leagueId)])
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
  }, [leagueId, refreshKey, savedManager]);

  useEffect(() => {
    if (playbackMatchId === undefined || playbackComplete) return;
    const timer = window.setInterval(() => {
      setMatchPlayback(current => {
        if (!current) return null;
        const minute = Math.min(90, current.minute + 1);
        return { ...current, minute, complete: minute === 90 };
      });
    }, 125);
    return () => window.clearInterval(timer);
  }, [playbackMatchId, playbackComplete]);

  const runSimulation = async (action: 'next' | 'all' | 'reset') => {
    if (simulationBusy) return;
    setSimulationBusy(true);
    try {
      if (action === 'reset') {
        await api.resetLeague(leagueId);
        setManagerMatch(null);
        setManagerBye(null);
        setMatchPlayback(null);
        setManagerState(emptyManagerState);
        saveManagerState(leagueId, emptyManagerState);
      } else if (action === 'next' && managerClubId !== null) {
        const result = await api.simulateWithManager(leagueId, managerClubId, managerTactics);
        if (result.managerMatch) {
          const match = await api.match(result.managerMatch.matchId);
          const lastGoal = match.goals[match.goals.length - 1];
          const enrichedMatch = { ...result.managerMatch, lastGoalMinute: lastGoal?.minute };
          const nextState = appendManagerMatch(managerState, enrichedMatch);
          setManagerMatch(enrichedMatch);
          setManagerState(nextState);
          saveManagerState(leagueId, nextState);
          setManagerBye(null);
          setMatchPlayback({
            match,
            minute: 0,
            complete: false,
            headline: generateHeadline(enrichedMatch, detail?.clubs ?? []),
          });
        } else {
          setManagerMatch(null);
          setManagerBye(result.matchday);
        }
      } else {
        await api.simulate(leagueId, action);
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
      setManagerBye(null);
      setMatchPlayback(null);
      setManagerState(emptyManagerState);
      saveManagerState(leagueId, emptyManagerState);
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
      setManagerBye(null);
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
  const managedClub = detail.clubs.find(club => Number(club.id) === managerClubId);
  const nextManagerMatch = upcomingMatches.find(match =>
    match.played_at === null && [match.home_club_id, match.away_club_id].some(id => Number(id) === managerClubId),
  );
  const nextOpponentId = nextManagerMatch
    ? Number(nextManagerMatch.home_club_id) === managerClubId ? nextManagerMatch.away_club_id : nextManagerMatch.home_club_id
    : null;
  const nextOpponent = detail.clubs.find(club => String(club.id) === String(nextOpponentId));
  return <PageMotion>
    <BackLink to="/" label="All leagues" />
    <section className="league-masthead">
      <div className="masthead-meta"><span className="status-pill"><span className="live-dot" /> SEASON IN PLAY</span><span>{league.season_label}</span><span>{detail.clubs.length} CLUBS</span></div>
      <div className="league-title-row"><div><h1>{league.name}</h1><p>{league.season_label} league competition</p></div><div className="season-progress-ring"><strong>{progressPercent}<small>%</small></strong><span>COMPLETE</span></div></div>
      <div className="season-progress"><span style={{ width: `${Math.min(100, progressPercent)}%` }} /></div>
      <div className="progress-foot"><span>MATCHDAY {Math.max(1, Math.ceil(playedMatches / Math.max(1, detail.clubs.length / 2)) + 1)}</span><span>{playedMatches} / {totalMatches} MATCHES PLAYED</span></div>
    </section>
    <div className="league-toolbar"><nav className="league-tabs" aria-label="League sections">
      {tabs.map(([id, label]) => <Link key={id} to={`/leagues/${leagueId}/${id}`} className={`league-tab${currentTab === id ? ' is-active' : ''}`}>{label}</Link>)}
    </nav>
    <div className="simulation-actions">
      <button className="button button-secondary button-small" disabled={simulationBusy || !!matchPlayback} onClick={() => void runSimulation('next')}>{simulationBusy ? 'Simulating…' : managerClubId === null ? 'Simulate next' : 'Next matchday'} <span>▶</span></button>
      {managerClubId === null && <button className="button button-quiet button-small" disabled={simulationBusy || !!matchPlayback} onClick={() => void runSimulation('all')}>Simulate all</button>}
      <button className="button button-quiet button-small" disabled={simulationBusy || !!matchPlayback} onClick={() => void runSimulation('reset')}>Reset</button>
      {managerClubId === null && <button className="button button-quiet button-small" disabled={!!matchPlayback} onClick={() => { setPendingManagerClubId(null); setManagerPickerOpen(true); }}>Choose your team</button>}
    </div></div>
    {managerClubId !== null && managedClub && <section className="manager-panel" aria-label="Manager controls">
      <div className="manager-team">
        <ClubCrest club={managedClub} size="small" />
        <div><div className="eyebrow">YOUR TEAM</div><strong>{managedClub.name}</strong><small>Attack {managedClub.attack} · Defence {managedClub.defence}</small></div>
      </div>
      <div className="manager-streak">
        <span>SEASON AVG <strong>{managerState.matchesManaged ? managerState.averageRating.toFixed(1) : '—'}</strong></span>
        <span>🔥 {managerState.currentStreak} <small>Best: {managerState.bestStreak}</small></span>
      </div>
      {nextManagerMatch && nextOpponent && <div className="manager-next-match">
        <span>NEXT UP</span>
        <strong>{String(nextManagerMatch.home_club_id) === String(managedClub.id) ? 'vs' : '@'} {nextOpponent.name}</strong>
        <OpponentStrengthBadge yourClub={managedClub} opponent={nextOpponent} />
      </div>}
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
      <span>{managerMatch.tactics} · xG {managerMatch.expectedGoalsFor.toFixed(2)}–{managerMatch.expectedGoalsAgainst.toFixed(2)} · Rating {managerMatchRating(managerMatch).toFixed(1)}</span>
      <span className="manager-headline">{matchPlayback?.headline ?? (managerMatch.goalsFor === 0 && managerMatch.goalsAgainst === 0 ? 'A point apiece. Nobody fancied the goal.' : generateHeadline(managerMatch, detail.clubs))}</span>
    </div>}
    {managerBye !== null && <div className="manager-result" role="status">Your team had no fixture on matchday {managerBye}.</div>}
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
      <button type="button" className="button button-primary" disabled={pendingManagerClubId === null} onClick={startManaging}>Manage selected team <span aria-hidden="true">↗</span></button>
    </section>}
    {error && <ErrorNotice message={error} onRetry={() => { setError(''); setRefreshKey(k => k + 1); }} />}
    {loading ? <Loading label="Loading the latest scores" /> : <LeagueTab tab={currentTab} leagueId={leagueId} clubs={detail.clubs} standings={standings} matchday={Number(searchParams.get('matchday')) || 1} topZone={league.top_zone ?? 4} bottomZone={league.bottom_zone ?? 3} refreshKey={refreshKey} seasonComplete={playedMatches === totalMatches && totalMatches > 0} />}
    {matchPlayback && <MatchdayPlayback playback={matchPlayback} onClose={() => setMatchPlayback(null)} onFastForward={() => setMatchPlayback(current => current ? { ...current, minute: 90, complete: true } : null)} />}
  </PageMotion>;
}

function managerStorageKey(leagueId: number | string) {
  return `pitch:manager-club:${leagueId}`;
}

function managerTacticsStorageKey(leagueId: number | string) {
  return `pitch:manager-tactics:${leagueId}`;
}

function managerStateStorageKey(leagueId: number | string) {
  return `pitch:manager-state:${leagueId}`;
}

function readManagerState(leagueId: number | string): ManagerState {
  const stored = window.localStorage.getItem(managerStateStorageKey(leagueId));
  if (!stored) return emptyManagerState;
  const value: unknown = JSON.parse(stored);
  if (
    !value || typeof value !== 'object'
    || !('currentStreak' in value) || typeof value.currentStreak !== 'number' || !Number.isInteger(value.currentStreak) || value.currentStreak < 0
    || !('bestStreak' in value) || typeof value.bestStreak !== 'number' || !Number.isInteger(value.bestStreak) || value.bestStreak < value.currentStreak
    || !('averageRating' in value) || typeof value.averageRating !== 'number' || !Number.isFinite(value.averageRating)
    || !('matchesManaged' in value) || typeof value.matchesManaged !== 'number' || !Number.isInteger(value.matchesManaged) || value.matchesManaged < 0
  ) {
    throw new Error('The saved manager record is invalid. Reset the season to start a new record.');
  }
  return value as ManagerState;
}

function saveManagerState(leagueId: number | string, state: ManagerState) {
  window.localStorage.setItem(managerStateStorageKey(leagueId), JSON.stringify(state));
}

function readManagerClubId(leagueId: number | string): number | null {
  const stored = window.localStorage.getItem(managerStorageKey(leagueId));
  if (stored === null) return null;
  if (!/^[1-9]\d*$/.test(stored) || !Number.isSafeInteger(Number(stored))) {
    throw new Error('The saved manager team is invalid. Clear it and choose a team again.');
  }
  return Number(stored);
}

function readManagerSelection(leagueId: number | string): { clubId: number | null; tactics: Tactics; managerState: ManagerState; error: string } {
  try {
    const clubId = readManagerClubId(leagueId);
    const storedTactics = clubId === null ? null : window.localStorage.getItem(managerTacticsStorageKey(leagueId));
    if (storedTactics !== null && !isTactics(storedTactics)) {
      throw new Error('The saved tactics are invalid. Choose your tactics again.');
    }
    const managerState = readManagerState(leagueId);
    return { clubId, tactics: storedTactics ?? 'balanced', managerState, error: '' };
  } catch (err) {
    return { clubId: null, tactics: 'balanced', managerState: emptyManagerState, error: readableError(err) };
  }
}

function saveManagerClubId(leagueId: number | string, clubId: number) {
  saveManagerTactics(leagueId, 'balanced');
  window.localStorage.setItem(managerStorageKey(leagueId), String(clubId));
}

function saveManagerTactics(leagueId: number | string, tactics: Tactics) {
  window.localStorage.setItem(managerTacticsStorageKey(leagueId), tactics);
}

function clearManagerClubId(leagueId: number | string) {
  window.localStorage.removeItem(managerStorageKey(leagueId));
  window.localStorage.removeItem(managerTacticsStorageKey(leagueId));
  window.localStorage.removeItem(managerStateStorageKey(leagueId));
}

function isTactics(value: string): value is Tactics {
  return value === 'attacking' || value === 'balanced' || value === 'defensive';
}

function LeagueTab({ tab, leagueId, clubs, standings, matchday, topZone, bottomZone, refreshKey, seasonComplete }: { tab: string; leagueId: string; clubs: Club[]; standings: Standing[]; matchday: number; topZone: number; bottomZone: number; refreshKey: number; seasonComplete: boolean }) {
  if (tab === 'fixtures') return <FixturesTab key={refreshKey} leagueId={leagueId} initialMatchday={matchday} totalMatchdays={clubs.length % 2 === 0 ? 2 * (clubs.length - 1) : 2 * clubs.length} />;
  if (tab === 'match-centre') return <MatchCentreTab key={refreshKey} leagueId={leagueId} />;
  if (tab === 'scorers') return <ScorersTab key={refreshKey} leagueId={leagueId} />;
  if (tab === 'awards') return <AwardsTab key={refreshKey} leagueId={leagueId} seasonComplete={seasonComplete} />;
  return <TableTab standings={standings} topZone={topZone} bottomZone={bottomZone} />;
}

function OpponentStrengthBadge({ yourClub, opponent }: { yourClub: Club; opponent: Club }) {
  const yourRating = ((yourClub.attack ?? 0) + (yourClub.defence ?? 0)) / 2;
  const opponentRating = ((opponent.attack ?? 0) + (opponent.defence ?? 0)) / 2;
  const status = opponentRating < yourRating - 5 ? 'Underdog' : opponentRating > yourRating + 5 ? 'Tough test' : 'Even';
  return <span className={`opponent-strength opponent-strength--${status.toLowerCase().replace(' ', '-')}`}><i />{status}</span>;
}

type MatchEventType = 'goal' | 'yellow' | 'red' | 'foul';
type MatchEvent = {
  id: number | string;
  club_id: number | string;
  player_name: string;
  minute: number;
  eventType: MatchEventType;
  assist_player_name?: string | null;
};

function getMatchEvents(match: MatchDetail): MatchEvent[] {
  return [
    ...match.goals.map(goal => ({ ...goal, eventType: 'goal' as const })),
    ...match.yellow_cards.map(card => ({ ...card, eventType: 'yellow' as const })),
    ...match.red_cards.map(card => ({ ...card, eventType: 'red' as const })),
    ...match.fouls.map(foul => ({ ...foul, eventType: 'foul' as const })),
  ].sort((left, right) => left.minute - right.minute);
}

function eventLabel(event: MatchEvent): string {
  if (event.eventType === 'goal') return event.assist_player_name ? `GOAL · ASSIST: ${event.assist_player_name}` : 'GOAL · UNASSISTED';
  if (event.eventType === 'yellow') return 'YELLOW CARD';
  if (event.eventType === 'red') return 'RED CARD';
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
  )[0];
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
          <b>{event.minute}&apos;</b><span><strong>{event.player_name}</strong><small>{eventLabel(event)}</small></span><i>{event.eventType === 'goal' ? '⚽' : event.eventType === 'yellow' ? '🟨' : event.eventType === 'red' ? '🟥' : '⚑'}</i>
        </div>) : <p className="live-commentary">{minute < 20 ? 'The teams are feeling each other out. No clear chances yet.' : 'A cagey contest so far. The crowd is waiting for a breakthrough.'}</p>}
        {!complete && latestEvent && <p className="live-commentary">{latestEvent.eventType === 'goal' ? `GOAL! ${latestEvent.player_name}${latestEvent.assist_player_name ? ` finishes a move created by ${latestEvent.assist_player_name}` : ' finds the net'}.` : latestEvent.eventType === 'yellow' ? `${latestEvent.player_name} is booked.` : latestEvent.eventType === 'red' ? `${latestEvent.player_name} is sent off.` : `${latestEvent.player_name} gives away a foul.`}</p>}
      </div>
      {complete && <div className="live-fulltime">
        <p>{playback.headline}</p>
        {manOfTheMatch && <div className="live-motm"><img src="/matchday/motm.jpg" alt="" /><span><small>PLAYER OF THE MATCH</small><strong>{manOfTheMatch.player_name}</strong></span></div>}
        {homeStats && awayStats && <div className="live-fulltime-stats"><span>Shots <b>{homeStats.shots}–{awayStats.shots}</b></span><span>Corners <b>{homeStats.corners}–{awayStats.corners}</b></span><span>Saves <b>{homeStats.saves}–{awayStats.saves}</b></span></div>}
      </div>}
      <footer className="matchday-live-actions">
        {!complete && <button className="button button-quiet button-small" onClick={onFastForward}>Skip to full-time</button>}
        {complete && <button className="button button-primary button-small" onClick={onClose}>Close match report</button>}
      </footer>
    </section>
  </div>;
}

function SectionTitle({ kicker, title, detail }: { kicker: string; title: string; detail: string }) {
  return <div className="content-heading"><div><div className="eyebrow">{kicker}</div><h2>{title}</h2></div><p>{detail}</p></div>;
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

  return <section className="tab-panel"><SectionTitle kicker="LEAGUE TABLE" title="Standings" detail="Ranked by points, goal difference and goals scored." />
    <div className="legend"><span><i className="legend-top" />Top zone</span><span><i className="legend-bottom" />Bottom zone</span><span className="legend-right">P Played · GD Goal difference · Pts Points</span></div>
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

function FixturesTab({ leagueId, initialMatchday, totalMatchdays }: { leagueId: string; initialMatchday: number; totalMatchdays: number }) {
  const [matchday, setMatchday] = useState(initialMatchday);
  const [matches, setMatches] = useState<Match[]>([]);
  const [error, setError] = useState('');
  useEffect(() => { let cancelled = false; api.matches(leagueId, matchday).then(data => { if (!cancelled) { setMatches(data); setError(''); } }).catch(e => { if (!cancelled) setError(readableError(e)); }); return () => { cancelled = true; }; }, [leagueId, matchday]);
  return <section className="tab-panel"><div className="content-heading"><div><div className="eyebrow">THE ROAD TO GLORY</div><h2>Fixtures <span className="heading-count">/ MATCHDAY</span></h2></div><div className="matchday-stepper"><button type="button" aria-label="Previous matchday" disabled={matchday <= 1} onClick={() => setMatchday(day => Math.max(1, day - 1))}>‹</button><label className="matchday-select">MATCHDAY<select value={matchday} onChange={e => setMatchday(Number(e.target.value))}>{Array.from({ length: totalMatchdays }, (_, i) => <option key={i + 1} value={i + 1}>{String(i + 1).padStart(2, '0')}</option>)}</select></label><button type="button" aria-label="Next matchday" disabled={matchday >= totalMatchdays} onClick={() => setMatchday(day => Math.min(totalMatchdays, day + 1))}>›</button></div></div>
    {error && <ErrorNotice message={error} />}<MatchList matches={matches} leagueId={leagueId} />
  </section>;
}

function MatchList({ matches, leagueId }: { matches: Match[]; leagueId?: number | string }) {
  return matches.length ? <div className="match-list">{matches.map(match => <Link className="match-card" key={match.id} to={`/leagues/${leagueId || match.league_id || ''}/match-centre?match=${match.id}`}>
    <span className="match-kickoff">{match.played_at ? new Date(match.played_at).toLocaleDateString(undefined, { day: '2-digit', month: 'short' }) : `MD ${match.matchday}`}</span>
    <MatchTeam name={match.home_club_name} shortName={match.home_short_name} id={match.home_club_id} primary={match.home_colour_primary} secondary={match.home_colour_secondary} align="right" />
    <span className={`match-score${match.home_goals === null ? ' upcoming' : ''}`}>{match.home_goals ?? '–'} <i>:</i> {match.away_goals ?? '–'}</span>
    <MatchTeam name={match.away_club_name} shortName={match.away_short_name} id={match.away_club_id} primary={match.away_colour_primary} secondary={match.away_colour_secondary} />
    <span className="match-arrow">↗</span>
    {match.goal_events?.length ? <span className="match-event-summary">{match.goal_events.map((goal, index) => <span key={`${goal.minute}-${index}`}><strong>{goal.player_name} {goal.minute}&apos;</strong>{goal.assist_player_name ? ` · Assist: ${goal.assist_player_name}` : ' · Unassisted'}</span>)}</span> : null}
    {match.home_xg !== null && match.home_xg !== undefined ? <span className="match-stat-summary">xG {Number(match.home_xg).toFixed(2)} – {Number(match.away_xg).toFixed(2)} · YC {match.yellow_card_count ?? 0} · RC {match.red_card_count ?? 0}</span> : null}
  </Link>)}</div> : <EmptyPanel title="No fixtures in this round" text="Select another matchday or simulate to reveal what's next." />;
}

function MatchTeam({ name, shortName, id, primary, secondary, align = 'left' }: { name: string; shortName: string; id: number | string; primary: string; secondary: string; align?: 'left' | 'right' }) {
  const club = { id: id || name, name: name || 'Club', short_name: shortName || 'CLB', colour_primary: primary || '#4786b8', colour_secondary: secondary || '#f2d277' };
  return <span className={`match-team match-team--${align}`}>{align === 'left' && <ClubCrest club={club} size="small" />}<strong>{club.name}</strong>{align === 'right' && <ClubCrest club={club} size="small" />}</span>;
}

function MatchCentreTab({ leagueId }: { leagueId: string }) {
  const [searchParams] = useSearchParams();
  const requestedMatch = searchParams.get('match');
  const [matches, setMatches] = useState<Match[]>([]);
  const [selected, setSelected] = useState('');
  const [match, setMatch] = useState<MatchDetail | null>(null);
  const [error, setError] = useState('');
  useEffect(() => { api.matches(leagueId).then(data => { setMatches(data); setSelected(String(data.find(game => String(game.id) === requestedMatch)?.id ?? data[0]?.id ?? '')); }).catch(e => setError(readableError(e))); }, [leagueId, requestedMatch]);
  useEffect(() => { if (!selected) return; api.match(selected).then(setMatch).catch(e => setError(readableError(e))); }, [selected]);
  const homeGoals = match?.goals?.filter(goal => String(goal.club_id) === String(match.home_club_id)) ?? [];
  const awayGoals = match?.goals?.filter(goal => String(goal.club_id) === String(match.away_club_id)) ?? [];
  const homeEvents = [
    ...homeGoals.map(goal => ({ ...goal, eventType: 'goal' as const })),
    ...(match?.yellow_cards ?? []).filter(card => String(card.club_id) === String(match?.home_club_id)).map(card => ({ ...card, eventType: 'yellow' as const })),
    ...(match?.red_cards ?? []).filter(card => String(card.club_id) === String(match?.home_club_id)).map(card => ({ ...card, eventType: 'red' as const })),
    ...(match?.fouls ?? []).filter(foul => String(foul.club_id) === String(match?.home_club_id)).map(foul => ({ ...foul, eventType: 'foul' as const })),
  ].sort((left, right) => left.minute - right.minute);
  const awayEvents = [
    ...awayGoals.map(goal => ({ ...goal, eventType: 'goal' as const })),
    ...(match?.yellow_cards ?? []).filter(card => String(card.club_id) === String(match?.away_club_id)).map(card => ({ ...card, eventType: 'yellow' as const })),
    ...(match?.red_cards ?? []).filter(card => String(card.club_id) === String(match?.away_club_id)).map(card => ({ ...card, eventType: 'red' as const })),
    ...(match?.fouls ?? []).filter(foul => String(foul.club_id) === String(match?.away_club_id)).map(foul => ({ ...foul, eventType: 'foul' as const })),
  ].sort((left, right) => left.minute - right.minute);
  const teamStat = (clubId: number | string) => match?.team_stats?.find(stat => String(stat.club_id) === String(clubId));
  const homeStats = match ? teamStat(match.home_club_id) : undefined;
  const awayStats = match ? teamStat(match.away_club_id) : undefined;
  const manOfTheMatch = match ? getManOfTheMatch(match.player_stats) : undefined;
  return <section className="tab-panel"><SectionTitle kicker="UNDER THE LIGHTS" title="Match centre" detail="The moments that make the match." />
    {error && <ErrorNotice message={error} />}
    <label className="match-picker">CHOOSE A FIXTURE<select value={selected} onChange={e => setSelected(e.target.value)}>{matches.map(game => <option key={game.id} value={game.id}>{game.home_club_name} {game.home_goals ?? '–'} : {game.away_goals ?? '–'} {game.away_club_name}</option>)}</select></label>
    {match ? <div className="match-report">
      <div className="report-scoreboard"><span className="report-round">MATCHDAY {match.matchday}</span><div className="report-teams"><ReportTeam name={match.home_club_name} id={match.home_club_id} shortName={match.home_short_name} primary={match.home_colour_primary} secondary={match.home_colour_secondary} /><div className="report-score">{match.home_goals ?? '–'}<span>:</span>{match.away_goals ?? '–'}</div><ReportTeam name={match.away_club_name} id={match.away_club_id} shortName={match.away_short_name} primary={match.away_colour_primary} secondary={match.away_colour_secondary} /></div><span className="report-date">{match.played_at ? new Date(match.played_at).toLocaleString() : 'KICK-OFF PENDING'}</span></div>
      {manOfTheMatch && <div className="report-motm"><img src="/matchday/motm.jpg" alt="" /><span><small>MAN OF THE MATCH</small><strong>{manOfTheMatch.player_name}</strong><em>{manOfTheMatch.goals} goals · {manOfTheMatch.assists} assists · {manOfTheMatch.key_passes} key passes</em></span></div>}
      <div className="timeline"><div className="timeline-column">{homeEvents.map(event => <div className={`goal-event goal-event--${event.eventType}`} key={`${event.eventType}-${event.id}`}><b>{event.minute}&apos;</b><span><strong>{event.player_name}</strong><small>{event.eventType === 'goal' ? `GOAL${event.assist_player_name ? ` · ASSIST: ${event.assist_player_name}` : ' · UNASSISTED'}` : event.eventType === 'yellow' ? 'YELLOW CARD' : event.eventType === 'red' ? 'RED CARD' : 'FOUL'}</small></span></div>)}</div><div className="timeline-line"><span>0&apos;</span><i /><span>90&apos;</span></div><div className="timeline-column timeline-column--right">{awayEvents.map(event => <div className={`goal-event goal-event--${event.eventType}`} key={`${event.eventType}-${event.id}`}><b>{event.minute}&apos;</b><span><strong>{event.player_name}</strong><small>{event.eventType === 'goal' ? `GOAL${event.assist_player_name ? ` · ASSIST: ${event.assist_player_name}` : ' · UNASSISTED'}` : event.eventType === 'yellow' ? 'YELLOW CARD' : event.eventType === 'red' ? 'RED CARD' : 'FOUL'}</small></span></div>)}</div></div>
      {!match.goals?.length && !match.yellow_cards?.length && !match.red_cards?.length && !match.fouls?.length && <p className="no-goals">No match events recorded for this fixture.</p>}
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
    </div> : <EmptyPanel title="Pick a match to relive" text="Choose any fixture to see the score and goal timeline." />}
  </section>;
}

function ReportTeam({ name, id, shortName, primary, secondary }: { name: string; id: number | string; shortName: string; primary: string; secondary: string }) {
  return <div className="report-team"><ClubCrest club={{ id, name, short_name: shortName, colour_primary: primary, colour_secondary: secondary }} size="large" /><strong>{name}</strong></div>;
}

function ScorersTab({ leagueId }: { leagueId: string }) {
  const [players, setPlayers] = useState<PlayerStat[]>([]);
  const [error, setError] = useState('');
  useEffect(() => { api.playerStats(leagueId).then(setPlayers).catch(e => setError(readableError(e))); }, [leagueId]);
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
  return <section className="tab-panel"><SectionTitle kicker="LEAGUE LEADERS" title="Player statistics" detail="Season totals for attacking output, passing and discipline." />
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

function AwardsTab({ leagueId, seasonComplete }: { leagueId: string; seasonComplete: boolean }) {
  const [players, setPlayers] = useState<PlayerStat[]>([]);
  const [error, setError] = useState('');
  useEffect(() => {
    let cancelled = false;
    api.playerStats(leagueId)
      .then(data => { if (!cancelled) setPlayers(data); })
      .catch(err => { if (!cancelled) setError(readableError(err)); });
    return () => { cancelled = true; };
  }, [leagueId]);

  const rankedPlayers = [...players].sort((a, b) =>
    seasonPlayerScore(b) - seasonPlayerScore(a)
    || b.goals - a.goals
    || b.assists - a.assists
    || a.player_name.localeCompare(b.player_name),
  );
  const teamOfTheSeason = rankedPlayers.slice(0, 11);
  const playerOfTheYear = rankedPlayers[0];
  return <section className="tab-panel"><SectionTitle kicker={seasonComplete ? 'SEASON HONOURS' : 'THE AWARDS RACE'} title="Season awards" detail="Form and contribution decide the honours." />
    {error && <ErrorNotice message={error} />}
    {playerOfTheYear && <section className="poty-card"><img src="/matchday/motm.jpg" alt="" /><div><div className="eyebrow">{seasonComplete ? 'PLAYER OF THE YEAR' : 'CURRENT PLAYER OF THE YEAR LEADER'}</div><h3>{playerOfTheYear.player_name}</h3><p>{playerOfTheYear.club_name} · {playerOfTheYear.goals} goals · {playerOfTheYear.assists} assists</p></div><strong>{seasonPlayerScore(playerOfTheYear).toFixed(1)}<small> IMPACT</small></strong></section>}
    <section className="team-of-season"><div className="team-of-season-heading"><div><div className="eyebrow">{seasonComplete ? 'THE XI' : 'PROVISIONAL XI'}</div><h3>Team of the season</h3></div><span>{teamOfTheSeason.length} / 11</span></div>
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

function BackLink({ to, label }: { to: string; label: string }) { return <Link className="back-link" to={to}><span>←</span> {label}</Link>; }
function ErrorNotice({ message, onRetry }: { message: string; onRetry?: () => void }) { return <div className="error-notice" role="alert"><span>!</span><div><strong>We hit a snag.</strong><p>{message}</p></div>{onRetry && <button onClick={onRetry}>Try again ↻</button>}</div>; }
function Loading({ label }: { label: string }) { return <div className="loading-state"><span className="loading-spinner" /><p>{label}…</p></div>; }
function EmptyPanel({ title, text }: { title: string; text: string }) { return <div className="empty-panel"><span>✳</span><h3>{title}</h3><p>{text}</p></div>; }
function NotFound() { return <PageMotion className="empty-state"><div className="empty-icon">404</div><h2>That page isn't in this fixture.</h2><Link to="/" className="button button-secondary">Back to leagues ↗</Link></PageMotion>; }

export default App;
