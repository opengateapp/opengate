import { useMemo, useState } from 'react';
import { useProject, useDerived, useStore } from '../store/project';
import { unschedule } from '../schedule/engine';
import type { TabId } from '../App';

/** Shows references that point at scenes no longer in the script (deleted or renamed away). */
export function SyncIssues({ onGo, compact }: { onGo: (t: TabId) => void; compact?: boolean }) {
  const p = useProject();
  const d = useDerived();
  const update = useStore((s) => s.update);
  const [open, setOpen] = useState(false);

  const issues = useMemo(() => {
    const out: { text: string; tab: TabId; fix?: () => void }[] = [];
    const orphanStrips = p.schedule.days.flatMap((day) => day.items.filter((i) => i.kind === 'scene' && !d.sceneById.has(i.sceneId)).map((i) => ({ day, id: (i as { sceneId: string }).sceneId })));
    if (orphanStrips.length) out.push({
      text: `${orphanStrips.length} scheduled strip(s) point to scenes deleted from the script`, tab: 'stripboard',
      fix: () => update((dr) => unschedule(dr.schedule, orphanStrips.map((o) => o.id)), 'Remove deleted scenes from schedule'),
    });
    const orphanShots = p.shots.filter((s) => s.sceneId && !d.sceneById.has(s.sceneId));
    if (orphanShots.length) out.push({ text: `${orphanShots.length} shot(s) belong to scenes deleted from the script`, tab: 'shots' });
    if (d.scenes.length === 0) out.push({ text: 'The script has no scene headings yet', tab: 'screenplay' });
    return out;
  }, [p, d, update]);

  if (!issues.length) return compact ? null : <span className="sync-ok" title="Every tab is in sync with the script">● In sync</span>;
  return (
    <div className="sync-issues">
      <button className="warn-btn" title={`${issues.length} sync issue${issues.length > 1 ? 's' : ''}`} onClick={() => setOpen(!open)}>⚠ {compact ? issues.length : `${issues.length} sync issue${issues.length > 1 ? 's' : ''}`}</button>
      {open && (
        <div className="menu right">
          {issues.map((i) => (
            <div key={i.text} className="issue">
              <span>{i.text}</span>
              <div>
                <button onClick={() => { onGo(i.tab); setOpen(false); }}>Show</button>
                {i.fix && <button onClick={() => { i.fix!(); setOpen(false); }}>Fix</button>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
