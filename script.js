// --- CONFIG & CONSTANTS ---
const CONFIG = {
    MAIN_PASSWORD: "Washinton_staff2026",
    ADMIN_PASSWORD: "WSHT_rp2026",
    WEBHOOK_URL: "https://discord.com/api/webhooks/1502305049345527980/FpR2e6eZ1ydGV_lVtfJRbN3VQmUtygL3UPjS6TC4oAg-wxu9L5UMaPOVXZ7mM0O5b3PK",
    ROTATION_DAYS: 30,
    SERVICE_GOAL_MS: 4 * 60 * 60 * 1000 // 4 Hours
};

// --- FIREBASE CONFIGURATION ---
// Incolla qui le tue credenziali Firebase quando le avrai
const firebaseConfig = {
    apiKey: "YOUR_API_KEY",
    authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
    projectId: "YOUR_PROJECT_ID",
    storageBucket: "YOUR_PROJECT_ID.appspot.com",
    messagingSenderId: "YOUR_MESSAGING_ID",
    appId: "YOUR_APP_ID"
};

// --- STATE MANAGEMENT ---
let currentUser = null;
let serviceInterval = null;
let totalActiveMs = 0;
let modalCallback = null;
let db = null;
let isCloudActive = false;

// --- INITIALIZATION ---
window.onload = async () => {
    initFirebase();
    checkPasswordRotation();
    checkSession();
    await syncData(); // Sync cloud data first
    updateStaffList();
    renderActiveBans();
    renderInactivityRequests();
    updateNotifUI();
    autoCheckExpiredInactivity();
};

function initFirebase() {
    if (firebaseConfig.apiKey !== "YOUR_API_KEY") {
        firebase.initializeApp(firebaseConfig);
        db = firebase.firestore();
        isCloudActive = true;
        console.log("☁️ Washington RP Cloud Online");
        // Real-time listener for global logs and status changes
        db.collection("config").doc("global_logs").onSnapshot(() => renderGlobalLogs());
        db.collection("staff").onSnapshot(() => updateStaffList());
    } else {
        console.log("📂 Modalità Locale Attiva (Nessuna Config Firebase)");
    }
}

async function syncData() {
    if (!isCloudActive) return;
    try {
        // Here we could fetch all collections, but we'll fetch on demand or use listeners
    } catch (e) { console.error("Sync error", e); }
}

// --- CLOUD HELPERS ---
async function cloudSave(collection, docId, data) {
    if (!isCloudActive) {
        // Fallback local
        if (Array.isArray(JSON.parse(localStorage.getItem(`wash_rp_${collection}`) || '[]'))) {
             let local = JSON.parse(localStorage.getItem(`wash_rp_${collection}`) || '[]');
             // Special handling if it's a map vs array
        }
        return; 
    }
    await db.collection(collection).doc(docId).set(data, { merge: true });
}

async function cloudGet(collection, docId) {
    if (!isCloudActive) return null;
    const doc = await db.collection(collection).doc(docId).get();
    return doc.exists ? doc.data() : null;
}

// --- SESSION & AUTH ---
function checkSession() {
    const session = localStorage.getItem('wash_rp_session');
    if (session) {
        currentUser = JSON.parse(session);
        showDashboard();
        loadUserServiceTime();
    }
}

async function loadUserServiceTime() {
    if (!currentUser) return;
    if (isCloudActive) {
        const data = await cloudGet("staff", currentUser.name);
        totalActiveMs = data ? data.hours : 0;
    } else {
        const staffData = JSON.parse(localStorage.getItem('wash_rp_staff_hours') || '{}');
        totalActiveMs = staffData[currentUser.name] || 0;
    }
    updateTimerUI(totalActiveMs);
}

// --- NAVIGATION ---
function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('overlay');
    if (!sidebar || !overlay) return;
    sidebar.classList.toggle('active');
    overlay.style.display = sidebar.classList.contains('active') ? 'block' : 'none';
}

function showSection(sectionId) {
    document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
    document.querySelectorAll('.sidebar-item').forEach(i => i.classList.remove('active'));
    
    const targetSection = document.getElementById(sectionId);
    if (targetSection) targetSection.classList.add('active');
    
    const items = document.querySelectorAll('.sidebar-item');
    items.forEach(item => { 
        if (item.getAttribute('onclick') && item.getAttribute('onclick').includes(`'${sectionId}'`)) {
            item.classList.add('active');
        }
    });

    if (window.innerWidth <= 768) toggleSidebar();

    // Auto-focus admin password if entering admin section
    if (sectionId === 'admin' && document.getElementById('admin-lock').style.display !== 'none') {
        setTimeout(() => document.getElementById('admin-pass-input').focus(), 100);
    }
}

// --- CUSTOM MODAL ---
function showModal(title, message, callback, showInput = false) {
    document.getElementById('modal-title').innerText = title;
    document.getElementById('modal-message').innerText = message;
    document.getElementById('custom-modal').style.display = 'flex';
    document.getElementById('modal-input-area').style.display = showInput ? 'block' : 'none';
    if (showInput) document.getElementById('modal-textarea').value = '';
    
    modalCallback = callback;
    
    document.getElementById('modal-confirm-btn').onclick = () => {
        const inputVal = showInput ? document.getElementById('modal-textarea').value : null;
        if (showInput && !inputVal) { alert("Devi inserire un motivo!"); return; }
        if (modalCallback) modalCallback(inputVal);
        closeModal();
    };
}

function closeModal() {
    document.getElementById('custom-modal').style.display = 'none';
    modalCallback = null;
}

// --- NOTIFICATIONS ---
function toggleNotifPanel() {
    const panel = document.getElementById('notif-panel');
    panel.style.display = panel.style.display === 'block' ? 'none' : 'block';
    if (panel.style.display === 'block') clearNotifBadge();
}

async function addNotification(userName, msg) {
    const notif = { msg, time: new Date().toISOString(), read: false };
    if (isCloudActive) {
        const data = await cloudGet("notifications", userName) || { items: [] };
        data.items.unshift(notif);
        if (data.items.length > 50) data.items.pop();
        await cloudSave("notifications", userName, data);
    } else {
        let notifs = JSON.parse(localStorage.getItem('wash_rp_notifs') || '{}');
        if (!notifs[userName]) notifs[userName] = [];
        notifs[userName].unshift(notif);
        localStorage.setItem('wash_rp_notifs', JSON.stringify(notifs));
    }
    updateNotifUI();
}

async function updateNotifUI() {
    if (!currentUser) return;
    let userNotifs = [];
    if (isCloudActive) {
        const data = await cloudGet("notifications", currentUser.name);
        userNotifs = data ? data.items : [];
    } else {
        const notifs = JSON.parse(localStorage.getItem('wash_rp_notifs') || '{}');
        userNotifs = notifs[currentUser.name] || [];
    }
    
    const list = document.getElementById('notif-items-list');
    const badge = document.getElementById('notif-count');
    const unread = userNotifs.filter(n => !n.read).length;
    
    badge.innerText = unread;
    badge.style.display = unread > 0 ? 'block' : 'none';

    if (userNotifs.length === 0) {
        list.innerHTML = '<p style="font-size: 0.75rem; opacity: 0.5; text-align: center;">Nessuna nuova notifica</p>';
    } else {
        list.innerHTML = userNotifs.map(n => `
            <div class="notif-item" style="background: rgba(123,44,191,0.05); border-radius: 8px; margin-bottom: 8px; border-left: 3px solid var(--accent-purple);">
                <div style="font-weight:600;">⚠️ Avviso Sistema</div>
                <div style="margin: 4px 0;">${n.msg}</div>
                <small style="opacity:0.5;">${new Date(n.time).toLocaleString()}</small>
            </div>
        `).join('');
    }
}

async function clearNotifBadge() {
    if (!currentUser) return;
    if (isCloudActive) {
        const data = await cloudGet("notifications", currentUser.name);
        if (data) {
            data.items.forEach(n => n.read = true);
            await cloudSave("notifications", currentUser.name, data);
        }
    } else {
        let notifs = JSON.parse(localStorage.getItem('wash_rp_notifs') || '{}');
        if (notifs[currentUser.name]) {
            notifs[currentUser.name].forEach(n => n.read = true);
            localStorage.setItem('wash_rp_notifs', JSON.stringify(notifs));
        }
    }
    updateNotifUI();
}

// --- NAVIGATION ---
function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('overlay');
    if (!sidebar || !overlay) return;
    sidebar.classList.toggle('active');
    overlay.style.display = sidebar.classList.contains('active') ? 'block' : 'none';
}

function showSection(sectionId) {
    document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
    document.querySelectorAll('.sidebar-item').forEach(i => i.classList.remove('active'));
    
    const targetSection = document.getElementById(sectionId);
    if (targetSection) targetSection.classList.add('active');
    
    const items = document.querySelectorAll('.sidebar-item');
    items.forEach(item => { 
        if (item.getAttribute('onclick') && item.getAttribute('onclick').includes(`'${sectionId}'`)) {
            item.classList.add('active');
        }
    });

    if (window.innerWidth <= 768) toggleSidebar();

    // Auto-focus admin password if entering admin section
    if (sectionId === 'admin' && document.getElementById('admin-lock').style.display !== 'none') {
        setTimeout(() => document.getElementById('admin-pass-input').focus(), 100);
    }
}

// --- ADMIN MANAGEMENT FUNCTIONS ---
async function adminSearchSubject() {
    const query = document.getElementById('admin-search-input').value.trim().toLowerCase();
    const view = document.getElementById('admin-management-view');
    const title = document.getElementById('admin-target-name');
    
    let foundName = null;
    let logs = [];

    if (isCloudActive) {
        const snapshot = await db.collection("subjects").get();
        snapshot.forEach(doc => { if (doc.id.toLowerCase() === query) { foundName = doc.id; logs = doc.data().logs; } });
    } else {
        const subjects = JSON.parse(localStorage.getItem('wash_rp_subjects') || '{}');
        foundName = Object.keys(subjects).find(n => n.toLowerCase() === query);
        if (foundName) logs = subjects[foundName];
    }

    if (foundName) {
        title.innerText = `Cartella: ${foundName}`;
        view.style.display = 'block';
        renderAdminSancLists(foundName, logs);
    } else {
        showModal("Errore", "Soggetto non trovato nel database.", null);
        view.style.display = 'none';
    }
}

function renderAdminSancLists(name, logs) {
    const warnList = document.getElementById('admin-warn-list');
    const banList = document.getElementById('admin-ban-list');
    const warnDiscordList = document.getElementById('admin-warn-discord-list');
    
    warnList.innerHTML = ''; banList.innerHTML = ''; warnDiscordList.innerHTML = '';

    logs.forEach(log => {
        const item = `
            <div class="status-item-small" style="margin-bottom: 10px; padding: 10px; background: rgba(255,255,255,0.03); border-radius: 8px;">
                <div style="font-size: 0.8rem;">
                    <strong>${new Date(log.date).toLocaleDateString()}</strong><br>
                    ${log.reason}<br>
                    <small>Da: ${log.signature || log.staff}</small>
                </div>
                <i class="fas fa-trash-alt btn-remove" onclick="confirmRemoveSanc('${name}', '${log.id}')"></i>
            </div>
        `;
        if (log.type === 'warn') warnList.innerHTML += item;
        else if (log.type === 'ban') banList.innerHTML += item;
        else if (log.type === 'warn-discord') warnDiscordList.innerHTML += item;
    });
}

function confirmRemoveSanc(name, logId) {
    showModal("Rimuovi Sanzione", `Sei sicuro di voler eliminare questa sanzione per ${name}?`, async () => {
        if (isCloudActive) {
            const data = await cloudGet("subjects", name);
            if (data) {
                data.logs = data.logs.filter(l => l.id != logId);
                await cloudSave("subjects", name, data);
            }
        } else {
            let subjects = JSON.parse(localStorage.getItem('wash_rp_subjects') || '{}');
            subjects[name] = subjects[name].filter(l => l.id != logId);
            localStorage.setItem('wash_rp_subjects', JSON.stringify(subjects));
        }
        adminSearchSubject(); // Refresh view
        renderActiveBans();
        addGlobalLog(`Sanzione rimossa a ${name} da un amministratore.`, 'sanctions');
    });
}

// --- AUTHENTICATION ---
function handleLogin() {
    const user = document.getElementById('login-user').value.trim();
    const pass = document.getElementById('login-pass').value;
    const rotation = JSON.parse(localStorage.getItem('wash_rp_rotation'));
    const validPass = rotation ? rotation.currentPass : CONFIG.MAIN_PASSWORD;

    if (user && pass === validPass) {
        currentUser = { name: user, pfp: "https://cdn.discordapp.com/attachments/1476597416424898711/1502331326731124847/Gemini_Generated_Image_v6yt1xv6yt1xv6yt-removebg-preview.png?ex=69ff5294&is=69fe0114&hm=79af3db1bbf0e8da1e3884630bf382c13c41a436b6095a8e44768fae83bc2151" };
        localStorage.setItem('wash_rp_session', JSON.stringify(currentUser));
        showDashboard();
        loadUserServiceTime();
        updateNotifUI();
        addGlobalLog(`Staff ${user} ha effettuato l'accesso.`, 'access');
    } else {
        const error = document.getElementById('login-error');
        error.style.display = 'block';
        setTimeout(() => error.style.display = 'none', 3000);
    }
}

function logout() {
    if (currentUser) addGlobalLog(`Staff ${currentUser.name} ha effettuato il logout.`, 'access');
    localStorage.removeItem('wash_rp_session');
    location.reload();
}

function checkAdminPass() {
    const inputEl = document.getElementById('admin-pass-input');
    const pass = inputEl.value;
    if (pass === CONFIG.ADMIN_PASSWORD) {
        document.getElementById('admin-lock').style.display = 'none';
        document.getElementById('admin-content').style.display = 'block';
        inputEl.value = '';
        renderGlobalLogs();
        renderInactivityRequests();
    } else {
        showModal("Accesso Negato", "Password Amministratore Errata!", null);
    }
}

function showDashboard() {
    document.getElementById('login-overlay').style.opacity = '0';
    setTimeout(() => {
        document.getElementById('login-overlay').style.display = 'none';
        document.getElementById('dashboard').style.display = 'flex';
        document.getElementById('nav-username').innerText = currentUser.name;
    }, 500);
}

// --- STAFF SERVICE ---
function startService() {
    if (serviceInterval) return;
    serviceInterval = setInterval(updateTimer, 1000);
    addGlobalLog(`Staff ${currentUser.name} ha avviato il servizio.`, 'staff-service');
}
function pauseService() {
    if (!serviceInterval) return;
    clearInterval(serviceInterval);
    serviceInterval = null;
    addGlobalLog(`Staff ${currentUser.name} ha messo in pausa il servizio.`, 'staff-service');
    saveCurrentTime();
}
function stopService() {
    if (serviceInterval) clearInterval(serviceInterval);
    serviceInterval = null;
    saveCurrentTime();
    addGlobalLog(`Staff ${currentUser.name} ha terminato il servizio.`, 'staff-service');
    updateStaffList();
    showModal("Servizio Terminato", "Il tuo tempo è stato salvato correttamente.", null);
}
async function saveCurrentTime() {
    if (!currentUser) return;
    if (isCloudActive) {
        await cloudSave("staff", currentUser.name, { hours: totalActiveMs, lastUpdate: new Date().toISOString() });
    } else {
        let staffData = JSON.parse(localStorage.getItem('wash_rp_staff_hours') || '{}');
        staffData[currentUser.name] = totalActiveMs;
        localStorage.setItem('wash_rp_staff_hours', JSON.stringify(staffData));
    }
    updateStaffList();
    
    // Se un admin sta controllando proprio questo utente, aggiorna i quadrati in tempo reale
    const adminInput = document.getElementById('staff-check-input');
    if (adminInput && adminInput.value.trim().toLowerCase() === currentUser.name.toLowerCase()) {
        checkStaffStatus();
    }
}
function updateTimer() {
    totalActiveMs += 1000;
    updateTimerUI(totalActiveMs);
    if (totalActiveMs % 60000 === 0) saveCurrentTime();
}
function updateTimerUI(ms) {
    const h = Math.floor(ms / (1000 * 60 * 60));
    const m = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
    const s = Math.floor((ms % (1000 * 60)) / 1000);
    document.getElementById('service-timer').innerText = `${h.toString().padStart(2,'0')}:${m.toString().padStart(2,'0')}:${s.toString().padStart(2,'0')}`;
    const progress = Math.min((ms / CONFIG.SERVICE_GOAL_MS) * 100, 100);
    const bar = document.getElementById('service-progress');
    if (bar) bar.style.width = `${progress}%`;
    const goalText = document.querySelector('.progress-container + p');
    if (goalText) goalText.innerText = `Obiettivo: 4 Ore (${Math.floor((ms / CONFIG.SERVICE_GOAL_MS) * 100)}%)`;
}
async function updateStaffList() {
    const tbody = document.getElementById('staff-list-body');
    if (!tbody) return;
    let staffData = {};
    if (isCloudActive) {
        const snapshot = await db.collection("staff").get();
        snapshot.forEach(doc => staffData[doc.id] = doc.data().hours);
    } else {
        staffData = JSON.parse(localStorage.getItem('wash_rp_staff_hours') || '{}');
    }
    tbody.innerHTML = '';
    const sorted = Object.keys(staffData).sort((a, b) => staffData[b] - staffData[a]);
    if (sorted.length === 0) { tbody.innerHTML = '<tr><td colspan="3" style="text-align:center; opacity:0.5;">Nessun dato disponibile</td></tr>'; return; }
    sorted.forEach(name => {
        const ms = staffData[name];
        const h = Math.floor(ms / (1000 * 60 * 60));
        const m = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
        tbody.innerHTML += `<tr><td>${name}</td><td>${h}h ${m}m</td><td>${ms >= CONFIG.SERVICE_GOAL_MS ? '<i class="fas fa-check-circle status-check"></i>' : '<i class="fas fa-times-circle status-cross"></i>'}</td></tr>`;
    });
}

// --- SANCTIONS ---
async function submitSanc() {
    const type = document.getElementById('sanc-type').value;
    const subject = document.getElementById('sanc-subject').value.trim();
    const reason = document.getElementById('sanc-reason').value.trim();
    const expiry = document.getElementById('sanc-expiry').value;
    const signature = document.getElementById('sanc-signature').value.trim();

    if (!subject || !reason || !signature) { showModal("Errore", "Compila tutti i campi!", null); return; }
    const log = { id: Date.now(), type, subject, staff: currentUser.name, reason, signature, date: new Date().toISOString(), expiry: expiry || null };
    
    if (isCloudActive) {
        const data = await cloudGet("subjects", subject) || { logs: [] };
        data.logs.push(log);
        await cloudSave("subjects", subject, data);
    } else {
        let subjects = JSON.parse(localStorage.getItem('wash_rp_subjects') || '{}');
        if (!subjects[subject]) subjects[subject] = [];
        subjects[subject].push(log);
        localStorage.setItem('wash_rp_subjects', JSON.stringify(subjects));
    }

    addGlobalLog(`Staff ${currentUser.name} ha applicato un ${type.toUpperCase()} a ${subject}.`, 'sanctions');
    addNotification(subject, `Hai ricevuto un ${type.toUpperCase()}. Motivo: ${reason}. Firmato: ${signature}`);
    showModal("Successo", "Sanzione inviata con successo!", null);
    ['sanc-subject', 'sanc-reason', 'sanc-signature', 'sanc-expiry'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
    renderActiveBans();
}

async function renderActiveBans() {
    const container = document.getElementById('active-bans-container');
    if (!container) return;
    let subjects = {};
    if (isCloudActive) {
        const snapshot = await db.collection("subjects").get();
        snapshot.forEach(doc => subjects[doc.id] = doc.data().logs);
    } else {
        subjects = JSON.parse(localStorage.getItem('wash_rp_subjects') || '{}');
    }
    const now = new Date();
    let html = '';
    Object.keys(subjects).forEach(name => {
        subjects[name].forEach(log => {
            if (log.type === 'ban' && log.expiry) {
                const isActive = new Date(log.expiry) > now;
                html += `<div class="log-entry" style="display: flex; justify-content: space-between; align-items: center;"><div><strong>${name}</strong> - Motivo: ${log.reason}<br><small>Firma: ${log.signature} | Scadenza: ${new Date(log.expiry).toLocaleDateString()}</small></div><span class="status-tag ${isActive ? 'status-ban-active' : 'status-ban-ended'}">${isActive ? 'BAN IN CORSO' : 'BAN TERMINATO'}</span></div>`;
            }
        });
    });
    container.innerHTML = html || '<p style="opacity: 0.5;">Nessun ban attivo trovato.</p>';
}

// --- SEARCH ---
async function searchSubject() {
    const query = document.getElementById('search-input').value.trim().toLowerCase();
    const results = document.getElementById('search-results');
    results.innerHTML = '';
    let foundName = null;
    let logs = [];

    if (isCloudActive) {
        const snapshot = await db.collection("subjects").get();
        snapshot.forEach(doc => { if (doc.id.toLowerCase() === query) { foundName = doc.id; logs = doc.data().logs; } });
    } else {
        const subjects = JSON.parse(localStorage.getItem('wash_rp_subjects') || '{}');
        foundName = Object.keys(subjects).find(name => name.toLowerCase() === query);
        if (foundName) logs = subjects[foundName];
    }

    if (foundName) {
        results.innerHTML = `<h3>Storico per: ${foundName}</h3><hr style="margin: 1rem 0; opacity: 0.1;">`;
        logs.slice().reverse().forEach(log => {
            results.innerHTML += `<div class="log-entry" style="border-left-color: ${log.type === 'ban' ? 'var(--accent-red)' : 'var(--accent-purple)'}"><strong>${log.type.toUpperCase()}</strong> - ${new Date(log.date).toLocaleString()}<br><span>Motivo: ${log.reason}</span><br><small>Firmato: ${log.signature}</small></div>`;
        });
    } else { results.innerHTML = '<p style="color: var(--accent-red);">Nessun soggetto trovato.</p>'; }
}

// --- INACTIVITY ---
async function submitInactivity() {
    const discord = document.getElementById('ina-discord').value.trim();
    const rank = document.getElementById('ina-rank').value.trim();
    const reason = document.getElementById('ina-reason').value.trim();
    const start = document.getElementById('ina-start').value;
    const end = document.getElementById('ina-end').value;

    if (!discord || !rank || !reason || !start || !end) { showModal("Errore", "Compila tutti i campi!", null); return; }
    const request = { id: Date.now(), user: discord, rank, reason, start, end, status: 'pending' };

    if (isCloudActive) {
        await cloudSave("inactivity", request.id.toString(), request);
    } else {
        let requests = JSON.parse(localStorage.getItem('wash_rp_inactivity') || '[]');
        requests.push(request);
        localStorage.setItem('wash_rp_inactivity', JSON.stringify(requests));
    }

    showModal("Successo", "Richiesta inviata con successo!", null);
    ['ina-discord', 'ina-rank', 'ina-reason', 'ina-start', 'ina-end'].forEach(id => document.getElementById(id).value = '');
    renderInactivityRequests();
}

async function renderInactivityRequests() {
    const list = document.getElementById('admin-inactivity-list');
    if (!list) return;
    let requests = [];
    if (isCloudActive) {
        const snapshot = await db.collection("inactivity").where("status", "==", "pending").get();
        snapshot.forEach(doc => requests.push(doc.data()));
    } else {
        requests = JSON.parse(localStorage.getItem('wash_rp_inactivity') || '[]').filter(r => r.status === 'pending');
    }
    if (requests.length === 0) { list.innerHTML = '<p style="opacity: 0.5;">Nessuna richiesta pendente.</p>'; return; }
    list.innerHTML = requests.map(r => `
        <div class="request-card">
            <strong>${r.user}</strong> (${r.rank})<br>
            <p style="font-size:0.85rem; margin: 0.5rem 0;">Motivo: ${r.reason}<br>Periodo: ${r.start} / ${r.end}</p>
            <div style="display:flex; gap:10px;">
                <button class="btn btn-start" onclick="handleInactivity('${r.id}', 'approved')">ACCETTA</button>
                <button class="btn btn-stop" onclick="handleInactivity('${r.id}', 'rejected')">RIFIUTA</button>
            </div>
        </div>
    `).join('');
}

async function handleInactivity(id, status) {
    if (status === 'rejected') {
        showModal("Rifiuta Richiesta", "Inserisci il motivo del rifiuto:", (reason) => { processInactivity(id, 'rejected', reason); }, true);
    } else { processInactivity(id, 'approved'); }
}

async function processInactivity(id, status, reason = "") {
    let requests = [];
    let targetReq = null;
    if (isCloudActive) {
        const doc = await db.collection("inactivity").doc(id).get();
        if (doc.exists) targetReq = doc.data();
    } else {
        requests = JSON.parse(localStorage.getItem('wash_rp_inactivity') || '[]');
        targetReq = requests.find(r => r.id == id);
    }
    if (!targetReq) return;

    targetReq.status = status;
    const userName = targetReq.user;
    
    if (isCloudActive) {
        await db.collection("inactivity").doc(id).update({ status: status });
    } else {
        localStorage.setItem('wash_rp_inactivity', JSON.stringify(requests));
    }
    
    const msg = status === 'approved' ? "Richiesta inattività ACCETTATA. Buon riposo!" : `Richiesta inattività RIFIUTATA. Motivo: ${reason}`;
    addNotification(userName, msg);
    addGlobalLog(`Richiesta di ${userName} ${status === 'approved' ? 'ACCETTATA' : 'RIFIUTATA'}.`, 'access');
    renderInactivityRequests();
    showModal("Successo", `Richiesta ${status === 'approved' ? 'accettata' : 'rifiutata'}!`, null);
}

// --- STRIKES ---
async function submitStrike() {
    const target = document.getElementById('strike-target').value.trim();
    const reason = document.getElementById('strike-reason').value.trim();
    const num = document.getElementById('strike-num').value;
    const signature = document.getElementById('strike-signature').value.trim();

    if (!target || !reason || !signature) { showModal("Errore", "Compila tutti i campi!", null); return; }
    const strike = { id: Date.now(), target, reason, num, signature, date: new Date().toISOString() };

    if (isCloudActive) {
        const data = await cloudGet("strikes", target) || { list: [] };
        data.list.push(strike);
        await cloudSave("strikes", target, data);
    } else {
        let strikes = JSON.parse(localStorage.getItem('wash_rp_strikes') || '{}');
        if (!strikes[target]) strikes[target] = [];
        strikes[target].push(strike);
        localStorage.setItem('wash_rp_strikes', JSON.stringify(strikes));
    }

    addNotification(target, `Hai ricevuto uno STRIKE (${num}). Motivo: ${reason}. Firma: ${signature}`);
    addGlobalLog(`Strike ${num} assegnato a ${target}.`, 'sanctions');
    showModal("Successo", "Strike assegnato con successo!", null);
    ['strike-target', 'strike-reason', 'strike-signature'].forEach(id => document.getElementById(id).value = '');
}

// --- STAFF CONTROL ---
async function checkStaffStatus() {
    const query = document.getElementById('staff-check-input').value.trim().toLowerCase();
    const result = document.getElementById('staff-status-result');
    
    let staffHours = {};
    let strikes = {};
    let inactivity = [];

    if (isCloudActive) {
        const hoursSnap = await db.collection("staff").get();
        hoursSnap.forEach(doc => staffHours[doc.id] = doc.data().hours);
        const strikesSnap = await db.collection("strikes").get();
        strikesSnap.forEach(doc => strikes[doc.id] = doc.data().list);
        const inaSnap = await db.collection("inactivity").get();
        inaSnap.forEach(doc => inactivity.push(doc.data()));
    } else {
        staffHours = JSON.parse(localStorage.getItem('wash_rp_staff_hours') || '{}');
        strikes = JSON.parse(localStorage.getItem('wash_rp_strikes') || '{}');
        inactivity = JSON.parse(localStorage.getItem('wash_rp_inactivity') || '[]');
    }
    
    const allNames = new Set([...Object.keys(staffHours), ...Object.keys(strikes), ...inactivity.map(r => r.user)]);
    const target = [...allNames].find(n => n.toLowerCase() === query) || query;
    const ms = staffHours[target] || 0;
    const userStrikes = strikes[target] || [];
    const userInactivity = inactivity.filter(r => r.user.toLowerCase() === query);

    result.innerHTML = `
        <div class="status-grid">
            <div class="status-square">
                <h4>💼 Inattività</h4>
                ${userInactivity.length === 0 ? '<p style="opacity:0.5; font-size:0.8rem;">Nessuna richiesta.</p>' : userInactivity.map(r => `
                    <div class="status-item-small">
                        <div>${r.start} / ${r.end}<br><small>${r.status}</small></div>
                        <i class="fas fa-times-circle btn-remove" onclick="confirmRemoveInactivity('${r.id}', '${target}')"></i>
                    </div>
                `).join('')}
            </div>
            <div class="status-square">
                <h4>🕒 Ore Totali</h4>
                <div style="text-align:center; margin-top:2rem;">
                    <div style="font-size:2rem; font-weight:700;">${Math.floor(ms/(1000*60*60))}h</div>
                    <div style="opacity:0.6;">${Math.floor((ms%(1000*60*60))/(1000*60))}m totali</div>
                </div>
            </div>
            <div class="status-square">
                <h4>⚠️ Strikes</h4>
                ${userStrikes.length === 0 ? '<p style="opacity:0.5; font-size:0.8rem;">Nessuno strike.</p>' : userStrikes.map(s => `
                    <div class="status-item-small">
                        <div>Strike ${s.num}<br><small>${s.reason}</small></div>
                        <i class="fas fa-times-circle btn-remove" onclick="confirmRemoveStrike('${s.id}', '${target}')"></i>
                    </div>
                `).join('')}
            </div>
        </div>
    `;
}

function confirmRemoveInactivity(id, user) {
    showModal("Rimuovi Inattività", "Sei sicuro di voler eliminare questa richiesta?", async () => {
        if (isCloudActive) await db.collection("inactivity").doc(id).delete();
        else {
            let requests = JSON.parse(localStorage.getItem('wash_rp_inactivity') || '[]');
            requests = requests.filter(r => r.id != id);
            localStorage.setItem('wash_rp_inactivity', JSON.stringify(requests));
        }
        checkStaffStatus();
    });
}

function confirmRemoveStrike(id, user) {
    showModal("Rimuovi Strike", "Sei sicuro di voler togliere questo strike?", async () => {
        if (isCloudActive) {
            const data = await cloudGet("strikes", user);
            if (data) {
                data.list = data.list.filter(s => s.id != id);
                await cloudSave("strikes", user, data);
            }
        } else {
            let strikes = JSON.parse(localStorage.getItem('wash_rp_strikes') || '{}');
            strikes[user] = strikes[user].filter(s => s.id != id);
            localStorage.setItem('wash_rp_strikes', JSON.stringify(strikes));
        }
        checkStaffStatus();
    });
}

// --- LOGS ---
async function renderGlobalLogs() {
    let logs = [];
    if (isCloudActive) {
        const doc = await cloudGet("config", "global_logs");
        logs = doc ? doc.items : [];
    } else {
        logs = JSON.parse(localStorage.getItem('wash_rp_global_logs') || '[]');
    }
    const cS = document.getElementById('log-staff-service');
    const cA = document.getElementById('log-access');
    const cSn = document.getElementById('log-sanctions');
    if (!cS || !cA || !cSn) return;
    cS.innerHTML = ''; cA.innerHTML = ''; cSn.innerHTML = '';
    logs.forEach(log => {
        const h = `<div style="font-size: 0.7rem; padding: 5px; opacity: 0.8; border-bottom: 1px solid rgba(255,255,255,0.03);"><span style="color: var(--accent-purple);">[${new Date(log.time).toLocaleTimeString()}]</span> ${log.msg}</div>`;
        if (log.type === 'staff-service') cS.innerHTML += h;
        else if (log.type === 'access') cA.innerHTML += h;
        else if (log.type === 'sanctions') cSn.innerHTML += h;
    });
}

async function addGlobalLog(msg, type) {
    const log = { msg, type, time: new Date().toISOString() };
    if (isCloudActive) {
        const data = await cloudGet("config", "global_logs") || { items: [] };
        data.items.unshift(log);
        if (data.items.length > 200) data.items.pop();
        await cloudSave("config", "global_logs", data);
    } else {
        let logs = JSON.parse(localStorage.getItem('wash_rp_global_logs') || '[]');
        logs.unshift(log);
        if (logs.length > 200) logs.pop();
        localStorage.setItem('wash_rp_global_logs', JSON.stringify(logs));
    }
    if (document.getElementById('admin-content').style.display === 'block') renderGlobalLogs();
}

// --- OTHERS ---
function confirmResetHours() {
    showModal("Reset Settimanale", "Sei sicuro di voler resettare tutte le ore dello staff?", async () => {
        if (isCloudActive) {
            const snapshot = await db.collection("staff").get();
            const batch = db.batch();
            snapshot.forEach(doc => batch.delete(doc.ref));
            await batch.commit();
        } else {
            localStorage.setItem('wash_rp_staff_hours', '{}');
        }
        totalActiveMs = 0;
        updateTimerUI(0);
        updateStaffList();
        addGlobalLog(`Reset settimanale delle ore eseguito.`, 'access');
        showModal("Reset Completato", "Tutte le ore sono state azzerate.", null);
    });
}

function updateFormStyle() {
    const type = document.getElementById('sanc-type').value;
    const card = document.querySelector('#sanzioni .card');
    const dateField = document.getElementById('ban-dates');
    if (!card) return;
    card.className = 'card'; 
    if (type === 'ban') { card.classList.add('sanction-ban'); if (dateField) dateField.style.display = 'block'; }
    else { card.classList.add('sanction-warn'); if (dateField) dateField.style.display = 'none'; }
}

function autoCheckExpiredInactivity() {
    // Keep local version, cloud version handled by filtering on fetch
}
function checkPasswordRotation() {
    let rotation = JSON.parse(localStorage.getItem('wash_rp_rotation'));
    const now = Date.now();
    if (!rotation) { rotation = { lastChange: now, currentPass: CONFIG.MAIN_PASSWORD }; localStorage.setItem('wash_rp_rotation', JSON.stringify(rotation)); return; }
    const diffDays = (now - rotation.lastChange) / (1000 * 60 * 60 * 24);
    if (diffDays >= CONFIG.ROTATION_DAYS) {
        const oldPass = rotation.currentPass;
        const newPass = `staff_washiton${new Date().getFullYear() + 4}`; 
        rotation.lastChange = now;
        rotation.currentPass = newPass;
        localStorage.setItem('wash_rp_rotation', JSON.stringify(rotation));
        sendRotationWebhook(oldPass, newPass);
    }
}
async function sendRotationWebhook(oldPass, newPass) {
    const embed = { title: "🔄 ROTAZIONE AUTOMATICA PASSWORD", description: "Password aggiornata.", color: 0x7b2cbf, fields: [{ name: "Nuova Password", value: `||${newPass}||` }] };
    try { await fetch(CONFIG.WEBHOOK_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ embeds: [embed] }) }); } catch (e) {}
}
