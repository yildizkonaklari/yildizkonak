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
        // SESSION KAYDI
        localStorage.setItem('aidatSession', JSON.stringify({ role: 'admin', type: 'full', user: 'admin' }));
        setupPanel('admin');
        return;
    }
    if (u === viewerAdminCredentials.username?.toUpperCase() && p === viewerAdminCredentials.password) {
        currentAdminRole = 'viewer';
        localStorage.setItem('aidatSession', JSON.stringify({ role: 'admin', type: 'viewer', user: 'viewer' }));
        setupPanel('admin');
        return;
    }
    
    try {
        const d = await getDoc(doc(db, "apartments", u));
        if (!d.exists() || d.data().password !== p) return showMessage("loginMessage", "Hatalı giriş.", true);
        loggedInUsername = u;
        await updateDoc(doc(db, "apartments", u), { lastLogin: new Date() });
        // SESSION KAYDI
        localStorage.setItem('aidatSession', JSON.stringify({ role: 'user', user: u }));
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
            // Sayfa yenilemeye gerek yok, paneli güncelle
            setupPanel('user'); 
        }, 1500);
    } catch (e) { console.error(e); showMessage("registrationMessage", "Hata oluştu.", true); }
});

// *** FILTRE DÜZELTMESİ ***
document.getElementById('apartmentSearchInput').addEventListener('input', (e) => {
    const val = e.target.value.toLocaleLowerCase('tr-TR'); // Türkçe karakter desteği
    const filtered = allApartmentsData.filter(d => 
        d.id.toLocaleLowerCase('tr-TR').includes(val) || 
        (d.adi && d.adi.toLocaleLowerCase('tr-TR').includes(val)) ||
        (d.soyadi && d.soyadi.toLocaleLowerCase('tr-TR').includes(val))
    );
    renderApartmentList(filtered);
});

// USER TRANSACTION SORT (YENİDEN ESKİYE)
async function loadUserTransactionLedger(u) {
    const list = document.getElementById("userTransactionList");
    list.innerHTML = '';
    // DESC SIRALAMA
    const s = await getDocs(query(collection(db, 'apartments', u, 'transactions'), orderBy("tarih", "desc")));
    
    let runningBal = 0; 
    // Bakiye hesaplamak için önce eskidem yeniye doğru toplamak lazım, ama göstermek için tersten.
    // Bu yüzden önce hepsini çekip JS tarafında işlemek daha güvenli.
    const allTrans = [];
    s.forEach(d => allTrans.push(d.data()));
    
    // Tarihe göre yeniden eskiye sıralı geliyor (desc).
    // Ama bakiye kümülatif olduğu için en eskiden başlayıp hesaplamalıyız.
    // Bu yüzden ters çevirip (eskiden yeniye) bakiyeyi hesapla, sonra tekrar ters çevirip göster.
    
    allTrans.sort((a,b) => new Date(a.tarih) - new Date(b.tarih)); // Eskiden Yeniye
    
    allTrans.forEach(t => {
        if(t.tarih <= todayStr) runningBal += Number(t.tutar);
        t.currentBalance = runningBal; // O anki bakiye
    });

    // Tekrar Yeniden Eskiye
    allTrans.sort((a,b) => new Date(b.tarih) - new Date(a.tarih));

    allTrans.forEach(t => {
        if(t.tarih > todayStr) return;
        list.innerHTML += `<tr>
            <td data-label="Tarih">${formatDate(t.tarih)}</td>
            <td data-label="Açıklama">${t.aciklama}</td>
            <td data-label="Tutar" style="${t.tur === 'borc' ? 'color:#d90429' : 'color:#2b9348'}">${formatCurrency(t.tutar)}</td>
            <td data-label="Bakiye">${formatCurrency(t.currentBalance)}</td>
        </tr>`;
    });
    
    // Son bakiye (en yeni tarihteki kümülatif bakiye)
    const finalBal = allTrans.length > 0 ? allTrans[0].currentBalance : 0;

    document.getElementById("userUnpaidTotal").textContent = formatCurrency(finalBal);
    document.getElementById("userDebtTotals").textContent = `Güncel: ${formatCurrency(finalBal)}`;
    
    if(finalBal < 0) document.getElementById("userUnpaidTotal").style.color = '#2b9348';
    else if (finalBal > 0) document.getElementById("userUnpaidTotal").style.color = '#d90429';
    else document.getElementById("userUnpaidTotal").style.color = '#333';
}

// ... (Diğer fonksiyonlar aynı kalacak, sadece init güncellenecek) ...
function fillFlatSelects() {
    const s = ["islemDaireSelect", "borcKime", "sifreDaire"];
    s.forEach(id => {
        const el = document.getElementById(id);
        el.innerHTML = "";
        if(id === 'borcKime') el.innerHTML += '<option value="all_apartments">Tüm Daireler</option>';
        daireler.forEach(d => el.innerHTML += `<option value="${d}">${d}</option>`);
    });
}
async function updateAdminDashboard() { /* ... */ }
function renderRecentTransactions(txns) { /* ... */ }
async function loadAdminTransactionLedger() { /* ... */ }
function updateExpenseDateDisplay() { /* ... */ }
async function loadAdminExpensesTable() { /* ... */ }
async function toggleExpensesVisibility() { /* ... */ }
async function downloadMonthlyExpensesPdf() { /* ... */ }
async function loadApartmentsListPage() { /* ... */ }
function renderApartmentList(list) {
    const container = document.getElementById('apartmentListContainer');
    if (list.length === 0) { container.innerHTML = '<p style="text-align:center">Bulunamadı.</p>'; return; }
    container.innerHTML = list.map(d => {
        let colorClass = 'text-muted'; 
        if (d.balance > 0) colorClass = 'text-danger'; 
        if (d.balance < 0) colorClass = 'text-success'; 
        return `<div class="apartment-list-item" onclick="openAptDetail('${d.id}')">
            <div class="apartment-info"><span class="daire-no">${d.id}</span><span>${d.adi || 'Bilgi Yok'} ${d.soyadi || ''}</span></div>
            <div class="apartment-balance"><span class="balance-value ${colorClass}">${formatCurrency(d.balance)}</span></div>
        </div>`;
    }).join('');
}
async function loadUserProfile() { /* ... */ }
async function loadUserExpensesTable() { /* ... */ }
async function checkProfileAndExpensesVisibility() { /* ... */ }
// ... Action listeners ...

// INIT (SESSION CHECK)
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

        // CHECK SESSION
        const session = localStorage.getItem('aidatSession');
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

// LOGOUT
document.getElementById('logoutBtn').addEventListener('click', () => {
    localStorage.removeItem('aidatSession'); // Session sil
    location.reload();
});

// Diğer Event Listenerlar (önceki koddan devam)
document.getElementById('loginButton').addEventListener('click', login);
document.getElementById('loginTerms').addEventListener('change', (e) => document.getElementById('loginButton').disabled = !e.target.checked);
document.getElementById('sidebarToggle').addEventListener('click', toggleSidebar);
document.getElementById('sidebarOverlay').addEventListener('click', toggleSidebar);
document.querySelectorAll('.nav-item').forEach(b => b.addEventListener('click', (e) => switchView(e.currentTarget.dataset.target)));
document.getElementById('userBalanceCard').addEventListener('click', function() { this.classList.toggle('active'); document.getElementById('userBalanceDetails').classList.toggle('show'); });

// ... Diğer tüm fonksiyonlar ve exportlar ...

init();
