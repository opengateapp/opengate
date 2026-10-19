import { useState } from 'react';
import { Modal, toast } from '../common';
import { askConfirm } from '../dialogs';
import { useProject } from '../../store/project';
import { useSync } from '../../sync/state';
import { SECTION_CHANNELS, SECTION_LABELS, CHANNEL_LABELS, TAB_ACCESS, ACCESS_PRESETS, accessFromLink, accessWarnings, linkFromAccess, type Access as TabAccessLevel, type Channel } from '../../sync/channels';
import { BUILT_IN_RELAY, createLink, customRelay, detachShare, linkUrl, relayFormats, relayHost, revokeLink, setRelay, startSharing, stopSharing, upgradeRoomFormat } from '../../sync/links';
import { displayName, setDisplayName, currentSync } from '../../sync/engine';
import type { ShareLink } from '../../model/types';

type Access = 'edit' | 'view' | 'sections';

/** What a link may change, in words (the budget is described separately when `read` is given). */
export function accessSummary(allWrite: string[], read?: string[]): string {
  const base = baseSummary(allWrite.filter((c) => c !== 'budget'));
  if (!read) return base;
  const budget = allWrite.includes('budget') ? 'can edit the budget' : read.includes('budget') ? 'can see the budget' : 'budget hidden';
  return `${base} · ${budget}`;
}

function baseSummary(write: string[]): string {
  if (write.includes('*')) return 'Can edit everything';
  if (!write.length) return 'View only';
  const sections = Object.entries(SECTION_CHANNELS).filter(([, chs]) => chs.filter((c) => c !== 'script').every((c) => write.includes(c)) && chs.some((c) => c !== 'script')).map(([s]) => s);
  const names = sections.map((s) => SECTION_LABELS[s].split(' (')[0]);
  if (write.includes('script') && write.includes('write') && !names.includes('Write')) names.unshift('Write');
  return names.length ? `Can edit ${names.join(', ')}` : `Can edit ${write.map((c) => CHANNEL_LABELS[c as Channel] ?? c).join(', ')}`;
}

export function ShareDialog({ onClose }: { onClose: () => void }) {
  const p = useProject();
  const share = p.share;
  const sync = useSync();
  const [own, setOwn] = useState(customRelay());
  const relay = share?.relay ?? (own.trim() || BUILT_IN_RELAY);
  const [name, setName] = useState(displayName());
  const [busy, setBusy] = useState(false);
  const [label, setLabel] = useState('');
  const [access, setAccess] = useState<Access>('edit');
  const [sections, setSections] = useState<string[]>(['breakdown']);
  const [budget, setBudget] = useState<'none' | 'view' | 'edit'>('none');
  const [made, setMade] = useState<{ url: string; label: string } | null>(null);
  const relayOk = !!relayHost(relay);
  const perTab = (share?.format ?? 1) === 2;
  const [tabAccess, setTabAccess] = useState<Record<string, TabAccessLevel>>(() => Object.fromEntries(TAB_ACCESS.map((t) => [t.id, t.id === 'budget' ? 'hidden' : 'edit'])));

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try { await fn(); } catch (e) { toast((e as Error).message); } finally { setBusy(false); }
  };

  const saveName = () => { setDisplayName(name); currentSync()?.awareness.setLocalStateField('user', { ...(currentSync()?.awareness.getLocalState()?.user ?? {}), name: name.trim() || 'Guest' }); };

  const write = access === 'edit' ? ['*'] : access === 'view' ? [] : [...new Set(sections.flatMap((s) => SECTION_CHANNELS[s]))];

  const copy = async (url: string) => {
    try { await navigator.clipboard.writeText(url); toast('Link copied'); } catch { toast('Select the link and copy it'); }
  };
  const email = (url: string, who: string) => {
    const subject = `Join “${p.title}” on Open Gate`;
    const body = `You're invited to ${p.title} on Open Gate${who ? ` (${who})` : ''}.\n\nOpen this link to join — it works in any modern browser, no account needed:\n${url}\n\nKeep the link private: anyone who has it gets the same access.`;
    window.location.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  };

  return (
    <Modal title={share ? 'Share & invite' : 'Share this project'} onClose={onClose} wide footer={<button className="primary" onClick={onClose}>Done</button>}>
      <label className="field"><span>Your name (shown to collaborators)</span>
        <input value={name} onChange={(e) => setName(e.target.value)} onBlur={saveName} />
      </label>

      {!share && (
        <>
          <p>Invite co-writers, your AD, department heads — anyone — to work on this project with you in real time. No accounts: you send a link.</p>
          <ul className="share-points">
            <li><b>End-to-end encrypted.</b> Your work is encrypted on this computer. The key is only inside your invite links, so the server that relays changes can't read your script.</li>
            <li><b>Works offline.</b> Everyone keeps a full copy. Changes made offline sync when you reconnect, and you can review and reject others' changes.</li>
            <li><b>You control access.</b> Make links that can edit everything, only view, or only edit certain sections — and revoke any link later.</li>
          </ul>
          <details className="share-advanced">
            <summary className="small">Advanced: use your own relay</summary>
            <label className="field"><span>Relay address (leave empty for Open Gate's built-in relay)</span>
              <input value={own} placeholder="https://open-gate-relay.your-name.workers.dev" onChange={(e) => setOwn(e.target.value)} />
            </label>
            <p className="muted small">A relay is a small free Cloudflare server (see <code>app/relay/README.md</code>). Open Gate's own relay is used otherwise.</p>
          </details>
          <div className="row"><span className="spacer" /><button className="primary" disabled={!relayOk || busy} onClick={() => run(async () => { saveName(); setRelay(own); await startSharing(relay); })}>{busy ? 'Starting…' : 'Start sharing'}</button></div>
        </>
      )}

      {share && (
        <>
          <div className={`share-status s-${sync.status}`}>
            <b>{sync.status === 'live' ? '● Connected' : sync.status === 'connecting' ? '◌ Connecting…' : sync.status === 'offline' ? '○ Offline — edits are saved here and will sync when you reconnect' : sync.status === 'error' ? `⚠ ${sync.error}` : ''}</b>
            {sync.pending > 0 && <span className="muted small"> · {sync.pending} change{sync.pending > 1 ? 's' : ''} waiting to sync</span>}
            <span className="muted small"> · end-to-end encrypted</span>
          </div>
          <p className="muted small">Your access: <b>{share.admin ? 'Owner (can edit everything and manage links)' : accessSummary(sync.write ?? share.write, sync.budget ? ['budget'] : [])}</b></p>

          {share.admin && (
            <>
              {!perTab && (
                <div className="upgrade-box">
                  <b className="small">New: per-tab access</b>
                  <p className="muted small">Choose Edit, View or Hidden for every tab (Screenplay, Characters, Budget, Call Sheets…). Your current links keep working with the access they have now.</p>
                  <button className="small" disabled={busy} onClick={() => run(async () => {
                    if (!(await relayFormats(share.relay)).includes(2)) throw new Error('This relay needs updating before it can do per-tab access.');
                    if (await askConfirm('Update this shared project for per-tab access?', { message: 'Your copy is uploaded again in the new layout, and collaborators re-download it automatically (edits they haven’t synced yet should be synced first). Existing links keep their access.', confirmLabel: 'Update', danger: false })) {
                      await upgradeRoomFormat();
                      toast('Updating… collaborators will reconnect automatically');
                    }
                  })}>Update for per-tab access…</button>
                </div>
              )}
              <h4>Invite someone</h4>
              <div className="share-new">
                <label className="field"><span>Who it's for (only you see this)</span>
                  <input value={label} placeholder="e.g. Casey — scheduling" onChange={(e) => setLabel(e.target.value)} />
                </label>
                {perTab ? <PerTabAccess access={tabAccess} setAccess={setTabAccess} /> : <>
                <div className="access-pick">
                  <label className="check"><input type="radio" checked={access === 'edit'} onChange={() => setAccess('edit')} /> Can edit everything</label>
                  <label className="check"><input type="radio" checked={access === 'view'} onChange={() => setAccess('view')} /> View only</label>
                  <label className="check"><input type="radio" checked={access === 'sections'} onChange={() => setAccess('sections')} /> Can edit only these sections:</label>
                  {access === 'sections' && (
                    <div className="section-pick">
                      {Object.keys(SECTION_LABELS).filter((s) => s !== 'budget').map((s) => (
                        <label key={s} className="check"><input type="checkbox" checked={sections.includes(s)} onChange={(e) => setSections((x) => (e.target.checked ? [...x, s] : x.filter((y) => y !== s)))} /> {SECTION_LABELS[s]}</label>
                      ))}
                      <p className="muted small">They can see every section except the budget (set below). Breakdown and Visualize editors can add tags and shot marks to the script but can't change its words.</p>
                    </div>
                  )}
                </div>
                <label className="field budget-access"><span>Budget</span>
                  <select value={budget} onChange={(e) => setBudget(e.target.value as typeof budget)}>
                    <option value="none">Hidden — they can’t see it</option>
                    <option value="view">Can see it</option>
                    <option value="edit">Can see and edit it</option>
                  </select>
                </label>
                <p className="muted small">The budget has its own encryption key, which only goes into links you share it through. Without it, the budget never reaches them — not even encrypted.</p>
                </>}
                <div className="row"><span className="spacer" />
                  <button className="primary" disabled={busy || (!perTab && access === 'sections' && !sections.length)} onClick={() => run(async () => {
                    let url: string;
                    if (perTab) {
                      const l = linkFromAccess(tabAccess);
                      const b = tabAccess.budget === 'edit' ? 'edit' : tabAccess.budget === 'view' ? 'view' : 'none';
                      ({ url } = await createLink(label.trim() || 'Custom access', l.write.filter((c) => c !== 'budget'), b, l.hide.filter((c) => c !== 'budget')));
                    } else ({ url } = await createLink(label.trim() || (access === 'view' ? 'View-only link' : access === 'edit' ? 'Editor link' : 'Section link'), write, budget));
                    setMade({ url, label: label.trim() });
                    setLabel('');
                    void copy(url);
                  })}>Create link</button>
                </div>
                {made && (
                  <div className="made-link">
                    <input readOnly value={made.url} onFocus={(e) => e.target.select()} />
                    <button onClick={() => void copy(made.url)}>Copy</button>
                    <button onClick={() => email(made.url, made.label)}>Email…</button>
                  </div>
                )}
              </div>

              <h4>Links</h4>
              {!(share.links ?? []).length && <p className="muted small">No links yet.</p>}
              <ul className="link-list">
                {(share.links ?? []).map((l: ShareLink) => (
                  <li key={l.token}>
                    <div><b>{l.label}</b><span className="muted small"> · {perTab && l.hide ? tabSummary(accessFromLink(l.write, l.hide)) : accessSummary(l.write, l.read ?? [])} · {new Date(l.created).toLocaleDateString()}</span></div>
                    <div className="row">
                      <button className="small" onClick={() => void copy(linkUrl(p, l))}>Copy</button>
                      <button className="small" onClick={() => email(linkUrl(p, l), l.label)}>Email…</button>
                      <button className="small danger-text" onClick={() => run(async () => {
                        if (await askConfirm(`Revoke “${l.label}”?`, { message: "Anyone using this link is disconnected and can't sync again. They keep the copy already on their computer.", confirmLabel: 'Revoke' })) {
                          await revokeLink(l.token);
                          toast('Link revoked');
                        }
                      })}>Revoke</button>
                    </div>
                  </li>
                ))}
              </ul>
              <hr />
              <button className="danger-text" disabled={busy} onClick={() => run(async () => {
                if (await askConfirm('Stop sharing this project?', { message: "The shared copy on the relay is deleted and every link stops working. Everyone keeps the copy on their own computer, and this project stays here as a normal project.", confirmLabel: 'Stop sharing' })) {
                  await stopSharing();
                  toast('Sharing stopped');
                }
              })}>Stop sharing…</button>
            </>
          )}

          {!share.admin && (
            <>
              <hr />
              <button disabled={busy} onClick={() => run(async () => {
                if (await askConfirm('Disconnect this copy?', { message: "You keep everything here as your own independent project, but it won't sync with the shared project any more.", confirmLabel: 'Disconnect', danger: false })) {
                  await detachShare(p.id);
                  toast('This is now an independent copy');
                }
              })}>Disconnect — keep an independent copy</button>
            </>
          )}
        </>
      )}
    </Modal>
  );
}

function tabSummary(a: Record<string, TabAccessLevel>): string {
  const n = (k: TabAccessLevel) => Object.values(a).filter((x) => x === k).length;
  const parts = [n('edit') && `edits ${n('edit')} tab${n('edit') > 1 ? 's' : ''}`, n('view') && `views ${n('view')}`, n('hidden') && `${n('hidden')} hidden`].filter(Boolean);
  return parts.join(', ') || 'View only';
}

/** Edit / View / Hidden for every tab, with presets and warnings about tabs that need a hidden one. */
function PerTabAccess({ access, setAccess }: { access: Record<string, TabAccessLevel>; setAccess: (a: Record<string, TabAccessLevel>) => void }) {
  const set = (id: string, v: TabAccessLevel) => setAccess({ ...access, [id]: v });
  const all = (v: TabAccessLevel) => setAccess(Object.fromEntries(TAB_ACCESS.map((t) => [t.id, t.id === 'budget' && v === 'edit' ? 'hidden' : v])));
  const warnings = accessWarnings(access);
  const sections = [...new Set(TAB_ACCESS.map((t) => t.section))];
  return (
    <div className="tab-access">
      <div className="row wrap">
        <span className="small"><b>Start from</b></span>
        <button className="chip pick" onClick={() => all('edit')}>Edit everything</button>
        <button className="chip pick" onClick={() => all('view')}>View only</button>
        {ACCESS_PRESETS.map((p) => <button key={p.id} className="chip pick" title={p.hint} onClick={() => setAccess(Object.fromEntries(TAB_ACCESS.map((t) => [t.id, p.access[t.id] ?? 'view'])))}>{p.label}</button>)}
      </div>
      <div className="tab-access-grid">
        {sections.map((sec) => (
          <div key={sec} className="tab-access-section">
            <span className="settings-group">{sec}</span>
            {TAB_ACCESS.filter((t) => t.section === sec).map((t) => (
              <div key={t.id} className="tab-access-row">
                <span className="grow">{t.label}</span>
                <div className="seg small" role="radiogroup" aria-label={`${t.label} access`}>
                  {(['edit', 'view', 'hidden'] as const).map((v) => <button key={v} role="radio" aria-checked={access[t.id] === v} className={access[t.id] === v ? `active a-${v}` : ''} onClick={() => set(t.id, v)}>{v === 'edit' ? 'Edit' : v === 'view' ? 'View' : 'Hidden'}</button>)}
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
      {warnings.map((w) => <p key={w} className="small warn">⚠ {w}</p>)}
      <p className="muted small">Hidden tabs never reach them — the relay doesn't send that data. Script tagging, shot marks and storyboards can add highlights to the script but not change its words. DOOD, Sides and Reports follow the Stripboard; Expenses follow the Budget.</p>
    </div>
  );
}
