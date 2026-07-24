const DB_NAME = 'slicer-autosave';
const STORE_NAME = 'projects';

// Portal embeds this tool once per project (see Portal's ToolWorkspace.tsx), passing
// the project id as `?project=`. Falling back to a fixed key when opened standalone
// (outside Portal) still gives that single session its own autosave slot.
export function getProjectId() {
  return new URLSearchParams(window.location.search).get('project') || 'standalone';
}

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// `snapshot.file` is the original uploaded File object -- IndexedDB (unlike
// localStorage) can store Blob/File values directly via structured clone, so the
// raw bytes round-trip without any manual serialization.
export async function saveSnapshot(projectId, snapshot) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(snapshot, projectId);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export async function loadSnapshot(projectId) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const request = tx.objectStore(STORE_NAME).get(projectId);
    request.onsuccess = () => resolve(request.result ?? null);
    request.onerror = () => reject(request.error);
  });
}
