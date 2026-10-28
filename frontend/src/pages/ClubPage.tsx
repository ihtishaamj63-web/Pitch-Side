import { useCallback } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api';
import { ClubCrest } from '../Crest';
import { BackLink, ErrorNotice, Loading, PageMotion } from '../components/common';
import { FormDots, MatchList } from '../features/league/LeagueTab';
import { useApi } from '../features/api/useApi';
export function ClubPage() {
  const { clubId = '' } = useParams();
  const loadClub = useCallback(() => api.club(clubId), [clubId]);
  const { data, error, loading } = useApi(`club:${clubId}`, loadClub);
  if (!data) return <PageMotion><BackLink to="/" label="Back" />{error ? <ErrorNotice message={error} /> : <Loading label={loading ? 'Opening the club house' : 'Club not found'} />}</PageMotion>;
  const form = Array.isArray(data.form) ? data.form.join('') : data.form;
  return <PageMotion><BackLink to={`/leagues/${data.league.id}`} label={data.league.name} />
    <section className="club-profile"><div className="club-profile-art"><div className="profile-halo" /><ClubCrest club={data.club} size="large" /><span>CLUB PROFILE / {data.league.season_label}</span></div><div className="club-profile-info"><div className="eyebrow">THE HOME SIDE</div><h1>{data.club.name}</h1><p>{data.league.name} <span>·</span> {data.league.season_label}</p><div className="club-facts"><div><span>CLUB FORM</span><FormDots form={form} /></div><div><span>SQUAD SIZE</span><strong>{data.squad.length}</strong></div></div></div></section>
    <section className="club-detail-grid"><div className="club-box"><div className="eyebrow">THE SQUAD</div><h2>Players <span className="heading-count">{data.squad.length.toString().padStart(2, '0')}</span></h2>{data.squad.map(player => <Link className="squad-row squad-player-link" to={`/players/${player.id}`} key={player.id}><span className="player-mark">{player.name.split(' ').map(w => w[0]).join('').slice(0, 2)}</span><strong>{player.name}</strong><span>{player.position || 'PLAYER'}</span>{player.goals !== undefined && <b>{player.goals} <small>G</small></b>}</Link>)}</div><div className="club-box"><div className="eyebrow">NEXT UP</div><h2>Fixtures</h2><MatchList matches={data.fixtures} leagueId={data.league.id} /></div></section>
  </PageMotion>;
}

