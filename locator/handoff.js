const DB_NAME = 'cellguard-motion-handoff';
const STORE_NAME = 'targets';

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE_NAME);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function saveHandoff(target) {
  const id = crypto.randomUUID();
  const db = await openDatabase();
  try {
    await new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      transaction.objectStore(STORE_NAME).put({...target, id}, 'pending');
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  } finally {
    db.close();
  }
  return id;
}

export async function consumeHandoff(id) {
  const db = await openDatabase();
  try {
    return await new Promise((resolve, reject) => {
      let target = null;
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get('pending');
      request.onsuccess = () => {
        if (request.result?.id === id) {
          target = request.result;
          store.delete('pending');
        }
      };
      transaction.oncomplete = () => resolve(target);
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  } finally {
    db.close();
  }
}
