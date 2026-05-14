const CONFIG = {
    MAIN_PASSWORD: "Washinton_staff2026",
    SERVICE_GOAL_MS: 4 * 60 * 60 * 1000, // 4 ore
    ROTATION_DAYS: 30,
    WEBHOOK_URL: "https://discord.com/api/webhooks/1502305049345527980/FpR2e6eZ1ydGV_lVtfJRbN3VQmUtygL3UPjS6TC4oAg-wxu9L5UMaPOVXZ7mM0O5b3PK",
    DISCORD_CLIENT_ID: "1504568108856246343",
    REDIRECT_URI: "https://washiton.onrender.com"
};

// --- FIREBASE CONFIGURATION ---
const firebaseConfig = {
    apiKey: "AIzaSyAcDuC3SZHMTS7asSBCNcX8eogYSVhjJ08",
    authDomain: "washington-dashboard.firebaseapp.com",
    databaseURL: "https://washington-dashboard-default-rtdb.europe-west1.firebasedatabase.app",
    projectId: "washington-dashboard",
    storageBucket: "washington-dashboard.firebasestorage.app",
    messagingSenderId: "937326759375",
    appId: "1:937326759375:web:aeca082bf4dc0a168e96ba",
    measurementId: "G-D1LTBG0DR5"
};

// --- STATE MANAGEMENT ---
let currentUser = null;
let discordTempAvatar = null;
let serviceInterval = null;
let totalActiveMs = 0;
let modalCallback = null;
let db = null;
let isCloudActive = false;
let currentRankingPage = 0;
const RANKING_PAGE_SIZE = 15;
let robloxTimeout = null;
const DEFAULT_ADMIN = "@70mich";

// --- INITIALIZATION ---
window.onload = async () => {
    initFirebase();
    checkSession();
    await syncData(); // Sync cloud data first
    updateStaffList();
    renderActiveBans();
    renderInactivityRequests();
    updateNotifUI();
    autoCheckExpiredInactivity();
    checkDiscordCallback();
};

function checkDiscordCallback() {
    // Rimuoviamo eventuali caratteri strani e prendiamo i parametri dopo l'hash #
    const hash = window.location.hash.substring(1);
    if (!hash) return;

    const params = new URLSearchParams(hash);
    const accessToken = params.get('access_token');

    if (accessToken) {
        // Puliamo l'URL per sicurezza ma teniamo il token in memoria
        history.replaceState(null, null, ' '); 
        fetchDiscordUser(accessToken);
    }
}

async function fetchDiscordUser(token) {
    const btn = document.getElementById('discord-login-btn');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> VERIFICA IN CORSO...';
    }

    try {
        const res = await fetch('https://discord.com/api/users/@me', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const user = await res.json();

        if (user.username) {
            const nick = `@${user.username}`;
            document.getElementById('login-user').value = nick;
            
            // Sblocco area password
            const passArea = document.getElementById('password-area');
            const loginBtn = document.getElementById('main-login-btn');
            const discordWarn = document.getElementById('discord-warning');
            const discordBtn = document.getElementById('discord-login-btn');

            passArea.style.opacity = "1";
            passArea.style.pointerEvents = "auto";
            loginBtn.disabled = false;
            if (discordWarn) discordWarn.style.display = 'none';
            if (discordBtn) discordBtn.style.display = 'none';

            document.getElementById('login-title').innerText = `CIAO, ${user.global_name || user.username}`;
            document.getElementById('login-subtitle').innerText = "Identità confermata! Inserisci la password.";
            
            // Salviamo temporaneamente l'avatar di Discord e lo mostriamo nella card
            if (user.avatar) {
                discordTempAvatar = `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png`;
                document.getElementById('login-avatar').src = discordTempAvatar;
                document.getElementById('login-avatar').style.border = "3px solid #ff007f";
                document.getElementById('login-avatar').style.boxShadow = "0 0 15px rgba(255, 0, 127, 0.3)";
            }

            // Focus password con un piccolo ritardo
            setTimeout(() => {
                document.getElementById('login-pass').focus();
            }, 300);
        }
    } catch (e) {
        console.error("Errore Discord OAuth:", e);
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<i class="fab fa-discord"></i> IDENTIFICATI CON DISCORD';
        }
    }
}

function loginWithDiscord() {
    const url = `https://discord.com/api/oauth2/authorize?client_id=${CONFIG.DISCORD_CLIENT_ID}&redirect_uri=${encodeURIComponent(CONFIG.REDIRECT_URI)}&response_type=token&scope=identify`;
    window.location.href = url;
}

function initFirebase() {
    if (firebaseConfig.apiKey !== "YOUR_API_KEY") {
        firebase.initializeApp(firebaseConfig);
        db = firebase.database();
        isCloudActive = true;
        console.log("🔥 Washington RP Realtime Database Online");
        
        // Controllo rotazione password
        checkPasswordRotation();

        // Listener per i LOG
        db.ref("logs").limitToLast(50).on("value", snapshot => {
            let logs = [];
            snapshot.forEach(child => { logs.unshift(child.val()); });
            renderGlobalLogs(logs);
        });

        // Listener per lo STAFF
        db.ref("staff").on("value", () => updateStaffList());
    } else {
        console.log("📂 Modalità Locale Attiva (Nessuna Config Firebase)");
    }
}


async function checkPasswordRotation() {
    if (!isCloudActive) return;
    const snap = await db.ref("config/passwords").once("value");
    const now = Date.now();
    
    if (!snap.exists()) {
        // Inizializzazione prima volta
        const initial = {
            staff: "Washinton_staff2026",
            admin: "WSHT_rp2026",
            lastRotation: now
        };
        await db.ref("config/passwords").set(initial);
        return;
    }

    const data = snap.val();
    const daysPassed = (now - data.lastRotation) / (1000 * 60 * 60 * 24);

    if (daysPassed >= CONFIG.ROTATION_DAYS) {
        const newStaff = "WSH_" + Math.random().toString(36).substring(2, 8).toUpperCase();
        const newAdmin = "ADM_" + Math.random().toString(36).substring(2, 8).toUpperCase();
        
        await db.ref("config/passwords").update({
            staff: newStaff,
            admin: newAdmin,
            lastRotation: now
        });

        sendRotationWebhook(data.staff, newStaff, data.admin, newAdmin);
    }
}

async function sendRotationWebhook(oldS, newS, oldA, newA) {
    if (CONFIG.WEBHOOK_URL === "YOUR_DISCORD_WEBHOOK_HERE") return;

    const embed = {
        username: "SISTEMA DI SICUREZZA WASHINGTON RP",
        avatar_url: "assets/logo.png", // NOTA: Per i Webhook serve un URL pubblico (es. Imgur o il sito hostato)
        embeds: [{
            title: "📢 ANNUNCIO: ROTAZIONE MENSILE CREDENZIALI",
            description: "Il protocollo di sicurezza ha generato le nuove chiavi di accesso obbligatorie. Le credenziali precedenti sono state revocate con effetto immediato.",
            color: 15158332, // Rosso/Oro serio
            fields: [
                { name: "📜 VECCHIA PASSWORD (STAFF)", value: `\`${oldS}\``, inline: true },
                { name: "📜 VECCHIA PASSWORD (ADMIN)", value: `\`${oldA}\``, inline: true },
                { name: "\u200B", value: "\u200B", inline: false }, // Spacer
                { name: "🔑 NUOVA PASSWORD (STAFF)", value: `**${newS}**`, inline: true },
                { name: "🔑 NUOVA PASSWORD (ADMIN)", value: `**${newA}**`, inline: true },
                { name: "\u200B", value: "\u200B", inline: false }, // Spacer
                { name: "⏳ SCADENZA", value: new Date(Date.now() + 30*24*60*60*1000).toLocaleDateString(), inline: true },
                { name: "🕒 ORARIO", value: new Date().toLocaleTimeString(), inline: true },
                { name: "⚠️ ATTENZIONE", value: "Nessuno deve pubblicare o condividere queste password esternamente. La violazione di questo protocollo comporterà sanzioni disciplinari gravi.", inline: false }
            ],
            footer: { text: "Washington RP Dashboard • Sistema Automatizzato di Sicurezza" },
            timestamp: new Date().toISOString()
        }]
    };

    fetch(CONFIG.WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(embed)
    });
}

async function syncData() {
    // Non necessario per RTDB dato che usiamo i listener .on()
}

// --- CLOUD HELPERS ---
async function cloudSave(path, data) {
    if (!isCloudActive) return;
    await db.ref(path).update(data);
}

async function cloudGet(path) {
    if (!isCloudActive) return null;
    const snapshot = await db.ref(path).once("value");
    return snapshot.exists() ? snapshot.val() : null;
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
        const data = await cloudGet(`staff/${currentUser.name}`);
        totalActiveMs = data ? (data.hours || 0) : 0;
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
function showModal(title, message, callback, showInput = false, singleButton = false) {
    document.getElementById('modal-title').innerText = title;
    document.getElementById('modal-message').innerText = message;
    document.getElementById('custom-modal').style.display = 'flex';
    document.getElementById('modal-input-area').style.display = showInput ? 'block' : 'none';
    if (showInput) document.getElementById('modal-textarea').value = '';
    
    modalCallback = callback;
    
    const confirmBtn = document.getElementById('modal-confirm-btn');
    const cancelBtn = document.querySelector('.modal-btns .btn-pause');
    
    if (singleButton) {
        confirmBtn.innerText = "OK";
        confirmBtn.style.width = "100%";
        cancelBtn.style.display = "none";
    } else {
        confirmBtn.innerText = "CONFERMA";
        confirmBtn.style.width = "auto";
        cancelBtn.style.display = "block";
    }

    confirmBtn.onclick = () => {
        const inputVal = showInput ? document.getElementById('modal-textarea').value : null;
        if (showInput && !inputVal) { alert("Devi inserire un motivo!"); return; }
        if (modalCallback) modalCallback(inputVal);
        closeModal();
    };
}

function closeModal() {
    document.getElementById('custom-modal').style.display = 'none';
    modalCallback = null;
    // Reset buttons for next call
    const cancelBtn = document.querySelector('.modal-btns .btn-pause');
    if (cancelBtn) cancelBtn.style.display = "block";
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
        await db.ref(`notifications/${userName}`).push(notif);
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
        const snapshot = await db.ref(`notifications/${currentUser.name}`).limitToLast(20).once("value");
        if (snapshot.exists()) {
            snapshot.forEach(child => { userNotifs.unshift(child.val()); });
        }
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
        // Semplicemente per comodità in RTDB le segniamo lette tutte insieme cancellando il badge locale o aggiornando il cloud
        // In questo caso per semplicità svuotiamo o aggiorniamo
    } else {
        let notifs = JSON.parse(localStorage.getItem('wash_rp_notifs') || '{}');
        if (notifs[currentUser.name]) {
            notifs[currentUser.name].forEach(n => n.read = true);
            localStorage.setItem('wash_rp_notifs', JSON.stringify(notifs));
        }
    }
    updateNotifUI();
}

// --- ADMIN MANAGEMENT FUNCTIONS ---
async function adminSearchSubject() {
    const query = document.getElementById('admin-search-input').value.trim().toLowerCase();
    const view = document.getElementById('admin-management-view');
    const title = document.getElementById('admin-target-name');
    
    let foundName = null;
    let logs = [];

    if (isCloudActive) {
        const snapshot = await db.ref("subjects").once("value");
        snapshot.forEach(child => { 
            if (child.key.toLowerCase() === query) { 
                foundName = child.key; 
                logs = Object.values(child.val()); 
            } 
        });
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
            await db.ref(`subjects/${name}/${logId}`).remove();
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
function logout() {
    if (currentUser) addGlobalLog(`Staff ${currentUser.name} ha effettuato il logout.`, 'access');
    localStorage.removeItem('wash_rp_session');
    location.reload();
}

async function checkAdminLogin() {
    const btn = document.querySelector('#admin-lock .btn-start');
    const passInput = document.getElementById('admin-pass-input');
    const pass = passInput.value;
    let correctPass = "WSHT_rp2026";

    if (btn) btn.innerText = "VERIFICA...";

    try {
        if (isCloudActive) {
            const snap = await db.ref("config/passwords/admin").once("value");
            if (snap.exists()) correctPass = snap.val();
        }

        if (pass === correctPass) {
            document.getElementById('admin-lock').style.display = 'none';
            document.getElementById('admin-content').style.display = 'block';
            passInput.value = '';
            renderGlobalLogs();
            renderInactivityRequests();
            addGlobalLog(`Accesso Area Amministrativa effettuato.`, 'access');
        } else {
            showModal("Accesso Negato", "Password Amministratore Errata!", null);
        }
    } catch (e) {
        console.error(e);
        alert("Errore di connessione al database admin.");
    } finally {
        if (btn) btn.innerText = "SBLOCCA";
    }
}

// Alias per compatibilità HTML
function checkAdminPass() { checkAdminLogin(); }

async function checkStaffLogin() {
    const user = document.getElementById('login-user').value.trim();
    const pass = document.getElementById('login-pass').value;
    const btn = document.querySelector('.login-btn');
    const errorEl = document.getElementById('login-error');
    
    if (!user.startsWith('@')) {
        showModal("Attenzione", "Il nome utente deve iniziare obbligatoriamente con la @ per accedere!", null, false, true);
        return;
    }

    if (btn) { btn.disabled = true; btn.innerText = "VERIFICA ACCESSO..."; }
    if (errorEl) errorEl.style.display = 'none';

    let correctPass = "Washinton_staff2026";

    try {
        if (isCloudActive) {
            const snap = await db.ref("config/passwords/staff").once("value");
            if (snap.exists()) correctPass = snap.val();
        }

        // Controllo autorizzazione
        let isAuthorized = (user.toLowerCase() === DEFAULT_ADMIN.toLowerCase());
        
        if (!isAuthorized && isCloudActive) {
            // Firebase non accetta punti nei nomi delle chiavi, li sostituiamo con underscore per il controllo
            const safeNick = user.replace(/\./g, '_');
            const authSnap = await db.ref(`authorized_staff/${safeNick}`).once("value");
            if (authSnap.exists()) isAuthorized = true;
        }

        if (pass === correctPass && isAuthorized) {
            currentUser = { 
                name: user, 
                pfp: discordTempAvatar || "assets/logo.png" 
            };
            localStorage.setItem('wash_rp_session', JSON.stringify(currentUser));
            showDashboard();
            loadUserServiceTime();
            updateNotifUI();
            addGlobalLog(`Staff ${user} ha effettuato l'accesso.`, 'access');
        } else {
            if (errorEl) {
                errorEl.innerText = "Attenzione: il tuo nome staff o la password non sono corretti!";
                errorEl.style.display = 'block';
            }
        }
    } catch (e) {
        console.error(e);
        alert("Errore critico durante l'accesso. Controlla la connessione.");
    } finally {
        if (btn) { btn.disabled = false; btn.innerText = "ACCEDI"; }
    }
}

function showDashboard() {
    document.getElementById('login-overlay').style.opacity = '0';
    setTimeout(() => {
        document.getElementById('login-overlay').style.display = 'none';
        document.getElementById('dashboard').style.display = 'flex';
        document.getElementById('nav-username').innerText = currentUser.name;
        
        // Se abbiamo l'avatar di Discord, lo impostiamo nella navigazione
        if (currentUser.pfp) {
            document.getElementById('nav-pfp').src = currentUser.pfp;
        }
    }, 500);
}

// --- STAFF SERVICE ---
async function startService() {
    if (serviceInterval) return;
    const btn = document.querySelector('.btn-start');
    if (btn) btn.disabled = true;

    try {
        serviceInterval = setInterval(updateTimer, 1000);
        const startTime = new Date().toLocaleTimeString();
        if (isCloudActive) {
            await db.ref(`staff/${currentUser.name}`).update({ 
                status: "In Servizio", 
                startTime: startTime,
                lastUpdate: new Date().toISOString() 
            });
        } else {
            let staffStatus = JSON.parse(localStorage.getItem('wash_rp_staff_status') || '{}');
            staffStatus[currentUser.name] = { status: "In Servizio", startTime: startTime };
            localStorage.setItem('wash_rp_staff_status', JSON.stringify(staffStatus));
        }
        addGlobalLog(`Staff ${currentUser.name} ha avviato il servizio.`, 'staff-service');
    } catch (e) {
        console.error(e);
        clearInterval(serviceInterval);
        serviceInterval = null;
        alert("Errore nell'avvio del servizio.");
    } finally {
        if (btn) btn.disabled = false;
    }
}


async function pauseService() {
    if (!serviceInterval) return;
    clearInterval(serviceInterval);
    serviceInterval = null;
    
    if (isCloudActive) {
        await db.ref(`staff/${currentUser.name}`).update({ status: "In Pausa" });
    }
    
    addGlobalLog(`Staff ${currentUser.name} ha messo in pausa il servizio.`, 'staff-service');
    saveCurrentTime();
}

async function stopService() {
    if (serviceInterval) clearInterval(serviceInterval);
    serviceInterval = null;
    
    if (isCloudActive) {
        await db.ref(`staff/${currentUser.name}`).update({ 
            status: "Offline", 
            startTime: null 
        });
    } else {
        let staffStatus = JSON.parse(localStorage.getItem('wash_rp_staff_status') || '{}');
        staffStatus[currentUser.name] = { status: "Offline", startTime: null };
        localStorage.setItem('wash_rp_staff_status', JSON.stringify(staffStatus));
    }

    saveCurrentTime();
    addGlobalLog(`Staff ${currentUser.name} ha terminato il servizio.`, 'staff-service');
    showModal("Servizio Terminato", "Il tuo tempo è stato salvato correttamente. Non è stato resettato, potrai riprendere da qui.", null);
}

async function saveCurrentTime() {
    if (!currentUser) return;
    if (isCloudActive) {
        await cloudSave(`staff/${currentUser.name}`, { hours: totalActiveMs, lastUpdate: new Date().toISOString() });
    } else {
        let staffData = JSON.parse(localStorage.getItem('wash_rp_staff_hours') || '{}');
        staffData[currentUser.name] = totalActiveMs;
        localStorage.setItem('wash_rp_staff_hours', JSON.stringify(staffData));
    }
    updateStaffList();
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

function changeRankingPage(delta) {
    currentRankingPage += delta;
    if (currentRankingPage < 0) currentRankingPage = 0;
    updateStaffList();
}

async function updateStaffList() {
    const activeBody = document.getElementById('active-staff-body');
    const rankingBody = document.getElementById('hours-ranking-body');
    if (!activeBody || !rankingBody) return;

    let staffData = {};
    if (isCloudActive) {
        const snapshot = await db.ref("staff").once("value");
        if (snapshot.exists()) staffData = snapshot.val();
    } else {
        const hours = JSON.parse(localStorage.getItem('wash_rp_staff_hours') || '{}');
        const status = JSON.parse(localStorage.getItem('wash_rp_staff_status') || '{}');
        Object.keys(hours).forEach(name => {
            staffData[name] = { 
                hours: hours[name], 
                status: status[name]?.status || "Offline", 
                startTime: status[name]?.startTime || "" 
            };
        });
    }

    // --- RENDER ACTIVE STAFF ---
    activeBody.innerHTML = '';
    const activeStaff = Object.keys(staffData).filter(name => staffData[name].status === "In Servizio");
    if (activeStaff.length === 0) {
        activeBody.innerHTML = '<tr><td colspan="3" style="text-align:center; opacity:0.5;">Nessuno in servizio</td></tr>';
    } else {
        activeStaff.forEach(name => {
            activeBody.innerHTML += `
                <tr>
                    <td><strong>${name}</strong></td>
                    <td>${staffData[name].startTime || "---"}</td>
                    <td><span class="status-tag" style="background: rgba(46,204,113,0.2); color: #2ecc71; border: 1px solid #2ecc71;">ATTIVO</span></td>
                </tr>
            `;
        });
    }

    // --- RENDER HOURS RANKING (Alphabetical & Paginated) ---
    rankingBody.innerHTML = '';
    // Sorting alphabetically as requested
    const sortedNames = Object.keys(staffData).sort((a, b) => a.localeCompare(b, undefined, {sensitivity: 'base'}));
    
    const totalPages = Math.ceil(sortedNames.length / RANKING_PAGE_SIZE);
    if (currentRankingPage >= totalPages && totalPages > 0) currentRankingPage = totalPages - 1;

    const startIdx = currentRankingPage * RANKING_PAGE_SIZE;
    const endIdx = startIdx + RANKING_PAGE_SIZE;
    const pageItems = sortedNames.slice(startIdx, endIdx);

    document.getElementById('ranking-page-info').innerText = `Pagina ${currentRankingPage + 1} di ${Math.max(1, totalPages)}`;

    if (sortedNames.length === 0) {
        rankingBody.innerHTML = '<tr><td colspan="4" style="text-align:center; opacity:0.5;">Nessun dato</td></tr>';
    } else {
        pageItems.forEach((name, index) => {
            const globalIndex = startIdx + index;
            const ms = staffData[name].hours || 0;
            const h = Math.floor(ms / (1000 * 60 * 60));
            const m = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
            const isGoalMet = ms >= CONFIG.SERVICE_GOAL_MS;
            
            rankingBody.innerHTML += `
                <tr>
                    <td style="opacity: 0.5;">#${globalIndex + 1}</td>
                    <td>${name}</td>
                    <td style="font-weight: 600;">${h}h ${m}m</td>
                    <td>${isGoalMet ? '<i class="fas fa-check-circle" style="color: #2ecc71;"></i>' : '<i class="fas fa-times-circle" style="color: var(--accent-red);"></i>'}</td>
                </tr>
            `;
        });
    }
}

// --- SANCTIONS ---
async function submitSanc() {
    const btn = document.querySelector('#sanzioni .login-btn');
    const type = document.getElementById('sanc-type').value;
    const subject = document.getElementById('sanc-subject').value.trim();
    const reason = document.getElementById('sanc-reason').value.trim();
    const expiry = document.getElementById('sanc-expiry').value;
    const signature = document.getElementById('sanc-signature').value.trim();

    if (!subject || !reason || !signature) { showModal("Errore", "Compila tutti i campi!", null); return; }
    if (!signature.startsWith('@')) { showModal("Errore", "La firma deve obbligatoriamente iniziare con @!", null); return; }
    if (btn) { btn.disabled = true; btn.innerText = "INVIO IN CORSO..."; }

    const log = { id: Date.now(), type, subject, staff: currentUser.name, reason, signature, date: new Date().toISOString(), expiry: expiry || null };
    
    try {
        if (isCloudActive) {
            await db.ref(`subjects/${subject}/${log.id}`).set(log);
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
    } catch (e) {
        console.error(e);
        alert("Errore nell'invio della sanzione.");
    } finally {
        if (btn) { btn.disabled = false; btn.innerText = "INVIA SANZIONE"; }
    }
}


async function renderActiveBans() {
    const container = document.getElementById('active-bans-container');
    if (!container) return;
    let subjects = {};
    if (isCloudActive) {
        const snapshot = await db.ref("subjects").once("value");
        if (snapshot.exists()) subjects = snapshot.val();
    } else {
        subjects = JSON.parse(localStorage.getItem('wash_rp_subjects') || '{}');
    }
    const now = new Date();
    let html = '';
    Object.keys(subjects).forEach(name => {
        const logs = Array.isArray(subjects[name]) ? subjects[name] : Object.values(subjects[name]);
        logs.forEach(log => {
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
        const snapshot = await db.ref("subjects").once("value");
        snapshot.forEach(child => { 
            if (child.key.toLowerCase() === query) { 
                foundName = child.key; 
                logs = Object.values(child.val()); 
            } 
        });
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
    const btn = document.querySelector('#inattivita .login-btn');
    const discord = document.getElementById('ina-discord').value.trim();
    const rank = document.getElementById('ina-rank').value.trim();
    const reason = document.getElementById('ina-reason').value.trim();
    const start = document.getElementById('ina-start').value;
    const end = document.getElementById('ina-end').value;

    if (!discord || !rank || !reason || !start || !end) { showModal("Errore", "Compila tutti i campi!", null); return; }
    if (!discord.startsWith('@')) { showModal("Errore", "Il nome Discord deve iniziare obbligatoriamente con @!", null); return; }
    if (btn) { btn.disabled = true; btn.innerText = "INVIO IN CORSO..."; }

    const request = { id: Date.now(), user: discord, rank, reason, start, end, status: 'pending' };

    try {
        if (isCloudActive) {
            await db.ref(`inactivity/${request.id}`).set(request);
        } else {
            let requests = JSON.parse(localStorage.getItem('wash_rp_inactivity') || '[]');
            requests.push(request);
            localStorage.setItem('wash_rp_inactivity', JSON.stringify(requests));
        }

        showModal("Successo", "Richiesta inviata con successo!", null);
        ['ina-discord', 'ina-rank', 'ina-reason', 'ina-start', 'ina-end'].forEach(id => document.getElementById(id).value = '');
        renderInactivityRequests();
    } catch (e) {
        console.error(e);
        alert("Errore nell'invio della richiesta.");
    } finally {
        if (btn) { btn.disabled = false; btn.innerText = "INVIA RICHIESTA"; }
    }
}


async function renderInactivityRequests() {
    const list = document.getElementById('admin-inactivity-list');
    if (!list) return;
    let requests = [];
    if (isCloudActive) {
        const snapshot = await db.ref("inactivity").once("value");
        if (snapshot.exists()) {
            snapshot.forEach(child => { if (child.val().status === 'pending') requests.push(child.val()); });
        }
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
    let targetReq = null;
    if (isCloudActive) {
        const snapshot = await db.ref(`inactivity/${id}`).once("value");
        if (snapshot.exists()) targetReq = snapshot.val();
    } else {
        let requests = JSON.parse(localStorage.getItem('wash_rp_inactivity') || '[]');
        targetReq = requests.find(r => r.id == id);
    }
    if (!targetReq) return;

    targetReq.status = status;
    const userName = targetReq.user;
    
    if (isCloudActive) {
        await db.ref(`inactivity/${id}`).update({ status: status });
    } else {
        let requests = JSON.parse(localStorage.getItem('wash_rp_inactivity') || '[]');
        requests.find(r => r.id == id).status = status;
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
    const btn = document.querySelector('#admin .login-btn');
    const target = document.getElementById('strike-target').value.trim();
    const reason = document.getElementById('strike-reason').value.trim();
    const num = document.getElementById('strike-num').value;
    const signature = document.getElementById('strike-signature').value.trim();

    if (!target || !reason || !signature) { showModal("Errore", "Compila tutti i campi!", null); return; }
    if (btn) { btn.disabled = true; btn.innerText = "INVIO IN CORSO..."; }

    const strike = { id: Date.now(), target, reason, num, signature, date: new Date().toISOString() };

    try {
        if (isCloudActive) {
            await db.ref(`strikes/${target}/${strike.id}`).set(strike);
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
    } catch (e) {
        console.error(e);
        alert("Errore nell'assegnazione dello strike.");
    } finally {
        if (btn) { btn.disabled = false; btn.innerText = "AGGIUNGI STRIKE"; }
    }
}


// --- STAFF CONTROL ---
async function checkStaffStatus() {
    const query = document.getElementById('staff-check-input').value.trim().toLowerCase();
    const result = document.getElementById('staff-status-result');
    
    let staffHours = {};
    let strikes = {};
    let inactivity = [];

    if (isCloudActive) {
        const hoursSnap = await db.ref("staff").once("value");
        if (hoursSnap.exists()) staffHours = hoursSnap.val();
        const strikesSnap = await db.ref("strikes").once("value");
        if (strikesSnap.exists()) strikes = strikesSnap.val();
        const inaSnap = await db.ref("inactivity").once("value");
        if (inaSnap.exists()) inaSnap.forEach(child => inactivity.push(child.val()));
    } else {
        staffHours = JSON.parse(localStorage.getItem('wash_rp_staff_hours') || '{}');
        strikes = JSON.parse(localStorage.getItem('wash_rp_strikes') || '{}');
        inactivity = JSON.parse(localStorage.getItem('wash_rp_inactivity') || '[]');
    }
    
    const allNames = new Set([...Object.keys(staffHours), ...Object.keys(strikes), ...inactivity.map(r => r.user)]);
    const target = [...allNames].find(n => n.toLowerCase() === query) || query;
    const ms = (staffHours[target]?.hours) || 0;
    const userStrikes = strikes[target] ? Object.values(strikes[target]) : [];
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
        if (isCloudActive) await db.ref(`inactivity/${id}`).remove();
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
            await db.ref(`strikes/${user}/${id}`).remove();
        } else {
            let strikes = JSON.parse(localStorage.getItem('wash_rp_strikes') || '{}');
            strikes[user] = strikes[user].filter(s => s.id != id);
            localStorage.setItem('wash_rp_strikes', JSON.stringify(strikes));
        }
        checkStaffStatus();
    });
}

// --- GESTIONE PERSONALE STAFF (ADMIN) ---
async function registerStaff() {
    const date = document.getElementById('reg-staff-date').value;
    const nick = document.getElementById('reg-staff-nick').value.trim();

    if (!date || !nick) { showModal("Errore", "Devi compilare tutti i campi per registrare lo staff!", null); return; }
    if (!nick.startsWith('@')) { showModal("Errore", "Il nickname deve obbligatoriamente iniziare con @!", null); return; }

    try {
        if (isCloudActive) {
            const safeNick = nick.replace(/\./g, '_');
            await db.ref(`authorized_staff/${safeNick}`).set({
                nick: nick,
                date: date,
                addedBy: currentUser.name,
                timestamp: Date.now()
            });
            // Assicuriamoci che abbia un nodo ore
            await db.ref(`staff/${nick}`).update({ hours: 0, status: "Offline" });
        }
        addGlobalLog(`L'amministratore ${currentUser.name} ha registrato ufficialmente lo staffer ${nick}.`, 'access');
        showModal("Staff Registrato", "Staff registrato con successo! Ora può accedere alla dashboard.", null);
        document.getElementById('reg-staff-nick').value = '';
    } catch (e) {
        console.error(e);
        alert("Errore durante la registrazione dello staff.");
    }
}

async function removeStaff() {
    const date = document.getElementById('rem-staff-date').value;
    const reason = document.getElementById('rem-staff-reason').value.trim();
    const nick = document.getElementById('rem-staff-nick').value.trim();

    if (!date || !reason || !nick) { showModal("Errore", "Compila tutti i campi per rimuovere lo staff!", null); return; }

    showModal("Conferma Rimozione", `Sei sicuro di voler eliminare @${nick} dallo staff? Non potrà più accedere.`, async () => {
        try {
            if (isCloudActive) {
                const safeNick = nick.replace(/\./g, '_');
                await db.ref(`authorized_staff/${safeNick}`).remove();
                await db.ref(`staff/${nick}`).remove();
            }
            addGlobalLog(`LO STAFF ${nick} è stato RIMOSSO da ${currentUser.name}. Motivo: ${reason}`, 'access');
            showModal("Eseguito", "Staff eliminato correttamente dal sistema.", null);
            document.getElementById('rem-staff-nick').value = '';
            document.getElementById('rem-staff-reason').value = '';
        } catch (e) {
            console.error(e);
            alert("Errore durante la rimozione.");
        }
    });
}

async function modifyStaffNick() {
    const reason = document.getElementById('mod-staff-reason').value.trim();
    const oldNick = document.getElementById('mod-staff-old').value.trim();
    const newNick = document.getElementById('mod-staff-new').value.trim();

    if (!reason || !oldNick || !newNick) { showModal("Errore", "Compila tutti i campi per modificare il nick!", null); return; }
    if (!newNick.startsWith('@')) { showModal("Errore", "Il nuovo nick deve iniziare con @!", null); return; }

    try {
        if (isCloudActive) {
            const safeOld = oldNick.replace(/\./g, '_');
            const safeNew = newNick.replace(/\./g, '_');
            
            const snap = await db.ref(`authorized_staff/${safeOld}`).once("value");
            if (snap.exists()) {
                const data = snap.val();
                data.nick = newNick;
                await db.ref(`authorized_staff/${safeNew}`).set(data);
                await db.ref(`authorized_staff/${safeOld}`).remove();
                
                // Trasferimento ore
                const hoursSnap = await db.ref(`staff/${oldNick}`).once("value");
                if (hoursSnap.exists()) {
                    await db.ref(`staff/${newNick}`).set(hoursSnap.val());
                    await db.ref(`staff/${oldNick}`).remove();
                }
                
                addGlobalLog(`L'amministratore ${currentUser.name} ha modificato il nick di ${oldNick} in ${newNick}.`, 'access');
                showModal("Successo", "Nickname aggiornato con successo!", null);
                ['mod-staff-reason', 'mod-staff-old', 'mod-staff-new'].forEach(id => document.getElementById(id).value = '');
            } else {
                showModal("Errore", "Il vecchio nick non è stato trovato nel sistema.", null);
            }
        }
    } catch (e) {
        console.error(e);
        alert("Errore durante la modifica del nick.");
    }
}

// --- LOGS ---
async function renderGlobalLogs(cloudLogs = null) {
    let logs = [];
    if (cloudLogs) {
        logs = cloudLogs;
    } else if (isCloudActive) {
        const snapshot = await db.ref("logs").limitToLast(50).once("value");
        if (snapshot.exists()) {
            snapshot.forEach(child => { logs.unshift(child.val()); });
        }
    } else {
        logs = JSON.parse(localStorage.getItem('wash_rp_global_logs') || '[]');
    }

    const cS = document.getElementById('log-staff-service');
    const cA = document.getElementById('log-access');
    const cSn = document.getElementById('log-sanctions');
    if (!cS || !cA || !cSn) return;
    
    cS.innerHTML = ''; cA.innerHTML = ''; cSn.innerHTML = '';
    logs.forEach(log => {
        const timeStr = new Date(log.time).toLocaleTimeString();
        const html = `<div style="font-size: 0.7rem; padding: 6px; border-bottom: 1px solid rgba(255,255,255,0.03);">
                        <span style="color: var(--accent-purple); font-weight: 600;">[${timeStr}]</span> ${log.msg}
                      </div>`;
        
        if (log.type === 'staff-service') cS.innerHTML += html;
        else if (log.type === 'access') cA.innerHTML += html;
        else if (log.type === 'sanctions') cSn.innerHTML += html;
    });
}

async function addGlobalLog(msg, type) {
    const log = { msg, type, time: new Date().toISOString(), staff: currentUser ? currentUser.name : "Sistema" };
    if (isCloudActive) {
        await db.ref("logs").push(log);
    } else {
        let logs = JSON.parse(localStorage.getItem('wash_rp_global_logs') || '[]');
        logs.unshift(log);
        if (logs.length > 200) logs.pop();
        localStorage.setItem('wash_rp_global_logs', JSON.stringify(logs));
        if (document.getElementById('admin-content').style.display === 'block') renderGlobalLogs();
    }
}

// --- OTHERS ---
function confirmResetHours() {
    showModal("Reset Settimanale", "ATTENZIONE: Sei sicuro di voler resettare tutte le ore e la classifica? Ogni sessione attiva verrà chiusa e tutti gli staffer risulteranno Offline.", async () => {
        if (isCloudActive) {
            const snapshot = await db.ref("staff").once("value");
            if (snapshot.exists()) {
                const updates = {};
                snapshot.forEach(child => {
                    updates[`staff/${child.key}/hours`] = 0;
                    updates[`staff/${child.key}/status`] = "Offline";
                    updates[`staff/${child.key}/startTime`] = null;
                });
                await db.ref().update(updates);
            }
            // Pulisci i log
            await db.ref("logs").remove();
        } else {
            localStorage.setItem('wash_rp_staff_hours', '{}');
            localStorage.setItem('wash_rp_staff_status', '{}');
            localStorage.setItem('wash_rp_global_logs', '[]');
        }
        
        // Se l'utente corrente era in servizio, fermiamo il timer locale
        if (serviceInterval) {
            clearInterval(serviceInterval);
            serviceInterval = null;
        }
        
        totalActiveMs = 0;
        currentRankingPage = 0;
        updateTimerUI(0);
        updateStaffList();
        addGlobalLog(`Reset settimanale eseguito. Tutti gli shift sono stati terminati.`, 'access');
        showModal("Reset Completato", "Classifica, ore e stati resettati con successo.", null);
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

async function syncData() {
    // Gestito dai listener .on() di Firebase
}

// --- ROBLOX INTEGRATION ---
function debounceRobloxPreview(username, imgId, suggestionsId) {
    clearTimeout(robloxTimeout);
    const img = document.getElementById(imgId);
    const sugg = document.getElementById(suggestionsId);
    
    if (!username || username.length < 3 || username.startsWith('@')) {
        if (img) img.style.display = 'none';
        if (sugg) { sugg.innerHTML = ''; sugg.style.display = 'none'; }
        return;
    }
    robloxTimeout = setTimeout(() => {
        updateRobloxPreview(username, imgId);
        showRobloxSuggestions(username, suggestionsId, imgId);
    }, 500);
}

async function showRobloxSuggestions(query, suggestionsId, imgId) {
    const sugg = document.getElementById(suggestionsId);
    if (!sugg) return;

    try {
        const res = await fetch(`https://users.roproxy.com/v1/users/search?keyword=${query}&limit=5`);
        const data = await res.json();

        if (data.data && data.data.length > 0) {
            const userIds = data.data.map(u => u.id);
            const thumbRes = await fetch(`https://thumbnails.roproxy.com/v1/users/avatar-headshot?userIds=${userIds.join(',')}&size=150x150&format=Png&isCircular=true`);
            const thumbData = await thumbRes.json();
            
            sugg.innerHTML = data.data.map((user, idx) => {
                const thumb = thumbData.data.find(t => t.targetId === user.id)?.imageUrl || 'assets/logo.png';
                return `
                    <div class="suggestion-item" onclick="selectRobloxUser('${user.name}', '${thumb}', '${suggestionsId}', '${imgId}')">
                        <img src="${thumb}" alt="Avatar">
                        <div>
                            <div class="name">${user.name}</div>
                            <div class="display-name">${user.displayName}</div>
                        </div>
                    </div>
                `;
            }).join('');
            sugg.style.display = 'block';
        } else {
            sugg.style.display = 'none';
        }
    } catch (e) {
        console.error("Errore suggerimenti Roblox:", e);
        sugg.style.display = 'none';
    }
}

function selectRobloxUser(username, thumb, suggestionsId, imgId) {
    const inputId = suggestionsId.includes('sanc') ? 'sanc-subject' : 'search-input';
    document.getElementById(inputId).value = username;
    document.getElementById(suggestionsId).style.display = 'none';
    const img = document.getElementById(imgId);
    if (img) {
        img.src = thumb;
        img.style.display = 'block';
    }
}

async function updateRobloxPreview(username, imgId) {
    const img = document.getElementById(imgId);
    if (!img) return;

    try {
        const userRes = await fetch(`https://users.roproxy.com/v1/usernames/users`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ usernames: [username], excludeBannedUsers: false })
        });
        const userData = await userRes.json();

        if (userData.data && userData.data.length > 0) {
            const userId = userData.data[0].id;
            const thumbRes = await fetch(`https://thumbnails.roproxy.com/v1/users/avatar-headshot?userIds=${userId}&size=150x150&format=Png&isCircular=true`);
            const thumbData = await thumbRes.json();

            if (thumbData.data && thumbData.data.length > 0) {
                img.src = thumbData.data[0].imageUrl;
                img.style.display = 'block';
                return;
            }
        }
        img.style.display = 'none';
    } catch (e) {
        console.error("Errore recupero avatar Roblox:", e);
        img.style.display = 'none';
    }
}
