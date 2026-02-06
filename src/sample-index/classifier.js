import path from 'node:path';

export const INSTRUMENT_KEYWORDS = {
  kick: ['kick', 'kck', 'bd', 'bassdrum', 'bass_drum', 'bass-drum'],
  snare: ['snare', 'snr', 'sd', 'rimshot', 'rim'],
  hihat: ['hihat', 'hh', 'hat', 'hi-hat', 'hi_hat', 'open-hat', 'closed-hat', 'openhat', 'closedhat'],
  cymbal: ['cymbal', 'cym', 'crash', 'ride', 'splash'],
  perc: ['perc', 'percussion', 'conga', 'bongo', 'shaker', 'tambourine', 'tamb', 'clap', 'clp', 'snap', 'tom', 'cowbell'],
  bass: ['bass', 'sub', '808', 'reese'],
  synth: ['synth', 'lead', 'pad', 'arp', 'pluck', 'stab', 'chord'],
  keys: ['keys', 'piano', 'organ', 'rhodes', 'wurlitzer', 'epiano', 'e-piano', 'clavinet'],
  guitar: ['guitar', 'gtr', 'acoustic-guitar', 'electric-guitar'],
  vocal: ['vocal', 'vox', 'voice', 'acapella', 'acappella', 'choir', 'sing'],
  fx: ['fx', 'sfx', 'effect', 'riser', 'sweep', 'impact', 'downlifter', 'uplifter', 'noise', 'foley', 'transition'],
  loop: ['loop', 'break', 'breakbeat', 'toploop', 'top-loop', 'drum-loop', 'drumloop']
};

export const CHARACTER_KEYWORDS = [
  'warm', 'dark', 'bright', 'punchy', 'soft', 'hard', 'dry', 'wet',
  'analog', 'digital', 'lo-fi', 'lofi', 'vintage', 'modern',
  'aggressive', 'mellow', 'crisp', 'fat', 'thin', 'heavy', 'light',
  'deep', 'raw', 'clean', 'dirty', 'distorted', 'filtered', 'processed',
  'organic', 'acoustic', 'electric', 'ambient', 'atmospheric'
];

const bpmPatterns = [
  /(\d{2,3})\s*bpm/,
  /bpm\s*(\d{2,3})/,
  /[_\-](\d{2,3})[_\-]/
];

const keyPattern = /(?:^|[_\-\s.])([A-G][#b]?)\s*(min(?:or)?|maj(?:or)?|m(?=[_\-\s.]|$))(?=[_\-\s.]|$)/i;

function normalizeKey(note, quality) {
  const q = quality.toLowerCase();
  if (q === 'min' || q === 'minor' || q === 'm') return note + 'min';
  if (q === 'maj' || q === 'major') return note + 'maj';
  return note + q;
}

export function classifyFromPath(filePath) {
  const filename = path.basename(filePath);
  const dirname = path.dirname(filePath);
  const lowerFilename = filename.toLowerCase();
  const lowerDirname = dirname.toLowerCase();

  // Instrument type: filename match takes priority
  let instrument_type = null;
  for (const [type, keywords] of Object.entries(INSTRUMENT_KEYWORDS)) {
    for (const kw of keywords) {
      const re = new RegExp('(?:^|[_\\-\\s./\\\\])' + kw.replace('-', '\\-') + '(?:$|[_\\-\\s./\\\\])', 'i');
      if (re.test(lowerFilename)) {
        instrument_type = type;
        break;
      }
    }
    if (instrument_type) break;
  }
  // Fallback: check directory path if no filename match
  if (!instrument_type) {
    for (const [type, keywords] of Object.entries(INSTRUMENT_KEYWORDS)) {
      for (const kw of keywords) {
        const re = new RegExp('(?:^|[_\\-\\s./\\\\])' + kw.replace('-', '\\-') + '(?:$|[_\\-\\s./\\\\])', 'i');
        if (re.test(lowerDirname)) {
          instrument_type = type;
          break;
        }
      }
      if (instrument_type) break;
    }
  }

  // BPM extraction from filename
  let bpm = null;
  for (const pattern of bpmPatterns) {
    const match = lowerFilename.match(pattern);
    if (match) {
      const val = parseInt(match[1], 10);
      if (val >= 40 && val <= 300) {
        bpm = val;
        break;
      }
    }
  }

  // Key extraction from filename
  let key = null;
  const keyMatch = filename.match(keyPattern);
  if (keyMatch) {
    const note = keyMatch[1].charAt(0).toUpperCase() + keyMatch[1].slice(1);
    key = normalizeKey(note, keyMatch[2]);
  }

  // Character tags from filename tokens
  const tokens = lowerFilename
    .replace(/\.[^.]+$/, '')
    .split(/[_\-\s.]+/);
  const character_tags = [];
  for (const token of tokens) {
    if (CHARACTER_KEYWORDS.includes(token) && !character_tags.includes(token)) {
      character_tags.push(token);
    }
  }

  return { instrument_type, bpm, key, character_tags };
}
