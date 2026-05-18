const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:4000';

function authHeaders(token) {
  return token ? { authorization: `Bearer ${token}` } : {};
}

export async function loginWithPin(pin) {
  const res = await fetch(`${API_BASE}/api/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ pin })
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || 'Invalid PIN');
  return json.token;
}

export async function getSeed(date, token) {
  const res = await fetch(`${API_BASE}/api/seed?date=${date}`, {
    headers: authHeaders(token),
    cache: 'no-store'
  });
  if (!res.ok) throw new Error('Unable to load seed data');
  return res.json();
}

export async function saveData(date, data, token) {
  const res = await fetch(`${API_BASE}/api/data`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...authHeaders(token) },
    body: JSON.stringify({ date, data })
  });
  if (!res.ok) throw new Error('Unable to save data');
  return res.json();
}

export async function getSourceStatus(date, token) {
  const res = await fetch(`${API_BASE}/api/source-status?date=${date}`, { headers: authHeaders(token) });
  if (!res.ok) throw new Error('Unable to load source status');
  return res.json();
}

export async function generateAiNotes(prompt, token) {
  const res = await fetch(`${API_BASE}/api/ai-notes`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...authHeaders(token) },
    body: JSON.stringify({ prompt })
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || 'Unable to generate AI notes');
  return json.text;
}

export function reportPdfUrl(date, token) {
  const params = new URLSearchParams({ date });
  if (token) params.set('token', token);
  return `${API_BASE}/api/report.pdf?${params.toString()}`;
}

export function reportPdfPreviewUrl(date, token) {
  const params = new URLSearchParams({ date, inline: '1' });
  if (token) params.set('token', token);
  return `${API_BASE}/api/report.pdf?${params.toString()}`;
}
