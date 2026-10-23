import { useState } from 'react';
import { useProject, useStore } from '../store/project';
import { newId } from '../model/ids';
import type { Task } from '../model/types';
import { addDays, formatDate, todayISO } from '../model/dates';
import { LongPress } from '../components/ActionSheet';
import { Hint } from '../components/Hint';
import { setDrag } from '../components/scheduleBits';
import { addMarketingTasks, marketingAnchors } from '../plan/marketingTasks';
import { toast } from '../components/common';
import { RefLink } from './ReferenceTab';

// Tasks: prep to-dos with due dates, owners and departments. Dated tasks show on the Calendar,
// and dragging a task onto a calendar day sets its due date.

const DEPTS = ['Production', 'Direction', 'Camera', 'Art', 'Wardrobe', 'Hair & Makeup', 'Sound', 'Locations', 'Casting', 'Post'];

export function TasksTab() {
  const p = useProject();
  const update = useStore((s) => s.update);
  const [title, setTitle] = useState('');
  const [showDone, setShowDone] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const today = todayISO();
  const week = addDays(today, 7);

  const people = [...p.cast.map((c) => c.actorName || c.characterName), ...p.crew.map((c) => c.name), ...p.contacts.map((c) => c.name)].filter(Boolean);

  const add = (t = title, due?: string) => {
    const name = t.trim() || 'New task';
    const task: Task = { id: newId(), title: name, done: false, due, order: Math.max(0, ...p.tasks.map((x) => x.order)) + 1, priority: 'normal' };
    update((d) => { d.tasks.push(task); }, 'Add task');
    setTitle('');
  };
  const swapOrder = (a: string, b: string) => update((d) => {
    const x = d.tasks.find((t) => t.id === a)!; const y = d.tasks.find((t) => t.id === b)!;
    [x.order, y.order] = [y.order, x.order];
  }, 'Reorder tasks');
  const set = (id: string, patch: Partial<Task>, label: string | null = null) => update((d) => { Object.assign(d.tasks.find((t) => t.id === id)!, patch); }, label);

  const groups: { label: string; tasks: Task[] }[] = [
    { label: 'Overdue', tasks: p.tasks.filter((t) => !t.done && t.due && t.due < today) },
    { label: 'This week', tasks: p.tasks.filter((t) => !t.done && t.due && t.due >= today && t.due <= week) },
    { label: 'Later', tasks: p.tasks.filter((t) => !t.done && t.due && t.due > week) },
    { label: 'No due date', tasks: p.tasks.filter((t) => !t.done && !t.due) },
    ...(showDone ? [{ label: 'Done', tasks: p.tasks.filter((t) => t.done) }] : []),
  ].map((g) => ({ ...g, tasks: [...g.tasks].sort((a, b) => (a.due ?? '9').localeCompare(b.due ?? '9') || a.order - b.order) }));

  return (
    <div className="tasks-tab pad scroll" onDoubleClick={(e) => { if ((e.target as HTMLElement).classList.contains('tasks-tab')) add(); }}>
      <div className="toolbar flat">
        <h3>Tasks</h3>
        <input className="grow" placeholder="Add a task and press Enter…" value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') add(); }} />
        <button className="primary" onClick={() => add()}>Add</button>
        <label className="check"><input type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} /> Show done ({p.tasks.filter((t) => t.done).length})</label>
        <button className="small" title="Stills, BTS, key art, trailer, press kit, festival strategy and submissions, timed from your shoot and picture lock" onClick={() => {
          let n = 0;
          update((dr) => { n = addMarketingTasks(dr); }, 'Add marketing & festival checklist');
          const a = marketingAnchors(p);
          toast(n ? `Added ${n} marketing & festival tasks, timed from ${a.fromSchedule ? 'your first shoot day' : 'a shoot about six weeks from now'} and picture lock around ${formatDate(a.lock)}. Move the dates as your plan firms up.` : 'The marketing & festival checklist is already in your tasks.');
        }}>＋ Marketing & festival checklist</button>
        <RefLink page="marketing" />
      </div>
      <datalist id="people">{people.map((n) => <option key={n} value={n} />)}</datalist>
      <datalist id="depts">{DEPTS.map((n) => <option key={n} value={n} />)}</datalist>
      {groups.map((g) => g.tasks.length > 0 && (
        <div key={g.label} className={`task-group ${g.label === 'Overdue' ? 'overdue' : ''}`}>
          <h4>{g.label} <span className="muted small">{g.tasks.length}</span></h4>
          <ul className="task-list">
            {g.tasks.map((t, i) => (
              <LongPress as="li" key={t.id} title={t.title || 'Task'} actions={() => [
                { label: 'Move up', disabled: i === 0, run: () => swapOrder(t.id, g.tasks[i - 1].id) },
                { label: 'Move down', disabled: i === g.tasks.length - 1, run: () => swapOrder(t.id, g.tasks[i + 1].id) },
                { label: t.done ? 'Mark not done' : 'Mark done', run: () => set(t.id, { done: !t.done }, t.done ? 'Reopen task' : 'Complete task') },
                { label: 'Delete task', danger: true, run: () => update((d) => { d.tasks = d.tasks.filter((x) => x.id !== t.id); }, 'Delete task') },
              ]} className={`${t.done ? 'done' : ''} prio-${t.priority ?? 'normal'}`} draggable
                onDragStart={(e) => { setDragId(t.id); setDrag(e, { kind: 'task', id: t.id }); }}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => { if (dragId && dragId !== t.id) update((d) => { const a = d.tasks.find((x) => x.id === dragId)!; a.order = t.order - 0.5; a.due = t.due; d.tasks.sort((x, y) => x.order - y.order).forEach((x, i) => { x.order = i; }); }, 'Reorder tasks'); setDragId(null); }}>
                <span className="grip handle" title="Drag to reorder, or onto a calendar day">⋮⋮</span>
                <input type="checkbox" checked={t.done} onChange={(e) => set(t.id, { done: e.target.checked }, e.target.checked ? 'Complete task' : 'Reopen task')} />
                <input className="task-title" value={t.title} onChange={(e) => set(t.id, { title: e.target.value })} />
                <input type="date" value={t.due ?? ''} title="Due date" onChange={(e) => set(t.id, { due: e.target.value || undefined }, 'Set due date')} />
                <input className="w-md" list="people" placeholder="Owner" value={t.assignee ?? ''} onChange={(e) => set(t.id, { assignee: e.target.value || undefined })} />
                <input className="w-md" list="depts" placeholder="Department" value={t.department ?? ''} onChange={(e) => set(t.id, { department: e.target.value || undefined })} />
                <select value={t.priority ?? 'normal'} onChange={(e) => set(t.id, { priority: e.target.value as Task['priority'] }, 'Set priority')}>
                  <option value="high">High</option><option value="normal">Normal</option><option value="low">Low</option>
                </select>
                {t.due && <span className={`muted small ${t.due < today && !t.done ? 'bad' : ''}`}>{formatDate(t.due)}</span>}
                <button className="icon-btn" onClick={() => update((d) => { d.tasks = d.tasks.filter((x) => x.id !== t.id); }, 'Delete task')}>×</button>
              </LongPress>
            ))}
          </ul>
        </div>
      ))}
      {!p.tasks.length && <p className="muted pad"><Hint>{'No tasks yet. Type one above, or double-click empty space. Tasks with due dates appear on the Calendar.'}</Hint></p>}
    </div>
  );
}
