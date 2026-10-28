import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, readableError } from '../api';
import { ClubCrest } from '../Crest';
import { BackLink, ErrorNotice, PageMotion } from '../components/common';
import type { Club } from '../types';
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

export function CreateLeague() {
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

