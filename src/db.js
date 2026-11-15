// Minimal IndexedDB wrapper used to remember who the player is between visits.

const DB_NAME = 'mud-hole';
const DB_VERSION = 1;
const STORE = 'players';
const CURRENT_KEY = 'current';

function openDb() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is not available'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function withStore(mode, fn) {
  const db = await openDb();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const request = fn(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(request.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

/** Returns the stored player ({ name, createdAt, location }) or null if this browser is unknown. */
export async function loadPlayer() {
  try {
    return (await withStore('readonly', (store) => store.get(CURRENT_KEY))) ?? null;
  } catch (err) {
    console.error('Could not read player from IndexedDB:', err);
    return null;
  }
}

/** Creates a new player record (not yet persisted; pass it to savePlayer). */
export function createPlayer(name, location) {
  return { name, createdAt: Date.now(), location };
}

/** Persists the given player record (insert or overwrite). Returns it. */
export async function savePlayer(player) {
  try {
    await withStore('readwrite', (store) => store.put(player, CURRENT_KEY));
  } catch (err) {
    console.error('Could not save player to IndexedDB:', err);
  }
  return player;
}
