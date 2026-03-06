
'use strict';

// ===== SOUS-STATUTS CONFIG =====
const SOUS_STATUTS = {
  prospect: [
    { value: 'appel_1_nr', label: '1er appel – Pas répondu', cls: 'sous-badge-nr' },
    { value: 'appel_1_ok', label: '1er appel – Répondu',     cls: 'sous-badge-ok' },
    { value: 'appel_2_nr', label: '2ème appel – Pas répondu',cls: 'sous-badge-nr' },
    { value: 'appel_2_ok', label: '2ème appel – Répondu',    cls: 'sous-badge-ok' },
    { value: 'appel_3_nr', label: '3ème appel – Pas répondu',cls: 'sous-badge-nr' },
    { value: 'appel_3_ok', label: '3ème appel – Répondu',    cls: 'sous-badge-ok' },
    { value: 'sans_suite', label: 'Sans suite',               cls: 'sous-badge-grey' },
  ],
  rdv: [
    { value: 'rdv_planifie', label: 'RDV planifié',   cls: 'sous-badge-warn' },
    { value: 'rdv_effectue', label: 'RDV effectué',   cls: 'sous-badge-ok'   },
    { value: 'rdv_no_show',  label: 'No-show',         cls: 'sous-badge-nr'   },
    { value: 'rdv_reporte',  label: 'RDV reporté',    cls: 'sous-badge-warn' },
  ],
  client: [
    { value: 'actif',       label: 'Actif',               cls: 'sous-badge-ok'   },
    { value: 'en_pause',    label: 'En pause',            cls: 'sous-badge-warn' },
    { value: 'resiliation', label: 'Résiliation en cours',cls: 'sous-badge-nr'   },
  ],
  perdu: [
    { value: 'prix',          label: 'Prix trop élevé', cls: 'sous-badge-grey' },
    { value: 'concurrent',    label: 'Concurrent',      cls: 'sous-badge-grey' },
    { value: 'pas_interesse', label: 'Pas intéressé',   cls: 'sous-badge-grey' },
    { value: 'injoignable',   label: 'Injoignable',     cls: 'sous-badge-nr'   },
  ],
};

function getSousBadgeHtml(sous_statut, statut) {
  if (!sous_statut) return '';
  const opts = SOUS_STATUTS[statut] || [];
  const opt = opts.find(o => o.value === sous_statut);
  if (!opt) return '';
  return '<span class="sous-badge ' + opt.cls + '">' + opt.label + '</span>';
}

function updateSousStatutOptions(statut, currentVal) {
  const sel = document.getElementById('cf-sous-statut');
  if (!sel) return;
  const opts = SOUS_STATUTS[statut] || [];
  if (opts.length === 0) {
    sel.closest('.form-group').style.display = 'none';
    sel.value = '';
    return;
  }
  sel.closest('.form-group').style.display = '';
  sel.innerHTML = '<option value="">-- Aucun sous-statut --</option>' +
    opts.map(o => '<option value="' + o.value + '"' + (currentVal === o.value ? ' selected' : '') + '>' + o.label + '</option>').join('');
}

// ===== CONFIG =====
const SUPABASE_URL = 'https://tykjkpnlvuxwrurmacpx.supabase.co';
const ANON_KEY = ["eyJhbGciOiJIUzI1NiIs","InR5cCI6IkpXVCJ9.eyJ","pc3MiOiJzdXBhYmFzZSI","sInJlZiI6InR5a2prcG5","sdnV4d3J1cm1hY3B4Iiw","icm9sZSI6ImFub24iLCJ","pYXQiOjE3NzI0NDE2MDc","sImV4cCI6MjA4ODAxNzY","wN30.Nq1BU9DldMmDwid","LMlPusuXT9qsjOotNMen","wbpCFa0o"].join("");
const BREVO_KEY = ["xkeysib-9b2cbbf442c4","801799f3f2f128198317","265ff85d07e14498efae","7db6d1633ff8-zEp8GtJ","wGFJiFfAX"].join("");
const BREVO_FROM = 'contact@seolia.be';
const TAUX_COMMISSION = 0.35;
const TVA_RATE = 1.21;

// ===== HELPERS SUIVI =====
function daysAgo(dateStr) {
  if (!dateStr) return '—';
  const diff = Date.now() - new Date(dateStr).getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return 'Auj.';
  if (days === 1) return 'Hier';
  return days + 'j';
}

function renderLastActionCell(contact) {
  const diff = contact.updated_at ? Date.now() - new Date(contact.updated_at).getTime() : null;
  const days = diff !== null ? Math.floor(diff / 86400000) : null;
  let color = '#8892a4';
  let label = '—';
  if (days === null) { label = '—'; }
  else if (days === 0) { label = 'Auj.'; color = '#00d68f'; }
  else if (days === 1) { label = 'Hier'; color = '#00d68f'; }
  else if (days <= 6) { label = days + 'j'; color = '#4a9eff'; }
  else if (days <= 13) { label = days + 'j'; color = '#f5a623'; }
  else { label = days + 'j'; color = '#ef4444'; }
  return '<span style="font-size:12px;font-weight:700;color:' + color + '">' + label + '</span>';
}

function toggleNoteResultField(type) {
  const group = document.getElementById('note-result-group');
  if (group) group.style.display = type === 'appel' ? '' : 'none';
}

// ===== STATE =====
let currentUser = null;
let currentToken = null;
let currentProfile = null;
let allContacts = [];
let currentContactId = null;
let allProfiles = [];
let planningDays = 7;
let draggedContactId = null;

// ===== AUTH HELPERS =====
function getHeaders(extra = {}) {
  return {
    'apikey': ANON_KEY,
    'Authorization': 'Bearer ' + currentToken,
    'Content-Type': 'application/json',
    ...extra
  };
}

async function sbFetch(path, opts = {}) {
  const url = SUPABASE_URL + path;
  let res = await fetch(url, {
    ...opts,
    headers: { ...getHeaders(), ...(opts.headers || {}) }
  });
  // Auto-refresh si JWT expired (401)
  if (res.status === 401) {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      res = await fetch(url, {
        ...opts,
        headers: { ...getHeaders(), ...(opts.headers || {}) }
      });
    }
  }
  if (!res.ok) {
    let msg = 'Erreur ' + res.status;
    try { const j = await res.json(); msg = j.message || j.error || msg; } catch(e) {}
    throw new Error(msg);
  }
  if (res.status === 204) return null;
  const text = await res.text();
  if (!text || !text.trim()) return null;
  try { return JSON.parse(text); } catch(e) { return null; }
}

// ===== LOGIN =====
async function doLogin() {
  const email = document.getElementById('login-email').value.trim();
  const pwd = document.getElementById('login-password').value;
  const btn = document.getElementById('btn-login');
  const errEl = document.getElementById('login-error');
  errEl.style.display = 'none';
  btn.innerHTML = '<span class="spinner"></span>';
  btn.disabled = true;
  try {
    const res = await fetch(SUPABASE_URL + '/auth/v1/token?grant_type=password', {
      method: 'POST',
      headers: { 'apikey': ANON_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: pwd })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error_description || data.message || 'Identifiants invalides');
    currentToken = data.access_token;
    currentUser = data.user;
    localStorage.setItem('seolia_token', currentToken);
    localStorage.setItem('seolia_refresh_token', data.refresh_token || '');
    localStorage.setItem('seolia_user', JSON.stringify({ email: data.user.email }));
    await initApp();
  } catch(e) {
    errEl.textContent = e.message;
    errEl.style.display = 'block';
  } finally {
    btn.innerHTML = 'Se connecter';
    btn.disabled = false;
  }
}

document.getElementById('login-password').addEventListener('keydown', e => {
  if (e.key === 'Enter') doLogin();
});

async function refreshAccessToken() {
  const refreshToken = localStorage.getItem('seolia_refresh_token');
  if (!refreshToken) return false;
  try {
    const res = await fetch(SUPABASE_URL + '/auth/v1/token?grant_type=refresh_token', {
      method: 'POST',
      headers: { 'apikey': ANON_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken })
    });
    if (!res.ok) return false;
    const data = await res.json();
    currentToken = data.access_token;
    localStorage.setItem('seolia_token', currentToken);
    if (data.refresh_token) localStorage.setItem('seolia_refresh_token', data.refresh_token);
    return true;
  } catch(e) { return false; }
}

function doLogout() {
  localStorage.removeItem('seolia_token');
  localStorage.removeItem('seolia_refresh_token');
  localStorage.removeItem('seolia_user');
  currentToken = null; currentUser = null; currentProfile = null;
  allContacts = []; currentContactId = null;
  document.getElementById('app').style.display = 'none';
  document.getElementById('login-screen').style.display = 'flex';
}

// ===== INIT =====
async function initApp() {
  try {
    // Fetch profile
    const profiles = await sbFetch('/rest/v1/profiles?email=eq.' + encodeURIComponent(currentUser.email) + '&select=*');
    if (!profiles || profiles.length === 0) throw new Error('Profil introuvable. Contactez Florian.');
    currentProfile = profiles[0];
    if (!currentProfile.actif) throw new Error('Votre compte est désactivé.');

    // Set UI
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('app').style.display = 'block';
    document.getElementById('user-name-display').textContent = currentProfile.nom || currentUser.email;
    const badge = document.getElementById('user-role-badge');
    badge.textContent = currentProfile.role === 'admin' ? 'Admin' : 'Commercial';
    badge.className = 'role-badge ' + (currentProfile.role === 'admin' ? 'admin' : 'commercial');

    // Build nav
    buildNav();

    // Load initial data
    await loadContacts();
    showView('dashboard');
    // Démarrer le polling des nouveaux leads
    initNotifications();
    setTimeout(() => {
      moveNotifBellToHeader();
      renderSavedViews();
      renderEnhancedDashboard();
      const bnRevLabel = document.getElementById('bnav-rev-label');
      if (bnRevLabel && currentProfile) {
        bnRevLabel.textContent = currentProfile.role === 'admin' ? 'Revenus' : 'Commissions';
      }
    }, 200);
  } catch(e) {
    alert('Erreur de connexion: ' + e.message);
    doLogout();
  }
}

// ===== NAV =====
const NAV_ADMIN = [
  { id: 'dashboard', icon: '🏠', label: 'Dashboard' },
  { id: 'contacts', icon: '👥', label: 'Contacts' },
  { id: 'planning', icon: '📅', label: 'Planning' },
  { id: 'revenus', icon: '💰', label: 'Revenus' },
  { id: 'commerciaux', icon: '👤', label: 'Commerciaux' },
  { id: 'onboarding', icon: '📋', label: 'Onboarding' },
  { id: 'sophie', icon: '🤖', label: 'Sophie' },
];
const NAV_COMMERCIAL = [
  { id: 'dashboard', icon: '🏠', label: 'Dashboard' },
  { id: 'contacts', icon: '👥', label: 'Contacts' },
  { id: 'planning', icon: '📅', label: 'Planning' },
  { id: 'commissions', icon: '💳', label: 'Commissions' },
];

function buildNav() {
  const items = currentProfile.role === 'admin' ? NAV_ADMIN : NAV_COMMERCIAL;
  const sidebarNav = document.getElementById('sidebar-nav');
  const bnavItems = document.getElementById('bnav-items');
  sidebarNav.innerHTML = '';
  bnavItems.innerHTML = '';
  const mobileItems = items.slice(0, 5);
  items.forEach(item => {
    const div = document.createElement('div');
    div.className = 'nav-item';
    div.dataset.view = item.id;
    div.innerHTML = '<span class="ico">' + item.icon + '</span>' + item.label;
    div.onclick = () => showView(item.id);
    sidebarNav.appendChild(div);
  });
  mobileItems.forEach(item => {
    const div = document.createElement('div');
    div.className = 'bnav-item';
    div.dataset.view = item.id;
    div.innerHTML = '<span class="bnav-ico">' + item.icon + '</span><span>' + item.label + '</span>';
    div.onclick = () => showView(item.id);
    bnavItems.appendChild(div);
  });
}

let activeView = null;
function showView(viewId) {
  if (viewId === 'contact-detail') {
    // handled separately
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    const el = document.getElementById('view-contact-detail');
    if (el) el.classList.add('active');
    activeView = viewId;
    updateNavActive('contacts');
    return;
  }
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  const el = document.getElementById('view-' + viewId);
  if (!el) return;
  el.classList.add('active');
  activeView = viewId;
  updateNavActive(viewId);
  if (viewId === 'dashboard') loadDashboard();
  else if (viewId === 'contacts') { setTimeout(() => setContactsView(_contactsViewMode), 50); }
  else if (viewId === 'planning') loadPlanning();
  else if (viewId === 'commissions') loadCommissions();
  else if (viewId === 'revenus') loadRevenus();
  else if (viewId === 'commerciaux') loadCommerciaux();
  else if (viewId === 'onboarding') loadOnboarding();
  else if (viewId === 'sophie') loadSophieAppels();
}

function updateNavActive(viewId) {
  document.querySelectorAll('.nav-item, .bnav-item').forEach(el => {
    el.classList.toggle('active', el.dataset.view === viewId);
  });
}

// ===== CONTACTS LOAD =====
async function loadContacts() {
  try {
    let url = '/rest/v1/contacts?select=*&order=created_at.desc';
    allContacts = await sbFetch(url) || [];
    // Also load profiles for admin
    allProfiles = await sbFetch('/rest/v1/profiles?select=*&order=nom.asc') || [];
  } catch(e) {
    showToast('Erreur chargement contacts: ' + e.message, 'error');
    allContacts = [];
  }
}

// ===== DASHBOARD =====
async function loadDashboard() {
  const isAdmin = currentProfile.role === 'admin';
  const contacts = allContacts;
  const now = new Date();
  const moisKey = now.getFullYear() + '-' + String(now.getMonth()+1).padStart(2,'0');

  const clients = contacts.filter(c => c.statut === 'client');
  const prospects = contacts.filter(c => c.statut === 'prospect');
  const rdvs = contacts.filter(c => c.statut === 'rdv');
  const mrr = clients.reduce((s,c) => s + (parseFloat(c.prix_mensuel)||0), 0);

  // Commission this month
  let commissionMois = 0;
  try {
    let commUrl = '/rest/v1/commission_history?select=commission&mois=eq.' + moisKey;
    if (!isAdmin) commUrl += '&commercial_email=eq.' + encodeURIComponent(currentProfile.email);
    const comms = await sbFetch(commUrl) || [];
    commissionMois = comms.reduce((s,c) => s + (parseFloat(c.commission)||0), 0);
    // Add monthly commissions for active clients
    if (!isAdmin) {
      const myClients = clients;
      myClients.forEach(c => {
        const htva = (parseFloat(c.prix_mensuel)||0) / TVA_RATE;
        commissionMois += htva * TAUX_COMMISSION;
      });
    } else {
      clients.forEach(c => {
        const htva = (parseFloat(c.prix_mensuel)||0) / TVA_RATE;
        commissionMois += htva * TAUX_COMMISSION;
      });
    }
  } catch(e) {}

  let stats = [];
  if (isAdmin) {
    stats = [
      { label: 'MRR Total TVAC', value: fmtEur(mrr), cls: 'green', sub: fmtEur(mrr/TVA_RATE) + ' HTVA' },
      { label: 'Clients actifs', value: clients.length, cls: 'navy' },
      { label: 'Prospects', value: prospects.length, cls: 'blue' },
      { label: 'RDV planifiés', value: rdvs.length, cls: 'gold' },
      { label: 'Commissions ce mois', value: fmtEur(commissionMois), cls: 'red' },
    ];
  } else {
    stats = [
      { label: 'Mes clients', value: clients.length, cls: 'green' },
      { label: 'Mes prospects', value: prospects.length, cls: 'navy' },
      { label: 'Mes RDV', value: rdvs.length, cls: 'gold' },
      { label: 'Ma commission ce mois', value: fmtEur(commissionMois), cls: 'blue' },
    ];
  }

  // dash-stats section removed (element no longer exists in HTML)

  document.getElementById('dash-subtitle').textContent = isAdmin
    ? 'Bonjour Florian — Vue globale'
    : 'Bonjour ' + currentProfile.nom + ' — Votre activité';

  // Recent activity
  try {
    let notesUrl = '/rest/v1/notes?select=*,contacts(nom,entreprise)&order=created_at.desc&limit=10';
    const notes = await sbFetch(notesUrl) || [];
    const actEl = document.getElementById('dash-activity');
    if (notes.length === 0) {
      actEl.innerHTML = '<div class="empty-state"><div class="icon">📭</div><p>Aucune activité récente</p></div>';
    } else {
      actEl.innerHTML = notes.map(n => {
        const contact = n.contacts ? (n.contacts.nom || n.contacts.entreprise || '-') : '-';
        return '<div class="note-item">' +
          '<div class="note-icon">' + noteTypeIcon(n.type) + '</div>' +
          '<div class="note-content">' +
          '<div class="note-meta">' + formatDateTime(n.created_at) + ' — ' + esc(n.auteur||'') + ' → ' + esc(contact) + '</div>' +
          '<div class="note-text">' + esc(n.contenu||'') + '</div>' +
          '</div></div>';
      }).join('');
    }
  } catch(e) {
    document.getElementById('dash-activity').innerHTML = '<p class="text-muted">Erreur chargement activité</p>';
  }
  setTimeout(renderEnhancedDashboard, 100);
  renderCalendar();
}

// ===== PIPELINE =====
// ── CONTACTS VIEW TOGGLE (Liste / Kanban) ────────────────────
let _contactsViewMode = localStorage.getItem('contactsViewMode') || 'list';

function setContactsView(mode) {
  _contactsViewMode = mode;
  localStorage.setItem('contactsViewMode', mode);
  const listSection = document.getElementById('contacts-list-section');
  const kanbanSection = document.getElementById('contacts-kanban-section');
  const btnList = document.getElementById('toggle-list');
  const btnKanban = document.getElementById('toggle-kanban');
  if (!listSection || !kanbanSection) return;
  if (mode === 'list') {
    listSection.style.display = '';
    kanbanSection.style.display = 'none';
    if (btnList) { btnList.classList.add('active'); }
    if (btnKanban) { btnKanban.classList.remove('active'); }
    renderContacts();
  } else {
    listSection.style.display = 'none';
    kanbanSection.style.display = '';
    if (btnKanban) { btnKanban.classList.add('active'); }
    if (btnList) { btnList.classList.remove('active'); }
    renderKanban();
  }
}

function renderKanban() {
  const board = document.getElementById('kanban-board-inline');
  board.innerHTML = '';

  // Filters
  const filtersEl = document.getElementById('pipeline-filters-inline');
  // Filtre par commercial visible pour tous
  const assignees = [...new Set(allContacts.map(c => c.assignee).filter(Boolean))];
  filtersEl.innerHTML = 
    '<input type="text" id="pipeline-search" class="filter-select" placeholder="🔍 Rechercher nom, entreprise, ville..." ' +
    'oninput="renderKanban()" style="min-width:220px">' +
    '<select class="filter-select" id="pipeline-filter-assignee" onchange="renderKanban()">' +
    '<option value="">Tous les commerciaux</option>' +
    assignees.map(a => '<option>' + esc(a) + '</option>').join('') +
    '</select>';

  const filterAssignee = document.getElementById('pipeline-filter-assignee');
  if (filterAssignee) filterAssignee.style.display = '';
  const assigneeFilter = filterAssignee ? filterAssignee.value : '';
  const searchEl = document.getElementById('pipeline-search');
  const searchText = (searchEl ? searchEl.value : '').toLowerCase().trim();
  let contacts = allContacts;
  if (assigneeFilter) contacts = contacts.filter(c => c.assignee === assigneeFilter);
  if (searchText) contacts = contacts.filter(c =>
    (c.nom||'').toLowerCase().includes(searchText) ||
    (c.entreprise||'').toLowerCase().includes(searchText) ||
    (c.ville||'').toLowerCase().includes(searchText) ||
    (c.telephone||'').toLowerCase().includes(searchText)
  );

  const cols = [
    { id: 'prospect', label: 'Prospect', color: '#3b82f6' },
    { id: 'rdv', label: 'RDV', color: '#f97316' },
    { id: 'client', label: 'Client', color: '#16a34a' },
    { id: 'perdu', label: 'Perdu', color: '#dc2626' },
  ];

  cols.forEach(col => {
    const colContacts = contacts.filter(c => c.statut === col.id);
    const colEl = document.createElement('div');
    colEl.className = 'kanban-col';
    colEl.dataset.status = col.id;
    const colMrr = colContacts.reduce((s,c) => s + (parseFloat(c.prix_mensuel)||0), 0);
    const mrrLabel = col.id === 'client' && colMrr > 0 ? '<div class="kanban-col-mrr">MRR: ' + colMrr.toFixed(0) + '€</div>' : '';
    colEl.innerHTML = '<div class="kanban-col-header">' +
      '<div>' +
        '<div class="kanban-col-title"><span style="color:' + col.color + '">●</span> ' + col.label + '</div>' +
        mrrLabel +
      '</div>' +
      '<span class="kanban-count">' + colContacts.length + '</span>' +
      '</div>' +
      colContacts.map(c => makeKanbanCard(c)).join('');
    colEl.addEventListener('dragover', e => {
      e.preventDefault();
      colEl.classList.add('drag-over');
    });
    colEl.addEventListener('dragleave', () => colEl.classList.remove('drag-over'));
    colEl.addEventListener('drop', e => {
      e.preventDefault();
      colEl.classList.remove('drag-over');
      if (draggedContactId) {
        updateContactStatus(draggedContactId, col.id);
      }
    });
    board.appendChild(colEl);
  });
}

function makeKanbanCard(contact) {
  const statut = contact.statut || 'prospect';
  const avatarColors = { prospect: '#3b82f6', rdv: '#f97316', client: '#16a34a', perdu: '#94a3b8' };
  const initials = ((contact.nom||'').split(' ').map(w=>w[0]||'').join('').toUpperCase().slice(0,2)) || ((contact.entreprise||'').slice(0,2).toUpperCase()) || '?';
  const avatarColor = avatarColors[statut] || '#3b82f6';
  const mrr = parseFloat(contact.prix_mensuel) || 0;
  const mrrHtml = mrr > 0 && statut === 'client' ? '<span style="background:#f0fdf4;color:#16a34a;border-radius:20px;padding:2px 8px;font-size:11px;font-weight:700;">💰 ' + mrr.toFixed(0) + '€/m</span>' : '';

  return '<div class="kanban-card" draggable="true" ' +
    'ondragstart="draggedContactId=\'' + contact.id + '\';this.classList.add(\'dragging\')" ' +
    'ondragend="draggedContactId=null;this.classList.remove(\'dragging\')" ' +
    'onclick="openContactDetail(\'' + contact.id + '\')">' +
    '<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">' +
      '<div style="width:32px;height:32px;border-radius:50%;background:' + avatarColor + ';color:#fff;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;flex-shrink:0">' + initials + '</div>' +
      '<div style="min-width:0">' +
        '<div class="kcard-name" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + esc(contact.nom||contact.entreprise||'—') + '</div>' +
        (contact.entreprise && contact.nom ? '<div class="kcard-company" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + esc(contact.entreprise) + '</div>' : '') +
      '</div>' +
    '</div>' +
    '<div class="kcard-info">' +
    (contact.telephone ? '<span>📞 ' + esc(contact.telephone) + '</span>' : '') +
    (contact.ville ? '<span>📍 ' + esc(contact.ville) + '</span>' : '') +
    '</div>' +
    '<div style="display:flex;flex-wrap:wrap;align-items:center;gap:4px;margin-top:6px">' +
    (contact.formule ? '<span style="background:#f1f5f9;color:#475569;border-radius:20px;padding:2px 8px;font-size:11px;font-weight:600">' + esc(contact.formule) + '</span>' : '') +
    mrrHtml +
    (contact.sous_statut ? getSousBadgeHtml(contact.sous_statut, statut) : '') +
    '</div>' +
    (currentProfile?.role === 'admin'
      ? '<div class="kcard-assignee" onclick="event.stopPropagation()">' +
        '<select style="border:none;background:#f1f5f9;font-size:11px;font-weight:500;color:#64748b;padding:2px 4px;border-radius:20px;cursor:pointer;max-width:120px" ' +
        'onchange="quickUpdateAssignee(\'' + contact.id + '\',this.value);renderKanban()">' +
        '<option value="">👤 Non assigné</option>' +
        commercials.map(p => '<option value="' + esc(p.nom) + '"' + (contact.assignee === p.nom ? ' selected' : '') + '>👤 ' + esc(p.nom) + '</option>').join('') +
        '</select></div>'
      : (contact.assignee ? '<div class="kcard-assignee">👤 ' + esc(contact.assignee) + '</div>' : '')) +
    '</div>';
}

async function quickUpdateAssignee(contactId, newAssignee) {
  try {
    await sbFetch('/rest/v1/contacts?id=eq.' + contactId, {
      method: 'PATCH',
      headers: { 'Prefer': 'return=minimal' },
      body: JSON.stringify({ assignee: newAssignee || null, updated_at: new Date().toISOString() })
    });
    const contact = allContacts.find(c => c.id === contactId);
    if (contact) contact.assignee = newAssignee || null;
    showToast('Assignation mise à jour ✅', 'success');
    if (activeView === 'contacts') renderContacts();
  } catch(e) {
    showToast('Erreur mise à jour assignation', 'error');
  }
}

async function updateContactStatus(id, newStatus) {
  const contact = allContacts.find(c => c.id === id);
  if (!contact) return;
  const oldStatus = contact.statut;
  if (oldStatus === newStatus) return;
  try {
    await sbFetch('/rest/v1/contacts?id=eq.' + id, {
      method: 'PATCH',
      headers: { 'Prefer': 'return=minimal' },
      body: JSON.stringify({ statut: newStatus, updated_at: new Date().toISOString() })
    });
    contact.statut = newStatus;
    showToast('Statut mis à jour: ' + newStatus, 'success');
    if (newStatus === 'client' && oldStatus !== 'client') {
      await recordSetupCommission(contact);
    }
    renderKanban();
    if (activeView === 'contacts') renderContacts();
  } catch(e) {
    showToast('Erreur: ' + e.message, 'error');
  }
}

// ===== COMMISSION RECORDING =====
async function recordSetupCommission(contact) {
  try {
    if (!contact.created_by) return;
    // Find commercial profile
    let commProfile = null;
    if (allProfiles.length > 0) {
      commProfile = allProfiles.find(p => p.email === contact.created_by);
    } else {
      const profs = await sbFetch('/rest/v1/profiles?email=eq.' + encodeURIComponent(contact.created_by) + '&select=*') || [];
      commProfile = profs[0];
    }
    const now = new Date();
    const moisKey = now.getFullYear() + '-' + String(now.getMonth()+1).padStart(2,'0');
    const setup_tvac = parseFloat(contact.prix_setup) || 0;
    const setup_htva = setup_tvac / TVA_RATE;
    const commission = setup_htva * (commProfile ? (parseFloat(commProfile.taux_commission)||TAUX_COMMISSION) : TAUX_COMMISSION);
    await sbFetch('/rest/v1/commission_history', {
      method: 'POST',
      headers: { 'Prefer': 'return=minimal' },
      body: JSON.stringify({
        commercial_email: contact.created_by,
        commercial_nom: commProfile ? commProfile.nom : contact.created_by,
        mois: moisKey,
        contact_id: contact.id,
        contact_nom: contact.nom || contact.entreprise || '-',
        type: 'setup',
        montant_tvac: setup_tvac,
        montant_htva: setup_htva,
        commission: commission
      })
    });
    showToast('Commission setup enregistrée !', 'success');
  } catch(e) {
    showToast('Avertissement commission: ' + e.message, 'error');
  }
}


// ===== CONTACT STATS STRIP =====
function renderContactStats() {
  const strip = document.getElementById('contacts-stats-strip');
  if (!strip) return;
  const total = allContacts.length;
  const prospects = allContacts.filter(c => c.statut === 'prospect').length;
  const rdv = allContacts.filter(c => c.statut === 'rdv').length;
  const clients = allContacts.filter(c => c.statut === 'client' && c.actif !== false);
  const clientCount = clients.length;
  const perdus = allContacts.filter(c => c.statut === 'perdu').length;
  const mrr = clients.reduce((sum, c) => sum + (parseFloat(c.prix_mensuel) || 0), 0);
  const mrrStr = mrr > 0 ? mrr.toFixed(0) + '€/m' : '—';

  // Use helper to avoid quote conflicts in onclick
  function makeStatCard(cls, icon, val, lbl, sub, filterVal) {
    return '<div class="cstat-card ' + cls + '" onclick="setStatusFilter(\'' + filterVal + '\')">' +
      '<div class="cstat-icon">' + icon + '</div>' +
      '<div class="cstat-body">' +
        '<div class="cstat-val">' + val + '</div>' +
        '<div class="cstat-lbl">' + lbl + '</div>' +
        '<div class="cstat-sub">' + sub + '</div>' +
      '</div>' +
    '</div>';
  }
  strip.innerHTML =
    makeStatCard('cs-prospect', '🎯', prospects, 'Prospects', 'Pipeline actif', 'prospect') +
    makeStatCard('cs-rdv', '📅', rdv, 'RDV en cours', 'À conclure', 'rdv') +
    makeStatCard('cs-client', '💰', clientCount, 'Clients actifs', 'MRR: ' + mrrStr, 'client') +
    makeStatCard('cs-perdu', '❌', perdus, 'Perdus', 'Total: ' + total + ' contacts', 'perdu');
}

// ===== CONTACTS LIST =====
function populateAssigneeFilter() {
  const sel = document.getElementById('contacts-filter-assignee');
  if (!sel) return;
  const assignees = [...new Set(allContacts.map(c => c.assignee).filter(Boolean))].sort();
  const current = sel.value;
  sel.innerHTML = '<option value="">Tous les commerciaux</option>' +
    assignees.map(a => '<option value="' + esc(a) + '"' + (a === current ? ' selected' : '') + '>' + esc(a) + '</option>').join('');
}

function renderContacts() {
  const commercials = (allProfiles || []).filter(p => p.role === 'commercial');
  const commOpts = '<option value="">(non assigné)</option>' + commercials.map(p => '<option value="' + esc(p.nom) + '">' + esc(p.nom) + '</option>').join('');
  populateAssigneeFilter();
  const filteredContacts = getFilteredContacts();
  document.getElementById('contacts-count').textContent = filteredContacts.length + ' contact' + (filteredContacts.length !== 1 ? 's' : '');

  // Populate sector filter
  const sectors = [...new Set(allContacts.map(c => c.secteur).filter(Boolean))];
  const sectorSel = document.getElementById('contacts-filter-sector');
  const currentSectorVal = sectorSel.value;
  sectorSel.innerHTML = '<option value="">Tous les secteurs</option>' +
    sectors.map(s => '<option value="' + esc(s) + '"' + (s===currentSectorVal?' selected':'') + '>' + esc(s) + '</option>').join('');

  // Assignee filter (admin only)
  const assigneeFilter = document.getElementById('contacts-filter-assignee');
  if (currentProfile.role === 'admin') {
    assigneeFilter.style.display = '';
    const assignees = [...new Set(allContacts.map(c => c.assignee).filter(Boolean))];
    const curA = assigneeFilter.value;
    assigneeFilter.innerHTML = '<option value="">Tous les commerciaux</option>' +
      assignees.map(a => '<option value="' + esc(a) + '"' + (a===curA?' selected':'') + '>' + esc(a) + '</option>').join('');
  }

  // Formule filter
  const formules = [...new Set(allContacts.map(c => c.formule).filter(Boolean))].sort();
  const formuleSel = document.getElementById('contacts-filter-formule');
  if (formuleSel) {
    const curF = formuleSel.value;
    formuleSel.innerHTML = '<option value="">Toutes les formules</option>' +
      formules.map(f => '<option value="' + esc(f) + '"' + (f===curF?' selected':'') + '>' + esc(f) + '</option>').join('');
  }

  // Ville filter
  const villes = [...new Set(allContacts.map(c => c.ville).filter(Boolean))].sort();
  const villeSel = document.getElementById('contacts-filter-ville');
  if (villeSel) {
    const curV = villeSel.value;
    villeSel.innerHTML = '<option value="">Toutes les villes</option>' +
      villes.map(v => '<option value="' + esc(v) + '"' + (v===curV?' selected':'') + '>' + esc(v) + '</option>').join('');
  }

  renderContactStats();

  // Table
  const tbody = document.getElementById('contacts-tbody');
  const avatarColors = { prospect: 'ca-prospect', rdv: 'ca-rdv', client: 'ca-client', perdu: 'ca-perdu' };
  tbody.innerHTML = filteredContacts.map(c => {
    const initials = ((c.nom||'').split(' ').map(w=>w[0]||'').join('').toUpperCase().slice(0,2)) || ((c.entreprise||'').slice(0,2).toUpperCase()) || '?';
    const statut = c.statut || 'prospect';
    const avatarClass = avatarColors[statut] || 'ca-prospect';
    const phoneHtml = c.telephone
      ? '<a class="phone-link" href="tel:' + esc(c.telephone) + '" onclick="copyPhone(\'' + esc(c.telephone).replace(/'/g, "\\'") + '\', event)">' + esc(c.telephone) + '</a>'
      : '<span style="color:#94a3b8">—</span>';
    const assigneeHtml = currentProfile.role === 'admin'
      ? '<td onclick="event.stopPropagation()"><select style="border:1px solid #ddd;border-radius:6px;padding:3px 6px;font-size:12px;cursor:pointer;max-width:130px" onchange="quickUpdateAssignee(\'' + c.id + '\',this.value)">' + commOpts.replace('value="' + esc(c.assignee||'') + '"', 'value="' + esc(c.assignee||'') + '" selected') + '</select></td>'
      : '<td style="font-size:13px;color:var(--text-light)">' + esc(c.assignee||'—') + '</td>';
    return '<tr onclick="openContactDetail(\'' + c.id + '\')">' +
      '<td onclick="event.stopPropagation()" style="text-align:center"><input type="checkbox" class="contact-select-cb" value="' + c.id + '" onchange="updateBulkDeleteBtn()" style="cursor:pointer;accent-color:var(--green)"></td>' +
      '<td>' +
        '<div class="contact-cell">' +
          '<div class="contact-avatar-sm ' + avatarClass + '">' + initials + '</div>' +
          '<div class="contact-cell-info">' +
            '<div class="contact-cell-name">' + esc(c.nom || c.entreprise || '—') + '</div>' +
            (c.entreprise && c.nom ? '<div class="contact-cell-company">' + esc(c.entreprise) + '</div>' : '') +
          '</div>' +
        '</div>' +
      '</td>' +
      '<td>' + phoneHtml + '</td>' +
      '<td><span class="badge badge-' + statut + '">' + statut + '</span>' + getSousBadgeHtml(c.sous_statut, statut) + '</td>' +
      '<td>' + (c.formule ? '<span class="formule-pill">' + esc(c.formule) + '</span>' : '<span style="color:#94a3b8">—</span>') + '</td>' +
      '<td style="text-align:center">' + renderLastActionCell(c) + '</td>' +
      assigneeHtml +
      '<td onclick="event.stopPropagation()">' +
        '<div class="row-actions">' +
          (c.telephone ? '<button class="ract-btn" title="Appeler" onclick="location.href=\'tel:' + esc(c.telephone) + '\'"  >📞</button>' : '') +
          (c.email ? '<button class="ract-btn" title="Email" onclick="location.href=\'mailto:' + esc(c.email) + '\'"  >✉️</button>' : '') +
          '<button class="ract-btn" title="Voir fiche" onclick="openContactDetail(\'' + c.id + '\')">👁️</button>' +
          (currentProfile.role === 'admin' || c.assignee === currentProfile.nom ? '<button class="ract-btn" title="Modifier" onclick="openEditContactModalById(\'' + c.id + '\')">✏️</button>' : '') +
        '</div>' +
      '</td>' +
    '</tr>';
  }).join('');

  // Cards (mobile)
  const cardsEl = document.getElementById('contacts-cards');
  cardsEl.innerHTML = filteredContacts.map(c => {
    const initials = ((c.nom||'').split(' ').map(w=>w[0]||'').join('').toUpperCase().slice(0,2)) || ((c.entreprise||'').slice(0,2).toUpperCase()) || '?';
    const statut = c.statut || 'prospect';
    const avatarClass = avatarColors[statut] || 'ca-prospect';
    return '<div class="contact-card" onclick="openContactDetail(\'' + c.id + '\')">' +
      '<div class="contact-card-header">' +
        '<div style="display:flex;align-items:center;gap:10px">' +
          '<div class="contact-avatar-sm ' + avatarClass + '">' + initials + '</div>' +
          '<div>' +
            '<div class="contact-card-name">' + esc(c.nom||'—') + '</div>' +
            '<div class="contact-card-company">' + esc(c.entreprise||'') + '</div>' +
          '</div>' +
        '</div>' +
        '<div style="text-align:right">' +
          '<span class="badge badge-' + statut + '">' + statut + '</span>' +
          (c.sous_statut ? '<br>' + getSousBadgeHtml(c.sous_statut, statut) : '') +
        '</div>' +
      '</div>' +
      '<div class="contact-card-meta">' +
        (c.telephone ? '<span>📞 ' + esc(c.telephone) + '</span>' : '') +
        (c.ville ? '<span>📍 ' + esc(c.ville) + '</span>' : '') +
        (c.formule ? '<span>📦 ' + esc(c.formule) + '</span>' : '') +
      '</div>' +
    '</div>';
  }).join('');
}

function getFilteredContacts() {
  const search = (document.getElementById('contacts-search')?.value||'').toLowerCase();
  const statusF = document.getElementById('contacts-filter-status')?.value||'';
  const sectorF = document.getElementById('contacts-filter-sector')?.value||'';
  const assigneeF = document.getElementById('contacts-filter-assignee')?.value||'';
  const formuleF = document.getElementById('contacts-filter-formule')?.value||'';
  const villeF = document.getElementById('contacts-filter-ville')?.value||'';
  return allContacts.filter(c => {
    if (statusF && c.statut !== statusF) return false;
    if (sectorF && c.secteur !== sectorF) return false;
    if (assigneeF && c.assignee !== assigneeF) return false;
    if (formuleF && c.formule !== formuleF) return false;
    if (villeF && c.ville !== villeF) return false;
    if (search) {
      const hay = [c.nom, c.entreprise, c.email, c.telephone, c.ville, c.secteur].join(' ').toLowerCase();
      if (!hay.includes(search)) return false;
    }
    return true;
  });
}

function filterContacts() { renderContacts(); }

function setStatusFilter(val) {
  const sel = document.getElementById('contacts-filter-status');
  if (sel) { sel.value = val; filterContacts(); }
}

// ===== CONTACT DETAIL =====
async function openContactDetail(id) {
  currentContactId = id;
  const contact = allContacts.find(c => c.id === id);
  if (!contact) return;

  // === HEADER: nom ===
  const nameEl = document.getElementById('detail-name');
  if (nameEl) nameEl.textContent = (contact.nom||'') + (contact.entreprise ? ' — ' + contact.entreprise : '');

  // === AVATAR (initiales) ===
  const avatarEl = document.getElementById('detail-avatar');
  if (avatarEl) {
    const src = (contact.nom || contact.entreprise || '?').trim();
    const initials = src.split(' ').map(w => w[0]||'').join('').substring(0,2).toUpperCase() || '?';
    avatarEl.textContent = initials;
  }

  // === STATUT BADGE + SOUS-STATUT ===
  const statBadge = document.getElementById('detail-statut-badge');
  if (statBadge) statBadge.innerHTML = '<span class="badge badge-' + (contact.statut||'prospect') + '">' + (contact.statut||'-') + '</span>';
  const ssBadge = document.getElementById('detail-sous-statut-badge');
  if (ssBadge) ssBadge.innerHTML = getSousBadgeHtml(contact.sous_statut, contact.statut||'prospect');

  // === STATUS SELECT ===
  const statusSel = document.getElementById('detail-status-select');
  statusSel.value = contact.statut || 'prospect';
  statusSel.disabled = !(currentProfile.role === 'admin' || contact.assignee === currentProfile.nom);

  // === BOUTON APPEL ===
  const btnCall = document.getElementById('btn-call');
  if (contact.telephone) {
    const tel = contact.telephone.replace(/[^0-9+]/g,'');
    btnCall.href = 'tel:' + tel;
    btnCall.style.display = '';
  } else { btnCall.style.display = 'none'; }

  // === WhatsApp ===
  const btnWa = document.getElementById('btn-whatsapp');
  if (btnWa) btnWa.style.display = contact.telephone ? '' : 'none';

  // === PERMISSIONS ===
  const canEdit = currentProfile.role === 'admin' || contact.assignee === currentProfile.nom;
  const btnDel = document.querySelector('#view-contact-detail .btn.btn-red.btn-sm');
  const btnsSC = document.getElementById('btns-save-cancel');
  if (btnDel) btnDel.style.display = canEdit ? '' : 'none';
  if (btnsSC) btnsSC.style.display = 'none';

  // === FORMULAIRE INFOS ===
  renderDetailInfoFormAuto(contact);

  // === PRICING (onglet Tarif) ===
  const setup_tvac = parseFloat(contact.prix_setup)||0;
  const monthly_tvac = parseFloat(contact.prix_mensuel)||0;
  const pricingEl = document.getElementById('detail-pricing');
  if (pricingEl) {
    pricingEl.innerHTML =
      '<div class="cd-pricing-grid">' +
      '<div class="cd-pricing-item"><label>Setup TVAC</label><span>' + fmtEur(setup_tvac) + '</span></div>' +
      '<div class="cd-pricing-item"><label>Setup HTVA</label><span>' + fmtEur(setup_tvac/TVA_RATE) + '</span></div>' +
      '<div class="cd-pricing-item accent"><label>Mensuel TVAC</label><span>' + fmtEur(monthly_tvac) + '</span></div>' +
      '<div class="cd-pricing-item"><label>Mensuel HTVA</label><span>' + fmtEur(monthly_tvac/TVA_RATE) + '</span></div>' +
      (currentProfile.role === 'commercial' ? '' :
        '<div class="cd-pricing-item"><label>Commission setup</label><span>' + fmtEur((setup_tvac/TVA_RATE)*TAUX_COMMISSION) + '</span></div>' +
        '<div class="cd-pricing-item"><label>Commission mensuelle</label><span>' + fmtEur((monthly_tvac/TVA_RATE)*TAUX_COMMISSION) + '</span></div>'
      ) +
      '</div>';
  }

  // === CLIENT ID BADGE ===
  const idBadge = document.getElementById('detail-client-id-badge');
  const idSpan = document.getElementById('detail-client-id');
  if (contact.client_id) {
    idBadge.style.display = 'inline-flex';
    idSpan.textContent = contact.client_id;
  } else {
    idBadge.style.display = 'none';
  }

  // === TOGGLE ACTIF/INACTIF ===
  const toggleEl = document.getElementById('detail-actif-toggle');
  if (toggleEl) {
    if (contact.statut === 'client' && currentProfile && currentProfile.role === 'admin') {
      const isActif = contact.actif !== false;
      toggleEl.innerHTML = '<button onclick="toggleClientActif(\'' + contact.id + '\',' + isActif + ')" style="padding:4px 12px;border-radius:20px;border:none;cursor:pointer;font-size:12px;font-weight:600;background:' + (isActif ? '#e8f5e9;color:#2e7d32' : '#ffebee;color:#c62828') + '">' + (isActif ? '✅ Actif' : '❌ Inactif') + '</button>';
    } else {
      toggleEl.innerHTML = '';
    }
  }

  // === STAGNANT BADGE ===
  const stagnantBadge = document.getElementById('detail-stagnant-badge');
  if (stagnantBadge) {
    const isStagnant = contact.last_activity_at && daysAgo(contact.last_activity_at) >= 14 && contact.statut !== 'client';
    stagnantBadge.style.display = isStagnant ? '' : 'none';
  }

  // === RESET ONGLETS → Profil ===
  document.querySelectorAll('.cd-panel').forEach(p => p.classList.add('cd-hidden'));
  const infoPanel = document.getElementById('cdp-info');
  if (infoPanel) infoPanel.classList.remove('cd-hidden');
  document.querySelectorAll('.cd-tab').forEach(b => b.classList.remove('active'));
  const firstTab = document.querySelector('.cd-tab');
  if (firstTab) firstTab.classList.add('active');

  showView('contact-detail');
  loadDetailActivites(id);
  loadDetailNotes(id);
  loadCommentaires(id);
  loadDetailFollowups(id);
  loadDetailDocs(id);
  loadDetailModifications(id, contact);
  loadDetailQuestionnaire(contact);
  loadDetailPaiement(contact);
  chargerSignatures(id);
}

function copyClientId() {
  const id = document.getElementById('detail-client-id').textContent;
  if (id && id !== '-') {
    navigator.clipboard.writeText(id).then(() => showToast('ID ' + id + ' copié !', 'success'));
  }
}

// ── Changement d'onglet fiche contact ──
function switchDetailTab(name, btn) {
  document.querySelectorAll('.cd-panel').forEach(p => p.classList.add('cd-hidden'));
  const panel = document.getElementById('cdp-' + name);
  if (panel) panel.classList.remove('cd-hidden');
  document.querySelectorAll('.cd-tab').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
}

async function loadDetailModifications(contactId, contact) {
  const el = document.getElementById('detail-modifications');
  const badge = document.getElementById('modif-count-badge');
  if (!el) return;
  el.innerHTML = '<div class="loading-center"><span class="spinner spinner-dark"></span></div>';
  try {
    const mods = await sbFetch('/rest/v1/modifications?contact_id=eq.' + contactId + '&order=created_at.desc') || [];
    if (mods.length === 0) {
      el.innerHTML = '<p style="color:#8892a4;font-size:13px;padding:8px 0">Aucune modification demandée.</p>';
      badge.style.display = 'none';
      return;
    }
    const pending = mods.filter(m => m.statut === 'en_attente').length;
    if (pending > 0) {
      badge.style.display = '';
      badge.textContent = pending + ' en attente';
    } else { badge.style.display = 'none'; }

    el.innerHTML = mods.map(m => {
      const statutColors = { en_attente: '#f5a623', en_cours: '#4a9eff', termine: '#00d68f' };
      const statutLabels = { en_attente: '🟡 En attente', en_cours: '🔵 En cours', termine: '✅ Terminé' };
      const color = statutColors[m.statut] || '#8892a4';
      const dateStr = new Date(m.created_at).toLocaleDateString('fr-BE', { day:'2-digit', month:'short', year:'numeric' });
      return `<div style="border:1px solid rgba(255,255,255,0.07);border-radius:10px;padding:14px;margin-bottom:10px;background:rgba(255,255,255,0.02)">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;flex-wrap:wrap;margin-bottom:8px">
          <span style="font-size:12px;color:#8892a4">${dateStr}</span>
          <select onchange="updateModifStatus('${m.id}', this.value)" style="background:#1a2035;color:${color};border:1px solid ${color}33;border-radius:6px;padding:3px 8px;font-size:12px;cursor:pointer">
            <option value="en_attente" ${m.statut==='en_attente'?'selected':''}>🟡 En attente</option>
            <option value="en_cours" ${m.statut==='en_cours'?'selected':''}>🔵 En cours</option>
            <option value="termine" ${m.statut==='termine'?'selected':''}>✅ Terminé</option>
          </select>
        </div>
        <p style="font-size:14px;color:#e2e8f0;margin-bottom:${m.note_interne?'8px':'0'}">${esc(m.description)}</p>
        ${m.note_interne ? `<div style="background:rgba(0,214,143,0.07);border-left:3px solid #00d68f;padding:8px 10px;border-radius:0 6px 6px 0;font-size:12px;color:#a0aec0">📝 ${esc(m.note_interne)}</div>` : ''}
        <div style="margin-top:10px;display:flex;gap:8px;align-items:center">
          <input id="note-modif-${m.id}" type="text" placeholder="Ajouter une note interne..." style="flex:1;background:#141929;border:1px solid rgba(255,255,255,0.1);border-radius:6px;padding:6px 10px;color:#fff;font-size:12px">
          <button onclick="addModifNote('${m.id}')" class="btn btn-ghost btn-sm" style="white-space:nowrap">+ Note</button>
        </div>
      </div>`;
    }).join('');
  } catch(e) {
    el.innerHTML = '<p style="color:#f87171;font-size:13px">Erreur chargement modifications</p>';
  }
}

async function updateModifStatus(modId, newStatut) {
  try {
    await sbFetch('/rest/v1/modifications?id=eq.' + modId, {
      method: 'PATCH',
      headers: { 'Prefer': 'return=minimal' },
      body: JSON.stringify({ statut: newStatut, updated_at: new Date().toISOString() })
    });
    showToast('Statut mis à jour', 'success');
    loadDetailModifications(currentContactId);
  } catch(e) { showToast('Erreur: ' + e.message, 'error'); }
}

async function addModifNote(modId) {
  const input = document.getElementById('note-modif-' + modId);
  const note = input?.value.trim();
  if (!note) return;
  try {
    await sbFetch('/rest/v1/modifications?id=eq.' + modId, {
      method: 'PATCH',
      headers: { 'Prefer': 'return=minimal' },
      body: JSON.stringify({ note_interne: note, updated_at: new Date().toISOString() })
    });
    showToast('Note ajoutée', 'success');
    loadDetailModifications(currentContactId);
  } catch(e) { showToast('Erreur: ' + e.message, 'error'); }
}

function loadDetailQuestionnaire(contact) {
  const el = document.getElementById('detail-questionnaire');
  const btn = document.getElementById('btn-copy-brief');
  if (!el) return;

  const notes = contact.notes_generales || '';
  const marker = '[QUESTIONNAIRE_ONBOARDING]';
  if (!notes.includes(marker)) {
    el.innerHTML = '<p style="color:#8892a4;font-size:13px;padding:8px 0">Questionnaire pas encore reçu.</p>';
    if (btn) btn.style.display = 'none';
    return;
  }

  if (btn) btn.style.display = '';

  let data = {};
  try {
    const jsonStr = notes.split(marker)[1].trim();
    data = JSON.parse(jsonStr);
  } catch(e) {
    el.innerHTML = '<p style="color:#8892a4;font-size:13px">Questionnaire reçu (format illisible).</p>';
    return;
  }

  const dateStr = data.submitted_at ? new Date(data.submitted_at).toLocaleDateString('fr-BE', { day:'2-digit', month:'long', year:'numeric' }) : '';
  const rows = Object.entries(data)
    .filter(([k]) => !['client_id','submitted_at','tier','formule'].includes(k))
    .map(([k, v]) => {
      if (typeof v === 'object') v = JSON.stringify(v);
      const label = k.replace(/_/g,' ').replace(/\b\w/g, c => c.toUpperCase());
      return `<div class="detail-field"><label>${label}</label><span style="white-space:pre-wrap">${esc(String(v||'-'))}</span></div>`;
    }).join('');

  el.innerHTML = `
    <div style="margin-bottom:10px;font-size:12px;color:#8892a4">Reçu le ${dateStr} — Formule : <strong style="color:#00d68f">${data.formule||data.tier||'-'}</strong></div>
    <div class="detail-info-grid">${rows}</div>`;
}

function formatFileSize(bytes) {
  if (!bytes) return '';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return (bytes/1024).toFixed(1) + ' KB';
  return (bytes/1048576).toFixed(1) + ' MB';
}

async function loadDetailDocs(contactId) {
  const el = document.getElementById('detail-docs');
  if (!el) return;
  el.innerHTML = '<div class="loading-center"><span class="spinner spinner-dark"></span></div>';
  try {
    const docs = await sbFetch('/rest/v1/documents?contact_id=eq.' + contactId + '&order=created_at.desc&select=*') || [];
    if (docs.length === 0) {
      el.innerHTML = '<div class="empty-state" style="padding:16px"><div style="font-size:32px;margin-bottom:8px">📭</div><p style="color:var(--text-secondary)">Aucun document</p></div>';
    } else {
      el.innerHTML = docs.map(d => {
        const publicUrl = d.file_path.startsWith('https://') ? d.file_path : SUPABASE_URL + '/storage/v1/object/public/documents/' + d.file_path;
        const isSignedContractFallback = publicUrl.includes('sign.html');
        const isSignedPDF = !isSignedContractFallback && (d.uploaded_by === 'Signature électronique');
        const ext = (isSignedPDF || isSignedContractFallback) ? 'SIGNÉ' : (d.nom||'').split('.').pop().toUpperCase();
        const extColors = { PDF:'#ef4444', DOC:'#3b82f6', DOCX:'#3b82f6', JPG:'#f97316', JPEG:'#f97316', PNG:'#f97316', XLS:'#16a34a', XLSX:'#16a34a', 'SIGNÉ':'#00d68f' };
        const color = extColors[ext] || '#64748b';
        const docId = d.id;
        const docPath = d.file_path;
        const actionBtn = isSignedContractFallback
          ? `<span class="btn btn-ghost btn-sm" title="PDF non disponible - re-envoyez le contrat pour générer un PDF" style="color:#94a3b8;cursor:default" onclick="alert('Ce contrat a été signé avec l\\'ancienne version du système.\\nPDF non disponible.\\n\\nPour obtenir un PDF signé, re-envoyez un nouveau contrat au client.')">⚠️ Ancien</span>`
          : `<a href="${publicUrl}" download="${esc(d.nom)}" class="btn btn-ghost btn-sm" title="Télécharger le PDF signé">&#x2B07; PDF</a>`;
        return `<div class="note-item" style="display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid var(--border)">
          <div style="background:${color};color:#fff;padding:4px 8px;border-radius:4px;font-size:11px;font-weight:700;min-width:36px;text-align:center">${esc(ext)}</div>
          <div style="flex:1;min-width:0">
            ${isSignedContractFallback
              ? `<span style="font-weight:500;color:var(--text-secondary);display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(d.nom)}</span>`
              : `<a href="${publicUrl}" target="_blank" style="font-weight:500;color:var(--primary);text-decoration:none;display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(d.nom)}</a>`
            }
            <span style="color:var(--text-secondary);font-size:12px">${formatDate(d.created_at)} &mdash; ${esc(d.uploaded_by||'')}${d.taille ? ' &mdash; ' + formatFileSize(d.taille) : ''}</span>
          </div>
          ${actionBtn}
          <button class="btn btn-ghost btn-sm" style="color:#ef4444" data-doc-id="${docId}" data-doc-path="${docPath}" onclick="deleteDocument(this.dataset.docId, this.dataset.docPath)" title="Supprimer">🗑</button>
        </div>`;
      }).join('') + '<div style="height:8px"></div>';
    }
  } catch(e) {
    el.innerHTML = '<div class="empty-state" style="padding:16px"><p style="color:var(--text-secondary)">Erreur chargement documents</p></div>';
  }
}

async function uploadDocument(e) {
  const files = Array.from(e.target.files);
  if (!files.length || !currentContactId) return;
  const btn = document.querySelector('label[style*="cursor:pointer"]');
  if (btn) btn.textContent = 'Upload...';

  for (const file of files) {
    try {
      const safeName = file.name.replace(/[^a-zA-Z0-9._\-]/g, '_');
      const filePath = currentContactId + '/' + Date.now() + '_' + safeName;

      // Upload to Supabase Storage
      const upRes = await fetch(SUPABASE_URL + '/storage/v1/object/documents/' + filePath, {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + currentToken,
          'apikey': ANON_KEY,
          'Content-Type': file.type || 'application/octet-stream',
          'x-upsert': 'true'
        },
        body: file
      });
      if (!upRes.ok) {
        const err = await upRes.text();
        alert('Erreur upload "' + file.name + '": ' + err);
        continue;
      }

      // Save metadata
      await sbFetch('/rest/v1/documents', {
        method: 'POST',
        headers: { 'Prefer': 'return=minimal' },
        body: JSON.stringify({
          contact_id: currentContactId,
          nom: file.name,
          file_path: filePath,
          type_fichier: file.type,
          taille: file.size,
          uploaded_by: currentUser.email
        })
      });
    } catch(err) {
      alert('Erreur: ' + err.message);
    }
  }
  e.target.value = '';
  if (btn) btn.innerHTML = '+ Uploader <input type="file" id="doc-upload-input" style="display:none" onchange="uploadDocument(event)" multiple>';
  loadDetailDocs(currentContactId);
}

async function deleteDocument(docId, filePath) {
  if (!confirm('Supprimer ce document ?')) return;
  try {
    // Delete from storage
    await fetch(SUPABASE_URL + '/storage/v1/object/documents/' + filePath, {
      method: 'DELETE',
      headers: { 'Authorization': 'Bearer ' + currentToken, 'apikey': ANON_KEY }
    });
    // Delete metadata
    await sbFetch('/rest/v1/documents?id=eq.' + docId, { method: 'DELETE' });
    loadDetailDocs(currentContactId);
  } catch(e) {
    alert('Erreur suppression: ' + e.message);
  }
}

// ════════════════════════════════════════════════════════════════
//  ACTIVITÉS (Pipedrive-style tasks)
// ════════════════════════════════════════════════════════════════
function activiteTypeIcon(type) {
  const icons = { appel: '📞', reunion: '🤝', email: '✉️', tache: '✅' };
  return icons[type] || '✅';
}
function activiteTypeLabel(type) {
  const labels = { appel: 'Appel', reunion: 'Réunion', email: 'Email', tache: 'Tâche' };
  return labels[type] || type;
}

async function loadDetailActivites(contactId) {
  const el = document.getElementById('detail-activites');
  if (!el) return;
  el.innerHTML = '<div class="loading-center"><span class="spinner spinner-dark"></span></div>';
  try {
    const acts = await sbFetch('/rest/v1/activites?contact_id=eq.' + contactId + '&order=echeance.asc,created_at.asc&select=*') || [];
    if (acts.length === 0) {
      el.innerHTML = '<div class="empty-state"><div class="icon">⚡</div><p>Aucune activité</p></div>';
      return;
    }
    const today = new Date(); today.setHours(0,0,0,0);
    el.innerHTML = acts.map(a => {
      const isOverdue = a.echeance && !a.fait && new Date(a.echeance) < today;
      const echeanceStr = a.echeance ? new Date(a.echeance).toLocaleDateString('fr-BE', {day:'2-digit',month:'short',year:'numeric'}) : '';
      return '<div style="display:flex;align-items:flex-start;gap:10px;padding:10px 0;border-bottom:1px solid #f0f1f5">' +
        '<div style="font-size:20px;padding-top:2px">' + activiteTypeIcon(a.type) + '</div>' +
        '<div style="flex:1">' +
        '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">' +
        '<span style="font-weight:600;font-size:13px;color:' + (a.fait ? '#8892a4' : '#0a1628') + ';text-decoration:' + (a.fait ? 'line-through' : 'none') + '">' + esc(a.titre) + '</span>' +
        '<span style="font-size:11px;color:#8892a4;background:#f5f6fa;padding:2px 8px;border-radius:20px">' + activiteTypeLabel(a.type) + '</span>' +
        (echeanceStr ? '<span style="font-size:11px;font-weight:600;padding:2px 8px;border-radius:20px;background:' + (isOverdue ? '#fee2e2' : '#f0fdf4') + ';color:' + (isOverdue ? '#dc2626' : '#16a34a') + '">' + (isOverdue ? '⚠️ ' : '📅 ') + echeanceStr + '</span>' : '') +
        '</div>' +
        '<div style="display:flex;gap:6px;margin-top:6px">' +
        (!a.fait ? '<button class="btn btn-ghost btn-sm" style="font-size:11px" onclick="markActiviteFait(\'' + a.id + '\')">✅ Marquer fait</button>' : '<span style="font-size:11px;color:#00d68f">✅ Terminé</span>') +
        '<button class="btn btn-sm" style="background:#fee2e2;color:#dc2626;border:none;font-size:11px" onclick="deleteActivite(\'' + a.id + '\')" >🗑️</button>' +
        '</div>' +
        '</div></div>';
    }).join('');
  } catch(e) {
    el.innerHTML = '<p class="text-muted">Erreur: ' + e.message + '</p>';
  }
}

function openAddActiviteModal() {
  document.getElementById('activite-titre').value = '';
  document.getElementById('activite-echeance').value = '';
  document.getElementById('activite-type').value = 'appel';
  openModal('modal-activite');
}

async function saveActivite() {
  const titre = document.getElementById('activite-titre').value.trim();
  if (!titre) { showToast("Décris l'activité", 'error'); return; }
  const type = document.getElementById('activite-type').value;
  const echeance = document.getElementById('activite-echeance').value || null;
  try {
    await sbFetch('/rest/v1/activites', {
      method: 'POST',
      headers: { 'Prefer': 'return=minimal' },
      body: JSON.stringify({
        contact_id: currentContactId,
        type, titre, echeance,
        created_by: currentProfile?.nom || 'admin'
      })
    });
    closeModal('modal-activite');
    showToast('Activité ajoutée', 'success');
    loadDetailActivites(currentContactId);
  } catch(e) { showToast('Erreur: ' + e.message, 'error'); }
}

async function markActiviteFait(id) {
  try {
    await sbFetch('/rest/v1/activites?id=eq.' + id, {
      method: 'PATCH', headers: { 'Prefer': 'return=minimal' },
      body: JSON.stringify({ fait: true })
    });
    showToast('Activité terminée ✅', 'success');
    loadDetailActivites(currentContactId);
  } catch(e) { showToast('Erreur: ' + e.message, 'error'); }
}

async function deleteActivite(id) {
  if (!confirm('Supprimer cette activité ?')) return;
  try {
    await sbFetch('/rest/v1/activites?id=eq.' + id, {
      method: 'DELETE', headers: { 'Prefer': 'return=minimal' }
    });
    showToast('Activité supprimée', 'success');
    loadDetailActivites(currentContactId);
  } catch(e) { showToast('Erreur: ' + e.message, 'error'); }
}

async function loadDetailNotes(contactId) {
  const el = document.getElementById('detail-notes');
  el.innerHTML = '<div class="loading-center"><span class="spinner spinner-dark"></span></div>';
  try {
    const notes = await sbFetch('/rest/v1/notes?contact_id=eq.' + contactId + '&order=created_at.desc&select=*') || [];
    if (notes.length === 0) {
      el.innerHTML = '<div class="empty-state"><div class="icon">📭</div><p>Aucune note</p></div>';
    } else {
      el.innerHTML = notes.map(n =>
        '<div class="note-item">' +
        '<div class="note-icon">' + noteTypeIcon(n.type) + '</div>' +
        '<div class="note-content">' +
        '<div class="note-meta">' + noteTypeLabel(n.type) + ' — ' + formatDateTime(n.created_at) + (n.auteur ? ' par ' + esc(n.auteur) : '') + '</div>' +
        '<div class="note-text">' + esc(n.contenu||'') + '</div>' +
        '</div></div>'
      ).join('');
    }
  } catch(e) {
    el.innerHTML = '<p class="text-muted">Erreur: ' + e.message + '</p>';
  }
}

async function loadDetailFollowups(contactId) {
  const el = document.getElementById('detail-followups');
  el.innerHTML = '<div class="loading-center"><span class="spinner spinner-dark"></span></div>';
  try {
    const fups = await sbFetch('/rest/v1/followups?contact_id=eq.' + contactId + '&order=date_prevue.asc&select=*') || [];
    if (fups.length === 0) {
      el.innerHTML = '<div class="empty-state"><div class="icon">📅</div><p>Aucun rappel</p></div>';
    } else {
      el.innerHTML = fups.map(f =>
        '<div class="planning-item">' +
        '<div class="planning-date">' +
        '<div class="day">' + new Date(f.date_prevue).getDate() + '</div>' +
        '<div class="month">' + new Date(f.date_prevue).toLocaleString('fr',{month:'short'}) + '</div>' +
        '</div>' +
        '<div class="planning-info">' +
        '<span class="type-badge rappel">Rappel</span>' +
        '<div class="planning-desc">' + esc(f.description||'') + '</div>' +
        '<div style="display:flex;gap:6px;margin-top:6px;flex-wrap:wrap">' +
        (f.fait ? '<span style="color:var(--green);font-size:12px">✅ Fait</span>' :
          '<button class="btn btn-ghost btn-sm" onclick="markFollowupDone(\'' + f.id + '\')">✅ Marquer fait</button>') +
        '<button class="btn btn-sm" style="background:#fee2e2;color:#dc2626;border:none" onclick="deleteFollowup(\'' + f.id + '\')">🗑️ Supprimer</button>' +
        '</div>' +
        '</div></div>'
      ).join('');
    }
  } catch(e) {
    el.innerHTML = '<p class="text-muted">Erreur: ' + e.message + '</p>';
  }
}

async function markFollowupDone(id) {
  try {
    await sbFetch('/rest/v1/followups?id=eq.' + id, {
      method: 'PATCH', headers: { 'Prefer': 'return=minimal' },
      body: JSON.stringify({ fait: true })
    });
    showToast('Rappel marqué comme fait', 'success');
    loadDetailFollowups(currentContactId);
  } catch(e) { showToast('Erreur: ' + e.message, 'error'); }
}

async function deleteFollowup(id) {
  if (!confirm('Supprimer ce rappel ?')) return;
  try {
    await sbFetch('/rest/v1/followups?id=eq.' + id, { method: 'DELETE', headers: { 'Prefer': 'return=minimal' } });
    showToast('Rappel supprimé', 'success');
    loadDetailFollowups(currentContactId);
  } catch(e) { showToast('Erreur: ' + e.message, 'error'); }
}

async function quickChangeStatus(newStatus) {
  if (!currentContactId) return;
  const contact = allContacts.find(c => c.id === currentContactId);
  if (!contact) return;
  const oldStatus = contact.statut;
  try {
    await sbFetch('/rest/v1/contacts?id=eq.' + currentContactId, {
      method: 'PATCH', headers: { 'Prefer': 'return=minimal' },
      body: JSON.stringify({ statut: newStatus, updated_at: new Date().toISOString() })
    });
    contact.statut = newStatus;
    document.getElementById('detail-statut-badge').innerHTML = '<span class="badge badge-' + newStatus + '">' + newStatus + '</span>';
    const checklistCard2 = document.getElementById('detail-onboarding-checklist');
    if (checklistCard2) {
      checklistCard2.style.display = newStatus === 'client' ? '' : 'none';
      if (newStatus === 'client') renderOnboardingChecklist(currentContactId);
    }
    showToast('Statut mis à jour: ' + newStatus, 'success');
    // Suggérer une activité selon le nouveau statut
    if (newStatus === 'rdv') {
      setTimeout(() => {
        if (confirm('Statut passé en RDV — créer un rappel pour ce rendez-vous ?')) {
          openFollowupModal();
        }
      }, 400);
    } else if (newStatus === 'prospect' && oldStatus === 'rdv') {
      setTimeout(() => {
        if (confirm('RDV non conclu — planifier une relance ?')) {
          const nextDate = new Date();
          nextDate.setDate(nextDate.getDate() + 7);
          nextDate.setHours(9, 0, 0, 0);
          document.getElementById('followup-date').value = nextDate.toISOString().substring(0,16);
          document.getElementById('followup-desc').value = 'Relance après RDV non conclu';
          openModal('modal-followup');
        }
      }, 400);
    }
    if (newStatus === 'client' && oldStatus !== 'client') {
      await recordSetupCommission(contact);
    }
    // Si on quitte le statut client, supprimer le setup de commission_history
    if (oldStatus === 'client' && newStatus !== 'client') {
      try {
        await sbFetch('/rest/v1/commission_history?contact_id=eq.' + currentContactId + '&type=eq.setup', {
          method: 'DELETE',
          headers: { 'Prefer': 'return=minimal' }
        });
      } catch(e) { /* silencieux */ }
    }
  } catch(e) { showToast('Erreur: ' + e.message, 'error'); }
}

// ===== NEW/EDIT CONTACT MODAL =====
function openNewContactModal() {
  document.getElementById('modal-contact-title').textContent = 'Nouveau contact';
  renderContactForm(null);
  openModal('modal-contact');
  document.getElementById('btn-save-contact').onclick = () => saveContact(null);
}

// ── SUPPRESSION CONTACT ──────────────────────────────────────
async function deleteContact() {
  if (!currentContactId) return;
  const contact = allContacts.find(c => c.id === currentContactId);
  const name = contact ? (contact.nom || contact.entreprise || 'ce contact') : 'ce contact';
  if (!confirm('Supprimer définitivement ' + name + ' ?\n\nCette action est irréversible.')) return;
  try {
    await sbFetch('/rest/v1/contacts?id=eq.' + currentContactId, { method: 'DELETE', headers: { 'Prefer': 'return=minimal' } });
    allContacts = allContacts.filter(c => c.id !== currentContactId);
    currentContactId = null;
    showToast('Contact supprimé', 'success');
    showView('contacts');
    renderContacts();
  } catch(e) {
    showToast('Erreur suppression : ' + e.message, 'error');
  }
}

// ── ÉDITION INLINE FICHE CONTACT ─────────────────────────────
let _detailEditBackup = null;
let _detailDirty = false;

// Always-editable form: shown directly when opening a fiche
function renderDetailInfoFormAuto(contact) {
  _detailEditBackup = { ...contact };
  _detailDirty = false;
  document.getElementById('btns-save-cancel').style.display = 'none';
  renderDetailInfoForm(contact);
  // Attach dirty tracking to all inputs in the form
  setTimeout(() => {
    document.querySelectorAll('#detail-info-grid input, #detail-info-grid select, #detail-info-grid textarea').forEach(el => {
      el.addEventListener('input', markDirty);
      el.addEventListener('change', markDirty);
    });
  }, 50);
}

function markDirty() {
  if (!_detailDirty) {
    _detailDirty = true;
    const canEdit = currentProfile.role === 'admin' || (allContacts.find(c=>c.id===currentContactId)||{}).assignee === currentProfile.nom;
    if (canEdit) document.getElementById('btns-save-cancel').style.display = '';
  }
}

function cancelDetailEdit() {
  _detailDirty = false;
  document.getElementById('btns-save-cancel').style.display = 'none';
  const contact = allContacts.find(c => c.id === currentContactId);
  if (contact) renderDetailInfoFormAuto(contact);
}

function toggleDetailEdit(enable) {
  // Legacy — kept for compatibility
  const contact = allContacts.find(c => c.id === currentContactId);
  if (!contact) return;
  if (enable) renderDetailInfoFormAuto(contact);
  else { _detailDirty = false; document.getElementById('btns-save-cancel').style.display = 'none'; renderDetailInfoFormAuto(contact); }
}

function renderDetailInfoForm(contact) {
  const isAdmin = currentProfile.role === 'admin';
  const commercials = allProfiles.filter(p => p.role === 'commercial');
  const assigneeOpts = isAdmin
    ? '<select id="dif-assignee" class="status-select" style="min-width:140px">' +
        '<option value="">-- Aucun --</option>' +
        commercials.map(p => '<option value="' + esc(p.nom) + '"' + (contact.assignee === p.nom ? ' selected' : '') + '>' + esc(p.nom) + '</option>').join('') +
        '</select>'
    : '<span style="color:var(--text-secondary);font-size:13px">' + esc(contact.assignee||'-') + '</span>';

  // Sous-statut options for current statut
  const ssOpts = (SOUS_STATUTS[contact.statut||'prospect']||[]);
  const ssSelHtml = ssOpts.length > 0
    ? '<select id="dif-sous-statut"><option value="">— Aucun —</option>' +
        ssOpts.map(o=>'<option value="'+o.value+'"'+(contact.sous_statut===o.value?' selected':'')+'>'+o.label+'</option>').join('') +
      '</select>'
    : '<input id="dif-sous-statut" type="hidden" value=""><span style="color:var(--text-light);font-size:13px">—</span>';

  document.getElementById('detail-info-grid').innerHTML = `
    <div class="cd-section">
      <div class="cd-section-title">👤 Contact</div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:12px">
        <div class="form-group" style="margin:0"><label>Nom</label><input id="dif-nom" type="text" value="${esc(contact.nom||'')}"></div>
        <div class="form-group" style="margin:0"><label>Entreprise</label><input id="dif-entreprise" type="text" value="${esc(contact.entreprise||'')}"></div>
        <div class="form-group" style="margin:0"><label>Email</label><input id="dif-email" type="email" value="${esc(contact.email||'')}"></div>
        <div class="form-group" style="margin:0"><label>Téléphone</label><input id="dif-telephone" type="tel" value="${esc(contact.telephone||'')}"></div>
        <div class="form-group" style="margin:0"><label>Secteur d'activité</label><input id="dif-secteur" type="text" value="${esc(contact.secteur||'')}"></div>
      </div>
    </div>

    <div class="cd-section">
      <div class="cd-section-title">📍 Adresse</div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:12px">
        <div class="form-group" style="margin:0;grid-column:1/-1"><label>Adresse</label><input id="dif-adresse" type="text" value="${esc(contact.adresse||'')}"></div>
        <div class="form-group" style="margin:0"><label>Ville</label><input id="dif-ville" type="text" value="${esc(contact.ville||'')}"></div>
        <div class="form-group" style="margin:0"><label>Code postal</label><input id="dif-cp" type="text" value="${esc(contact.code_postal||'')}"></div>
      </div>
    </div>

    <div class="cd-section">
      <div class="cd-section-title">📊 CRM</div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:12px">
        <div class="form-group" style="margin:0"><label>Source</label>
          <select id="dif-source">
            ${['','LinkedIn','Google','Referral','Appel froid','Site web','Autre'].map(s=>'<option value="'+s+'"'+(contact.source===s?' selected':'')+'>'+s+'</option>').join('')}
          </select>
        </div>
        <div class="form-group" style="margin:0"><label>Sous-statut</label>${ssSelHtml}</div>
        <div class="form-group" style="margin:0"><label>Assigné à</label>${assigneeOpts}</div>
        <div class="form-group" style="margin:0"><label>Date RDV</label><input id="dif-date_rdv" type="datetime-local" value="${contact.date_rdv ? contact.date_rdv.substring(0,16) : ''}"></div>
        <div class="form-group" style="margin:0"><label>Date début contrat</label><input id="dif-date_debut" type="date" value="${contact.date_debut||''}"></div>
      </div>
    </div>

    <div class="cd-section">
      <div class="cd-section-title">💼 Formule & Tarif</div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:12px">
        <div class="form-group" style="margin:0;grid-column:1/-1"><label>Formule</label>
          <select id="dif-formule" onchange="autoFillFormule(this.value)">
            <option value="">-- Choisir --</option>
              <option value="Bundle Essentiel IA" ${contact.formule==='Bundle Essentiel IA'?'selected':''}>Bundle Essentiel IA — 499€ setup + 109€/mois</option>
              <option value="Bundle Business IA" ${contact.formule==='Bundle Business IA'?'selected':''}>Bundle Business IA — 949€ setup + 249€/mois ⭐</option>
              <option value="Bundle Premium IA" ${contact.formule==='Bundle Premium IA'?'selected':''}>Bundle Premium IA — 1499€ setup + 449€/mois</option>
            <option value="Sur mesure" ${contact.formule==='Sur mesure'?'selected':''}>Sur mesure</option>
          </select>
        </div>
        <div class="form-group" style="margin:0"><label>Prix setup TVAC (€)</label><input id="dif-setup" type="number" value="${contact.prix_setup||''}"></div>
        <div class="form-group" style="margin:0"><label>Prix mensuel TVAC (€)</label><input id="dif-mensuel" type="number" value="${contact.prix_mensuel||''}"></div>
      </div>
    </div>

    <div class="cd-section">
      <div class="cd-section-title">🏦 Paiement SEPA</div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:12px">
        <div class="form-group" style="margin:0"><label>IBAN</label><input id="dif-iban" type="text" placeholder="BE00 0000 0000 0000" value="${esc(contact.iban||'')}"></div>
        <div class="form-group" style="margin:0"><label>BIC</label><input id="dif-bic" type="text" placeholder="GEBABEBB" value="${esc(contact.bic||'')}"></div>
      </div>
    </div>

    <div class="cd-section" style="margin-bottom:0">
      <div class="cd-section-title">📝 Notes internes</div>
      <div class="form-group" style="margin:0"><label></label><textarea id="dif-notes" rows="4" style="width:100%;box-sizing:border-box">${esc(contact.notes_generales||'')}</textarea></div>
    </div>`;
}

async function saveDetailInline() {
  if (!currentContactId) return;
  const btn = document.querySelector('#btns-save-cancel .btn-green');
  if (btn) { btn.disabled = true; btn.textContent = '...'; }
  try {
    const payload = {
      nom: document.getElementById('dif-nom')?.value.trim()||null,
      entreprise: document.getElementById('dif-entreprise')?.value.trim()||null,
      email: document.getElementById('dif-email')?.value.trim()||null,
      telephone: document.getElementById('dif-telephone')?.value.trim()||null,
      ville: document.getElementById('dif-ville')?.value.trim()||null,
      code_postal: document.getElementById('dif-cp')?.value.trim()||null,
      adresse: document.getElementById('dif-adresse')?.value.trim()||null,
      secteur: document.getElementById('dif-secteur')?.value.trim()||null,
      source: document.getElementById('dif-source')?.value||null,
      sous_statut: document.getElementById('dif-sous-statut')?.value||null,
      formule: document.getElementById('dif-formule')?.value||null,
      prix_setup: document.getElementById('dif-setup')?.value ? parseFloat(document.getElementById('dif-setup').value) : null,
      prix_mensuel: document.getElementById('dif-mensuel')?.value ? parseFloat(document.getElementById('dif-mensuel').value) : null,
      date_debut: document.getElementById('dif-date_debut')?.value||null,
      date_rdv: document.getElementById('dif-date_rdv')?.value||null,
      assignee: document.getElementById('dif-assignee')?.value||null,
      notes_generales: document.getElementById('dif-notes')?.value.trim()||null,
      iban: document.getElementById('dif-iban')?.value.trim().toUpperCase()||null,
      bic: document.getElementById('dif-bic')?.value.trim().toUpperCase()||null,
      updated_at: new Date().toISOString(),
    };
    await sbFetch('/rest/v1/contacts?id=eq.' + currentContactId, {
      method: 'PATCH', headers: { 'Prefer': 'return=minimal' },
      body: JSON.stringify(payload)
    });
    const idx = allContacts.findIndex(c => c.id === currentContactId);
    if (idx !== -1) Object.assign(allContacts[idx], payload);
    const updatedContact = allContacts.find(c => c.id === currentContactId);
    // Update header
    document.getElementById('detail-name').textContent = (updatedContact.nom||'') + (updatedContact.entreprise ? ' — ' + updatedContact.entreprise : '');
    // Refresh sous-statut badge in hero
    const ssBadgeAfter = document.getElementById('detail-sous-statut-badge');
    if (ssBadgeAfter) ssBadgeAfter.innerHTML = getSousBadgeHtml(updatedContact.sous_statut, updatedContact.statut||'prospect');
    _detailDirty = false;
    document.getElementById('btns-save-cancel').style.display = 'none';
    renderDetailInfoFormAuto(updatedContact);
    showToast('Contact mis à jour ✓', 'success');
  } catch(e) {
    showToast('Erreur : ' + e.message, 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '✓ Sauvegarder'; }
  }
}

function openEditContactModal() {
  if (!currentContactId) return;
  const contact = allContacts.find(c => c.id === currentContactId);
  openEditContactModalWithData(contact);
}

function openEditContactModalById(id) {
  const contact = allContacts.find(c => c.id === id);
  if (!contact) return;
  openEditContactModalWithData(contact);
}

function openEditContactModalWithData(contact) {
  document.getElementById('modal-contact-title').textContent = 'Modifier le contact';
  renderContactForm(contact);
  openModal('modal-contact');
  document.getElementById('btn-save-contact').onclick = () => saveContact(contact.id);
}

function renderContactForm(contact) {
  const isAdmin = currentProfile.role === 'admin';
  const commercials = allProfiles.filter(p => p.role === 'commercial');
  // Admin: dropdown pour choisir le commercial
  // Commercial: auto-assigné à lui-même (non modifiable)
  const myAssignee = contact ? (contact.assignee || currentProfile.nom) : currentProfile.nom;
  const assigneeOpts = isAdmin
    ? '<select id="cf-assignee">' +
        '<option value="">-- Sélectionner --</option>' +
        commercials.map(p => '<option value="' + esc(p.nom) + '"' + (contact && contact.assignee === p.nom ? ' selected' : '') + '>' + esc(p.nom) + '</option>').join('') +
        '</select>'
    : '<input type="hidden" id="cf-assignee" value="' + esc(myAssignee) + '">' +
      '<span style="display:inline-block;padding:6px 12px;background:#f1f5f9;border-radius:6px;font-size:13px;color:#64748b;">👤 ' + esc(myAssignee) + ' <span style="font-size:11px;color:#94a3b8;">(auto)</span></span>';

  document.getElementById('modal-contact-form').innerHTML = `
    <div class="form-row">
      <div class="form-group"><label>Nom</label><input type="text" id="cf-nom" value="${esc(contact?.nom||'')}"></div>
      <div class="form-group"><label>Entreprise</label><input type="text" id="cf-entreprise" value="${esc(contact?.entreprise||'')}"></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>Email</label><input type="email" id="cf-email" value="${esc(contact?.email||'')}"></div>
      <div class="form-group"><label>Téléphone</label><input type="tel" id="cf-telephone" value="${esc(contact?.telephone||'')}"></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>Ville</label><input type="text" id="cf-ville" value="${esc(contact?.ville||'')}"></div>
      <div class="form-group"><label>Code postal</label><input type="text" id="cf-cp" value="${esc(contact?.code_postal||'')}"></div>
    </div>
    <div class="form-group"><label>Adresse</label><input type="text" id="cf-adresse" value="${esc(contact?.adresse||'')}"></div>
    <div class="form-row">
      <div class="form-group"><label>Secteur</label><input type="text" id="cf-secteur" value="${esc(contact?.secteur||'')}"></div>
      <div class="form-group"><label>Source</label>
        <select id="cf-source">
          ${['','LinkedIn','Google','Referral','Appel froid','Site web','Autre'].map(s => '<option value="'+s+'"'+(contact?.source===s?' selected':'')+'>'+s+'</option>').join('')}
        </select>
      </div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>Statut</label>
        <select id="cf-statut" onchange="updateSousStatutOptions(this.value,'')">
          ${['prospect','rdv','client','perdu'].map(s=>'<option value="'+s+'"'+(contact?.statut===s?' selected':'')+'>'+s+'</option>').join('')}
        </select>
      </div>
      <div class="form-group" id="fg-sous-statut"><label>Sous-statut</label>
        <select id="cf-sous-statut"></select>
      </div>
      <div class="form-group"><label>Formule</label>
        <select id="cf-formule" onchange="autoFillFormule(this.value)">
          <option value="">-- Choisir une formule --</option>
            <option value="Bundle Essentiel IA" ${contact?.formule==='Bundle Essentiel IA'?'selected':''}>Bundle Essentiel IA (499€ setup + 109€/mois)</option>
            <option value="Bundle Business IA" ${contact?.formule==='Bundle Business IA'?'selected':''}>Bundle Business IA (949€ setup + 249€/mois) ⭐</option>
            <option value="Bundle Premium IA" ${contact?.formule==='Bundle Premium IA'?'selected':''}>Bundle Premium IA (1499€ setup + 449€/mois)</option>
          <option value="Sur mesure" ${contact?.formule==='Sur mesure'?'selected':''}>Sur mesure</option>
        </select>
      </div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>Prix setup TVAC (€)</label><input type="number" id="cf-setup" value="${contact?.prix_setup||''}"></div>
      <div class="form-group"><label>Prix mensuel TVAC (€)</label><input type="number" id="cf-mensuel" value="${contact?.prix_mensuel||''}"></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>Date début</label><input type="date" id="cf-date_debut" value="${contact?.date_debut||''}"></div>
      <div class="form-group"><label>Date RDV</label><input type="datetime-local" id="cf-date_rdv" value="${contact?.date_rdv ? contact.date_rdv.substring(0,16) : ''}"></div>
    </div>
    <div class="form-group"><label>Assigné à</label>${assigneeOpts}</div>
    <div class="form-group"><label>Notes</label><textarea id="cf-notes">${esc(contact?.notes_generales||'')}</textarea></div>
  `;
  // Initialiser le dropdown sous-statut selon le statut actuel
  updateSousStatutOptions(contact?.statut || 'prospect', contact?.sous_statut || '');
}

async function saveContact(editId) {
  const btn = document.getElementById('btn-save-contact');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span>';
  try {
    // Vérification doublon téléphone
    const telInput = document.getElementById('cf-telephone')?.value.trim();
    if (telInput) {
      const duplicate = allContacts.find(c => c.telephone === telInput && c.id !== editId);
      if (duplicate) {
        const name = duplicate.nom || duplicate.entreprise || 'contact inconnu';
        if (!confirm('⚠️ Ce numéro existe déjà pour : ' + name + '\n\nContinuer quand même ?')) {
          btn.disabled = false;
          btn.innerHTML = 'Enregistrer';
          return;
        }
      }
    }
    const payload = {
      nom: document.getElementById('cf-nom')?.value.trim()||null,
      entreprise: document.getElementById('cf-entreprise')?.value.trim()||null,
      email: document.getElementById('cf-email')?.value.trim()||null,
      telephone: document.getElementById('cf-telephone')?.value.trim()||null,
      ville: document.getElementById('cf-ville')?.value.trim()||null,
      code_postal: document.getElementById('cf-cp')?.value.trim()||null,
      adresse: document.getElementById('cf-adresse')?.value.trim()||null,
      secteur: document.getElementById('cf-secteur')?.value.trim()||null,
      source: document.getElementById('cf-source')?.value||null,
      statut: document.getElementById('cf-statut')?.value||'prospect',
      sous_statut: document.getElementById('cf-sous-statut')?.value||null,
      formule: document.getElementById('cf-formule')?.value.trim()||null,
      prix_setup: document.getElementById('cf-setup')?.value ? parseFloat(document.getElementById('cf-setup').value) : null,
      prix_mensuel: document.getElementById('cf-mensuel')?.value ? parseFloat(document.getElementById('cf-mensuel').value) : null,
      date_debut: document.getElementById('cf-date_debut')?.value||null,
      date_rdv: document.getElementById('cf-date_rdv')?.value||null,
      assignee: document.getElementById('cf-assignee')?.value||null,
      notes_generales: document.getElementById('cf-notes')?.value.trim()||null,
      updated_at: new Date().toISOString(),
    };
    let wasClient = false;
    if (editId) {
      const old = allContacts.find(c => c.id === editId);
      wasClient = old && old.statut === 'client';
      await sbFetch('/rest/v1/contacts?id=eq.' + editId, {
        method: 'PATCH', headers: { 'Prefer': 'return=minimal' },
        body: JSON.stringify(payload)
      });
      const idx = allContacts.findIndex(c => c.id === editId);
      if (idx !== -1) Object.assign(allContacts[idx], payload);
      if (!wasClient && payload.statut === 'client') await recordSetupCommission({...allContacts.find(c=>c.id===editId), ...payload});
      showToast('Contact mis à jour', 'success');
    } else {
      payload.created_by = currentProfile.email;
      if (!payload.assignee && currentProfile.role === 'commercial') payload.assignee = currentProfile.nom;
      const result = await sbFetch('/rest/v1/contacts', {
        method: 'POST', headers: { 'Prefer': 'return=representation' },
        body: JSON.stringify(payload)
      });
      const newContact = Array.isArray(result) ? result[0] : result;
      if (newContact) allContacts.unshift(newContact);
      if (payload.statut === 'client') await recordSetupCommission({...newContact, ...payload});
      showToast('Contact créé', 'success');
    }
    closeModal('modal-contact');
    renderContacts();
  } catch(e) {
    showToast('Erreur: ' + e.message, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = 'Enregistrer';
  }
}

// ===== ADD NOTE =====
function openAddNoteModal() {
  document.getElementById('note-type').value = 'note';
  document.getElementById('note-contenu').value = '';
  openModal('modal-note');
}

async function saveNote() {
  const contenu = document.getElementById('note-contenu').value.trim();
  if (!contenu) { showToast('Veuillez saisir un contenu', 'error'); return; }
  const type = document.getElementById('note-type').value;
  const result = document.getElementById('note-result')?.value || '';
  let fullContenu = contenu;
  if (type === 'appel' && result) {
    const resultLabels = { interesse: 'Intéressé', messagerie: 'Messagerie', refus: 'Refus', rdv_fixe: 'RDV fixé' };
    fullContenu = '[' + (resultLabels[result]||result) + '] ' + contenu;
  }
  try {
    await sbFetch('/rest/v1/notes', {
      method: 'POST', headers: { 'Prefer': 'return=minimal' },
      body: JSON.stringify({
        contact_id: currentContactId,
        type: type,
        contenu: fullContenu,
        auteur: currentProfile.nom || currentUser.email,
        created_at: new Date().toISOString()
      })
    });
    showToast('Note ajoutée', 'success');
    closeModal('modal-note');
    loadDetailNotes(currentContactId);
    // Auto-suggest followup for appel with positive result
    if (type === 'appel' && (result === 'interesse' || result === 'messagerie')) {
      setTimeout(() => {
        const label = result === 'interesse' ? 'RDV de confirmation' : 'Rappel (messagerie)';
        if (confirm('Créer un rappel automatique pour ce contact ?\n\n"' + label + '"')) {
          const nextDate = new Date();
          nextDate.setDate(nextDate.getDate() + (result === 'interesse' ? 2 : 3));
          nextDate.setHours(10, 0, 0, 0);
          document.getElementById('followup-date').value = nextDate.toISOString().substring(0,16);
          document.getElementById('followup-desc').value = label;
          openModal('modal-followup');
        }
      }, 300);
    }
  } catch(e) { showToast('Erreur: ' + e.message, 'error'); }
}

// ===== FOLLOW-UP =====
function openFollowupModal() {
  const now = new Date();
  now.setHours(now.getHours()+1, 0, 0, 0);
  document.getElementById('followup-date').value = now.toISOString().substring(0,16);
  document.getElementById('followup-desc').value = '';
  openModal('modal-followup');
}

async function saveFollowup() {
  const date = document.getElementById('followup-date').value;
  if (!date) { showToast('Veuillez choisir une date', 'error'); return; }
  try {
    await sbFetch('/rest/v1/followups', {
      method: 'POST', headers: { 'Prefer': 'return=minimal' },
      body: JSON.stringify({
        contact_id: currentContactId,
        date_prevue: new Date(date).toISOString(),
        date_rappel: new Date(date).toISOString(),
        description: document.getElementById('followup-desc').value.trim(),
        fait: false,
        assignee: currentProfile.nom || currentUser.email,
        created_at: new Date().toISOString()
      })
    });
    showToast('Rappel créé', 'success');
    closeModal('modal-followup');
    loadDetailFollowups(currentContactId);
  } catch(e) { showToast('Erreur: ' + e.message, 'error'); }
}

// ===== PLANNING =====
function setPlanningFilter(days, el) {
  planningDays = days;
  document.querySelectorAll('#view-planning .sub-tab').forEach(t => t.classList.remove('active'));
  el.classList.add('active');
  loadPlanning();
}

async function loadPlanning() {
  const el = document.getElementById('planning-list');
  el.innerHTML = '<div class="loading-center"><span class="spinner spinner-dark"></span></div>';

  const assigneeFilter = document.getElementById('planning-filter-assignee');
  if (currentProfile.role === 'admin') {
    assigneeFilter.style.display = '';
    const assignees = [...new Set(allContacts.map(c => c.assignee).filter(Boolean))];
    const cur = assigneeFilter.value;
    assigneeFilter.innerHTML = '<option value="">Tous</option>' +
      assignees.map(a => '<option value="' + esc(a) + '"' + (a===cur?' selected':'') + '>' + esc(a) + '</option>').join('');
  }

  try {
    const now = new Date();
    let maxDate = null;
    if (planningDays > 0) {
      maxDate = new Date(now);
      maxDate.setDate(maxDate.getDate() + planningDays);
    }

    // RDVs from contacts
    let rdvContacts = allContacts.filter(c => c.statut === 'rdv' && c.date_rdv);
    if (maxDate) rdvContacts = rdvContacts.filter(c => new Date(c.date_rdv) <= maxDate);
    const assigneeSel = assigneeFilter ? assigneeFilter.value : '';
    if (assigneeSel) rdvContacts = rdvContacts.filter(c => c.assignee === assigneeSel);

    // Follow-ups
    let fuUrl = '/rest/v1/followups?fait=eq.false&order=date_prevue.asc&select=*,contacts(nom,entreprise)';
    const fups = await sbFetch(fuUrl) || [];
    let filteredFups = fups.filter(f => !maxDate || new Date(f.date_prevue) <= maxDate);
    if (assigneeSel) filteredFups = filteredFups.filter(f => f.assignee === assigneeSel);

    // Combine and sort
    const items = [];
    rdvContacts.forEach(c => items.push({
      date: c.date_rdv, type: 'rdv', contactName: c.nom || c.entreprise || '-',
      desc: c.notes_generales || '', assignee: c.assignee, id: c.id
    }));
    filteredFups.forEach(f => items.push({
      date: f.date_prevue, type: 'rappel',
      contactName: f.contacts ? (f.contacts.nom || f.contacts.entreprise || '-') : '-',
      desc: f.description || '', assignee: f.assignee, id: f.contact_id
    }));
    items.sort((a,b) => new Date(a.date) - new Date(b.date));

    if (items.length === 0) {
      el.innerHTML = '<div class="empty-state"><div class="icon">🗓️</div><p>Aucun événement prévu</p></div>';
    } else {
      const todayStart = new Date(); todayStart.setHours(0,0,0,0);
      const tomorrowStart = new Date(todayStart); tomorrowStart.setDate(tomorrowStart.getDate()+1);
      const weekEnd = new Date(todayStart); weekEnd.setDate(weekEnd.getDate()+7);

      const groups = [
        { key: 'retard', label: '⚠️ En retard', color: '#ef4444', items: items.filter(i => new Date(i.date) < todayStart) },
        { key: 'today', label: "📅 Aujourd'hui", color: '#00d68f', items: items.filter(i => { const d = new Date(i.date); return d >= todayStart && d < tomorrowStart; }) },
        { key: 'tomorrow', label: '🔜 Demain', color: '#4a9eff', items: items.filter(i => { const d = new Date(i.date); return d >= tomorrowStart && d < new Date(tomorrowStart.getTime()+86400000); }) },
        { key: 'week', label: '📆 Cette semaine', color: '#f5a623', items: items.filter(i => { const d = new Date(i.date); return d >= new Date(tomorrowStart.getTime()+86400000) && d < weekEnd; }) },
        { key: 'later', label: '🗓️ Plus tard', color: '#8892a4', items: items.filter(i => new Date(i.date) >= weekEnd) },
      ];

      const renderItem = item => {
        const d = new Date(item.date);
        return '<div class="planning-item">' +
          '<div class="planning-date"><div class="day">' + d.getDate() + '</div><div class="month">' +
          d.toLocaleString('fr',{month:'short'}) + '</div></div>' +
          '<div class="planning-info">' +
          '<span class="type-badge ' + item.type + '">' + (item.type==='rdv'?'RDV':'Rappel') + '</span>' +
          '<div class="contact-name" onclick="openContactDetail(\'' + item.id + '\')" style="cursor:pointer">' + esc(item.contactName) + '</div>' +
          (item.desc ? '<div class="planning-desc">' + esc(item.desc) + '</div>' : '') +
          (item.assignee ? '<div class="text-muted" style="margin-top:3px">👤 ' + esc(item.assignee) + '</div>' : '') +
          '<div class="text-muted">' + formatDateTime(item.date) + '</div>' +
          '</div></div>';
      };

      let html = '';
      groups.forEach(g => {
        if (!g.items.length) return;
        html += '<div style="margin-bottom:20px">' +
          '<div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:' + g.color + ';margin-bottom:10px;padding-bottom:6px;border-bottom:2px solid ' + g.color + '33">' + g.label + ' (' + g.items.length + ')</div>' +
          g.items.map(renderItem).join('') +
          '</div>';
      });
      el.innerHTML = html || '<div class="empty-state"><div class="icon">🗓️</div><p>Aucun événement prévu</p></div>';
    }
  } catch(e) {
    el.innerHTML = '<p class="text-muted">Erreur: ' + e.message + '</p>';
  }
}

// ===== COMMISSIONS (commercial) =====
async function loadCommissions() {
  const now = new Date();
  const moisKey = now.getFullYear() + '-' + String(now.getMonth()+1).padStart(2,'0');
  const moisLabel = now.toLocaleString('fr', {month:'long', year:'numeric'});
  document.getElementById('comm-period').textContent = 'Mois courant : ' + moisLabel;

  const myClients = allContacts.filter(c => c.statut === 'client');
  const totalMensuelTVAC = myClients.reduce((s,c) => s + (parseFloat(c.prix_mensuel)||0), 0);
  const totalMensuelHTVA = totalMensuelTVAC / TVA_RATE;
  const commMensuelle = totalMensuelHTVA * TAUX_COMMISSION;

  // Setup commissions this month
  let setupComm = 0, setupTVAC = 0;
  try {
    const setups = await sbFetch('/rest/v1/commission_history?commercial_email=eq.' + encodeURIComponent(currentProfile.email) + '&mois=eq.' + moisKey + '&type=eq.setup&select=*') || [];
    setupComm = setups.reduce((s,c) => s + (parseFloat(c.commission)||0), 0);
    setupTVAC = setups.reduce((s,c) => s + (parseFloat(c.montant_tvac)||0), 0);
  } catch(e) {}

  const totalMois = commMensuelle + setupComm;

  document.getElementById('comm-summary').innerHTML = [
    { label: 'Clients actifs', value: myClients.length, cls: '' },
    { label: 'Commission mensuelle', value: fmtEur(commMensuelle), cls: 'green-card' },
    { label: 'Commission setup ce mois', value: fmtEur(setupComm), cls: '' },
    { label: 'Total à recevoir ce mois', value: fmtEur(totalMois), cls: 'green-card' },
  ].map(c =>
    '<div class="commission-card ' + c.cls + '">' +
    '<div class="label">' + c.label + '</div>' +
    '<div class="value">' + c.value + '</div>' +
    '</div>'
  ).join('');

  // Active clients table
  const tbody = document.getElementById('comm-clients-tbody');
  tbody.innerHTML = myClients.length === 0
    ? '<tr><td colspan="5" style="text-align:center;color:var(--text-light)">Aucun client actif</td></tr>'
    : myClients.map(c => {
      const tvac = parseFloat(c.prix_mensuel)||0;
      const htva = tvac/TVA_RATE;
      const comm = htva*TAUX_COMMISSION;
      return '<tr>' +
        '<td class="fw700">' + esc(c.nom||c.entreprise||'-') + '</td>' +
        '<td>' + esc(c.formule||'-') + '</td>' +
        '<td>' + fmtEur(tvac) + '</td>' +
        '<td>' + fmtEur(htva) + '</td>' +
        '<td class="fw700" style="color:var(--green)">' + fmtEur(comm) + '</td>' +
        '</tr>';
    }).join('');

  // Setup history by month
  try {
    const allSetups = await sbFetch('/rest/v1/commission_history?commercial_email=eq.' + encodeURIComponent(currentProfile.email) + '&type=eq.setup&order=mois.desc&select=*') || [];
    const byMonth = {};
    allSetups.forEach(s => {
      if (!byMonth[s.mois]) byMonth[s.mois] = { mois: s.mois, count: 0, tvac: 0, htva: 0, comm: 0 };
      byMonth[s.mois].count++;
      byMonth[s.mois].tvac += parseFloat(s.montant_tvac)||0;
      byMonth[s.mois].htva += parseFloat(s.montant_htva)||0;
      byMonth[s.mois].comm += parseFloat(s.commission)||0;
    });
    const histTbody = document.getElementById('comm-history-tbody');
    const months = Object.values(byMonth).sort((a,b) => b.mois.localeCompare(a.mois));
    histTbody.innerHTML = months.length === 0
      ? '<tr><td colspan="5" style="text-align:center;color:var(--text-light)">Aucun historique</td></tr>'
      : months.map(m =>
        '<tr>' +
        '<td class="fw700">' + formatMois(m.mois) + '</td>' +
        '<td>' + m.count + '</td>' +
        '<td>' + fmtEur(m.tvac) + '</td>' +
        '<td>' + fmtEur(m.htva) + '</td>' +
        '<td class="fw700" style="color:var(--green)">' + fmtEur(m.comm) + '</td>' +
        '</tr>'
      ).join('');
  } catch(e) {}
}

// ===== REVENUS (admin) =====
let _revAllSetups = []; // cache global pour histogramme

async function loadRevenus() {
  const now = new Date();
  const currentMois = now.getFullYear() + '-' + String(now.getMonth()+1).padStart(2,'0');

  // Fetch all setup history for month list
  try {
    _revAllSetups = await sbFetch('/rest/v1/commission_history?type=eq.setup&order=mois.desc&select=*') || [];
  } catch(e) { _revAllSetups = []; }

  // Build months set
  const moisSet = new Set([currentMois]);
  _revAllSetups.forEach(s => moisSet.add(s.mois));
  const allClients = allContacts.filter(c => c.statut === 'client');
  allClients.forEach(c => {
    const dateRef = c.date_debut ? new Date(c.date_debut) : new Date(c.created_at);
    if (!isNaN(dateRef)) moisSet.add(dateRef.getFullYear() + '-' + String(dateRef.getMonth()+1).padStart(2,'0'));
  });

  const months = [...moisSet].sort().reverse();
  const sel = document.getElementById('rev-month-select');
  if (sel) {
    sel.innerHTML = months.map(m => `<option value="${m}" ${m===currentMois?'selected':''}>${formatMois(m)}</option>`).join('');
  }

  // Totaux globaux (toujours actuels)
  const activeClients = allContacts.filter(c => c.statut === 'client' && c.actif !== false);
  const mrrHTVA = activeClients.reduce((s,c) => s+(parseFloat(c.prix_mensuel)||0),0) / TVA_RATE;
  const commMens = mrrHTVA * TAUX_COMMISSION;
  const netMens = mrrHTVA - commMens;
  const allTimeSetupHTVA = _revAllSetups.reduce((s,r) => s+(parseFloat(r.montant_htva)||0), 0);

  const totEl = document.getElementById('rev-totaux-globaux');
  if (totEl) totEl.innerHTML = [
    { label: 'Setups encaissés (all-time)', value: fmtEur(allTimeSetupHTVA), sub: _revAllSetups.length + ' contrat(s) signés' },
    { label: 'MRR actuel HTVA', value: fmtEur(mrrHTVA), sub: activeClients.length + ' client(s) actif(s)' },
    { label: 'Net mensuel Florian', value: fmtEur(netMens), sub: 'après commissions' },
  ].map(m =>
    '<div style="color:#fff">' +
    '<div style="font-size:11px;opacity:.6;margin-bottom:4px">' + m.label + '</div>' +
    '<div style="font-size:22px;font-weight:800">' + m.value + '</div>' +
    '<div style="font-size:11px;opacity:.5;margin-top:2px">' + m.sub + '</div>' +
    '</div>'
  ).join('');

  loadRevenusMois(currentMois);
}

async function loadRevenusMois(moisKey) {
  if (!moisKey) return;
  document.getElementById('rev-period').textContent = formatMois(moisKey);

  const [year, month] = moisKey.split('-').map(Number);

  // Clients actifs
  const activeClients = allContacts.filter(c => c.statut === 'client' && c.actif !== false);
  const mrrHTVA = activeClients.reduce((s,c) => s+(parseFloat(c.prix_mensuel)||0),0) / TVA_RATE;

  // Setups ce mois (depuis commission_history)
  let setupsCeMois = [];
  try {
    setupsCeMois = await sbFetch('/rest/v1/commission_history?mois=eq.' + moisKey + '&type=eq.setup&select=*') || [];
  } catch(e) {}
  const setupsHTVA = setupsCeMois.reduce((s,r) => s+(parseFloat(r.montant_htva)||0), 0);
  const commSetup = setupsCeMois.reduce((s,r) => s+(parseFloat(r.commission)||0), 0);
  const commMens = mrrHTVA * TAUX_COMMISSION;
  const totalComm = commSetup + commMens;
  const netFlorian = setupsHTVA + mrrHTVA - totalComm;

  // ── KPIs du mois
  const kpiEl = document.getElementById('rev-kpis');
  if (kpiEl) kpiEl.innerHTML = [
    { label: 'Setups HTVA ce mois', value: fmtEur(setupsHTVA), sub: setupsCeMois.length + ' contrat(s)' },
    { label: 'Récurrents HTVA ce mois', value: fmtEur(mrrHTVA), sub: activeClients.length + ' client(s) actif(s)' },
    { label: 'Net Florian ce mois', value: fmtEur(netFlorian), accent: true, sub: 'après commissions' },
  ].map(m =>
    '<div class="revenus-metric' + (m.accent?' accent':'') + '">' +
    '<div class="label">' + m.label + '</div>' +
    '<div class="value">' + m.value + '</div>' +
    '<div style="font-size:11px;color:' + (m.accent?'rgba(255,255,255,.7)':'var(--text-secondary)') + ';margin-top:2px">' + m.sub + '</div>' +
    '</div>'
  ).join('');

  // ── Table Setups ce mois
  const setupTableEl = document.getElementById('rev-setups-table');
  if (setupTableEl) {
    if (!setupsCeMois.length) {
      setupTableEl.innerHTML = '<div style="color:var(--text-secondary);font-size:13px;padding:12px 0">Aucun setup ce mois</div>';
    } else {
      setupTableEl.innerHTML = '<div class="table-wrap"><table><thead><tr><th>Client</th><th>Formule</th><th>Commercial</th><th>Montant HTVA</th></tr></thead><tbody>' +
        setupsCeMois.map(s =>
          '<tr><td class="fw700">' + esc(s.contact_nom||'-') + '</td>' +
          '<td>' + esc(s.formule||'-') + '</td>' +
          '<td>' + esc(s.commercial_email ? s.commercial_email.split('@')[0] : '-') + '</td>' +
          '<td style="color:var(--green);font-weight:700">' + fmtEur(parseFloat(s.montant_htva)||0) + '</td></tr>'
        ).join('') +
        '</tbody></table></div>';
    }
  }

  // ── Table Récurrents ce mois
  const recurEl = document.getElementById('rev-recurrents-table');
  if (recurEl) {
    if (!activeClients.length) {
      recurEl.innerHTML = '<div style="color:var(--text-secondary);font-size:13px;padding:12px 0">Aucun client actif</div>';
    } else {
      recurEl.innerHTML = '<div class="table-wrap"><table><thead><tr><th>Client</th><th>Formule</th><th>Commercial</th><th>Mensuel HTVA</th></tr></thead><tbody>' +
        activeClients.map(c => {
          const htva = (parseFloat(c.prix_mensuel)||0) / TVA_RATE;
          return '<tr><td class="fw700">' + esc(c.nom||c.entreprise||'-') + '</td>' +
            '<td>' + esc(c.formule||'-') + '</td>' +
            '<td>' + esc(c.assignee||'-') + '</td>' +
            '<td style="color:var(--green);font-weight:700">' + fmtEur(htva) + '</td></tr>';
        }).join('') +
        '</tbody></table></div>';
    }
  }

  // ── Nouveaux clients ce mois
  const nouveaux = allContacts.filter(c => {
    if (c.statut !== 'client') return false;
    const dateRef = c.date_debut ? new Date(c.date_debut) : new Date(c.created_at);
    return !isNaN(dateRef) && dateRef.getFullYear() === year && (dateRef.getMonth()+1) === month;
  });
  const nouvEl = document.getElementById('rev-nouveaux-clients');
  if (nouvEl) {
    if (!nouveaux.length) {
      nouvEl.innerHTML = '<div style="color:var(--text-secondary);font-size:13px;padding:8px 0">Aucun nouveau client ce mois</div>';
    } else {
      nouvEl.innerHTML = '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:12px;padding:4px 0">' +
        nouveaux.map(c =>
          '<div style="background:var(--bg);border:1px solid var(--border);border-radius:10px;padding:14px;cursor:pointer" onclick="openContact(\'' + c.id + '\')">' +
          '<div style="font-weight:700;font-size:14px;margin-bottom:6px">' + esc(c.nom||c.entreprise||'-') + '</div>' +
          '<div style="font-size:12px;color:var(--text-secondary);margin-bottom:3px">&#x1F4CB; ' + esc(c.formule||'Non renseigné') + '</div>' +
          '<div style="font-size:12px;color:var(--text-secondary)">&#x1F464; ' + esc(c.assignee||'Florian') + '</div>' +
          '</div>'
        ).join('') +
        '</div>';
    }
  }

  // ── Commissions à payer ce mois
  const commercials = allProfiles.filter(p => p.role === 'commercial' && p.actif !== false);
  const commPayEl = document.getElementById('rev-commissions-payer');
  if (commPayEl) {
    if (!commercials.length) {
      commPayEl.innerHTML = '<div style="color:var(--text-secondary);font-size:13px;padding:8px 0">Aucun commercial</div>';
    } else {
      const cards = commercials.map(comm => {
        const myClients = activeClients.filter(c => c.created_by === comm.email || c.assignee === comm.nom);
        const myMRR_HTVA = myClients.reduce((s,c) => s+(parseFloat(c.prix_mensuel)||0),0) / TVA_RATE;
        const myCommMens = myMRR_HTVA * (parseFloat(comm.taux_commission)||TAUX_COMMISSION);
        const mySetups = setupsCeMois.filter(s => s.commercial_email === comm.email);
        const myCommSetup = mySetups.reduce((s,r) => s+(parseFloat(r.commission)||0), 0);
        const totalAVirer = myCommMens + myCommSetup;
        return '<div style="background:var(--bg);border:2px solid ' + (totalAVirer>0?'var(--green)':'var(--border)') + ';border-radius:12px;padding:16px;min-width:200px">' +
          '<div style="font-weight:700;font-size:15px;margin-bottom:12px">' + esc(comm.nom) + '</div>' +
          '<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;font-size:13px;margin-bottom:12px">' +
          '<div><div style="font-size:10px;color:var(--text-secondary)">Comm. mensuelle</div><div style="font-weight:600">' + fmtEur(myCommMens) + '</div></div>' +
          '<div><div style="font-size:10px;color:var(--text-secondary)">Comm. setup</div><div style="font-weight:600">' + fmtEur(myCommSetup) + '</div></div>' +
          '</div>' +
          '<div style="border-top:1px solid var(--border);padding-top:10px;display:flex;justify-content:space-between;align-items:center">' +
          '<span style="font-size:12px;color:var(--text-secondary)">Total à virer</span>' +
          '<span style="font-size:18px;font-weight:800;color:' + (totalAVirer>0?'var(--green)':'var(--text-secondary)') + '">' + fmtEur(totalAVirer) + '</span>' +
          '</div></div>';
      });
      commPayEl.innerHTML = '<div style="display:flex;gap:12px;flex-wrap:wrap">' + cards.join('') + '</div>';
    }
  }

  // ── Par commercial (cards cliquables)
  const revByComm = document.getElementById('rev-by-commercial');
  if (revByComm) {
    if (!commercials.length) {
      revByComm.innerHTML = '<div style="color:var(--text-secondary);font-size:13px;padding:8px 0">Aucun commercial enregistré</div>';
    } else {
      revByComm.innerHTML = '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:12px;padding:4px 0">' +
        commercials.map(comm => {
          const myClients = activeClients.filter(c => c.created_by === comm.email || c.assignee === comm.nom);
          const mrr_htva = myClients.reduce((s,c) => s+(parseFloat(c.prix_mensuel)||0),0) / TVA_RATE;
          const commMensComm = mrr_htva * (parseFloat(comm.taux_commission)||TAUX_COMMISSION);
          const sData = setupsCeMois.filter(s => s.commercial_email === comm.email);
          const commSetupComm = sData.reduce((s,r) => s+(parseFloat(r.commission)||0), 0);
          const totalCommComm = commMensComm + commSetupComm;
          return '<div class="card" style="padding:16px;cursor:pointer;border:2px solid var(--border)" onclick="showCommercialDetail(' + JSON.stringify(comm.email) + ')">' +
            '<div style="font-weight:700;font-size:15px;margin-bottom:12px">' + esc(comm.nom) + ' <span style="font-size:11px;color:var(--text-secondary);font-weight:400">&#x2197; voir d&#233;tail</span></div>' +
            '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:13px">' +
            '<div><div style="color:var(--text-secondary);font-size:11px">Clients actifs</div><div style="font-weight:600">' + myClients.length + '</div></div>' +
            '<div><div style="color:var(--text-secondary);font-size:11px">MRR HTVA</div><div style="font-weight:600">' + fmtEur(mrr_htva) + '</div></div>' +
            '<div><div style="color:var(--text-secondary);font-size:11px">Comm. mensuelle</div><div style="font-weight:600;color:var(--orange)">' + fmtEur(commMensComm) + '</div></div>' +
            '<div><div style="color:var(--text-secondary);font-size:11px">Total ce mois</div><div style="font-weight:700;color:var(--green)">' + fmtEur(totalCommComm) + '</div></div>' +
            '</div></div>';
        }).join('') +
        '</div>';
    }
  }

  // ── Historique
  try {
    const byMonth = {};
    _revAllSetups.forEach(s => {
      if (!byMonth[s.mois]) byMonth[s.mois] = { setupHTVA:0, comm:0 };
      byMonth[s.mois].setupHTVA += parseFloat(s.montant_htva)||0;
      byMonth[s.mois].comm += parseFloat(s.commission)||0;
    });
    const now = new Date();
    const currentMois = now.getFullYear() + '-' + String(now.getMonth()+1).padStart(2,'0');
    if (!byMonth[currentMois]) byMonth[currentMois] = { setupHTVA: setupsHTVA, comm: totalComm };
    const allMonths = [...new Set([currentMois, ...Object.keys(byMonth)])].sort().reverse();
    document.getElementById('rev-history-tbody').innerHTML = allMonths.map(m => {
      const d = byMonth[m] || { setupHTVA:0, comm:0 };
      const isC = m === currentMois;
      const mrrDisp = isC ? fmtEur(mrrHTVA) : '-';
      const setupDisp = isC ? fmtEur(setupsHTVA) : fmtEur(d.setupHTVA);
      const commDisp = isC ? fmtEur(totalComm) : fmtEur(d.comm);
      const netDisp = isC ? '<span style="color:var(--green);font-weight:700">' + fmtEur(netFlorian) + '</span>' : '-';
      const clientCount = isC ? activeClients.length : '-';
      return '<tr><td class="fw700">' + formatMois(m) + (isC?' <span style="font-size:10px;background:var(--green);color:#fff;padding:1px 6px;border-radius:8px">En cours</span>':'') + '</td>' +
        '<td>' + clientCount + '</td><td>' + mrrDisp + '</td><td>' + setupDisp + '</td><td>' + commDisp + '</td><td>' + netDisp + '</td></tr>';
    }).join('') || '<tr><td colspan="6" style="text-align:center;color:var(--text-secondary)">Aucune donnée</td></tr>';
  } catch(e) {
    document.getElementById('rev-history-tbody').innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--text-secondary)">Erreur chargement</td></tr>';
  }
}

async function toggleClientActif(contactId, currentActif) {
  const newActif = !currentActif;
  const label = newActif ? 'activer' : 'désactiver';
  if (!confirm('Voulez-vous ' + label + ' ce client ? Cela affectera le MRR calculé.')) return;
  try {
    await sbFetch('/rest/v1/contacts?id=eq.' + contactId, {
      method: 'PATCH',
      headers: { 'Prefer': 'return=minimal' },
      body: JSON.stringify({ actif: newActif, updated_at: new Date().toISOString() })
    });
    const idx = allContacts.findIndex(c => c.id === contactId);
    if (idx !== -1) allContacts[idx].actif = newActif;
    showToast((newActif ? 'Client activé' : 'Client désactivé') + ' avec succès', 'success');
    openContactDetail(contactId);
  } catch(e) {
    showToast('Erreur: ' + e.message, 'error');
  }
}

// ===== COMMERCIAUX (admin) =====
// ═══════════════════════════════════════════════════════════════════════════
// ONBOARDING
// ═══════════════════════════════════════════════════════════════════════════
async function loadOnboarding() {
  const el = document.getElementById('onboarding-list');
  el.innerHTML = '<div class="loading-center"><span class="spinner spinner-dark"></span></div>';
  try {
    const contacts = await sbFetch('/rest/v1/contacts?source=eq.questionnaire&order=created_at.desc&select=*') || [];
    if (!contacts.length) {
      el.innerHTML = '<div class="empty-state"><div style="font-size:2.5rem;margin-bottom:12px">📭</div><p>Aucun questionnaire reçu pour l\'instant.</p><p style="font-size:12px;color:var(--text-light);margin-top:4px">Les questionnaires remplis sur seolia.be/questionnaire apparaîtront ici.</p></div>';
      return;
    }
    let html = '';
    // Store parsed data by contact id for brief generation
    if (!window._onboardingData) window._onboardingData = {};

    contacts.forEach((c, idx) => {
      let data = {};
      try {
        const notes = c.notes_generales || '';
        if (notes.startsWith('[QUESTIONNAIRE_ONBOARDING]')) {
          data = JSON.parse(notes.replace('[QUESTIONNAIRE_ONBOARDING]\n', ''));
        }
      } catch(e) {}
      window._onboardingData[c.id] = data;

      const date = new Date(c.created_at).toLocaleDateString('fr-BE', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' });
      const tierBadgeColor = {
        'essentiel-ia': '#0ea5e9',
        'business-ia': '#f59e0b',
        'premium-ia': '#8b5cf6',
        'web-essentiel': '#6b7280',
        'web-business': '#6b7280',
      }[data.tier] || '#6b7280';

      html += `<div style="background:#fff;border:1px solid #e5e7eb;border-radius:14px;padding:22px 24px;margin-bottom:16px;">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap;">
          <div style="flex:1;min-width:200px;">
            <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;flex-wrap:wrap;">
              <span style="font-size:18px;font-weight:800;color:var(--navy)">${c.entreprise || c.nom || 'Sans nom'}</span>
              <span style="background:${tierBadgeColor};color:#fff;font-size:10px;font-weight:700;padding:3px 10px;border-radius:50px">${data.formule || 'Formule non précisée'}</span>
            </div>
            <div style="display:flex;gap:16px;font-size:12px;color:var(--text-light);flex-wrap:wrap;">
              <span>&#x1F4C5; ${date}</span>
              ${c.telephone ? `<span>&#x1F4F1; ${c.telephone}</span>` : ''}
              ${c.email ? `<span>&#x1F4E7; ${c.email}</span>` : ''}
              ${data.zone_intervention ? `<span>&#x1F4CD; ${data.zone_intervention}</span>` : ''}
              ${data.secteur ? `<span>&#x1F527; ${data.secteur}</span>` : ''}
            </div>
          </div>
          <div style="display:flex;gap:8px;flex-shrink:0;flex-wrap:wrap;">
            <button onclick="copyBriefById('${c.id}')" style="background:var(--green);color:#0a0e1a;border:none;border-radius:8px;padding:9px 16px;font-size:12px;font-weight:700;cursor:pointer;display:flex;align-items:center;gap:6px;" id="brief-btn-${c.id}">&#x1F4CB; Copier brief Tasklet</button>
            <button onclick="showView('contacts');setTimeout(()=>{const r=allContacts.find(x=>x.id==='${c.id}');if(r)openContactDetail(r)},600)" style="background:#f1f5f9;color:var(--navy);border:none;border-radius:8px;padding:9px 14px;font-size:12px;font-weight:600;cursor:pointer;">Voir fiche</button>
          </div>
        </div>
        ${data.question_speciale ? `<div style="margin-top:12px;background:#fef3c7;border-radius:8px;padding:10px 14px;font-size:12px;"><strong>&#x26A0; Note :</strong> ${data.question_speciale}</div>` : ''}
        ${data.delai ? `<div style="margin-top:8px;font-size:11px;color:var(--text-light)">Délai : <strong>${data.delai}</strong></div>` : ''}
      </div>`;
    });
    el.innerHTML = `<p style="font-size:13px;color:var(--text-light);margin-bottom:16px">${contacts.length} questionnaire(s) reçu(s)</p>` + html;
  } catch(err) {
    el.innerHTML = `<div class="empty-state"><p style="color:red">Erreur: ${err.message}</p></div>`;
  }
}

function generateBriefText(data) {
  const f = (v) => (Array.isArray(v) ? v.join(', ') : (v || '—'));
  const tier = data.tier || '';
  const isIA = ['essentiel-ia','business-ia','premium-ia'].includes(tier);
  const isBusiness = ['business-ia','premium-ia'].includes(tier);
  const isPremium = tier === 'premium-ia';

  let tierLabel = 'Essentiel';
  if (tier === 'business-ia') tierLabel = 'Business';
  if (tier === 'premium-ia') tierLabel = 'Premium';
  if (tier === 'web-essentiel') tierLabel = 'Web Essentiel';
  if (tier === 'web-business') tierLabel = 'Web Business';

  const date = data.submitted_at ? new Date(data.submitted_at).toLocaleDateString('fr-BE') : new Date().toLocaleDateString('fr-BE');

  let brief = `╔══════════════════════════════════════════════════════════╗
║  BRIEF SEOLIA — CRÉATION SITE                            ║
╚══════════════════════════════════════════════════════════╝

📋 CLIENT    : ${f(data.nom_entreprise)}
📦 FORMULE   : ${f(data.formule)}
📅 SOUMIS LE : ${date}
⏰ DÉLAI     : ${f(data.delai)}

━━━ ENTREPRISE ━━━
Nom         : ${f(data.nom_entreprise)}
Téléphone   : ${f(data.telephone)}
Email       : ${f(data.email)}
TVA         : ${f(data.tva)}
Adresse     : ${f(data.adresse)}
Zone        : ${f(data.zone_intervention)}
Créée en    : ${f(data.annee_creation)}
Effectif    : ${f(data.nb_employes)}

━━━ ACTIVITÉ ━━━
Secteur     : ${f(data.secteur)}${data.secteur_autre ? ' — ' + data.secteur_autre : ''}
Services    : ${f(data.services_liste)}
Phare       : ${f(data.service_phare)}
Urgences    : ${f(data.urgences)}
Certifs     : ${f(data.certifications)}
Avantages   : ${f(data.avantages)}
Concurrents : ${f(data.concurrents)}

━━━ IDENTITÉ VISUELLE ━━━
Logo        : ${f(data.logo)}
Couleurs    : ${f(data.couleurs)}
Style       : ${f(data['style[]'] || data.style)}
Inspiration : ${f(data.sites_inspiration)}
Photos      : ${f(data.photos)}
Avant/après : ${f(data.photos_avant_apres)}

━━━ CONTENU ━━━
Présentation: ${f(data.presentation)}
Expérience  : ${f(data.annees_experience)} ans
Chantiers   : ${f(data.nb_chantiers)}
Témoignages : ${f(data.temoignages)}
Chiffres    : ${f(data.chiffres_cles)}
Labels      : ${f(data.labels)}
Slogan      : ${f(data.slogan)}
Histoire    : ${f(data.histoire)}

━━━ TARIFS ━━━
Affichage   : ${f(data.afficher_tarifs)}
Détails     : ${f(data.tarifs_details)}
Devis gratu : ${f(data.devis_gratuit)}

━━━ SEO ━━━
Site actuel : ${f(data.site_existant)} ${data.url_actuel ? '— ' + data.url_actuel : ''}
Google Biz  : ${f(data.google_business)}
Avis Google : ${f(data.nb_avis)} (note : ${f(data.note_google)})
Mots-clés   : ${f(data.mots_cles)}
Communes    : ${f(data.communes_seo)}

━━━ TECHNIQUE ━━━
Domaine     : ${f(data.domaine_existant)} ${data.nom_domaine ? '— ' + data.nom_domaine : ''}
Email pro   : ${f(data.email_pro_souhaite)}
Réseaux     : ${f(data.reseaux_sociaux)}
RDV ligne   : ${f(data.rdv_en_ligne)}
Horaires    : ${f(data.horaires)}
`;

  if (isIA) {
    brief += `
━━━ IA — CHATBOT & AVIS GOOGLE ━━━
Langues     : ${f(data['langues_clients[]'] || data.langues_clients)}
FAQ chatbot : ${f(data.faq_questions)}
Ton IA      : ${f(data.ton_ia)}
Notif email : ${f(data.notif_email_chatbot)}
Auto-avis   : ${f(data.auto_avis_google)}
Lien Google : ${f(data.lien_google_business)}
`;
  }

  if (isBusiness) {
    brief += `
━━━ IA — RDV & AUTOMATISATION ━━━
Outil RDV   : ${f(data.outil_rdv)}
Types RDV   : ${f(data.types_rdv)}
Services IA : ${f(data.types_services_chatbot)}
Notif email : ${f(data.notif_email_commandes)}
Notif SMS   : ${f(data.notif_sms)}
Infos RDV   : ${f(data.infos_rdv_requises)}
`;
  }

  if (isPremium) {
    brief += `
━━━ IA — AGENT VOCAL & DASHBOARD ━━━
Nom agent   : ${f(data.nom_agent_vocal)}
Voix        : ${f(data.voix_agent)}
Types appels: ${f(data.types_appels)}
Escalade    : ${f(data.escalade_agent)}
Transfert   : ${f(data.numero_transfert)}
WhatsApp    : ${f(data.whatsapp_agent)} ${data.whatsapp_numero ? '— ' + data.whatsapp_numero : ''}
KPIs        : ${f(data['kpis[]'] || data.kpis)}
Rapport à   : ${f(data.rapport_email)}
`;
  }

  brief += `
━━━ DIVERS ━━━
Article blog: ${f(data.sujet_article)}
Demande     : ${f(data.question_speciale)}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
INSTRUCTIONS POUR TASKLET
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Créer un site ${tierLabel} pour "${f(data.nom_entreprise)}".
Secteur : ${f(data.secteur)} | Zone : ${f(data.zone_intervention)}
Style   : ${f(data['style[]'] || data.style)}
Délai   : ${f(data.delai)}

Référence technique : /agent/home/offre-web-liege/specifications-techniques-v2.html (tier ${tierLabel})
`;

  return brief;
}

function copyBriefById(contactId) {
  const data = (window._onboardingData || {})[contactId] || {};
  const brief = generateBriefText(data);
  const btn = document.getElementById('brief-btn-' + contactId);
  navigator.clipboard.writeText(brief).then(() => {
    if (btn) {
      btn.innerHTML = '&#x2705; Copié !';
      btn.style.background = '#059669';
      setTimeout(() => {
        btn.innerHTML = '&#x1F4CB; Copier brief Tasklet';
        btn.style.background = 'var(--green)';
      }, 2500);
    }
  }).catch(() => {
    // Fallback: text area modal
    const w = window.open('', '_blank', 'width=750,height=620');
    w.document.write(`<html><head><title>Brief Tasklet — ${data.nom_entreprise || 'Client'}</title></head><body style="margin:0;padding:12px;font-family:monospace;background:#0a0e1a;color:#fff"><h3 style="color:#00d68f;margin:0 0 8px">Brief Tasklet — ${data.nom_entreprise || ''}</h3><textarea id="t" style="width:100%;height:80vh;background:#141929;color:#fff;border:1px solid #333;padding:12px;font-family:monospace;font-size:12px;line-height:1.5">${brief}</textarea><br><button onclick="document.getElementById('t').select();document.execCommand('copy');document.title='✅ Copié !'" style="background:#00d68f;color:#000;border:none;padding:10px 24px;font-weight:700;cursor:pointer;border-radius:8px;margin-top:8px">Sélectionner & Copier</button>
  <!-- IMPORT CSV MODAL -->
  <div class="modal-overlay" id="modal-import-csv" style="display:none" onclick="if(event.target===this)closeModal('modal-import-csv')">
    <div class="modal" style="max-width:600px">
      <div class="modal-header">
        <div class="modal-title">⬆️ Importer des contacts CSV</div>
        <button class="modal-close" onclick="closeModal('modal-import-csv')">✕</button>
      </div>
      <div class="modal-body">
        <p style="font-size:13px;color:var(--text-light);margin-bottom:12px">
          Format attendu (colonnes): <code>nom, prenom, entreprise, telephone, email, ville, secteur, statut, assignee</code><br>
          La première ligne doit être l'en-tête. Statut: prospect/rdv/client/perdu. Assignee: email du commercial.
        </p>
        <div class="drop-zone" id="csv-drop-zone" onclick="document.getElementById('csv-file-input').click()">
          <div class="drop-zone-icon">📄</div>
          <p>Cliquez ou glissez votre fichier CSV ici</p>
          <p style="margin-top:4px;font-size:11px">Fichier .csv uniquement</p>
        </div>
        <input type="file" id="csv-file-input" accept=".csv" style="display:none" onchange="handleCSVFile(event)">
        <div id="csv-preview-section" style="display:none;margin-top:16px">
          <div style="font-size:13px;font-weight:600;margin-bottom:8px" id="csv-preview-title"></div>
          <div style="overflow-x:auto"><table class="csv-preview-table" id="csv-preview-table"></table></div>
          <div style="margin-top:12px;display:flex;gap:8px;align-items:center">
            <button class="btn btn-green" onclick="doImportCSV()" id="btn-do-import">Importer</button>
            <button class="btn btn-ghost" onclick="document.getElementById('csv-preview-section').style.display='none'">Annuler</button>
            <span id="csv-import-progress" style="font-size:13px;color:var(--text-light)"></span>
          </div>
        </div>
      </div>
    </div>
  </div>

</body></html>`);
  });
}

async function loadCommerciaux() {
  const el = document.getElementById('commerciaux-list');
  el.innerHTML = '<div class="loading-center"><span class="spinner spinner-dark"></span></div>';
  try {
    const profiles = await sbFetch('/rest/v1/profiles?role=eq.commercial&order=nom.asc&select=*') || [];
    allProfiles = await sbFetch('/rest/v1/profiles?select=*&order=nom.asc') || [];
    const clients = allContacts.filter(c => c.statut === 'client');
    el.innerHTML = '<div class="table-wrap"><table>' +
      '<thead><tr><th>Nom</th><th>Email</th><th>Taux commission</th><th>Clients actifs</th><th>MRR généré</th><th>Objectif mensuel</th><th>Statut</th><th>Actions</th></tr></thead>' +
      '<tbody>' + profiles.map(p => {
        const myClients = clients.filter(c => c.created_by === p.email || c.assignee === p.nom);
        const mrr = myClients.reduce((s,c) => s+(parseFloat(c.prix_mensuel)||0),0);
        return '<tr>' +
          '<td class="fw700">' + esc(p.nom) + '</td>' +
          '<td>' + esc(p.email) + '</td>' +
          '<td>' + ((parseFloat(p.taux_commission)||0.35)*100).toFixed(0) + '%' +
          '<button class="action-btn" onclick="editCommissionRate(\'' + p.id + '\',' + (parseFloat(p.taux_commission)||0.35) + ')">✏️</button></td>' +
          '<td>' + myClients.length + '</td>' +
          '<td>' + fmtEur(mrr) + '</td>' +
          (function() {
            const now = new Date();
            const moisKey = now.getFullYear() + '-' + String(now.getMonth()+1).padStart(2,'0');
            // Count new clients signed this month by this commercial
            const signesThisMonth = allContacts.filter(c =>
              c.statut === 'client' &&
              (c.assignee === p.nom) &&
              c.updated_at && c.updated_at.startsWith(moisKey)
            ).length;
            const objectif = parseInt(p.objectif_mensuel) || 5;
            const pct = Math.min(100, Math.round((signesThisMonth / objectif) * 100));
            const color = pct >= 100 ? '#00d68f' : pct >= 60 ? '#f5a623' : '#e74c3c';
            return '<td>' +
              '<div style="display:flex;align-items:center;gap:8px">' +
              '<div style="flex:1;background:#f0f1f5;border-radius:20px;height:8px;overflow:hidden;min-width:80px">' +
              '<div style="width:' + pct + '%;height:100%;background:' + color + ';border-radius:20px;transition:width .3s"></div>' +
              '</div>' +
              '<span style="font-size:12px;font-weight:700;color:' + color + ';white-space:nowrap">' + signesThisMonth + '/' + objectif + '</span>' +
              '<button class="action-btn" title="Modifier objectif" onclick="editObjectif(\'' + p.id + '\',' + objectif + ')">✏️</button>' +
              '</div></td>';
          })() +
          '<td><span class="badge ' + (p.actif ? 'badge-client' : 'badge-perdu') + '">' + (p.actif?'Actif':'Inactif') + '</span></td>' +
          '<td><button class="btn btn-ghost btn-sm" onclick="toggleCommercialActif(\'' + p.id + '\',' + p.actif + ')">' + (p.actif?'Désactiver':'Activer') + '</button></td>' +
          '</tr>';
      }).join('') + '</tbody></table></div>';
  } catch(e) {
    el.innerHTML = '<p class="text-muted">Erreur: ' + e.message + '</p>';
  }
}

async function editObjectif(id, currentObjectif) {
  const newVal = prompt('Objectif mensuel (nombre de signatures) :', currentObjectif);
  if (newVal === null) return;
  const val = parseInt(newVal);
  if (isNaN(val) || val < 1 || val > 100) { showToast('Valeur invalide (1-100)', 'error'); return; }
  try {
    await sbFetch('/rest/v1/profiles?id=eq.' + id, {
      method: 'PATCH', headers: { 'Prefer': 'return=minimal' },
      body: JSON.stringify({ objectif_mensuel: val })
    });
    showToast('Objectif mis à jour : ' + val + ' signatures/mois', 'success');
    loadCommerciaux();
  } catch(e) { showToast('Erreur: ' + e.message, 'error'); }
}

async function toggleCommercialActif(id, current) {
  try {
    await sbFetch('/rest/v1/profiles?id=eq.' + id, {
      method: 'PATCH', headers: { 'Prefer': 'return=minimal' },
      body: JSON.stringify({ actif: !current })
    });
    showToast('Statut mis à jour', 'success');
    loadCommerciaux();
  } catch(e) { showToast('Erreur: ' + e.message, 'error'); }
}

async function editCommissionRate(id, currentRate) {
  const newRate = prompt('Nouveau taux de commission (%):', (currentRate*100).toFixed(0));
  if (newRate === null) return;
  const rate = parseFloat(newRate) / 100;
  if (isNaN(rate) || rate < 0 || rate > 1) { showToast('Taux invalide', 'error'); return; }
  try {
    await sbFetch('/rest/v1/profiles?id=eq.' + id, {
      method: 'PATCH', headers: { 'Prefer': 'return=minimal' },
      body: JSON.stringify({ taux_commission: rate })
    });
    showToast('Taux mis à jour', 'success');
    loadCommerciaux();
  } catch(e) { showToast('Erreur: ' + e.message, 'error'); }
}

function openAddCommercialModal() {
  document.getElementById('comm-nom').value = '';
  document.getElementById('comm-email').value = '';
  document.getElementById('comm-taux').value = '35';
  openModal('modal-commercial');
}

async function saveCommercial() {
  const nom = document.getElementById('comm-nom').value.trim();
  const email = document.getElementById('comm-email').value.trim();
  const taux = parseFloat(document.getElementById('comm-taux').value) / 100;
  if (!nom || !email) { showToast('Nom et email requis', 'error'); return; }
  try {
    await sbFetch('/rest/v1/profiles', {
      method: 'POST', headers: { 'Prefer': 'return=minimal' },
      body: JSON.stringify({ nom, email, role: 'commercial', taux_commission: taux, actif: true })
    });
    showToast('Commercial ajouté', 'success');
    closeModal('modal-commercial');
    loadCommerciaux();
  } catch(e) { showToast('Erreur: ' + e.message, 'error'); }
}

// ===== COMPOSE EMAIL =====
function openComposeModal() {
  const contact = allContacts.find(c => c.id === currentContactId);
  document.getElementById('email-to').value = contact?.email || '';
  document.getElementById('email-subject').value = '';
  document.getElementById('email-body').value = '';
  openModal('modal-email');
}

async function sendEmail() {
  const to = document.getElementById('email-to').value.trim();
  const subject = document.getElementById('email-subject').value.trim();
  const body = document.getElementById('email-body').value.trim();
  const btn = document.getElementById('btn-send-email');
  if (!to || !subject || !body) { showToast('Tous les champs sont requis', 'error'); return; }
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Envoi...';
  try {
    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': BREVO_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sender: { name: 'Seolia', email: BREVO_FROM },
        to: [{ email: to }],
        subject: subject,
        htmlContent: '<p>' + body.replace(/\n/g,'<br>') + '</p>'
      })
    });
    if (!res.ok) throw new Error('Erreur Brevo ' + res.status);
    // Log to emails table
    try {
      await sbFetch('/rest/v1/emails', {
        method: 'POST', headers: { 'Prefer': 'return=minimal' },
        body: JSON.stringify({
          contact_id: currentContactId,
          direction: 'outbound',
          from_email: BREVO_FROM,
          to_email: to,
          subject: subject,
          body: body,
          read: true,
          created_at: new Date().toISOString()
        })
      });
    } catch(e) {}
    showToast('Email envoyé !', 'success');
    closeModal('modal-email');
  } catch(e) {
    showToast('Erreur envoi: ' + e.message, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = 'Envoyer';
  }
}

// ===== MODAL HELPERS =====
function openModal(id) { document.getElementById(id).classList.add('open'); }
function closeModal(id) { document.getElementById(id).classList.remove('open'); }

// Close modal on overlay click
document.querySelectorAll('.modal-overlay').forEach(overlay => {
  overlay.addEventListener('click', e => {
    if (e.target === overlay) overlay.classList.remove('open');
  });
});

// ===== TOAST =====
function showToast(msg, type='success') {
  const el = document.createElement('div');
  el.className = 'toast ' + type;
  el.textContent = msg;
  document.getElementById('toast-container').appendChild(el);
  setTimeout(() => el.remove(), 3500);
}

function copyPhone(phone, event) {
  event.stopPropagation();
  navigator.clipboard.writeText(phone).catch(function() {});
  var toast = document.createElement('div');
  toast.className = 'toast toast-phone-copy';
  toast.textContent = 'Numéro copié !';
  document.getElementById('toast-container').appendChild(toast);
  setTimeout(function() { toast.remove(); }, 2000);
}

// ===== HELPERS =====
function esc(str) {
  if (!str) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
function fmtEur(n) {
  if (n === null || n === undefined || isNaN(n)) return '-';
  return new Intl.NumberFormat('fr-BE', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2 }).format(n);
}
function formatDate(d) {
  if (!d) return '-';
  const dt = new Date(d);
  if (isNaN(dt)) return d;
  return dt.toLocaleDateString('fr-BE', { day:'2-digit', month:'2-digit', year:'numeric' });
}
function formatDateTime(d) {
  if (!d) return '-';
  const dt = new Date(d);
  if (isNaN(dt)) return d;
  return dt.toLocaleDateString('fr-BE', { day:'2-digit', month:'2-digit', year:'numeric' }) + ' ' +
    dt.toLocaleTimeString('fr-BE', { hour:'2-digit', minute:'2-digit' });
}
function formatMois(m) {
  if (!m) return '-';
  const [y, mo] = m.split('-');
  const d = new Date(parseInt(y), parseInt(mo)-1, 1);
  return d.toLocaleString('fr', { month:'long', year:'numeric' });
}
function noteTypeIcon(type) {
  const icons = { appel:'📞', rdv:'📅', email:'📧', whatsapp:'💬', note:'📝' };
  return icons[type] || '📝';
}
function noteTypeLabel(type) {
  const labels = { appel:'Appel', rdv:'RDV', email:'Email', whatsapp:'WhatsApp', note:'Note' };
  return labels[type] || 'Note';
}

// ===== STARTUP =====
(async () => {
  const savedToken = localStorage.getItem('seolia_token');
  const savedUser = localStorage.getItem('seolia_user');
  if (savedToken && savedUser) {
    try {
      currentToken = savedToken;
      currentUser = JSON.parse(savedUser);
      // Verify token is valid by fetching profile
      const profiles = await sbFetch('/rest/v1/profiles?email=eq.' + encodeURIComponent(currentUser.email) + '&select=*');
      if (profiles && profiles.length > 0) {
        currentProfile = profiles[0];
        if (currentProfile.actif) {
          document.getElementById('login-screen').style.display = 'none';
          document.getElementById('app').style.display = 'block';
          document.getElementById('user-name-display').textContent = currentProfile.nom || currentUser.email;
          const badge = document.getElementById('user-role-badge');
          badge.textContent = currentProfile.role === 'admin' ? 'Admin' : 'Commercial';
          badge.className = 'role-badge ' + (currentProfile.role === 'admin' ? 'admin' : 'commercial');
          buildNav();
          await loadContacts();
          showView('dashboard');
          initNotifications();
          return;
        }
      }
    } catch(e) {}
    doLogout();
  }
})();

function autoFillFormule(val) {
  const map = {
    'Web Essentiel':      { setup: 149, mensuel: 69 },
    'Web Business':       { setup: 299, mensuel: 119 },
    'Web Premium':        { setup: 499, mensuel: 199 },
    'Essentiel IA':            { setup: 499, mensuel: 109 },
    'Business IA':             { setup: 949, mensuel: 249 },
    'Premium IA':              { setup: 1499, mensuel: 449 },
    'Bundle Essentiel IA':     { setup: 499, mensuel: 109 },
    'Bundle Business IA':      { setup: 949, mensuel: 249 },
    'Bundle Premium IA':       { setup: 1499, mensuel: 449 },
  };
  if (map[val]) {
    // Formulaire création (cf-)
    const cs = document.getElementById('cf-setup');
    const cm = document.getElementById('cf-mensuel');
    if (cs) cs.value = map[val].setup;
    if (cm) cm.value = map[val].mensuel;
    // Formulaire édition fiche (dif-)
    const ds = document.getElementById('dif-setup');
    const dm = document.getElementById('dif-mensuel');
    if (ds) ds.value = map[val].setup;
    if (dm) dm.value = map[val].mensuel;
  }
}

// ===== DETAIL COMMERCIAL (modal) =====
async function showCommercialDetail(email) {
  const now = new Date();
  const moisKey = now.getFullYear() + '-' + String(now.getMonth()+1).padStart(2,'0');
  const profile = allProfiles.find(p => p.email === email);
  if (!profile) return;
  const taux = parseFloat(profile.taux_commission) || TAUX_COMMISSION;

  document.getElementById('modal-comm-detail').style.display = 'block';
  document.getElementById('comm-detail-name').textContent = profile.nom;
  document.getElementById('comm-detail-sub').textContent = 'Taux de commission : ' + Math.round(taux*100) + '% HTVA';
  document.getElementById('comm-detail-body').innerHTML = '<div style="color:#999;text-align:center;padding:32px">Chargement...</div>';

  const clients = allContacts.filter(c => c.statut === 'client' && (c.created_by === email || c.assignee === profile.nom));
  
  // Setup history
  let allSetups = [];
  try {
    allSetups = await sbFetch('/rest/v1/commission_history?commercial_email=eq.' + encodeURIComponent(email) + '&type=eq.setup&order=mois.desc&select=*') || [];
  } catch(e) {}

  const setupsThisMonth = allSetups.filter(s => s.mois === moisKey);
  const setupComm = setupsThisMonth.reduce((s,c) => s+(parseFloat(c.commission)||0), 0);
  const setupTVAC = setupsThisMonth.reduce((s,c) => s+(parseFloat(c.montant_tvac)||0), 0);

  const mrr_tvac = clients.reduce((s,c) => s+(parseFloat(c.prix_mensuel)||0), 0);
  const mrr_htva = mrr_tvac / TVA_RATE;
  const commMens = mrr_htva * taux;
  const totalComm = commMens + setupComm;

  // Summary cards
  let html = '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:24px">';
  const cards = [
    { label: 'Clients actifs', value: clients.length, green: false },
    { label: 'MRR HTVA généré', value: fmtEur(mrr_htva), green: false },
    { label: 'Commission mensuelle', value: fmtEur(commMens), green: false },
    { label: 'Commission setup ce mois', value: fmtEur(setupComm), green: false },
    { label: 'Total à payer ce mois', value: fmtEur(totalComm), green: true },
  ];
  cards.forEach(c => {
    html += '<div style="background:' + (c.green ? 'linear-gradient(135deg,#0a1628,#1a3a6b)' : '#f5f6fa') + ';border-radius:12px;padding:16px">' +
      '<div style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.4px;color:' + (c.green ? 'rgba(255,255,255,.6)' : '#999') + ';margin-bottom:6px">' + c.label + '</div>' +
      '<div style="font-size:22px;font-weight:800;color:' + (c.green ? '#00d68f' : '#0a1628') + '">' + c.value + '</div>' +
    '</div>';
  });
  html += '</div>';

  // Clients list
  html += '<div style="font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:.4px;color:#999;margin-bottom:12px">Clients actifs</div>';
  if (clients.length === 0) {
    html += '<div style="color:#bbb;font-size:14px;padding:12px 0">Aucun client actif</div>';
  } else {
    html += '<table style="width:100%;border-collapse:collapse;font-size:13px">' +
      '<thead><tr style="border-bottom:2px solid #e8eaf0">' +
      '<th style="text-align:left;padding:8px 4px;font-weight:700">Client</th>' +
      '<th style="text-align:left;padding:8px 4px;font-weight:700">Formule</th>' +
      '<th style="text-align:right;padding:8px 4px;font-weight:700">Mensuel HTVA</th>' +
      '<th style="text-align:right;padding:8px 4px;font-weight:700;color:#00d68f">Commission</th>' +
      '</tr></thead><tbody>';
    clients.forEach(c => {
      const mens_htva = (parseFloat(c.prix_mensuel)||0) / TVA_RATE;
      const comm = mens_htva * taux;
      html += '<tr style="border-bottom:1px solid #f0f0f0">' +
        '<td style="padding:10px 4px;font-weight:600">' + esc(c.nom) + '</td>' +
        '<td style="padding:10px 4px;color:#666">' + esc(c.formule||'-') + '</td>' +
        '<td style="padding:10px 4px;text-align:right">' + fmtEur(mens_htva) + '</td>' +
        '<td style="padding:10px 4px;text-align:right;font-weight:700;color:#00d68f">' + fmtEur(comm) + '/mois</td>' +
        '</tr>';
    });
    html += '</tbody></table>';
  }

  // Setup history by month
  html += '<div style="font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:.4px;color:#999;margin:24px 0 12px">Historique setups signés</div>';
  if (allSetups.length === 0) {
    html += '<div style="color:#bbb;font-size:14px;padding:12px 0">Aucun setup enregistré</div>';
  } else {
    // Group by month
    const byMonth = {};
    allSetups.forEach(s => {
      if (!byMonth[s.mois]) byMonth[s.mois] = [];
      byMonth[s.mois].push(s);
    });
    Object.keys(byMonth).sort().reverse().forEach(m => {
      const rows = byMonth[m];
      const monthTotal = rows.reduce((s,r) => s+(parseFloat(r.commission)||0), 0);
      html += '<div style="background:#f5f6fa;border-radius:10px;padding:14px;margin-bottom:10px">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">' +
        '<span style="font-weight:700;color:#0a1628">' + formatMois(m) + '</span>' +
        '<span style="font-weight:800;color:#00d68f">' + fmtEur(monthTotal) + ' comm.</span>' +
        '</div>';
      rows.forEach(r => {
        html += '<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-top:1px solid #e8eaf0;font-size:12px">' +
          '<span style="color:#333">' + esc(r.contact_nom||'-') + '</span>' +
          '<span style="color:#666">' + fmtEur(r.montant_tvac) + ' TVAC → <b style="color:#00d68f">' + fmtEur(r.commission) + '</b></span>' +
          '</div>';
      });
      html += '</div>';
    });
  }

  document.getElementById('comm-detail-body').innerHTML = html;
}

function closeCommDetail() {
  document.getElementById('modal-comm-detail').style.display = 'none';
}

// ════════════════════════════════════════════════════════════════
//  SYSTÈME DE NOTIFICATIONS — Nouveaux leads (chatbot / formulaire)
// ════════════════════════════════════════════════════════════════
let notifLastCheck = null;     // ISO string de la dernière vérification
let notifUnread = [];          // leads non lus
let notifPollingInterval = null;

function initNotifications() {
  // Afficher la cloche (visible une fois connecté)
  document.getElementById('notif-wrapper').style.display = 'block';
  // Marquer comme "déjà vu" tout ce qui existe avant maintenant
  notifLastCheck = new Date().toISOString();
  // Polling toutes les 30 secondes
  pollNewLeads();
  notifPollingInterval = setInterval(pollNewLeads, 30000);
  // Fermer panel si clic ailleurs
  document.addEventListener('click', function(e) {
    const panel = document.getElementById('notif-panel');
    const wrapper = document.getElementById('notif-wrapper');
    if (panel && wrapper && !wrapper.contains(e.target)) {
      panel.classList.remove('open');
    }
  });
}

async function pollNewLeads() {
  if (!currentToken || !notifLastCheck) return;
  try {
    const since = encodeURIComponent(notifLastCheck);
    const data = await sbFetch(
      `/rest/v1/contacts?source=in.("chatbot","formulaire")&created_at=gt.${since}&select=id,nom,telephone,secteur,source,created_at&order=created_at.desc`
    );
    if (!data || !Array.isArray(data) || data.length === 0) return;

    // Mettre à jour le timestamp
    notifLastCheck = new Date().toISOString();

    // Ajouter aux non-lus
    data.forEach(lead => {
      if (!notifUnread.find(n => n.id === lead.id)) {
        notifUnread.unshift(lead);
        // Toast cliquable
        showLeadToast(lead);
      }
    });

    // Mettre à jour le badge
    updateNotifBadge();
    renderNotifList();
  } catch (_) { /* silencieux */ }
}

function showLeadToast(lead) {
  const sourceLabel = lead.source === 'chatbot' ? '💬 Chatbot' : '📋 Formulaire';
  const el = document.createElement('div');
  el.className = 'toast lead';
  el.innerHTML = `<strong>${sourceLabel}</strong><br>${esc(lead.nom)} — ${esc(lead.telephone || '')}`;
  el.onclick = () => {
    openContact(lead.id);
    el.remove();
  };
  document.getElementById('toast-container').appendChild(el);
  setTimeout(() => { if (el.parentNode) el.remove(); }, 6000);
}

function updateNotifBadge() {
  const badge = document.getElementById('notif-badge');
  const count = notifUnread.length;
  if (count > 0) {
    badge.textContent = count > 9 ? '9+' : count;
    badge.classList.add('visible', 'pulse');
  } else {
    badge.classList.remove('visible', 'pulse');
  }
}

function renderNotifList() {
  const list = document.getElementById('notif-list');
  if (!notifUnread.length) {
    list.innerHTML = '<div class="notif-empty">Aucun nouveau lead</div>';
    return;
  }
  list.innerHTML = notifUnread.map(lead => {
    const icon = lead.source === 'chatbot' ? '💬' : '📋';
    const date = new Date(lead.created_at).toLocaleString('fr-BE', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' });
    const secteur = lead.secteur ? ` · ${esc(lead.secteur)}` : '';
    return `<div class="notif-item" onclick="openContact('${lead.id}'); toggleNotifPanel();">
      <div class="notif-icon">${icon}</div>
      <div class="notif-content">
        <div class="notif-name">${esc(lead.nom)}</div>
        <div class="notif-detail">${esc(lead.telephone || 'Pas de tél')}${secteur} · ${date}</div>
      </div>
    </div>`;
  }).join('');
}

function toggleNotifPanel() {
  const panel = document.getElementById('notif-panel');
  const btn = document.querySelector('.notif-btn');
  const isOpen = panel.classList.contains('open');
  if (!isOpen) {
    const rect = btn.getBoundingClientRect();
    const panelW = 290;
    // Positionner à droite du bouton, en évitant de sortir de l'écran
    let left = rect.right + 8;
    let top = rect.top;
    // Si ça dépasse à droite, mettre à gauche
    if (left + panelW > window.innerWidth - 8) left = rect.left - panelW - 8;
    // Si ça dépasse en bas, aligner par le bas
    if (top + 300 > window.innerHeight) top = window.innerHeight - 310;
    if (top < 8) top = 8;
    panel.style.left = left + 'px';
    panel.style.top = top + 'px';
  }
  panel.classList.toggle('open');
}

function markAllRead() {
  notifUnread = [];
  updateNotifBadge();
  renderNotifList();
  document.getElementById('notif-panel').classList.remove('open');
}

// initNotifications() est appelé depuis loadProfile() après le login

// ═══════════════════════════════════════════════════════════════════════════
// MOLLIE — PAIEMENT SECTION
// ═══════════════════════════════════════════════════════════════════════════
const WORKER_URL = 'https://seolia-ai-chat.seolia.workers.dev';

function loadDetailPaiement(contact) {
  const el = document.getElementById('detail-paiement');
  if (!el) return;
  el.innerHTML = renderPaiementSection(contact);
}

function renderPaiementSection(contact) {
  // Only visible to admin role
  if (currentProfile?.role !== 'admin') return '';

  const statut = contact.paiement_statut || 'non_configure';
  const pricing = {
    'Essentiel IA': { setup: '499', mensuel: '109' },
    'Business IA':  { setup: '949', mensuel: '249' },
    'Premium IA':   { setup: '1499', mensuel: '449' },
    'Web Essentiel':{ setup: '149', mensuel: '69' },
    'Web Business': { setup: '299', mensuel: '119' },
    'Web Premium':  { setup: '499', mensuel: '199' },
  };
  const p = pricing[contact.formule] || { setup: '499', mensuel: '109' };

  const statusLabels = {
    'non_configure': { label: '⚪ Non configuré', cls: 'non-configure' },
    'client_cree': { label: '🔵 Profil Mollie créé', cls: 'client-cree' },
    'mandat_en_cours': { label: '🟡 En attente signature SEPA', cls: 'mandat-en-cours' },
    'mandat_actif': { label: '🟢 Mandat SEPA actif', cls: 'mandat-actif' },
    'abonnement_actif': { label: '✅ Abonnement actif', cls: 'abonnement-actif' },
    'echec_paiement': { label: '🔴 Échec paiement', cls: 'echec' },
  };
  const s = statusLabels[statut] || statusLabels['non_configure'];

  const nomEsc = (contact.nom||'').replace(/\\/g,'\\\\').replace(/'/g,"\\'");
  const emailEsc = (contact.email||'').replace(/\\/g,'\\\\').replace(/'/g,"\\'");
  const formuleEsc = (contact.formule||'').replace(/\\/g,'\\\\').replace(/'/g,"\\'");
  const mollieCustomerId = contact.mollie_customer_id || '';
  const mollieMandateId = contact.mollie_mandate_id || '';

  let content = `
    <div class="paiement-card" id="paiement-section">
      <h4>💳 Paiement & Abonnement</h4>
      <div class="paiement-status ${s.cls}">${s.label}</div>`;

  if (statut === 'non_configure') {
    content += `
      <p style="font-size:13px;color:#64748b;margin:0 0 12px;">Créez d'abord le profil Mollie du client pour pouvoir générer un lien de paiement SEPA.</p>
      <div class="paiement-actions">
        <button class="btn-mollie btn-mollie-primary" onclick="mollieCreateCustomer(this, '${contact.id}', '${nomEsc}', '${emailEsc}')">
          + Créer profil Mollie
        </button>
      </div>`;
  } else if (statut === 'client_cree' || statut === 'echec_paiement') {
    content += `
      <div class="paiement-info-row"><label>Client Mollie</label><span style="font-size:11px;color:#64748b">${mollieCustomerId || '-'}</span></div>
      <p style="font-size:13px;color:#64748b;margin:12px 0 4px;">Montants à facturer :</p>
      <div class="paiement-amount-row">
        <div class="paiement-amount-field">
          <label>Setup (€ TVAC)</label>
          <input type="number" id="mol-setup-amt" value="${p.setup}" min="0" step="0.01" placeholder="ex: 499">
        </div>
        <div class="paiement-amount-field">
          <label>Mensuel (€ TVAC)</label>
          <input type="number" id="mol-mensuel-amt" value="${p.mensuel}" min="0" step="0.01" placeholder="ex: 109">
        </div>
      </div>
      <div class="paiement-actions">
        <button class="btn-mollie btn-mollie-green" onclick="mollieSetupPayment(this, '${contact.id}', '${mollieCustomerId}', '${formuleEsc}')">
          Générer lien paiement SEPA →
        </button>
      </div>`;
  } else if (statut === 'mandat_en_cours') {
    content += `
      <p style="font-size:13px;color:#64748b;margin:0 0 12px;">Lien envoyé au client — en attente de la signature du mandat SEPA.</p>
      <div id="mol-link-display"></div>
      <div class="paiement-actions">
        <button class="btn-mollie btn-mollie-copy" onclick="mollieSetupPayment(this, '${contact.id}', '${mollieCustomerId}', '${formuleEsc}')">
          🔁 Renvoyer un lien
        </button>
      </div>`;
  } else if (statut === 'mandat_actif') {
    content += `
      <div class="paiement-info-row"><label>Mandat SEPA</label><span style="color:#16a34a">✅ Signé</span></div>
      <div class="paiement-info-row"><label>Mandat ID</label><span style="font-size:11px;color:#64748b">${mollieMandateId || '-'}</span></div>
      <p style="font-size:13px;color:#64748b;margin:12px 0 4px;">Montant abonnement mensuel :</p>
      <div class="paiement-amount-row">
        <div class="paiement-amount-field">
          <label>Mensuel (€ TVAC)</label>
          <input type="number" id="mol-sub-amt" value="${p.mensuel}" min="0" step="0.01" placeholder="ex: 109">
        </div>
      </div>
      <div class="paiement-actions">
        <button class="btn-mollie btn-mollie-green" onclick="mollieCreateSubscription(this, '${contact.id}', '${mollieCustomerId}', '${mollieMandateId}', '${formuleEsc}')">
          ▶ Activer abonnement mensuel
        </button>
      </div>`;
  } else if (statut === 'abonnement_actif') {
    const startDate = contact.date_debut_abonnement
      ? new Date(contact.date_debut_abonnement).toLocaleDateString('fr-BE', { day: '2-digit', month: 'long', year: 'numeric' })
      : '-';
    const mollieSubId = contact.mollie_subscription_id || '-';
    content += `
      <div class="paiement-info-row"><label>Abonnement</label><span style="color:#16a34a">✅ Actif</span></div>
      <div class="paiement-info-row"><label>Mensuel</label><span>${p.mensuel}€/mois</span></div>
      <div class="paiement-info-row"><label>Début</label><span>${startDate}</span></div>
      <div class="paiement-info-row"><label>Sub. Mollie</label><span style="font-size:11px;color:#64748b">${mollieSubId}</span></div>`;
  }

  content += `</div>`;
  return content;
}

async function mollieCreateCustomer(btn, contactId, nom, email) {
  btn.disabled = true;
  btn.textContent = 'Création...';
  try {
    const res = await fetch(`${WORKER_URL}/mollie-create-customer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contact_id: contactId, nom, email }),
    });
    const data = await res.json();
    if (data.success) {
      showToast('✅ Profil Mollie créé !', 'success');
      await loadContact(contactId);
    } else {
      showToast('Erreur: ' + (data.error || 'Inconnue'), 'error');
      btn.disabled = false;
      btn.textContent = '+ Créer profil Mollie';
    }
  } catch (err) {
    showToast('Erreur réseau: ' + err.message, 'error');
    btn.disabled = false;
    btn.textContent = '+ Créer profil Mollie';
  }
}

async function mollieSetupPayment(btn, contactId, mollieCustomerId, formule) {
  const setupInput = document.getElementById('mol-setup-amt');
  const setupAmount = setupInput ? parseFloat(setupInput.value).toFixed(2) : null;
  btn.disabled = true;
  btn.textContent = 'Génération...';
  try {
    const res = await fetch(`${WORKER_URL}/mollie-setup-payment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contact_id: contactId,
        mollie_customer_id: mollieCustomerId,
        formule,
        setup_amount: setupAmount,
      }),
    });
    const data = await res.json();
    if (data.checkout_url) {
      const linkDiv = document.getElementById('mol-link-display') || document.querySelector('#paiement-section');
      const checkoutUrl = data.checkout_url;
      const waText = encodeURIComponent('Voici votre lien de paiement sécurisé Seolia : ' + checkoutUrl);
      const linkBox = `
        <div class="paiement-link-box" id="mol-checkout-link">${checkoutUrl}</div>
        <div class="paiement-actions" style="margin-top:8px;">
          <button class="btn-mollie btn-mollie-copy" onclick="navigator.clipboard.writeText('${checkoutUrl.replace(/'/g,"\\'")}').then(()=>showToast('Lien copié !','success'))">
            📋 Copier le lien
          </button>
          <a href="https://wa.me/?text=${waText}" target="_blank" class="btn-mollie btn-mollie-green" style="text-decoration:none;display:inline-flex;align-items:center;">
            💬 Envoyer WhatsApp
          </a>
        </div>`;
      if (linkDiv) linkDiv.innerHTML = linkBox;
      showToast('✅ Lien de paiement généré !', 'success');
      await loadContact(contactId);
    } else {
      showToast('Erreur: ' + (data.error || 'Inconnue'), 'error');
      btn.disabled = false;
      btn.textContent = 'Générer lien paiement SEPA →';
    }
  } catch (err) {
    showToast('Erreur réseau: ' + err.message, 'error');
    btn.disabled = false;
    btn.textContent = 'Générer lien paiement SEPA →';
  }
}

async function mollieCreateSubscription(btn, contactId, mollieCustomerId, mollieMandateId, formule) {
  const amtInput = document.getElementById('mol-sub-amt');
  const mensuelAmount = amtInput ? parseFloat(amtInput.value).toFixed(2) : null;
  btn.disabled = true;
  btn.textContent = 'Activation...';
  try {
    const res = await fetch(`${WORKER_URL}/mollie-create-subscription`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contact_id: contactId,
        mollie_customer_id: mollieCustomerId,
        mollie_mandate_id: mollieMandateId,
        formule,
        mensuel_amount: mensuelAmount,
      }),
    });
    const data = await res.json();
    if (data.success) {
      showToast(`✅ Abonnement actif à partir du ${data.start_date} !`, 'success');
      await loadContact(contactId);
    } else {
      showToast('Erreur: ' + (data.error || 'Inconnue'), 'error');
      btn.disabled = false;
      btn.textContent = '▶ Activer abonnement mensuel';
    }
  } catch (err) {
    showToast('Erreur réseau: ' + err.message, 'error');
    btn.disabled = false;
    btn.textContent = '▶ Activer abonnement mensuel';
  }
}

async function loadContact(contactId) {
  try {
    const rows = await sbFetch('/rest/v1/contacts?id=eq.' + contactId + '&select=*');
    if (rows && rows[0]) {
      const idx = allContacts.findIndex(c => c.id === contactId);
      if (idx >= 0) allContacts[idx] = rows[0];
      else allContacts.push(rows[0]);
      await openContactDetail(contactId);
    }
  } catch (e) {
    console.error('loadContact error:', e);
  }
}

// ── COMMENTAIRES ─────────────────────────────────────────────
async function loadCommentaires(contactId) {
  const el = document.getElementById('detail-commentaires');
  if (!el) return;
  try {
    const rows = await sbFetch('/rest/v1/commentaires?contact_id=eq.' + contactId + '&order=created_at.asc&select=*');
    el.innerHTML = rows.length === 0
      ? '<div style="color:var(--text-light);font-size:13px;padding:4px 0">Aucun commentaire pour le moment.</div>'
      : rows.map(c => {
          const d = new Date(c.created_at);
          const dateStr = d.toLocaleDateString('fr-BE', { day:'2-digit', month:'2-digit', year:'numeric' });
          const timeStr = d.toLocaleTimeString('fr-BE', { hour:'2-digit', minute:'2-digit' });
          return '<div style="padding:8px 0;border-bottom:1px solid var(--bg);font-size:13px;display:flex;align-items:flex-start;justify-content:space-between;gap:8px;">'
            + '<div style="flex:1;">'
            + '<span style="color:var(--text-light);font-size:11px;margin-right:8px;">' + dateStr + ' ' + timeStr + '</span>'
            + '<strong style="color:var(--green);margin-right:6px;">' + escHtml(c.prenom_commercial) + '</strong>'
            + '<span style="color:var(--text)">' + escHtml(c.texte) + '</span>'
            + '</div>'
            + '<button onclick="deleteCommentaire(\'' + c.id + '\')" title="Supprimer" style="flex-shrink:0;background:none;border:none;cursor:pointer;color:var(--text-light);font-size:14px;padding:2px 4px;border-radius:4px;line-height:1;" onmouseover="this.style.color=\'#e74c3c\'" onmouseout="this.style.color=\'var(--text-light)\'">&#x1F5D1;</button>'
            + '</div>';
        }).join('');
  } catch(e) {
    if (el) el.innerHTML = '<div style="color:var(--text-light);font-size:13px;">Erreur chargement commentaires.</div>';
  }
}

async function saveCommentaire() {
  if (!currentContactId) return;
  const inp = document.getElementById('input-commentaire');
  const texte = inp ? inp.value.trim() : '';
  if (!texte) { showToast('Commentaire vide', 'error'); return; }
  const prenom = (currentProfile && currentProfile.prenom)
    || (currentProfile && currentProfile.nom && currentProfile.nom.split(' ')[0])
    || (currentUser && currentUser.email && currentUser.email.split('@')[0])
    || 'Equipe';
  try {
    await sbFetch('/rest/v1/commentaires', {
      method: 'POST',
      headers: { 'Prefer': 'return=minimal' },
      body: JSON.stringify({
        contact_id: currentContactId,
        commercial_id: (currentProfile && currentProfile.id) || null,
        prenom_commercial: prenom,
        texte: texte
      })
    });
    inp.value = '';
    await loadCommentaires(currentContactId);
    showToast('Commentaire enregistré', 'success');
  } catch(e) {
    showToast('Erreur: ' + e.message, 'error');
  }
}

async function deleteCommentaire(id) {
  if (!confirm('Supprimer ce commentaire ?')) return;
  try {
    await sbFetch('/rest/v1/commentaires?id=eq.' + id, {
      method: 'DELETE',
      headers: { 'Prefer': 'return=minimal' }
    });
    await loadCommentaires(currentContactId);
    showToast('Commentaire supprimé', 'success');
  } catch(e) {
    showToast('Erreur: ' + e.message, 'error');
  }
}

// ── CALENDRIER SEMAINE ──────────────────────────────────────────
let calWeekOffset = 0;

function getWeekStart(offset) {
  const now = new Date();
  const day = now.getDay() === 0 ? 6 : now.getDay() - 1;
  const monday = new Date(now);
  monday.setDate(now.getDate() - day + offset * 7);
  monday.setHours(0, 0, 0, 0);
  return monday;
}

function calPrevWeek() { calWeekOffset--; renderCalendar(); }
function calNextWeek() { calWeekOffset++; renderCalendar(); }

async function renderCalendar() {
  const grid = document.getElementById('cal-grid');
  const label = document.getElementById('cal-week-label');
  if (!grid) return;

  const weekStart = getWeekStart(calWeekOffset);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);
  weekEnd.setHours(23, 59, 59, 999);

  const fmt = d => d.toLocaleDateString('fr-BE', { day: '2-digit', month: 'short' });
  if (label) label.textContent = fmt(weekStart) + ' — ' + fmt(weekEnd);

  const startISO = weekStart.toISOString();
  const endISO = weekEnd.toISOString();

  let acts = [];
  try {
    const url = '/rest/v1/activites?type=in.(appel,reunion)&date_echeance=gte.' + startISO + '&date_echeance=lte.' + endISO + '&order=date_echeance.asc&select=*,contacts(nom,commercial_id)';
    const all = await sbFetch(url);
    acts = (all || []).filter(a => {
      if (!a.contacts) return true;
      if (currentProfile && currentProfile.role === 'admin') return true;
      return a.contacts.commercial_id === (currentProfile && currentProfile.id);
    });
  } catch(e) { acts = []; }

  const days = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
  const today = new Date(); today.setHours(0,0,0,0);

  const dayDates = Array.from({length: 7}, function(_, i) {
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + i);
    return d;
  });

  const byDay = Array.from({length: 7}, function() { return []; });
  acts.forEach(function(a) {
    if (!a.date_echeance) return;
    const d = new Date(a.date_echeance);
    const dayIdx = Math.floor((d - weekStart) / 86400000);
    if (dayIdx >= 0 && dayIdx < 7) byDay[dayIdx].push(a);
  });

  let html = '<div class="cal-week">';
  html += '<div></div>';
  dayDates.forEach(function(d, i) {
    const isToday = d.getTime() === today.getTime();
    html += '<div class="cal-day-header' + (isToday ? ' today' : '') + '">' + days[i] + '<br><span style="font-size:14px;font-weight:800">' + d.getDate() + '</span></div>';
  });
  html += '<div class="cal-time-col">RDV</div>';
  dayDates.forEach(function(d, i) {
    html += '<div class="cal-day-col" style="padding:4px;">';
    if (byDay[i].length === 0) {
      html += '<div class="cal-empty">—</div>';
    } else {
      byDay[i].forEach(function(a) {
        const t = a.date_echeance ? new Date(a.date_echeance).toLocaleTimeString('fr-BE', { hour:'2-digit', minute:'2-digit' }) : '';
        const lbl = a.contacts && a.contacts.nom ? escHtml(a.contacts.nom) : escHtml(a.titre || '');
        const cls = a.type === 'reunion' ? 'reunion' : 'appel';
        const icon = a.type === 'reunion' ? '&#x1F91D;' : '&#x1F4DE;';
        html += '<div class="cal-event ' + cls + '" data-contact-id="' + a.contact_id + '" title="' + escHtml(a.titre||'') + ' — ' + escHtml((a.contacts && a.contacts.nom)||'') + '">'
          + '<div>' + icon + ' ' + t + '</div>'
          + '<div style="font-weight:400;font-size:10px">' + lbl + '</div>'
          + '</div>';
      });
    }
    html += '</div>';
  });
  html += '</div>';

  if (acts.length === 0) {
    html += '<div style="text-align:center;color:var(--text-light);font-size:13px;padding:16px 0">Aucun RDV cette semaine &#x2713;</div>';
  }

  grid.innerHTML = html;

  grid.querySelectorAll('.cal-event[data-contact-id]').forEach(function(el) {
    el.addEventListener('click', function() {
      loadContact(this.getAttribute('data-contact-id'));
    });
  });
}

// ============================================================
// CRM SEOLIA v2 — NEW FEATURES
// ============================================================

// ── CONSTANTS ──────────────────────────────────────────────
const TVA_RATE_V2 = 1.21;
const FORMULES_V2 = ['Essentiel IA','Business IA','Premium IA','Web Essentiel','Web Business','Web Premium'];
const FORMULE_PRIX_V2 = {
  'Essentiel IA': { setup: 499, mensuel: 109 },
  'Business IA': { setup: 949, mensuel: 249 },
  'Premium IA': { setup: 1499, mensuel: 449 },
  'Web Essentiel': { setup: 149, mensuel: 69 },
  'Web Business': { setup: 299, mensuel: 119 },
  'Web Premium': { setup: 499, mensuel: 199 },
};

// ── LEAD SCORING ─────────────────────────────────────────
function calculateScore(contact, notesCount=0, activitesCount=0, lastActivityDate=null) {
  let score = 0;
  // Statut
  const statutScore = { prospect: 20, rdv: 50, client: 80, perdu: 0 };
  score += statutScore[contact.statut] || 0;
  // Notes
  score += Math.min(notesCount * 5, 20);
  // Activités
  score += Math.min(activitesCount * 5, 20);
  // Formule
  const formuleScore = {
    'Essentiel IA': 5, 'Web Essentiel': 5,
    'Business IA': 10, 'Web Business': 10,
    'Premium IA': 15, 'Web Premium': 15
  };
  score += formuleScore[contact.formule] || 0;
  // Dernière activité
  if (lastActivityDate) {
    const days = (Date.now() - new Date(lastActivityDate)) / 86400000;
    if (days < 7) score += 10;
    else if (days < 14) score += 5;
  }
  // Email
  if (contact.email) score += 5;
  // Adresse
  if (contact.ville || contact.adresse) score += 3;
  return Math.min(Math.max(score, 0), 100);
}

function renderScoreBadge(score) {
  if (score >= 75) return `<span class="score-badge score-hot">🔥 ${score}</span>`;
  if (score >= 50) return `<span class="score-badge score-warm">${score}</span>`;
  return `<span class="score-badge score-cold">${score}</span>`;
}

function isStagnant(contact, lastActivityDate) {
  if (!lastActivityDate) {
    // Check created_at
    if (!contact.created_at) return false;
    const daysCreated = (Date.now() - new Date(contact.created_at)) / 86400000;
    if ((contact.statut === 'rdv') && daysCreated > 7) return true;
    return false;
  }
  const days = (Date.now() - new Date(lastActivityDate)) / 86400000;
  if (contact.statut === 'rdv' && days > 7) return true;
  if (contact.statut === 'prospect' && days > 14) return true;
  return false;
}

function formatRelativeDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const now = new Date();
  const diff = now - d;
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (mins < 2) return 'à l\'instant';
  if (mins < 60) return `il y a ${mins} min`;
  if (hours < 24) return `il y a ${hours}h`;
  if (days < 2) return 'hier';
  if (days < 7) return `il y a ${days} jours`;
  const months = ['jan','fév','mar','avr','mai','jun','jul','aoû','sep','oct','nov','déc'];
  return `${d.getDate()} ${months[d.getMonth()]}`;
}

// ── ENHANCED DASHBOARD ────────────────────────────────────
async function refreshDashboard() {
  if (typeof loadDashboard === 'function') await loadDashboard();
  renderEnhancedDashboard();
}

async function renderEnhancedDashboard() {
  if (!allContacts || allContacts.length === 0) return;
  // Set today date
  const todayEl = document.getElementById('today-date');
  if (todayEl) {
    const now = new Date();
    todayEl.textContent = now.toLocaleDateString('fr-BE', { weekday:'long', day:'numeric', month:'long' });
  }
  // KPIs
  const clients = allContacts.filter(c => c.statut === 'client' && c.actif !== false);
  const hotLeads = allContacts.filter(c => c.statut === 'rdv');
  const mrrHTVA = clients.reduce((s,c) => s+(parseFloat(c.prix_mensuel)||0),0) / TVA_RATE_V2;

  const kpiClients = document.getElementById('kpi-clients');
  if (kpiClients) kpiClients.textContent = clients.length;
  const kpiHot = document.getElementById('kpi-hot');
  if (kpiHot) kpiHot.textContent = hotLeads.length;

  // Admin: show MRR
  if (currentProfile && currentProfile.role === 'admin') {
    const kpiMrr = document.getElementById('kpi-mrr');
    if (kpiMrr) kpiMrr.style.display = '';
    const kpiMrrVal = document.getElementById('kpi-mrr-val');
    if (kpiMrrVal) kpiMrrVal.textContent = fmtEur ? fmtEur(mrrHTVA) : `€${Math.round(mrrHTVA)}`;
    const kpiMrrSub = document.getElementById('kpi-mrr-sub');
    if (kpiMrrSub) kpiMrrSub.textContent = clients.length + ' clients actifs';
  }
  // Commercial: show objective
  if (currentProfile && currentProfile.role === 'commercial' && currentProfile.objectif_mensuel) {
    const myClients = clients.filter(c => c.created_by === currentProfile.id || c.assigned_to === currentProfile.id);
    const objCard = document.getElementById('kpi-obj-card');
    if (objCard) {
      objCard.style.display = '';
      const pct = Math.min((myClients.length / currentProfile.objectif_mensuel) * 100, 100);
      const objVal = document.getElementById('kpi-obj-val');
      if (objVal) objVal.textContent = `${myClients.length}/${currentProfile.objectif_mensuel}`;
      const objBar = document.getElementById('kpi-obj-bar');
      if (objBar) objBar.style.width = pct + '%';
      const objSub = document.getElementById('kpi-obj-sub');
      if (objSub) objSub.textContent = `${Math.round(pct)}% atteint`;
    }
  }

  // Load activités for today + overdue
  try {
    const today = new Date().toISOString().split('T')[0];
    const acts = await sbFetch(`/rest/v1/activites?select=*,contacts(nom,prenom,entreprise)&fait=eq.false&order=date_echeance.asc`) || [];
    const todayActs = acts.filter(a => a.date_echeance && a.date_echeance.startsWith(today));
    const overdueActs = acts.filter(a => a.date_echeance && a.date_echeance < today);

    const kpiRetard = document.getElementById('kpi-retard');
    if (kpiRetard) kpiRetard.textContent = overdueActs.length;
    const kpiRetardCard = document.getElementById('kpi-retard-card');
    if (kpiRetardCard) {
      if (overdueActs.length > 0) kpiRetardCard.classList.add('kpi-red');
      else kpiRetardCard.classList.remove('kpi-red');
    }

    // Render today items
    const todayItemsEl = document.getElementById('today-items');
    if (todayItemsEl) {
      const allToday = [...todayActs.map(a=>({...a, _type:'activite'}))];
      // Also get today's followups
      const fups = await sbFetch(`/rest/v1/followups?select=*,contacts(nom,prenom,entreprise)&fait=eq.false&order=date_rappel.asc`) || [];
      const todayFups = fups.filter(f => f.date_rappel && f.date_rappel.startsWith(today));
      todayFups.forEach(f => allToday.push({...f, _type:'followup'}));
      allToday.sort((a,b) => {
        const da = a.date_echeance || a.date_rappel || '';
        const db = b.date_echeance || b.date_rappel || '';
        return da.localeCompare(db);
      });
      if (allToday.length === 0) {
        todayItemsEl.innerHTML = '<div style="color:var(--text-light);font-size:13px;padding:8px 0">Aucune activité prévue aujourd\'hui ✓</div>';
      } else {
        const typeIcons = { appel:'📞', reunion:'🤝', email:'✉️', tache:'✅', followup:'📅' };
        todayItemsEl.innerHTML = allToday.map(item => {
          const contact = item.contacts || {};
          const contactName = [contact.prenom, contact.nom].filter(Boolean).join(' ') || contact.entreprise || '';
          const type = item._type === 'followup' ? 'followup' : (item.type || 'tache');
          const icon = typeIcons[type] || '📌';
          const text = item.titre || item.message || item.type || 'Activité';
          const contactId = item.contact_id;
          return `<div class="today-item" onclick="loadContact(${contactId})">
            <span>${icon}</span>
            <span class="ti-text">${escHtml(text)}</span>
            <span class="ti-contact">${escHtml(contactName)}</span>
          </div>`;
        }).join('');
      }
    }
  } catch(e) {
    console.warn('Error loading today activities:', e);
  }

  // Hot leads
  const hotLeadsEl = document.getElementById('hot-leads-grid');
  if (hotLeadsEl && hotLeads.length > 0) {
    hotLeadsEl.innerHTML = hotLeads.slice(0, 8).map(c => {
      const score = calculateScore(c, 0, 0, c.last_activity || c.updated_at);
      const stagnant = isStagnant(c, c.last_activity || c.updated_at);
      return `<div class="hot-lead-card" onclick="loadContact(${c.id})">
        ${stagnant ? '<span class="stagnant-badge hlc-stagnant">🔴 Stagnant</span>' : ''}
        <div class="hlc-name">${escHtml((c.prenom||'')+' '+(c.nom||'')).trim() || escHtml(c.entreprise||'—')}</div>
        <div class="hlc-company">${escHtml(c.entreprise||'')}</div>
        <div class="hlc-bottom">
          ${renderScoreBadge(score)}
          <span style="font-size:11px;color:var(--text-light)">${escHtml(c.assignee_name||'')}</span>
        </div>
      </div>`;
    }).join('');
  } else if (hotLeadsEl) {
    hotLeadsEl.innerHTML = '<div style="color:var(--text-light);font-size:13px">Aucun lead chaud</div>';
  }

  // ── Section stagnants
  const stagnantContacts = (isAdmin ? allContacts : allContacts.filter(c => c.assignee === currentProfile.nom))
    .filter(c => c.statut === 'prospect' && typeof isStagnant === 'function' && isStagnant(c))
    .slice(0, 6);
  
  const stagnantGrid = document.getElementById('stagnants-grid');
  if (stagnantGrid) {
    if (!stagnantContacts.length) {
      stagnantGrid.innerHTML = '<div style="color:var(--text-light);font-size:13px">Aucun contact stagnant 🎉</div>';
    } else {
      stagnantGrid.innerHTML = stagnantContacts.map(c => {
        const days = c.updated_at ? Math.floor((Date.now() - new Date(c.updated_at).getTime()) / 86400000) : '?';
        return '<div class="hot-lead-card" style="cursor:pointer;border-left:3px solid #ef4444" onclick="openContactDetail(\'' + c.id + '\')">' +
          '<div style="font-weight:700;font-size:13px">' + esc(c.nom||c.entreprise||'—') + '</div>' +
          '<div style="font-size:11px;color:var(--text-light);margin:3px 0">' + esc(c.secteur||c.ville||'—') + '</div>' +
          '<div style="font-size:11px;color:#ef4444;font-weight:600">Aucun contact depuis ' + days + ' jours</div>' +
          '</div>';
      }).join('');
    }
  }

}

// loadDashboard already calls renderEnhancedDashboard

// renderContacts enhancements merged into original

// ── SAVED VIEWS ───────────────────────────────────────────
function getSavedViews() {
  try { return JSON.parse(localStorage.getItem('seolia_saved_views') || '[]'); } catch(e) { return []; }
}
function saveSavedViews(views) {
  localStorage.setItem('seolia_saved_views', JSON.stringify(views));
}
function promptSaveView() {
  const name = prompt('Nom de cette vue (ex: "Mes HOT", "Plombiers à rappeler"):');
  if (!name || !name.trim()) return;
  const filters = {
    statut: document.getElementById('contacts-filter-status')?.value || '',
    secteur: document.getElementById('contacts-filter-sector')?.value || '',
    assignee: document.getElementById('contacts-filter-assignee')?.value || '',
    formule: document.getElementById('contacts-filter-formule')?.value || '',
    ville: document.getElementById('contacts-filter-ville')?.value || '',
    search: document.getElementById('contacts-search')?.value || '',
  };
  const views = getSavedViews();
  views.push({ name: name.trim(), filters });
  saveSavedViews(views);
  renderSavedViews();
  showToast('Vue sauvegardée : ' + name.trim(), 'success');
}
function loadSavedView(index) {
  const views = getSavedViews();
  if (!views[index]) return;
  const f = views[index].filters;
  const setVal = (id, val) => { const el = document.getElementById(id); if (el) el.value = val || ''; };
  setVal('contacts-filter-status', f.statut);
  setVal('contacts-filter-sector', f.secteur);
  setVal('contacts-filter-assignee', f.assignee);
  setVal('contacts-filter-formule', f.formule);
  setVal('contacts-filter-ville', f.ville);
  setVal('contacts-search', f.search);
  if (typeof filterContacts === 'function') filterContacts();
  // Highlight active pill
  document.querySelectorAll('.saved-view-pill').forEach((p,i) => {
    p.classList.toggle('active', i === index);
  });
}
function deleteSavedView(index) {
  const views = getSavedViews();
  views.splice(index, 1);
  saveSavedViews(views);
  renderSavedViews();
}
function renderSavedViews() {
  const row = document.getElementById('saved-views-row');
  if (!row) return;
  const views = getSavedViews();
  if (views.length === 0) { row.style.display = 'none'; return; }
  row.style.display = 'flex';
  row.innerHTML = '<span style="font-size:11px;color:var(--text-light);font-weight:600">Vues:</span>' +
    views.map((v, i) => `<span class="saved-view-pill" onclick="loadSavedView(${i})">
      ${escHtml(v.name)}
      <button class="pill-del" onclick="event.stopPropagation();deleteSavedView(${i})" title="Supprimer">✕</button>
    </span>`).join('');
}

// ── IMPORT CSV ────────────────────────────────────────────
let csvData = [];
function openImportCSVModal() {
  csvData = [];
  document.getElementById('csv-preview-section').style.display = 'none';
  document.getElementById('csv-file-input').value = '';
  openModal('modal-import-csv');
}
function handleCSVFile(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => parseCSVContent(e.target.result);
  reader.readAsText(file, 'UTF-8');
}
// CSV drop zone
(function setupCSVDrop() {
  document.addEventListener('DOMContentLoaded', () => {
    const dz = document.getElementById('csv-drop-zone');
    if (!dz) return;
    dz.addEventListener('dragover', e => { e.preventDefault(); dz.classList.add('drag-over'); });
    dz.addEventListener('dragleave', () => dz.classList.remove('drag-over'));
    dz.addEventListener('drop', e => {
      e.preventDefault(); dz.classList.remove('drag-over');
      const file = e.dataTransfer.files[0];
      if (file) { const r = new FileReader(); r.onload = ev => parseCSVContent(ev.target.result); r.readAsText(file,'UTF-8'); }
    });
  });
})();
function parseCSVContent(text) {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) { showToast('CSV invalide ou vide', 'error'); return; }
  const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/"/g,''));
  csvData = lines.slice(1).map(line => {
    const vals = line.split(',').map(v => v.trim().replace(/^"|"$/g,''));
    const obj = {};
    headers.forEach((h, i) => { obj[h] = vals[i] || ''; });
    return obj;
  }).filter(r => r.nom || r.prenom || r.entreprise);
  // Show preview
  const previewEl = document.getElementById('csv-preview-section');
  const titleEl = document.getElementById('csv-preview-title');
  const tableEl = document.getElementById('csv-preview-table');
  const btnImport = document.getElementById('btn-do-import');
  if (!previewEl) return;
  titleEl.textContent = `${csvData.length} contact(s) détectés — Aperçu des 5 premiers:`;
  btnImport.textContent = `Importer ${csvData.length} contact(s)`;
  const preview = csvData.slice(0, 5);
  const cols = ['nom','prenom','entreprise','telephone','email','ville','statut'];
  tableEl.innerHTML = `<thead><tr>${cols.map(c=>`<th>${c}</th>`).join('')}</tr></thead>
    <tbody>${preview.map(row=>`<tr>${cols.map(c=>`<td>${escHtml(row[c]||'')}</td>`).join('')}</tr>`).join('')}</tbody>`;
  previewEl.style.display = '';
}
async function doImportCSV() {
  if (!csvData || csvData.length === 0) return;
  const progressEl = document.getElementById('csv-import-progress');
  const btnImport = document.getElementById('btn-do-import');
  btnImport.disabled = true;
  let ok = 0, err = 0;
  for (let i = 0; i < csvData.length; i++) {
    const row = csvData[i];
    if (progressEl) progressEl.textContent = `Import: ${i+1}/${csvData.length}...`;
    const payload = {
      nom: row.nom || '',
      prenom: row.prenom || '',
      entreprise: row.entreprise || '',
      telephone: row.telephone || '',
      email: row.email || '',
      ville: row.ville || '',
      secteur: row.secteur || '',
      statut: ['prospect','rdv','client','perdu'].includes(row.statut) ? row.statut : 'prospect',
      source: 'import_csv',
    };
    if (row.assignee) payload.assignee_email = row.assignee;
    if (currentProfile) payload.created_by = currentProfile.id;
    try {
      const res = await sbFetch('/rest/v1/contacts', { method: 'POST', body: JSON.stringify(payload) });
      ok++;
    } catch(e) { err++; }
  }
  if (progressEl) progressEl.textContent = `✓ ${ok} importé(s)${err>0?`, ${err} erreur(s)`:''}`;
  btnImport.disabled = false;
  showToast(`Import terminé: ${ok} contact(s) importés`, 'success');
  if (typeof loadContacts === 'function') await loadContacts();
  setTimeout(() => closeModal('modal-import-csv'), 1500);
}

// ── EXPORT CSV ────────────────────────────────────────────
function exportCSV() {
  const contacts_to_export = allContacts || [];
  if (contacts_to_export.length === 0) { showToast('Aucun contact à exporter', 'error'); return; }
  const cols = ['id','nom','prenom','entreprise','telephone','email','ville','adresse','secteur','statut','formule','prix_setup','prix_mensuel','date_debut','source','created_at'];
  const header = cols.join(',');
  const rows = contacts_to_export.map(c => cols.map(col => {
    const val = c[col] != null ? String(c[col]).replace(/"/g, '""') : '';
    return `"${val}"`;
  }).join(','));
  const csv = [header, ...rows].join('\n');
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = `seolia_contacts_${new Date().toISOString().split('T')[0]}.csv`;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast(`${contacts_to_export.length} contacts exportés`, 'success');
}

// ── GLOBAL SEARCH ─────────────────────────────────────────
function globalSearch(query) {
  const dropdown = document.getElementById('search-dropdown');
  const inp = document.getElementById('global-search-input');
  if (!dropdown) return;
  if (!query || query.length < 2) { dropdown.style.display = 'none'; return; }
  const q = query.toLowerCase();
  const results = (allContacts || []).filter(c =>
    (c.nom||'').toLowerCase().includes(q) ||
    (c.prenom||'').toLowerCase().includes(q) ||
    (c.entreprise||'').toLowerCase().includes(q) ||
    (c.telephone||'').toLowerCase().includes(q) ||
    (c.email||'').toLowerCase().includes(q) ||
    (c.ville||'').toLowerCase().includes(q)
  ).slice(0, 10);
  if (results.length === 0) {
    dropdown.innerHTML = '<div style="padding:12px 14px;color:var(--text-light);font-size:13px">Aucun résultat</div>';
  } else {
    dropdown.innerHTML = results.map(c => {
      const name = [c.prenom, c.nom].filter(Boolean).join(' ') || c.entreprise || 'Sans nom';
      const sub = [c.entreprise, c.telephone, c.ville].filter(Boolean).join(' · ');
      return `<div class="search-result-item" data-contact-id="${c.id}" style="cursor:pointer;">
        <span>👤</span>
        <div>
          <div class="sr-name">${escHtml(name)}</div>
          <span class="sr-sub">${escHtml(sub)}</span>
        </div>
      </div>`;
    }).join('');
  }
  // Position dropdown under the input field (fixed, in global stacking context)
  if (inp) {
    const rect = inp.getBoundingClientRect();
    dropdown.style.top = (rect.bottom + 4) + 'px';
    dropdown.style.left = rect.left + 'px';
    dropdown.style.width = rect.width + 'px';
  }
  dropdown.style.display = 'block';
}
function globalSearchSelect(contactId) {
  const dropdown = document.getElementById('search-dropdown');
  if (dropdown) dropdown.style.display = 'none';
  const inp = document.getElementById('global-search-input');
  if (inp) inp.value = '';
  loadContact(contactId);
}
// Delegated listener for search dropdown — fires on the dropdown itself
(function() {
  function setupSearchDropdown() {
    const dd = document.getElementById('search-dropdown');
    if (!dd) return;
    dd.addEventListener('mousedown', function(e) {
      const item = e.target.closest('[data-contact-id]');
      if (item) {
        e.preventDefault();
        e.stopPropagation();
        const id = parseInt(item.getAttribute('data-contact-id'), 10);
        dd.style.display = 'none';
        const inp = document.getElementById('global-search-input');
        if (inp) inp.value = '';
        loadContact(id);
      }
    });
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setupSearchDropdown);
  } else {
    setupSearchDropdown();
  }
})();

// Close dropdown on click outside
document.addEventListener('mousedown', (e) => {
  const dd = document.getElementById('search-dropdown');
  if (dd && dd.style.display !== 'none' && !e.target.closest('.top-search-wrap') && !dd.contains(e.target)) {
    dd.style.display = 'none';
  }
});

// ── WHATSAPP ──────────────────────────────────────────────
function openWhatsApp() {
  const contact = allContacts && currentContactId ? allContacts.find(c => c.id === currentContactId) : null;
  if (!contact || !contact.telephone) { showToast('Numéro de téléphone manquant', 'error'); return; }
  const name = [contact.prenom, contact.nom].filter(Boolean).join(' ') || contact.entreprise || 'vous';
  const msg = `Bonjour ${name}, je suis de l'équipe Seolia. Comment puis-je vous aider ?`;
  const phone = contact.telephone.replace(/\D/g,'');
  window.open(`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`, '_blank');
}
// Update WhatsApp button visibility when contact is loaded
const _origOpenContactDetail = typeof openContactDetail !== 'undefined' ? openContactDetail : null;
function showContactDetailButtons(contact) {
  const waBtn = document.getElementById('btn-whatsapp');
  if (waBtn) waBtn.style.display = contact.telephone ? '' : 'none';
  // Stagnant
  const stagnantBadge = document.getElementById('detail-stagnant-badge');
  if (stagnantBadge) {
    const stagnant = isStagnant(contact, contact.last_activity || contact.updated_at);
    stagnantBadge.style.display = stagnant ? '' : 'none';
  }
  // Onboarding checklist (only for clients)
  const checklistCard = document.getElementById('detail-onboarding-checklist');
  if (checklistCard) {
    checklistCard.style.display = contact.statut === 'client' ? '' : 'none';
    if (contact.statut === 'client') renderOnboardingChecklist(contact.id);
  }
}

// ── QUESTIONNAIRE LINK ────────────────────────────────────
function copyQuestionnaireLink(contactId) {
  if (!contactId) { showToast('Aucun contact sélectionné', 'error'); return; }
  const url = `https://seolia.be/questionnaire?id=${contactId}`;
  if (navigator.clipboard) {
    navigator.clipboard.writeText(url).then(() => showToast('Lien questionnaire copié !', 'success'));
  } else {
    const ta = document.createElement('textarea');
    ta.value = url; document.body.appendChild(ta);
    ta.select(); document.execCommand('copy'); document.body.removeChild(ta);
    showToast('Lien questionnaire copié !', 'success');
  }
}

// ── ONBOARDING CHECKLIST ──────────────────────────────────
const OCL_ITEMS = [
  { key: 'questionnaire', label: 'Questionnaire reçu' },
  { key: 'setup_paye', label: 'Paiement setup reçu' },
  { key: 'contrat_signe', label: 'Contrat signé' },
  { key: 'site_production', label: 'Site en production' },
  { key: 'google_business', label: 'Google Business vérifié' },
  { key: 'premier_paiement', label: 'Premier paiement mensuel reçu' },
];
function getOnboardingChecklist(contactId) {
  try { return JSON.parse(localStorage.getItem(`checklist_${contactId}`) || '{}'); } catch(e) { return {}; }
}
function toggleChecklistItem(contactId, key) {
  const cl = getOnboardingChecklist(contactId);
  cl[key] = !cl[key];
  localStorage.setItem(`checklist_${contactId}`, JSON.stringify(cl));
  renderOnboardingChecklist(contactId);
}
function renderOnboardingChecklist(contactId) {
  const el = document.getElementById('ocl-items');
  const progressBar = document.getElementById('ocl-progress-bar');
  const progressText = document.getElementById('ocl-progress-text');
  if (!el) return;
  const cl = getOnboardingChecklist(contactId);
  const done = OCL_ITEMS.filter(i => cl[i.key]).length;
  const pct = (done / OCL_ITEMS.length) * 100;
  if (progressBar) progressBar.style.width = pct + '%';
  if (progressText) progressText.textContent = `${done}/${OCL_ITEMS.length}`;
  el.innerHTML = OCL_ITEMS.map(item => `
    <div class="ocl-item${cl[item.key]?' ocl-done':''}" onclick="toggleChecklistItem(${contactId},'${item.key}')">
      <input type="checkbox" ${cl[item.key]?'checked':''} onclick="event.stopPropagation();toggleChecklistItem(${contactId},'${item.key}')">
      <label>${item.label}</label>
    </div>`).join('');
}

// ── BOTTOM NAV ────────────────────────────────────────────
function updateBottomNav(viewId) {
  document.querySelectorAll('.bottom-nav-item').forEach(el => el.classList.remove('active'));
  const btn = document.getElementById('bnav-' + viewId);
  if (btn) btn.classList.add('active');
}
function showViewRoleAdapted() {
  if (currentProfile && currentProfile.role === 'admin') showView('revenus');
  else showView('commissions');
}

// loadContact enhancement merged into original

// ── INIT ENHANCEMENTS ─────────────────────────────────────
// Move notification bell to header
function moveNotifBellToHeader() {
  const nw = document.getElementById('notif-wrapper');
  const hw = document.getElementById('header-notif-wrapper');
  if (nw && hw) {
    hw.appendChild(nw);
    nw.style.display = '';
  }
}

// initApp enhancements merged into original

// ── HELPER ────────────────────────────────────────────────
function escHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ===== BULK DELETE =====
function toggleSelectAll(checked) {
  document.querySelectorAll('.contact-select-cb').forEach(cb => cb.checked = checked);
  updateBulkDeleteBtn();
}
function updateBulkDeleteBtn() {
  const selected = document.querySelectorAll('.contact-select-cb:checked');
  const btn = document.getElementById('btn-delete-selected');
  const countEl = document.getElementById('selected-count');
  const selectAllCb = document.getElementById('select-all-contacts');
  if (btn) btn.style.display = selected.length > 0 ? '' : 'none';
  if (countEl) countEl.textContent = selected.length;
  if (selectAllCb) {
    const allCbs = document.querySelectorAll('.contact-select-cb');
    selectAllCb.indeterminate = selected.length > 0 && selected.length < allCbs.length;
    selectAllCb.checked = allCbs.length > 0 && selected.length === allCbs.length;
  }
}
async function deleteSelectedContacts() {
  const selected = [...document.querySelectorAll('.contact-select-cb:checked')];
  if (selected.length === 0) return;
  const count = selected.length;
  if (!confirm('Supprimer ' + count + ' contact' + (count > 1 ? 's' : '') + ' ? Cette action est irreversible.')) return;
  const ids = selected.map(cb => cb.value);
  let errors = 0;
  for (const id of ids) {
    try {
      await sbFetch('/rest/v1/contacts?id=eq.' + id, { method: 'DELETE', headers: { 'Prefer': 'return=minimal' } });
      allContacts = allContacts.filter(c => c.id !== id);
    } catch(e) { errors++; }
  }
  if (errors === 0) {
    showToast(count + ' contact' + (count > 1 ? 's' : '') + ' supprime(s) !', 'success');
  } else {
    showToast(errors + ' erreur(s) lors de la suppression', 'error');
  }
  const btn = document.getElementById('btn-delete-selected');
  if (btn) btn.style.display = 'none';
  renderContacts();
}

// ===== GÉNÉRATION CONTRAT PDF =====
function generateContrat() {
  const contact = allContacts.find(c => c.id === currentContactId);
  if (!contact) return;

  if (!window.jspdf) {
    showToast("Chargement jsPDF en cours, réessayez dans 1 seconde...", "error");
    return;
  }

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  const GREEN = [0, 214, 143];
  const NAVY = [10, 22, 40];
  const DARK = [45, 55, 72];
  const GRAY = [113, 128, 150];
  const LIGHTBG = [247, 248, 250];
  const WHITE = [255, 255, 255];
  const LIGHTGREEN = [230, 255, 245];

  const pageW = 210;
  const marginL = 18;
  const marginR = 18;
  const contentW = pageW - marginL - marginR;

  // Données du contact
  const forfait = contact.formule || '';
  let setupFee = contact.prix_setup ? String(Math.round(contact.prix_setup)) : '';
  let monthly = contact.prix_mensuel ? String(Math.round(contact.prix_mensuel)) : '';

  if (!setupFee || !monthly) {
    const f = forfait.toLowerCase();
    if (f.includes('bundle premium') || f.includes('premium ia')) {
      setupFee = setupFee || '1499'; monthly = monthly || '449';
    } else if (f.includes('bundle business') || f.includes('business ia')) {
      setupFee = setupFee || '949'; monthly = monthly || '249';
    } else if (f.includes('bundle essentiel') || f.includes('essentiel ia')) {
      setupFee = setupFee || '499'; monthly = monthly || '109';
    } else if (f.includes('web premium')) {
      setupFee = setupFee || '499'; monthly = monthly || '199';
    } else if (f.includes('web business')) {
      setupFee = setupFee || '349'; monthly = monthly || '119';
    } else if (f.includes('web essentiel')) {
      setupFee = setupFee || '199'; monthly = monthly || '69';
    }
  }

  const today = new Date();
  const dateStr = today.toLocaleDateString('fr-BE', { day: '2-digit', month: 'long', year: 'numeric' });
  const clientName = contact.nom || 'N/A';
  const clientCompany = contact.entreprise || '';
  const clientEmail = contact.email || '';
  const clientPhone = contact.telephone || '';
  const clientIban = contact.iban || '';
  const clientBic = contact.bic || '';
  
  // Livrables par forfait
  const deliverablesByForfait = {
    'bundle essentiel ia': 'Site vitrine 1 page, chatbot IA et FAQ automatisee, automatisation avis Google',
    'bundle business ia': 'Site multi-pages SEO, formulaire demandes d\'intervention, tableau de bord artisan, SMS automatique, automatisation RDV',
    'bundle premium ia': 'Site premium multi-pages, agent telephonique IA (200 min/mois), WhatsApp, tableau de bord, rapports hebdomadaires',
    'web essentiel': 'Site vitrine 1 page, hebergement inclus, maintenance technique',
    'web business': 'Site multi-pages SEO, hebergement inclus, maintenance technique',
    'web premium': 'Site premium multi-pages, hebergement inclus, maintenance technique',
  };
  const forfaitKey = forfait.toLowerCase();
  const deliverables = Object.entries(deliverablesByForfait).find(([k]) => forfaitKey.includes(k))?.[1] || 'Selon devis remis lors de la souscription';

  // Helper: draw page header
  function drawHeader(pageNum) {
    doc.setFillColor(...NAVY);
    doc.rect(0, 0, pageW, 22, 'F');
    doc.setFillColor(...GREEN);
    doc.rect(0, 22, pageW, 2, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.setTextColor(...WHITE);
    doc.text('CONTRAT DE PRESTATION DE SERVICES', marginL, 10);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...GREEN);
    doc.text('Seolia  |  BE 0727.941.547  |  seolia.be', marginL, 17);
    doc.setTextColor(180, 200, 220);
    doc.text('Page ' + pageNum + '  |  ' + dateStr, pageW - marginR, 17, { align: 'right' });
  }

  // Helper: draw page footer
  function drawFooter() {
    doc.setFillColor(...GREEN);
    doc.rect(0, 289, pageW, 2, 'F');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(...GRAY);
    doc.text('Florian Moers (Seolia)  |  BE 0727.941.547  |  florianmoerspro@gmail.com  |  +32 470 92 21 88  |  seolia.be', pageW / 2, 286, { align: 'center' });
  }

  // ─────────────────────────────────────────
  // PAGE 1 : Signature
  // ─────────────────────────────────────────
  drawHeader(1);
  let y = 32;

  // Section label: PARTIES
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(...GRAY);
  doc.text('PARTIES CONTRACTANTES', marginL, y + 4);
  y += 8;

  const boxH = clientIban ? 36 : 30;
  const halfW = (contentW / 2) - 3;

  // Prestataire box
  doc.setFillColor(...LIGHTBG);
  doc.roundedRect(marginL, y, halfW, boxH, 2, 2, 'F');
  doc.setDrawColor(...GREEN);
  doc.setLineWidth(0.5);
  doc.line(marginL, y, marginL, y + boxH);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(...GREEN);
  doc.text('PRESTATAIRE', marginL + 4, y + 6);
  doc.setFontSize(10);
  doc.setTextColor(...NAVY);
  doc.text('Florian Moers (Seolia)', marginL + 4, y + 13);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(...DARK);
  doc.text('florianmoerspro@gmail.com', marginL + 4, y + 20);
  doc.text('+32 470 92 21 88', marginL + 4, y + 26);

  // Client box
  const clientBoxX = marginL + halfW + 6;
  doc.setFillColor(...LIGHTBG);
  doc.roundedRect(clientBoxX, y, halfW, boxH, 2, 2, 'F');
  doc.setDrawColor(...GREEN);
  doc.line(clientBoxX, y, clientBoxX, y + boxH);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(...GREEN);
  doc.text('CLIENT', clientBoxX + 4, y + 6);
  doc.setFontSize(10);
  doc.setTextColor(...NAVY);
  const displayName = clientName + (clientCompany ? ' - ' + clientCompany : '');
  doc.text(displayName, clientBoxX + 4, y + 13, { maxWidth: halfW - 8 });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(...DARK);
  if (clientEmail) doc.text(clientEmail, clientBoxX + 4, y + 20);
  if (clientPhone) doc.text(clientPhone, clientBoxX + 4, y + 26);
  if (clientIban) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...GRAY);
    doc.text('IBAN : ' + clientIban + (clientBic ? '  BIC : ' + clientBic : ''), clientBoxX + 4, y + 32);
  }

  y += boxH + 12;

  // Section: FORFAIT
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(...GRAY);
  doc.text('FORFAIT SOUSCRIT', marginL, y);
  y += 5;

  const forfaitDisplay = forfait || '___________________________';
  const setupDisplay = setupFee ? setupFee + ' EUR TVAC' : '_______________ EUR TVAC';
  const monthlyDisplay = monthly ? monthly + ' EUR/mois TVAC' : '_______________ EUR/mois TVAC';

  doc.autoTable({
    startY: y,
    margin: { left: marginL, right: marginR },
    head: [['Forfait', 'Mise en place', 'Mensuel', 'Engagement']],
    body: [[forfaitDisplay, setupDisplay, monthlyDisplay, '6 mois minimum']],
    headStyles: {
      fillColor: NAVY, textColor: WHITE, fontStyle: 'bold',
      fontSize: 8, cellPadding: 3,
    },
    bodyStyles: {
      fillColor: LIGHTGREEN, textColor: DARK, fontSize: 9,
      fontStyle: 'bold', cellPadding: 4,
    },
    columnStyles: {
      0: { cellWidth: 50 },
      1: { cellWidth: 38 },
      2: { cellWidth: 46 },
      3: { cellWidth: contentW - 134 },
    },
  });

  y = doc.lastAutoTable.finalY + 5;

  // Note TVA
  const setupHT = setupFee ? (parseFloat(setupFee) / 1.21).toFixed(2) : '___';
  const setupTVA = setupFee ? (parseFloat(setupFee) - parseFloat(setupFee) / 1.21).toFixed(2) : '___';
  const monthlyHT = monthly ? (parseFloat(monthly) / 1.21).toFixed(2) : '___';
  const monthlyTVA = monthly ? (parseFloat(monthly) - parseFloat(monthly) / 1.21).toFixed(2) : '___';
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(7.5);
  doc.setTextColor(...GRAY);
  doc.text(
    'TVA 21% — Mise en place : ' + setupHT + ' EUR HTVA + ' + setupTVA + ' EUR TVA  |  Mensuel : ' + monthlyHT + ' EUR HTVA + ' + monthlyTVA + ' EUR TVA',
    marginL, y + 4
  );

  y += 12;

  // Section: PRESTATIONS INCLUSES
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(...GRAY);
  doc.text('PRESTATIONS INCLUSES', marginL, y);
  y += 5;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(...DARK);
  const delivLines = doc.splitTextToSize(deliverables, contentW);
  doc.text(delivLines, marginL, y);
  y += delivLines.length * 3.5 + 5;

  // Section: RÉSUMÉ CONDITIONS
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(...GRAY);
  doc.text('CONDITIONS ESSENTIELLES', marginL, y);
  y += 5;

  const summary = [
    ['Duree minimale', '6 mois a compter de la signature. Reconduction tacite, resiliation avec 1 mois de preavis ecrit.'],
    ['Resiliation anticipee', 'Mensualites restantes + 150 EUR TVAC de frais administratifs.'],
    ['Paiement', 'Mise en place exigible a la signature. Mensuel par prelevement SEPA automatique le 1er du mois.'],
    ['Non-paiement', 'Suspension du service apres mise en demeure de 15 jours. Les sommes restent dues.'],
    ['Propriete', 'Le code source reste la propriete de Seolia. Le nom de domaine reste la propriete du client.'],
    ['Fourniture contenus', 'Le client s\'engage a fournir textes, photos et logo dans les 15 jours suivant la signature. Tout retard impacte les delais de livraison sans modifier les obligations de paiement du client.'],
    ['Droit applicable', 'Droit belge. Tribunaux de Liege. Conditions completes en page 2.'],
  ];

  doc.autoTable({
    startY: y,
    margin: { left: marginL, right: marginR },
    body: summary,
    bodyStyles: { fontSize: 7.5, textColor: DARK, cellPadding: 2 },
    columnStyles: {
      0: { fontStyle: 'bold', textColor: NAVY, cellWidth: 38, fillColor: LIGHTBG },
      1: { cellWidth: contentW - 38, fillColor: WHITE },
    },
    alternateRowStyles: { fillColor: WHITE },
    tableLineColor: [220, 226, 234],
    tableLineWidth: 0.3,
  });

  y = doc.lastAutoTable.finalY + 4;

  // Mention CGV
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(7.5);
  doc.setTextColor(...GRAY);
  doc.text('Le client declare avoir lu et accepter les conditions generales detaillees en page 2 du present contrat.', marginL, y);
  y += 8;

  // AUTORISATION SEPA
  doc.setFillColor(230, 245, 255);
  doc.roundedRect(marginL, y, contentW, clientIban ? 14 : 12, 2, 2, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(...NAVY);
  doc.text('AUTORISATION DE PRELEVEMENT SEPA', marginL + 4, y + 5);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...DARK);
  if (clientIban) {
    doc.text('IBAN : ' + clientIban + (clientBic ? '   BIC : ' + clientBic : '') + '   —   En signant ce contrat, le Client autorise Seolia a prelever le montant mensuel convenu par prelevement SEPA.', marginL + 4, y + 11, { maxWidth: contentW - 8 });
    y += 18;
  } else {
    doc.text('IBAN : ________________________________   BIC : ____________   —   En signant, le Client autorise Seolia a prelever le mensuel par SEPA.', marginL + 4, y + 9, { maxWidth: contentW - 8 });
    y += 16;
  }

  // SIGNATURES
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(...GRAY);
  doc.text('SIGNATURES', marginL, y);
  y += 5;

  const sigBoxH = 42;
  const sigHalfW = (contentW / 2) - 4;

  // Prestataire sig box
  doc.setDrawColor(...NAVY);
  doc.setLineWidth(0.4);
  doc.roundedRect(marginL, y, sigHalfW, sigBoxH, 2, 2);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...NAVY);
  doc.text('Prestataire', marginL + 4, y + 7);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(...DARK);
  doc.text('Florian Moers (Seolia)', marginL + 4, y + 14);
  doc.setFontSize(8);
  doc.setTextColor(...GRAY);
  doc.text('Lu et approuve — Signature :', marginL + 4, y + 23);
  doc.setDrawColor(180, 190, 205);
  doc.setLineWidth(0.5);
  doc.line(marginL + 4, y + 38, marginL + sigHalfW - 4, y + 38);

  // Client sig box
  const clientSigX = marginL + sigHalfW + 8;
  doc.setDrawColor(...NAVY);
  doc.setLineWidth(0.4);
  doc.roundedRect(clientSigX, y, sigHalfW, sigBoxH, 2, 2);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...NAVY);
  doc.text('Client', clientSigX + 4, y + 7);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(...DARK);
  doc.text(clientName, clientSigX + 4, y + 14, { maxWidth: sigHalfW - 8 });
  doc.setFontSize(8);
  doc.setTextColor(...GRAY);
  doc.text('Lu et approuve — Signature :', clientSigX + 4, y + 23);
  doc.setDrawColor(180, 190, 205);
  doc.setLineWidth(0.5);
  doc.line(clientSigX + 4, y + 38, clientSigX + sigHalfW - 4, y + 38);

  drawFooter();

  // ─────────────────────────────────────────
  // PAGE 2 : Conditions Générales complètes
  // ─────────────────────────────────────────
  doc.addPage();
  drawHeader(2);
  y = 34;

  // Title
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(...NAVY);
  doc.text('CONDITIONS GENERALES DE VENTE ET DE PRESTATION', marginL, y);
  y += 5;
  doc.setFillColor(...GREEN);
  doc.rect(marginL, y, contentW, 0.8, 'F');
  y += 8;

  doc.setFont('helvetica', 'italic');
  doc.setFontSize(8);
  doc.setTextColor(...GRAY);
  doc.text('Ces conditions font partie integrante du contrat signe en page 1 et s\'appliquent a l\'ensemble des prestations fournies par Seolia.', marginL, y, { maxWidth: contentW });
  y += 10;

  const articles = [
    {
      title: 'Article 1 — Objet du contrat',
      text: 'Seolia (Florian Moers, BE 0727.941.547, ci-apres "le Prestataire") s\'engage a concevoir, deployer et maintenir un site web professionnel et/ou des services numeriques selon le forfait souscrit par le client. Les prestations incluses dans le forfait sont celles detaillees sur la fiche commerciale remise au client lors de la souscription, qui fait partie integrante du present contrat.'
    },
    {
      title: 'Article 2 — Duree et engagement minimal',
      text: 'Le present contrat est conclu pour une duree minimale de 6 (six) mois calendaires a compter de la date de signature. Apres cette periode d\'engagement, le contrat se poursuit tacitement de mois en mois et peut etre resilie par l\'une ou l\'autre des parties avec un preavis minimum d\'1 (un) mois, notifie par ecrit (courrier electronique ou courrier recommande).'
    },
    {
      title: 'Article 3 — Resiliation anticipee',
      text: 'Toute demande de resiliation formulee avant l\'echeance de la periode d\'engagement de 6 mois entraine la facturation immediate et integrale de l\'ensemble des mensualites restantes jusqu\'au terme de ladite periode, majorees de 150 EUR TVAC de frais administratifs de cloture. Ces montants sont exigibles sans delai a reception de la facture correspondante.'
    },
    {
      title: 'Article 4 — Conditions de paiement',
      text: 'Les frais de mise en place sont exigibles a la date de signature du contrat. L\'abonnement mensuel est preleve automatiquement par prelevement SEPA direct le 1er de chaque mois. Le client autorise Seolia a prelever les montants dus via le mandat SEPA signe lors de la souscription. Tout refus de prelevement sans motif valable constitue un defaut de paiement soumis a l\'article 5.'
    },
    {
      title: 'Article 5 — Non-paiement et suspension',
      text: 'En cas de non-paiement d\'une echeance, Seolia adresse une mise en demeure par courrier electronique. Sans regularisation dans un delai de 15 (quinze) jours calendaires suivant l\'envoi de cette mise en demeure, Seolia se reserve le droit de suspendre l\'integralite des services sans preavis supplementaire. La suspension du service ne met pas fin au contrat et ne supprime pas les obligations de paiement du client, qui restent integralement dues.'
    },
    {
      title: 'Article 6 — Propriete intellectuelle',
      text: 'L\'ensemble du code source, des maquettes graphiques, des fichiers de design, des scripts et de tout autre element technique cree ou configure par Seolia dans le cadre du contrat reste la propriete exclusive de Florian Moers (Seolia), pendant toute la duree du contrat et apres sa resiliation, quelle qu\'en soit la cause. Le client ne peut en aucun cas reclamer le transfert, la cession ou la copie du code source.'
    },
    {
      title: 'Article 7 — Nom de domaine',
      text: 'Le nom de domaine enregistre dans le cadre du contrat reste la propriete du client. Seolia en assure uniquement la gestion technique pendant la duree du contrat. En cas de resiliation, quelle qu\'en soit la cause, Seolia s\'engage a restituer l\'integralite des acces et le controle du nom de domaine au client dans un delai maximum de 30 (trente) jours suivant la date effective de resiliation.'
    },
    {
      title: 'Article 8 — Garanties et responsabilites',
      text: 'Seolia garantit la conformite du site web aux specifications convenues, une disponibilite cible de 99,5% par an hors maintenance planifiee et cas de force majeure, et la conformite des traitements de donnees au RGPD. Toute reclamation relative aux prestations doit etre formulee par ecrit dans les 30 jours suivant la constatation du probleme. La responsabilite de Seolia est, en toute hypothese, limitee au montant total des mensualites encaissees au cours des 3 derniers mois precedant le sinistre.'
    },
    {
      title: 'Article 9 — Protection des donnees personnelles (RGPD)',
      text: 'Seolia traite les donnees personnelles du client et, le cas echeant, de ses clients finaux, conformement au Reglement General sur la Protection des Donnees (UE) 2016/679 (RGPD) et a la loi belge du 30 juillet 2018. Les donnees collectees sont utilisees exclusivement aux fins de l\'execution du present contrat et de la relation commerciale. Le client dispose d\'un droit d\'acces, de rectification, d\'effacement et d\'opposition, exercable par courrier electronique a florianmoerspro@gmail.com. L\'autorite de controle competente est l\'Autorite de Protection des Donnees (APD) — www.autoriteprotectiondonnees.be.'
    },
    {
      title: 'Article 10 — Droit applicable et juridiction',
      text: 'Le present contrat est soumis exclusivement au droit belge. En cas de litige relatif a son interpretation ou a son execution, les parties s\'engagent a rechercher prioritairement une solution amiable avant toute action judiciaire. A defaut de resolution amiable dans un delai de 30 jours, le litige releve de la competence exclusive des tribunaux de l\'arrondissement judiciaire de Liege.'
    },
  ];

  articles.forEach((art, i) => {
    // Check if we need a new page
    if (y > 255) {
      doc.addPage();
      drawHeader(3);
      drawFooter();
      y = 34;
    }

    // Article title bar
    doc.setFillColor(...NAVY);
    doc.roundedRect(marginL, y, contentW, 7, 1, 1, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(...WHITE);
    doc.text(art.title, marginL + 4, y + 5);
    y += 9;

    // Article body
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(...DARK);
    const lines = doc.splitTextToSize(art.text, contentW);
    doc.text(lines, marginL, y);
    y += lines.length * 4.5 + 7;
  });

  drawFooter();

  // SAVE
  const safeName = clientName.replace(/[^a-zA-Z0-9]/g, '-');
  doc.save('Contrat-Seolia-' + safeName + '-' + today.getFullYear() + '.pdf');
}


function envoyerPourSignature() {
  const contact = allContacts.find(c => c.id === currentContactId);
  if (!contact) return;
  
  // Pre-fill email if available
  const emailInput = document.getElementById('signatureEmail');
  if (emailInput) emailInput.value = contact.email || '';
  
  // Show package info
  const pkgInfo = document.getElementById('signaturePackageInfo');
  if (pkgInfo) {
    const formule = contact.formule || 'Non défini';
    pkgInfo.textContent = formule;
  }
  
  document.getElementById('modalSignature').style.display = 'flex';
}

function fermerModalSignature() {
  document.getElementById('modalSignature').style.display = 'none';
}

async function confirmerEnvoiSignature() {
  const email = document.getElementById('signatureEmail').value.trim();
  if (!email) {
    alert("Veuillez saisir l'email du client.");
    return;
  }
  
  const btn = event.target;
  btn.disabled = true;
  btn.textContent = 'Envoi...';
  
  const contact = allContacts.find(c => c.id === currentContactId);
  if (!contact) return;
  
  const formule = contact.formule || '';
  let packageName = formule;
  let setupPrice = '';
  let monthlyPrice = '';
  let deliverables = '';
  
  const pricingMap = {
    'Bundle Essentiel IA': { setup: '499€ TVAC', monthly: '109€/mois TVAC', del: 'Site one-page, chatbot FAQ, automatisation Google reviews' },
    'Bundle Business IA':  { setup: '949€ TVAC', monthly: '249€/mois TVAC', del: 'Site multi-pages SEO, automatisation RDV, gestion demandes, notifications SMS' },
    'Bundle Premium IA':   { setup: '1 499€ TVAC', monthly: '449€/mois TVAC', del: 'Site premium, agent téléphonique IA 200min/mois, WhatsApp, dashboard, rapports hebdomadaires' },
    'Essentiel IA': { setup: '499€ TVAC', monthly: '109€/mois TVAC', del: 'Site one-page, chatbot FAQ, automatisation Google reviews' },
    'Business IA':  { setup: '949€ TVAC', monthly: '249€/mois TVAC', del: 'Site multi-pages SEO, automatisation RDV, gestion demandes, notifications SMS' },
    'Premium IA':   { setup: '1 499€ TVAC', monthly: '449€/mois TVAC', del: 'Site premium, agent téléphonique IA 200min/mois, WhatsApp, dashboard, rapports hebdomadaires' },
    'Web Essentiel': { setup: '149€ TVAC', monthly: '69€/mois TVAC', del: 'Site one-page professionnel, hébergement, maintenance' },
    'Web Business':  { setup: '299€ TVAC', monthly: '119€/mois TVAC', del: 'Site multi-pages, SEO on-page, hébergement, maintenance' },
    'Web Premium':   { setup: '499€ TVAC', monthly: '199€/mois TVAC', del: 'Site premium, animations, SEO avancé, hébergement, maintenance' }
  };
  
  const pricing = pricingMap[formule];
  if (pricing) {
    setupPrice = pricing.setup;
    monthlyPrice = pricing.monthly;
    deliverables = pricing.del;
  }
  // Override with manual prices from contact if set
  if (contact.prix_setup !== null && contact.prix_setup !== undefined && contact.prix_setup !== '') {
    const s = parseFloat(contact.prix_setup);
    setupPrice = s === 0 ? 'OFFERT' : s.toFixed(0) + '€ TVAC';
  }
  if (contact.prix_mensuel !== null && contact.prix_mensuel !== undefined && contact.prix_mensuel !== '') {
    const m = parseFloat(contact.prix_mensuel);
    monthlyPrice = m.toFixed(0) + '€/mois TVAC';
  }
  
  const contractData = {
    package: packageName,
    setup_price: setupPrice,
    monthly_price: monthlyPrice,
    duration: '6 mois minimum',
    deliverables: deliverables
  };
  
  try {
    const res = await fetch('https://seolia-ai-chat.seolia.workers.dev/send-contract', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contact_id: contact.id,
        contact_name: (contact.nom || '') + (contact.prenom ? ' ' + contact.prenom : ''),
        contact_email: email,
        contract_data: contractData
      })
    });
    
    const data = await res.json();
    
    if (!res.ok) throw new Error(data.error || 'Erreur');
    
    fermerModalSignature();
    showToast('Contrat envoyé à ' + email + ' — Lien de signature créé', 'success');
    
    // Log in comments
    const prenom = (currentProfile && currentProfile.prenom) || (currentUser && currentUser.email && currentUser.email.split('@')[0]) || 'Equipe';
    await sbFetch('/rest/v1/commentaires', {
      method: 'POST',
      headers: { 'Prefer': 'return=minimal' },
      body: JSON.stringify({
        contact_id: currentContactId,
        commercial_id: (currentProfile && currentProfile.id) || null,
        prenom_commercial: prenom,
        texte: 'Contrat envoyé pour signature électronique à ' + email + ' (' + packageName + ')'
      })
    });
    await loadCommentaires(currentContactId);
    
  } catch (e) {
    alert('Erreur lors de l\'envoi : ' + e.message);
  }
  
  btn.disabled = false;
  btn.textContent = '📧 Envoyer le contrat';
}

async function chargerSignatures(contactId) {
  try {
    const res = await fetch(SUPABASE_URL + '/rest/v1/signatures?contact_id=eq.' + contactId + '&order=created_at.desc', {
      headers: {
        'apikey': ANON_KEY,
        'Authorization': 'Bearer ' + currentToken
      }
    });
    
    const data = await res.json();
    
    const section = document.getElementById('signatureStatus');
    const list = document.getElementById('signaturesList');
    
    if (!section || !list) return;
    
    if (!data || data.length === 0) {
      section.style.display = 'none';
      return;
    }
    
    section.style.display = 'block';
    
    list.innerHTML = data.map(function(sig) {
      const statusColor = sig.status === 'signed' ? '#00d68f' : '#f59e0b';
      const statusText = sig.status === 'signed' ? '✅ Signé' : '⏳ En attente';
      const date = new Date(sig.status === 'signed' ? sig.signed_at : sig.created_at).toLocaleDateString('fr-BE');
      return '<div style="display:flex;justify-content:space-between;align-items:center;padding:12px;background:#f8f9fa;border-radius:6px;margin-bottom:8px;">' +
        '<div><strong>' + (sig.contract_data && sig.contract_data.package ? sig.contract_data.package : 'Contrat') + '</strong><br>' +
        '<span style="font-size:12px;color:#666;">' + date + '</span></div>' +
        '<span style="color:' + statusColor + ';font-weight:600;">' + statusText + '</span>' +
        '</div>';
    }).join('');
    
  } catch (e) {
    console.error('Erreur chargement signatures:', e);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// ONGLET SOPHIE — APPELS ENTRANTS
// ═══════════════════════════════════════════════════════════════════════════
let sophieAppelsData = [];
let sophieCurrentFilter = 'all';

async function loadSophieAppels() {
  try {
    const { data, error } = await supabase
      .from('sophie_appels')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw error;
    sophieAppelsData = data || [];
    renderSophieAppels();
  } catch(e) {
    console.error('Erreur chargement Sophie appels:', e);
  }
}

function filterSophieAppels(filter) {
  sophieCurrentFilter = filter;
  document.querySelectorAll('[id^="sophie-filter-"]').forEach(b => b.className = 'btn btn-sm btn-ghost');
  const activeBtn = filter === 'all' ? 'sophie-filter-all' : filter === 'à_traiter' ? 'sophie-filter-todo' : 'sophie-filter-done';
  document.getElementById(activeBtn).className = 'btn btn-sm btn-primary';
  renderSophieAppels();
}

function renderSophieAppels() {
  const filtered = sophieCurrentFilter === 'all'
    ? sophieAppelsData
    : sophieAppelsData.filter(a => a.statut === sophieCurrentFilter);

  const prospects = filtered.filter(a => a.categorie === 'nouveau_prospect');
  const clients = filtered.filter(a => a.categorie === 'client_existant');

  document.getElementById('badge-prospects').textContent = prospects.length;
  document.getElementById('badge-clients').textContent = clients.length;

  document.getElementById('sophie-prospects-list').innerHTML = prospects.length
    ? prospects.map(a => renderSophieCard(a)).join('')
    : '<div style="color:var(--text-muted);font-size:14px;padding:12px 0;">Aucun prospect pour ce filtre.</div>';

  document.getElementById('sophie-clients-list').innerHTML = clients.length
    ? clients.map(a => renderSophieCard(a)).join('')
    : '<div style="color:var(--text-muted);font-size:14px;padding:12px 0;">Aucun client pour ce filtre.</div>';
}

function renderSophieCard(a) {
  const date = new Date(a.created_at).toLocaleString('fr-BE', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' });
  const statutColor = a.statut === 'à_traiter' ? '#ef4444' : a.statut === 'traité' ? '#10b981' : '#94a3b8';
  const statutLabel = a.statut === 'à_traiter' ? '🔴 À traiter' : a.statut === 'traité' ? '✅ Traité' : '⬜ Ignoré';
  const isProspect = a.categorie === 'nouveau_prospect';

  return `
  <div id="sophie-card-${a.id}" style="background:var(--bg-card);border:1px solid var(--border);border-radius:12px;padding:16px;border-left:4px solid ${statutColor};">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:8px;">
      <div>
        <div style="font-weight:700;font-size:15px;color:var(--navy);">${a.nom_appelant || 'Nom inconnu'}${a.entreprise ? ' — ' + a.entreprise : ''}</div>
        <div style="font-size:12px;color:var(--text-muted);margin-top:2px;">${date}${a.ville ? ' · ' + a.ville : ''}${a.secteur ? ' · ' + a.secteur : ''}</div>
      </div>
      <span style="font-size:12px;font-weight:600;color:${statutColor};">${statutLabel}</span>
    </div>
    ${a.telephone ? `<div style="margin-top:8px;font-size:13px;">📞 <a href="tel:${a.telephone}" style="color:var(--primary);font-weight:600;">${a.telephone}</a></div>` : ''}
    <div style="margin-top:10px;font-size:13px;color:var(--text-primary);background:var(--bg-hover);border-radius:8px;padding:10px;line-height:1.5;">${a.resume}</div>
    ${a.besoin ? `<div style="margin-top:6px;font-size:12px;color:var(--text-muted);">💡 Besoin : ${a.besoin}</div>` : ''}
    ${a.disponibilites ? `<div style="margin-top:4px;font-size:12px;color:var(--text-muted);">📅 Disponibilités : ${a.disponibilites}</div>` : ''}
    <div style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap;">
      ${isProspect && a.statut !== 'traité' ? `<button class="btn btn-sm btn-primary" onclick="sophieCreerContact('${a.id}')">➕ Créer fiche contact</button>` : ''}
      ${a.statut === 'à_traiter' ? `<button class="btn btn-sm btn-ghost" onclick="sophieMarquerStatut('${a.id}','traité')">✅ Marquer traité</button>` : ''}
      ${a.statut !== 'à_traiter' ? `<button class="btn btn-sm btn-ghost" onclick="sophieMarquerStatut('${a.id}','à_traiter')">↩️ Remettre à traiter</button>` : ''}
      <button class="btn btn-sm btn-ghost" style="color:#ef4444;" onclick="sophieMarquerStatut('${a.id}','ignoré')">🗑️ Ignorer</button>
    </div>
  </div>`;
}

async function sophieMarquerStatut(id, statut) {
  const { error } = await supabase.from('sophie_appels').update({ statut }).eq('id', id);
  if (!error) await loadSophieAppels();
}

async function sophieCreerContact(appelId) {
  const appel = sophieAppelsData.find(a => a.id === appelId);
  if (!appel) return;

  // Pré-remplir le formulaire de nouveau contact puis ouvrir le modal
  if (typeof openAddContactModal === 'function') {
    openAddContactModal({
      nom: appel.nom_appelant || '',
      entreprise: appel.entreprise || '',
      telephone: appel.telephone || '',
      ville: appel.ville || '',
      secteur: appel.secteur || '',
    });
  } else {
    showView('contacts');
    alert('Créez un nouveau contact avec ces infos :\n\nNom : ' + (appel.nom_appelant || '') + '\nTél : ' + (appel.telephone || '') + '\nEntreprise : ' + (appel.entreprise || '') + '\nVille : ' + (appel.ville || ''));
  }

  // Marquer l'appel comme traité
  await sophieMarquerStatut(appelId, 'traité');
}
