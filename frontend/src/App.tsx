import { useEffect, useRef, useState } from 'react';
import { BrowserRouter, Link, Route, Routes, useLocation } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import { PageMotion } from './components/common';
import { readManagerSelection } from './features/manager/storage';
import { useLiveLeague, type LiveLeagueState } from './features/live/useLiveLeague';
import { CreateLeague } from './pages/CreateLeaguePage';
import { ClubPage } from './pages/ClubPage';
import { LeagueHome } from './pages/HomePage';
import { LeaguePage } from './pages/LeaguePage';
import { MatchPage } from './pages/MatchPage';
import './App.css';

const footerUrl = import.meta.env.VITE_PORTFOLIO_URL;
type NotificationPreference = 'all' | 'followed' | 'goals';
interface LiveNotice { id: string; text: string; createdAt: string; read: boolean }
function App() {
  return <BrowserRouter><AppContent /></BrowserRouter>;
}

function AppContent() {
  const location = useLocation();
  const leagueId = location.pathname.match(/^\/leagues\/([^/]+)/)?.[1]
    ?? new URLSearchParams(location.search).get('league')
    ?? undefined;
  const [managerClubId, setManagerClubId] = useState<number | null>(() => leagueId ? readManagerSelection(leagueId).clubId : null);
  const liveState = useLiveLeague(leagueId ?? '');
  const [notices, setNotices] = useState<LiveNotice[]>([]);
  const [notificationPreference, setNotificationPreference] = useState<NotificationPreference>('all');
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const seenNotifications = useRef(new Set<string>());

  useEffect(() => {
    seenNotifications.current = new Set();
    if (!leagueId) { window.setTimeout(() => setNotices([]), 0); return; }
    try {
      const saved = JSON.parse(localStorage.getItem(`pitch:live-notices:${leagueId}`) ?? '[]') as LiveNotice[];
      window.setTimeout(() => setNotices(saved), 0);
      saved.forEach(notice => seenNotifications.current.add(notice.id));
      const preference = localStorage.getItem(`pitch:live-preference:${leagueId}`);
      if (preference === 'all' || preference === 'followed' || preference === 'goals') window.setTimeout(() => setNotificationPreference(preference), 0);
    } catch { window.setTimeout(() => setNotices([]), 0); }
  }, [leagueId]);

  useEffect(() => {
    if (!leagueId || !liveState.recentEvents.length) return;
    const created: LiveNotice[] = [];
    for (const item of liveState.recentEvents) {
      const event = item.event;
      const id = `${leagueId}:${item.matchId}:${event.seq}`;
      if (seenNotifications.current.has(id)) continue;
      seenNotifications.current.add(id);
      const keyEvent = ['goal', 'red', 'yellow', 'half_time', 'full_time'].includes(event.type);
      const followedMatch = liveState.matches.find(match => String(match.id) === String(item.matchId));
      const involvesFollowed = managerClubId !== null && followedMatch
        && [followedMatch.home_club_id, followedMatch.away_club_id].some(clubId => Number(clubId) === managerClubId);
      if (!keyEvent || (notificationPreference === 'goals' && event.type !== 'goal')
        || (notificationPreference === 'followed' && !involvesFollowed)) continue;
      const moment = event.type === 'goal' ? `GOAL — ${event.player_name ?? 'Scorer'} (${item.homeName} v ${item.awayName})`
        : event.type === 'red' ? `RED CARD — ${event.player_name ?? 'Player'} (${item.homeName} v ${item.awayName})`
          : event.type === 'yellow' ? `Yellow card — ${event.player_name ?? 'Player'} (${item.homeName} v ${item.awayName})`
            : event.type === 'half_time' ? `Half-time — ${item.homeName} v ${item.awayName}`
              : `Full-time — ${item.homeName} v ${item.awayName}`;
      created.push({ id, text: moment, createdAt: new Date().toISOString(), read: false });
    }
    if (created.length) queueMicrotask(() => setNotices(current => {
      const updated = [...created.reverse(), ...current].slice(0, 30);
      try { localStorage.setItem(`pitch:live-notices:${leagueId}`, JSON.stringify(updated)); } catch { /* Keep live alerts if storage is unavailable. */ }
      return updated;
    }));
  }, [leagueId, liveState.recentEvents, liveState.matches, managerClubId, notificationPreference]);

  useEffect(() => {
    if (!leagueId) return;
    try { localStorage.setItem(`pitch:live-notices:${leagueId}`, JSON.stringify(notices)); } catch { /* History remains available for this session. */ }
  }, [leagueId, notices]);
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
          <LiveBar leagueId={leagueId} managerClubId={managerClubId} liveState={liveState} notices={notices} open={notificationsOpen}
            onToggle={() => { const next = !notificationsOpen; setNotificationsOpen(next); if (next) setNotices(current => current.map(notice => ({ ...notice, read: true }))); }}
            preference={notificationPreference} onPreference={value => {
              setNotificationPreference(value);
              if (leagueId) localStorage.setItem(`pitch:live-preference:${leagueId}`, value);
            }} />
        </header>
        <main className="main-content">
          <AnimatePresence mode="wait" initial={false}>
          <Routes location={location} key={location.pathname}>
            <Route path="/" element={<LeagueHome />} />
            <Route path="/leagues/new" element={<CreateLeague />} />
            <Route path="/leagues/:leagueId" element={<LeaguePage liveState={liveState} />} />
            <Route path="/leagues/:leagueId/:tab" element={<LeaguePage liveState={liveState} />} />
            <Route path="/matches/:matchId" element={<MatchPage />} />
            <Route path="/clubs/:clubId" element={<ClubPage />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
          </AnimatePresence>
        </main>
        <footer className="footer"><span>Built by {footerUrl ? <a href={footerUrl} target="_blank" rel="noreferrer">Ihtishaam</a> : 'Ihtishaam'}</span></footer>
      </div>
  );
}

function LiveBar({ leagueId, managerClubId, liveState, notices, open, onToggle, preference, onPreference }: {
  leagueId?: string; managerClubId: number | null; liveState: LiveLeagueState; notices: LiveNotice[]; open: boolean;
  onToggle: () => void; preference: NotificationPreference; onPreference: (preference: NotificationPreference) => void;
}) {
  if (!leagueId) return null;
  const followed = liveState.matches.find(match => managerClubId !== null && [match.home_club_id, match.away_club_id].some(id => Number(id) === managerClubId)) ?? liveState.matches[0];
  const unread = notices.filter(notice => !notice.read).length;
  return <div className="topbar-live-tools">
    {liveState.matches.length > 0 && <Link className="topbar-live-link" to={`/leagues/${leagueId}/live`} aria-label={`Live matchday ${liveState.matchday}`}>
      <span className="topbar-live-dot" />LIVE
      {followed && <strong>{followed.home_short_name} {followed.home_goals ?? 0}–{followed.away_goals ?? 0} {followed.away_short_name} <small>{followed.minute ?? 0}{followed.minute_extra ? `+${followed.minute_extra}` : ''}&apos;</small></strong>}
    </Link>}
    <button className="notification-bell" type="button" aria-label={`Notifications, ${unread} unread`} aria-expanded={open} onClick={onToggle}>♢{unread > 0 && <span>{unread}</span>}</button>
    {open && <section className="notification-panel" aria-label="Round notifications">
      <header><strong>Match alerts</strong><label>Alerts <select value={preference} onChange={event => onPreference(event.target.value as NotificationPreference)}><option value="all">All matches</option><option value="followed">Followed team</option><option value="goals">Goals only</option></select></label></header>
      <div className="notification-list" aria-live="polite">{notices.length ? notices.map(notice => <p key={notice.id} className={notice.read ? '' : 'is-unread'}>{notice.text}</p>) : <p>No match events yet.</p>}</div>
      {liveState.matches.length > 0 && <Link to={`/leagues/${leagueId}/live`} onClick={onToggle}>Open live hub</Link>}
    </section>}
  </div>;
}
function NotFound() { return <PageMotion className="empty-state"><h2>That page isn't in this fixture.</h2><Link to="/" className="button button-secondary">Back to leagues</Link></PageMotion>; }

export default App;
