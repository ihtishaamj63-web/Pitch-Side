import { useCallback } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api';
import { ClubCrest } from '../Crest';
import { BackLink, ErrorNotice, Loading, PageMotion } from '../components/common';
import { MatchList } from '../features/league/LeagueTab';
import { useApi } from '../features/api/useApi';
export function ClubPage() {
  const { clubId = '' } = useParams();
  const loadClub = useCallback(() => api.club(clubId), [clubId]);
  const { data, error, loading } = useApi(`club:${clubId}`, loadClub);
  if (!data) return <PageMotion><BackLink to="/" label="Back" />{error ? <ErrorNotice message={error} /> : <Loading label={loading ? 'Opening the club house' : 'Club not found'} />}</PageMotion>;
  const completed = data.fixtures.filter(match => match.status === 'finished');
  const record = completed.reduce((totals, match) => {
    const home = String(match.home_club_id) === String(data.club.id);
    const goalsFor = Number(home ? match.home_goals : match.away_goals);
    const goalsAgainst = Number(home ? match.away_goals : match.home_goals);
    if (goalsFor > goalsAgainst) totals.wins += 1;
    else if (goalsFor === goalsAgainst) totals.draws += 1;
    else totals.losses += 1;
    return totals;
  }, { wins: 0, draws: 0, losses: 0 });
  const nextFixture = data.fixtures.find(match => match.status === 'live') ?? data.fixtures.find(match => match.status === 'scheduled');
  const nextOpponentId = nextFixture && String(nextFixture.home_club_id) === String(data.club.id) ? nextFixture.away_club_id : nextFixture?.home_club_id;
  const headToHead = nextOpponentId ? completed.filter(match =>
    [String(match.home_club_id), String(match.away_club_id)].includes(String(nextOpponentId)),
  ).slice(-5) : [];
  const recent = completed.slice(-5).reverse();
  return <PageMotion><BackLink to={`/leagues/${data.league.id}`} label={data.league.name} />
    <section className="club-profile"><div className="club-profile-art"><div className="profile-halo" /><ClubCrest club={data.club} size="large" /><span>CLUB PROFILE / {data.league.season_label}</span></div><div className="club-profile-info"><div className="eyebrow">THE HOME SIDE</div><h1>{data.club.name}</h1><p>{data.league.name} <span>·</span> {data.league.season_label}</p><div className="club-facts"><div><span>SEASON RECORD</span><strong>{record.wins}W · {record.draws}D · {record.losses}L</strong></div><div><span>SQUAD SIZE</span><strong>{data.squad.length}</strong></div></div></div></section>
    <section className="club-detail-grid">
      <div className="club-box"><div className="eyebrow">THE SQUAD</div><h2>Players <span className="heading-count">{data.squad.length.toString().padStart(2, '0')}</span></h2>{data.squad.map(player => <Link className="squad-row squad-player-link" to={`/players/${player.id}`} key={player.id}><span className="player-mark">{player.name.split(' ').map(w => w[0]).join('').slice(0, 2)}</span><strong>{player.name}</strong><span>{player.position || 'PLAYER'}</span>{player.goals !== undefined && <b>{player.goals} <small>G</small></b>}</Link>)}</div>
      <div className="club-box club-results-box"><div className="eyebrow">FIXTURES & RESULTS</div><h2>Next fixture</h2>{nextFixture ? <MatchList matches={[nextFixture]} leagueId={data.league.id} /> : <p>The season is complete.</p>}<h3>Recent results</h3><MatchList matches={recent} leagueId={data.league.id} />{nextOpponentId && <><h3>Head to head</h3><MatchList matches={headToHead} leagueId={data.league.id} /></>}</div>
    </section>
  </PageMotion>;
}

