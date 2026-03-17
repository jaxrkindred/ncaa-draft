const crypto = require('crypto');
const ALL_TEAMS = require('./teams');
const db = require('./db');

const rooms = new Map();

// Load persisted rooms from DB on startup
try {
  const persisted = db.loadAllRooms();
  for (const room of persisted) {
    rooms.set(room.id, room);
  }
  if (persisted.length > 0) {
    console.log(`[db] Loaded ${persisted.length} room(s) from database`);
  }
} catch (err) {
  console.error('[db] Failed to load rooms:', err.message);
}

const PLAYER_COLORS = [
  '#f78166', // coral
  '#388bfd', // blue
  '#a371f7', // purple
  '#f2cc60', // yellow
  '#56d364', // green
  '#39c5cf', // teal
  '#ff8c00', // orange
  '#f778ba', // pink
  '#79c0ff', // sky
  '#ffa657', // amber
  '#d2a8ff', // lavender
  '#7ee787', // mint
];

function generateRoomId() {
  return crypto.randomBytes(3).toString('hex').toUpperCase();
}

function createRoom(hostSocketId, hostName, expectedPlayers = 8) {
  const roomId = generateRoomId();
  const hostId = crypto.randomUUID();
  const room = {
    id: roomId,
    status: 'lobby', // 'lobby' | 'drafting' | 'tournament'
    hostId,
    expectedPlayers: Math.max(2, Math.min(20, expectedPlayers)),
    players: [
      { id: hostId, socketId: hostSocketId, name: hostName, teams: [], connected: true, color: PLAYER_COLORS[0] },
    ],
    pool: [...ALL_TEAMS],
    currentOptions: [],
    draftOrder: [],
    draftPosition: 0,
    eliminatedTeamIds: new Set(), // regular team IDs or TBD slot IDs (W11, MW11, etc.)
    resolvedSlots: {},             // slotId -> { winnerId, winnerName, winnerAbbr }
    createdAt: Date.now(),
  };
  rooms.set(roomId, room);
  db.saveRoom(room);
  return { roomId, playerId: hostId };
}

function joinRoom(roomId, socketId, playerName) {
  const room = rooms.get(roomId);
  if (!room) return { error: 'Room not found' };
  if (room.status !== 'lobby') return { error: 'Draft has already started' };
  if (room.players.length >= 20) return { error: 'Room is full' };

  const playerId = crypto.randomUUID();
  const color = PLAYER_COLORS[room.players.length % PLAYER_COLORS.length];
  room.players.push({ id: playerId, socketId, name: playerName, teams: [], connected: true, color });
  db.saveRoom(room);
  return { playerId };
}

function setRoomSize(roomId, requestingPlayerId, size) {
  const room = rooms.get(roomId);
  if (!room) return { error: 'Room not found' };
  if (room.hostId !== requestingPlayerId) return { error: 'Only the host can change the room size' };
  if (room.status !== 'lobby') return { error: 'Cannot change size after draft has started' };
  const clamped = Math.max(room.players.length, Math.min(20, size));
  room.expectedPlayers = clamped;
  return { ok: true };
}

function startDraft(roomId, requestingPlayerId) {
  const room = rooms.get(roomId);
  if (!room) return { error: 'Room not found' };
  if (room.hostId !== requestingPlayerId) return { error: 'Only the host can start the draft' };
  if (room.status !== 'lobby') return { error: 'Draft already started' };
  if (room.players.length < room.expectedPlayers) {
    return { error: `Waiting for players: ${room.players.length} / ${room.expectedPlayers} have joined` };
  }

  room.status = 'drafting';
  room.draftOrder = shuffle(room.players.map(p => p.id));
  room.draftPosition = 0;
  room.pool = shuffle([...room.pool]);
  advanceDraft(room);
  db.saveRoom(room);
  return { ok: true };
}

function pickTeam(roomId, playerId, teamId) {
  const room = rooms.get(roomId);
  if (!room) return { error: 'Room not found' };
  if (room.status !== 'drafting') return { error: 'Not in draft phase' };

  const currentPlayerId = room.draftOrder[room.draftPosition % room.draftOrder.length];
  if (playerId !== currentPlayerId) return { error: "It's not your turn" };

  const pickedTeam = room.currentOptions.find(t => t.id === teamId);
  if (!pickedTeam) return { error: 'Invalid team selection' };

  const player = room.players.find(p => p.id === playerId);
  player.teams.push(pickedTeam);

  // Return unchosen options to pool
  room.pool.push(...room.currentOptions.filter(t => t.id !== teamId));
  room.currentOptions = [];
  room.draftPosition++;

  if (room.pool.length === 0) {
    room.status = 'tournament';
    db.saveRoom(room);
    return { ok: true, draftComplete: true };
  }

  advanceDraft(room);
  db.saveRoom(room);
  return { ok: true, draftComplete: false };
}

function advanceDraft(room) {
  shuffle(room.pool); // always fresh random draw for each turn
  const count = Math.min(2, room.pool.length);
  room.currentOptions = room.pool.splice(room.pool.length - count, count);
  room.turnStartedAt = Date.now();
}

// Called when a First Four play-in game is resolved
function resolveSlot(roomId, slotId, winner) {
  const room = rooms.get(roomId);
  if (!room) return;
  if (room.resolvedSlots[slotId]) return; // already set
  room.resolvedSlots[slotId] = winner; // { winnerId, winnerName, winnerAbbr }
}

// Resolve all rooms at once (used by polling)
function resolveSlotAllRooms(slotId, winner) {
  for (const room of rooms.values()) {
    if (!room.resolvedSlots[slotId]) {
      room.resolvedSlots[slotId] = winner;
      db.saveRoom(room);
    }
  }
}

function markTeamEliminated(teamId) {
  for (const room of rooms.values()) {
    if (room.status === 'tournament') {
      room.eliminatedTeamIds.add(teamId);
      db.saveRoom(room);
    }
  }
}

function markTeamsEliminatedAllRooms(teamIds) {
  for (const id of teamIds) {
    markTeamEliminated(id);
  }
}

function getPublicRoom(roomId) {
  const room = rooms.get(roomId);
  return room ? serializeRoom(room) : null;
}

function serializeRoom(room) {
  const elimIds = room.eliminatedTeamIds;

  const players = room.players.map(p => {
    const teamsWithStatus = p.teams.map(t => {
      const resolved = t.firstFour ? room.resolvedSlots[t.id] : null;
      return {
        ...t,
        resolvedTeam: resolved || null,       // { winnerId, winnerName } or null
        eliminated: elimIds.has(t.id),
      };
    });
    const activeCount = teamsWithStatus.filter(t => !t.eliminated).length;
    return {
      id: p.id,
      name: p.name,
      connected: p.connected,
      color: p.color,
      teams: teamsWithStatus,
      activeTeamCount: activeCount,
    };
  });

  const totalActive = players.reduce((sum, p) => sum + p.activeTeamCount, 0);
  players.forEach(p => {
    p.winProbability = totalActive > 0 ? Math.round((p.activeTeamCount / totalActive) * 100) : 0;
  });

  const currentPlayerId =
    room.status === 'drafting'
      ? room.draftOrder[room.draftPosition % room.draftOrder.length]
      : null;

  // Attach resolved info to currentOptions for display
  const currentOptions = room.currentOptions.map(t => {
    const resolved = t.firstFour ? room.resolvedSlots[t.id] : null;
    return { ...t, resolvedTeam: resolved || null };
  });

  return {
    id: room.id,
    status: room.status,
    hostId: room.hostId,
    expectedPlayers: room.expectedPlayers,
    players,
    currentPlayerId,
    currentOptions,
    teamsInPool: room.pool.length,
    totalTeams: ALL_TEAMS.length,
    eliminatedTeamIds: [...elimIds],
    resolvedSlots: room.resolvedSlots,
    draftOrder: room.draftOrder,
    draftPosition: room.draftPosition,
    turnStartedAt: room.turnStartedAt || null,
  };
}

function getAllRooms() { return rooms; }

function markDisconnected(socketId) {
  for (const room of rooms.values()) {
    const player = room.players.find(p => p.socketId === socketId);
    if (player) player.connected = false;
  }
}

function getRoomBySocketId(socketId) {
  for (const room of rooms.values()) {
    if (room.players.some(p => p.socketId === socketId)) return room;
  }
  return null;
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

setInterval(() => {
  const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
  for (const [id, room] of rooms.entries()) {
    if (room.createdAt < cutoff) rooms.delete(id);
  }
}, 60 * 60 * 1000);

module.exports = {
  createRoom, joinRoom, setRoomSize, startDraft, pickTeam,
  resolveSlotAllRooms, markTeamEliminated, markTeamsEliminatedAllRooms,
  getPublicRoom, getAllRooms, markDisconnected, getRoomBySocketId, serializeRoom,
  saveRoom: (roomId) => { const r = getAllRooms().get(roomId); if (r) db.saveRoom(r); },
};
