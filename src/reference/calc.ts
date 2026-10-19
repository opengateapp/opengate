// Reference calculators: standard optics, exposure, light, sound, data and power formulas.
// All distances in millimetres unless named otherwise; results rounded by the UI.

export const MM_PER_FT = 304.8;

/** Circle of confusion (mm) commonly used for a sensor width: full-frame 0.03, scaled by width. */
export const cocFor = (sensorWidthMm: number) => Math.round((0.03 * sensorWidthMm) / 36 * 10000) / 10000;

/** Depth of field. focus in mm. Returns near / far limits (far = Infinity past hyperfocal) and hyperfocal. */
export function depthOfField(focalMm: number, fStop: number, focusMm: number, cocMm: number) {
  const H = (focalMm * focalMm) / (fStop * cocMm) + focalMm;
  const near = (focusMm * (H - focalMm)) / (H + focusMm - 2 * focalMm);
  const far = focusMm >= H ? Infinity : (focusMm * (H - focalMm)) / (H - focusMm);
  return { hyperfocal: H, near, far, total: far - near };
}

/** Angle of view in degrees across a sensor dimension. */
export const angleOfView = (focalMm: number, sizeMm: number) => (2 * Math.atan(sizeMm / (2 * focalMm)) * 180) / Math.PI;

/** Width of frame (same unit as distance) at a distance. */
export const frameWidthAt = (focalMm: number, sensorWidthMm: number, distance: number) => (distance * sensorWidthMm) / focalMm;

/** Crop factor against full frame (by diagonal) and the full-frame equivalent focal length. */
export function cropFactor(sensorW: number, sensorH: number) {
  return Math.hypot(36, 24) / Math.hypot(sensorW, sensorH);
}

/** Shutter angle ↔ shutter speed at a frame rate. */
export const shutterSpeed = (angle: number, fps: number) => (angle / 360) / fps; // seconds
export const shutterAngle = (seconds: number, fps: number) => seconds * fps * 360;

/** Stops between two exposures (positive = brighter). */
export const stopsBetween = (a: number, b: number) => Math.log2(b / a);
/** ND filters: optical density 0.3 = 1 stop. Returns stops and the light let through. */
export const ndStops = (density: number) => density / 0.3;
export const ndTransmission = (density: number) => Math.pow(10, -density);
/** Exposure value at ISO 100: EV = log2(N² / t). */
export const exposureValue = (fStop: number, seconds: number, iso = 100) => Math.log2((fStop * fStop) / seconds) - Math.log2(iso / 100);

/** Colour temperature: mireds and the shift a gel makes. */
export const mired = (kelvin: number) => 1e6 / kelvin;
export const kelvinAfterShift = (kelvin: number, miredShift: number) => 1e6 / (mired(kelvin) + miredShift);
/** Common correction gels: mired shift (positive warms). */
export const GELS: { name: string; shift: number; note: string }[] = [
  { name: 'Full CTO', shift: 159, note: 'Daylight → roughly tungsten (about 3000K)' },
  { name: '½ CTO', shift: 81, note: 'Daylight → about 4100K' },
  { name: '¼ CTO', shift: 42, note: 'A gentle warm-up' },
  { name: '⅛ CTO', shift: 20, note: 'Barely warmer' },
  { name: 'Full CTB', shift: -131, note: 'Tungsten 3200K → daylight ~5500K' },
  { name: '½ CTB', shift: -68, note: 'Tungsten → about 4100K' },
  { name: '¼ CTB', shift: -35, note: 'A gentle cool-down' },
  { name: '⅛ CTB', shift: -18, note: 'Barely cooler' },
];

/** Inverse square: brightness at a new distance (same units), and stops lost. */
export const falloff = (d1: number, d2: number) => ({ ratio: (d1 / d2) ** 2, stops: Math.log2((d2 / d1) ** 2) });

/** Recording: data rate (Mbit/s) → GB per hour, and minutes on a card (GB, decimal). */
export const gbPerHour = (mbps: number) => (mbps * 3600) / 8 / 1000;
export const minutesOnCard = (cardGb: number, mbps: number) => (cardGb * 1000 * 8) / mbps / 60;
/** Uncompressed / RAW-ish estimate: width × height × bits per pixel × fps → Mbit/s. */
export const rawMbps = (w: number, h: number, bitsPerPixel: number, fps: number) => (w * h * bitsPerPixel * fps) / 1e6;

/** Audio: dB ↔ amplitude ratio, and adding two equal sources. */
export const dbToRatio = (db: number) => Math.pow(10, db / 20);
export const ratioToDb = (ratio: number) => 20 * Math.log10(ratio);
/** Uncompressed audio file size: MB per minute. */
export const audioMbPerMin = (sampleRate: number, bitDepth: number, channels: number) => (sampleRate * bitDepth * channels * 60) / 8 / 1e6;

/** Batteries: watt-hours ÷ draw (W) → hours, with a usable fraction (default 85%). */
export const runtimeHours = (wh: number, watts: number, usable = 0.85) => (wh * usable) / Math.max(0.1, watts);
/** Power: W = V × A; how much a circuit can safely carry (80% rule). */
export const amps = (watts: number, volts: number) => watts / volts;
export const circuitCapacityW = (breakerAmps: number, volts: number, safety = 0.8) => breakerAmps * volts * safety;

/** Formats a length in mm as feet + inches or metres. */
export function fmtDistance(mm: number, units: 'ft' | 'm'): string {
  if (!isFinite(mm)) return '∞';
  if (units === 'm') return `${(mm / 1000).toFixed(mm < 1000 ? 2 : 1)} m`;
  const inches = mm / 25.4;
  const ft = Math.floor(inches / 12);
  const inch = Math.round(inches - ft * 12);
  return inch === 12 ? `${ft + 1}′ 0″` : `${ft}′ ${inch}″`;
}
