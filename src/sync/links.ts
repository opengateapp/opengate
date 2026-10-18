import type { Project, ShareInfo, ShareLink } from '../model/types';
import { useStore } from '../store/project';
import { db } from '../store/db';
import { b64url, fromB64url, newKey, randomSecret, sha256Hex } from './crypto';
import { initRoom, relayBase } from './transport';
import { stopSync } from './engine';

// Invite links, and the owner's sharing actions. A link carries everything needed to join
// (relay address, room, access token and the encryption key) after the "#", which browsers
// never send to servers.

/** Open Gate's own relay, used unless someone sets up their own (Share → Advanced). */
export const BUILT_IN_RELAY = (import.meta.env.VITE_RELAY as string | undefined) || 'https://open-gate-relay.open-gate-relay.workers.dev';

const RELAY_KEY = 'slateline.relay';
/** A relay of the user's own, or '' for the built-in one. */
export function customRelay(): string { try { const r = localStorage.getItem(RELAY_KEY) ?? ''; return r === BUILT_IN_RELAY ? '' : r; } catch { return ''; } }
export function getRelay(): string { return customRelay() || BUILT_IN_RELAY; }
export function setRelay(url: string) { try { const u = url.trim(); if (!u || u === BUILT_IN_RELAY) localStorage.removeItem(RELAY_KEY); else localStorage.setItem(RELAY_KEY, u); } catch { /* ignore */ } }

export function relayHost(url: string): { host: string; protocol: 'ws' | 'wss' } | null {
  const u = url.trim();
  if (!u) return null;
  try {
    const parsed = new URL(/^\w+:\/\//.test(u) ? u : `https://${u}`);
    return { host: parsed.host, protocol: parsed.protocol === 'http:' || parsed.protocol === 'ws:' ? 'ws' : 'wss' };
  } catch { return null; }
}

export interface Invite {
  relay: string; room: string; token: string; key: string; projectId: string; title: string; write: string[];
  /** The budget's key, only in links the owner shared the budget through. */
  budgetKey?: string;
}

export function inviteUrl(inv: Invite, base = `${location.origin}${location.pathname}`): string {
  const payload = { v: 1, r: inv.relay, m: inv.room, t: inv.token, k: inv.key, p: inv.projectId, n: inv.title, w: inv.write, ...(inv.budgetKey ? { b: inv.budgetKey } : {}) };
  return `${base}#join=${b64url(new TextEncoder().encode(JSON.stringify(payload)))}`;
}

export function parseInvite(hashOrUrl: string): Invite | null {
  const m = hashOrUrl.match(/#join=([A-Za-z0-9_-]+)/);
  if (!m) return null;
  try {
    const j = JSON.parse(new TextDecoder().decode(fromB64url(m[1])));
    if (j.v !== 1 || !j.r || !j.m || !j.t || !j.k || !j.p) return null;
    return { relay: j.r, room: j.m, token: j.t, key: j.k, projectId: j.p, title: j.n || 'Shared project', write: Array.isArray(j.w) ? j.w : [], ...(typeof j.b === 'string' && j.b ? { budgetKey: j.b } : {}) };
  } catch { return null; }
}

async function admin(share: ShareInfo, method: string, path: string, body?: unknown) {
  const res = await fetch(`${relayBase(share.relay)}/r/${share.room}/${path}`, {
    method, headers: { 'x-admin': share.token, 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`The relay said no (${res.status}).`);
  return res.json();
}

/** Owner: put this project in a new encrypted room on the relay. */
export async function startSharing(relay: string): Promise<void> {
  const room = randomSecret(18);
  const secret = randomSecret(24);
  const key = await newKey();
  const budgetKey = await newKey();
  await initRoom(relay, room, await sha256Hex(secret));
  setRelay(relay);
  const share: ShareInfo = { relay, room, key, budgetKey, token: secret, admin: true, write: ['*'], links: [], fresh: true, joinedAt: new Date().toISOString() };
  useStore.getState().update((d) => { d.share = share; }, null);
}

/**
 * Owner: a new invite link. write: ['*'] = edit everything, [] = view only, or a list of channels.
 * budget: whether the link can see ('view') or change ('edit') the budget; it's never included in "everything".
 */
export async function createLink(label: string, write: string[], budget: 'none' | 'view' | 'edit' = 'none'): Promise<{ link: ShareLink; url: string }> {
  const p = useStore.getState().project!;
  const share = p.share!;
  const token = randomSecret(24);
  const w = budget === 'edit' ? [...write.filter((c) => c !== 'budget'), 'budget'] : write.filter((c) => c !== 'budget');
  const read = budget === 'none' ? [] : ['budget'];
  await admin(share, 'POST', 'links', { hash: await sha256Hex(token), label, write: w, read });
  const link: ShareLink = { token, label, write: w, read, created: new Date().toISOString() };
  useStore.getState().update((d) => { d.share!.links = [...(d.share!.links ?? []), link]; }, null);
  return { link, url: linkUrl(p, link) };
}

export function linkUrl(p: Project, link: ShareLink): string {
  const s = p.share!;
  const budget = (link.read ?? []).includes('budget') || link.write.includes('budget');
  return inviteUrl({ relay: s.relay, room: s.room, token: link.token, key: s.key, projectId: p.id, title: p.title, write: link.write, budgetKey: budget ? s.budgetKey : undefined });
}

export async function revokeLink(token: string): Promise<void> {
  const share = useStore.getState().project!.share!;
  await admin(share, 'DELETE', `links/${await sha256Hex(token)}`);
  useStore.getState().update((d) => { d.share!.links = (d.share!.links ?? []).filter((l) => l.token !== token); }, null);
}

/** Owner: delete the room. Everyone keeps their own copy; nobody can sync any more. */
export async function stopSharing(): Promise<void> {
  const p = useStore.getState().project!;
  await admin(p.share!, 'DELETE', 'room').catch(() => { /* already gone: carry on */ });
  await detachShare(p.id);
}

/** Keep the work here but disconnect it from the shared room (an independent copy). */
export async function detachShare(projectId: string): Promise<void> {
  stopSync();
  useStore.getState().update((d) => { delete d.share; }, null);
  await db.sync.where('projectId').equals(projectId).delete();
}
