import type { CSSProperties } from 'react';

interface CrestProps {
  primary: string;
  secondary: string;
  shortName: string;
  seed: string | number;
  size?: 'small' | 'medium' | 'large';
}

function seededNumber(seed: string | number): number {
  return [...String(seed)].reduce((value, character) => (value * 31 + character.charCodeAt(0)) >>> 0, 7);
}

export function Crest({ primary, secondary, shortName, seed, size = 'medium' }: CrestProps) {
  const shape = seededNumber(seed) % 3;
  const points = shape === 0 ? '8,5 56,5 52,48 32,61 12,48' : shape === 1 ? '8,5 56,5 56,38 32,59 8,38' : '8,5 56,5 52,45 32,59 12,45';
  const id = `crest-${String(seed).replace(/[^a-zA-Z0-9_-]/g, '')}`;
  return (
    <svg
      aria-label={`${shortName} crest`}
      className={`crest crest--${size}`}
      role="img"
      viewBox="0 0 64 64"
      style={{ '--crest-primary': primary, '--crest-secondary': secondary } as CSSProperties}
    >
      <defs>
        <clipPath id={id}><polygon points={points} /></clipPath>
      </defs>
      <polygon points={points} fill="var(--crest-primary)" stroke="var(--crest-secondary)" strokeWidth="3" />
      <g clipPath={`url(#${id})`}>
        <path d={`M${shape === 1 ? 18 : 12} 2h8v60h-8z`} fill="var(--crest-secondary)" opacity=".8" />
        <path d={`M${shape === 2 ? 40 : 42} 2h6v60h-6z`} fill="var(--crest-secondary)" opacity=".72" />
        <circle cx={32 + (seededNumber(seed) % 9) - 4} cy="26" r="9" fill="var(--crest-primary)" stroke="var(--crest-secondary)" strokeWidth="2" />
      </g>
      <text x="32" y="48" textAnchor="middle" fill="white" fontSize="10" fontWeight="800" fontFamily="Arial, sans-serif">{shortName.slice(0, 3).toUpperCase()}</text>
    </svg>
  );
}

export function ClubCrest({ club, size = 'medium' }: { club: { id: number | string; name: string; short_name: string; colour_primary: string; colour_secondary: string }; size?: CrestProps['size'] }) {
  return <Crest primary={club.colour_primary} secondary={club.colour_secondary} shortName={club.short_name} seed={club.id || club.name} size={size} />;
}
