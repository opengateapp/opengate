import { useState } from 'react';
import { SENSORS } from '../visualize/plan';
import {
  GELS, MM_PER_FT, amps, angleOfView, audioMbPerMin, circuitCapacityW, cocFor, cropFactor, dbToRatio, depthOfField, falloff, fmtDistance,
  frameWidthAt, gbPerHour, kelvinAfterShift, minutesOnCard, ndStops, ndTransmission, runtimeHours, shutterAngle, shutterSpeed,
} from './calc';
import type { ToolId } from './topics';

// Interactive tools on Reference pages. Each is self-contained; units follow the user's choice.

function Num({ label, value, onChange, step = 1, min = 0, suffix }: { label: string; value: number; onChange: (n: number) => void; step?: number; min?: number; suffix?: string }) {
  return (
    <label className="field tool-num"><span>{label}</span>
      <span className="row nowrap"><input type="number" inputMode="decimal" step={step} min={min} value={value} onChange={(e) => onChange(Number(e.target.value) || 0)} />{suffix && <span className="muted small">{suffix}</span>}</span>
    </label>
  );
}
function Out({ label, value, big }: { label: string; value: string; big?: boolean }) {
  return <div className={`tool-out ${big ? 'big' : ''}`}><span className="muted small">{label}</span><b>{value}</b></div>;
}
function SensorPick({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  return <label className="field"><span>Sensor</span><select value={value} onChange={(e) => onChange(e.target.value)}>{SENSORS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</select></label>;
}
const sensor = (id: string) => SENSORS.find((s) => s.id === id) ?? SENSORS[1];
const F_STOPS = [1.4, 2, 2.8, 4, 5.6, 8, 11, 16, 22];

function useUnits(): ['ft' | 'm', (u: 'ft' | 'm') => void] {
  const [u, setU] = useState<'ft' | 'm'>(() => { try { return (localStorage.getItem('opengate.units') as 'ft' | 'm') || 'ft'; } catch { return 'ft'; } });
  return [u, (x) => { setU(x); try { localStorage.setItem('opengate.units', x); } catch { /* ignore */ } }];
}
function UnitsSeg({ u, set }: { u: 'ft' | 'm'; set: (u: 'ft' | 'm') => void }) {
  return <div className="seg small">{(['ft', 'm'] as const).map((x) => <button key={x} className={u === x ? 'active' : ''} onClick={() => set(x)}>{x === 'ft' ? 'Feet' : 'Metres'}</button>)}</div>;
}

function DofTool() {
  const [units, setUnits] = useUnits();
  const [s, setS] = useState('s35');
  const [focal, setFocal] = useState(35);
  const [f, setF] = useState(2.8);
  const [dist, setDist] = useState(10);
  const toMm = (n: number) => (units === 'ft' ? n * MM_PER_FT : n * 1000);
  const r = depthOfField(focal, f, toMm(dist), cocFor(sensor(s).w));
  // Bar: 0 → 3× focus distance, showing the sharp zone.
  const max = toMm(dist) * 3;
  const pct = (mm: number) => `${Math.min(100, (mm / max) * 100)}%`;
  return (
    <div className="tool">
      <div className="tool-inputs">
        <SensorPick value={s} onChange={setS} />
        <Num label="Focal length" value={focal} onChange={setFocal} suffix="mm" />
        <label className="field"><span>Aperture</span><select value={f} onChange={(e) => setF(Number(e.target.value))}>{F_STOPS.map((x) => <option key={x} value={x}>f/{x}</option>)}</select></label>
        <Num label="Focus distance" value={dist} onChange={setDist} step={0.5} suffix={units} />
        <UnitsSeg u={units} set={setUnits} />
      </div>
      <div className="dof-bar" aria-hidden>
        <span className="dof-zone" style={{ left: pct(r.near), width: `calc(${pct(isFinite(r.far) ? r.far : max)} - ${pct(r.near)})` }} />
        <span className="dof-focus" style={{ left: pct(toMm(dist)) }} />
        <span className="dof-cam">◉</span>
      </div>
      <div className="tool-outputs">
        <Out label="Near limit" value={fmtDistance(r.near, units)} />
        <Out label="Far limit" value={fmtDistance(r.far, units)} />
        <Out label="Total depth" value={isFinite(r.total) ? fmtDistance(r.total, units) : '∞'} big />
        <Out label="Hyperfocal" value={fmtDistance(r.hyperfocal, units)} />
        <Out label="Horizontal view" value={`${angleOfView(focal, sensor(s).w).toFixed(1)}°`} />
      </div>
    </div>
  );
}

function FovTool() {
  const [units, setUnits] = useUnits();
  const [s, setS] = useState('s35');
  const [focal, setFocal] = useState(35);
  const [dist, setDist] = useState(10);
  const sn = sensor(s);
  const w = frameWidthAt(focal, sn.w, dist), h = frameWidthAt(focal, sn.h, dist);
  return (
    <div className="tool">
      <div className="tool-inputs">
        <SensorPick value={s} onChange={setS} />
        <Num label="Focal length" value={focal} onChange={setFocal} suffix="mm" />
        <Num label="Subject distance" value={dist} onChange={setDist} step={0.5} suffix={units} />
        <UnitsSeg u={units} set={setUnits} />
      </div>
      <div className="tool-outputs">
        <Out label="Horizontal angle" value={`${angleOfView(focal, sn.w).toFixed(1)}°`} big />
        <Out label="Vertical angle" value={`${angleOfView(focal, sn.h).toFixed(1)}°`} />
        <Out label="Frame width there" value={`${w.toFixed(1)} ${units}`} />
        <Out label="Frame height there" value={`${h.toFixed(1)} ${units}`} />
        <Out label="Full-frame equivalent" value={`${Math.round(focal * cropFactor(sn.w, sn.h))} mm`} />
      </div>
    </div>
  );
}

function CropTool() {
  const [s, setS] = useState('s35');
  const [focal, setFocal] = useState(50);
  const sn = sensor(s);
  const c = cropFactor(sn.w, sn.h);
  return (
    <div className="tool">
      <div className="tool-inputs"><SensorPick value={s} onChange={setS} /><Num label="Lens" value={focal} onChange={setFocal} suffix="mm" /></div>
      <div className="tool-outputs">
        <Out label="Crop factor" value={`${c.toFixed(2)}×`} big />
        <Out label="Looks like (full frame)" value={`${Math.round(focal * c)} mm`} />
        <Out label="For a 50mm full-frame look use" value={`${Math.round(50 / c)} mm`} />
      </div>
    </div>
  );
}

function ExposureTool() {
  const [nd, setNd] = useState(0.9);
  const [fps, setFps] = useState(24);
  const [angle, setAngle] = useState(180);
  return (
    <div className="tool">
      <div className="tool-inputs">
        <label className="field"><span>ND filter</span><select value={nd} onChange={(e) => setNd(Number(e.target.value))}>{[0.3, 0.6, 0.9, 1.2, 1.5, 1.8, 2.1].map((x) => <option key={x} value={x}>ND {x.toFixed(1)}</option>)}</select></label>
        <Num label="Frame rate" value={fps} onChange={setFps} suffix="fps" />
        <Num label="Shutter angle" value={angle} onChange={setAngle} step={1} suffix="°" />
      </div>
      <div className="tool-outputs">
        <Out label="ND cuts" value={`${ndStops(nd).toFixed(1)} stops`} big />
        <Out label="Light let through" value={`${(ndTransmission(nd) * 100).toFixed(1)}%`} />
        <Out label="Shutter speed" value={`1/${Math.round(1 / shutterSpeed(angle, fps))} s`} />
      </div>
    </div>
  );
}

function ShutterTool() {
  const [fps, setFps] = useState(24);
  const [angle, setAngle] = useState(180);
  const [denom, setDenom] = useState(50);
  return (
    <div className="tool">
      <div className="tool-inputs"><Num label="Frame rate" value={fps} onChange={setFps} suffix="fps" /><Num label="Shutter angle" value={angle} onChange={setAngle} suffix="°" /></div>
      <div className="tool-outputs"><Out label="Shutter speed" value={`1/${Math.round(1 / shutterSpeed(angle, fps))} s`} big /><Out label="Slow motion at 24p playback" value={`${(fps / 24).toFixed(2)}× slower`} /></div>
      <div className="tool-inputs"><Num label="Or a shutter speed of 1/…" value={denom} onChange={setDenom} suffix="s" /></div>
      <div className="tool-outputs"><Out label="…is a shutter angle of" value={`${Math.round(shutterAngle(1 / Math.max(1, denom), fps))}°`} /></div>
    </div>
  );
}

function KelvinTool() {
  const [k, setK] = useState(5600);
  return (
    <div className="tool">
      <div className="tool-inputs"><Num label="Light source" value={k} onChange={setK} step={100} suffix="K" /></div>
      <div className="kelvin-strip" style={{ background: 'linear-gradient(90deg, #ff8a2a, #ffd7a0, #ffffff, #cfe3ff, #8fb8ff)' }} aria-hidden>
        <span style={{ left: `${Math.min(100, Math.max(0, ((k - 2000) / 8000) * 100))}%` }} />
      </div>
      <table className="table compact"><thead><tr><th>Gel</th><th>Result</th><th>Notes</th></tr></thead>
        <tbody>{GELS.map((g) => <tr key={g.name}><td>{g.name}</td><td><b>{Math.round(kelvinAfterShift(k, g.shift) / 50) * 50}K</b></td><td className="muted small">{g.note}</td></tr>)}</tbody>
      </table>
    </div>
  );
}

function FalloffTool() {
  const [d1, setD1] = useState(5);
  const [d2, setD2] = useState(10);
  const r = falloff(d1, d2);
  return (
    <div className="tool">
      <div className="tool-inputs"><Num label="Light at" value={d1} onChange={setD1} step={0.5} suffix="distance" /><Num label="Moved to" value={d2} onChange={setD2} step={0.5} suffix="distance" /></div>
      <div className="tool-outputs"><Out label="Brightness" value={`${(r.ratio * 100).toFixed(0)}%`} big /><Out label="Change" value={`${r.stops >= 0 ? '−' : '+'}${Math.abs(r.stops).toFixed(1)} stops`} /></div>
    </div>
  );
}

function StorageTool() {
  const [mbps, setMbps] = useState(490);
  const [hours, setHours] = useState(4);
  const [card, setCard] = useState(512);
  const [copies, setCopies] = useState(3);
  return (
    <div className="tool">
      <div className="tool-inputs">
        <Num label="Bitrate" value={mbps} onChange={setMbps} suffix="Mbit/s" />
        <Num label="Footage per day" value={hours} onChange={setHours} step={0.5} suffix="hours" />
        <Num label="Card size" value={card} onChange={setCard} suffix="GB" />
        <Num label="Backup copies" value={copies} onChange={setCopies} suffix="(3-2-1)" />
      </div>
      <div className="tool-outputs">
        <Out label="Per hour" value={`${gbPerHour(mbps).toFixed(0)} GB`} />
        <Out label="Per day" value={`${(gbPerHour(mbps) * hours).toFixed(0)} GB`} big />
        <Out label="With all copies" value={`${((gbPerHour(mbps) * hours * copies) / 1000).toFixed(2)} TB / day`} />
        <Out label="Minutes per card" value={`${Math.floor(minutesOnCard(card, mbps))} min`} />
      </div>
    </div>
  );
}

function AudioTool() {
  const [db, setDb] = useState(-6);
  const [rate, setRate] = useState(48000);
  const [bits, setBits] = useState(24);
  const [ch, setCh] = useState(2);
  return (
    <div className="tool">
      <div className="tool-inputs"><Num label="Level change" value={db} onChange={setDb} step={1} min={-120} suffix="dB" /></div>
      <div className="tool-outputs"><Out label="Signal level" value={`${(dbToRatio(db) * 100).toFixed(0)}%`} big /><Out label="Rule of thumb" value="±6 dB ≈ double / half" /></div>
      <div className="tool-inputs">
        <label className="field"><span>Sample rate</span><select value={rate} onChange={(e) => setRate(Number(e.target.value))}>{[44100, 48000, 96000, 192000].map((x) => <option key={x} value={x}>{x / 1000} kHz</option>)}</select></label>
        <label className="field"><span>Bit depth</span><select value={bits} onChange={(e) => setBits(Number(e.target.value))}>{[16, 24, 32].map((x) => <option key={x} value={x}>{x}-bit{x === 32 ? ' float' : ''}</option>)}</select></label>
        <Num label="Tracks" value={ch} onChange={setCh} />
      </div>
      <div className="tool-outputs"><Out label="Per minute" value={`${audioMbPerMin(rate, bits, ch).toFixed(1)} MB`} /><Out label="Per hour" value={`${((audioMbPerMin(rate, bits, ch) * 60) / 1000).toFixed(2)} GB`} /></div>
    </div>
  );
}

function BatteryTool() {
  const [wh, setWh] = useState(98);
  const [w, setW] = useState(45);
  return (
    <div className="tool">
      <div className="tool-inputs"><Num label="Battery" value={wh} onChange={setWh} suffix="Wh" /><Num label="Load" value={w} onChange={setW} suffix="W" /></div>
      <div className="tool-outputs">
        <Out label="Runtime (≈85% usable)" value={`${runtimeHours(wh, w).toFixed(1)} h`} big />
        <Out label="Batteries for a 12-hour day" value={`${Math.ceil(12 / Math.max(0.01, runtimeHours(wh, w)))}`} />
        <Out label="Flying" value={wh < 100 ? 'Usually OK in hand luggage' : wh <= 160 ? 'Usually needs airline approval' : 'Usually not allowed'} />
      </div>
    </div>
  );
}

function PowerTool() {
  const [volts, setVolts] = useState(120);
  const [breaker, setBreaker] = useState(20);
  const [watts, setWatts] = useState(1200);
  const cap = circuitCapacityW(breaker, volts);
  return (
    <div className="tool">
      <div className="tool-inputs">
        <label className="field"><span>Mains</span><select value={volts} onChange={(e) => setVolts(Number(e.target.value))}><option value={120}>120 V (US)</option><option value={230}>230 V (UK / EU)</option></select></label>
        <Num label="Breaker" value={breaker} onChange={setBreaker} suffix="A" />
        <Num label="Lights on this circuit" value={watts} onChange={setWatts} step={50} suffix="W" />
      </div>
      <div className="tool-outputs">
        <Out label="Current draw" value={`${amps(watts, volts).toFixed(1)} A`} />
        <Out label="Safe load (80%)" value={`${Math.round(cap)} W`} />
        <Out label={watts <= cap ? 'OK' : 'Too much'} value={watts <= cap ? `${Math.round(cap - watts)} W spare` : `Over by ${Math.round(watts - cap)} W — split it`} big />
      </div>
    </div>
  );
}

export const TOOLS: Partial<Record<ToolId, () => JSX.Element>> = {
  dof: DofTool, fov: FovTool, crop: CropTool, exposure: ExposureTool, shutter: ShutterTool, kelvin: KelvinTool,
  falloff: FalloffTool, storage: StorageTool, audio: AudioTool, battery: BatteryTool, power: PowerTool,
};
