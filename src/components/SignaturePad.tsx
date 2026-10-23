import { useEffect, useRef, useState } from 'react';
import { Modal } from './common';
import { notePointer, pressureOf, samplesOf, widthFor } from '../ui/pen';

/**
 * "Sign here": hand the phone or iPad over. Draw with a finger, pen or mouse (pen pressure makes
 * the line heavier), or type a name. Returns the typed name and the drawing as a PNG, or null.
 */
export function SignaturePad({ title, text, defaultName, onDone, onCancel }: {
  title: string; text?: string; defaultName: string;
  onDone: (r: { name: string; png: Blob | null }) => void; onCancel: () => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const last = useRef<{ x: number; y: number } | null>(null);
  const [name, setName] = useState(defaultName);
  const [drawn, setDrawn] = useState(false);
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);

  // Size the canvas to its box at device resolution.
  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const fit = () => {
      const r = c.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      if (c.width === Math.round(r.width * dpr) && c.height === Math.round(r.height * dpr)) return;
      c.width = Math.round(r.width * dpr); c.height = Math.round(r.height * dpr);
      const g = c.getContext('2d')!;
      g.scale(dpr, dpr); g.lineCap = 'round'; g.lineJoin = 'round'; g.strokeStyle = '#111';
      setDrawn(false);
    };
    fit();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(fit) : null;
    ro?.observe(c);
    return () => ro?.disconnect();
  }, []);

  const pos = (e: PointerEvent | React.PointerEvent) => {
    const r = canvas.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const down = (e: React.PointerEvent<HTMLCanvasElement>) => {
    notePointer(e);
    e.preventDefault();
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* synthetic events */ }
    last.current = pos(e);
  };
  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!last.current) return;
    const g = canvas.current!.getContext('2d')!;
    for (const s of samplesOf(e)) {
      const p = pos(s);
      g.lineWidth = widthFor(2.4, pressureOf(s));
      g.beginPath(); g.moveTo(last.current.x, last.current.y); g.lineTo(p.x, p.y); g.stroke();
      last.current = p;
    }
    setDrawn(true);
  };
  const up = (e: React.PointerEvent<HTMLCanvasElement>) => { notePointer(e); last.current = null; };
  const clear = () => {
    const c = canvas.current!;
    c.getContext('2d')!.clearRect(0, 0, c.width, c.height);
    setDrawn(false);
  };
  const finish = async () => {
    setBusy(true);
    const png = drawn ? await new Promise<Blob | null>((res) => canvas.current!.toBlob((b) => res(b), 'image/png')) : null;
    onDone({ name: name.trim(), png });
  };

  return (
    <Modal title={title} onClose={onCancel} wide footer={
      <>
        <button onClick={onCancel}>Cancel</button>
        <button className="primary" disabled={!name.trim() || !agree || busy} onClick={() => void finish()}>Sign</button>
      </>
    }>
      <div className="sign-sheet">
        {text && <pre className="sign-text">{text}</pre>}
        <label className="field"><span>Full name</span><input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" /></label>
        <label className="check sign-agree"><input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} /> I've read this and agree to it. My typed name{drawn ? ' and drawing' : ''} is my signature.</label>
        <div className="sign-box">
          <canvas ref={canvas} className="sign-canvas" aria-label="Signature: draw here" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} />
          {!drawn && <span className="sign-hint muted">Sign here with a finger, pen or mouse (or just type your name above)</span>}
          {drawn && <button className="small sign-clear" onClick={clear}>Clear</button>}
        </div>
      </div>
    </Modal>
  );
}
