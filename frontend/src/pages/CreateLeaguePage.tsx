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
  const usedCodes = new Set<string>();
  const clubs: Array<Omit<Club, 'id'> & { attack: number; defence: number }> = [];
  while (clubs.length < count) {
    const first = nameFirst[Math.floor(Math.random() * nameFirst.length)] ?? 'Aster';
    const second = nameSecond[Math.floor(Math.random() * nameSecond.length)] ?? 'Rovers';
    const name = `${first} ${second}`;
    if (used.has(name)) continue;
    used.add(name);
    const colors = palette[clubs.length % palette.length] ?? ['#f06d55', '#f7cb72'];
    const code = shortCode(name, usedCodes);
    usedCodes.add(code);
    clubs.push({ name, short_name: code, colour_primary: colors[0], colour_secondary: colors[1], attack: 45 + Math.floor(Math.random() * 46), defence: 45 + Math.floor(Math.random() * 46) });
  }
  return clubs;
}

function shortCode(name: string, used: Set<string>) {
  const words = name.toLocaleUpperCase().replace(/[^A-Z ]/g, '').split(/\s+/).filter(Boolean);
  const first = words[0] ?? 'CLUB';
  const second = words[1] ?? first;
  const candidates = [
    `${first[0]}${second.slice(0, 2)}`,
    `${first.slice(0, 2)}${second[0]}`,
    `${first[0]}${second[0]}${second[1] ?? first[1]}`,
    `${first.slice(0, 3)}`,
  ];
  const candidate = candidates.find(code => code.length === 3 && !used.has(code));
  if (candidate) return candidate;
  const letters = `${first}${second}`;
  for (let offset = 0; offset < letters.length; offset += 1) {
    const code = `${letters[offset]}${letters[(offset + 3) % letters.length]}${letters[(offset + 6) % letters.length]}`;
    if (/^[A-Z]{3}$/.test(code) && !used.has(code)) return code;
  }
  throw new Error('Could not make a unique club code.');
}

export function CreateLeague() {
  const navigate = useNavigate();
  const [clubs, setClubs] = useState(() => inventClubs(10));
  const [name, setName] = useState('');
  const [season, setSeason] = useState('2026/27');
  const [seasonStartDate, setSeasonStartDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [matchdayCadence, setMatchdayCadence] = useState(7);
  const [clubCount, setClubCount] = useState(10);
  const [topZone, setTopZone] = useState(4);
  const [bottomZone, setBottomZone] = useState(3);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const regenerate = (count: number) => { setClubCount(count); setClubs(inventClubs(count)); setTopZone(Math.min(topZone, Math.floor(count / 2))); setBottomZone(Math.min(bottomZone, Math.floor(count / 2))); };
  const editClub = (index: number, changes: Partial<typeof clubs[number]>) => setClubs(current => current.map((club, clubIndex) => {
    if (clubIndex !== index) return club;
    const updated = { ...club, ...changes };
    if (changes.name !== undefined) {
      const used = new Set(current.filter((_, i) => i !== index).map(item => item.short_name));
      updated.short_name = shortCode(updated.name, used);
    }
    return updated;
  }));
  const rerollClub = (index: number) => {
    const replacement = inventClubs(1)[0];
    if (!replacement) return;
    const existingNames = new Set(clubs.filter((_, i) => i !== index).map(club => club.name));
    const existingCodes = new Set(clubs.filter((_, i) => i !== index).map(club => club.short_name));
    let candidate = replacement;
    while (existingNames.has(candidate.name)) candidate = inventClubs(1)[0] ?? candidate;
    candidate.short_name = shortCode(candidate.name, existingCodes);
    editClub(index, candidate);
  };
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setError('');
    try {
      const created = await api.createLeague({ name, season_label: season, season_start_date: seasonStartDate, matchday_cadence_days: matchdayCadence, points_win: 3, points_draw: 1, top_zone: topZone, bottom_zone: bottomZone, clubs });
      navigate(`/leagues/${created.id}`);
    } catch (err) { setError(readableError(err)); }
    finally { setBusy(false); }
  }

  return <PageMotion className="narrow-page">
    <BackLink to="/" label="All leagues" />
    <h1 className="page-title">Create your <em>league.</em></h1>
    <form className="form-panel" onSubmit={submit}>
      <div className="form-section"><div className="form-section-title"><span>01</span><div><h2>League identity</h2><p>Set the scene for your new season.</p></div></div>
        <div className="form-grid"><label>LEAGUE NAME<input required maxLength={48} placeholder="e.g. The Night Division" value={name} onChange={e => setName(e.target.value)} /></label><label>SEASON LABEL<input required maxLength={20} value={season} onChange={e => setSeason(e.target.value)} /></label><label>SEASON START<input type="date" required value={seasonStartDate} onChange={e => setSeasonStartDate(e.target.value)} /></label><label>MATCHDAY CADENCE<select value={matchdayCadence} onChange={e => setMatchdayCadence(Number(e.target.value))}><option value={7}>Every week</option><option value={3}>Every 3 days</option><option value={14}>Every 2 weeks</option></select></label></div>
      </div>
      <div className="form-section"><div className="form-section-title"><span>02</span><div><h2>Set the stage</h2><p>Choose your field of contenders.</p></div></div>
        <label>NUMBER OF CLUBS<select value={clubCount} onChange={e => regenerate(Number(e.target.value))}>{Array.from({ length: 17 }, (_, i) => i + 4).map(count => <option value={count} key={count}>{count} clubs</option>)}</select></label>
        <div className="club-preview">{clubs.map((club, i) => <details className="preview-club-editor" key={`${club.name}-${i}`}><summary><ClubCrest club={{ ...club, id: `preview-${i}` }} size="small" /><span>{club.name}</span><small>{club.short_name}</small></summary><div className="club-editor-fields">
          <label>Club name<input value={club.name} maxLength={100} onChange={event => editClub(i, { name: event.target.value })} /></label>
          <label>Primary kit<input type="color" value={club.colour_primary} onChange={event => editClub(i, { colour_primary: event.target.value })} /></label>
          <label>Trim<input type="color" value={club.colour_secondary} onChange={event => editClub(i, { colour_secondary: event.target.value })} /></label>
          <label>Attack {club.attack}<input type="range" min="1" max="100" value={club.attack} onChange={event => editClub(i, { attack: Number(event.target.value) })} /></label>
          <label>Defence {club.defence}<input type="range" min="1" max="100" value={club.defence} onChange={event => editClub(i, { defence: Number(event.target.value) })} /></label>
          <button type="button" onClick={() => rerollClub(i)}>Reroll this club</button>
        </div></details>)}</div>
      </div>
      {error && <ErrorNotice message={error} />}
      <button className="button button-primary submit-button" type="submit" disabled={busy}>{busy ? 'Creating your league…' : 'Kick off the season'}</button>
    </form>
  </PageMotion>;
}

