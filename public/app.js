// ── State ─────────────────────────────────────────────────────────────────
const socket = io();
const roomId = window.location.pathname.split('/').pop().toUpperCase();
let myPlayerId = localStorage.getItem('playerId');
let currentRoom = null;

// ── View management ───────────────────────────────────────────────────────
function showView(name) {
  document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
  document.getElementById(`view-${name}`).classList.remove('hidden');
}

function showError(msg) {
  document.getElementById('error-detail').textContent = msg;
  showView('error');
}

// ── Init: rejoin or error ─────────────────────────────────────────────────
showView('loading');

if (!roomId) {
  showError('No room ID in URL.');
} else if (myPlayerId) {
  // Returning visitor — try to rejoin
  socket.emit('rejoin-room', { roomId, playerId: myPlayerId }, (res) => {
    if (res.error) {
      // Couldn't rejoin — send to home
      window.location.href = '/';
    } else {
      currentRoom = res.room;
      renderRoom(res.room);
    }
  });
} else {
  // No identity — send to home to create/join
  window.location.href = '/';
}

// ── Real-time updates ─────────────────────────────────────────────────────
socket.on('room-updated', (room) => {
  currentRoom = room;
  renderRoom(room);
});

socket.on('draft-complete', (room) => {
  stopCountdown();
  currentRoom = room;
  renderRoom(room);
});

socket.on('connect_error', () => showError('Connection lost. Refresh to reconnect.'));

// ── Master render ─────────────────────────────────────────────────────────
function renderRoom(room) {
  if (room.status === 'lobby')      return renderLobby(room);
  if (room.status === 'drafting')   return renderDraft(room);
  if (room.status === 'tournament') return renderTournament(room);
}

// ── LOBBY ─────────────────────────────────────────────────────────────────
function renderLobby(room) {
  showView('lobby');

  const joined   = room.players.length;
  const expected = room.expectedPlayers;
  const isFull   = joined >= expected;
  const isHost   = room.hostId === myPlayerId;

  document.getElementById('lobby-room-code').textContent = room.id;

  // Player list with colors
  const list = document.getElementById('lobby-player-list');
  list.innerHTML = room.players.map(p => `
    <li class="${p.id === myPlayerId ? 'me' : ''}">
      <span class="legend-dot" style="background:${escHtml(p.color)}"></span>
      ${escHtml(p.name)}
      ${p.id === room.hostId ? '<span class="badge">Host</span>' : ''}
      ${!p.connected ? '<span class="badge offline">Away</span>' : ''}
    </li>
  `).join('');

  // Fill progress
  document.getElementById('lobby-fill-status').innerHTML =
    `<span class="${isFull ? 'fill-ready' : 'fill-waiting'}">${joined} / ${expected} players joined</span>`;

  // Host controls
  document.getElementById('host-controls').classList.toggle('hidden', !isHost);
  document.getElementById('waiting-msg').classList.toggle('hidden', isHost);

  if (isHost) {
    // Room size stepper (can't go below current joined count)
    document.getElementById('lobby-size-display').textContent = expected;
    document.getElementById('lobby-size-dec').disabled = expected <= joined;
    document.getElementById('lobby-size-inc').disabled = expected >= 20;

    document.getElementById('lobby-size-dec').onclick = () =>
      setLobbySize(room, expected - 1);
    document.getElementById('lobby-size-inc').onclick = () =>
      setLobbySize(room, expected + 1);

    const startBtn = document.getElementById('start-btn');
    startBtn.disabled = !isFull;
    startBtn.title = isFull ? '' : `Waiting for ${expected - joined} more player${expected - joined > 1 ? 's' : ''}`;
    startBtn.onclick = () => {
      socket.emit('start-draft', { roomId, playerId: myPlayerId }, (res) => {
        if (res.error) alert(res.error);
      });
    };
  }
}

function setLobbySize(room, size) {
  const clamped = Math.max(room.players.length, Math.min(20, size));
  socket.emit('set-room-size', { roomId, playerId: myPlayerId, size: clamped }, (res) => {
    if (res.error) alert(res.error);
  });
}

let bracketPanInitialized = false;
let mobilePanelInitialized = false;
let currentRegion = 'East';
let currentMobilePanel = 'pick';
let countdownInterval = null;
const TURN_SECONDS = 60;

// ── DRAFT ─────────────────────────────────────────────────────────────────
function renderDraft(room) {
  showView('draft');

  document.getElementById('draft-room-code').textContent = room.id;

  const picked = room.players.reduce((sum, p) => sum + p.teams.length, 0);
  const total = room.totalTeams;
  const pct = Math.round((picked / total) * 100);
  document.getElementById('draft-progress').innerHTML =
    `<div class="progress-bar-wrap"><div class="progress-bar" style="width:${pct}%"></div></div>
     <span>${picked} / ${total} teams drafted</span>`;

  const isMyTurn = room.currentPlayerId === myPlayerId;
  document.getElementById('your-turn-panel').classList.toggle('hidden', !isMyTurn);
  document.getElementById('waiting-turn-panel').classList.toggle('hidden', isMyTurn);

  if (isMyTurn && window.innerWidth < 768) {
    currentMobilePanel = 'pick';
    document.querySelectorAll('.mobile-tab').forEach(b => {
      b.classList.toggle('active', b.dataset.panel === 'pick');
    });
    const layout = document.querySelector('.draft-layout');
    if (layout) layout.dataset.panel = 'pick';
  }

  if (isMyTurn) {
    renderTeamOptions(room.currentOptions);
    startCountdown(room.turnStartedAt);
  } else {
    stopCountdown();
    const cp = room.players.find(p => p.id === room.currentPlayerId);
    document.getElementById('waiting-turn-name').textContent =
      cp ? escHtml(cp.name) : 'Someone';
  }

  renderDraftBoard(room);
  renderPlayerLegend(room);
  renderBracketPanel(room);

  if (!bracketPanInitialized) {
    initRegionTabs(room);
    window.initBracketPan('bracket-wrapper', 'bracket-inner');
    bracketPanInitialized = true;
  }

  if (!mobilePanelInitialized) {
    initMobileTabs();
    mobilePanelInitialized = true;
  }
}

function renderBracketPanel(room) {
  if (window.renderRegionBracket && window.ALL_TEAMS) {
    window.renderRegionBracket(room, currentRegion, 'bracket-svg-container');
  } else if (!window.ALL_TEAMS) {
    // Teams data not yet loaded — retry shortly
    setTimeout(() => renderBracketPanel(room), 150);
  }
}

function initRegionTabs(room) {
  document.querySelectorAll('.region-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.region-tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentRegion = btn.dataset.region;
      // Reset pan position when switching regions
      const inner = document.getElementById('bracket-inner');
      if (inner) inner.style.transform = 'translate(0,0)';
      renderBracketPanel(currentRoom);
    });
  });
}

function initMobileTabs() {
  document.querySelectorAll('.mobile-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.mobile-tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentMobilePanel = btn.dataset.panel;
      const layout = document.querySelector('.draft-layout');
      if (layout) layout.dataset.panel = currentMobilePanel;
    });
  });
}

function renderPlayerLegend(room) {
  const el = document.getElementById('player-legend');
  if (!el) return;
  el.innerHTML = room.players.map(p => `
    <span class="legend-player">
      <span class="legend-dot" style="background:${escHtml(p.color)}"></span>
      ${escHtml(p.name)}
    </span>
  `).join('');
}

function renderTeamOptions(options) {
  const el = document.getElementById('team-options');
  el.innerHTML = options.map(team => {
    const displayName = teamDisplayName(team);
    const subline = team.firstFour
      ? (team.resolvedTeam
          ? `Winner: ${escHtml(team.resolvedTeam.winnerName)}`
          : `${escHtml(team.firstFourTeams[0].name)} vs ${escHtml(team.firstFourTeams[1].name)}`)
      : escHtml(team.region);
    return `
      <button class="team-card ${team.firstFour ? 'is-tbd' : ''}" data-id="${team.id}" onclick="pickTeam('${team.id}')">
        <div class="seed-badge">${team.seed}</div>
        <div class="team-name">${escHtml(displayName)}</div>
        <div class="team-region">${subline}</div>
        ${team.firstFour && !team.resolvedTeam ? '<div class="first-four-tag">TBD</div>' : ''}
      </button>
    `;
  }).join('');
}

function pickTeam(teamId) {
  // Disable buttons immediately to prevent double-click
  document.querySelectorAll('.team-card').forEach(b => b.disabled = true);
  socket.emit('pick-team', { roomId, playerId: myPlayerId, teamId }, (res) => {
    if (res.error) {
      alert(res.error);
      document.querySelectorAll('.team-card').forEach(b => b.disabled = false);
    }
  });
}

function startCountdown(turnStartedAt) {
  stopCountdown();
  const el = document.getElementById('draft-timer');
  if (!el || !turnStartedAt) return;
  function tick() {
    const remaining = Math.max(0, TURN_SECONDS - Math.floor((Date.now() - turnStartedAt) / 1000));
    el.textContent = remaining + 's';
    el.className = 'draft-timer' + (remaining <= 10 ? ' timer-warning' : '');
  }
  tick();
  countdownInterval = setInterval(tick, 500);
}

function stopCountdown() {
  if (countdownInterval) { clearInterval(countdownInterval); countdownInterval = null; }
  const el = document.getElementById('draft-timer');
  if (el) { el.textContent = ''; el.className = 'draft-timer'; }
}

function renderDraftBoard(room) {
  const board = document.getElementById('draft-board');
  board.innerHTML = room.players.map(p => `
    <div class="board-player ${p.id === myPlayerId ? 'me' : ''} ${p.id === room.currentPlayerId ? 'active-turn' : ''}">
      <div class="board-player-name">
        ${escHtml(p.name)}
        ${p.id === room.currentPlayerId ? '<span class="picking-badge">Picking…</span>' : ''}
      </div>
      <div class="board-teams">
        ${p.teams.map(t => `<span class="mini-team">(${t.seed}) ${escHtml(teamDisplayName(t))}</span>`).join('')}
        ${p.teams.length === 0 ? '<span class="no-teams">No teams yet</span>' : ''}
      </div>
    </div>
  `).join('');
}

// ── TOURNAMENT ────────────────────────────────────────────────────────────
function renderTournament(room) {
  showView('tournament');

  document.getElementById('tourn-room-code').textContent = room.id;

  const elimSet = new Set(room.eliminatedTeamIds);
  const activePlayers = room.players.filter(p => p.activeTeamCount > 0);

  // Check for winner
  const winnerBanner = document.getElementById('tournament-winner-banner');
  if (activePlayers.length === 1) {
    winnerBanner.innerHTML = `🏆 <strong>${escHtml(activePlayers[0].name)}</strong> wins! Their last team is still standing.`;
    winnerBanner.classList.remove('hidden');
  } else {
    winnerBanner.classList.add('hidden');
  }

  // Sort players: most active teams first, then by name
  const sorted = [...room.players].sort((a, b) =>
    b.activeTeamCount - a.activeTeamCount || a.name.localeCompare(b.name)
  );

  const board = document.getElementById('leaderboard');
  board.innerHTML = sorted.map((p, i) => {
    const isMe = p.id === myPlayerId;
    const activeTeams = p.teams.filter(t => !elimSet.has(t.id));
    const deadTeams = p.teams.filter(t => elimSet.has(t.id));
    const isEliminated = p.activeTeamCount === 0;

    return `
      <div class="player-card ${isMe ? 'me' : ''} ${isEliminated ? 'eliminated' : ''}"
           style="--player-color:${escHtml(p.color || '#888')}">
        <div class="player-card-header">
          <div class="player-rank">${isEliminated ? '💀' : `#${i + 1}`}</div>
          <div class="player-info">
            <div class="player-name">
              <span class="legend-dot" style="background:${escHtml(p.color || '#888')}"></span>
              ${escHtml(p.name)}
            </div>
            <div class="player-prob">
              ${isEliminated
                ? 'Eliminated'
                : `<span class="prob-pct">${p.winProbability}%</span> chance to win`}
            </div>
          </div>
          <div class="player-meta">
            <div class="team-counts">
              <span class="count-alive">${p.activeTeamCount} alive</span>
              <span class="count-dead">${deadTeams.length} out</span>
            </div>
          </div>
        </div>
        <div class="player-teams">
          ${activeTeams.map(t => teamPill(t, false)).join('')}
          ${deadTeams.map(t => teamPill(t, true)).join('')}
        </div>
      </div>
    `;
  }).join('');

  // Eliminated teams list
  const allEliminated = room.players
    .flatMap(p => p.teams)
    .filter(t => elimSet.has(t.id));

  const elimList = document.getElementById('eliminated-list');
  if (allEliminated.length === 0) {
    elimList.innerHTML = '<p class="hint">No teams eliminated yet.</p>';
  } else {
    elimList.innerHTML = `<div class="elim-grid">${allEliminated.map(t => teamPill(t, true)).join('')}</div>`;
  }
}

// Returns the best display name for a team/TBD slot
function teamDisplayName(team) {
  if (!team.firstFour) return team.name;
  if (team.resolvedTeam) return team.resolvedTeam.winnerName;
  return `${team.firstFourTeams[0].name} / ${team.firstFourTeams[1].name}`;
}

function teamPill(team, eliminated) {
  const display = teamDisplayName(team);
  const isTbd = team.firstFour && !team.resolvedTeam;
  return `<span class="team-pill ${eliminated ? 'dead' : 'alive'} ${isTbd ? 'tbd' : ''}" title="${escHtml(team.region)}">
    <span class="pill-seed">${team.seed}</span>
    ${escHtml(display)}
    ${isTbd ? '<sup title="Play-in TBD">?</sup>' : ''}
  </span>`;
}

// ── Utilities ─────────────────────────────────────────────────────────────
function copyLink() {
  const url = window.location.href;
  navigator.clipboard.writeText(url).then(() => {
    const c = document.getElementById('copy-confirm');
    c.classList.remove('hidden');
    setTimeout(() => c.classList.add('hidden'), 2000);
  });
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Expose for onclick handlers in HTML
window.pickTeam = pickTeam;
window.copyLink = copyLink;
