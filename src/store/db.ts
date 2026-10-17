import Dexie, { type Table } from 'dexie';
import type { Project } from '../model/types';
import { migrate } from './migrate';

export interface ProjectRow {
  id: string;
  title: string;
  updatedAt: string;
  data: Project;
}

/** Storyboard images (and any later media) as Blobs, keyed by id, owned by a project. */
export interface MediaRow {
  id: string;
  projectId: string;
  type: string;
  blob: Blob;
}

/** Sync state of one channel of a shared project (Yjs state, last update seen, unsent edits). */
export interface SyncRow {
  key: string; // `${projectId}:${channel}`
  projectId: string;
  state: Uint8Array;
  seq: number;
  pending: { id: string; u: Uint8Array }[];
}

/** Small per-project values (uploaded media ids, review list …). */
export interface MetaRow { key: string; projectId: string; value: unknown }

/** Where a project is saved on disk (Chrome / Edge file access), and whether to autosave there. */
export interface FileHandleRow { projectId: string; handle: FileSystemFileHandle; name: string; autosave: boolean; savedAt?: string }

class AppDB extends Dexie {
  projects!: Table<ProjectRow, string>;
  media!: Table<MediaRow, string>;
  sync!: Table<SyncRow, string>;
  meta!: Table<MetaRow, string>;
  fileHandles!: Table<FileHandleRow, string>;
  constructor() {
    super('slateline');
    this.version(1).stores({ projects: 'id, updatedAt, title' });
    this.version(2).stores({ projects: 'id, updatedAt, title', media: 'id, projectId' });
    this.version(3).stores({ projects: 'id, updatedAt, title', media: 'id, projectId', sync: 'key, projectId', meta: 'key, projectId', fileHandles: 'projectId' });
  }
}

export const db = new AppDB();

export async function saveProject(p: Project): Promise<void> {
  await db.projects.put({ id: p.id, title: p.title, updatedAt: p.updatedAt, data: p });
}

export async function loadProject(id: string): Promise<Project | null> {
  const row = await db.projects.get(id);
  return row ? migrate(row.data) : null;
}

export async function listProjects(): Promise<{ id: string; title: string; updatedAt: string }[]> {
  const rows = await db.projects.orderBy('updatedAt').reverse().toArray();
  return rows.map((r) => ({ id: r.id, title: r.title, updatedAt: r.updatedAt }));
}

export async function deleteProject(id: string): Promise<void> {
  await db.transaction('rw', [db.projects, db.media, db.sync, db.meta, db.fileHandles], async () => {
    await db.projects.delete(id);
    await db.media.where('projectId').equals(id).delete();
    await db.sync.where('projectId').equals(id).delete();
    await db.meta.where('projectId').equals(id).delete();
    await db.fileHandles.delete(id);
  });
}
