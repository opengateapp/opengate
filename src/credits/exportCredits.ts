import type { CreditBlock } from './credits';
import { visibleBlocks } from './credits';
import { csv } from '../io/reports';

// End credits out of Open Gate, into whatever builds the roll:
//   • text — paste into Premiere (Essential Graphics roll), Resolve (Text+ / Scroll), Final Cut
//     (Scrolling title), Avid Titler, Vegas…
//   • CSV — for credit services and spreadsheets
//   • After Effects script — builds a finished scrolling comp
//   • FCPXML — a Final Cut project with the credits as one title clip

/** Two columns separated by a tab (role ⇥ name), or everything centred (role above name). */
export function creditsText(blocks: CreditBlock[], layout: 'columns' | 'centered' = 'columns'): string {
  const out: string[] = [];
  for (const b of visibleBlocks(blocks)) {
    if (b.heading) out.push(b.heading.toUpperCase(), '');
    for (const l of b.lines) {
      const names = l.name.split('\n');
      if (b.style === 'card') {
        if (l.role) out.push(l.role);
        out.push(...names, '', '', '');
      } else if (b.style === 'columns' && layout === 'columns' && l.role) {
        out.push(`${l.role}\t${names[0]}`, ...names.slice(1).map((n) => `\t${n}`));
      } else if (b.style === 'names' || !l.role) {
        out.push(...names);
        if (b.style === 'centered') out.push('');
      } else {
        out.push(l.role, ...names, '');
      }
    }
    out.push('', '');
  }
  while (out.length && !out[out.length - 1]) out.pop();
  return out.join('\n') + '\n';
}

export function creditsCsv(blocks: CreditBlock[]): string {
  return csv([['Section', 'Role', 'Name'], ...visibleBlocks(blocks).flatMap((b) => b.lines.map((l) => [b.heading, l.role ?? '', l.name.replace(/\n/g, ' · ')]))]);
}

export interface RollOptions { width: number; height: number; fps: number; runtime: number; title: string }

/** Three aligned columns of text (right-aligned roles, left-aligned names, centred lines), line for line. */
export function rollColumns(blocks: CreditBlock[]): { left: string[]; right: string[]; center: string[]; big: boolean[] } {
  const left: string[] = [], right: string[] = [], center: string[] = [], big: boolean[] = [];
  const row = (l = '', r = '', c = '', isBig = false) => { left.push(l); right.push(r); center.push(c); big.push(isBig); };
  for (const b of visibleBlocks(blocks)) {
    if (b.heading) { row('', '', b.heading.toUpperCase(), true); row(); }
    for (const l of b.lines) {
      const names = l.name.split('\n');
      if (b.style === 'card') { if (l.role) row('', '', l.role); names.forEach((n) => row('', '', n, true)); row(); row(); row(); }
      else if (b.style === 'columns' && l.role) { row(l.role, names[0]); names.slice(1).forEach((n) => row('', n)); }
      else { if (l.role) row('', '', l.role); names.forEach((n) => row('', '', n)); if (b.style === 'centered') row(); }
    }
    row(); row();
  }
  return { left, right, center, big };
}

const js = (s: string) => JSON.stringify(s).replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');

/**
 * After Effects (File → Scripts → Run Script File…): makes a comp with three text layers (roles
 * right-aligned, names left-aligned, headings and cards centred) parented to a null that scrolls
 * the whole roll from below the frame to above it over the runtime.
 */
export function creditsJsx(blocks: CreditBlock[], o: RollOptions): string {
  const { left, right, center } = rollColumns(blocks);
  const size = Math.round(o.height / 30);
  const lead = Math.round(size * 1.45);
  const total = left.length * lead;
  const gap = Math.round(o.width * 0.015);
  return `// Open Gate end credits for After Effects — File > Scripts > Run Script File...
// Builds "${o.title} — End Credits": ${o.width}x${o.height}, ${o.fps} fps, ${o.runtime} s, ${left.length} lines.
(function () {
  app.beginUndoGroup("Open Gate end credits");
  var W = ${o.width}, H = ${o.height}, FPS = ${o.fps}, DUR = ${o.runtime}, SIZE = ${size}, LEAD = ${lead}, TOTAL = ${total}, GAP = ${gap};
  var comp = app.project.items.addComp(${js(`${o.title} — End Credits`)}, W, H, 1, DUR, FPS);
  comp.bgColor = [0, 0, 0];
  var roll = comp.layers.addNull(DUR);
  roll.name = "Roll (move me)";
  roll.property("Anchor Point").setValue([0, 0]);
  function textLayer(name, lines, just, x) {
    var t = comp.layers.addText(lines.join("\\r"));
    t.name = name;
    var src = t.property("Source Text");
    var doc = src.value;
    doc.fontSize = SIZE;
    doc.fillColor = [1, 1, 1];
    doc.justification = just;
    try { doc.font = "Helvetica"; } catch (e) {}
    try { doc.autoLeading = false; doc.leading = LEAD; } catch (e) {}
    src.setValue(doc);
    t.property("Position").setValue([x, SIZE]);
    t.parent = roll;
    return t;
  }
  textLayer("Roles", ${JSON.stringify(left)}, ParagraphJustification.RIGHT_JUSTIFY, W / 2 - GAP);
  textLayer("Names", ${JSON.stringify(right)}, ParagraphJustification.LEFT_JUSTIFY, W / 2 + GAP);
  textLayer("Headings & cards", ${JSON.stringify(center)}, ParagraphJustification.CENTER_JUSTIFY, W / 2);
  var pos = roll.property("Position");
  pos.setValueAtTime(0, [0, H]);
  pos.setValueAtTime(DUR, [0, -TOTAL]);
  comp.openInViewer();
  app.endUndoGroup();
  alert("End credits ready: " + ${js(`${o.title} — End Credits`)} + ". Change the speed by moving the Roll null's last keyframe.");
})();
`;
}

const xml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** FCPXML frame duration and rate for common frame rates. */
export function fcpRate(fps: number): { frame: string; perSec: number; name: string } {
  if (Math.abs(fps - 23.976) < 0.01) return { frame: '1001/24000s', perSec: 24000 / 1001, name: '2398' };
  if (Math.abs(fps - 29.97) < 0.01) return { frame: '1001/30000s', perSec: 30000 / 1001, name: '2997' };
  const r = Math.round(fps);
  return { frame: `100/${r * 100}s`, perSec: r, name: String(r) };
}

/**
 * Final Cut Pro (and apps that read FCPXML): a project with one Basic Title holding the whole roll
 * for the runtime. In Final Cut, swap it for Titles → Credits → Scrolling (or add your own roll).
 */
export function creditsFcpxml(blocks: CreditBlock[], o: RollOptions): string {
  const r = fcpRate(o.fps);
  const frames = Math.round(o.runtime * r.perSec);
  const [num, den] = r.frame.replace('s', '').split('/').map(Number);
  const dur = `${frames * num}/${den}s`;
  const text = creditsText(blocks, 'centered').replace(/\t/g, '   ').trimEnd();
  const fmt = `FFVideoFormat${o.height >= 2160 ? '3840x2160' : o.height >= 1080 ? '1080' : '720'}p${r.name}`;
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE fcpxml>
<fcpxml version="1.10">
  <resources>
    <format id="r1" name="${fmt}" frameDuration="${r.frame}" width="${o.width}" height="${o.height}" colorSpace="1-1-1 (Rec. 709)"/>
    <effect id="r2" name="Basic Title" uid=".../Titles.localized/Bumper:Opener.localized/Basic Title.localized/Basic Title.moti"/>
  </resources>
  <library>
    <event name="Open Gate">
      <project name="${xml(`${o.title} — End Credits`)}">
        <sequence format="r1" duration="${dur}" tcStart="0s" tcFormat="NDF" audioLayout="stereo" audioRate="48k">
          <spine>
            <title ref="r2" offset="0s" name="End credits" start="0s" duration="${dur}">
              <text>
                <text-style ref="ts1">${xml(text)}</text-style>
              </text>
              <text-style-def id="ts1">
                <text-style font="Helvetica" fontSize="${Math.round(o.height / 30)}" fontColor="1 1 1 1" alignment="center"/>
              </text-style-def>
            </title>
          </spine>
        </sequence>
      </project>
    </event>
  </library>
</fcpxml>
`;
}
