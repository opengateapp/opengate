import { useStore } from '../store/project';
import { toast } from './common';

/** After a delete: a toast with Undo (the delete is one step in the project's undo history). */
export function deletedToast(what: string) {
  toast(`Deleted ${what}`, { label: 'Undo', run: () => useStore.getState().undo() });
}
