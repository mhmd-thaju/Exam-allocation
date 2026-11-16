const $ = (id) => document.getElementById(id);
const PAGE_SIZE = 50;
let studentOffset = 0;
let adminOffset = 0;

const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;'
}[char]));

function formatTime(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? esc(value) : esc(date.toLocaleString());
}

function showError(message) {
  $('dashboardMessage').textContent = message;
  $('dashboardMessage').className = 'msg error';
}

function appendStudentEvents(events) {
  const body = $('studentLogBody');
  if (studentOffset === 0) body.innerHTML = '';
  if (!events.length && studentOffset === 0) {
    body.innerHTML = '<tr><td colspan="4" class="dashboard-empty">No student lookups yet.</td></tr>';
    return;
  }
  body.insertAdjacentHTML('beforeend', events.map((event) => `
    <tr>
      <td>${formatTime(event.occurred_at)}</td>
      <td><strong>${esc(event.register_no)}</strong></td>
      <td>${esc(event.student_name || '—')}</td>
      <td><span class="dashboard-result ${event.outcome === 'arrangement_found' ? 'dashboard-result-ok' : 'dashboard-result-miss'}">${event.outcome === 'arrangement_found' ? 'Arrangement found' : 'Not found'}</span></td>
    </tr>
  `).join(''));
}

function appendAdminEvents(events) {
  const body = $('adminLogBody');
  if (adminOffset === 0) body.innerHTML = '';
  if (!events.length && adminOffset === 0) {
    body.innerHTML = '<tr><td colspan="5" class="dashboard-empty">No admin activity yet.</td></tr>';
    return;
  }
  body.insertAdjacentHTML('beforeend', events.map((event) => {
    const details = event.details ? JSON.stringify(event.details) : '';
    const targetAndDetails = [event.target, details].filter(Boolean).join(' · ');
    return `
      <tr>
        <td>${formatTime(event.completed_at || event.occurred_at)}</td>
        <td><strong>${esc(event.actor)}</strong></td>
        <td>${esc(event.action)}</td>
        <td class="dashboard-details">${esc(targetAndDetails || '—')}</td>
        <td><span class="dashboard-result ${event.outcome === 'success' ? 'dashboard-result-ok' : 'dashboard-result-miss'}">${esc(event.outcome)}</span></td>
      </tr>
    `;
  }).join(''));
}

async function loadLogs({ updateStudents = true, updateAdmins = true } = {}) {
  $('dashboardMessage').className = 'msg hidden';
  const params = new URLSearchParams({
    limit: String(PAGE_SIZE),
    studentOffset: String(studentOffset),
    adminOffset: String(adminOffset)
  });
  try {
    const response = await fetch(`/api/admin/dashboard-logs?${params}`, {
      credentials: 'same-origin',
      cache: 'no-store'
    });
    if (response.status === 401) {
      window.location.replace('/admin-login.html?next=dashboard');
      return;
    }
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Could not load activity logs.');

    $('totalLookups').textContent = data.studentStats.totalLookups;
    $('uniqueLookups').textContent = data.studentStats.uniqueRegisterNumbers;
    if (updateStudents) {
      $('loadMoreStudentsBtn').classList.toggle('hidden', !data.studentHasMore);
      appendStudentEvents(data.studentEvents);
    }
    if (updateAdmins) {
      $('adminEventsCount').textContent = adminOffset + data.adminEvents.length;
      $('loadMoreAdminsBtn').classList.toggle('hidden', !data.adminHasMore);
      appendAdminEvents(data.adminEvents);
    }
  } catch (error) {
    showError(error.message || 'Could not load activity logs.');
  }
}

$('refreshLogsBtn').addEventListener('click', () => {
  studentOffset = 0;
  adminOffset = 0;
  loadLogs();
});
$('loadMoreStudentsBtn').addEventListener('click', () => {
  studentOffset += PAGE_SIZE;
  loadLogs({ updateAdmins: false });
});
$('loadMoreAdminsBtn').addEventListener('click', () => {
  adminOffset += PAGE_SIZE;
  loadLogs({ updateStudents: false });
});
$('logoutBtn').addEventListener('click', async () => {
  try {
    await fetch('/api/admin/logout', { method: 'POST', credentials: 'same-origin' });
  } finally {
    window.location.replace('/admin-login.html');
  }
});

loadLogs();
