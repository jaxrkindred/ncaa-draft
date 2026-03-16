const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const {
  createRoom, joinRoom, setRoomSize, startDraft, pickTeam,
  resolveSlotAllRooms, markTeamsEliminatedAllRooms,
  getPublicRoom, getAllRooms, markDisconnected, getRoomBySocketId, serializeRoom,
} = require('./src/gameState');

const { fetchTournamentUpdates } = require('./src/ncaaApi');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

app.get('/room/:id', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'room.html'));
});

// Serve team list as a JS global so the client can render the bracket
app.get('/teams-data.js', (req, res) => {
  const teams = require('./src/teams');
  res.setHeader('Content-Type', 'application/javascript');
  res.send(`window.ALL_TEAMS = ${JSON.stringify(teams)};`);
});

// ── Socket.io ─────────────────────────────────────────────────────────────

io.on('connection', (socket) => {
  socket.on('create-room', ({ playerName, expectedPlayers }, cb) => {
    if (!playerName?.trim()) return cb({ error: 'Name required' });
    const { roomId, playerId } = createRoom(socket.id, playerName.trim(), expectedPlayers || 8);
    socket.join(roomId);
    cb({ roomId, playerId, room: getPublicRoom(roomId) });
  });

  socket.on('join-room', ({ roomId, playerName }, cb) => {
    if (!playerName?.trim()) return cb({ error: 'Name required' });
    const room = getPublicRoom(roomId);
    if (!room) return cb({ error: 'Room not found. Check your code and try again.' });
    if (room.status !== 'lobby') return cb({ error: 'This draft has already started.' });

    const result = joinRoom(roomId, socket.id, playerName.trim());
    if (result.error) return cb(result);

    socket.join(roomId);
    io.to(roomId).emit('room-updated', getPublicRoom(roomId));
    cb({ playerId: result.playerId, room: getPublicRoom(roomId) });
  });

  socket.on('rejoin-room', ({ roomId, playerId }, cb) => {
    const rooms = getAllRooms();
    const rawRoom = rooms.get(roomId);
    if (!rawRoom) return cb({ error: 'Room not found' });

    const player = rawRoom.players.find(p => p.id === playerId);
    if (!player) return cb({ error: 'Player not found in this room' });

    player.socketId = socket.id;
    player.connected = true;
    socket.join(roomId);
    io.to(roomId).emit('room-updated', getPublicRoom(roomId));
    cb({ room: getPublicRoom(roomId) });
  });

  socket.on('set-room-size', ({ roomId, playerId, size }, cb) => {
    const result = setRoomSize(roomId, playerId, size);
    if (result.error) return cb(result);
    io.to(roomId).emit('room-updated', getPublicRoom(roomId));
    cb({ ok: true });
  });

  socket.on('start-draft', ({ roomId, playerId }, cb) => {
    const result = startDraft(roomId, playerId);
    if (result.error) return cb(result);
    io.to(roomId).emit('room-updated', getPublicRoom(roomId));
    cb({ ok: true });
  });

  socket.on('pick-team', ({ roomId, playerId, teamId }, cb) => {
    const result = pickTeam(roomId, playerId, teamId);
    if (result.error) return cb(result);

    const updatedRoom = getPublicRoom(roomId);
    io.to(roomId).emit('room-updated', updatedRoom);
    if (result.draftComplete) io.to(roomId).emit('draft-complete', updatedRoom);
    cb({ ok: true });
  });

  socket.on('disconnect', () => {
    const room = getRoomBySocketId(socket.id);
    if (room) {
      markDisconnected(socket.id);
      io.to(room.id).emit('room-updated', serializeRoom(room));
    }
  });
});

// ── Tournament result polling ─────────────────────────────────────────────

// Global state: tracks what we've already applied across all rooms
const knownResolved = {};     // slotId -> winnerAbbr
const knownEliminated = new Set();

async function pollTournamentResults() {
  try {
    const { newlyResolved, newlyEliminated } = await fetchTournamentUpdates(knownResolved);

    let changed = false;

    // Apply newly resolved First Four slots
    for (const [slotId, winner] of Object.entries(newlyResolved)) {
      if (!knownResolved[slotId]) {
        knownResolved[slotId] = winner.winnerAbbr;
        resolveSlotAllRooms(slotId, winner);
        console.log(`[poll] Resolved ${slotId} → ${winner.winnerName}`);
        changed = true;
      }
    }

    // Apply newly eliminated teams / slots
    for (const id of newlyEliminated) {
      if (!knownEliminated.has(id)) {
        knownEliminated.add(id);
        changed = true;
      }
    }
    if (newlyEliminated.size > 0) {
      markTeamsEliminatedAllRooms(newlyEliminated);
      console.log(`[poll] Eliminated: ${[...newlyEliminated].join(', ')}`);
    }

    // Broadcast to all tournament rooms if anything changed
    if (changed) {
      for (const [roomId, room] of getAllRooms().entries()) {
        if (room.status === 'tournament') {
          io.to(roomId).emit('room-updated', serializeRoom(room));
        }
      }
    }
  } catch (err) {
    console.error('[poll] Error:', err.message);
  }
}

setInterval(pollTournamentResults, 5 * 60 * 1000);
setTimeout(pollTournamentResults, 5000);

// ── Start ─────────────────────────────────────────────────────────────────

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
