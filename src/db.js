const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DATA_DIR = process.env.NODE_ENV === 'production'
  ? '/data'
  : path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, 'rooms.db'));

db.exec(`
  CREATE TABLE IF NOT EXISTS rooms (
    id TEXT PRIMARY KEY,
    state TEXT NOT NULL,
    updated_at INTEGER NOT NULL
  )
`);

function saveRoom(room) {
  // Sets aren't JSON-serializable — convert before saving
  const state = JSON.stringify({
    ...room,
    eliminatedTeamIds: [...room.eliminatedTeamIds],
  });
  db.prepare(
    'INSERT OR REPLACE INTO rooms (id, state, updated_at) VALUES (?, ?, ?)'
  ).run(room.id, state, Date.now());
}

function loadAllRooms() {
  const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000; // 30 days
  return db.prepare('SELECT state FROM rooms WHERE updated_at > ?')
    .all(cutoff)
    .map(row => {
      const r = JSON.parse(row.state);
      r.eliminatedTeamIds = new Set(r.eliminatedTeamIds || []);
      // Reset transient socket state — sockets don't survive restarts
      r.players.forEach(p => { p.socketId = null; p.connected = false; });
      return r;
    });
}

function deleteRoom(roomId) {
  db.prepare('DELETE FROM rooms WHERE id = ?').run(roomId);
}

module.exports = { saveRoom, loadAllRooms, deleteRoom };
