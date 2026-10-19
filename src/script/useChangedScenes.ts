import { useEffect } from 'react';
import { create } from 'zustand';
import type { Project } from '../model/types';
import { useStore } from '../store/project';
import { derive } from './derive';
import { compareScenes, unpackDoc } from './drafts';

// Scenes changed since the reference draft: the revision base when revisions are on, otherwise
// the newest draft you saved by name. Breakdown and Stripboard show a Δ on them so the
// schedule and breakdown can be checked after a rewrite. Worked out once (debounced) for
// everyone who asks, not per strip.

const useChanged = create<{ ids: Map<string, string> }>(() => ({ ids: new Map() }));

let done: { ref: string; doc: unknown } | null = null;
let timer: ReturnType<typeof setTimeout> | undefined;

function referenceDraft(p: Project) {
  return p.revision ? p.drafts?.find((x) => x.id === p.revision!.baseDraftId) : [...(p.drafts ?? [])].filter((x) => !x.auto).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
}

function refresh() {
  const p = useStore.getState().project;
  const ref = p ? referenceDraft(p) : undefined;
  if (!p || !ref) { if (useChanged.getState().ids.size) useChanged.setState({ ids: new Map() }); done = null; return; }
  if (done && done.ref === ref.id && done.doc === p.scriptDoc) return;
  clearTimeout(timer);
  timer = setTimeout(async () => {
    const cur = useStore.getState().project;
    if (!cur) return;
    const from = derive(await unpackDoc(ref.data), true);
    const to = derive(cur.scriptDoc, cur.sceneNumbersLocked);
    done = { ref: ref.id, doc: cur.scriptDoc };
    useChanged.setState({ ids: new Map(compareScenes(from, to).filter((c) => c.kind !== 'removed').map((c) => [c.id, `${c.kind} since “${ref.name}”`])) });
  }, 400);
}

export function useChangedScenes(): Map<string, string> {
  const doc = useStore((s) => s.project?.scriptDoc);
  const drafts = useStore((s) => s.project?.drafts);
  const rev = useStore((s) => s.project?.revision?.baseDraftId);
  useEffect(() => { refresh(); }, [doc, drafts, rev]);
  return useChanged((s) => s.ids);
}
