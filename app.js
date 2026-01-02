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

// YEREL TARİH HESAPLAMA
const today = new Date();
const year = today.getFullYear();
const month = String(today.getMonth() + 1).padStart(2, '0');
const day = String(today.getDate()).padStart(2, '0');
const todayStr = `${year}-${month}-${day}`; 

const daireler = [];
["A", "B", "C", "D", "E", "F", "G"].forEach(blok => { for (let i = 1; i <= 8; i++) daireler.push(`${blok}${i}`); });

// Değişkenler
let allReportData = [];
let filteredReportData = [];
let currentReportPage = 1;
const itemsPerPage = 20;

let adminLedgerData = [];
let adminLedgerPage = 1;
let userLedgerData = [];
let userLedgerPage = 1;
const LEDGER_ITEMS_PER_PAGE = 15;

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

// --- GÜVENLİ SIRALAMA FONKSİYONLARI (DÜZELTME) ---
// Tarih aynıysa Timestamp'e bakar, o da yoksa 0 döner.
const getSortValue = (t) => {
    const dateVal = new Date(t.tarih).getTime();
    // Timestamp varsa milisaniyesini al, yoksa 0
    const timeVal = t.timestamp && t.timestamp.toDate ? t.timestamp.toDate().getTime() : 0;
    return { dateVal, timeVal };
};

// Eskiden Yeniye (Hesaplama İçin)
const sortAsc = (a, b) => {
    const vA = getSortValue(a);
    const vB = getSortValue(b);
    if (vA.dateVal !== vB.dateVal) return vA.dateVal - vB.dateVal;
    return vA.timeVal - vB.timeVal;
};

// Yeniden Eskiye (Gösterim İçin)
const sortDesc = (a, b) => {
    const vA = getSortValue(a);
    const vB = getSortValue(b);
    if (vB.dateVal !== vA.dateVal) return vB.dateVal - vA.dateVal;
    return vB.timeVal - vA.timeVal;
};


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
        if (id === 'view-reports') loadReportsPage();
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
    
    if(window.innerWidth <= 768) {
        document.querySelector('.sidebar').classList.remove('active');
        document.getElementById('sidebarOverlay').classList.remove('active');
    }
}

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
        sessionStorage.setItem('aidatSession', JSON.stringify({ role: 'admin', type: 'full', user: 'admin' }));
        setupPanel('admin');
        return;
    }
    if (u === viewerAdminCredentials.username?.toUpperCase() && p === viewerAdminCredentials.password) {
        currentAdminRole = 'viewer';
        sessionStorage.setItem('aidatSession', JSON.stringify({ role: 'admin', type: 'viewer', user: 'viewer' }));
        setupPanel('admin');
        return;
    }
    
    try {
        const d = await getDoc(doc(db, "apartments", u));
        if (!d.exists() || d.data().password !== p) return showMessage("loginMessage", "Hatalı giriş.", true);
        loggedInUsername = u;
        await updateDoc(doc(db, "apartments", u), { lastLogin: new Date() });
        sessionStorage.setItem('aidatSession', JSON.stringify({ role: 'user', user: u }));
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
            document.getElementById('welcomeMessageText').innerHTML = 
                `Değerli Site Sakinimiz <strong>${ud.adi || ''} ${ud.soyadi || ''}</strong>, <br>Ayvalık Yıldız Konakları Site Yönetim Sistemine hoş geldiniz. Site kaydınızı oluşturmak için lütfen aşağıdaki formu doldurunuz.`;
        }
        await checkProfileAndExpensesVisibility();
        switchView('user-view-debt');
    }
}

function fillFlatSelects() {
    const s = ["islemDaireSelect", "borcKime", "sifreDaire"];
    s.forEach(id => {
        const el = document.getElementById(id);
        el.innerHTML = "";
        if(id === 'borcKime') el.innerHTML += '<option value="all_apartments">Tüm Daireler</option>';
        daireler.forEach(d => el.innerHTML += `<option value="${d}">${d}</option>`);
    });
}

// ----------------------------------------------------
// *** RAPORLAMA ***
// ----------------------------------------------------
async function loadReportsPage() {
    const sel = document.getElementById('reportFlatFilter');
    if(sel.options.length === 0) {
        sel.innerHTML = '<option value="all">Tüm Daireler</option>';
        daireler.forEach(d => sel.innerHTML += `<option value="${d}">${d}</option>`);
    }
    if(!document.getElementById('reportStartDate').value) {
        const d = new Date(); d.setMonth(d.getMonth()-1);
        document.getElementById('reportStartDate').value = d.toISOString().split('T')[0];
        document.getElementById('reportEndDate').value = todayStr;
    }
}

document.getElementById('applyReportFilterBtn').addEventListener('click', async () => {
    const type = document.getElementById('reportTypeFilter').value;
    if(type === 'debtors') {
        await fetchDebtorsReport();
    } else {
        await fetchAllReportData();
    }
});

async function fetchDebtorsReport() {
    document.getElementById('reportTableBody').innerHTML = '<tr><td colspan="5" style="text-align:center;">Borçlu listesi hazırlanıyor...</td></tr>';
    
    const promises = daireler.map(async (d) => {
        const docSnap = await getDoc(doc(db, 'apartments', d));
        const userData = docSnap.exists() ? docSnap.data() : {};
        const fullName = `${userData.adi || ''} ${userData.soyadi || ''}`.trim() || 'Bilgi Yok';

        const q = query(collection(db, 'apartments', d, 'transactions'));
        const tSnap = await getDocs(q);
        
        let bal = 0;
        tSnap.forEach(t => {
             if(t.data().tarih <= todayStr) bal += Number(t.data().tutar);
        });

        if(bal > 0) {
            return {
                date: todayStr,
                type: 'debtor',
                typeLabel: 'Borçlu',
                owner: d,
                desc: fullName,
                amount: bal
            };
        }
        return null;
    });

    const results = await Promise.all(promises);
    filteredReportData = results.filter(r => r !== null);
    filteredReportData.sort((a,b) => b.amount - a.amount);

    let totalReceivable = 0;
    filteredReportData.forEach(i => totalReceivable += i.amount);
    
    document.getElementById('repTotalInc').textContent = '-';
    document.getElementById('repTotalExp').textContent = '-';
    document.getElementById('repNetBal').textContent = formatCurrency(totalReceivable) + " (Top. Alacak)";

    currentReportPage = 1;
    renderReportTable();
}

async function fetchAllReportData() {
    document.getElementById('reportTableBody').innerHTML = '<tr><td colspan="5" style="text-align:center;">Veriler yükleniyor, lütfen bekleyiniz...</td></tr>';
    allReportData = [];

    const expSnap = await getDocs(collection(db, 'expenses'));
    expSnap.forEach(d => {
        const e = d.data();
        allReportData.push({
            date: e.tarih,
            type: 'expense',
            typeLabel: 'Gider',
            owner: 'Site Yönetimi',
            desc: e.harcamaAdi,
            amount: Number(e.tutar),
            sortDate: new Date(e.tarih),
            timestamp: e.timestamp
        });
    });

    const promises = daireler.map(async (d) => {
        const tSnap = await getDocs(collection(db, 'apartments', d, 'transactions'));
        tSnap.forEach(t => {
            const tr = t.data();
            if(tr.tarih > todayStr) return;

            let typeLabel = 'Bilinmiyor';
            if (tr.tur === 'borc') {
                if (tr.aciklama.toLowerCase().includes('demirbaş')) typeLabel = 'Demirbaş Borcu';
                else if (tr.aciklama.toLowerCase().includes('gecikme')) typeLabel = 'Gecikme Tazminatı';
                else typeLabel = 'Aidat/Borç';
            } else {
                typeLabel = 'Tahsilat';
            }
            
            allReportData.push({
                date: tr.tarih,
                type: tr.tur === 'borc' ? 'debt' : 'income',
                typeLabel: typeLabel,
                owner: d,
                desc: tr.aciklama,
                amount: Math.abs(Number(tr.tutar)),
                sortDate: new Date(tr.tarih),
                timestamp: tr.timestamp
            });
        });
    });

    await Promise.all(promises);
    
    // Sort using helper
    allReportData.sort(sortDesc);
    applyReportFilters();
}

function applyReportFilters() {
    const sDate = document.getElementById('reportStartDate').value;
    const eDate = document.getElementById('reportEndDate').value;
    const type = document.getElementById('reportTypeFilter').value;
    const flat = document.getElementById('reportFlatFilter').value;

    filteredReportData = allReportData.filter(item => {
        let pass = true;
        if(item.date < sDate || item.date > eDate) pass = false;
        
        if(pass && type !== 'all') {
            if(type === 'income' && item.type !== 'income') pass = false;
            if(type === 'expense' && item.type !== 'expense') pass = false;
            if(type === 'debt' && item.type !== 'debt') pass = false;
        }

        if(pass && flat !== 'all') {
            if(item.owner !== flat) pass = false;
        }
        return pass;
    });

    let tInc = 0, tExp = 0;
    filteredReportData.forEach(i => {
        if(i.type === 'income') tInc += i.amount;
        if(i.type === 'expense') tExp += i.amount;
    });
    
    const net = tInc - tExp;

    document.getElementById('repTotalInc').textContent = formatCurrency(tInc);
    document.getElementById('repTotalExp').textContent = formatCurrency(tExp);
    document.getElementById('repNetBal').textContent = formatCurrency(net);

    currentReportPage = 1;
    renderReportTable();
}

function renderReportTable() {
    const tbody = document.getElementById('reportTableBody');
    const start = (currentReportPage - 1) * itemsPerPage;
    const end = start + itemsPerPage;
    const pageData = filteredReportData.slice(start, end);
    const totalPages = Math.ceil(filteredReportData.length / itemsPerPage);

    document.getElementById('pageIndicator').textContent = `Sayfa ${currentReportPage} / ${totalPages || 1}`;
    document.getElementById('prevPageBtn').disabled = currentReportPage === 1;
    document.getElementById('nextPageBtn').disabled = currentReportPage === totalPages || totalPages === 0;

    if(pageData.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">Kayıt bulunamadı.</td></tr>';
        return;
    }

    tbody.innerHTML = pageData.map(item => {
        let color = '#333';
        if(item.type === 'income') color = '#2b9348';
        if(item.type === 'expense') color = '#d90429';
        if(item.type === 'debt') color = '#ffb703';
        if(item.type === 'debtor') color = '#d90429';

        return `<tr>
            <td data-label="Tarih">${formatDate(item.date)}</td>
            <td data-label="Tür">${item.typeLabel}</td>
            <td data-label="Kişi/Yer"><strong>${item.owner}</strong></td>
            <td data-label="Açıklama">${item.desc}</td>
            <td data-label="Tutar" style="color:${color}; font-weight:bold;">${formatCurrency(item.amount)}</td>
        </tr>`;
    }).join('');
}

function downloadReportPdf() {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    
    doc.setFont("helvetica", "normal");
    doc.text("Site Finansal Raporu", 14, 15);
    doc.setFontSize(10);
    doc.text(`Tarih: ${formatDate(todayStr)}`, 14, 22);

    const rows = filteredReportData.map(item => [
        formatDate(item.date),
        item.typeLabel,
        item.owner,
        item.desc,
        formatCurrency(item.amount)
    ]);

    doc.autoTable({
        head: [['Tarih', 'Tür', 'İlgili', 'Açıklama', 'Tutar']],
        body: rows,
        startY: 30,
        styles: { font: "helvetica", fontSize: 9 },
        headStyles: { fillColor: [1, 79, 134] }
    });

    const finalY = doc.lastAutoTable.finalY + 10;
    if(document.getElementById('reportTypeFilter').value !== 'debtors') {
        doc.text(`Toplam Gelir: ${document.getElementById('repTotalInc').textContent}`, 14, finalY);
        doc.text(`Toplam Gider: ${document.getElementById('repTotalExp').textContent}`, 14, finalY + 6);
        doc.text(`Net Kasa: ${document.getElementById('repNetBal').textContent}`, 14, finalY + 12);
    } else {
        doc.text(`Toplam Alacak: ${document.getElementById('repNetBal').textContent}`, 14, finalY);
    }

    doc.save('Site_Raporu.pdf');
}

document.getElementById('downloadReportPdfBtn').addEventListener('click', downloadReportPdf);
document.getElementById('prevPageBtn').addEventListener('click', () => { if(currentReportPage > 1) { currentReportPage--; renderReportTable(); }});
document.getElementById('nextPageBtn').addEventListener('click', () => { if(currentReportPage * itemsPerPage < filteredReportData.length) { currentReportPage++; renderReportTable(); }});

// --- 1. DASHBOARD ---
async function updateAdminDashboard() {
    const m = aylar[new Date().getMonth()];
    const y = new Date().getFullYear();
    let income = 0, expense = 0, monthInc = 0, monthExp = 0, debt = 0;
    
    let recentTxns = [];

    for (const d of daireler) {
        const s = await getDocs(collection(db, 'apartments', d, 'transactions'));
        let bal = 0;
        s.forEach(x => {
            const t = x.data();
            if(t.tarih <= todayStr) {
                bal += Number(t.tutar);
                if(t.tur === 'tahsilat') {
                    income += Math.abs(Number(t.tutar));
                    if(new Date(t.tarih).getMonth() === new Date().getMonth()) monthInc += Math.abs(Number(t.tutar));
                }
                
                recentTxns.push({ daire: d, ...t });
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

    const elTotal = document.getElementById('dashboardTotalBalance');
    if(elTotal) elTotal.textContent = formatCurrency(income - expense);
    const elInc = document.getElementById('dashboardMonthlyIncome');
    if(elInc) elInc.textContent = formatCurrency(monthInc);
    const elExp = document.getElementById('dashboardMonthlyExpense');
    if(elExp) elExp.textContent = formatCurrency(monthExp);
    const elDebt = document.getElementById('dashboardUnpaidCount');
    if(elDebt) elDebt.textContent = formatCurrency(debt);
    
    // Sort recent using robust sort
    recentTxns.sort(sortDesc);
    renderRecentTransactions(recentTxns);
}

function renderRecentTransactions(txns) {
    const tbody = document.getElementById('dashboardRecentTransactions');
    if(!tbody) return;
    if(!txns || txns.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center">İşlem bulunamadı.</td></tr>';
        return;
    }
    const top10 = txns.slice(0, 10);

    tbody.innerHTML = top10.map(t => {
        const typeClass = t.tur === 'borc' ? 'status-borc' : 'status-tahsilat';
        const typeText = t.tur === 'borc' ? 'Borç' : 'Tahsilat';
        const color = t.tur === 'borc' ? 'color:#d90429' : 'color:#2b9348';
        return `<tr>
            <td><strong>${t.daire}</strong></td>
            <td><span class="status-badge ${typeClass}">${typeText}</span></td>
            <td>${t.aciklama}</td>
            <td>${formatDate(t.tarih)}</td>
            <td style="text-align:right; font-weight:bold; ${color}">${formatCurrency(Math.abs(t.tutar))}</td>
        </tr>`;
    }).join('');
}

// 2. FİNANS (SAYFALAMALI VE FİLTRELİ)
async function loadAdminTransactionLedger() {
    const daire = document.getElementById("islemDaireSelect").value;
    const list = document.getElementById("adminTransactionList");
    const info = document.getElementById("userInfoDisplay");
    list.innerHTML = '';
    
    if(!daire) return; 

    const uD = allApartmentsData.find(d => d.id === daire) || {};
    info.innerHTML = `<p><strong>${daire}</strong> - ${uD.adi || ''} ${uD.soyadi || ''}</p>`;
    info.classList.remove('hidden');

    const q = query(collection(db, 'apartments', daire, 'transactions'), orderBy("tarih", "asc"));
    const s = await getDocs(q);
    
    const allTrans = [];
    s.forEach(doc => {
        const t = doc.data();
        if(t.tarih <= todayStr) {
            allTrans.push({ id: doc.id, ...t });
        }
    });
    
    // 1. Bakiyeyi Hesapla (Eskiden -> Yeniye)
    // Timestamp destekli sıralama
    allTrans.sort(sortAsc);
    
    let bal = 0;
    allTrans.forEach(t => {
        bal += Number(t.tutar);
        t.currentBalance = bal;
    });

    // 2. Görüntülemek için Ters Çevir (Yeniden -> Eskiye)
    allTrans.sort(sortDesc);
    
    adminLedgerData = allTrans;
    adminLedgerPage = 1;
    
    renderAdminLedgerTable();
}

function renderAdminLedgerTable() {
    const list = document.getElementById("adminTransactionList");
    list.innerHTML = '';
    
    const daireId = document.getElementById("islemDaireSelect").value;

    const start = (adminLedgerPage - 1) * LEDGER_ITEMS_PER_PAGE;
    const end = start + LEDGER_ITEMS_PER_PAGE;
    const pageData = adminLedgerData.slice(start, end);
    const totalPages = Math.ceil(adminLedgerData.length / LEDGER_ITEMS_PER_PAGE);

    const pagContainer = document.getElementById("adminLedgerPagination");
    pagContainer.style.display = totalPages > 1 ? 'flex' : 'none';
    pagContainer.innerHTML = `
        <button class="btn btn-sm btn-outline" ${adminLedgerPage === 1 ? 'disabled' : ''} onclick="changeAdminLedgerPage(-1)">«</button>
        <span>Sayfa ${adminLedgerPage} / ${totalPages}</span>
        <button class="btn btn-sm btn-outline" ${adminLedgerPage === totalPages ? 'disabled' : ''} onclick="changeAdminLedgerPage(1)">»</button>
    `;

    if(pageData.length === 0) {
        list.innerHTML = '<tr><td colspan="5" style="text-align:center">Kayıt yok.</td></tr>';
    } else {
        pageData.forEach(t => {
             const style = t.tur === 'borc' ? 'color:#d90429' : 'color:#2b9348';
             const deleteBtn = currentAdminRole === 'full' ? 
                `<button class="btn btn-danger btn-sm" onclick="delTrans('${daireId}', '${t.id}')">Sil</button>` : 
                '-';

             list.innerHTML += `<tr>
                <td data-label="Tarih">${formatDate(t.tarih)}</td>
                <td data-label="Açıklama">${t.aciklama}</td>
                <td data-label="Tutar" style="${style}">${formatCurrency(t.tutar)}</td>
                <td data-label="Bakiye">${formatCurrency(t.currentBalance)}</td>
                <td class="admin-only" data-label="İşlem">${deleteBtn}</td> 
            </tr>`;
        });
    }
    
    // Son bakiye en üstteki kaydın bakiyesidir
    const finalBal = adminLedgerData.length > 0 ? adminLedgerData[0].currentBalance : 0;
    document.getElementById("bakiyeToplam").textContent = `Güncel Bakiye: ${formatCurrency(finalBal)}`;
}

window.changeAdminLedgerPage = (delta) => {
    adminLedgerPage += delta;
    renderAdminLedgerTable();
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
    
    list.innerHTML = `<h4 style="color:#014f86; margin-bottom:15px;">${pd.month} ${pd.year} Dönemi Giderleri</h4>`;
    
    const q = query(collection(db, 'expenses'), where("tarih_ay", "==", pd.month), where("tarih_yil", "==", Number(pd.year)));
    const s = await getDocs(q);
    let tot = 0;
    
    if(s.empty) {
        list.innerHTML += '<p style="text-align:center; color:#666;">Bu dönem için kayıtlı gider bulunamadı.</p>';
    } else {
        s.forEach(d => {
            const e = d.data();
            tot += Number(e.tutar);
            list.innerHTML += `<div class="admin-expense-card">
                <div class="admin-expense-card-content">
                    <div class="admin-expense-card-info"><span class="description">${e.harcamaAdi}</span><span class="date">${formatDate(e.tarih)}</span></div>
                    <div class="admin-expense-card-details"><span class="amount">${formatCurrency(e.tutar)}</span></div>
                </div>
            </div>`;
        });
    }
    document.getElementById("userExpenseTotals").textContent = `Toplam Gider: ${formatCurrency(tot)}`;
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

// 4. APARTMENTS LIST
async function loadApartmentsListPage() {
    const cont = document.getElementById('apartmentListContainer');
    cont.innerHTML = '<div style="text-align:center; padding:20px; color:#666;">Daireler Yükleniyor...</div>';
    
    allApartmentsData = [];
    
    const promises = daireler.map(async (d) => {
        const docRef = doc(db, 'apartments', d);
        const docSnap = await getDoc(docRef);
        const data = docSnap.exists() ? docSnap.data() : {};
        
        const transRef = collection(db, 'apartments', d, 'transactions');
        const transSnap = await getDocs(transRef);
        
        let bal = 0;
        transSnap.forEach(t => {
             if(t.data().tarih <= todayStr) bal += Number(t.data().tutar);
        });
        
        return { id: d, ...data, balance: bal };
    });

    allApartmentsData = await Promise.all(promises);
    renderApartmentList(allApartmentsData);
}

function renderApartmentList(list) {
    const container = document.getElementById('apartmentListContainer');
    if (list.length === 0) {
        container.innerHTML = '<p style="text-align:center">Bulunamadı.</p>';
        return;
    }
    
    container.innerHTML = list.map(d => {
        let colorClass = 'text-muted'; 
        if (d.balance > 0) colorClass = 'text-danger'; 
        if (d.balance < 0) colorClass = 'text-success'; 
        
        return `<div class="apartment-list-item" onclick="openAptDetail('${d.id}')">
            <div class="apartment-info">
                <span class="daire-no">${d.id}</span>
                <span class="owner-name">${d.adi || 'Bilgi Yok'} ${d.soyadi || ''}</span>
            </div>
            <div class="apartment-balance">
                <span class="balance-value ${colorClass}">${formatCurrency(d.balance)}</span>
            </div>
        </div>`;
    }).join('');
}

// KULLANICI FONKSİYONLARI (FİLTRELİ VE SAYFALAMALI)
async function loadUserTransactionLedger(u) {
    const list = document.getElementById("userTransactionList");
    list.innerHTML = '';
    const s = await getDocs(query(collection(db, 'apartments', u, 'transactions'), orderBy("tarih", "asc")));
    
    const allTrans = [];
    s.forEach(doc => {
        const t = doc.data();
        if(t.tarih <= todayStr) {
            allTrans.push(t);
        }
    });
    
    // 1. Calculate Balance (Old -> New)
    allTrans.sort(sortAsc);
    
    let bal = 0;
    allTrans.forEach(t => {
        bal += Number(t.tutar);
        t.currentBalance = bal;
    });

    // 2. Reverse for Display (New -> Old)
    allTrans.sort(sortDesc);

    userLedgerData = allTrans;
    userLedgerPage = 1;

    renderUserLedgerTable();
}

function renderUserLedgerTable() {
    const list = document.getElementById("userTransactionList");
    list.innerHTML = '';
    
    const start = (userLedgerPage - 1) * LEDGER_ITEMS_PER_PAGE;
    const end = start + LEDGER_ITEMS_PER_PAGE;
    const pageData = userLedgerData.slice(start, end);
    const totalPages = Math.ceil(userLedgerData.length / LEDGER_ITEMS_PER_PAGE);
    
    const pagContainer = document.getElementById("userLedgerPagination");
    pagContainer.style.display = totalPages > 1 ? 'flex' : 'none';
    pagContainer.innerHTML = `
        <button class="btn btn-sm btn-outline" ${userLedgerPage === 1 ? 'disabled' : ''} onclick="changeUserLedgerPage(-1)">«</button>
        <span>Sayfa ${userLedgerPage} / ${totalPages}</span>
        <button class="btn btn-sm btn-outline" ${userLedgerPage === totalPages ? 'disabled' : ''} onclick="changeUserLedgerPage(1)">»</button>
    `;

    if(pageData.length === 0) {
        list.innerHTML = '<tr><td colspan="4">Kayıt yok.</td></tr>';
    } else {
        pageData.forEach(t => {
            const style = t.tur === 'borc' ? 'color:#d90429' : 'color:#2b9348';
            list.innerHTML += `<tr>
                <td data-label="Tarih">${formatDate(t.tarih)}</td>
                <td data-label="Açıklama">${t.aciklama}</td>
                <td data-label="Tutar" style="${style}">${formatCurrency(t.tutar)}</td>
                <td data-label="Bakiye">${formatCurrency(t.currentBalance)}</td>
            </tr>`;
        });
    }

    const finalBal = userLedgerData.length > 0 ? userLedgerData[0].currentBalance : 0;
    document.getElementById("userUnpaidTotal").textContent = formatCurrency(finalBal);
    const totEl = document.getElementById("userDebtTotals");
    totEl.textContent = `Güncel: ${formatCurrency(finalBal)}`;
    
    if(finalBal < 0) document.getElementById("userUnpaidTotal").style.color = '#2b9348';
    else if (finalBal > 0) document.getElementById("userUnpaidTotal").style.color = '#d90429';
    else document.getElementById("userUnpaidTotal").style.color = '#333';
}

window.changeUserLedgerPage = (delta) => {
    userLedgerPage += delta;
    renderUserLedgerTable();
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

async function checkProfileAndExpensesVisibility() {
    const u = await getDoc(doc(db, 'apartments', loggedInUsername));
    const p = await getDoc(doc(db, 'settings', 'publishedExpenses'));
    const isPub = p.exists() && p.data().published;
    const isComp = u.data().profileCompleted;
    
    if(!isComp) document.getElementById('nav-user-expenses').classList.add('hidden');
    else if(isPub) document.getElementById('nav-user-expenses').classList.remove('hidden');
}

// BORÇ EKLEME
document.getElementById('addDebtBtn').addEventListener('click', async () => {
    const d = document.getElementById("borcKime").value;
    const t = document.getElementById("borcTarih").value;
    const a = document.getElementById("borcAciklama").value;
    const m = Number(document.getElementById("borcTutar").value);
    const repeat = Number(document.getElementById("debtRepeatCount").value) || 1;

    if (!d || !t || !a || !m) return showMessage("addDebtMessage", "Eksik.", true);

    const ts = (d === "all_apartments") ? daireler : [d];
    const b = writeBatch(db);
    
    let startDate = new Date(t);

    for(let i=0; i<repeat; i++) {
        let currentDate = new Date(startDate);
        currentDate.setMonth(startDate.getMonth() + i);
        const dateStr = currentDate.toISOString().split('T')[0];
        
        const displayDate = currentDate.toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' });
        const desc = repeat > 1 ? `${a} - ${displayDate}` : a;

        ts.forEach(x => {
            const ref = doc(collection(db, 'apartments', x, 'transactions'));
            b.set(ref, { 
                tarih: dateStr, 
                tur: 'borc', 
                aciklama: desc, 
                tutar: m, 
                timestamp: new Date() 
            });
        });
    }

    await b.commit(); 
    showMessage("addDebtMessage", `${repeat} aylık borç eklendi.`); 
    loadAdminTransactionLedger();
});

document.getElementById('addTahsilatBtn').addEventListener('click', async () => {
    const d = document.getElementById("islemDaireSelect").value, t = document.getElementById("tahsilatTarih").value, a = document.getElementById("tahsilatAciklama").value, m = Number(document.getElementById("tahsilatTutar").value);
    if (!d || !t || !m) return showMessage("addTahsilatMessage", "Eksik.", true);
    await addDoc(collection(db, 'apartments', d, 'transactions'), { tarih:t, tur:'tahsilat', aciklama:a || 'Ödeme', tutar:-Math.abs(m), timestamp: new Date() });
    showMessage("addTahsilatMessage", "Eklendi."); loadAdminTransactionLedger();
});

// LATE FEE LOGIC
document.getElementById('addLateFeeBtn').addEventListener('click', async () => {
    const now = new Date();
    const feeName = `${aylar[now.getMonth()]} ${now.getFullYear()} Gecikme Tazminatı`;
    const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];

    if(!confirm(`DİKKAT: ${currentMonthStart} tarihinden ÖNCEKİ ana borçlar taranıp %5 gecikme tazminatı eklenecek.\n(Bu ayın aidatları etkilenmeyecek)\n\nOnaylıyor musunuz?`)) return;

    const b = writeBatch(db);
    let count = 0;

    for (const d of daireler) {
        const s = await getDocs(collection(db, 'apartments', d, 'transactions'));
        let pDebt = 0, tPay = 0, applied = false;

        s.forEach(snap => {
            const t = snap.data();
            if(t.tarih <= todayStr) {
                if(t.aciklama === feeName) applied = true;
                if (t.tarih < currentMonthStart) {
                    if(t.tur === 'borc' && !t.aciklama.toLowerCase().includes('gecikme')) {
                        pDebt += Number(t.tutar);
                    }
                }
                if(t.tur === 'tahsilat') tPay += Math.abs(Number(t.tutar));
            }
        });

        if(applied) continue;
        const rem = pDebt - tPay;
        if(rem > 0) {
            const fee = parseFloat((rem * 0.05).toFixed(2));
            b.set(doc(collection(db, 'apartments', d, 'transactions')), { tarih:todayStr, tur:'borc', aciklama:feeName, tutar:fee, timestamp:new Date() });
            count++;
        }
    }
    if(count>0) { await b.commit(); showMessage("addDebtMessage", `${count} daireye uygulandı.`); }
    else showMessage("addDebtMessage", "Uygulanacak borç bulunamadı.", true);
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
document.getElementById('logoutBtn').addEventListener('click', () => { sessionStorage.removeItem('aidatSession'); location.reload(); });
document.getElementById('sidebarToggle').addEventListener('click', toggleSidebar);
document.getElementById('sidebarOverlay').addEventListener('click', toggleSidebar);

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

document.getElementById('downloadAccountStatementBtn').addEventListener('click', () => {
    const daireId = document.getElementById('islemDaireSelect').value;
    if(daireId) window.downloadAccountStatementPdf(daireId);
    else showMessage("adminTableMessage", "Daire seçiniz.", true);
});

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

document.getElementById('userBalanceCard').addEventListener('click', function() {
    this.classList.toggle('active');
    document.getElementById('userBalanceDetails').classList.toggle('show');
});

document.getElementById('saveRegistrationBtn').addEventListener('click', async () => {
    const tel = document.getElementById('regTelefon').value.trim();
    const mail = document.getElementById('regMail').value.trim();
    const adres = document.getElementById('regAdres').value.trim();

    if(!tel || !mail || !adres) return showMessage("registrationMessage", "Lütfen tüm alanları doldurun.", true);

    try {
        await updateDoc(doc(db, 'apartments', loggedInUsername), {
            telefon: tel, mail: mail, adres: adres, profileCompleted: true
        });
        showMessage("registrationMessage", "Kaydınız oluşturuldu! Yönlendiriliyorsunuz...");
        setTimeout(() => {
            document.getElementById('registrationModal').style.display = 'none';
            setupPanel('user'); 
        }, 1500);
    } catch (e) { console.error(e); showMessage("registrationMessage", "Hata oluştu.", true); }
});

document.getElementById('changePasswordBtn').addEventListener('click', async () => {
    const currentPassword = prompt("Mevcut şifrenizi girin:");
    if (currentPassword === null) return;
    try {
        const userDoc = await getDoc(doc(db, 'apartments', loggedInUsername));
        if (!userDoc.exists() || userDoc.data().password !== currentPassword) {
            return showMessage("profileMessage", "Mevcut şifre hatalı.", true);
        }
        const newPassword = prompt("Yeni şifrenizi girin (en az 3 karakter):");
        if (newPassword === null) return;
        if (newPassword.length < 3) return showMessage("profileMessage", "Yeni şifre en az 3 karakter olmalı.", true);
        const newPasswordConfirm = prompt("Yeni şifrenizi tekrar girin:");
        if (newPassword !== newPasswordConfirm) return showMessage("profileMessage", "Şifreler eşleşmiyor.", true);
        await updateDoc(doc(db, 'apartments', loggedInUsername), { password: newPassword });
        showMessage("profileMessage", "Şifreniz başarıyla değiştirildi.");
    } catch (error) { console.error(error); showMessage("profileMessage", "Hata oluştu.", true); }
});

// WINDOW EXPORTS
window.delTrans = async (d, id) => { if(confirm("Sil?")) { await deleteDoc(doc(db, 'apartments', d, 'transactions', id)); loadAdminTransactionLedger(); } };
window.delExp = async (id) => { if(confirm("Sil?")) { await deleteDoc(doc(db, 'expenses', id)); loadAdminExpensesTable(); } };
window.openAptDetail = async (id) => {
    const d = allApartmentsData.find(x => x.id === id);
    const lastLoginDate = d.lastLogin ? new Date(d.lastLogin.seconds * 1000).toLocaleString('tr-TR') : 'Hiç giriş yapmadı';
    
    let html = `
        <div class="detail-row"><span class="label">Daire:</span> <span class="value">${d.id}</span></div>
        <div class="detail-row"><span class="label">Ad Soyad:</span> <span class="value">${d.adi || '-'} ${d.soyadi || '-'}</span></div>
        <div class="detail-row"><span class="label">Telefon:</span> <span class="value">${d.telefon || '-'}</span></div>
        <div class="detail-row"><span class="label">E-posta:</span> <span class="value">${d.mail || '-'}</span></div>
        <div class="detail-row"><span class="label">Adres:</span> <span class="value">${d.adres || '-'}</span></div>
        <div class="detail-row"><span class="label">Son Giriş:</span> <span class="value">${lastLoginDate}</span></div>
        <div class="detail-row"><span class="label">Güncel Bakiye:</span> <span class="value ${d.balance > 0 ? 'text-danger' : 'text-success'}" style="font-weight:bold;">${formatCurrency(d.balance)}</span></div>
    `;
    document.getElementById('apartmentDetailContent').innerHTML = html;
    document.getElementById('apartmentDetailModal').style.display = 'block';
    
    document.getElementById('editApartmentDetailBtn').onclick = () => window.editApt(id);
    document.getElementById('deleteApartmentBtn').onclick = () => window.delApt(id);
    document.getElementById('downloadApartmentStatementBtn').onclick = () => window.downloadAccountStatementPdf(id);
};

window.editApt = async (id) => {
    const d = allApartmentsData.find(x => x.id === id);
    const n = prompt("Ad:", d.adi||""), s = prompt("Soyad:", d.soyadi||""), p = prompt("Tel:", d.telefon||""), m = prompt("Mail:", d.mail||"");
    if(n!==null) { await setDoc(doc(db,'apartments',id),{adi:n, soyadi:s, telefon:p, mail:m},{merge:true}); alert("Güncellendi"); loadApartmentsListPage(); document.getElementById('apartmentDetailModal').style.display='none'; }
};

window.delApt = async (id) => {
    if(confirm(`DİKKAT: ${id} silinecek!`)) {
        const b = writeBatch(db);
        const s = await getDocs(collection(db,'apartments',id,'transactions'));
        s.forEach(x=>b.delete(x.ref));
        b.update(doc(db,'apartments',id),{adi:deleteField(), soyadi:deleteField(), telefon:deleteField(), mail:deleteField()});
        await b.commit(); alert("Silindi"); loadApartmentsListPage(); document.getElementById('apartmentDetailModal').style.display='none';
    }
};

window.downloadAccountStatementPdf = async function(daireId) {
    if(!daireId) return alert("Hata: Daire ID yok");
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF();
    const q = query(collection(db, 'apartments', daireId, 'transactions'), orderBy("tarih", "asc"));
    const snap = await getDocs(q);
    let rows = [], bal = 0;
    snap.forEach(d => {
        const t = d.data();
        if(t.tarih <= todayStr) {
            bal += Number(t.tutar);
            rows.push([formatDate(t.tarih), t.aciklama, formatCurrency(t.tutar), formatCurrency(bal)]);
        }
    });
    pdf.setFont('helvetica', 'normal');
    pdf.text(`${daireId} Hesap Ekstresi`, 14, 20);
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
        
        const session = sessionStorage.getItem('aidatSession');
        if(session) {
            const s = JSON.parse(session);
            if(s.role === 'admin') {
                currentAdminRole = s.type;
                setupPanel('admin');
            } else if (s.role === 'user') {
                loggedInUsername = s.user;
                setupPanel('user');
            }
        }
    } catch (e) { console.error("Init Error:", e); }
}
init();
