import { CREW } from './crew';

// Reference pages: short plain-language explainers written for Open Gate, a quick-reference
// table where it helps, an interactive tool, and links to where it's used in the app.

export type RefCategory = 'story' | 'camera' | 'lenses' | 'lighting' | 'audio' | 'video' | 'grip' | 'production' | 'crew' | 'post';

export const CATEGORIES: { id: RefCategory; label: string; icon: string }[] = [
  { id: 'story', label: 'Story', icon: '✎' },
  { id: 'camera', label: 'Camera', icon: '◉' },
  { id: 'lenses', label: 'Lenses', icon: '◎' },
  { id: 'lighting', label: 'Lighting', icon: '☀' },
  { id: 'audio', label: 'Audio', icon: '♪' },
  { id: 'video', label: 'Video & Data', icon: '▤' },
  { id: 'grip', label: 'Grip & Support', icon: '⌖' },
  { id: 'production', label: 'Production', icon: '☰' },
  { id: 'crew', label: 'Crew & departments', icon: '☺' },
  { id: 'post', label: 'Post', icon: '✂' },
];

export type ToolId = 'dof' | 'fov' | 'crop' | 'exposure' | 'shutter' | 'kelvin' | 'falloff' | 'storage' | 'audio' | 'battery' | 'power' | 'phone' | 'frameworks' | 'arcs';

export interface RefPage {
  id: string;
  category: RefCategory;
  title: string;
  /** One line under the title. */
  lead: string;
  sections: { h?: string; p: string }[];
  table?: { head: string[]; rows: string[][] };
  tool?: ToolId | ToolId[];
  /** Where it's used in Open Gate (tab ids). */
  use?: { tab: string; label: string }[];
  /** Extra words that should find this page in search. */
  keywords?: string;
  /** Library topics for "Learn more". */
  topics: string[];
}

export const PAGES: RefPage[] = [
  // ---------- Story ----------
  {
    id: 'frameworks', category: 'story', title: 'Story structures', lead: 'Maps for where a story turns. Pick one, then check your script against it.',
    sections: [
      { p: 'Every structure here is a different way of saying the same thing: a character wants something, things get in the way, and by the end something has changed. None of them is a rule. They’re most useful after a first draft, to see where a story sags or turns too late.' },
      { h: 'Using one in Open Gate', p: '“Use this structure” adds a beat sheet to Docs and marks each beat’s target page in the Screenplay’s Scenes list, next to where your scenes actually land, so you can see at a glance if the midpoint arrives on page 70 of 100.' },
    ],
    tool: 'frameworks', use: [{ tab: 'screenplay', label: 'Screenplay → Scenes' }, { tab: 'docs', label: 'Docs' }], topics: ['story', 'screenwriting'], keywords: 'beat sheet save the cat hero journey three act story circle',
  },
  {
    id: 'arcs', category: 'story', title: 'Character arcs', lead: 'How a character changes (or refuses to) over the story.',
    sections: [{ p: 'An arc is the gap between who a character is on page 1 and who they are at the end. Choose one per main character in Write → Characters (the Arc field) and the profile keeps it in view while you rewrite.' }],
    tool: 'arcs', use: [{ tab: 'characters', label: 'Write → Characters' }], topics: ['story', 'screenwriting'], keywords: 'arc change flaw lie truth',
  },
  {
    id: 'format', category: 'story', title: 'Screenplay format', lead: 'Why scripts look the way they do: one page is about one minute.',
    sections: [
      { p: 'Screenplays use 12-point Courier, fixed margins and set indents for each element so that a page reads at roughly a minute of screen time. That’s what makes page counts, eighths and schedules work.' },
      { h: 'Elements', p: 'Scene heading (INT./EXT. PLACE — TIME), action (what we see and hear, present tense), character cue, parenthetical (sparingly), dialogue, transition (CUT TO:, mostly left out today). Shots and centred text are rare.' },
      { h: 'Pagination conventions', p: 'Dialogue split across pages gets (MORE) and (CONT’D). Scene numbers appear in both margins once a script is locked for production.' },
    ],
    table: { head: ['Element', 'Left edge', 'Width'], rows: [['Scene heading / Action', '1.5″', '6.0″'], ['Character', '3.7″', '—'], ['Parenthetical', '3.1″', '2.0″'], ['Dialogue', '2.5″', '3.5″'], ['Transition', 'right-aligned to 7.5″', '—']] },
    use: [{ tab: 'screenplay', label: 'Write → Screenplay' }], topics: ['screenwriting'], keywords: 'courier margins indent cont more',
  },
  // ---------- Camera ----------
  {
    id: 'sensors', category: 'camera', title: 'Sensors & crop factor', lead: 'Sensor size changes how wide a lens looks and how shallow focus can get.',
    sections: [
      { p: 'A smaller sensor sees only the middle of what a lens projects, so the same lens looks “longer”. Crop factor compares a sensor with full frame (36 × 24 mm): multiply your focal length by it to get the full-frame equivalent field of view.' },
      { p: 'Super 35 is the traditional cinema size (about 1.4–1.5× crop). Bigger sensors make it easier to get shallow depth of field at the same framing; smaller ones keep more in focus.' },
    ],
    table: { head: ['Format', 'Size (mm)', 'Crop vs FF'], rows: [['Full frame', '36 × 24', '1.0×'], ['Super 35', '24.9 × 18.7', '≈1.4×'], ['APS-C', '23.5 × 15.6', '≈1.5×'], ['Micro Four Thirds', '17.3 × 13', '2.0×'], ['Super 16', '12.5 × 7.4', '≈2.9×'], ['1-inch', '13.2 × 8.8', '2.7×']] },
    tool: 'crop', use: [{ tab: 'designer', label: 'Visualize → Shot Designer (camera sensor)' }], topics: ['camera', 'cinematography'], keywords: 'super 35 full frame aps-c mft equivalent',
  },
  {
    id: 'frame-rates', category: 'camera', title: 'Frame rates & shutter angle', lead: '24 fps with a 180° shutter is the look audiences read as “film”.',
    sections: [
      { p: 'Shutter angle describes how long each frame is exposed as a share of the frame time. 180° means half the frame time: at 24 fps that’s 1/48 s (1/50 on most cameras). Smaller angles (90°, 45°) freeze motion and look staccato; larger ones smear it.' },
      { p: 'Shooting at a higher frame rate and playing back at 24 gives slow motion: 48 fps is 2× slower, 120 fps is 5×. Under mains-powered lights, keep your shutter in step with the mains frequency (50 Hz or 60 Hz) to avoid flicker.' },
    ],
    table: { head: ['Use', 'Frame rate'], rows: [['Cinema', '23.976 / 24'], ['PAL TV / Europe', '25'], ['NTSC TV / US broadcast', '29.97'], ['Sport, smooth motion', '50 / 59.94'], ['Slow motion', '48, 60, 96, 120+']] },
    tool: 'shutter', topics: ['camera', 'cinematography'], keywords: 'fps 180 degree rule slow motion flicker',
  },
  {
    id: 'exposure', category: 'camera', title: 'Exposure, ISO & ND', lead: 'Aperture, shutter and ISO trade off — ND filters let you keep the aperture you want.',
    sections: [
      { p: 'A stop is a doubling or halving of light. Opening from f/4 to f/2.8 is one stop more; going from 1/50 to 1/100 is one stop less. Because film shutter angle is usually fixed, cinematographers control exposure with the iris, ISO, lights and neutral density (ND) filters.' },
      { p: 'ND density 0.3 = 1 stop, 0.6 = 2 stops, 0.9 = 3 stops. Many cinema cameras have two “native” ISOs where noise is lowest — pick the nearest one and adjust light rather than ISO.' },
    ],
    table: { head: ['ND', 'Stops', 'Light through'], rows: [['0.3', '1', '50%'], ['0.6', '2', '25%'], ['0.9', '3', '12.5%'], ['1.2', '4', '6.25%'], ['1.5', '5', '3.1%'], ['1.8', '6', '1.6%']] },
    tool: 'exposure', topics: ['camera', 'cinematography', 'lighting'], keywords: 'stop iso nd filter aperture f-stop t-stop dual native',
  },
  {
    id: 'aspect', category: 'camera', title: 'Aspect ratios', lead: 'The shape of the frame — chosen for the story and the screen it ends up on.',
    sections: [{ p: 'Wider ratios suit landscapes and isolating characters in space; narrower ones feel intimate or classic. Decide early: it changes blocking, set width, and how close you need to be.' }],
    table: { head: ['Ratio', 'Where you see it'], rows: [['1.33:1 (4:3)', 'Classic TV, some art films'], ['1.66:1', 'European features'], ['1.78:1 (16:9)', 'HD TV, streaming'], ['1.85:1', 'US theatrical “flat”'], ['2.00:1', 'Streaming dramas'], ['2.39:1', 'Theatrical “scope”, anamorphic'], ['9:16', 'Phones, social video']] },
    topics: ['camera', 'cinematography'], keywords: 'widescreen scope anamorphic 16:9',
  },
  {
    id: 'smartphone', category: 'camera', title: 'Smartphone cinematography', lead: 'How far a phone can go as your A or B camera — and how to push it.',
    sections: [
      { p: 'Recent “Pro” iPhones and flagship Android phones shoot genuinely usable footage for shorts, music videos, B-roll and crash cams. The sensors are small, so the tricks are about control: lock everything, shoot a flat profile, keep the phone cool and the shutter at 180°.' },
      { h: 'Sensors', p: 'Main cameras on current flagships use roughly 1/1.3″ sensors (about 9.6 × 7.2 mm — a crop factor near 3.6–3.9×), with 48 MP (iPhone Pro) to 200 MP (Galaxy Ultra) pixel counts binned down for video. Ultra-wide and telephoto cameras use smaller sensors and look noisier in low light — use the main camera when you can. Depth of field is deep; shallow focus comes from distance to the background, not the lens.' },
      { h: 'Codecs & log', p: 'Phones record HEVC (H.265) or H.264 by default — small files, heavy compression. Pro iPhones (iPhone 13 Pro and later) can record Apple ProRes; iPhone 15 Pro and later add Apple Log, a flat log profile that grades much better, and can record ProRes straight to an external USB-C SSD (needed for the highest ProRes resolutions and frame rates). Recent Galaxy Ultra phones offer a Log profile and 8K; Pixel Pro phones offer 10-bit HDR and an 8K “Video Boost” mode processed in the cloud.' },
      { h: 'Get control', p: 'Use a camera app with manual control — the free Blackmagic Camera app (iOS and Android) gives shutter angle, ISO, white balance in kelvin, focus peaking, false colour, codecs and timecode. Lock focus, exposure and white balance; set 24 or 25 fps with a 180° shutter (1/48 or 1/50) and use a variable ND filter clip to keep it there in daylight.' },
      { h: 'Rig & workflow', p: 'A cage or gimbal, an external mic (or a separate recorder with timecode / a clap), a power bank, and an external SSD for ProRes. Phones throttle or stop when hot — shade them, take cases off, and keep spare storage. Offload with checksums like any other camera card, and label clips by day and camera.' },
      { p: 'Figures here are approximate and change every year — check your exact model’s camera and video specs before you rely on them.' },
    ],
    table: { head: ['Recording (approx.)', 'GB per minute', 'Notes'], rows: [
      ['HEVC 1080p30', '0.06', 'Default “high efficiency”'], ['HEVC 4K30', '0.19', ''], ['HEVC 4K60', '0.44', ''],
      ['Apple ProRes 422 HQ 1080p30', '1.7', 'Pro iPhones'], ['Apple ProRes 422 HQ 4K30', '6', 'Pro iPhones; Apple Log on 15 Pro and later'], ['Apple ProRes 422 HQ 4K60', '12', 'External SSD on supported models'],
      ['8K30 (Android flagships)', '0.6', 'Galaxy Ultra; very compressed'],
    ] },
    tool: 'phone', use: [{ tab: 'gear', label: 'Budget → Gear' }, { tab: 'designer', label: 'Shot Designer (sensor: Phone)' }], topics: ['camera', 'smartphone'],
    keywords: 'iphone android phone mobile prores apple log hevc samsung galaxy pixel blackmagic camera app gimbal',
  },
  // ---------- Lenses ----------
  {
    id: 'focal-length', category: 'lenses', title: 'Focal length & field of view', lead: 'Wide lenses show more and exaggerate depth; long lenses compress it.',
    sections: [
      { p: 'Focal length together with sensor size sets the angle of view. On Super 35, roughly 25–35 mm feels “normal”; below that is wide, above 50 mm is long. Moving the camera changes perspective; changing lenses only changes the framing — that’s why a long lens from far away “compresses” a street.' },
      { p: 'In the Shot Designer each camera’s cone is drawn from its lens and sensor, so you can see what fits in frame from where the camera stands.' },
    ],
    tool: 'fov', use: [{ tab: 'designer', label: 'Visualize → Shot Designer' }, { tab: 'shots', label: 'Shot Lists (Lens)' }], topics: ['lenses', 'cinematography'], keywords: 'angle of view wide telephoto compression',
  },
  {
    id: 'dof', category: 'lenses', title: 'Depth of field', lead: 'How much in front of and behind the focus point still looks sharp.',
    sections: [
      { p: 'Depth of field gets shallower with a wider aperture (smaller f-number), a longer lens, and a closer focus distance. The hyperfocal distance is the closest focus point at which everything out to infinity is acceptably sharp — useful for run-and-gun.' },
      { p: '“Acceptably sharp” depends on the circle of confusion: the calculator uses 0.03 mm for full frame and scales it to your sensor, a common convention. For big screens, focus pullers often work tighter.' },
    ],
    tool: 'dof', use: [{ tab: 'designer', label: 'Shot Designer cameras' }], topics: ['lenses', 'cinematography'], keywords: 'focus hyperfocal circle of confusion bokeh shallow',
  },
  {
    id: 'stops', category: 'lenses', title: 'f-stops & T-stops', lead: 'How wide the iris is open — and why cinema lenses are marked in T-stops.',
    sections: [
      { p: 'An f-stop is a ratio: the focal length divided by the width of the opening. f/2 on a 50mm lens is a 25mm opening. Each full stop (f/2 → f/2.8 → f/4…) halves the light, because the area of the opening halves.' },
      { p: 'A T-stop is the light that actually gets through the glass, measured. Lenses lose some light inside, and different lenses lose different amounts, so two lenses both set to f/2 can expose differently. A matched set of cine primes all at T2 gives the same exposure when you swap lenses — which is why cinema lenses are marked in T-stops.' },
      { h: 'In practice', p: 'Wider (smaller number) means more light and shallower depth of field; narrower means more in focus. Most lenses are sharpest a couple of stops down from wide open.' },
    ],
    table: { head: ['Full stops', 'Light vs the stop before'], rows: [['f/1', '—'], ['f/1.4', '½'], ['f/2', '½'], ['f/2.8', '½'], ['f/4', '½'], ['f/5.6', '½'], ['f/8', '½'], ['f/11', '½'], ['f/16', '½'], ['f/22', '½']] },
    tool: 'dof', topics: ['lenses'], keywords: 'aperture iris f-stop t-stop stop light',
  },
  {
    id: 'mounts', category: 'lenses', title: 'Lens mounts & adapters', lead: 'The mount decides which lenses fit which cameras.',
    sections: [
      { p: 'Every mount has a flange distance: how far the mount sits from the sensor. A lens can be adapted to a camera with a shorter flange distance by putting a spacer adapter between them (EF lenses on RF, E or L cameras, for example). Going the other way — a short-flange lens on a long-flange camera — usually isn’t possible without optics that cost quality.' },
      { p: 'Smart adapters pass power and data (autofocus, aperture, lens metadata); "dumb" ones don’t, which is fine for manual cine lenses. Speed boosters add glass to shrink the image onto a smaller sensor, gaining about a stop of light and widening the view.' },
    ],
    table: { head: ['Mount', 'Flange (mm)', 'Common on'], rows: [['PL', '52.0', 'Cinema cameras'], ['EF', '44.0', 'Canon DSLR, many cine'], ['F', '46.5', 'Nikon DSLR'], ['LPL', '44.0', 'ARRI large format'], ['RF', '20.0', 'Canon mirrorless'], ['E', '18.0', 'Sony mirrorless'], ['L', '20.0', 'Panasonic / Sigma / Leica'], ['MFT', '19.25', 'Micro Four Thirds']] },
    topics: ['lenses'], keywords: 'pl ef e-mount rf l-mount lpl mft adapter flange speed booster',
  },
  // ---------- Lighting ----------
  {
    id: 'colour-temp', category: 'lighting', title: 'Colour temperature & gels', lead: 'Tungsten is orange, daylight is blue; gels move one toward the other.',
    sections: [
      { p: 'Colour temperature is measured in kelvin. Tungsten bulbs sit around 3200K, daylight around 5600K. Your camera’s white balance decides which looks “white”. Mixing sources is fine when it’s a choice — warm practicals against a cool window is a classic look.' },
      { p: 'Gels shift colour by a fixed amount in mireds (1,000,000 ÷ kelvin), so the same gel has a different kelvin effect on different lights. CTO warms, CTB cools, plus/minus green fixes fluorescent and LED tint.' },
    ],
    tool: 'kelvin', use: [{ tab: 'designer', label: 'Shot Designer lights (kelvin)' }], topics: ['lighting'], keywords: 'kelvin cto ctb mired white balance gel tint green magenta',
  },
  {
    id: 'setups', category: 'lighting', title: 'Classic lighting setups', lead: 'Key, fill and back light — and the looks built from them.',
    sections: [
      { h: 'Three-point', p: 'A key light gives shape, a fill softens the shadows it leaves, a back light separates the subject from the background. The key-to-fill ratio sets the mood: close to even is bright and friendly, a big gap is dramatic.' },
      { h: 'Rembrandt', p: 'Key high and to the side so a small triangle of light falls on the far cheek. Moody and painterly.' },
      { h: 'High key / low key', p: 'High key: lots of soft, even light, few shadows (comedy, commercials). Low key: one strong source, deep shadows (noir, thriller).' },
      { h: 'Motivated light', p: 'Light that seems to come from something in the scene — a window, a lamp, a screen. Audiences accept almost anything as long as it feels motivated.' },
    ],
    table: { head: ['Ratio (key:fill)', 'Look'], rows: [['1:1', 'Flat, even'], ['2:1', 'Natural, gentle shape'], ['4:1', 'Dramatic'], ['8:1+', 'Noir, very contrasty']] },
    topics: ['lighting', 'cinematography'], keywords: 'key fill back rembrandt butterfly low key high key',
  },
  {
    id: 'falloff', category: 'lighting', title: 'Light falloff (inverse square)', lead: 'Double the distance, a quarter of the light — two stops.',
    sections: [{ p: 'Light from a small source spreads out, so its intensity drops with the square of the distance. Moving a light closer makes the subject brighter and the background darker (more falloff); moving it back and turning it up gives more even light across the room.' }],
    tool: 'falloff', topics: ['lighting'], keywords: 'inverse square distance stops',
  },
  // ---------- Audio ----------
  {
    id: 'levels', category: 'audio', title: 'Recording levels & formats', lead: 'Keep dialogue well below 0 dBFS; record WAV at 48 kHz.',
    sections: [
      { p: 'Digital audio clips hard at 0 dBFS. A common target for dialogue is peaks around −12 to −6 dBFS with average speech near −20. 32-bit float recorders are far harder to clip, but good gain staging still keeps noise down.' },
      { p: 'Film and TV use 48 kHz. 24-bit gives plenty of headroom. Every 6 dB is roughly double (or half) the signal level.' },
    ],
    table: { head: ['Format', 'Size per channel'], rows: [['48 kHz / 16-bit', '≈5.8 MB/min'], ['48 kHz / 24-bit', '≈8.6 MB/min'], ['96 kHz / 24-bit', '≈17 MB/min'], ['48 kHz / 32-bit float', '≈11.5 MB/min']] },
    tool: 'audio', topics: ['audio'], keywords: 'dbfs gain 32 bit float sample rate bit depth',
  },
  {
    id: 'mics', category: 'audio', title: 'Microphones & set sound', lead: 'Boom first, lavs as backup, and always record room tone.',
    sections: [
      { h: 'Polar patterns', p: 'Omni hears all round; cardioid favours the front; hypercardioid and shotgun mics are tighter still. Shotguns work best outdoors; indoors a hypercardioid often sounds more natural.' },
      { h: 'On set', p: 'Record 30–60 seconds of room tone at every location with everyone still — editors need it to fill gaps. Jam-sync timecode or slate every take. Keep a sound report so post knows which tracks hold what.' },
    ],
    topics: ['audio'], keywords: 'boom lav lavalier shotgun cardioid room tone timecode sound report',
  },
  // ---------- Video & data ----------
  {
    id: 'codecs', category: 'video', title: 'Codecs, bitrates & storage', lead: 'How much card and drive space a shoot really needs.',
    sections: [
      { p: 'Bitrate (megabits per second) sets how much space every minute takes. Long-GOP codecs (H.264, H.265) are small but harder to edit; intra-frame codecs (ProRes, DNx) are bigger and edit smoothly; RAW keeps the most latitude and is the biggest.' },
      { p: 'Chroma subsampling (4:2:0, 4:2:2, 4:4:4) is how much colour detail is kept. 10-bit or more matters for grading log footage.' },
    ],
    table: { head: ['Codec (UHD 25p, approx.)', 'Mbit/s', 'GB per hour'], rows: [['H.264 consumer', '100', '45'], ['H.265 10-bit', '150', '68'], ['ProRes 422 LT', '330', '149'], ['ProRes 422', '490', '221'], ['ProRes 422 HQ', '740', '333'], ['ProRes 4444', '1100', '495']] },
    tool: 'storage', topics: ['post', 'camera', 'data'], keywords: 'prores h264 h265 bitrate gb card raw 4:2:2 10 bit',
  },
  {
    id: 'data', category: 'video', title: 'Data wrangling & backups', lead: 'Three copies, two kinds of media, one somewhere else.',
    sections: [
      { p: 'The 3-2-1 rule: keep three copies of every card, on at least two different media, with one off set. Offload with software that verifies checksums, so you know each copy matches the card bit for bit, before a card is cleared.' },
      { p: 'Name cards and folders consistently (day, camera, card number), log them on the camera report, and never format a card until two verified copies exist.' },
    ],
    topics: ['data', 'post'], keywords: 'dit checksum offload backup 3-2-1 card',
  },
  // ---------- Grip ----------
  {
    id: 'support', category: 'grip', title: 'Camera support', lead: 'Matching heads and sticks to the camera’s weight.',
    sections: [
      { p: 'A fluid head’s payload range should cover your fully built camera — rigs often weigh twice the body. Too light a load and the counterbalance fights you; too heavy and tilts drift.' },
      { p: 'Bowl sizes (75 mm, 100 mm, 150 mm) and flat bases decide which heads fit which legs. Sliders, dollies and gimbals each add a move; a dolly on track gives the steadiest repeatable move.' },
    ],
    table: { head: ['Bowl', 'Typical payload'], rows: [['75 mm', 'up to ≈8 kg'], ['100 mm', '≈5–25 kg'], ['150 mm / Mitchell', 'heavy cinema rigs']] },
    topics: ['grip'], keywords: 'tripod head bowl payload slider dolly gimbal',
  },
  {
    id: 'power', category: 'grip', title: 'Power & batteries', lead: 'Watts, amps and how long a battery lasts.',
    sections: [
      { p: 'Watts = volts × amps. A household circuit should only be loaded to about 80% of its breaker rating. Add up every light on a circuit before plugging in.' },
      { p: 'Battery capacity is in watt-hours (Wh). Divide by the load in watts for an estimate of runtime, then allow a margin. Airlines typically allow batteries under 100 Wh in hand luggage; 100–160 Wh usually needs approval; check with the carrier.' },
    ],
    table: { head: ['Breaker', '120 V safe load', '230 V safe load'], rows: [['10 A', '960 W', '1840 W'], ['13 A', '—', '2390 W'], ['15 A', '1440 W', '—'], ['16 A', '—', '2940 W'], ['20 A', '1920 W', '—']] },
    tool: ['power', 'battery'], topics: ['grip', 'lighting'], keywords: 'watt amp volt circuit breaker v-mount wh battery runtime',
  },
  // ---------- Production ----------
  {
    id: 'scheduling', category: 'production', title: 'Scheduling terms', lead: 'Eighths, strips, DOOD codes and the rest of the AD’s vocabulary.',
    sections: [
      { p: 'Script pages are measured in eighths: a scene is 3/8 if it fills three eighths of a page. A day’s page count tells you how much you’re asking of the crew. Strips are colour-coded by INT/EXT and DAY/NIGHT.' },
      { p: 'Day Out of Days (DOOD) shows when each cast member works: SW start work, W work, WF work finish, SWF start-work-finish (one day), H hold, and drop/pickup when someone has a gap.' },
    ],
    table: { head: ['Strip colour', 'Means'], rows: [['White', 'INT. DAY'], ['Yellow', 'EXT. DAY'], ['Blue', 'INT. NIGHT'], ['Green', 'EXT. NIGHT']] },
    use: [{ tab: 'stripboard', label: 'Breakdown → Stripboard' }, { tab: 'dood', label: 'Day Out of Days' }], topics: ['production'], keywords: 'eighths dood sw wf hold strip colour boneyard',
  },
  {
    id: 'call-sheets', category: 'production', title: 'Call sheet anatomy', lead: 'Everything the crew needs to show up in the right place at the right time.',
    sections: [{ p: 'A call sheet carries the general crew call, the day’s scenes with pages and cast, each actor’s pickup / makeup / set times, locations with parking and the nearest hospital, weather and sunrise/sunset, special notes (stunts, animals, vehicles), and the next day’s advance schedule. It goes out the evening before.' }],
    use: [{ tab: 'callsheets', label: 'Shoot → Call Sheets' }], topics: ['production'], keywords: 'call time crew call advance schedule hospital',
  },
  {
    id: 'crew', category: 'production', title: 'Crew roles & set lingo', lead: 'Who does what, and what they’re shouting about.',
    sections: [
      { p: 'The first AD runs the set and the schedule; the DP leads camera, grip and electric; the gaffer heads lighting; the key grip rigs and moves the camera; the production designer leads the art department; the script supervisor tracks continuity and coverage.' },
      { h: 'Lingo', p: '“Martini” — the last shot of the day. “Abby Singer” — the second to last. “Back to one” — return to starting marks. “Checking the gate” — confirming the take is clean. “Flying in” — on the way. “Copy” — heard and understood.' },
    ],
    topics: ['production'], keywords: 'ad dp gaffer grip script supervisor martini abby singer',
  },
  {
    id: 'budget-terms', category: 'production', title: 'Budget terms', lead: 'Above the line, below the line, fringes and contingency.',
    sections: [
      { p: 'Above-the-line (ATL) costs are the creative leads — writer, director, producers, principal cast — often negotiated up front. Below-the-line (BTL) is everything that makes the film: crew, equipment, locations, post. Fringes are payroll costs on top of wages (taxes, union pension and health). Contingency is a safety margin, usually 10%.' },
    ],
    use: [{ tab: 'budget', label: 'Budget' }, { tab: 'gear', label: 'Gear' }], topics: ['production'], keywords: 'atl btl fringe contingency top sheet',
  },
  {
    id: 'coverage', category: 'production', title: 'Shot sizes & the 180° rule', lead: 'The vocabulary of a shot list.',
    sections: [
      { p: 'Shot sizes run from extreme wide (EWS) through wide (WS), medium (MS), medium close-up (MCU), close-up (CU) to extreme close-up (ECU). Coverage is the set of angles shot for a scene so the editor has choices.' },
      { p: 'The 180° rule: imagine a line between two characters and keep the camera on one side of it, so screen direction stays consistent. Cross it deliberately, or on a move the audience can follow.' },
    ],
    use: [{ tab: 'shots', label: 'Shot Lists' }, { tab: 'designer', label: 'Shot Designer' }], topics: ['cinematography', 'directing'], keywords: 'ews ws ms mcu cu ecu ots pov coverage line',
  },

  // ---------- Crew & departments ----------
  ...CREW.map((d): RefPage => ({
    id: `crew-${d.id}`, category: 'crew', title: d.title, lead: d.lead,
    sections: d.notes ? [{ p: d.notes }] : [],
    table: { head: ['Role', 'Reports to', 'What they do'], rows: d.roles },
    use: [{ tab: 'contacts', label: 'Plan → Contacts' }, { tab: 'setup', label: 'Settings → Crew' }, { tab: 'callsheets', label: 'Call Sheets' }],
    topics: ['production'], keywords: d.roles.map((r) => r[0]).join(' ').toLowerCase(),
  })),
  // ---------- Post ----------
  {
    id: 'editing', category: 'post', title: 'Cuts & transitions', lead: 'How shots join up.',
    sections: [{ p: 'A straight cut is invisible when it follows motivation. A match cut links two shots by shape or movement. J- and L-cuts let sound lead or trail the picture. A jump cut breaks continuity on purpose. Cutting on action hides the edit inside movement.' }],
    topics: ['post', 'editing'], keywords: 'match cut j cut l cut jump cut montage',
  },
  {
    id: 'deliverables', category: 'post', title: 'Deliverables', lead: 'What a finished film actually has to hand over.',
    sections: [{ p: 'Usually: a picture master (often ProRes 422 HQ or 4444, or a DCP for cinemas), stereo and 5.1 mixes plus separate dialogue / music / effects stems, captions and subtitles, a music cue sheet, and paperwork such as clearances and E&O insurance. Distributors and festivals publish their own specs — read them early.' }, { h: 'Making a DCP', p: 'A DCP (Digital Cinema Package) is the folder of files cinemas play. You don’t need a lab for festival screenings: DCP-o-matic is a free, open-source app that turns your master and audio into a DCP (see the library below).' }],
    topics: ['post'], keywords: 'dcp master stems m&e captions cue sheet',
  },
];

export const pageById = (id: string) => PAGES.find((p) => p.id === id);

