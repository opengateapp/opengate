import { useEffect } from 'react';
import { db, listProjects, loadProject, saveProject } from '../store/db';
import { useStore, flushSave } from '../store/project';
import { session } from '../script/session';
import { newProject } from '../model/defaults';
import { toast } from '../components/common';
import { parseInvite, setRelay } from './links';
import type { Project, ShareInfo } from '../model/types';

/** Opening an invite link (…#join=…) opens that shared project — joining it the first time. */
export function JoinHandler() {
  useEffect(() => {
    const check = async () => {
      const inv = parseInvite(location.hash);
      if (!inv) return;
      history.replaceState(null, '', location.pathname + location.search);
      session.flush();
      await flushSave().catch(() => {});
      setRelay(inv.relay);
      const share: ShareInfo = { relay: inv.relay, room: inv.room, key: inv.key, token: inv.token, admin: false, write: inv.write, joinedAt: new Date().toISOString() };

      // Already have it here? (same room — or the same project, e.g. the owner opening their own link)
      let found: Project | null = null;
      for (const row of await listProjects()) {
        const p = await loadProject(row.id);
        if (p?.share?.room === inv.room) { found = p; break; }
      }
      if (!found) {
        const same = await loadProject(inv.projectId);
        if (same && !same.share) found = { ...same, share };
      }
      if (found) {
        if (found.share?.room === inv.room && found.share.admin) {
          // The owner keeps owner access even when opening a collaborator link.
        } else if (found.share?.room === inv.room && found.share.token !== inv.token) {
          found = { ...found, share: { ...found.share, token: inv.token, write: inv.write } };
        }
        await saveProject(found);
        session.reset();
        useStore.getState().open(found);
        toast(`Opened “${found.title}”`);
        return;
      }

      // First time: an empty copy that fills from the shared project.
      const p = { ...newProject(inv.title), id: inv.projectId, share };
      await db.sync.where('projectId').equals(p.id).delete();
      await saveProject(p);
      session.reset();
      useStore.getState().open(p);
      toast(`Joining “${inv.title}”…`);
    };
    void check();
    const onHash = () => void check();
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  return null;
}
