const ls = {
  get(key, def) { try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : def; } catch { return def; } },
  set(key, v) { localStorage.setItem(key, JSON.stringify(v)); }
};

function maskMobile(m) { return m ? m.slice(0,4) + "******" : ""; }
function ensureUser(role) {
  const user = ls.get('user', null);
  if (!user || (role && user.role !== role)) {
    if (role === 'admin') location.href = 'login_admin.html';
    else location.href = 'login_patient.html';
    return null;
  }
  return user;
}

function getSubStatus(mobile) {
  const subs = ls.get('subscriptions', {});
  return subs[mobile] || 'none';
}
function setSubStatus(mobile, status) {
  const subs = ls.get('subscriptions', {});
  subs[mobile] = status;
  ls.set('subscriptions', subs);
}

function addPayment(rec) {
  const payments = ls.get('payments', []);
  payments.push(rec);
  ls.set('payments', payments);
}
function updatePaymentStatus(idx, status) {
  const payments = ls.get('payments', []);
  if (payments[idx]) {
    payments[idx].status = status;
    ls.set('payments', payments);
  }
}

function openUpiIntent() {
  const pa = '9037855581@UPI';
  const pn = encodeURIComponent('CardioSree');
  const am = '1000';
  const tn = encodeURIComponent('Subscription');
  const url = `upi://pay?pa=${pa}&pn=${pn}&am=${am}&cu=INR&tn=${tn}`;
  location.href = url;
}

function renderVitals() {
  const v = ls.get('vitals', { bp: '--/--', hr: '--', steps: '--', weight: '--' });
  const bpEl = document.getElementById('bp');
  const hrEl = document.getElementById('hr');
  const stepsEl = document.getElementById('steps');
  const wEl = document.getElementById('weight');
  if (bpEl) bpEl.textContent = `BP: ${v.bp}`;
  if (hrEl) hrEl.textContent = `HR: ${v.hr}`;
  if (stepsEl) stepsEl.textContent = `Steps: ${v.steps}`;
  if (wEl) wEl.textContent = `Weight: ${v.weight}`;
}
function attachVitalsEditing() {
  const bpEl = document.getElementById('bp');
  const hrEl = document.getElementById('hr');
  const stepsEl = document.getElementById('steps');
  const wEl = document.getElementById('weight');
  const v = ls.get('vitals', { bp: '--/--', hr: '--', steps: '--', weight: '--' });
  if (bpEl) bpEl.onclick = () => { const val = prompt('Enter BP (e.g., 128/78)'); if (val) { v.bp = val; ls.set('vitals', v); renderVitals(); } };
  if (hrEl) hrEl.onclick = () => { const val = prompt('Enter HR'); if (val) { v.hr = val; ls.set('vitals', v); renderVitals(); } };
  if (stepsEl) stepsEl.onclick = () => { const val = prompt('Enter Steps'); if (val) { v.steps = val; ls.set('vitals', v); renderVitals(); } };
  if (wEl) wEl.onclick = () => { const val = prompt('Enter Weight (kg)'); if (val) { v.weight = val; ls.set('vitals', v); renderVitals(); } };
}

function computeRisk(intake) {
  const today = new Date();
  const d = intake.procedureDate ? new Date(intake.procedureDate) : null;
  const days = d ? Math.floor((today - d) / (1000*60*60*24)) : null;
  const comorbCount = ['c_htn','c_dm','c_chol','c_smoke'].filter(k => intake[k]).length;
  const ef = Number(intake.ef || 50);
  const arr = !!intake.arrhythmia;
  const unstable = !!intake.unstable || !!intake.decompHF;
  if (unstable) return 'High';
  if (days !== null && days < 14) return 'High';
  if (ef < 40 && arr) return 'High';
  if (intake.surgery === 'cabg' && days !== null && days < 30) return 'Moderate';
  if (ef >= 40 && ef <= 49) return 'Moderate';
  if (comorbCount >= 2) return 'Moderate';
  return 'Low';
}
function seedCoaches() {
  let coaches = ls.get('coaches', []);
  if (!coaches || coaches.length === 0) {
    coaches = [
      { name: 'Coach Asha', email: 'asha@cardiosree.in', phone: '9800000001' },
      { name: 'Coach Manoj', email: 'manoj@cardiosree.in', phone: '9800000002' }
    ];
    ls.set('coaches', coaches);
  }
}
function getAssignment(mobile) {
  const a = ls.get('assignments', {});
  return a[mobile] || null;
}
function setAssignment(mobile, coachEmail) {
  const coaches = ls.get('coaches', []);
  const coach = coaches.find(c => c.email === coachEmail);
  const a = ls.get('assignments', {});
  a[mobile] = coach || null;
  ls.set('assignments', a);
}

document.addEventListener('DOMContentLoaded', () => {
  if (!document.querySelector('link[rel="manifest"]')) {
    const l = document.createElement('link'); l.rel = 'manifest'; l.href = 'manifest.webmanifest'; document.head.appendChild(l);
  }
  if ('serviceWorker' in navigator) { navigator.serviceWorker.register('sw.js').catch(() => {}); }
  const page = document.body.getAttribute('data-page');
  if (page === 'login_patient') {
    const btnOtp = document.getElementById('btnOtp');
    btnOtp?.addEventListener('click', () => {
      const mobile = document.getElementById('mobile').value.trim();
      if (!mobile) { alert('Enter mobile number'); return; }
      const lang = document.getElementById('lang').value;
      ls.set('user', { mobile, role: 'patient', lang });
      const users = ls.get('users', []);
      if (!users.find(u => u.mobile === mobile)) { users.push({ mobile }); ls.set('users', users); }
    });
  }
  if (page === 'patient_intake') {
    const user = ensureUser('patient');
    if (!user) return;
    function saveDischargeAndContinue(dataUrl, fileName) {
      const intake = {
        mobile: user.mobile,
        name: document.getElementById('name').value.trim(),
        discharge: { name: fileName || null, dataUrl: dataUrl || null }
      };
      ls.set(`intake:${user.mobile}`, intake);
      const status = getSubStatus(user.mobile);
      if (status === 'active') location.href = 'patient_home.html';
      else location.href = 'paywall.html';
    }
    document.getElementById('saveIntake')?.addEventListener('click', (e) => {
      e.preventDefault();
      const file = document.getElementById('discharge').files[0];
      if (file) {
        const fr = new FileReader();
        fr.onload = () => saveDischargeAndContinue(fr.result, file.name);
        fr.readAsDataURL(file);
      } else {
        saveDischargeAndContinue(null, null);
      }
    });
  }
  if (page === 'paywall') {
    const user = ensureUser('patient');
    if (!user) return;
    const status = getSubStatus(user.mobile);
    if (status === 'active') {
      location.href = 'patient_home.html';
    }
  }
  if (page === 'payment') {
    const user = ensureUser('patient');
    if (!user) return;
    const upiIdEl = document.getElementById('upiId');
    const upiId = '9037855581@UPI';
    if (upiIdEl) upiIdEl.textContent = upiId;
    document.getElementById('copyUpi')?.addEventListener('click', (e) => {
      e.preventDefault();
      navigator.clipboard?.writeText(upiId).then(() => alert('UPI ID copied')).catch(() => alert('Copy failed'));
    });
    document.getElementById('openUpi')?.addEventListener('click', (e) => { e.preventDefault(); openUpiIntent(); });
    document.getElementById('verifyPending')?.addEventListener('click', () => {
      const utr = document.getElementById('utr').value.trim();
      const payer = document.getElementById('payer').value.trim();
      addPayment({ mobile: user.mobile, upi: upiId, amount: 1000, utr, payer, status: 'pending' });
      setSubStatus(user.mobile, 'pending');
      const admin = ls.get('admin', null);
      const wa = admin?.waPhone;
      const msg = encodeURIComponent(`CardioSree: Payment submitted\nUser: ${maskMobile(user.mobile)}\nAmount: ₹1000\nUTR: ${utr}`);
      const waUrl = wa ? `https://wa.me/${wa}?text=${msg}` : null;
      const notifs = ls.get('notifications', []);
      notifs.push({ type: 'payment', mobile: user.mobile, utr, amount: 1000, waUrl, sent: false });
      ls.set('notifications', notifs);
      alert('Payment submitted. Pending admin verification.');
    });
  }
  if (page === 'patient_home') {
    const user = ensureUser('patient');
    if (!user) return;
    renderVitals();
    attachVitalsEditing();
    const scoreEl = document.getElementById('score');
    const hs = ls.get(`heartScore:${user.mobile}`, null);
    scoreEl.textContent = `ഇന്ന് ഹാർട്ട് സ്കോർ: ${hs || '—'}`;
    scoreEl.onclick = () => {
      const val = prompt('Enter Heart Score (e.g., Green/Yellow/Red or 1-10)');
      if (val) { ls.set(`heartScore:${user.mobile}`, val); scoreEl.textContent = `ഇന്ന് ഹാർട്ട് സ്കോർ: ${val}`; }
    };
    const coachInfo = document.getElementById('coachInfo');
    const assigned = getAssignment(user.mobile);
    coachInfo.textContent = assigned ? `കോച്ച്: ${assigned.name} (${assigned.phone})` : 'കോച്ച്: —';
    const last = (ls.get(`sixmwt:${user.mobile}`, []).slice(-1)[0]);
    const sixEl = document.getElementById('sixmwtLast');
    if (sixEl) sixEl.textContent = last ? `6MWT: ${last.distance} മീ` : '6MWT: —';
    document.getElementById('startRehab')?.addEventListener('click', (e) => {
      const status = getSubStatus(user.mobile);
      if (status !== 'active') { e.preventDefault(); location.href = 'paywall.html'; }
    });
    document.getElementById('sixmwtBtn')?.addEventListener('click', (e) => {
      const status = getSubStatus(user.mobile);
      if (status !== 'active') { e.preventDefault(); location.href = 'paywall.html'; }
    });
    document.getElementById('subscriptionStatus')?.addEventListener('click', (e) => {
      const status = getSubStatus(user.mobile);
      if (status === 'active') alert('Subscription Active');
      else alert(`Subscription: ${status || 'none'}`);
    });
  }
  if (page === 'rehab_session') {
    const user = ensureUser('patient');
    if (!user) return;
    const status = getSubStatus(user.mobile);
    if (status !== 'active') { location.href = 'paywall.html'; return; }
    const intake = ls.get(`intake:${user.mobile}`, null);
    const risk = intake?.risk || 'Low';
    function generatePlan(r) {
      if (r === 'High') return { walkMin: 10, rpe: '9–11', breathMin: 10, yoga: 'മികവിൽ ലഘു' };
      if (r === 'Moderate') return { walkMin: 20, rpe: '11–12', breathMin: 7, yoga: 'ലഘു' };
      return { walkMin: 30, rpe: '11–13', breathMin: 5, yoga: 'ലഘു' };
    }
    const plan = ls.get(`plan:${user.mobile}`, generatePlan(risk));
    ls.set(`plan:${user.mobile}`, plan);
    const walkCard = document.getElementById('walkCard');
    const breathCard = document.getElementById('breathCard');
    const yogaCard = document.getElementById('yogaCard');
    if (walkCard) walkCard.textContent = `നടക്കൽ: ${plan.walkMin} മിനിറ്റ് (RPE ${plan.rpe})`;
    if (breathCard) breathCard.textContent = `ശ്വാസ വ്യായാമം: ${plan.breathMin} മിനിറ്റ്`;
    if (yogaCard) yogaCard.textContent = `യോഗ: ${plan.yoga}`;
    document.getElementById('start')?.addEventListener('click', () => {
      ls.set('session', { started: Date.now(), rpe: document.getElementById('rpe').value });
      alert('Session started');
    });
    document.getElementById('complete')?.addEventListener('click', () => {
      const s = ls.get('session', {});
      s.completed = Date.now();
      ls.set('session', s);
      alert('Session completed');
    });
    document.getElementById('stop')?.addEventListener('click', (e) => {
      e.preventDefault();
      alert('Stop immediately. Rest and call HELP NOW if severe symptoms.');
    });
  }
  if (page === 'patient_details') {
    const user = ensureUser('patient');
    if (!user) return;
    function saveDetails(dataUrl, fileName) {
      const intake = ls.get(`intake:${user.mobile}`, {}) || {};
      const updated = {
        ...intake,
        mobile: user.mobile,
        name: document.getElementById('name').value.trim(),
        age: Number(document.getElementById('age').value),
        sex: document.getElementById('sex').value,
        surgery: document.getElementById('surgery').value,
        procedureDate: document.getElementById('procedureDate').value,
        hospital: document.getElementById('hospital').value.trim(),
        doctor: document.getElementById('doctor').value.trim(),
        discharge: { name: fileName || intake.discharge?.name || null, dataUrl: dataUrl || intake.discharge?.dataUrl || null }
      };
      if (!updated.name || !updated.surgery || !updated.procedureDate || !updated.hospital) { alert('Fill name, surgery, date, and hospital'); return; }
      ls.set(`intake:${user.mobile}`, updated);
      alert('Details saved');
      location.href = 'patient_home.html';
    }
    document.getElementById('saveDetails')?.addEventListener('click', (e) => {
      e.preventDefault();
      const file = document.getElementById('discharge').files[0];
      if (file) {
        const fr = new FileReader();
        fr.onload = () => saveDetails(fr.result, file.name);
        fr.readAsDataURL(file);
      } else {
        saveDetails(null, null);
      }
    });
  }
  if (page === 'sixmwt') {
    const user = ensureUser('patient');
    if (!user) return;
    const status = getSubStatus(user.mobile);
    if (status !== 'active') { location.href = 'paywall.html'; return; }
    document.getElementById('saveSixmwt')?.addEventListener('click', (e) => {
      e.preventDefault();
      const rec = {
        timestamp: Date.now(),
        preHr: Number(document.getElementById('preHr').value),
        preBp: document.getElementById('preBp').value.trim(),
        distance: Number(document.getElementById('distance').value),
        postHr: Number(document.getElementById('postHr').value),
        postBp: document.getElementById('postBp').value.trim(),
        symptoms: document.getElementById('symptoms').value.trim(),
      };
      const list = ls.get(`sixmwt:${user.mobile}`, []);
      list.push(rec);
      ls.set(`sixmwt:${user.mobile}`, list);
      alert('6MWT saved');
      location.href = 'patient_home.html';
    });
  }
  if (page === 'login_admin') {
    const waInput = document.getElementById('adminWa');
    if (waInput && !waInput.value) { waInput.value = '917994049095'; }
    document.getElementById('adminSignIn')?.addEventListener('click', () => {
      const email = document.getElementById('adminEmail').value.trim();
      const pwd = document.getElementById('adminPassword').value.trim();
      if (!email || !pwd) { alert('Enter email and password'); return; }
      const waPhone = document.getElementById('adminWa').value.trim();
      const admins = ls.get('admins', []);
      const account = admins.find(a => a.email === email && a.password === pwd);
      if (!account) { alert('Admin not found. Create admin first.'); location.href = 'admin_setup.html'; return; }
      ls.set('admin', { email, loggedIn: true, waPhone: waPhone || account.waPhone });
      seedCoaches();
    });
  }
  if (page === 'admin_setup') {
    document.getElementById('adminCreateBtn')?.addEventListener('click', () => {
      const email = document.getElementById('adminCreateEmail').value.trim();
      const password = document.getElementById('adminCreatePassword').value.trim();
      const waPhone = document.getElementById('adminCreateWa').value.trim();
      if (!email || !password) { alert('Enter email and password'); return; }
      const admins = ls.get('admins', []);
      if (admins.find(a => a.email === email)) { alert('Admin already exists'); return; }
      admins.push({ email, password, waPhone });
      ls.set('admins', admins);
      ls.set('admin', { email, loggedIn: true, waPhone });
    });
  }
  if (page === 'admin_dashboard') {
    const admin = ensureUser('admin');
    if (!admin) return;
    const payments = ls.get('payments', []);
    const pending = payments.filter(p => p.status === 'pending').length;
    const el = document.getElementById('pendingCount');
    el.textContent = `Pending Payments: ${pending}`;
    const notifs = ls.get('notifications', []).filter(n => n.type === 'payment' && !n.sent).length;
    const ne = document.getElementById('notifyCount');
    if (ne) ne.textContent = `WhatsApp Notifications Pending: ${notifs}`;
    const btn = document.getElementById('notifyOpen');
    btn?.addEventListener('click', (e) => {
      e.preventDefault();
      const list = ls.get('notifications', []).filter(n => n.type === 'payment' && !n.sent);
      if (list.length === 0) { alert('No pending notifications'); return; }
      const n = list[0];
      if (n.waUrl || ls.get('admin', null)?.waPhone) {
        if (!n.waUrl) {
          const admin = ls.get('admin', null);
          const msg = encodeURIComponent(`CardioSree: Payment submitted\nUser: ${maskMobile(n.mobile)}\nAmount: ₹${n.amount}\nUTR: ${n.utr || ''}`);
          n.waUrl = `https://wa.me/${admin.waPhone}?text=${msg}`;
        }
        window.open(n.waUrl, '_blank');
        n.sent = true;
        const all = ls.get('notifications', []);
        const idx = all.findIndex(x => x.mobile === n.mobile && x.utr === n.utr);
        if (idx >= 0) { all[idx] = n; ls.set('notifications', all); }
        const count = ls.get('notifications', []).filter(x => x.type === 'payment' && !x.sent).length;
        if (ne) ne.textContent = `WhatsApp Notifications Pending: ${count}`;
      } else { alert('Missing WhatsApp number. Set on Admin Login.'); }
    });
    const qrPrev = document.getElementById('qrPreviewAdmin');
    const savedGlobal = ls.get('upiQrGlobal', null);
    if (qrPrev && savedGlobal) { qrPrev.src = savedGlobal; qrPrev.style.display = 'block'; }
    document.getElementById('saveQrAdmin')?.addEventListener('click', (e) => {
      e.preventDefault();
      const file = document.getElementById('qrUploadAdmin').files[0];
      if (!file) { alert('Choose QR image'); return; }
      const fr = new FileReader();
      fr.onload = () => { ls.set('upiQrGlobal', fr.result); if (qrPrev) { qrPrev.src = fr.result; qrPrev.style.display = 'block'; } alert('Global QR saved'); };
      fr.readAsDataURL(file);
    });
  }
  if (page === 'admin_tools') {
    const admin = ls.get('admin', null);
    if (!admin) { location.href = 'login_admin.html'; return; }
    document.getElementById('exportData')?.addEventListener('click', (e) => {
      e.preventDefault();
      const data = {};
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        data[k] = localStorage.getItem(k);
      }
      const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'cardiosree-data.json'; a.click();
      URL.revokeObjectURL(url);
    });
    document.getElementById('importData')?.addEventListener('click', (e) => {
      e.preventDefault();
      const f = document.getElementById('importFile').files[0];
      if (!f) { alert('Choose JSON file'); return; }
      const fr = new FileReader();
      fr.onload = () => {
        try {
          const obj = JSON.parse(fr.result);
          Object.entries(obj).forEach(([k, v]) => localStorage.setItem(k, v));
          alert('Imported');
        } catch { alert('Invalid JSON'); }
      };
      fr.readAsText(f);
    });
    document.getElementById('resetApp')?.addEventListener('click', (e) => {
      e.preventDefault();
      localStorage.clear();
      alert('Cleared');
    });
    document.getElementById('seedDemo')?.addEventListener('click', (e) => {
      e.preventDefault();
      seedCoaches();
      const mobile = '9999999999';
      const users = ls.get('users', []);
      if (!users.find(u => u.mobile === mobile)) { users.push({ mobile }); ls.set('users', users); }
      ls.set('subscriptions', { [mobile]: 'active' });
      ls.set(`intake:${mobile}`, { mobile, name: 'Demo Patient', discharge: null, surgery: 'pci', procedureDate: '2026-02-01', hospital: 'Demo Hospital', doctor: 'Dr Demo' });
      ls.set('admin', { email: 'admin@cardiosree.in', loggedIn: true, waPhone: '917000000000' });
      ls.set('coach', ls.get('coaches', [])[0]);
      ls.set('assignments', { [mobile]: ls.get('coaches', [])[0] });
      alert('Seeded demo data');
    });
  }
  if (page === 'admin_payments') {
    const admin = ensureUser('admin');
    if (!admin) return;
    const tbody = document.getElementById('paymentsBody');
    const payments = ls.get('payments', []);
    tbody.innerHTML = '';
    payments.forEach((p, i) => {
      const tr = document.createElement('tr');
      const allNotifs = ls.get('notifications', []);
      const notifs = allNotifs.filter(n => n.mobile === p.mobile && n.utr === p.utr);
      let waUrl = notifs[0]?.waUrl || null;
      if (!waUrl && admin.waPhone) {
        const msg = encodeURIComponent(`CardioSree: Payment submitted\nUser: ${maskMobile(p.mobile)}\nAmount: ₹${p.amount}\nUTR: ${p.utr || ''}`);
        waUrl = `https://wa.me/${admin.waPhone}?text=${msg}`;
        if (notifs[0]) { notifs[0].waUrl = waUrl; ls.set('notifications', allNotifs); }
      }
      tr.innerHTML = `<td>${maskMobile(p.mobile)}</td><td>${p.upi}</td><td>₹${p.amount}</td><td>${p.utr || ''}</td><td>${p.status}</td><td><a href="#" data-idx="${i}" class="btn">${p.status === 'paid' ? 'Undo' : 'Mark Paid'}</a></td><td>${waUrl ? `<a class="btn" target="_blank" href="${waUrl}">WhatsApp</a>` : '-'}</td>`;
      tbody.appendChild(tr);
    });
    tbody.addEventListener('click', (e) => {
      const t = e.target;
      if (t.classList.contains('btn')) {
        e.preventDefault();
        const idx = Number(t.getAttribute('data-idx'));
        const payments = ls.get('payments', []);
        const p = payments[idx];
        if (!p) return;
        const newStatus = p.status === 'paid' ? 'pending' : 'paid';
        updatePaymentStatus(idx, newStatus);
        if (newStatus === 'paid') setSubStatus(p.mobile, 'active');
        else setSubStatus(p.mobile, 'pending');
        location.reload();
      }
    });
  }
  if (page === 'admin_assign') {
    const admin = ensureUser('admin');
    if (!admin) return;
    seedCoaches();
    const assignBody = document.getElementById('assignBody');
    const users = ls.get('users', []);
    const subs = ls.get('subscriptions', {});
    const coaches = ls.get('coaches', []);
    assignBody.innerHTML = '';
    users.filter(u => subs[u.mobile] === 'active').forEach(u => {
      const current = getAssignment(u.mobile);
      const tr = document.createElement('tr');
      const select = document.createElement('select');
      coaches.forEach(c => {
        const opt = document.createElement('option');
        opt.value = c.email; opt.textContent = `${c.name} (${c.phone})`;
        if (current && current.email === c.email) opt.selected = true;
        select.appendChild(opt);
      });
      const tdUser = document.createElement('td'); tdUser.textContent = maskMobile(u.mobile);
      const tdStatus = document.createElement('td'); tdStatus.textContent = 'Active';
      const tdCoach = document.createElement('td'); tdCoach.appendChild(select);
      const tdAction = document.createElement('td'); tdAction.innerHTML = `<a href="#" class="btn">Assign</a>`;
      tr.appendChild(tdUser); tr.appendChild(tdStatus); tr.appendChild(tdCoach); tr.appendChild(tdAction);
      assignBody.appendChild(tr);
      tdAction.querySelector('.btn').addEventListener('click', (e) => {
        e.preventDefault();
        setAssignment(u.mobile, select.value);
        alert('Coach assigned');
      });
    });
  }
  if (page === 'login_coach') {
    document.getElementById('coachSignIn')?.addEventListener('click', () => {
      const email = document.getElementById('coachEmail').value.trim();
      const pwd = document.getElementById('coachPassword').value.trim();
      if (!email || !pwd) { alert('Enter email and password'); return; }
      const coaches = ls.get('coaches', []);
      const coach = coaches.find(c => c.email === email);
      if (!coach) { alert('Coach not found'); return; }
      ls.set('coach', coach);
    });
  }
  if (page === 'coach_dashboard') {
    const coach = ls.get('coach', null);
    if (!coach) { location.href = 'login_coach.html'; return; }
    document.getElementById('coachName').textContent = `${coach.name} (${coach.email})`;
    const body = document.getElementById('coachBody');
    const assignments = ls.get('assignments', {});
    body.innerHTML = '';
    Object.entries(assignments).forEach(([mobile, c]) => {
      if (!c || c.email !== coach.email) return;
      const intake = ls.get(`intake:${mobile}`, null);
      const tr = document.createElement('tr');
      const tdPatient = document.createElement('td'); tdPatient.textContent = maskMobile(mobile);
      const tdProc = document.createElement('td'); tdProc.textContent = intake?.surgery || '';
      const tdDate = document.createElement('td'); tdDate.textContent = intake?.procedureDate || '';
      const tdRisk = document.createElement('td'); tdRisk.textContent = intake?.risk || '—';
      const tdFile = document.createElement('td');
      if (intake?.discharge?.dataUrl) {
        const a = document.createElement('a');
        a.href = intake.discharge.dataUrl; a.textContent = 'View'; a.download = intake.discharge.name || 'discharge';
        tdFile.appendChild(a);
      } else {
        tdFile.textContent = '—';
      }
      const tdSummary = document.createElement('td');
      const intakeLink = document.createElement('a');
      intakeLink.href = `patient_intake_summary.html?mobile=${encodeURIComponent(mobile)}`;
      intakeLink.textContent = 'Intake';
      intakeLink.className = 'btn';
      const compLink = document.createElement('a');
      compLink.href = `coach_summary.html?mobile=${encodeURIComponent(mobile)}`;
      compLink.textContent = 'Comprehensive';
      compLink.className = 'btn';
      const editLink = document.createElement('a');
      editLink.href = `coach_patient_edit.html?mobile=${encodeURIComponent(mobile)}`;
      editLink.textContent = 'Edit';
      editLink.className = 'btn';
      tdSummary.appendChild(intakeLink);
      tdSummary.appendChild(document.createTextNode(' '));
      tdSummary.appendChild(compLink);
      tdSummary.appendChild(document.createTextNode(' '));
      tdSummary.appendChild(editLink);
      tr.appendChild(tdPatient); tr.appendChild(tdProc); tr.appendChild(tdDate); tr.appendChild(tdRisk); tr.appendChild(tdFile); tr.appendChild(tdSummary);
      body.appendChild(tr);
    });
  }
  if (page === 'coach_edit') {
    const coach = ls.get('coach', null);
    if (!coach) { location.href = 'login_coach.html'; return; }
    const params = new URLSearchParams(location.search);
    const mobile = params.get('mobile');
    document.getElementById('patientId').textContent = maskMobile(mobile);
    const intake = ls.get(`intake:${mobile}`, {}) || {};
    const sEl = document.getElementById('surgery');
    const dEl = document.getElementById('procedureDate');
    const hEl = document.getElementById('hospital');
    const docEl = document.getElementById('doctor');
    if (sEl) sEl.value = intake.surgery || '';
    if (dEl) dEl.value = intake.procedureDate || '';
    if (hEl) hEl.value = intake.hospital || '';
    if (docEl) docEl.value = intake.doctor || '';
    document.getElementById('saveEdit')?.addEventListener('click', (e) => {
      e.preventDefault();
      const updated = {
        ...intake,
        surgery: sEl.value,
        procedureDate: dEl.value,
        hospital: hEl.value.trim(),
        doctor: docEl.value.trim()
      };
      ls.set(`intake:${mobile}`, updated);
      alert('Saved');
      location.href = 'coach_dashboard.html';
    });
  }
  if (page === 'coach_summary') {
    const params = new URLSearchParams(location.search);
    const mobile = params.get('mobile');
    const wrap = document.getElementById('wrap');
    if (!mobile) { wrap.textContent = 'Missing patient'; return; }
    const intake = ls.get(`intake:${mobile}`, null);
    const plan = ls.get(`plan:${mobile}`, null);
    const sixList = ls.get(`sixmwt:${mobile}`, []);
    const lastSix = sixList.slice(-1)[0] || null;
    const session = ls.get('session', {});
    const div = document.createElement('div');
    div.className = 'card';
    const risk = intake?.risk || 'Low';
    const advice = (function(r){
      if (r === 'High') return 'Supervised sessions recommended; gradually progress.';
      if (r === 'Moderate') return 'Home-based with weekly coach check-in.';
      return 'Home-based regimen with monthly review.';
    })(risk);
    div.innerHTML = `
      <div style="font-size:18px"><b>Patient:</b> ${maskMobile(mobile)}</div>
      <div><b>Procedure:</b> ${intake?.surgery || '—'} on ${intake?.procedureDate || '—'}</div>
      <div><b>Risk:</b> ${risk}</div>
      <div><b>EF:</b> ${intake?.ef ?? '—'}%</div>
      <div><b>Comorbidities:</b> ${['c_htn','c_dm','c_chol','c_smoke'].filter(k => intake?.[k]).join(', ') || 'None'}</div>
      <hr>
      <div><b>Prescribed Plan:</b> Walk ${plan?.walkMin ?? '—'} min (RPE ${plan?.rpe ?? '—'}), Breath ${plan?.breathMin ?? '—'} min, Yoga ${plan?.yoga ?? '—'}</div>
      <div><b>Session Status:</b> ${session?.completed ? 'Completed' : (session?.started ? 'In Progress' : 'Not Started')}</div>
      <hr>
      <div><b>Last 6MWT:</b> ${lastSix ? `${lastSix.distance} m, Pre HR ${lastSix.preHr}, Post HR ${lastSix.postHr}` : '—'}</div>
      <div><b>Symptoms:</b> ${lastSix?.symptoms || '—'}</div>
      <hr>
      <div><b>Coach Advice:</b> ${advice}</div>
      <div style="font-size:14px;color:#555">Disclaimer: Guidance only; follow your doctor’s advice.</div>
    `;
    wrap.appendChild(div);
    document.getElementById('printSummary')?.addEventListener('click', (e) => { e.preventDefault(); window.print(); });
  }
  if (page === 'intake_summary') {
    const params = new URLSearchParams(location.search);
    const mobile = params.get('mobile');
    const summaryEl = document.getElementById('summary');
    const intake = ls.get(`intake:${mobile}`, null);
    if (!intake) { summaryEl.textContent = 'No intake found'; return; }
    const div = document.createElement('div');
    div.className = 'card';
    div.innerHTML = `
      <div><b>Mobile:</b> ${maskMobile(mobile)}</div>
      <div><b>Name:</b> ${intake.name || ''}</div>
      <div><b>Age/Sex:</b> ${intake.age || ''} / ${intake.sex || ''}</div>
      <div><b>Procedure:</b> ${intake.surgery || ''} on ${intake.procedureDate || ''}</div>
      <div><b>EF:</b> ${intake.ef || ''}%</div>
      <div><b>Arrhythmia:</b> ${intake.arrhythmia ? 'Yes' : 'No'}</div>
      <div><b>Unstable Angina:</b> ${intake.unstable ? 'Yes' : 'No'}</div>
      <div><b>Decomp HF:</b> ${intake.decompHF ? 'Yes' : 'No'}</div>
      <div><b>Comorbidities:</b> ${['c_htn','c_dm','c_chol','c_smoke'].filter(k => intake[k]).join(', ') || 'None'}</div>
      <div><b>Medications:</b> ${intake.meds || ''}</div>
      <div><b>Hospital/Doctor:</b> ${intake.hospital || ''}</div>
      <div><b>Risk:</b> ${intake.risk || ''}</div>
      <div><b>Discharge:</b> ${intake.discharge?.name || '—'}</div>
    `;
    summaryEl.appendChild(div);
    const btn = document.getElementById('printBtn');
    btn?.addEventListener('click', (e) => { e.preventDefault(); window.print(); });
  }
});
