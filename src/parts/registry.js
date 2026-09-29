import { TEETH } from '../movement/layout.js';

// ─────────────────────────────────────────────────────────────
// Part encyclopedia. `rpmKey` pulls a live rate from the
// kinematics; everything else is descriptive.
// ─────────────────────────────────────────────────────────────

export const CATEGORIES = [
  'Case',
  'Dial & Hands',
  'Tourbillon',
  'Escapement',
  'Going Train',
  'Power',
  'Plates & Bridges',
  'Keyless Works',
  'Motion Works',
  'Jewels & Screws',
];

export const PARTS = {
  // ── Case ──────────────────────────────────────────────
  crystal: { name: 'Sapphire Crystal', cat: 'Case', material: 'Synthetic sapphire, double-domed, anti-reflective both sides',
    desc: 'Grown corundum — second only to diamond in hardness (Mohs 9). The violet sheen is the interference colour of its multi-layer anti-reflective coating.' },
  bezel: { name: 'Bezel', cat: 'Case', material: 'Mirror-polished precious metal',
    desc: 'Holds the crystal on a gasket. Its concave flank is mirror-polished to throw long, unbroken highlights.' },
  midcase: { name: 'Middle Case & Lugs', cat: 'Case', material: 'Vertically satin-brushed flanks, polished chamfers',
    desc: 'The structural heart of the case. Flanks are satin-brushed while the lug tops keep a polished bevel — the contrast is what makes a case read as "finished".' },
  caseback: { name: 'Caseback Ring', cat: 'Case', material: 'Polished, laser-engraved, 6 screws',
    desc: 'Screwed to the middle case with six screws. Carries the calibre engraving and frames the exhibition window.' },
  backCrystal: { name: 'Exhibition Caseback', cat: 'Case', material: 'Sapphire crystal',
    desc: 'A sapphire window so the hand-finished bridges, ratchet and click can be admired from the back.' },
  crown: { name: 'Crown', cat: 'Case', material: 'Fluted, engraved monogram',
    desc: 'Turn it to wind the mainspring. Watch the ratchet and click on the back — and the power-reserve gauge rise.', action: 'wind' },
  strap: { name: 'Alligator-Grain Strap', cat: 'Case', material: 'Calfskin, hand-stitched, navy',
    desc: 'Hand-stitched with contrasting saddle thread. Tapers from 22 mm at the lugs to 18 mm at the buckle.' },
  buckle: { name: 'Tang Buckle', cat: 'Case', material: 'Matching precious metal',
    desc: 'A classic pin buckle, polished to match the case.' },

  // ── Dial & Hands ──────────────────────────────────────
  dial: { name: 'Chapter Ring', cat: 'Dial & Hands', material: 'Clous de Paris guilloché, lacquered, printed',
    desc: 'An openworked dial: only the chapter ring and the tourbillon\'s seconds track remain, so the movement itself becomes the dial. The hobnail guilloché is cut with a rose engine.' },
  indices: { name: 'Applied Indices', cat: 'Dial & Hands', material: 'Polished gold with luminescent inserts',
    desc: 'Individually riveted hour markers with Super-LumiNova inlays that glow after exposure to light (try Night mode).' },
  sapphireDial: { name: 'Printed Sapphire Disc', cat: 'Dial & Hands', material: 'Smoked sapphire, pad-printed',
    desc: 'A floating tinted sapphire disc carrying the signature, through which the gear train is visible.' },
  hourHand: { name: 'Hour Hand', cat: 'Dial & Hands', material: 'Skeletonised leaf hand, lume filled', rpmKey: 'hourHand',
    desc: 'Driven by the hour wheel at one turn every 12 hours.' },
  minuteHand: { name: 'Minute Hand', cat: 'Dial & Hands', material: 'Skeletonised leaf hand, lume filled', rpmKey: 'minuteHand',
    desc: 'Friction-fitted on the cannon pinion so the time can be set without harming the train. One turn per hour.' },

  // ── Tourbillon ────────────────────────────────────────
  cageUpper: { name: 'Tourbillon Cage — Upper Frame', cat: 'Tourbillon', material: 'Titanium, black-polished, hand-bevelled', rpmKey: 'cage',
    desc: 'The cage carries the entire escapement and rotates once a minute, averaging out positional errors caused by gravity (Breguet, patent 1801). Its long arm doubles as the seconds hand. This is a flying tourbillon: no bridge above it.' },
  cageLower: { name: 'Tourbillon Cage — Lower Frame & Pillars', cat: 'Tourbillon', material: 'Titanium, three polished pillars', rpmKey: 'cage',
    desc: 'Supported from below only — the defining trait of a "flying" tourbillon. Carries the lower jewels of the balance, pallet fork and escape wheel.' },
  cagePinion: { name: 'Cage Pinion', cat: 'Tourbillon', material: 'Hardened steel', teeth: TEETH.cagePinion, rpmKey: 'cage',
    desc: 'Plays the role of the fourth pinion: driven by the third wheel, it turns the whole cage.' },
  fixedRing: { name: 'Fixed Fourth Wheel', cat: 'Tourbillon', material: 'Gilt brass, internal teeth', teeth: TEETH.fixedRing,
    desc: 'Screwed to the main plate and never moves. The escape pinion rolls around its internal teeth as the cage turns — that rolling is what drives the escape wheel.' },

  // ── Escapement ────────────────────────────────────────
  escapeWheel: { name: 'Escape Wheel & Pinion', cat: 'Escapement', material: 'Hardened steel, 15 club teeth', teeth: TEETH.escapeWheel, rpmKey: 'escape',
    desc: 'Releases the gear train half a tooth (12°) per beat. Each club tooth first locks on a pallet stone, then pushes on it (impulse), then drops onto the other stone. Its pinion rolls on the fixed wheel.' },
  palletFork: { name: 'Pallet Fork', cat: 'Escapement', material: 'Steel with two synthetic ruby pallet stones',
    desc: 'The Swiss lever. It rocks between two banking pins 6 times a second, alternately locking and unlocking the escape wheel and passing impulse to the balance through the ruby impulse pin. Try 1/20× speed.' },
  balance: { name: 'Screw Balance', cat: 'Escapement', material: 'Glucydur rim, 14 gold timing screws', rpmKey: null,
    desc: 'The heart of the watch. It swings ±280° at 3 Hz (21,600 vibrations per hour). The timing screws adjust its inertia; moving them in or out regulates the rate.' },
  hairspring: { name: 'Hairspring', cat: 'Escapement', material: 'Blue paramagnetic alloy, 12 coils',
    desc: 'An Archimedean spiral just 0.03 mm thick. It stores energy as the balance swings and returns it, setting the frequency. Watch the coils open and close as they "breathe".' },

  // ── Going Train ───────────────────────────────────────
  centerWheel: { name: 'Centre Wheel & Pinion', cat: 'Going Train', material: 'Gilt brass, circular-grained, 5 curved crossings', teeth: TEETH.centerWheel, rpmKey: 'center',
    desc: 'Turns exactly once an hour. Driven by the barrel, it drives the third wheel and carries the cannon pinion (minute hand).' },
  thirdWheel: { name: 'Third Wheel & Pinion', cat: 'Going Train', material: 'Gilt brass, circular-grained', teeth: TEETH.thirdWheel, rpmKey: 'third',
    desc: 'Steps up the speed 8.33× to turn the tourbillon cage once per minute.' },

  // ── Power ─────────────────────────────────────────────
  barrel: { name: 'Mainspring Barrel', cat: 'Power', material: 'Gilt brass, openworked covers', teeth: TEETH.barrel, rpmKey: 'barrel',
    desc: 'The energy store. Its toothed drum drives the centre pinion and turns once every 8 hours. Openworked covers reveal the mainspring inside.' },
  mainspring: { name: 'Mainspring', cat: 'Power', material: 'Nivaflex alloy spring',
    desc: 'Coils tightly around the arbor when wound and relaxes toward the drum wall as it delivers power — up to 72 hours of reserve.' },

  // ── Plates & Bridges ──────────────────────────────────
  mainplate: { name: 'Main Plate', cat: 'Plates & Bridges', material: 'Rhodium-plated brass, perlage, skeletonised',
    desc: 'The foundation every other part is built on. Openworked to let light through the movement, and decorated with perlage — overlapping circular graining applied spot by spot.' },
  barrelBridge: { name: 'Barrel Bridge', cat: 'Plates & Bridges', material: 'Ruthenium, Côtes de Genève, polished bevels',
    desc: 'Holds the barrel arbor and carries the ratchet and crown wheels. Its edges are hand-bevelled to a mirror polish (anglage).' },
  trainBridge: { name: 'Going-Train Bridge', cat: 'Plates & Bridges', material: 'Ruthenium, Côtes de Genève, polished bevels',
    desc: 'A sweeping S-shaped bridge holding the upper pivots of the centre and third wheels in jewelled bearings.' },
  tourbillonBridge: { name: 'Tourbillon Support Bridge', cat: 'Plates & Bridges', material: 'Ruthenium, Côtes de Genève',
    desc: 'Supports the cage from the back only, leaving the tourbillon free-floating on the dial side.' },
  pillars: { name: 'Pillars', cat: 'Plates & Bridges', material: 'Polished steel',
    desc: 'Space the bridges above the main plate with micrometre precision.' },

  // ── Keyless Works ─────────────────────────────────────
  stem: { name: 'Winding Stem & Pinion', cat: 'Keyless Works', material: 'Hardened steel', teeth: TEETH.windingPinion,
    desc: 'Transmits the crown\'s rotation into the movement. The winding pinion meshes with the contrate teeth of the crown wheel.' },
  crownWheel: { name: 'Crown Wheel', cat: 'Keyless Works', material: 'Steel, sunburst (soleillage) finish', teeth: TEETH.crownWheel,
    desc: 'Turns the ratchet wheel. Its contrate teeth underneath take the drive from the winding pinion at a right angle.' },
  ratchet: { name: 'Ratchet Wheel', cat: 'Keyless Works', material: 'Steel, soleillage, saw teeth', teeth: TEETH.ratchet,
    desc: 'Sits on the barrel arbor. Turning it tightens the mainspring; the click stops it from unwinding.' },
  click: { name: 'Click & Click Spring', cat: 'Keyless Works', material: 'Polished steel',
    desc: 'The pawl you hear when you wind a mechanical watch. It rides over each saw tooth and drops behind it.' },

  // ── Motion Works ──────────────────────────────────────
  cannonPinion: { name: 'Cannon Pinion', cat: 'Motion Works', material: 'Steel', teeth: TEETH.cannonPinion, rpmKey: 'cannon',
    desc: 'A hollow pinion friction-fitted on the centre arbor. Carries the minute hand and drives the motion works.' },
  minuteWheel: { name: 'Minute Wheel & Pinion', cat: 'Motion Works', material: 'Gilt brass', teeth: TEETH.minuteWheel, rpmKey: 'minuteWheel',
    desc: 'Reduces 12:36 then 10:40 — a combined 1:12 so the hour hand turns twelve times slower than the minute hand.' },
  hourWheel: { name: 'Hour Wheel', cat: 'Motion Works', material: 'Gilt brass', teeth: TEETH.hourWheel, rpmKey: 'hourWheel',
    desc: 'Rides on the cannon pinion and carries the hour hand.' },

  // ── Jewels & Screws ───────────────────────────────────
  jewels: { name: 'Ruby Jewel Bearings', cat: 'Jewels & Screws', material: 'Synthetic ruby (Al₂O₃ + Cr), gold chatons', multi: true,
    desc: 'Pierced, olive-domed rubies set in polished gold chatons. They reduce friction at every pivot. The count includes the pallet stones and the impulse jewel.' },
  screws: { name: 'Heat-Blued Screws', cat: 'Jewels & Screws', material: 'Steel, tempered to ~290 °C', multi: true,
    desc: 'Tempered over a flame until the oxide layer turns cornflower blue — and every slot aligned by hand, a hallmark of haute horlogerie.' },
};
