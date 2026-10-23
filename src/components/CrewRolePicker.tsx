import { useState } from 'react';
import { DEPARTMENTS, departmentOf } from '../credits/credits';

// Crew role as a dropdown grouped by department (the same grouping as the union picker), with
// "Other…" for anything not listed. A saved role that isn't in the list is kept and shown as typed.

/** Departments in set order, each with its usual roles. */
export const CREW_ROLES: { dept: string; roles: string[] }[] = [
  { dept: 'Production', roles: ['Executive producer', 'Producer', 'Line producer', 'Unit production manager (UPM)', 'Production coordinator', 'Production accountant', 'Production assistant (PA)'] },
  { dept: 'Direction', roles: ['Director', '1st assistant director (1st AD)', '2nd assistant director (2nd AD)', '2nd 2nd AD', 'Script supervisor'] },
  { dept: 'Writing', roles: ['Writer'] },
  { dept: 'Casting', roles: ['Casting director', 'Casting associate'] },
  { dept: 'Camera', roles: ['Director of photography (DP)', 'Camera operator', '1st assistant camera (1st AC)', '2nd assistant camera (2nd AC)', 'Digital imaging technician (DIT)', 'Data wrangler', 'Steadicam operator', 'Drone operator', 'Stills photographer'] },
  { dept: 'Grip', roles: ['Key grip', 'Best boy grip', 'Dolly grip', 'Grip'] },
  { dept: 'Electric', roles: ['Gaffer', 'Best boy electric', 'Electrician', 'Generator operator'] },
  { dept: 'Art', roles: ['Production designer', 'Art director', 'Set decorator', 'Props master', 'Set dresser', 'Construction coordinator'] },
  { dept: 'Wardrobe', roles: ['Costume designer', 'Wardrobe supervisor', 'Set costumer'] },
  { dept: 'Hair & makeup', roles: ['Key makeup artist', 'Key hair stylist', 'SFX makeup artist'] },
  { dept: 'Sound', roles: ['Production sound mixer', 'Boom operator', 'Sound utility'] },
  { dept: 'Locations', roles: ['Location manager', 'Location scout', 'Key location assistant'] },
  { dept: 'Animals', roles: ['Animal trainer', 'Animal wrangler'] },
  { dept: 'Stunts', roles: ['Stunt coordinator', 'Stunt performer', 'Stunt driver', 'Fight choreographer'] },
  { dept: 'Transportation', roles: ['Transportation coordinator', 'Driver'] },
  { dept: 'Catering', roles: ['Caterer', 'Craft services'] },
  { dept: 'Post-production', roles: ['Editor', 'Assistant editor', 'Colourist', 'Sound designer', 'Re-recording mixer', 'VFX supervisor', 'Composer'] },
];

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
/** The listed role a typed one matches: by full name, by name without the "(1st AD)" part, or by that short form. */
export function matchRole(role: string): string | undefined {
  const r = norm(role);
  if (!r) return undefined;
  for (const g of CREW_ROLES) for (const x of g.roles) {
    const short = /\(([^)]+)\)$/.exec(x)?.[1];
    if (norm(x) === r || norm(x.replace(/\s*\([^)]*\)$/, '')) === r || (short && norm(short) === r)) return x;
  }
  return undefined;
}

export function CrewRolePicker({ value, onChange, ro }: { value: string; onChange: (role: string) => void; ro?: boolean }) {
  const listed = matchRole(value);
  const [typing, setTyping] = useState(false);
  const custom = typing || (!!value.trim() && !listed);
  const dept = listed ? CREW_ROLES.find((g) => g.roles.includes(listed))!.dept : value.trim() ? DEPARTMENTS.find((d) => d.id === departmentOf(value))?.heading : undefined;
  return (
    <span className="crew-role-picker">
      <select disabled={ro} aria-label="Role" value={custom ? '__other' : listed ?? ''} onChange={(e) => {
        const v = e.target.value;
        if (v === '__other') { setTyping(true); return; }
        setTyping(false);
        onChange(v);
      }}>
        <option value="">Role…</option>
        {CREW_ROLES.map((g) => <optgroup key={g.dept} label={g.dept}>{g.roles.map((r) => <option key={r} value={r}>{r}</option>)}</optgroup>)}
        <option value="__other">Other (type it)…</option>
      </select>
      {custom && <input disabled={ro} aria-label="Role (typed)" placeholder="Type the role" value={value} autoFocus={typing && !value} onChange={(e) => onChange(e.target.value)} />}
      {dept && dept !== 'Additional Crew' && <span className="muted small crew-dept">{dept}</span>}
    </span>
  );
}
