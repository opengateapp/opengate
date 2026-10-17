import { useState } from 'react';
import { Modal, toast } from '../common';
import { askConfirm } from '../dialogs';
import { useProject } from '../../store/project';
import { useSync } from '../../sync/state';
import { SECTION_CHANNELS, SECTION_LABELS, CHANNEL_LABELS, type Channel } from '../../sync/channels';
import { createLink, detachShare, getRelay, linkUrl, relayHost, revokeLink, startSharing, stopSharing } from '../../sync/links';
import { displayName, setDisplayName, currentSync } from '../../sync/engine';
import type { ShareLink } from '../../model/types';

type Access = 'edit' | 'view' | 'sections';

/** What a link may change, in words. */
export function accessSummary(write: string[]): string {
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
  const [relay, setRelayInput] = useState(share?.relay ?? getRelay());
  const [name, setName] = useState(displayName());
  const [busy, setBusy] = useState(false);
  const [label, setLabel] = useState('');
  const [access, setAccess] = useState<Access>('edit');
  const [sections, setSections] = useState<string[]>(['breakdown']);
  const [made, setMade] = useState<{ url: string; label: string } | null>(null);
  const relayOk = !!relayHost(relay);

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
          <label className="field"><span>Relay address</span>
            <input value={relay} placeholder="https://open-gate-relay.your-name.workers.dev" onChange={(e) => setRelayInput(e.target.value)} />
          </label>
          <p className="muted small">The relay is a small free Cloudflare server you set up once (see <code>app/relay/README.md</code>), then reuse for every project.</p>
          <div className="row"><span className="spacer" /><button className="primary" disabled={!relayOk || busy} onClick={() => run(async () => { saveName(); await startSharing(relay); })}>{busy ? 'Starting…' : 'Start sharing'}</button></div>
        </>
      )}

      {share && (
        <>
          <div className={`share-status s-${sync.status}`}>
            <b>{sync.status === 'live' ? '● Connected' : sync.status === 'connecting' ? '◌ Connecting…' : sync.status === 'offline' ? '○ Offline — edits are saved here and will sync when you reconnect' : sync.status === 'error' ? `⚠ ${sync.error}` : ''}</b>
            {sync.pending > 0 && <span className="muted small"> · {sync.pending} change{sync.pending > 1 ? 's' : ''} waiting to sync</span>}
            <span className="muted small"> · end-to-end encrypted</span>
          </div>
          <p className="muted small">Your access: <b>{share.admin ? 'Owner (can edit everything and manage links)' : accessSummary(sync.write ?? share.write)}</b></p>

          {share.admin && (
            <>
              <h4>Invite someone</h4>
              <div className="share-new">
                <label className="field"><span>Who it's for (only you see this)</span>
                  <input value={label} placeholder="e.g. Casey — scheduling" onChange={(e) => setLabel(e.target.value)} />
                </label>
                <div className="access-pick">
                  <label className="check"><input type="radio" checked={access === 'edit'} onChange={() => setAccess('edit')} /> Can edit everything</label>
                  <label className="check"><input type="radio" checked={access === 'view'} onChange={() => setAccess('view')} /> View only</label>
                  <label className="check"><input type="radio" checked={access === 'sections'} onChange={() => setAccess('sections')} /> Can edit only these sections:</label>
                  {access === 'sections' && (
                    <div className="section-pick">
                      {Object.keys(SECTION_LABELS).map((s) => (
                        <label key={s} className="check"><input type="checkbox" checked={sections.includes(s)} onChange={(e) => setSections((x) => (e.target.checked ? [...x, s] : x.filter((y) => y !== s)))} /> {SECTION_LABELS[s]}</label>
                      ))}
                      <p className="muted small">They can see every section. Breakdown and Visualize editors can add tags and shot marks to the script but can't change its words.</p>
                    </div>
                  )}
                </div>
                <div className="row"><span className="spacer" />
                  <button className="primary" disabled={busy || (access === 'sections' && !sections.length)} onClick={() => run(async () => {
                    const { url } = await createLink(label.trim() || (access === 'view' ? 'View-only link' : access === 'edit' ? 'Editor link' : 'Section link'), write);
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
                    <div><b>{l.label}</b><span className="muted small"> · {accessSummary(l.write)} · {new Date(l.created).toLocaleDateString()}</span></div>
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
