import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { BrowserRouter, Link, Route, Routes, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { api, readableError } from './api';
import { ClubCrest } from './Crest';
import type { Club, ClubDetail, LeagueDetail, LeagueSummary, Match, MatchDetail, PlayerStat, Standing } from './types';
import './App.css';

const footerUrl = import.meta.env.VITE_PORTFOLIO_URL;
const tabs = [
  ['table', 'Table'],
  ['fixtures', 'Fixtures'],
  ['match-centre', 'Match centre'],
  ['scorers', 'League leaders'],
] as const;

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
  const [detail, setDetail] = useState<LeagueDetail | null>(null);
  const [standings, setStandings] = useState<Standing[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    Promise.all([api.league(leagueId), api.table(leagueId)])
      .then(([league, table]) => { if (!cancelled) { setDetail(league); setStandings(table); setError(''); } })
      .catch(err => { if (!cancelled) setError(readableError(err)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [leagueId, refreshKey]);

  const runSimulation = async (action: 'next' | 'all' | 'reset') => {
    try {
      if (action === 'reset') await api.resetLeague(leagueId);
      else await api.simulate(leagueId, action);
      setRefreshKey(key => key + 1);
    } catch (err) { setError(readableError(err)); }
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
    <div className="simulation-actions"><button className="button button-secondary button-small" onClick={() => void runSimulation('next')}>Simulate next <span>▶</span></button><button className="button button-quiet button-small" onClick={() => void runSimulation('all')}>Simulate all</button><button className="button button-quiet button-small" onClick={() => void runSimulation('reset')}>Reset</button></div></div>
    {error && <ErrorNotice message={error} onRetry={() => { setError(''); setRefreshKey(k => k + 1); }} />}
    {loading ? <Loading label="Loading the latest scores" /> : <LeagueTab tab={currentTab} leagueId={leagueId} clubs={detail.clubs} standings={standings} matchday={Number(searchParams.get('matchday')) || 1} topZone={league.top_zone ?? 4} bottomZone={league.bottom_zone ?? 3} refreshKey={refreshKey} />}
  </PageMotion>;
}

function LeagueTab({ tab, leagueId, clubs, standings, matchday, topZone, bottomZone, refreshKey }: { tab: string; leagueId: string; clubs: Club[]; standings: Standing[]; matchday: number; topZone: number; bottomZone: number; refreshKey: number }) {
  if (tab === 'fixtures') return <FixturesTab key={refreshKey} leagueId={leagueId} initialMatchday={matchday} totalMatchdays={clubs.length % 2 === 0 ? 2 * (clubs.length - 1) : 2 * clubs.length} />;
  if (tab === 'match-centre') return <MatchCentreTab key={refreshKey} leagueId={leagueId} />;
  if (tab === 'scorers') return <ScorersTab key={refreshKey} leagueId={leagueId} />;
  return <TableTab standings={standings} topZone={topZone} bottomZone={bottomZone} />;
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
          <td className="position-cell"><span>{row.position || index + 1}</span></td><td><Link className="table-club" to={`/clubs/${clubId}`}><ClubCrest club={club} size="small" /><strong>{club.name}</strong><span className="club-code">{club.short_name}</span></Link></td>
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
  return <section className="tab-panel"><SectionTitle kicker="UNDER THE LIGHTS" title="Match centre" detail="The moments that make the match." />
    {error && <ErrorNotice message={error} />}
    <label className="match-picker">CHOOSE A FIXTURE<select value={selected} onChange={e => setSelected(e.target.value)}>{matches.map(game => <option key={game.id} value={game.id}>{game.home_club_name} {game.home_goals ?? '–'} : {game.away_goals ?? '–'} {game.away_club_name}</option>)}</select></label>
    {match ? <div className="match-report">
      <div className="report-scoreboard"><span className="report-round">MATCHDAY {match.matchday}</span><div className="report-teams"><ReportTeam name={match.home_club_name} id={match.home_club_id} shortName={match.home_short_name} primary={match.home_colour_primary} secondary={match.home_colour_secondary} /><div className="report-score">{match.home_goals ?? '–'}<span>:</span>{match.away_goals ?? '–'}</div><ReportTeam name={match.away_club_name} id={match.away_club_id} shortName={match.away_short_name} primary={match.away_colour_primary} secondary={match.away_colour_secondary} /></div><span className="report-date">{match.played_at ? new Date(match.played_at).toLocaleString() : 'KICK-OFF PENDING'}</span></div>
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
