// Small fetch helper - always sends cookies, always parses JSON, throws readable errors.
const API_BASE = '/api';

async function api(path, { method = 'GET', body, isForm = false } = {}) {
  const opts = { method, credentials: 'include', headers: {} };
  if (body !== undefined) {
    if (isForm) {
      opts.body = body; // FormData - browser sets multipart headers itself
    } else {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(body);
    }
  }
  const res = await fetch(API_BASE + path, opts);
  let data = null;
  try { data = await res.json(); } catch (e) { /* no body */ }
  if (!res.ok) {
    const err = new Error(data?.error || 'Something went wrong. Please try again.');
    err.status = res.status;
    throw err;
  }
  return data;
}

window.api = api;
