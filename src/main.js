import { initializeApp } from 'firebase/app';
import {
  getAuth, onAuthStateChanged, signInWithEmailAndPassword,
  createUserWithEmailAndPassword, signInWithPopup,
  GoogleAuthProvider, signOut
} from 'firebase/auth';
import {
  getStorage, ref, uploadBytesResumable, getDownloadURL,
  deleteObject, listAll, getMetadata
} from 'firebase/storage';

const firebaseConfig = {
  apiKey:            import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket:     import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId:             import.meta.env.VITE_FIREBASE_APP_ID,
};

const app      = initializeApp(firebaseConfig);
const auth     = getAuth(app);
const storage  = getStorage(app);
const gProvider = new GoogleAuthProvider();

function fmtSize(b) {
  if (b < 1024) return b + ' B';
  if (b < 1048576) return (b / 1024).toFixed(1) + ' KB';
  return (b / 1048576).toFixed(1) + ' MB';
}

function ext(name) {
  return name.split('.').pop().toLowerCase();
}

function iconFor(name) {
  const e = ext(name);
  if (['png','jpg','jpeg','gif','webp','svg'].includes(e)) return '🖼';
  if (['mp4','mov','avi','mkv'].includes(e)) return '🎬';
  if (['mp3','wav','ogg','flac'].includes(e)) return '🎵';
  if (['pdf'].includes(e)) return '📄';
  if (['zip','rar','7z','tar','gz'].includes(e)) return '🗜';
  if (['doc','docx'].includes(e)) return '📝';
  if (['xls','xlsx','csv'].includes(e)) return '📊';
  if (['js','ts','py','html','css','json'].includes(e)) return '💻';
  return '📁';
}

function toast(msg, type = 'info') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'toast show ' + type;
  clearTimeout(t._tid);
  t._tid = setTimeout(() => t.className = 'toast', 3000);
}

function setLoading(btn, yes) {
  if (yes) { btn.dataset.orig = btn.textContent; btn.textContent = '…'; btn.disabled = true; }
  else { btn.textContent = btn.dataset.orig; btn.disabled = false; }
}

onAuthStateChanged(auth, user => {
  if (user) {
    document.getElementById('auth-screen').style.display = 'none';
    document.getElementById('app-screen').style.display = 'flex';
    document.getElementById('user-email').textContent = user.email || user.displayName || 'User';
    loadFiles(user);
  } else {
    document.getElementById('auth-screen').style.display = 'flex';
    document.getElementById('app-screen').style.display = 'none';
  }
});

window.signIn = async () => {
  const btn = document.getElementById('btn-signin');
  const email = document.getElementById('auth-email').value.trim();
  const pass = document.getElementById('auth-pass').value;
  if (!email || !pass) { toast('Enter email and password', 'error'); return; }
  setLoading(btn, true);
  try {
    await signInWithEmailAndPassword(auth, email, pass);
    toast('Welcome back!', 'success');
  } catch (e) {
    toast(e.message.replace('Firebase: ', ''), 'error');
  } finally { setLoading(btn, false); }
};

window.signUp = async () => {
  const btn = document.getElementById('btn-signup');
  const email = document.getElementById('auth-email').value.trim();
  const pass = document.getElementById('auth-pass').value;
  if (!email || !pass) { toast('Enter email and password', 'error'); return; }
  setLoading(btn, true);
  try {
    await createUserWithEmailAndPassword(auth, email, pass);
    toast('Account created!', 'success');
  } catch (e) {
    toast(e.message.replace('Firebase: ', ''), 'error');
  } finally { setLoading(btn, false); }
};

window.signInGoogle = async () => {
  try {
    await signInWithPopup(auth, gProvider);
    toast('Signed in with Google!', 'success');
  } catch (e) {
    toast(e.message.replace('Firebase: ', ''), 'error');
  }
};

window.logOut = async () => {
  await signOut(auth);
  document.getElementById('file-list').innerHTML = '';
  toast('Signed out');
};

window.handleUpload = () => {
  const files = document.getElementById('file-input').files;
  if (!files.length) return;
  const user = auth.currentUser;
  [...files].forEach(file => {
    const storageRef = ref(storage, `users/${user.uid}/${file.name}`);
    const task = uploadBytesResumable(storageRef, file);
    const card = createProgressCard(file.name);
    document.getElementById('file-list').prepend(card);

    task.on('state_changed',
      snap => {
        const pct = Math.round(snap.bytesTransferred / snap.totalBytes * 100);
        card.querySelector('.prog-bar').style.width = pct + '%';
        card.querySelector('.prog-label').textContent = pct + '%';
      },
      err => { toast('Upload failed: ' + err.message, 'error'); card.remove(); },
      async () => {
        toast(`${file.name} uploaded!`, 'success');
        card.remove();
        loadFiles(user);
        document.getElementById('file-input').value = '';
      }
    );
  });
};

async function loadFiles(user) {
  const list = document.getElementById('file-list');
  const empty = document.getElementById('empty-state');
  list.innerHTML = '<div class="loading-files">Loading files…</div>';
  try {
    const folderRef = ref(storage, `users/${user.uid}/`);
    const res = await listAll(folderRef);
    list.innerHTML = '';
    if (res.items.length === 0) {
      empty.style.display = 'flex';
      return;
    }
    empty.style.display = 'none';
    for (const item of res.items) {
      const [url, meta] = await Promise.all([getDownloadURL(item), getMetadata(item)]);
      list.appendChild(createFileCard(item, meta, url, user));
    }
  } catch (e) {
    list.innerHTML = '';
    toast('Could not load files: ' + e.message, 'error');
  }
}

async function deleteFile(item, card, user) {
  if (!confirm(`Delete "${item.name}"?`)) return;
  try {
    await deleteObject(item);
    card.classList.add('fade-out');
    setTimeout(() => { card.remove(); loadFiles(user); }, 300);
    toast('File deleted', 'success');
  } catch (e) {
    toast('Delete failed: ' + e.message, 'error');
  }
}

async function shareFile(url) {
  try {
    await navigator.clipboard.writeText(url);
    toast('Link copied to clipboard!', 'success');
  } catch {
    prompt('Copy this link:', url);
  }
}

function createFileCard(item, meta, url, user) {
  const card = document.createElement('div');
  card.className = 'file-card';
  const date = new Date(meta.timeCreated).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  card.innerHTML = `
    <div class="file-icon">${iconFor(item.name)}</div>
    <div class="file-info">
      <div class="file-name" title="${item.name}">${item.name}</div>
      <div class="file-meta">${fmtSize(meta.size)} · ${date}</div>
    </div>
    <div class="file-actions">
      <a class="btn-act btn-dl" href="${url}" target="_blank" download="${item.name}" title="Download">↓</a>
      <button class="btn-act btn-share" title="Copy share link">⇗</button>
      <button class="btn-act btn-del" title="Delete">✕</button>
    </div>`;
  card.querySelector('.btn-share').onclick = () => shareFile(url);
  card.querySelector('.btn-del').onclick = () => deleteFile(item, card, user);
  return card;
}

function createProgressCard(name) {
  const card = document.createElement('div');
  card.className = 'file-card uploading';
  card.innerHTML = `
    <div class="file-icon">⏫</div>
    <div class="file-info">
      <div class="file-name">${name}</div>
      <div class="prog-track"><div class="prog-bar"></div></div>
    </div>
    <div class="prog-label">0%</div>`;
  return card;
}

const zone = document.getElementById('drop-zone');
['dragenter', 'dragover'].forEach(e => zone.addEventListener(e, ev => {
  ev.preventDefault(); zone.classList.add('drag-over');
}));
['dragleave', 'drop'].forEach(e => zone.addEventListener(e, ev => {
  ev.preventDefault(); zone.classList.remove('drag-over');
}));
zone.addEventListener('drop', ev => {
  document.getElementById('file-input').files = ev.dataTransfer.files;
  window.handleUpload();
});

window.filterFiles = () => {
  const q = document.getElementById('search').value.toLowerCase();
  document.querySelectorAll('.file-card').forEach(c => {
    const n = c.querySelector('.file-name')?.textContent.toLowerCase() || '';
    c.style.display = n.includes(q) ? '' : 'none';
  });
};
