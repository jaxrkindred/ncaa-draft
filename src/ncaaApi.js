const fetch = require('node-fetch');
const ALL_TEAMS = require('./teams');

// ── Lookup tables ─────────────────────────────────────────────────────────

// Regular team: abbr (lower) -> team id
const abbrToId = {};
const nameToId = {};
for (const t of ALL_TEAMS) {
  if (!t.firstFour) {
    abbrToId[t.abbr.toLowerCase()] = t.id;
    nameToId[t.name.toLowerCase()] = t.id;
  }
}

// First Four: each play-in team abbr -> { slotId, partnerAbbr }
// Used to detect play-in games and resolve TBD slots
const FF_BY_ABBR = {};   // e.g. 'tex' -> { slotId: 'W11', partnerAbbr: 'NCST' }
const FF_SLOTS = {};     // slotId -> [abbrA, abbrB]

for (const t of ALL_TEAMS) {
  if (t.firstFour) {
    const [a, b] = t.firstFourTeams;
    FF_BY_ABBR[a.abbr.toLowerCase()] = { slotId: t.id, partnerAbbr: b.abbr, name: a.name };
    FF_BY_ABBR[b.abbr.toLowerCase()] = { slotId: t.id, partnerAbbr: a.abbr, name: b.name };
    FF_SLOTS[t.id] = [a.abbr.toLowerCase(), b.abbr.toLowerCase()];
  }
}

// ESPN abbreviation quirks → our abbr
const ESPN_OVERRIDES = {
  ncst: 'NCST', ncsu: 'NCST',
  mich: 'MICH', msu:  'MSU',
  mia:  'MIA',  mioh: 'MIOH', miaoh: 'MIOH',
  osu:  'OSU',  isu:  'ISU',  slu:  'SLU',
  uva:  'UVA',  unc:  'UNC',  uk:   'UK',
  uga:  'UGA',  sju:  'SJU',  sjun: 'SJU',
  tamu: 'TAMU', vand: 'VAN',  vandy: 'VAN',
  stma: 'STMA', smc:  'STMA',
  gonz: 'GONZ', kenn: 'KENN', ksu:  'KENN',
  hp:   'HPU',  hpu:  'HPU',
  pvam: 'PV',   pv:   'PV',
  tnst: 'TNST', tsu:  'TNST',
  ndsu: 'NDSU', wrst: 'WRST', wsu:  'WRST',
  smu:  'SMU',  tex:  'TEX',  how:  'HOW',
  umbc: 'UMBC', leh:  'LEH',
};

function normalizeAbbr(espnAbbr) {
  const a = (espnAbbr || '').toLowerCase();
  return (ESPN_OVERRIDES[a] || a).toUpperCase();
}

function resolveRegularTeamId(abbr, displayName) {
  const a = (abbr || '').toLowerCase();
  if (abbrToId[a]) return abbrToId[a];
  const n = (displayName || '').toLowerCase();
  for (const [key, id] of Object.entries(nameToId)) {
    if (n === key || n.startsWith(key) || key.startsWith(n)) return id;
  }
  return null;
}

// ── Main export ───────────────────────────────────────────────────────────

/**
 * Fetches completed tournament games and returns:
 *   newlyResolved:  { [slotId]: { winnerId, winnerName, winnerAbbr } }
 *   newlyEliminated: Set<teamId or slotId>
 *
 * knownResolved: current map of already-resolved slots { slotId -> winnerAbbr }
 * so we can tell whether a First Four team's loss is a play-in loss or a later-round loss.
 */
async function fetchTournamentUpdates(knownResolved = {}) {
  const games = await fetchAllCompletedGames();

  const newlyResolved = {};
  const newlyEliminated = new Set();

  // Build a runtime abbr->slotId lookup that includes already-known resolutions
  // winnerAbbr (upper) -> slotId  (so we can detect "resolved team lost in main bracket")
  const resolvedWinnerToSlot = {};
  for (const [slotId, winnerAbbr] of Object.entries(knownResolved)) {
    resolvedWinnerToSlot[winnerAbbr.toUpperCase()] = slotId;
  }

  // ── Pass 1: identify play-in game results ─────────────────────────────
  for (const game of games) {
    const a1 = normalizeAbbr(game.team1.abbr);
    const a2 = normalizeAbbr(game.team2.abbr);
    const ff1 = FF_BY_ABBR[a1.toLowerCase()];
    const ff2 = FF_BY_ABBR[a2.toLowerCase()];

    // Both teams are in the same First Four slot → this is a play-in game
    if (ff1 && ff2 && ff1.slotId === ff2.slotId) {
      const slotId = ff1.slotId;
      if (knownResolved[slotId]) continue; // already resolved

      const winnerAbbr = game.winnerAbbr ? normalizeAbbr(game.winnerAbbr) : null;
      if (!winnerAbbr) continue;

      const ffEntry = FF_BY_ABBR[winnerAbbr.toLowerCase()];
      newlyResolved[slotId] = {
        winnerId:    winnerAbbr,
        winnerName:  ffEntry ? ffEntry.name : winnerAbbr,
        winnerAbbr,
      };
      resolvedWinnerToSlot[winnerAbbr] = slotId;
    }
  }

  // Merge newly resolved into the runtime lookup for pass 2
  for (const [slotId, info] of Object.entries(newlyResolved)) {
    resolvedWinnerToSlot[info.winnerAbbr] = slotId;
  }

  // ── Pass 2: identify elimination results ──────────────────────────────
  for (const game of games) {
    const a1 = normalizeAbbr(game.team1.abbr);
    const a2 = normalizeAbbr(game.team2.abbr);
    const ff1 = FF_BY_ABBR[a1.toLowerCase()];
    const ff2 = FF_BY_ABBR[a2.toLowerCase()];

    // Skip play-in games (already handled above)
    if (ff1 && ff2 && ff1.slotId === ff2.slotId) continue;

    const loserAbbr = game.loserAbbr ? normalizeAbbr(game.loserAbbr) : null;
    if (!loserAbbr) continue;

    // Is the loser a resolved First Four winner?
    const slotId = resolvedWinnerToSlot[loserAbbr];
    if (slotId) {
      newlyEliminated.add(slotId);
      continue;
    }

    // Regular team?
    const teamId = resolveRegularTeamId(loserAbbr, game.loserName);
    if (teamId) newlyEliminated.add(teamId);
  }

  return { newlyResolved, newlyEliminated };
}

// ── ESPN API fetching ─────────────────────────────────────────────────────

async function fetchAllCompletedGames() {
  const dates = getPollDates();
  const results = await Promise.all(dates.map(fetchGamesForDate));
  return results.flat();
}

async function fetchGamesForDate(date) {
  try {
    const url = `https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/scoreboard?groups=100&limit=50&dates=${date}`;
    const res = await fetch(url, { timeout: 8000 });
    if (!res.ok) return [];
    const data = await res.json();
    const games = [];

    for (const event of data.events || []) {
      for (const comp of event.competitions || []) {
        if (!comp.status?.type?.completed) continue;
        const competitors = comp.competitors || [];
        if (competitors.length !== 2) continue;

        const [c1, c2] = competitors;
        const winner = competitors.find(c => c.winner === true);
        const loser  = competitors.find(c => c.winner === false);
        if (!winner || !loser) continue;

        games.push({
          team1:      { abbr: c1.team?.abbreviation, name: c1.team?.displayName },
          team2:      { abbr: c2.team?.abbreviation, name: c2.team?.displayName },
          winnerAbbr: winner.team?.abbreviation,
          loserAbbr:  loser.team?.abbreviation,
          loserName:  loser.team?.displayName,
        });
      }
    }
    return games;
  } catch {
    return [];
  }
}

// Poll the last 20 days to catch all completed games since tournament began
function getPollDates() {
  const today = new Date();
  return Array.from({ length: 21 }, (_, i) => {
    const d = new Date(today);
    d.setDate(d.getDate() - (20 - i));
    return d.toISOString().slice(0, 10).replace(/-/g, '');
  });
}

module.exports = { fetchTournamentUpdates };
