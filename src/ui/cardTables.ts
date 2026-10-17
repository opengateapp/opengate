// Tables with class "cards-on-phone" turn into stacked cards on phones (styles.css). For the
// card to say what each field is, every cell gets a data-label copied from its column header.
// A single observer keeps the labels current as tables render, so components don't have to.

function label(table: HTMLTableElement) {
  const heads = [...table.querySelectorAll(':scope > thead > tr:last-child > th')].map((th) => (th.textContent ?? '').trim());
  if (!heads.length) return;
  for (const tr of table.querySelectorAll<HTMLTableRowElement>(':scope > tbody > tr')) {
    let col = 0;
    for (const td of tr.cells) {
      const text = heads[col] ?? '';
      if (td.dataset.label !== text) td.dataset.label = text;
      col += td.colSpan || 1;
    }
  }
}

let scheduled = false;
function run() {
  scheduled = false;
  document.querySelectorAll<HTMLTableElement>('table.cards-on-phone').forEach(label);
}

export function startCardTables() {
  if (typeof MutationObserver === 'undefined') return;
  const obs = new MutationObserver(() => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(run);
  });
  obs.observe(document.body, { childList: true, subtree: true });
  run();
}
