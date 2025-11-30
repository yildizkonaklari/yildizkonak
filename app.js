import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore, collection, getDocs, doc, setDoc, addDoc, deleteDoc, updateDoc, getDoc, query, where, writeBatch, orderBy, enableNetwork, deleteField } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

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
            document.getElementById('userBalanceDetails').classList.remove('show');
            document.getElementById('userBalanceCard').classList.remove('active');
        }
        if (id === 'user-view-profile') loadUserProfile();
        if (id === 'user-view-expenses') loadUserExpensesTable();
    }
    document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
    const btn = document.querySelector(`.nav-item[data-target="${id}"]`);
    if(btn) btn.classList.add('active');
    
    // Close mobile menu logic
    if(window.innerWidth <= 768) {
        document.querySelector('.sidebar').classList.remove('active');
        document.getElementById('sidebarOverlay').classList.remove('active');
    }
}

// TOGGLE SIDEBAR (Mobile)
function toggleSidebar() {
    document.querySelector('.sidebar').classList.toggle('active');
    document.getElementById('sidebarOverlay').classList.toggle('active');
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
        
        if(currentAdminRole === 'viewer') {
            document.querySelectorAll('.admin-only').forEach(e => e.classList.add('hidden'));
            document.getElementById('nav-finance').style.display = 'none';
            document.getElementById('nav-settings').style.display = 'none';
        }
        
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
// 1. DASHBOARD (GÜNCELLENDİ: Son işlemleri de çeker)
async function updateAdminDashboard() {
    const m = aylar[new Date().getMonth()];
    const y = new Date().getFullYear();
    let income = 0, expense = 0, monthInc = 0, monthExp = 0, debt = 0;
    
    // Son işlemler için geçici dizi
    let recentTxns = [];

    for (const d of daireler) {
        const s = await getDocs(collection(db, 'apartments', d, 'transactions'));
        let bal = 0;
        s.forEach(x => {
            const t = x.data();
            
            // Tüm işlemleri topla (Tarih filtresi olmadan, son işlemleri görmek için)
            // Ancak listeleme yaparken sadece işlem tarihine bakarız.
            // Dashboard hesaplaması için tarih kontrolü:
            if(t.tarih <= todayStr) {
                bal += Number(t.tutar);
                if(t.tur === 'tahsilat') {
                    income += Math.abs(Number(t.tutar));
                    if(new Date(t.tarih).getMonth() === new Date().getMonth()) monthInc += Math.abs(Number(t.tutar));
                }
            }

            // Son işlemler listesine ekle (Timestamp varsa kullan, yoksa tarihe göre)
            const sortDate = t.timestamp ? t.timestamp.toDate() : new Date(t.tarih);
            recentTxns.push({
                daire: d,
                ...t,
                sortDate: sortDate
            });
        });
        if(bal > 0) debt += bal;
    }
    
    // Giderleri topla
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

    // Son İşlemleri Render Et
    renderRecentTransactions(recentTxns);
}

// YENİ FONKSİYON: Son İşlemleri Listele
function renderRecentTransactions(txns) {
    const tbody = document.getElementById('dashboardRecentTransactions');
    if(!txns || txns.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center">İşlem bulunamadı.</td></tr>';
        return;
    }

    // Tarihe göre yeniden eskiye sırala
    txns.sort((a, b) => b.sortDate - a.sortDate);
    
    // İlk 10 tanesini al
    const top10 = txns.slice(0, 10);

    tbody.innerHTML = top10.map(t => {
        const typeClass = t.tur === 'borc' ? 'status-borc' : 'status-tahsilat';
        const typeText = t.tur === 'borc' ? 'Borç' : 'Tahsilat';
        const amountColor = t.tur === 'borc' ? 'color:var(--danger)' : 'color:var(--success)';
        
        return `
            <tr>
                <td><strong>${t.daire}</strong></td>
                <td><span class="status-badge ${typeClass}">${typeText}</span></td>
                <td>${t.aciklama}</td>
                <td>${formatDate(t.tarih)}</td>
                <td style="text-align:right; font-weight:bold; ${amountColor}">
                    ${formatCurrency(Math.abs(t.tutar))}
                </td>
            </tr>
        `;
    }).join('');
}
// 2. FINANCE
async function loadAdminTransactionLedger() {
    const daire = document.getElementById("islemDaireSelect").value;
    const list = document.getElementById("adminTransactionList");
    const info = document.getElementById("userInfoDisplay");
    list.innerHTML = '';
    
    if(!daire) return; // Guard clause if nothing selected

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
            <td data-label="Tarih">${formatDate(t.tarih)}</td>
            <td data-label="Açıklama">${t.aciklama}</td>
            <td data-label="Tutar" style="${style}">${formatCurrency(t.tutar)}</td>
            <td data-label="Bakiye">${formatCurrency(bal)}</td>
            <td class="admin-only" data-label="İşlem">${btns}</td>
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
    cont.innerHTML = allApartmentsData.map(d => {
        let colorClass = 'text-muted'; // Balance 0
        if (d.balance > 0) colorClass = 'text-danger'; // Debt
        if (d.balance < 0) colorClass = 'text-success'; // Credit
        
        return `<div class="apartment-list-item" onclick="openAptDetail('${d.id}')">
            <div class="apartment-info"><span class="daire-no">${d.id}</span><span>${d.adi || ''} ${d.soyadi || ''}</span></div>
            <div class="apartment-balance"><span class="balance-value ${colorClass}">${formatCurrency(d.balance)}</span></div>
        </div>`;
    }).join('');
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
    
    if(bal < 0) document.getElementById("userUnpaidTotal").style.color = '#2b9348';
    else if (bal > 0) document.getElementById("userUnpaidTotal").style.color = '#d90429';
    else document.getElementById("userUnpaidTotal").style.color = '#333';
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

// BULK ACTIONS
document.getElementById('downloadTemplateBtn').onclick = () => {
    let csv = "data:text/csv;charset=utf-8,\uFEFFDaire,Ad,Soyad,Telefon,Mail\n";
    daireler.forEach(d => csv += `${d},,,,\n`);
    const link = document.createElement("a");
    link.href = encodeURI(csv); link.download = "sablon.csv"; link.click();
};

document.getElementById('uploadTemplateBtn').onclick = () => document.getElementById('profileTemplateInput').click();
document.getElementById('profileTemplateInput').onchange = (e) => {
    const f = e.target.files[0];
    if(!f) return;
    const r = new FileReader();
    r.onload = async (ev) => {
        const rows = ev.target.result.split('\n').slice(1);
        const b = writeBatch(db);
        rows.forEach(row => {
            const c = row.split(',');
            if(c[0] && daireler.includes(c[0].trim().toUpperCase())) {
                b.set(doc(db,'apartments',c[0].trim().toUpperCase()), {adi:c[1], soyadi:c[2], telefon:c[3], mail:c[4]}, {merge:true});
            }
        });
        await b.commit(); showMessage("settingsMessage", "Yüklendi.");
    };
    r.readAsText(f);
};

document.getElementById('downloadAllProfilesCsvBtn').onclick = async () => {
    let csv = "data:text/csv;charset=utf-8,\uFEFFDaire;Ad Soyad;Telefon;Mail;Sifre\n";
    for(const d of daireler) {
        const docSnap = await getDoc(doc(db,'apartments',d));
        const data = docSnap.data() || {};
        csv += `${d};${data.adi||''} ${data.soyadi||''};${data.telefon||''};${data.mail||''};${data.password||''}\n`;
    }
    const link = document.createElement("a");
    link.href = encodeURI(csv); link.download = "tum_profiller.csv"; link.click();
};

document.getElementById('deleteAllTransactionsBtn').onclick = async () => {
    if(confirm("DİKKAT: Tüm borç, tahsilat ve gider kayıtları silinecek! Onaylıyor musunuz?")) {
        const b = writeBatch(db);
        for(const d of daireler) {
            const s = await getDocs(collection(db,'apartments',d,'transactions'));
            s.forEach(x => b.delete(x.ref));
        }
        const es = await getDocs(collection(db,'expenses'));
        es.forEach(x => b.delete(x.ref));
        await b.commit();
        showMessage("settingsMessage", "Sıfırlandı.");
    }
};

// --- ACTIONS: Debt & Payment & Late Fee ---

// Add Debt
document.getElementById('addDebtBtn').addEventListener('click', async () => {
    const d = document.getElementById("borcKime").value, t = document.getElementById("borcTarih").value, a = document.getElementById("borcAciklama").value, m = Number(document.getElementById("borcTutar").value);
    if (!d || !t || !a || !m) return showMessage("addDebtMessage", "Eksik.", true);
    const ts = (d === "all_apartments") ? daireler : [d];
    const b = writeBatch(db);
    ts.forEach(x => b.set(doc(collection(db, 'apartments', x, 'transactions')), { tarih:t, tur:'borc', aciklama:a, tutar:m, timestamp: new Date() }));
    await b.commit(); showMessage("addDebtMessage", "Eklendi."); loadAdminTransactionLedger();
});

// Add Payment
document.getElementById('addTahsilatBtn').addEventListener('click', async () => {
    const d = document.getElementById("islemDaireSelect").value, t = document.getElementById("tahsilatTarih").value, a = document.getElementById("tahsilatAciklama").value, m = Number(document.getElementById("tahsilatTutar").value);
    if (!d || !t || !m) return showMessage("addTahsilatMessage", "Eksik.", true);
    await addDoc(collection(db, 'apartments', d, 'transactions'), { tarih:t, tur:'tahsilat', aciklama:a || 'Ödeme', tutar:-Math.abs(m), timestamp: new Date() });
    showMessage("addTahsilatMessage", "Eklendi."); loadAdminTransactionLedger();
});

// ** LATE FEE IMPLEMENTATION **
// Add Button Logic
document.getElementById('addLateFeeBtn').addEventListener('click', async () => {
    const now = new Date();
    const month = aylar[now.getMonth()];
    const year = now.getFullYear();
    const feeName = `${month} ${year} Gecikme Tazminatı`;
    
    if(!confirm(`DİKKAT: Tüm dairelerin ana borçları (Aidat/Avans) taranacak ve ödenmeyenlere %5 gecikme tazminatı eklenecek. \n\nDönem: ${feeName}\n\nOnaylıyor musunuz?`)) return;

    const b = writeBatch(db);
    let count = 0;

    for (const d of daireler) {
        // Fetch all transactions
        const s = await getDocs(collection(db, 'apartments', d, 'transactions'));
        let principalDebt = 0; // Ana Borç Toplamı
        let totalPayments = 0; // Toplam Ödeme
        
        // Check if fee already applied for this month
        let alreadyApplied = false;

        s.forEach(docSnap => {
            const t = docSnap.data();
            if(t.aciklama === feeName) alreadyApplied = true;

            // Simple Logic: Sum all debts that are NOT 'Gecikme Tazminatı' to find Principal
            // Note: This requires accurate descriptions.
            if(t.tur === 'borc') {
                if(!t.aciklama.toLowerCase().includes('gecikme')) {
                    principalDebt += Number(t.tutar);
                }
            } else if (t.tur === 'tahsilat') {
                totalPayments += Math.abs(Number(t.tutar));
            }
        });

        if(alreadyApplied) continue; // Skip if already applied

        // Remaining Principal = Principal Debt - Total Payments
        // If payments cover principal, result is <= 0.
        let remainingPrincipal = principalDebt - totalPayments;

        if (remainingPrincipal > 0) {
            const feeAmount = parseFloat((remainingPrincipal * 0.05).toFixed(2));
            const ref = doc(collection(db, 'apartments', d, 'transactions'));
            b.set(ref, {
                tarih: todayStr,
                tur: 'borc',
                aciklama: feeName,
                tutar: feeAmount,
                timestamp: new Date()
            });
            count++;
        }
    }

    if(count > 0) {
        await b.commit();
        showMessage("addDebtMessage", `${count} daireye tazminat uygulandı.`);
    } else {
        showMessage("addDebtMessage", "Uygulanacak borç bulunamadı veya zaten uygulanmış.", true);
    }
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
document.getElementById('sidebarToggle').addEventListener('click', toggleSidebar);
document.getElementById('sidebarOverlay').addEventListener('click', toggleSidebar);

document.querySelectorAll('.nav-item').forEach(b => b.addEventListener('click', (e) => switchView(e.currentTarget.dataset.target)));
document.getElementById('btnTabBorc').addEventListener('click', () => { document.querySelectorAll('.tab-content-panel').forEach(e=>e.classList.remove('active')); document.getElementById('contentTabBorc').classList.add('active'); });
document.getElementById('btnTabTahsilat').addEventListener('click', () => { document.querySelectorAll('.tab-content-panel').forEach(e=>e.classList.remove('active')); document.getElementById('contentTabTahsilat').classList.add('active'); });
document.getElementById('btnTabEkstre').addEventListener('click', () => { document.querySelectorAll('.tab-content-panel').forEach(e=>e.classList.remove('active')); document.getElementById('contentTabEkstre').classList.add('active'); loadAdminTransactionLedger(); });
document.getElementById('islemDaireSelect').addEventListener('change', () => { if(document.getElementById('contentTabEkstre').classList.contains('active')) loadAdminTransactionLedger(); });
document.getElementById('downloadAccountStatementBtn').addEventListener('click', () => {
    const daireId = document.getElementById('islemDaireSelect').value;
    if(daireId) {
        window.downloadAccountStatementPdf(daireId);
    } else {
        showMessage("adminTableMessage", "Lütfen bir daire seçin.", true);
    }
});
document.getElementById('expensePrevMonthBtn').addEventListener('click', () => { currentExpenseDate.setMonth(currentExpenseDate.getMonth()-1); updateExpenseDateDisplay(); });
document.getElementById('expenseNextMonthBtn').addEventListener('click', () => { currentExpenseDate.setMonth(currentExpenseDate.getMonth()+1); updateExpenseDateDisplay(); });
document.getElementById('publishButton').addEventListener('click', toggleExpensesVisibility);
document.getElementById('downloadMonthlyExpensesBtn').addEventListener('click', downloadMonthlyExpensesPdf);
document.getElementById('refreshDataBtn').addEventListener('click', updateAdminDashboard);
document.querySelectorAll('.modal-close').forEach(x => x.onclick = function() { this.closest('.modal').style.display = 'none'; });
document.getElementById('openTermsModal').onclick = (e) => { e.preventDefault(); document.getElementById('termsModal').style.display = 'block'; };

document.getElementById('savePasswordBtn').onclick = async () => {
    const d = document.getElementById('sifreDaire').value, p = document.getElementById('yeniSifre').value;
    if(p.length<3) return showMessage('passwordMessage','Şifre kısa',true);
    await setDoc(doc(db,'apartments',d), {password:p}, {merge:true});
    showMessage('passwordMessage', 'Güncellendi');
};
document.getElementById('saveAdminPasswordBtn').onclick = async () => {
    const p = document.getElementById('adminYeniSifre').value;
    if(p.length<5) return showMessage('passwordMessage','Şifre kısa',true);
    await setDoc(doc(db,'admin','credentials'), {password:p}, {merge:true});
    showMessage('passwordMessage', 'Admin şifresi güncellendi');
};
document.getElementById('saveViewerAdminPasswordBtn').onclick = async () => {
    const p = document.getElementById('viewerAdminYeniSifre').value;
    if(p.length<5) return showMessage('passwordMessage','Şifre kısa',true);
    await setDoc(doc(db,'admin','viewerCredentials'), {password:p}, {merge:true});
    showMessage('passwordMessage', 'Gözlemci şifresi güncellendi');
};

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

window.editApt = async (id) => {
    const d = allApartmentsData.find(x => x.id === id);
    const newName = prompt("Ad:", d.adi || ""); if(newName===null) return;
    const newSurname = prompt("Soyad:", d.soyadi || "");
    const newPhone = prompt("Telefon:", d.telefon || "");
    const newMail = prompt("Mail:", d.mail || "");
    
    await setDoc(doc(db, 'apartments', id), { adi: newName, soyadi: newSurname, telefon: newPhone, mail: newMail }, { merge: true });
    alert("Güncellendi");
    document.getElementById('apartmentDetailModal').style.display = 'none';
    loadApartmentsListPage();
};

window.delApt = async (id) => {
    if(confirm(`DİKKAT: ${id} dairesinin tüm bilgileri ve borç geçmişi silinecek!`)) {
        const b = writeBatch(db);
        const s = await getDocs(collection(db, 'apartments', id, 'transactions'));
        s.forEach(x => b.delete(x.ref));
        b.update(doc(db, 'apartments', id), { adi: deleteField(), soyadi: deleteField(), telefon: deleteField(), mail: deleteField(), adres: deleteField(), profileCompleted: deleteField() });
        await b.commit();
        alert("Silindi");
        document.getElementById('apartmentDetailModal').style.display = 'none';
        loadApartmentsListPage();
    }
};

// PDF Export (Global Scope for access from Modal)
window.downloadAccountStatementPdf = async function(daireId) {
    if(!daireId) daireId = document.getElementById("islemDaireSelect").value; // Fallback if called without ID
    if(!daireId) return alert("Daire seçiniz");

    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF();
    const q = query(collection(db, 'apartments', daireId, 'transactions'), orderBy("tarih", "asc"));
    const snap = await getDocs(q);
    
    let rows = [], bal = 0;
    snap.forEach(d => {
        const t = d.data();
        if(t.tarih > todayStr) return;
        bal += Number(t.tutar);
        rows.push([formatDate(t.tarih), t.aciklama, formatCurrency(t.tutar), formatCurrency(bal)]);
    });

    pdf.setFont('helvetica', 'normal');
    pdf.text(`${daireId} Hesap Ekstresi - ${new Date().toLocaleDateString('tr-TR')}`, 14, 20);
    pdf.autoTable({ head: [['Tarih', 'Açıklama', 'Tutar', 'Bakiye']], body: rows, startY: 30 });
    pdf.save(`${daireId}_Ekstre.pdf`);
}

// INIT
async function init() {
    try {
        await enableNetwork(db); 
        const a = await getDoc(doc(db, 'admin', 'credentials'));
        if(a.exists()) adminCredentials = a.data();
        else { adminCredentials = {username:'admin', password:'123'}; await setDoc(doc(db, 'admin', 'credentials'), adminCredentials); }
        const v = await getDoc(doc(db, 'admin', 'viewerCredentials'));
        if(v.exists()) viewerAdminCredentials = v.data();
        else { viewerAdminCredentials = {username:'YONETIM', password:'123'}; await setDoc(doc(db, 'admin', 'viewerCredentials'), viewerAdminCredentials); }
        
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
