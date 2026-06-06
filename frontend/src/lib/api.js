const API_BASE = (import.meta.env.VITE_API_BASE || 'http://localhost:4000').replace(/\/+$/, '');
const REQUEST_TIMEOUT_MS = 30000;
const RETRY_DELAY_MS = 1200;

function authHeaders(token) {
  return token ? { authorization: `Bearer ${token}` } : {};
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryable(error) {
  return error.name === 'AbortError'
    || /network|failed to fetch|timeout|temporarily|503|502|504/i.test(error.message);
}

async function readJson(res) {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function apiFetch(path, options = {}, fallbackMessage = 'Request failed', timeoutMs = REQUEST_TIMEOUT_MS) {
  const url = new URL(path, API_BASE);
  url.searchParams.set('_ts', Date.now().toString());
  const { signal: externalSignal, ...fetchOptions } = options;

  let lastError;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const controller = new AbortController();
    let timer;
    const abort = () => {
      if (!controller.signal.aborted) controller.abort();
    };

    try {
      if (externalSignal?.aborted) throw new DOMException('Request cancelled', 'AbortError');
      externalSignal?.addEventListener('abort', abort, { once: true });
      timer = setTimeout(abort, timeoutMs);
      const res = await fetch(url.toString(), {
        ...fetchOptions,
        signal: controller.signal,
        cache: 'no-store',
        headers: {
          ...(fetchOptions.headers ?? {})
        }
      });
      const json = await readJson(res);
      if (!res.ok) {
        const message = typeof json === 'object' && json?.error
          ? json.error
          : `${fallbackMessage} (${res.status})`;
        const error = new Error(message);
        error.status = res.status;
        if (typeof json === 'object' && json?.lockedUntil) error.lockedUntil = json.lockedUntil;
        throw error;
      }
      return json;
    } catch (err) {
      if (externalSignal?.aborted) {
        lastError = err;
        break;
      }
      lastError = err.name === 'AbortError'
        ? new Error(`${fallbackMessage}: request timed out`)
        : err;
      if (attempt === 0 && isRetryable(lastError)) {
        await wait(RETRY_DELAY_MS);
        continue;
      }
      break;
    } finally {
      clearTimeout(timer);
      externalSignal?.removeEventListener('abort', abort);
    }
  }

  throw lastError;
}

export async function loginWithPin(pin) {
  const json = await apiFetch('/api/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ pin })
  }, 'Invalid PIN');
  return json.token;
}

export async function getSeed(date, token, options = {}) {
  return apiFetch(`/api/seed?date=${encodeURIComponent(date)}`, {
    ...options,
    headers: { ...authHeaders(token), ...(options.headers ?? {}) }
  }, 'Unable to load seed data');
}

export async function saveData(date, data, token) {
  return apiFetch('/api/data', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...authHeaders(token) },
    body: JSON.stringify({ date, data })
  }, 'Unable to save data');
}

export async function getSourceStatus(date, token) {
  return apiFetch(`/api/source-status?date=${encodeURIComponent(date)}`, {
    headers: authHeaders(token)
  }, 'Unable to load source status');
}

export async function getPnlPeriod(date, token, options = {}) {
  return apiFetch(`/api/pnl-period?date=${encodeURIComponent(date)}`, {
    ...options,
    headers: { ...authHeaders(token), ...(options.headers ?? {}) }
  }, 'Unable to load MTD/YTD totals', 90000);
}

export async function getPnlWeek(date, token, options = {}) {
  return apiFetch(`/api/pnl-week?date=${encodeURIComponent(date)}`, {
    ...options,
    headers: { ...authHeaders(token), ...(options.headers ?? {}) }
  }, 'Unable to load week-to-date totals', 30000);
}

export async function getEmailImportStatus(token) {
  return apiFetch('/api/email-import', {
    headers: authHeaders(token)
  }, 'Unable to load email import status');
}

export async function runEmailImport(token, { force = false } = {}) {
  return apiFetch('/api/email-import', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...authHeaders(token) },
    body: JSON.stringify({ force })
  }, 'Unable to run email import');
}

export async function getSourceReportPreview(date, sourceId, file, token) {
  const params = new URLSearchParams({ date, sourceId, file });
  return apiFetch(`/api/source-report-preview?${params.toString()}`, {
    headers: authHeaders(token)
  }, 'Unable to load report preview');
}

export async function getAopTargets(token) {
  return apiFetch('/api/aop-targets', {
    headers: { ...authHeaders(token) }
  }, 'Unable to load AOP targets');
}

export async function saveAopTargets(payload, token) {
  return apiFetch('/api/aop-targets', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...authHeaders(token) },
    body: JSON.stringify(payload)
  }, 'Unable to save AOP targets');
}

export async function generateAiNotes(prompt, token) {
  const json = await apiFetch('/api/ai-notes', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...authHeaders(token) },
    body: JSON.stringify({ prompt })
  }, 'Unable to generate AI notes');
  return json.text;
}

function applyPdfSectionParams(params, sections) {
  if (Array.isArray(sections) && sections.length) params.set('sections', sections.join(','));
}

function applyPdfReportType(params, reportType, weekStart) {
  if (reportType === 'weekly') {
    params.set('reportType', 'weekly');
    if (weekStart) params.set('weekStart', weekStart);
  }
}

export function reportPdfUrl(date, token, sections, reportType = 'daily', weekStart = '') {
  const params = new URLSearchParams({ date });
  if (token) params.set('token', token);
  applyPdfSectionParams(params, sections);
  applyPdfReportType(params, reportType, weekStart);
  return `${API_BASE}/api/report.pdf?${params.toString()}`;
}

export function reportPdfPreviewUrl(date, token, sections, reportType = 'daily', weekStart = '') {
  const params = new URLSearchParams({ date, inline: '1' });
  if (token) params.set('token', token);
  applyPdfSectionParams(params, sections);
  applyPdfReportType(params, reportType, weekStart);
  return `${API_BASE}/api/report.pdf?${params.toString()}`;
}
