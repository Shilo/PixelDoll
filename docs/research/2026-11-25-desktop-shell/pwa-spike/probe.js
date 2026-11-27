const report = document.querySelector('#result');
const pick = document.querySelector('#pick');
const retry = document.querySelector('#retry');
const options = { mode: 'readwrite' };
const request = (operation) =>
  new Promise((resolve, reject) => {
    operation.onsuccess = () => resolve(operation.result);
    operation.onerror = () => reject(operation.error);
  });
const open = indexedDB.open('pixeldoll-folder-probe', 1);
open.onupgradeneeded = () => open.result.createObjectStore('handles');
const db = await request(open);
let folder = await request(db.transaction('handles').objectStore('handles').get('test'));
const line = (value) => { report.textContent += value + '\n'; };
const busy = async (operation) => {
  pick.disabled = retry.disabled = true;
  try {
    await operation();
  } catch (error) {
    line(error.name + ': ' + error.message);
  } finally {
    pick.disabled = typeof showDirectoryPicker !== 'function';
    retry.disabled = !folder;
  }
};

async function fileProbe() {
  const name = 'pixeldoll-probe-' + crypto.randomUUID();
  const source = name + '.json';
  const renamed = name + '-renamed.json';
  const contents = JSON.stringify({ character: 'Probe', outfit: ['Demo hat'] });
  const created = await folder.getFileHandle(source, { create: true });
  const output = await created.createWritable();
  await output.write(contents);
  await output.close();
  if (await (await created.getFile()).text() !== contents) throw new Error('Readback mismatch');
  line('Write and readback passed');
  if (typeof created.move === 'function') {
    try {
      await created.move(renamed);
      const moved = await folder.getFileHandle(renamed);
      if (await (await moved.getFile()).text() !== contents) throw new Error('Renamed content mismatch');
      await folder.removeEntry(renamed);
      line('Native rename and delete passed');
      return;
    } catch (error) {
      if (error.name !== 'NotSupportedError') throw error;
      line('Native rename is unavailable for this folder');
    }
  } else {
    line('Native rename is unavailable in this browser');
  }
  await folder.removeEntry(source);
  line('Delete passed');
}

pick.addEventListener('click', () => void busy(async () => {
  folder = await showDirectoryPicker(options);
  const tx = db.transaction('handles', 'readwrite');
  tx.objectStore('handles').put(folder, 'test');
  await new Promise((resolve, reject) => {
    tx.oncomplete = resolve;
    tx.onabort = () => reject(tx.error);
  });
  line('Saved directory handle to IndexedDB');
  await fileProbe();
}));

retry.addEventListener('click', () => void busy(async () => {
  const permission = await folder.requestPermission(options);
  line('Requested permission: ' + permission);
  if (permission === 'granted') await fileProbe();
}));

line('Directory picker: ' + typeof showDirectoryPicker);
pick.disabled = typeof showDirectoryPicker !== 'function';
if (folder) {
  retry.disabled = false;
  const permission = await folder.queryPermission(options);
  line('Recovered handle from IndexedDB. Write permission: ' + permission);
  if (permission === 'granted') await busy(fileProbe);
}
