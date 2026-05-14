// ============================================================
// Borç Takip — Kredi Kartı & Esnek Hesap
// ============================================================

const STORAGE_KEY = 'borc_takip_v1';
const TRY = new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 0 });
const TRY2 = new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 2 });

let state = { accounts: [] };
let charts = { distribution: null, timeline: null };

// ---------- Storage ----------
function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) state = JSON.parse(raw);
  } catch (e) {
    console.error('Veri okunamadı', e);
  }
  if (!state.accounts) state.accounts = [];
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

// ---------- Helpers ----------
function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function monthlyRate(apr) {
  return apr / 100 / 12;
}

function monthlyInterest(balance, apr) {
  return balance * monthlyRate(apr);
}

function showToast(msg, ms = 2200) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => t.classList.add('hidden'), ms);
}

function typeLabel(t) {
  return t === 'credit_card' ? 'Kredi Kartı' : 'Esnek Hesap';
}

// ---------- Tabs ----------
function initTabs() {
  document.querySelectorAll('.tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
      if (btn.dataset.tab === 'dashboard') renderDashboard();
    });
  });
}

// ---------- Accounts CRUD ----------
function renderAccounts() {
  const list = document.getElementById('accounts-list');
  if (state.accounts.length === 0) {
    list.innerHTML = '<div class="empty-state">Henüz hesap eklemedin. Yukarıdaki “+ Yeni Hesap Ekle” butonuna bas.</div>';
    return;
  }
  list.innerHTML = state.accounts.map(a => {
    const isCC = a.type === 'credit_card';
    const mi = monthlyInterest(a.balance, a.apr);
    return `
      <div class="account-card ${isCC ? '' : 'flex'}">
        <div class="account-header">
          <div class="account-name">${escapeHtml(a.name)}</div>
          <div class="account-type-badge">${typeLabel(a.type)}</div>
        </div>
        <div class="account-balance">${TRY.format(a.balance)}</div>
        <div class="account-meta">
          <div><strong>${a.apr}%</strong> yıllık faiz</div>
          <div>Aylık faiz: <strong>${TRY.format(mi)}</strong></div>
          <div>Asgari: <strong>${TRY.format(a.minPayment)}</strong></div>
          ${isCC && a.dueDate ? `<div>Son ödeme: <strong>her ayın ${a.dueDate}'ı</strong></div>` : '<div></div>'}
        </div>
        ${a.notes ? `<div class="account-notes">${escapeHtml(a.notes)}</div>` : ''}
        <div class="account-actions">
          <button class="btn" data-edit="${a.id}">Düzenle</button>
          <button class="btn danger" data-delete="${a.id}">Sil</button>
        </div>
      </div>
    `;
  }).join('');

  list.querySelectorAll('[data-edit]').forEach(btn => {
    btn.addEventListener('click', () => openModal(btn.dataset.edit));
  });
  list.querySelectorAll('[data-delete]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.delete;
      const a = state.accounts.find(x => x.id === id);
      if (confirm(`"${a.name}" silinsin mi?`)) {
        state.accounts = state.accounts.filter(x => x.id !== id);
        saveState();
        renderAccounts();
        renderDashboard();
        showToast('Hesap silindi');
      }
    });
  });
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

function openModal(editId) {
  const form = document.getElementById('account-form');
  form.reset();
  document.getElementById('f-id').value = '';
  document.getElementById('modal-title').textContent = editId ? 'Hesap Düzenle' : 'Yeni Hesap';

  if (editId) {
    const a = state.accounts.find(x => x.id === editId);
    if (!a) return;
    document.getElementById('f-id').value = a.id;
    document.getElementById('f-type').value = a.type;
    document.getElementById('f-name').value = a.name;
    document.getElementById('f-balance').value = a.balance;
    document.getElementById('f-apr').value = a.apr;
    document.getElementById('f-min').value = a.minPayment;
    document.getElementById('f-cutoff').value = a.cutoffDate || '';
    document.getElementById('f-duedate').value = a.dueDate || '';
    document.getElementById('f-notes').value = a.notes || '';
  }
  updateTypeFields();
  document.getElementById('modal').classList.remove('hidden');
  document.getElementById('f-name').focus();
}

function closeModal() {
  document.getElementById('modal').classList.add('hidden');
}

function updateTypeFields() {
  const isCC = document.getElementById('f-type').value === 'credit_card';
  document.querySelectorAll('.cc-only').forEach(el => {
    el.style.display = isCC ? '' : 'none';
  });
}

function handleFormSubmit(e) {
  e.preventDefault();
  const id = document.getElementById('f-id').value || uid();
  const existing = state.accounts.find(x => x.id === id);
  const data = {
    id,
    type: document.getElementById('f-type').value,
    name: document.getElementById('f-name').value.trim(),
    balance: parseFloat(document.getElementById('f-balance').value),
    apr: parseFloat(document.getElementById('f-apr').value),
    minPayment: parseFloat(document.getElementById('f-min').value),
    cutoffDate: parseInt(document.getElementById('f-cutoff').value) || null,
    dueDate: parseInt(document.getElementById('f-duedate').value) || null,
    notes: document.getElementById('f-notes').value.trim(),
    createdAt: existing?.createdAt || new Date().toISOString(),
  };

  if (existing) {
    Object.assign(existing, data);
    showToast('Hesap güncellendi');
  } else {
    state.accounts.push(data);
    showToast('Hesap eklendi');
  }
  saveState();
  closeModal();
  renderAccounts();
  renderDashboard();
}

// ---------- Dashboard ----------
function renderDashboard() {
  const total = state.accounts.reduce((s, a) => s + a.balance, 0);
  const minSum = state.accounts.reduce((s, a) => s + a.minPayment, 0);
  const interestSum = state.accounts.reduce((s, a) => s + monthlyInterest(a.balance, a.apr), 0);

  document.getElementById('kpi-total').textContent = TRY.format(total);
  document.getElementById('kpi-min').textContent = TRY.format(minSum);
  document.getElementById('kpi-interest').textContent = TRY.format(interestSum);
  document.getElementById('kpi-count').textContent = state.accounts.length;

  renderDistributionChart();
  renderTimelineChart();
}

function renderDistributionChart() {
  const ctx = document.getElementById('chart-distribution');
  if (!ctx) return;
  const labels = state.accounts.map(a => a.name);
  const data = state.accounts.map(a => a.balance);
  const colors = state.accounts.map((a, i) => {
    const palette = ['#4f8cff', '#f59e0b', '#22c55e', '#ef4444', '#a855f7', '#06b6d4', '#ec4899', '#84cc16'];
    return palette[i % palette.length];
  });

  if (charts.distribution) charts.distribution.destroy();
  if (labels.length === 0) {
    const c = ctx.getContext('2d');
    c.clearRect(0, 0, ctx.width, ctx.height);
    return;
  }
  charts.distribution = new Chart(ctx, {
    type: 'doughnut',
    data: { labels, datasets: [{ data, backgroundColor: colors, borderWidth: 0 }] },
    options: {
      responsive: true,
      plugins: {
        legend: { position: 'bottom', labels: { color: '#e6e9ef', padding: 12 } },
        tooltip: {
          callbacks: {
            label: (ctx) => `${ctx.label}: ${TRY.format(ctx.parsed)}`
          }
        }
      }
    }
  });
}

function renderTimelineChart() {
  const ctx = document.getElementById('chart-timeline');
  if (!ctx) return;
  const months = 12;
  const labels = [];
  const today = new Date();
  for (let i = 0; i < months; i++) {
    const d = new Date(today.getFullYear(), today.getMonth() + i, 1);
    labels.push(d.toLocaleDateString('tr-TR', { month: 'short', year: '2-digit' }));
  }

  // Simulate min-payment only timeline
  const balances = [];
  let projected = state.accounts.map(a => ({ ...a }));
  for (let m = 0; m < months; m++) {
    const total = projected.reduce((s, a) => s + a.balance, 0);
    balances.push(Math.max(0, total));
    projected.forEach(a => {
      const interest = monthlyInterest(a.balance, a.apr);
      const pay = Math.min(a.balance + interest, a.minPayment);
      a.balance = Math.max(0, a.balance + interest - pay);
    });
  }

  if (charts.timeline) charts.timeline.destroy();
  charts.timeline = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'Toplam borç (asgari ödenirse)',
        data: balances,
        borderColor: '#4f8cff',
        backgroundColor: 'rgba(79, 140, 255, 0.15)',
        fill: true,
        tension: 0.3,
      }]
    },
    options: {
      responsive: true,
      plugins: {
        legend: { labels: { color: '#e6e9ef' } },
        tooltip: { callbacks: { label: (ctx) => TRY.format(ctx.parsed.y) } }
      },
      scales: {
        x: { ticks: { color: '#8a93a6' }, grid: { color: '#2e3845' } },
        y: { ticks: { color: '#8a93a6', callback: v => TRY.format(v) }, grid: { color: '#2e3845' } }
      }
    }
  });
}

// ---------- Payment Plan ----------
function calculatePlan() {
  const budgetInput = parseFloat(document.getElementById('monthly-budget').value);
  const strategy = document.getElementById('strategy-select').value;

  if (state.accounts.length === 0) {
    showToast('Önce hesap ekle');
    return;
  }

  const minSum = state.accounts.reduce((s, a) => s + a.minPayment, 0);
  let budget = isNaN(budgetInput) ? minSum : budgetInput;

  if (strategy !== 'minimum' && budget < minSum) {
    showToast(`Bütçe asgari toplamından (${TRY.format(minSum)}) az olamaz`);
    return;
  }

  const accounts = state.accounts.map(a => ({ ...a, originalBalance: a.balance }));
  const months = [];
  const maxMonths = 360; // 30 yıl güvenlik sınırı
  let m = 0;
  let totalInterest = 0;

  while (accounts.some(a => a.balance > 0.01) && m < maxMonths) {
    const monthRow = { month: m + 1, accounts: {}, totalPayment: 0, totalInterest: 0, totalBalance: 0 };

    // Her hesaba faiz ekle
    accounts.forEach(a => {
      if (a.balance <= 0) return;
      const interest = monthlyInterest(a.balance, a.apr);
      a.balance += interest;
      monthRow.totalInterest += interest;
      totalInterest += interest;
    });

    // Strateji: ödeme sırası
    let order;
    if (strategy === 'avalanche') {
      order = accounts.filter(a => a.balance > 0).sort((a, b) => b.apr - a.apr);
    } else if (strategy === 'snowball') {
      order = accounts.filter(a => a.balance > 0).sort((a, b) => a.balance - b.balance);
    } else {
      order = accounts.filter(a => a.balance > 0);
    }

    // Önce her aktif hesaba asgari öde
    let remaining = strategy === 'minimum' ? Infinity : budget;
    accounts.forEach(a => {
      if (a.balance <= 0) return;
      const pay = Math.min(a.balance, a.minPayment);
      a.balance -= pay;
      monthRow.accounts[a.id] = (monthRow.accounts[a.id] || 0) + pay;
      monthRow.totalPayment += pay;
      if (strategy !== 'minimum') remaining -= pay;
    });

    // Kalanı stratejiye göre dağıt
    if (strategy !== 'minimum' && remaining > 0) {
      for (const a of order) {
        if (a.balance <= 0) continue;
        const extra = Math.min(a.balance, remaining);
        a.balance -= extra;
        monthRow.accounts[a.id] = (monthRow.accounts[a.id] || 0) + extra;
        monthRow.totalPayment += extra;
        remaining -= extra;
        if (remaining <= 0) break;
      }
    }

    monthRow.totalBalance = accounts.reduce((s, a) => s + Math.max(0, a.balance), 0);
    months.push(monthRow);
    m++;
  }

  renderPlanResult(months, totalInterest, accounts);
}

function renderPlanResult(months, totalInterest, accounts) {
  const summary = document.getElementById('plan-summary');
  const wrap = document.getElementById('plan-table-wrap');
  summary.classList.remove('hidden');
  wrap.classList.remove('hidden');

  const totalPaid = months.reduce((s, m) => s + m.totalPayment, 0);
  const totalPrincipal = state.accounts.reduce((s, a) => s + a.balance, 0);
  const finished = months.length < 360;

  document.getElementById('plan-summary-content').innerHTML = `
    <div class="summary-item"><span class="label">Toplam Ay</span><span class="value">${finished ? months.length : '360+'}</span></div>
    <div class="summary-item"><span class="label">Toplam Faiz</span><span class="value">${TRY.format(totalInterest)}</span></div>
    <div class="summary-item"><span class="label">Toplam Ödeme</span><span class="value">${TRY.format(totalPaid)}</span></div>
    <div class="summary-item"><span class="label">Ana Para</span><span class="value">${TRY.format(totalPrincipal)}</span></div>
  `;

  const thead = document.querySelector('#plan-table thead');
  const tbody = document.querySelector('#plan-table tbody');
  thead.innerHTML = `
    <tr>
      <th>Ay</th>
      ${state.accounts.map(a => `<th>${escapeHtml(a.name)}</th>`).join('')}
      <th>Aylık Faiz</th>
      <th>Aylık Ödeme</th>
      <th>Kalan Borç</th>
    </tr>
  `;
  tbody.innerHTML = months.map(m => `
    <tr class="${m.totalBalance < 0.01 ? 'payoff-row' : ''}">
      <td>${m.month}. ay</td>
      ${state.accounts.map(a => `<td>${m.accounts[a.id] ? TRY.format(m.accounts[a.id]) : '—'}</td>`).join('')}
      <td>${TRY.format(m.totalInterest)}</td>
      <td>${TRY.format(m.totalPayment)}</td>
      <td>${TRY.format(m.totalBalance)}</td>
    </tr>
  `).join('');
}

// ---------- Import / Export ----------
function exportJSON() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `borc-takip-${new Date().toISOString().slice(0,10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('JSON indirildi');
}

function importJSON(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const data = JSON.parse(e.target.result);
      if (!data.accounts || !Array.isArray(data.accounts)) throw new Error('Geçersiz format');
      state = data;
      saveState();
      renderAccounts();
      renderDashboard();
      showToast('Veri yüklendi');
    } catch (err) {
      alert('Dosya okunamadı: ' + err.message);
    }
  };
  reader.readAsText(file);
}

function clearAll() {
  if (!confirm('TÜM verilerin silinecek. Emin misin?')) return;
  state = { accounts: [] };
  saveState();
  renderAccounts();
  renderDashboard();
  showToast('Tüm veriler silindi');
}

function seedSample() {
  if (state.accounts.length > 0 && !confirm('Mevcut veriler örnekle değiştirilsin mi?')) return;
  state = {
    accounts: [
      { id: uid(), type: 'credit_card', name: 'Garanti Bonus', balance: 12500, apr: 89, minPayment: 1250, cutoffDate: 5, dueDate: 15, notes: '', createdAt: new Date().toISOString() },
      { id: uid(), type: 'credit_card', name: 'Yapı Kredi World', balance: 7800, apr: 95, minPayment: 780, cutoffDate: 20, dueDate: 5, notes: 'Market alışverişi', createdAt: new Date().toISOString() },
      { id: uid(), type: 'flex_account', name: 'İş Bankası KMH', balance: 15000, apr: 79, minPayment: 1500, cutoffDate: null, dueDate: null, notes: 'Acil ihtiyaç', createdAt: new Date().toISOString() },
      { id: uid(), type: 'flex_account', name: 'Akbank Esnek', balance: 5500, apr: 75, minPayment: 600, cutoffDate: null, dueDate: null, notes: '', createdAt: new Date().toISOString() },
    ]
  };
  saveState();
  renderAccounts();
  renderDashboard();
  showToast('Örnek veri yüklendi');
}

// ---------- Init ----------
function init() {
  loadState();
  initTabs();

  document.getElementById('btn-add').addEventListener('click', () => openModal(null));
  document.getElementById('modal-close').addEventListener('click', closeModal);
  document.getElementById('btn-cancel').addEventListener('click', closeModal);
  document.getElementById('account-form').addEventListener('submit', handleFormSubmit);
  document.getElementById('f-type').addEventListener('change', updateTypeFields);
  document.getElementById('modal').addEventListener('click', (e) => {
    if (e.target.id === 'modal') closeModal();
  });

  document.getElementById('btn-calc-plan').addEventListener('click', calculatePlan);
  document.getElementById('btn-export').addEventListener('click', exportJSON);
  document.getElementById('file-import').addEventListener('change', (e) => {
    if (e.target.files[0]) importJSON(e.target.files[0]);
    e.target.value = '';
  });
  document.getElementById('btn-clear').addEventListener('click', clearAll);
  document.getElementById('btn-seed').addEventListener('click', seedSample);

  renderAccounts();
  renderDashboard();
}

document.addEventListener('DOMContentLoaded', init);

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(err => console.warn('SW kayıt hatası:', err));
  });
}
