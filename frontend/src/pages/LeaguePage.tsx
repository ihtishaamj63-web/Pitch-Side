import { useEffect, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { api, readableError } from '../api';
import { ClubCrest } from '../Crest';
import { BackLink, ErrorNotice, Loading, PageMotion } from '../components/common';
import { clearManagerClubId, isTactics, readManagerSelection, saveManagerClubId, saveManagerTactics } from '../features/manager/storage';
import { LeagueTab } from '../features/league/LeagueTab';
import { totalMatchdays as getTotalMatchdays } from '../lib/match';
import type { LiveLeagueState } from '../features/live/useLiveLeague';
import type { LeagueDetail, Standing, Tactics } from '../types';

const tabs = [
  ['table', 'Table'],
  ['fixtures', 'Fixtures'],
  ['live', 'Live'],
  ['match-centre', 'Match centre'],
  ['stats', 'Player statistics'],
  ['awards', 'Awards'],
] as const;
export function LeaguePage({ liveState }: { liveState: LiveLeagueState }) {
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
  const [simulationBusy, setSimulationBusy] = useState(false);
  const wasLive = useRef(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([api.league(leagueId), api.table(leagueId, selectedMatchday)])
      .then(([league, table]) => {
        if (cancelled) return;
        if (savedManager.clubId !== null && !league.clubs.some(club => Number(club.id) === savedManager.clubId)) {
          clearManagerClubId(leagueId);
          setManagerClubId(null);
          const message = 'Your saved team is no longer in this league. Choose a team to manage again.';
          setError(message);
        }
        setDetail(league);
        setStandings(table);
      })
      .catch(err => { if (!cancelled) setError(readableError(err)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [leagueId, refreshKey, savedManager, selectedMatchday]);

  useEffect(() => {
    if (liveState.matches.length) wasLive.current = true;
    else if (wasLive.current) {
      wasLive.current = false;
      setRefreshKey(key => key + 1);
    }
  }, [liveState.matches.length]);

  const runSimulation = async (action: 'next' | 'all' | 'reset') => {
    if (simulationBusy) return;
    setSimulationBusy(true);
    try {
      if (action === 'reset') {
        await api.resetLeague(leagueId);
        setSearchParams({ matchday: '1' }, { replace: true });
        window.location.reload();
        return;
      } else if (action === 'next') {
        const nextMatchday = Math.min(totalMatchdays, Math.floor(playedMatches / Math.max(1, (detail?.clubs.length ?? 2) / 2)) + 1);
        const result = await api.kickoffMatchday(leagueId, nextMatchday, 'quick', managerClubId === null ? undefined : { clubId: managerClubId, tactics: managerTactics });
        setSearchParams({ matchday: String(result.matchday) }, { replace: true });
        if (managerClubId !== null) window.location.href = `/leagues/${leagueId}/match-centre?matchday=${result.matchday}`;
      } else {
        await api.simulate(leagueId, action);
        if (action === 'all') {
          setSearchParams({ matchday: String(getTotalMatchdays(detail?.clubs.length ?? 2)) }, { replace: true });
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
      setError('');
    } catch (err) {
      setError(readableError(err));
    }
  };

  const stopManaging = () => {
    try {
      clearManagerClubId(leagueId);
      setManagerClubId(null);
    } catch (err) {
      setError(readableError(err));
    }
  };

  if (loading && !detail) return <Loading label="Setting up the stadium" />;
  if (!detail) return <PageMotion><BackLink to="/" label="All leagues" /><ErrorNotice message={error || 'League not found.'} onRetry={() => setRefreshKey(k => k + 1)} /></PageMotion>;
  const league = detail.league;
  const playedMatches = detail.progress.played_matches ?? league.played_matches ?? 0;
  const totalMatches = detail.progress.total_matches ?? league.total_matches ?? 0;
  const progressPercent = totalMatches ? Math.round(playedMatches / totalMatches * 100) : 0;
  const totalMatchdays = getTotalMatchdays(detail.clubs.length);
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
      {seasonComplete
        ? <Link className="button button-secondary button-small" to={`/leagues/${leagueId}/awards?matchday=${totalMatchdays}`}>End season <span aria-hidden="true">🏆</span></Link>
        : <button className="button button-secondary button-small" disabled={simulationBusy || liveState.matches.length > 0} onClick={() => void runSimulation('next')}>{simulationBusy ? 'Starting…' : liveState.matches.length ? 'Matchday live' : 'Kick off matchday'}</button>}
      {!seasonComplete && <button className="button button-quiet button-small" disabled={simulationBusy || liveState.matches.length > 0} onClick={() => void runSimulation('all')}>Simulate season instantly</button>}
      <button className="button button-quiet button-small" disabled={simulationBusy} onClick={() => void runSimulation('reset')}>Reset</button>
      {managerClubId === null && <button className="button button-quiet button-small" onClick={() => { setPendingManagerClubId(null); setManagerPickerOpen(true); }}>Choose your team</button>}
    </div></div>
    {currentTab === 'table' && managerClubId !== null && managedClub && <section className="manager-panel" aria-label="Manager controls">
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
    {loading ? <Loading label="Loading the latest scores" /> : <LeagueTab tab={currentTab} leagueId={leagueId} clubs={detail.clubs} standings={standings} matchday={selectedMatchday} onMatchdayChange={matchday => setSearchParams({ matchday: String(matchday) })} managerClubId={managerClubId} topZone={league.top_zone ?? 4} bottomZone={league.bottom_zone ?? 3} refreshKey={refreshKey} seasonComplete={seasonComplete} liveState={liveState} />}
  </PageMotion>;
}

