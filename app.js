import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore, collection, getDocs, doc, setDoc, addDoc, deleteDoc, updateDoc, getDoc, query, where, writeBatch, orderBy, enableNetwork } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyC7hS2P3m2xVfHrl0ONsMrVYv6uY-R-xNU",
    authDomain: "yildizkonaklariaidat.firebaseapp.com",
    projectId: "yildizkonaklariaidat",
    storageBucket: "yildizkonaklariaidat.firebasestorage.app",
    messagingSenderId: "51493869354",
    appId: "1:51493869354:web:556e64fc918fcc813c3053",
    measurementId: "G-4110SM95RV"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// GLOBAL
let loggedInUsername = null;
let adminCredentials = {}, viewerAdminCredentials = {};
let currentAdminRole = null; 
const aylar = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
let currentExpenseDate = new Date();
let allApartmentsData = [];
const todayStr = new Date().toISOString().split('T')[0];

const daireler = [];
["A", "B", "C", "D", "E", "F", "G"].forEach(blok => { for (let i = 1; i <= 8; i++) daireler.push(`${blok}${i}`); });

// HELPER
function showMessage(id, msg, isError = false) {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = msg;
    el.classList.remove('hidden');
    el.style.color = isError ? '#d90429' : '#2b9348';
    setTimeout(() => el.classList.add('hidden'), 4000);
}
function formatCurrency(n) { return `₺${Number(n).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}`; }
function formatDate(d) { return d ? new Date(d).toLocaleDateString('tr-TR') : '-'; }
function generateRandomPassword() { return Math.random().toString(36).slice(-6).toUpperCase(); }

// NAV
function switchView(id) {
    document.querySelectorAll('.view-section').forEach(el => el.classList.add('hidden'));
    const target = document.getElementById(id);
    if(target) {
        target.classList.remove('hidden');
        if (id === 'view-dashboard') updateAdminDashboard();
        if (id === 'view-finance') loadAdminTransactionLedger();
        if (id === 'view-expenses') loadAdminExpensesTable();
        if (id === 'view-apartments') loadApartmentsListPage();
        if (id === 'user-view-debt') {
            loadUserTransactionLedger(loggedInUsername);
            // Reset accordion
            document.getElementById('userBalanceDetails').classList.remove('show');
            document.getElementById('userBalanceCard').classList.remove('active');
        }
        if (id === 'user-view-profile') loadUserProfile();
        if (id === 'user-view-expenses') loadUserExpensesTable();
    }
    document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
    const btn = document.querySelector(`.nav-item[data-target="${id}"]`);
    if(btn) btn.classList.add('active');
    if(window.innerWidth <= 768) document.querySelector('.sidebar').classList.remove('active');
}

// LOGIN
async function login() {
    const u = document.getElementById("username").value.trim().toUpperCase();
    const p = document.getElementById("password").value;
    if (!u || !p) return showMessage("loginMessage", "Bilgileri giriniz.", true);

    if (u === adminCredentials.username?.toUpperCase() && p === adminCredentials.password) {
        currentAdminRole = 'full';
        await updateDoc(doc(db, "admin", "credentials"), { lastLogin: new Date() });
        setupPanel('admin');
        return;
    }
    if (u === viewerAdminCredentials.username?.toUpperCase() && p === viewerAdminCredentials.password) {
        currentAdminRole = 'viewer';
        setupPanel('admin');
        return;
    }
    
    try {
        const d = await getDoc(doc(db, "apartments", u));
        if (!d.exists() || d.data().password !== p) return showMessage("loginMessage", "Hatalı giriş.", true);
        loggedInUsername = u;
        await updateDoc(doc(db, "apartments", u), { lastLogin: new Date() });
        setupPanel('user');
    } catch (e) { console.error(e); showMessage("loginMessage", "Hata.", true); }
}

async function setupPanel(type) {
    document.getElementById("login-container").classList.add("hidden");
    document.getElementById("app-layout").classList.remove("hidden");

    if (type === 'admin') {
        document.getElementById("admin-menu-items").classList.remove("hidden");
        document.getElementById("display-username").textContent = currentAdminRole === 'full' ? 'Yönetici' : 'Gözlemci';
        document.getElementById("display-role").textContent = 'Admin';
        if(currentAdminRole === 'viewer') document.querySelectorAll('.admin-only').forEach(e => e.classList.add('hidden'));
        
        fillFlatSelects();
        updateExpenseDateDisplay();
        document.getElementById('borcTarih').value = todayStr;
        document.getElementById('tahsilatTarih').value = todayStr;
        document.getElementById('expenseDateInput').value = todayStr;
        switchView('view-dashboard');
    } else {
        document.getElementById("user-menu-items").classList.remove("hidden");
        const d = await getDoc(doc(db, 'apartments', loggedInUsername));
        const ud = d.data();
        document.getElementById("display-username").textContent = loggedInUsername;
        document.getElementById("display-role").textContent = `${ud.adi || ''} ${ud.soyadi || ''}`;
        
        if(!ud.profileCompleted) {
            document.getElementById('registrationModal').style.display = 'block';
            document.getElementById('welcomeUserName').textContent = `${ud.adi || ''} ${ud.soyadi || ''}`;
        }
        await checkProfileAndExpensesVisibility();
        switchView('user-view-debt');
    }
}

// LOGIC
function fillFlatSelects() {
    const s = ["islemDaireSelect", "borcKime", "sifreDaire"];
    s.forEach(id => {
        const el = document.getElementById(id);
        el.innerHTML = "";
        if(id === 'borcKime') el.innerHTML += '<option value="all_apartments">Tüm Daireler</option>';
        daireler.forEach(d => el.innerHTML += `<option value="${d}">${d}</option>`);
    });
}

// 1. DASHBOARD
async function updateAdminDashboard() {
    const m = aylar[new Date().getMonth()];
    const y = new Date().getFullYear();
    let income = 0, expense = 0, monthInc = 0, monthExp = 0, debt = 0;

    for (const d of daireler) {
        const s = await getDocs(collection(db, 'apartments', d, 'transactions'));
        let bal = 0;
        s.forEach(x => {
            const t = x.data();
            if(t.tarih > todayStr) return;
            bal += Number(t.tutar);
            if(t.tur === 'tahsilat') {
                income += Math.abs(Number(t.tutar));
                if(new Date(t.tarih).getMonth() === new Date().getMonth()) monthInc += Math.abs(Number(t.tutar));
            }
        });
        if(bal > 0) debt += bal;
    }
    const eS = await getDocs(collection(db, 'expenses'));
    eS.forEach(x => {
        const e = x.data();
        expense += Number(e.tutar);
        if(e.tarih_ay === m && e.tarih_yil === y) monthExp += Number(e.tutar);
    });

    document.getElementById('dashboardTotalBalance').textContent = formatCurrency(income - expense);
    document.getElementById('dashboardMonthlyIncome').textContent = formatCurrency(monthInc);
    document.getElementById('dashboardMonthlyExpense').textContent = formatCurrency(monthExp);
    document.getElementById('dashboardUnpaidCount').textContent = formatCurrency(debt);
}

// 2. FINANCE
async function loadAdminTransactionLedger() {
    const daire = document.getElementById("islemDaireSelect").value;
    const list = document.getElementById("adminTransactionList");
    const info = document.getElementById("userInfoDisplay");
    list.innerHTML = '';
    
    const uD = allApartmentsData.find(d => d.id === daire) || {};
    info.innerHTML = `<p><strong>${daire}</strong> - ${uD.adi || ''} ${uD.soyadi || ''}</p>`;
    info.classList.remove('hidden');

    const q = query(collection(db, 'apartments', daire, 'transactions'), orderBy("tarih", "asc"));
    const s = await getDocs(q);
    let bal = 0;
    
    s.forEach(doc => {
        const t = doc.data();
        if(t.tarih > todayStr) return;
        bal += Number(t.tutar);
        const style = t.tur === 'borc' ? 'color:#d90429' : 'color:#2b9348';
        const btns = currentAdminRole === 'full' ? `<button class="btn btn-danger btn-sm" onclick="delTrans('${daire}','${doc.id}')">Sil</button>` : '';
        
        list.innerHTML += `<tr>
            <td>${formatDate(t.tarih)}</td><td>${t.aciklama}</td>
            <td style="${style}">${formatCurrency(t.tutar)}</td>
            <td>${formatCurrency(bal)}</td><td class="admin-only">${btns}</td>
        </tr>`;
    });
    document.getElementById("bakiyeToplam").textContent = `Bakiye: ${formatCurrency(bal)}`;
}

// 3. EXPENSES
function updateExpenseDateDisplay() {
    document.getElementById('expenseCurrentMonthDisplay').textContent = `${aylar[currentExpenseDate.getMonth()]} ${currentExpenseDate.getFullYear()}`;
    loadAdminExpensesTable();
}

async function loadAdminExpensesTable() {
    const m = aylar[currentExpenseDate.getMonth()];
    const y = currentExpenseDate.getFullYear();
    const list = document.getElementById("adminExpenseListContainer");
    const pubBtn = document.getElementById("publishButton");
    list.innerHTML = '';
    let total = 0;

    const pS = await getDoc(doc(db, 'settings', 'publishedExpenses'));
    const pD = pS.exists() ? pS.data() : { published: false };
    const isPub = pD.published && pD.month === m && pD.year === y;
    
    pubBtn.textContent = isPub ? 'Yayından Kaldır' : 'Yayınla';
    pubBtn.className = isPub ? 'btn btn-secondary admin-only' : 'btn btn-warning admin-only';

    const q = query(collection(db, 'expenses'), where("tarih_ay", "==", m), where("tarih_yil", "==", Number(y)));
    const s = await getDocs(q);
    
    if(s.empty) list.innerHTML = '<p style="text-align:center">Kayıt yok.</p>';
    else {
        const exps = [];
        s.forEach(d => exps.push({id: d.id, ...d.data()}));
        exps.sort((a,b) => new Date(b.tarih) - new Date(a.tarih));
        exps.forEach(e => {
            total += Number(e.tutar);
            const acts = currentAdminRole === 'full' ? `<button class="btn btn-danger btn-sm" onclick="delExp('${e.id}')">Sil</button>` : '';
            list.innerHTML += `<div class="admin-expense-card">
                <div class="admin-expense-card-content">
                    <div class="admin-expense-card-info"><span class="description">${e.harcamaAdi}</span><span class="date">${formatDate(e.tarih)}</span></div>
                    <div class="admin-expense-card-details"><span class="amount">${formatCurrency(e.tutar)}</span></div>
                </div>${acts}
            </div>`;
        });
    }
    document.getElementById("adminExpenseTotals").textContent = `Toplam: ${formatCurrency(total)}`;
}

async function toggleExpensesVisibility() {
    const m = aylar[currentExpenseDate.getMonth()];
    const y = currentExpenseDate.getFullYear();
    const ref = doc(db, 'settings', 'publishedExpenses');
    const s = await getDoc(ref);
    const d = s.exists() ? s.data() : { published: false };
    const isPub = d.published && d.month === m && d.year === y;

    if(isPub) {
        await setDoc(ref, { published: false, month: null, year: null });
        showMessage("expenseMessage", "Yayından kaldırıldı.");
    } else {
        await setDoc(ref, { published: true, month: m, year: Number(y) });
        showMessage("expenseMessage", "Yayınlandı.");
    }
    loadAdminExpensesTable();
}

async function downloadMonthlyExpensesPdf() {
    const m = aylar[currentExpenseDate.getMonth()];
    const y = currentExpenseDate.getFullYear();
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    
    const q = query(collection(db, 'expenses'), where("tarih_ay", "==", m), where("tarih_yil", "==", Number(y)));
    const s = await getDocs(q);
    
    if(s.empty) return showMessage("expenseMessage", "Veri yok.", true);
    
    let rows = [], total = 0;
    s.forEach(d => {
        const e = d.data();
        total += Number(e.tutar);
        rows.push([formatDate(e.tarih), e.harcamaAdi, formatCurrency(e.tutar)]);
    });
    
    doc.setFont("helvetica", "normal");
    doc.text(`${m} ${y} Gider Raporu`, 14, 20);
    doc.autoTable({ head: [['Tarih', 'Açıklama', 'Tutar']], body: rows, startY: 30 });
    doc.text(`Toplam: ${formatCurrency(total)}`, 14, doc.lastAutoTable.finalY + 10);
    doc.save(`Gider_${m}_${y}.pdf`);
}

// 4. APARTMENTS
async function loadApartmentsListPage() {
    allApartmentsData = [];
    for(const d of daireler) {
        const f = await getDoc(doc(db, 'apartments', d));
        let bal = 0;
        const s = await getDocs(collection(db, 'apartments', d, 'transactions'));
        s.forEach(x => { if(x.data().tarih <= todayStr) bal += Number(x.data().tutar); });
        allApartmentsData.push({ id: d, ...f.data(), balance: bal });
    }
    const cont = document.getElementById('apartmentListContainer');
    cont.innerHTML = allApartmentsData.map(d => `
        <div class="apartment-list-item" onclick="openAptDetail('${d.id}')">
            <div class="apartment-info"><span class="daire-no">${d.id}</span><span>${d.adi || ''} ${d.soyadi || ''}</span></div>
            <div class="apartment-balance"><span class="balance-value ${d.balance <= 0 ? 'zero' : ''}">${formatCurrency(d.balance)}</span></div>
        </div>`).join('');
}

// USER FUNCTIONS
async function loadUserTransactionLedger(u) {
    const list = document.getElementById("userTransactionList");
    list.innerHTML = '';
    const s = await getDocs(query(collection(db, 'apartments', u, 'transactions'), orderBy("tarih", "asc")));
    let bal = 0;
    s.forEach(doc => {
        const t = doc.data();
        if(t.tarih > todayStr) return;
        bal += Number(t.tutar);
        // data-label attributes are added for mobile CSS card view support
        list.innerHTML += `<tr>
            <td data-label="Tarih">${formatDate(t.tarih)}</td>
            <td data-label="Açıklama">${t.aciklama}</td>
            <td data-label="Tutar" style="${t.tur === 'borc' ? 'color:#d90429' : 'color:#2b9348'}">${formatCurrency(t.tutar)}</td>
            <td data-label="Bakiye">${formatCurrency(bal)}</td>
        </tr>`;
    });
    document.getElementById("userUnpaidTotal").textContent = formatCurrency(bal);
    const totEl = document.getElementById("userDebtTotals");
    totEl.textContent = `Güncel: ${formatCurrency(bal)}`;
    
    // Set color based on balance
    if(bal < 0) {
        document.getElementById("userUnpaidTotal").style.color = '#2b9348'; // Green for credit
    } else if (bal > 0) {
        document.getElementById("userUnpaidTotal").style.color = '#d90429'; // Red for debt
    } else {
        document.getElementById("userUnpaidTotal").style.color = '#333';
    }
}

async function loadUserProfile() {
    const d = await getDoc(doc(db, 'apartments', loggedInUsername));
    if(d.exists()) {
        const u = d.data();
        document.getElementById('profileDisplayView').innerHTML = `
            <p><strong>Ad Soyad:</strong> ${u.adi || ''} ${u.soyadi || ''}</p>
            <p><strong>Telefon:</strong> ${u.telefon || '-'}</p>
            <p><strong>E-posta:</strong> ${u.mail || '-'}</p>
            <p><strong>Adres:</strong> ${u.adres || '-'}</p>
        `;
    }
}

async function loadUserExpensesTable() {
    const list = document.getElementById("userExpenseList");
    const ps = await getDoc(doc(db, 'settings', 'publishedExpenses'));
    const pd = ps.exists() ? ps.data() : { published: false };
    
    if(!pd.published) {
        document.getElementById("expenseTableContainer").classList.add('hidden');
        document.getElementById("expenseNotPublishedMessage").classList.remove('hidden');
        return;
    }
    document.getElementById("expenseTableContainer").classList.remove('hidden');
    document.getElementById("expenseNotPublishedMessage").classList.add('hidden');
    
    list.innerHTML = `<h4>${pd.month} ${pd.year} Giderleri</h4>`;
    const s = await getDocs(query(collection(db, 'expenses'), where("tarih_ay", "==", pd.month), where("tarih_yil", "==", Number(pd.year))));
    let tot = 0;
    s.forEach(d => {
        const e = d.data();
        tot += Number(e.tutar);
        list.innerHTML += `<div class="admin-expense-card"><div class="admin-expense-card-content">
            <div class="admin-expense-card-info"><span class="description">${e.harcamaAdi}</span><span class="date">${formatDate(e.tarih)}</span></div>
            <div class="admin-expense-card-details"><span class="amount">${formatCurrency(e.tutar)}</span></div>
        </div></div>`;
    });
    document.getElementById("userExpenseTotals").textContent = `Toplam: ${formatCurrency(tot)}`;
}

async function checkProfileAndExpensesVisibility() {
    const u = await getDoc(doc(db, 'apartments', loggedInUsername));
    const p = await getDoc(doc(db, 'settings', 'publishedExpenses'));
    const isPub = p.exists() && p.data().published;
    const isComp = u.data().profileCompleted;
    
    if(!isComp) document.getElementById('nav-user-expenses').classList.add('hidden');
    else if(isPub) document.getElementById('nav-user-expenses').classList.remove('hidden');
}

// ACTIONS
document.getElementById('addDebtBtn').addEventListener('click', async () => {
    const d = document.getElementById("borcKime").value, t = document.getElementById("borcTarih").value, a = document.getElementById("borcAciklama").value, m = Number(document.getElementById("borcTutar").value);
    if (!d || !t || !a || !m) return showMessage("addDebtMessage", "Eksik.", true);
    const ts = (d === "all_apartments") ? daireler : [d];
    const b = writeBatch(db);
    ts.forEach(x => b.set(doc(collection(db, 'apartments', x, 'transactions')), { tarih:t, tur:'borc', aciklama:a, tutar:m, timestamp: new Date() }));
    await b.commit(); showMessage("addDebtMessage", "Eklendi."); loadAdminTransactionLedger();
});

document.getElementById('addTahsilatBtn').addEventListener('click', async () => {
    const d = document.getElementById("islemDaireSelect").value, t = document.getElementById("tahsilatTarih").value, a = document.getElementById("tahsilatAciklama").value, m = Number(document.getElementById("tahsilatTutar").value);
    if (!d || !t || !m) return showMessage("addTahsilatMessage", "Eksik.", true);
    await addDoc(collection(db, 'apartments', d, 'transactions'), { tarih:t, tur:'tahsilat', aciklama:a || 'Ödeme', tutar:-Math.abs(m), timestamp: new Date() });
    showMessage("addTahsilatMessage", "Eklendi."); loadAdminTransactionLedger();
});

document.getElementById('saveExpenseBtn').addEventListener('click', async () => {
    const d = document.getElementById("expenseDateInput").value, n = document.getElementById("expenseNameInput").value, a = Number(document.getElementById("expenseAmountInput").value);
    if(!d || !n || !a) return showMessage("expenseMessage", "Eksik.", true);
    const date = new Date(d);
    await addDoc(collection(db, 'expenses'), { tarih:d, harcamaAdi:n, tutar:a, tarih_ay:aylar[date.getMonth()], tarih_yil:date.getFullYear(), timestamp: new Date() });
    showMessage("expenseMessage", "Eklendi."); loadAdminExpensesTable();
});

// LISTENERS
document.getElementById('loginButton').addEventListener('click', login);
document.getElementById('loginTerms').addEventListener('change', (e) => document.getElementById('loginButton').disabled = !e.target.checked);
document.getElementById('logoutBtn').addEventListener('click', () => location.reload());
document.getElementById('sidebarToggle').addEventListener('click', () => document.querySelector('.sidebar').classList.toggle('active'));
document.querySelectorAll('.nav-item').forEach(b => b.addEventListener('click', (e) => switchView(e.currentTarget.dataset.target)));
document.getElementById('btnTabBorc').addEventListener('click', () => { document.querySelectorAll('.tab-content-panel').forEach(e=>e.classList.remove('active')); document.getElementById('contentTabBorc').classList.add('active'); });
document.getElementById('btnTabTahsilat').addEventListener('click', () => { document.querySelectorAll('.tab-content-panel').forEach(e=>e.classList.remove('active')); document.getElementById('contentTabTahsilat').classList.add('active'); });
document.getElementById('btnTabEkstre').addEventListener('click', () => { document.querySelectorAll('.tab-content-panel').forEach(e=>e.classList.remove('active')); document.getElementById('contentTabEkstre').classList.add('active'); loadAdminTransactionLedger(); });
document.getElementById('islemDaireSelect').addEventListener('change', () => { if(document.getElementById('contentTabEkstre').classList.contains('active')) loadAdminTransactionLedger(); });
document.getElementById('expensePrevMonthBtn').addEventListener('click', () => { currentExpenseDate.setMonth(currentExpenseDate.getMonth()-1); updateExpenseDateDisplay(); });
document.getElementById('expenseNextMonthBtn').addEventListener('click', () => { currentExpenseDate.setMonth(currentExpenseDate.getMonth()+1); updateExpenseDateDisplay(); });
document.getElementById('publishButton').addEventListener('click', toggleExpensesVisibility);
document.getElementById('downloadMonthlyExpensesBtn').addEventListener('click', downloadMonthlyExpensesPdf);
document.getElementById('refreshDataBtn').addEventListener('click', updateAdminDashboard);
document.querySelectorAll('.modal-close').forEach(x => x.onclick = function() { this.closest('.modal').style.display = 'none'; });
document.getElementById('openTermsModal').onclick = (e) => { e.preventDefault(); document.getElementById('termsModal').style.display = 'block'; };

// Balance Accordion Listener
document.getElementById('userBalanceCard').addEventListener('click', function() {
    this.classList.toggle('active');
    document.getElementById('userBalanceDetails').classList.toggle('show');
});

// WINDOW EXPORTS
window.delTrans = async (d, id) => { if(confirm("Sil?")) { await deleteDoc(doc(db, 'apartments', d, 'transactions', id)); loadAdminTransactionLedger(); } };
window.delExp = async (id) => { if(confirm("Sil?")) { await deleteDoc(doc(db, 'expenses', id)); loadAdminExpensesTable(); } };
window.openAptDetail = async (id) => {
    const d = allApartmentsData.find(x => x.id === id);
    document.getElementById('apartmentDetailContent').innerHTML = `<p>${d.adi||''} ${d.soyadi||''}</p><p>Bakiye: ${formatCurrency(d.balance)}</p>`;
    document.getElementById('apartmentDetailModal').style.display = 'block';
};

// INIT
async function init() {
    try {
        await enableNetwork(db); // THIS WAS THE MISSING FUNCTION CAUSING THE ERROR
        const a = await getDoc(doc(db, 'admin', 'credentials'));
        if(a.exists()) adminCredentials = a.data();
        else { adminCredentials = {username:'admin', password:'123'}; await setDoc(doc(db, 'admin', 'credentials'), adminCredentials); }
        const v = await getDoc(doc(db, 'admin', 'viewerCredentials'));
        if(v.exists()) viewerAdminCredentials = v.data();
        else { viewerAdminCredentials = {username:'YONETIM', password:'123'}; await setDoc(doc(db, 'admin', 'viewerCredentials'), viewerAdminCredentials); }
        
        // Ensure apartments have passwords
        const b = writeBatch(db); let c = 0;
        for(const d of daireler) {
            const r = doc(db, 'apartments', d);
            const s = await getDoc(r);
            if(!s.exists()) { b.set(r, {password: generateRandomPassword()}, {merge:true}); c++; }
        }
        if(c>0) await b.commit();
    } catch (e) {
        console.error("Init Error:", e);
    }
}
init();
