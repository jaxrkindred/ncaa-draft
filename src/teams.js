// 2026 NCAA Tournament - 64 draft slots
// The 4 First Four play-in games are represented as single TBD slots.
// firstFour: true slots have firstFourTeams listing the two competitors.
// resolvedTeam is populated at runtime once the play-in result is known.

const TEAMS = [
  // ── EAST REGION (16 slots, no First Four games) ───────────────────────
  { id: 'DUKE',  name: 'Duke',               seed: 1,  region: 'East',    abbr: 'DUKE',  firstFour: false },
  { id: 'CONN',  name: 'UConn',              seed: 2,  region: 'East',    abbr: 'CONN',  firstFour: false },
  { id: 'MSU',   name: 'Michigan State',     seed: 3,  region: 'East',    abbr: 'MSU',   firstFour: false },
  { id: 'KAN',   name: 'Kansas',             seed: 4,  region: 'East',    abbr: 'KAN',   firstFour: false },
  { id: 'SJU',   name: "St. John's",         seed: 5,  region: 'East',    abbr: 'SJU',   firstFour: false },
  { id: 'LOU',   name: 'Louisville',         seed: 6,  region: 'East',    abbr: 'LOU',   firstFour: false },
  { id: 'UCLA',  name: 'UCLA',               seed: 7,  region: 'East',    abbr: 'UCLA',  firstFour: false },
  { id: 'OSU',   name: 'Ohio State',         seed: 8,  region: 'East',    abbr: 'OSU',   firstFour: false },
  { id: 'TCU',   name: 'TCU',                seed: 9,  region: 'East',    abbr: 'TCU',   firstFour: false },
  { id: 'UCF',   name: 'UCF',                seed: 10, region: 'East',    abbr: 'UCF',   firstFour: false },
  { id: 'USF',   name: 'South Florida',      seed: 11, region: 'East',    abbr: 'USF',   firstFour: false },
  { id: 'UNI',   name: 'Northern Iowa',      seed: 12, region: 'East',    abbr: 'UNI',   firstFour: false },
  { id: 'CBU',   name: 'Cal Baptist',        seed: 13, region: 'East',    abbr: 'CBU',   firstFour: false },
  { id: 'NDSU',  name: 'North Dakota State', seed: 14, region: 'East',    abbr: 'NDSU',  firstFour: false },
  { id: 'FUR',   name: 'Furman',             seed: 15, region: 'East',    abbr: 'FUR',   firstFour: false },
  { id: 'SIE',   name: 'Siena',              seed: 16, region: 'East',    abbr: 'SIE',   firstFour: false },

  // ── WEST REGION (15 regular + 1 TBD = 16 slots) ──────────────────────
  { id: 'ARIZ',  name: 'Arizona',            seed: 1,  region: 'West',    abbr: 'ARIZ',  firstFour: false },
  { id: 'PUR',   name: 'Purdue',             seed: 2,  region: 'West',    abbr: 'PUR',   firstFour: false },
  { id: 'GONZ',  name: 'Gonzaga',            seed: 3,  region: 'West',    abbr: 'GONZ',  firstFour: false },
  { id: 'ARK',   name: 'Arkansas',           seed: 4,  region: 'West',    abbr: 'ARK',   firstFour: false },
  { id: 'WIS',   name: 'Wisconsin',          seed: 5,  region: 'West',    abbr: 'WIS',   firstFour: false },
  { id: 'BYU',   name: 'BYU',                seed: 6,  region: 'West',    abbr: 'BYU',   firstFour: false },
  { id: 'MIA',   name: 'Miami (FL)',          seed: 7,  region: 'West',    abbr: 'MIA',   firstFour: false },
  { id: 'NOVA',  name: 'Villanova',          seed: 8,  region: 'West',    abbr: 'NOVA',  firstFour: false },
  { id: 'USU',   name: 'Utah State',         seed: 9,  region: 'West',    abbr: 'USU',   firstFour: false },
  { id: 'MIZ',   name: 'Missouri',           seed: 10, region: 'West',    abbr: 'MIZ',   firstFour: false },
  // First Four slot: Texas vs NC State → winner gets West #11
  { id: 'W11',   name: 'West #11',           seed: 11, region: 'West',    abbr: 'W11',   firstFour: true,
    firstFourTeams: [{ id: 'TEX',  name: 'Texas',    abbr: 'TEX'  },
                     { id: 'NCST', name: 'NC State',  abbr: 'NCST' }] },
  { id: 'HPU',   name: 'High Point',         seed: 12, region: 'West',    abbr: 'HPU',   firstFour: false },
  { id: 'HAW',   name: 'Hawaii',             seed: 13, region: 'West',    abbr: 'HAW',   firstFour: false },
  { id: 'KENN',  name: 'Kennesaw State',     seed: 14, region: 'West',    abbr: 'KENN',  firstFour: false },
  { id: 'QUEE',  name: 'Queens',             seed: 15, region: 'West',    abbr: 'QUEE',  firstFour: false },
  { id: 'LIU',   name: 'LIU',                seed: 16, region: 'West',    abbr: 'LIU',   firstFour: false },

  // ── MIDWEST REGION (14 regular + 2 TBD = 16 slots) ───────────────────
  { id: 'MICH',  name: 'Michigan',           seed: 1,  region: 'Midwest', abbr: 'MICH',  firstFour: false },
  { id: 'ISU',   name: 'Iowa State',         seed: 2,  region: 'Midwest', abbr: 'ISU',   firstFour: false },
  { id: 'UVA',   name: 'Virginia',           seed: 3,  region: 'Midwest', abbr: 'UVA',   firstFour: false },
  { id: 'ALA',   name: 'Alabama',            seed: 4,  region: 'Midwest', abbr: 'ALA',   firstFour: false },
  { id: 'TTU',   name: 'Texas Tech',         seed: 5,  region: 'Midwest', abbr: 'TTU',   firstFour: false },
  { id: 'TENN',  name: 'Tennessee',          seed: 6,  region: 'Midwest', abbr: 'TENN',  firstFour: false },
  { id: 'UK',    name: 'Kentucky',           seed: 7,  region: 'Midwest', abbr: 'UK',    firstFour: false },
  { id: 'UGA',   name: 'Georgia',            seed: 8,  region: 'Midwest', abbr: 'UGA',   firstFour: false },
  { id: 'SLU',   name: 'Saint Louis',        seed: 9,  region: 'Midwest', abbr: 'SLU',   firstFour: false },
  { id: 'SCU',   name: 'Santa Clara',        seed: 10, region: 'Midwest', abbr: 'SCU',   firstFour: false },
  // First Four slot: SMU vs Miami (OH) → winner gets Midwest #11
  { id: 'MW11',  name: 'Midwest #11',        seed: 11, region: 'Midwest', abbr: 'MW11',  firstFour: true,
    firstFourTeams: [{ id: 'SMU',  name: 'SMU',        abbr: 'SMU'  },
                     { id: 'MIOH', name: 'Miami (OH)',  abbr: 'MIOH' }] },
  { id: 'AKR',   name: 'Akron',              seed: 12, region: 'Midwest', abbr: 'AKR',   firstFour: false },
  { id: 'HOF',   name: 'Hofstra',            seed: 13, region: 'Midwest', abbr: 'HOF',   firstFour: false },
  { id: 'WRST',  name: 'Wright State',       seed: 14, region: 'Midwest', abbr: 'WRST',  firstFour: false },
  { id: 'TNST',  name: 'Tennessee State',    seed: 15, region: 'Midwest', abbr: 'TNST',  firstFour: false },
  // First Four slot: UMBC vs Howard → winner gets Midwest #16
  { id: 'MW16',  name: 'Midwest #16',        seed: 16, region: 'Midwest', abbr: 'MW16',  firstFour: true,
    firstFourTeams: [{ id: 'UMBC', name: 'UMBC',        abbr: 'UMBC' },
                     { id: 'HOW',  name: 'Howard',       abbr: 'HOW'  }] },

  // ── SOUTH REGION (15 regular + 1 TBD = 16 slots) ─────────────────────
  { id: 'FLA',   name: 'Florida',            seed: 1,  region: 'South',   abbr: 'FLA',   firstFour: false },
  { id: 'HOU',   name: 'Houston',            seed: 2,  region: 'South',   abbr: 'HOU',   firstFour: false },
  { id: 'ILL',   name: 'Illinois',           seed: 3,  region: 'South',   abbr: 'ILL',   firstFour: false },
  { id: 'NEB',   name: 'Nebraska',           seed: 4,  region: 'South',   abbr: 'NEB',   firstFour: false },
  { id: 'VAN',   name: 'Vanderbilt',         seed: 5,  region: 'South',   abbr: 'VAN',   firstFour: false },
  { id: 'UNC',   name: 'North Carolina',     seed: 6,  region: 'South',   abbr: 'UNC',   firstFour: false },
  { id: 'STMA',  name: "Saint Mary's",       seed: 7,  region: 'South',   abbr: 'STMA',  firstFour: false },
  { id: 'CLEM',  name: 'Clemson',            seed: 8,  region: 'South',   abbr: 'CLEM',  firstFour: false },
  { id: 'IOWA',  name: 'Iowa',               seed: 9,  region: 'South',   abbr: 'IOWA',  firstFour: false },
  { id: 'TAMU',  name: 'Texas A&M',          seed: 10, region: 'South',   abbr: 'TAMU',  firstFour: false },
  { id: 'VCU',   name: 'VCU',                seed: 11, region: 'South',   abbr: 'VCU',   firstFour: false },
  { id: 'MCNS',  name: 'McNeese',            seed: 12, region: 'South',   abbr: 'MCNS',  firstFour: false },
  { id: 'TROY',  name: 'Troy',               seed: 13, region: 'South',   abbr: 'TROY',  firstFour: false },
  { id: 'PENN',  name: 'Penn',               seed: 14, region: 'South',   abbr: 'PENN',  firstFour: false },
  { id: 'IDHO',  name: 'Idaho',              seed: 15, region: 'South',   abbr: 'IDHO',  firstFour: false },
  // First Four slot: Prairie View A&M vs Lehigh → winner gets South #16
  { id: 'S16',   name: 'South #16',          seed: 16, region: 'South',   abbr: 'S16',   firstFour: true,
    firstFourTeams: [{ id: 'PV',   name: 'Prairie View A&M', abbr: 'PV'  },
                     { id: 'LEH',  name: 'Lehigh',           abbr: 'LEH' }] },
];

module.exports = TEAMS;
