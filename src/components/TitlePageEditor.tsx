import { useEffect, useRef, useState } from 'react';
import { useProject, useStore } from '../store/project';
import { putMedia, useMediaUrl, blobToImage, getMedia } from '../store/media';
import { prepareImage } from '../tabs/storyboard/images';
import { toast } from './common';
import { titleLogoBox } from '../pdf/screenplayPdf';

// Title page, shown as the printed page: type straight onto it. The logo's size and spot
// match the PDF (positions come from titleLogoBox, which the PDF uses too).

export function TitlePageEditor() {
  const p = useProject();
  const update = useStore((s) => s.update);
  const tp = p.titlePage;
  const logo = useMediaUrl(tp.logoId);
  const [ratio, setRatio] = useState(1);
  const page = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const set = (k: keyof typeof tp, v: string) => update((d) => { (d.titlePage as unknown as Record<string, string>)[k] = v; if (k === 'title') d.title = v; }, null);

  useEffect(() => {
    if (!tp.logoId) return;
    void getMedia(tp.logoId).then(async (b) => { if (b) { const i = await blobToImage(b); setRatio(i.naturalHeight / Math.max(1, i.naturalWidth)); } });
  }, [tp.logoId]);

  // Scale the 8.5 × 11 in page to fit the window.
  useEffect(() => {
    const el = page.current!;
    const box = el.parentElement!;
    const fit = () => setZoom(Math.min(1, (box.clientWidth - 32) / el.offsetWidth));
    const ro = new ResizeObserver(fit);
    ro.observe(box);
    fit();
    return () => ro.disconnect();
  }, []);

  const lb = titleLogoBox(tp, ratio);
  const logoIsTitle = !!tp.logoId && (tp.logoPosition ?? 'title') === 'title';
  const fileRef = useRef<HTMLInputElement>(null);
  const uploadAsTitle = async (f?: File | null) => {
    if (!f) return;
    try {
      const id = await putMedia(p.id, await prepareImage(f));
      update((d) => { d.titlePage.logoId = id; d.titlePage.logoPosition = 'title'; d.titlePage.logoScale ??= 40; }, 'Title logo');
    } catch (e) { toast((e as Error).message); }
  };
  return (
    <div className="editor-scroll title-scroll">
      <div className="title-page" ref={page} style={{ zoom }}>
        {logo && lb && (
          <img className={`title-logo ${logoIsTitle ? 'as-title' : ''}`} src={logo} alt="Logo" style={{ left: `${lb.x}in`, top: `${lb.y}in`, width: `${lb.w}in` }}
            title={logoIsTitle ? 'Logo in place of the title — resize or move it in the side panel' : ''} />
        )}
        <div className="tp-block" style={{ top: `${lb?.titleTop ?? 3.36}in` }}>
          <div className="tp-title-row">
            {/* The title keeps its space when a logo replaces it, so the lines below line up with the PDF. */}
            <input className={`tp-title ${logoIsTitle ? 'hidden-title' : ''}`} value={tp.title} placeholder="TITLE" onChange={(e) => set('title', e.target.value)} tabIndex={logoIsTitle ? -1 : 0} />
            {!logoIsTitle
              ? <button className="tp-logo-btn" onClick={() => fileRef.current?.click()} title="Use a logo instead of (or with) the typed title">＋ Logo</button>
              : <button className="tp-logo-btn" onClick={() => update((d) => { d.titlePage.logoPosition = 'above'; }, 'Show title text')} title="Show the typed title again (the logo moves above it)">Show text title</button>}
            <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => { void uploadAsTitle(e.target.files?.[0]); e.target.value = ''; }} />
          </div>
          <input className="tp-line" value={tp.credit} placeholder="Written by" onChange={(e) => set('credit', e.target.value)} />
          <input className="tp-line" value={tp.author} placeholder="Author name(s)" onChange={(e) => set('author', e.target.value)} />
          <input className="tp-line tp-gap" value={tp.source} placeholder="Based on… (optional)" onChange={(e) => set('source', e.target.value)} />
        </div>
        <textarea className="tp-contact" rows={4} value={tp.contact} placeholder={'Contact\nAddress\nPhone\nEmail'} onChange={(e) => set('contact', e.target.value)} />
        <input className="tp-draft" value={tp.draftDate} placeholder="Draft / date" onChange={(e) => set('draftDate', e.target.value)} />
      </div>
      <div className="tp-phone-form">
        <p className="muted small">The page above shows the real layout; edit the text here.</p>
        <label className="field"><span>Title</span><input value={tp.title} onChange={(e) => set('title', e.target.value)} /></label>
        <label className="field"><span>Credit</span><input value={tp.credit} placeholder="Written by" onChange={(e) => set('credit', e.target.value)} /></label>
        <label className="field"><span>Author(s)</span><input value={tp.author} onChange={(e) => set('author', e.target.value)} /></label>
        <label className="field"><span>Based on</span><input value={tp.source} placeholder="Optional" onChange={(e) => set('source', e.target.value)} /></label>
        <label className="field"><span>Contact</span><textarea rows={4} value={tp.contact} placeholder={'Address\nPhone\nEmail'} onChange={(e) => set('contact', e.target.value)} /></label>
        <label className="field"><span>Draft / date</span><input value={tp.draftDate} onChange={(e) => set('draftDate', e.target.value)} /></label>
      </div>
    </div>
  );
}

/** Side-panel controls for the title page logo. */
export function TitleLogoControls() {
  const p = useProject();
  const update = useStore((s) => s.update);
  const tp = p.titlePage;
  const url = useMediaUrl(tp.logoId);
  const [over, setOver] = useState(false);
  const upload = async (f?: File | null) => {
    if (!f) return;
    try {
      const id = await putMedia(p.id, await prepareImage(f));
      update((d) => { d.titlePage.logoId = id; d.titlePage.logoScale ??= 40; d.titlePage.logoPosition ??= 'title'; }, 'Title page logo');
    } catch (e) { toast((e as Error).message); }
  };
  return (
    <div className="pad title-controls">
      <h4>Title page</h4>
      <p className="muted small">Type on the page to edit. It prints as the first page of the screenplay PDF.</p>
      <label className={`tp-drop ${over ? 'over' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); void upload(e.dataTransfer.files[0]); }}>
        {url ? <img src={url} alt="" /> : <span>Drop a logo here<br /><span className="muted small">or click to upload</span></span>}
        <input type="file" accept="image/*" hidden onChange={(e) => { void upload(e.target.files?.[0]); e.target.value = ''; }} />
      </label>
      {tp.logoId && (
        <>
          <label className="field"><span>Logo size — {tp.logoScale ?? 40}% of page width</span>
            <input type="range" min={8} max={90} value={tp.logoScale ?? 40} onChange={(e) => { const v = Number(e.target.value); update((d) => { d.titlePage.logoScale = v; }, null); }} />
          </label>
          <label className="field"><span>Position</span>
            <select value={tp.logoPosition ?? 'title'} onChange={(e) => update((d) => { d.titlePage.logoPosition = e.target.value as 'top'; }, 'Logo position')}>
              <option value="title">In place of the title</option>
              <option value="top">Top of page</option>
              <option value="above">Above the title</option>
              <option value="below">Below the credit</option>
            </select>
          </label>
          <button onClick={() => update((d) => { d.titlePage.logoId = undefined; }, 'Remove logo')}>Remove logo</button>
        </>
      )}
    </div>
  );
}
