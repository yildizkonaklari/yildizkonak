import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
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

// USER FUNCTIONS
// LISTENERS (GÜNCELLENDİ: PDF Butonu Eklendi)
document.getElementById('loginButton').addEventListener('click', login);
// ... existing listeners ...
document.getElementById('btnTabEkstre').addEventListener('click', () => { document.querySelectorAll('.tab-content-panel').forEach(e=>e.classList.remove('active')); document.getElementById('contentTabEkstre').classList.add('active'); loadAdminTransactionLedger(); });
document.getElementById('islemDaireSelect').addEventListener('change', () => { if(document.getElementById('contentTabEkstre').classList.contains('active')) loadAdminTransactionLedger(); });

// *** PDF BUTONU DÜZELTMESİ BURADA ***
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
