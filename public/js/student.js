const input = document.getElementById('regNo');
const btn = document.getElementById('searchBtn');
const clearBtn = document.getElementById('clearInputBtn');
const spinner = document.getElementById('searchSpinner');
const msg = document.getElementById('message');
const results = document.getElementById('results');
const todayDisplay = document.getElementById('todayDisplay');

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Get ISO YYYY-MM-DD in client local time
function getClientDateIso() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Display human-readable date with day of the week
if (todayDisplay) {
  try {
    const options = { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' };
    todayDisplay.textContent = new Date().toLocaleDateString(undefined, options);
  } catch (_) {
    todayDisplay.textContent = getClientDateIso();
  }
}

// Input clear button toggle
function toggleClearButton() {
  if (clearBtn) {
    clearBtn.classList.toggle('hidden', !input.value.trim());
  }
}

input.addEventListener('input', () => {
  toggleClearButton();
  if (msg.classList.contains('error')) {
    msg.className = 'msg hidden';
  }
});

if (clearBtn) {
  clearBtn.addEventListener('click', () => {
    input.value = '';
    toggleClearButton();
    input.focus();
    results.innerHTML = '';
    msg.className = 'msg hidden';
  });
}

function showMessage(text, type) {
  msg.textContent = text;
  msg.className = `msg ${type}`;
}

function render(data) {
  if (!data.allocations || data.allocations.length === 0) {
    showMessage(`No exam arrangements scheduled for today (${data.date || getClientDateIso()}).`, 'error');
    return;
  }

  results.innerHTML = data.allocations.map((a) => `
    <article class="card result-card">
      <div class="result-header">
        <span class="badge-status">Today's Exam</span>
        ${a.session ? `<span class="badge-session">${esc(a.session)} Session</span>` : ''}
      </div>

      <div class="result-subject">${esc(a.exam_name) || 'Examination'}</div>

      <div class="room-highlight-box">
        <div class="room-title">Assigned Classroom / Hall</div>
        <div class="room-number">${esc(a.room)}</div>
        ${a.seat_no ? `
          <div class="seat-pill">
            <span class="seat-label">Seat Number</span>
            <span class="seat-value">${esc(a.seat_no)}</span>
          </div>
        ` : ''}
      </div>

      <div class="candidate-footer">
        <div class="candidate-info">
          <div class="candidate-name">${esc(data.name || 'Candidate')}</div>
          <div class="candidate-reg">Reg No: <strong>${esc(data.register_no)}</strong></div>
        </div>
      </div>
    </article>
  `).join('');

  // Smooth scroll to results on mobile devices
  results.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

async function search() {
  const value = input.value.trim();
  if (!value) {
    showMessage('Please enter your register / admission number.', 'error');
    input.focus();
    return;
  }

  // Dismiss mobile soft keyboard
  input.blur();

  btn.disabled = true;
  if (spinner) spinner.classList.remove('hidden');
  results.innerHTML = '';
  msg.className = 'msg hidden';
  const localDate = getClientDateIso();

  try {
    const res = await fetch(`/api/allocation/${encodeURIComponent(value)}?date=${encodeURIComponent(localDate)}`);
    const data = await res.json();
    if (!res.ok) {
      return showMessage(data.error || 'No record found. Please check your number.', 'error');
    }
    render(data);
  } catch {
    showMessage('Connection error. Please check your network and try again.', 'error');
  } finally {
    btn.disabled = false;
    if (spinner) spinner.classList.add('hidden');
  }
}

btn.addEventListener('click', search);
input.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    search();
  }
});
