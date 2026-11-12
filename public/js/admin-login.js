const form = document.getElementById('loginForm');
const button = document.getElementById('loginBtn');
const message = document.getElementById('loginMsg');

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  button.disabled = true;
  message.className = 'msg hidden';

  try {
    const response = await fetch('/api/admin/login', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: document.getElementById('username').value,
        password: document.getElementById('password').value
      })
    });
    const result = await response.json();
    if (!response.ok) {
      message.textContent = result.error || 'Sign in failed.';
      message.className = 'msg error';
      return;
    }

    document.getElementById('password').value = '';
    window.location.assign('/admin.html');
  } catch (error) {
    message.textContent = 'Could not reach the server. Please try again.';
    message.className = 'msg error';
  } finally {
    button.disabled = false;
  }
});
