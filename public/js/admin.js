const $ = (id) => document.getElementById(id);

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function showMsg(el, text, type) {
  el.textContent = text;
  el.className = `msg ${type}`;
}

async function api(path, options = {}) {
  const headers = Object.assign({}, options.headers || {});
  const fetchOptions = Object.assign({}, options, {
    credentials: 'include',
    headers
  });
  const res = await fetch('/api/admin' + path, fetchOptions);
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

// State
let allocationsData = [];
let editingRowKey = null; // For laptop inline table editing

function rowKey(r) {
  return `${r.register_no}___${r.exam_date || ''}___${r.session || ''}`;
}

// Authentication & View Switching
function setLoggedIn(on) {
  if (!on) return window.location.replace('/admin-login.html');
  $('authActions').classList.remove('hidden');
  loadAll();
}

async function loadAll() {
  await Promise.all([loadStats(), loadFilters(), loadAllocations()]);
}

async function loadStats() {
  const { ok, data } = await api('/stats');
  if (!ok) {
    return setLoggedIn(false);
  }
  $('statStudents').textContent = data.students;
  $('statRooms').textContent = data.rooms;
}

// Tab Switching
document.querySelectorAll('.tab-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach((c) => c.classList.add('hidden'));
    btn.classList.add('active');
    const target = $(btn.dataset.tab);
    if (target) target.classList.remove('hidden');

    if (btn.dataset.tab === 'tabPrint') {
      loadPrintDropdowns();
    }
  });
});

// Accordion Drawer (for Mobile mode)
const toggleEntryBtn = $('toggleEntryBtn');
const entryFormBody = $('entryFormBody');
const entryToggleIcon = $('entryToggleIcon');

if (toggleEntryBtn) {
  toggleEntryBtn.addEventListener('click', () => {
    const isCollapsed = entryFormBody.classList.toggle('collapsed-mobile');
    if (entryToggleIcon) {
      entryToggleIcon.textContent = isCollapsed ? '▶' : '▼';
    }
  });
}

// Load distinct rooms & dates for filtering and print selection
async function loadFilters() {
  const { ok, data } = await api('/rooms');
  if (!ok) return;

  $('statDates').textContent = (data.dates || []).length;

  const roomFilter = $('filterRoom');
  const currentRoomVal = roomFilter.value;
  roomFilter.innerHTML = '<option value="">All Rooms / Classes</option>' +
    (data.rooms || []).map((r) => `<option value="${esc(r)}">${esc(r)}</option>`).join('');
  roomFilter.value = currentRoomVal;

  const dateFilter = $('filterDate');
  const currentDateVal = dateFilter.value;
  dateFilter.innerHTML = '<option value="">All Dates</option>' +
    (data.dates || []).map((d) => `<option value="${esc(d)}">${esc(d)}</option>`).join('');
  dateFilter.value = currentDateVal;

  loadPrintDropdowns(data);
}

function loadPrintDropdowns(filtersData) {
  const populate = (data) => {
    const printRoom = $('printRoomSelect');
    const curR = printRoom.value;
    printRoom.innerHTML = '<option value="">-- Choose Classroom / Hall --</option>' +
      (data.rooms || []).map((r) => `<option value="${esc(r)}">${esc(r)}</option>`).join('');
    if (curR) printRoom.value = curR;

    const printDate = $('printDateSelect');
    const curD = printDate.value;
    printDate.innerHTML = '<option value="">-- All Dates / Today --</option>' +
      (data.dates || []).map((d) => `<option value="${esc(d)}">${esc(d)}</option>`).join('');
    if (curD) printDate.value = curD;
  };

  if (filtersData) {
    populate(filtersData);
  } else {
    api('/rooms').then(({ ok, data }) => { if (ok) populate(data); });
  }
}

// -------------------------
// Allocations (Adaptive: Laptop Spreadsheet vs Mobile Cards)
// -------------------------
async function loadAllocations() {
  const search = $('searchKeyword').value.trim();
  const room = $('filterRoom').value;
  const date = $('filterDate').value;

  const params = new URLSearchParams();
  if (search) params.append('search', search);
  if (room) params.append('room', room);
  if (date) params.append('date', date);

  const { ok, data } = await api('/allocations?' + params.toString());
  if (!ok) return;

  allocationsData = data.allocations || [];
  renderAllocations(allocationsData);
}

function renderAllocations(rows) {
  const isLaptop = window.getDeviceType ? window.getDeviceType() === 'laptop' : true;
  const tbody = $('tableBody');
  const cardsContainer = $('mobileCardsContainer');
  const modeBadge = $('activeModeBadge');

  if (modeBadge) {
    modeBadge.textContent = isLaptop ? '💻 Laptop Spreadsheet' : '📱 Mobile Card View';
  }

  if (!rows || rows.length === 0) {
    tbody.innerHTML = '<tr><td colspan="9" style="text-align: center; color: var(--muted); padding: 24px;">No records match your search or filter.</td></tr>';
    cardsContainer.innerHTML = '<div class="empty-state">No records found.</div>';
    $('tableSummary').textContent = 'Showing 0 records';
    return;
  }

  $('tableSummary').textContent = `Showing ${rows.length} allocation${rows.length === 1 ? '' : 's'}`;

  // 1. Render Laptop Excel Table (with in-place inline editing)
  tbody.innerHTML = rows.map((r, idx) => {
    const key = rowKey(r);
    const isEditingThisRow = editingRowKey === key;

    if (isEditingThisRow) {
      return `
        <tr class="inline-edit-row">
          <td>${idx + 1}</td>
          <td><input type="text" id="inline_reg" value="${esc(r.register_no)}" readonly style="padding: 4px 6px; font-size: 0.88rem; background:#f1f5f9;"></td>
          <td><input type="text" id="inline_name" value="${esc(r.name)}" style="padding: 4px 6px; font-size: 0.88rem;"></td>
          <td><input type="text" id="inline_room" value="${esc(r.room)}" style="padding: 4px 6px; font-size: 0.88rem;" required></td>
          <td><input type="text" id="inline_seat" value="${esc(r.seat_no)}" style="padding: 4px 6px; font-size: 0.88rem;"></td>
          <td><input type="text" id="inline_exam" value="${esc(r.exam_name)}" style="padding: 4px 6px; font-size: 0.88rem;"></td>
          <td><input type="date" id="inline_date" value="${esc(r.exam_date)}" style="padding: 4px 6px; font-size: 0.88rem;"></td>
          <td>
            <select id="inline_session" style="padding: 4px 6px; font-size: 0.88rem;">
              <option value="FN" ${r.session === 'FN' ? 'selected' : ''}>FN</option>
              <option value="AN" ${r.session === 'AN' ? 'selected' : ''}>AN</option>
              <option value="" ${!r.session ? 'selected' : ''}>None</option>
            </select>
          </td>
          <td style="text-align: center; white-space: nowrap;">
            <button class="btn btn-primary btn-xs" onclick="saveInlineRow('${esc(r.register_no)}', '${esc(r.exam_date)}', '${esc(r.session)}')">Save</button>
            <button class="btn btn-ghost btn-xs" onclick="cancelInlineEdit()">Cancel</button>
          </td>
        </tr>
      `;
    }

    return `
      <tr>
        <td>${idx + 1}</td>
        <td><strong>${esc(r.register_no)}</strong></td>
        <td>${esc(r.name) || '<span style="color:#94a3b8">—</span>'}</td>
        <td><span class="room-pill">${esc(r.room)}</span></td>
        <td>${esc(r.seat_no) || '<span style="color:#94a3b8">—</span>'}</td>
        <td>${esc(r.exam_name) || '<span style="color:#94a3b8">—</span>'}</td>
        <td>${esc(r.exam_date) || '<span style="color:#94a3b8">—</span>'}</td>
        <td>${esc(r.session) || '<span style="color:#94a3b8">—</span>'}</td>
        <td style="text-align: center; white-space: nowrap;">
          <button class="btn btn-ghost btn-xs" onclick="startInlineEdit('${esc(key)}')">Edit</button>
          <button class="btn btn-danger btn-xs" onclick="deleteRow('${esc(r.register_no)}', '${esc(r.exam_date)}', '${esc(r.session)}')">Delete</button>
        </td>
      </tr>
    `;
  }).join('');

  // 2. Render Mobile Touch Cards
  cardsContainer.innerHTML = rows.map((r, idx) => `
    <div class="mobile-record-card">
      <div class="mobile-card-top">
        <div class="mobile-card-reg">
          <strong>${esc(r.register_no)}</strong>
          ${r.seat_no ? `<span class="mobile-seat-badge">Seat ${esc(r.seat_no)}</span>` : ''}
        </div>
        <span class="room-pill">${esc(r.room)}</span>
      </div>

      <div class="mobile-card-body">
        <div class="mobile-card-name">${esc(r.name) || 'Unnamed Student'}</div>
        <div class="mobile-card-exam">${esc(r.exam_name) || 'Exam'}</div>
        <div class="mobile-card-date">
          📅 ${esc(r.exam_date) || 'No date'}${r.session ? ` · Session: ${esc(r.session)}` : ''}
        </div>
      </div>

      <div class="mobile-card-actions">
        <button class="btn btn-ghost btn-sm" onclick="openEditModal(${idx})">✏️ Edit</button>
        <button class="btn btn-danger btn-sm" onclick="deleteRow('${esc(r.register_no)}', '${esc(r.exam_date)}', '${esc(r.session)}')">🗑️ Delete</button>
      </div>
    </div>
  `).join('');
}

// -------------------------
// Laptop Inline Row Editing
// -------------------------
window.startInlineEdit = function(key) {
  editingRowKey = key;
  renderAllocations(allocationsData);
};

window.cancelInlineEdit = function() {
  editingRowKey = null;
  renderAllocations(allocationsData);
};

window.saveInlineRow = async function(origReg, origDate, origSession) {
  const name = $('inline_name').value.trim();
  const room = $('inline_room').value.trim();
  const seat_no = $('inline_seat').value.trim();
  const exam_name = $('inline_exam').value.trim();
  const exam_date = $('inline_date').value.trim();
  const session = $('inline_session').value.trim();

  if (!room) return alert('Room / Class is required.');

  if (origDate !== exam_date || origSession !== session) {
    await api('/record', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ register_no: origReg, exam_date: origDate, session: origSession })
    });
  }

  const { ok, data } = await api('/records', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      register_no: origReg,
      name,
      room,
      seat_no,
      exam_name,
      exam_date,
      session
    })
  });

  if (!ok) return alert(data.error || 'Failed to update record.');
  editingRowKey = null;
  await loadAll();
};

// -------------------------
// Mobile Modal Editing
// -------------------------
window.openEditModal = function(idx) {
  const r = allocationsData[idx];
  if (!r) return;

  $('modalOrigReg').value = r.register_no;
  $('modalOrigDate').value = r.exam_date || '';
  $('modalOrigSession').value = r.session || '';

  $('modalReg').value = r.register_no;
  $('modalName').value = r.name || '';
  $('modalRoom').value = r.room || '';
  $('modalSeat').value = r.seat_no || '';
  $('modalExam').value = r.exam_name || '';
  $('modalDate').value = r.exam_date || '';
  $('modalSession').value = r.session || '';

  $('editModal').classList.remove('hidden');
  document.body.style.overflow = 'hidden';
};

function closeEditModal() {
  $('editModal').classList.add('hidden');
  document.body.style.overflow = '';
}

$('modalCloseBtn').addEventListener('click', closeEditModal);
$('modalCancelBtn').addEventListener('click', closeEditModal);
$('modalBackdrop').addEventListener('click', closeEditModal);

$('modalSaveBtn').addEventListener('click', async () => {
  const origReg = $('modalOrigReg').value;
  const origDate = $('modalOrigDate').value;
  const origSession = $('modalOrigSession').value;

  const name = $('modalName').value.trim();
  const room = $('modalRoom').value.trim();
  const seat_no = $('modalSeat').value.trim();
  const exam_name = $('modalExam').value.trim();
  const exam_date = $('modalDate').value.trim();
  const session = $('modalSession').value.trim();

  if (!room) return alert('Room / Class is required.');

  if (origDate !== exam_date || origSession !== session) {
    await api('/record', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ register_no: origReg, exam_date: origDate, session: origSession })
    });
  }

  const { ok, data } = await api('/records', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      register_no: origReg,
      name,
      room,
      seat_no,
      exam_name,
      exam_date,
      session
    })
  });

  if (!ok) return alert(data.error || 'Failed to update record.');
  closeEditModal();
  await loadAll();
});

// Delete Record
window.deleteRow = async function(regNo, date, session) {
  if (!confirm(`Delete allocation for ${regNo} (${date || 'no date'} - ${session || 'all sessions'})?`)) return;
  const { ok, data } = await api('/record', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ register_no: regNo, exam_date: date, session })
  });
  if (!ok) return alert(data.error || 'Failed to delete record.');
  await loadAll();
};

// Quick Add Record
$('addRecordBtn').addEventListener('click', async () => {
  const regNo = $('mRegNo').value.trim();
  const name = $('mName').value.trim();
  const room = $('mRoom').value.trim();
  const seat = $('mSeat').value.trim();
  const exam = $('mExam').value.trim();
  const date = $('mDate').value.trim();
  const session = $('mSession').value.trim();

  if (!regNo) return showMsg($('manualMsg'), 'Register Number is required.', 'error');
  if (!room) return showMsg($('manualMsg'), 'Class / Room is required.', 'error');

  const { ok, data } = await api('/records', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      register_no: regNo,
      name,
      room,
      seat_no: seat,
      exam_name: exam,
      exam_date: date,
      session
    })
  });

  if (!ok) return showMsg($('manualMsg'), data.error || 'Could not save record.', 'error');

  showMsg($('manualMsg'), `Saved allocation for ${regNo} in ${room}!`, 'ok');
  $('mRegNo').value = '';
  $('mName').value = '';
  $('mSeat').value = '';

  await loadAll();
  setTimeout(() => $('manualMsg').classList.add('hidden'), 3500);
});

// Search & Filter Triggers
$('searchKeyword').addEventListener('input', () => {
  clearTimeout(window._searchTimer);
  window._searchTimer = setTimeout(loadAllocations, 300);
});
$('filterRoom').addEventListener('change', loadAllocations);
$('filterDate').addEventListener('change', loadAllocations);
$('resetFiltersBtn').addEventListener('click', () => {
  $('searchKeyword').value = '';
  $('filterRoom').value = '';
  $('filterDate').value = '';
  loadAllocations();
});
$('refreshTableBtn').addEventListener('click', loadAll);

// Listen to Device Mode changes from deviceDetector
window.onDeviceModeChanged = function() {
  renderAllocations(allocationsData);
};

// -------------------------
// Print Seating Arrangement
// -------------------------
$('generateSheetBtn').addEventListener('click', async () => {
  const room = $('printRoomSelect').value;
  const date = $('printDateSelect').value;
  const session = $('printSessionSelect').value;

  if (!room) return showMsg($('printMsg'), 'Please choose a Classroom / Hall.', 'error');
  $('printMsg').classList.add('hidden');

  const params = new URLSearchParams({ room });
  if (date) params.append('date', date);
  if (session) params.append('session', session);

  const { ok, data } = await api('/seating?' + params.toString());
  if (!ok) return showMsg($('printMsg'), data.error || 'Failed to generate seating chart.', 'error');

  if (!data.students || data.students.length === 0) {
    return showMsg($('printMsg'), `No students allocated in ${room} for the selected criteria.`, 'error');
  }

  $('sheetRoomName').textContent = data.room;
  $('sheetDate').textContent = data.date || 'All Dates';
  $('sheetSession').textContent = data.session || 'All Sessions';
  $('sheetTotal').textContent = `${data.totalStudents} candidate${data.totalStudents === 1 ? '' : 's'}`;

  const tbody = $('sheetTableBody');
  tbody.innerHTML = data.students.map((s, idx) => `
    <tr>
      <td class="text-center">${idx + 1}</td>
      <td><strong>${esc(s.seat_no) || '—'}</strong></td>
      <td><strong>${esc(s.register_no)}</strong></td>
      <td>${esc(s.name) || '—'}</td>
      <td>${esc(s.exam_name) || '—'}</td>
      <td style="border-bottom: 1px solid #000;">&nbsp;</td>
    </tr>
  `).join('');

  $('sheetContainer').classList.remove('hidden');
  $('sheetContainer').scrollIntoView({ behavior: 'smooth' });
});

$('triggerPrintBtn').addEventListener('click', () => {
  window.print();
});

// -------------------------
// Bulk CSV Upload & Clear
// -------------------------
async function upload() {
  const file = $('file').files[0];
  if (!file) return showMsg($('uploadMsg'), 'Select a CSV file first.', 'error');
  const mode = document.querySelector('input[name=mode]:checked').value;
  if (mode === 'replace' && !confirm('This replaces ALL existing allocations. Continue?')) return;

  const form = new FormData();
  form.append('mode', mode);
  form.append('file', file);

  $('uploadBtn').disabled = true;
  const { ok, data } = await api('/upload', { method: 'POST', body: form });
  $('uploadBtn').disabled = false;

  $('uploadErrors').innerHTML = (data.errors || []).map((e) => `<li>${esc(e)}</li>`).join('');
  if (!ok) return showMsg($('uploadMsg'), data.error || 'Upload failed.', 'error');
  showMsg($('uploadMsg'), `Imported ${data.imported} rows${data.skipped ? `, skipped ${data.skipped}` : ''}.`, 'ok');
  loadAll();
}

async function clearAll() {
  if (!confirm('Are you sure you want to delete EVERY allocation? This cannot be undone.')) return;
  await api('/allocations', { method: 'DELETE' });
  loadAll();
}

async function logout() {
  await api('/logout', { method: 'POST' });
  window.location.replace('/admin-login.html');
}

$('uploadBtn').addEventListener('click', upload);
$('clearBtn').addEventListener('click', clearAll);
$('logoutBtn').addEventListener('click', logout);

// Initial check
(async () => {
  const { ok } = await api('/stats');
  setLoggedIn(ok);
})();
