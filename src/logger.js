const LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };

const currentLevel = LEVELS[process.env.LOG_LEVEL?.toLowerCase()] ?? LEVELS.info;

export function log(level, msg, data = {}) {
  const numeric = LEVELS[level];
  if (numeric === undefined || numeric > currentLevel) return;
  const entry = { ts: new Date().toISOString(), level, msg, ...data };
  process.stderr.write(JSON.stringify(entry) + '\n');
}
