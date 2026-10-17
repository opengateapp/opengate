import { useState } from 'react';
import { Modal, toast } from './common';
import { importScriptFile, SCRIPT_ACCEPT } from '../io/importScript';
import type { ParsedScript } from '../io/fountain';
import { applyImportedScript } from '../io/applyImport';
import { useStore } from '../store/project';
import { newProject } from '../model/defaults';
import { normalizeCharacter } from '../script/derive';
import { parseHeading } from '../script/heading';
import { produce } from 'immer';
import { session } from '../script/session';

interface Props { onClose: () => void; asNewProject?: boolean }

/** Pick a script file → preview what was detected → commit into the project. */
export function ImportDialog({ onClose, asNewProject }: Props) {
  const [parsed, setParsed] = useState<ParsedScript | null>(null);
  const [fileName, setFileName] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const hasScript = useStore((s) => !!s.project?.scriptDoc && !asNewProject);

  const load = async (f: File | undefined | null) => {
    if (!f) return;
    setBusy(true);
    setError('');
    try {
      setFileName(f.name);
      setParsed(await importScriptFile(f));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const commit = () => {
    if (!parsed) return;
    session.flush();
    if (asNewProject) {
      const title = parsed.titlePage?.title || fileName.replace(/\.[^.]+$/, '');
      const p = produce(newProject(title), (d) => { applyImportedScript(d, parsed); });
      session.reset();
      useStore.getState().open(p);
      useStore.setState({ saveState: 'dirty' });
      toast(`Imported ${fileName}`);
    } else {
      let res = { kept: 0, added: 0 };
      useStore.getState().update((d) => { res = applyImportedScript(d, parsed); }, 'Import script');
      session.reset();
      toast(`Imported ${fileName}: ${res.kept} scenes matched, ${res.added} new`);
    }
    onClose();
  };

  const scenes = parsed?.lines.filter((l) => l.type === 'sceneHeading') ?? [];
  const chars = new Set(parsed?.lines.filter((l) => l.type === 'character').map((l) => normalizeCharacter(l.text)));
  const sets = new Set(scenes.map((s) => parseHeading(s.text).set));

  return (
    <Modal
      title="Import screenplay"
      onClose={onClose}
      footer={
        <>
          <button onClick={onClose}>Cancel</button>
          <button className="primary" disabled={!parsed || busy} onClick={commit}>
            {hasScript ? 'Replace script, keep matching scenes' : 'Import'}
          </button>
        </>
      }
    >
      <div
        className="dropzone"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { e.preventDefault(); void load(e.dataTransfer.files[0]); }}
      >
        <p>Drop a screenplay here, or</p>
        <label className="button">
          Choose file…
          <input type="file" accept={SCRIPT_ACCEPT} hidden onChange={(e) => void load(e.target.files?.[0])} />
        </label>
        <p className="muted small">Fountain, Final Draft (.fdx), PDF, Word (.docx), Highland, Celtx, plain text</p>
      </div>
      {busy && <p>Reading {fileName}…</p>}
      {error && <p className="error">{error}</p>}
      {parsed && (
        <div className="import-summary">
          <h3>{fileName}</h3>
          <div className="stats">
            <div><b>{scenes.length}</b> scenes</div>
            <div><b>{chars.size}</b> characters</div>
            <div><b>{sets.size}</b> locations</div>
            <div><b>{parsed.lines.length}</b> elements</div>
          </div>
          {parsed.warnings.map((w) => <p key={w} className="warn">{w}</p>)}
          {hasScript && <p className="muted small">Scenes with the same heading as the current script keep their breakdown tags, shots and schedule placement.</p>}
          <div className="preview">
            {parsed.lines.slice(0, 40).map((l, i) => (
              <div key={i} className={`pv pv-${l.type}`}><span>{l.type}</span>{l.text}</div>
            ))}
          </div>
        </div>
      )}
    </Modal>
  );
}
