/* bracket.js – Single-region bracket renderer with player colors
   All colors use inline SVG attributes (not CSS classes) for reliability. */

(function () {

  // ── Layout constants ────────────────────────────────────────────────────
  const SW    = 148;  // slot width
  const SH    = 28;   // slot height
  const GS    = 72;   // R1 game spacing
  const STEP  = 196;  // distance between round column left edges
  const LBL_H = 52;   // height of label area above bracket
  const PAD_X = 16;
  const PAD_Y = 10;

  const FONT  = "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";

  // R1 matchup order (top → bottom)
  const R1 = [[1,16],[8,9],[5,12],[4,13],[6,11],[3,14],[7,10],[2,15]];

  // Vertical game-center y positions per round (from top of content area)
  function makeCenters() {
    const c = [[]];
    for (let i = 0; i < 8; i++) c[0].push(GS / 2 + i * GS);
    for (let r = 1; r < 4; r++) {
      c[r] = [];
      for (let g = 0; g < c[r-1].length - 1; g += 2)
        c[r].push((c[r-1][g] + c[r-1][g+1]) / 2);
    }
    return c;
  }
  const CENTERS = makeCenters();

  const CONTENT_H = GS * 8;
  const TOTAL_H   = PAD_Y + LBL_H + CONTENT_H + PAD_Y;
  const TOTAL_W   = PAD_X + STEP * 3 + SW + PAD_X;

  const SHORT = {
    'North Dakota State': 'N. Dak. St.',
    'Tennessee State':    'Tenn. St.',
    'South Florida':      'S. Florida',
    'Northern Iowa':      'N. Iowa',
    'Prairie View A&M':   'Pr. View A&M',
    'Michigan State':     'Mich. St.',
    'Wright State':       'Wright St.',
    'Kennesaw State':     'Kenn. St.',
    "Saint Mary's":       "St. Mary's",
    'North Carolina':     'N. Carolina',
  };
  function sn(n) { return SHORT[n] || n; }

  function esc(s) {
    return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function hexToRgb(hex) {
    const r = parseInt(hex.slice(1,3),16);
    const g = parseInt(hex.slice(3,5),16);
    const b = parseInt(hex.slice(5,7),16);
    return [r,g,b];
  }

  // ── Public render ────────────────────────────────────────────────────────
  window.renderRegionBracket = function (room, region, containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const teams     = window.ALL_TEAMS || [];
    const elimSet   = new Set(room.eliminatedTeamIds || []);
    const optionIds = new Set((room.currentOptions || []).map(t => t.id));
    const resolved  = room.resolvedSlots || {};

    // teamId → { color, name }
    const teamOwner = {};
    for (const p of room.players || []) {
      for (const t of p.teams || []) {
        teamOwner[t.id] = { color: p.color, name: p.name };
      }
    }

    // seed → team for this region
    const byS = {};
    for (const t of teams) {
      if (t.region === region) byS[t.seed] = t;
    }

    function getTeam(seed) {
      const t = byS[seed];
      if (!t) return null;
      if (t.firstFour) return { ...t, _resolved: resolved[t.id] || null };
      return t;
    }

    function displayName(t) {
      if (!t) return '';
      if (t.firstFour) {
        if (t._resolved) return sn(t._resolved.winnerName);
        return sn(t.firstFourTeams[0].name) + ' / ' + sn(t.firstFourTeams[1].name);
      }
      return sn(t.name);
    }

    const parts = [];

    // Round column x
    function rx(r) { return PAD_X + r * STEP; }

    // Content y offset
    const cy = PAD_Y + LBL_H;

    // ── Labels ──────────────────────────────────────────────────────────
    const ROUND_NAMES = ['First Round', 'Second Round', 'Sweet 16', 'Elite Eight'];
    for (let r = 0; r < 4; r++) {
      const lx = rx(r) + SW / 2;
      parts.push(`<text x="${lx}" y="${PAD_Y + 13}" text-anchor="middle"
        font-family="${FONT}" font-size="9" fill="#3d444d" letter-spacing="0.05em"
        >${ROUND_NAMES[r].toUpperCase()}</text>`);
    }
    parts.push(`<text x="${TOTAL_W / 2}" y="${PAD_Y + 36}" text-anchor="middle"
      font-family="${FONT}" font-size="15" font-weight="700" fill="#e6edf3"
      >${esc(region)} Region</text>`);

    // ── Connector lines ──────────────────────────────────────────────────
    for (let r = 0; r < 3; r++) {
      const cur  = CENTERS[r];
      const next = CENTERS[r + 1];
      const x0   = rx(r) + SW;
      const x1   = rx(r + 1);
      const midX = Math.round((x0 + x1) / 2);

      for (let g = 0; g < cur.length; g += 2) {
        const ya   = cy + cur[g];
        const yb   = cy + cur[g + 1];
        const yMid = cy + next[g / 2];
        const s    = `stroke="#2d333b" stroke-width="1.5"`;
        parts.push(
          `<line x1="${x0}" y1="${ya}"   x2="${midX}" y2="${ya}"   ${s}/>`,
          `<line x1="${x0}" y1="${yb}"   x2="${midX}" y2="${yb}"   ${s}/>`,
          `<line x1="${midX}" y1="${ya}" x2="${midX}" y2="${yb}"   ${s}/>`,
          `<line x1="${midX}" y1="${yMid}" x2="${x1}" y2="${yMid}" ${s}/>`
        );
      }
    }

    // ── Slots ────────────────────────────────────────────────────────────
    function drawSlot(x, y, seed, team) {
      const tid    = team ? team.id : null;
      const isOpt  = !!(tid && optionIds.has(tid));
      const isElim = !!(tid && elimSet.has(tid));
      const owner  = tid ? teamOwner[tid] : null;
      const isTBD  = !!(team && team.firstFour && !team._resolved);
      const name   = team ? esc(displayName(team)) : '';

      // Slot background + border
      let slotFill, slotStroke, slotSW;
      if (isOpt) {
        slotFill = '#0d2818'; slotStroke = '#3fb950'; slotSW = '2';
      } else if (owner) {
        const [rv,gv,bv] = hexToRgb(owner.color);
        slotFill = `rgb(${Math.round(rv*.15+13)},${Math.round(gv*.15+13)},${Math.round(bv*.15+13)})`;
        slotStroke = owner.color; slotSW = '1.5';
      } else if (isElim) {
        slotFill = '#160d0d'; slotStroke = '#3d1a1a'; slotSW = '1';
      } else {
        slotFill = '#161b22'; slotStroke = '#30363d'; slotSW = '1';
      }

      // Left color bar
      const barColor = isOpt ? '#3fb950' : (owner ? owner.color : null);

      // Text color
      const textFill = isElim ? '#484f58' : '#c9d1d9';
      const seedFill = isElim ? '#3d444d' : '#8b949e';

      // Strikethrough for eliminated
      const strikeY = y + SH / 2;

      parts.push(`<g>`);
      parts.push(`<rect x="${x}" y="${y}" width="${SW}" height="${SH}" rx="3"
        fill="${slotFill}" stroke="${slotStroke}" stroke-width="${slotSW}"/>`);

      if (barColor) {
        parts.push(`<rect x="${x}" y="${y}" width="5" height="${SH}"
          fill="${barColor}" rx="2"/>`);
      }

      // Seed number
      if (seed != null) {
        parts.push(`<text x="${x + 10}" y="${y + SH - 8}"
          font-family="${FONT}" font-size="11" font-weight="700" fill="${seedFill}"
          >${seed}</text>`);
      }

      // Team name
      if (name) {
        const nameX = x + (seed != null ? 24 : 9);
        parts.push(`<text x="${nameX}" y="${y + SH - 8}"
          font-family="${FONT}" font-size="11.5" fill="${textFill}"
          >${name}</text>`);
      }

      // Strikethrough line for eliminated teams
      if (isElim && name) {
        const nameX = x + (seed != null ? 24 : 9);
        // estimate text width: ~6.5px per char
        const approxW = Math.min(name.length * 6.5, SW - nameX + x - 4);
        parts.push(`<line x1="${nameX}" y1="${strikeY}" x2="${nameX + approxW}" y2="${strikeY}"
          stroke="#484f58" stroke-width="1"/>`);
      }

      // TBD label
      if (isTBD) {
        parts.push(`<text x="${x + SW - 6}" y="${y + SH - 8}" text-anchor="end"
          font-family="${FONT}" font-size="9" font-weight="700" fill="#d29922">TBD</text>`);
      }

      // Pulsing outline for current options
      if (isOpt) {
        parts.push(`<rect x="${x}" y="${y}" width="${SW}" height="${SH}" rx="3"
          fill="none" stroke="#3fb950" stroke-width="2" opacity="0.6">
          <animate attributeName="opacity" values="0.6;0.15;0.6" dur="1.4s" repeatCount="indefinite"/>
        </rect>`);
      }

      parts.push(`</g>`);
    }

    function drawEmptySlot(x, y) {
      parts.push(`<rect x="${x}" y="${y}" width="${SW}" height="${SH}" rx="3"
        fill="#0d1117" stroke="#21262d" stroke-width="1"/>`);
    }

    // Draw all rounds
    for (let r = 0; r < 4; r++) {
      for (let g = 0; g < CENTERS[r].length; g++) {
        const gc = cy + CENTERS[r][g];
        if (r === 0) {
          const [s1, s2] = R1[g];
          drawSlot(rx(r), gc - SH, s1, getTeam(s1));
          drawSlot(rx(r), gc,      s2, getTeam(s2));
        } else {
          drawEmptySlot(rx(r), gc - SH);
          drawEmptySlot(rx(r), gc);
        }
      }
    }

    container.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg"
           width="${TOTAL_W}" height="${TOTAL_H}"
           viewBox="0 0 ${TOTAL_W} ${TOTAL_H}">
        ${parts.join('\n')}
      </svg>`;
  };

  // ── Panning ──────────────────────────────────────────────────────────────
  window.initBracketPan = function (wrapperId, innerId) {
    const wrapper = document.getElementById(wrapperId);
    const inner   = document.getElementById(innerId);
    if (!wrapper || !inner) return;

    let dragging = false, ox = 0, oy = 0, sx, sy;

    function apply() { inner.style.transform = `translate(${ox}px,${oy}px)`; }

    wrapper.addEventListener('mousedown', e => {
      dragging = true; sx = e.clientX - ox; sy = e.clientY - oy;
      wrapper.style.cursor = 'grabbing'; e.preventDefault();
    });
    window.addEventListener('mousemove', e => {
      if (!dragging) return;
      ox = e.clientX - sx; oy = e.clientY - sy; apply();
    });
    window.addEventListener('mouseup', () => { dragging = false; wrapper.style.cursor = 'grab'; });
    wrapper.addEventListener('touchstart', e => {
      const t = e.touches[0]; sx = t.clientX - ox; sy = t.clientY - oy;
    }, { passive: true });
    wrapper.addEventListener('touchmove', e => {
      const t = e.touches[0]; ox = t.clientX - sx; oy = t.clientY - sy;
      apply(); e.preventDefault();
    }, { passive: false });
  };

})();
