export const adminSessionExpired = 'admin-session-expired';

export async function adminFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const headers = new Headers(options.headers);
  headers.set('Accept', 'application/json');
  if (options.body) headers.set('Content-Type', 'application/json');
  const response = await fetch(path, { ...options, headers, cache: 'no-store' });
  if (response.status === 401 && path !== '/api/admin/session') {
    window.dispatchEvent(new Event(adminSessionExpired));
  }
  return response;
}

export async function loginAdmin(token: string): Promise<void> {
  const response = await adminFetch('/api/admin/session', {
    method: 'POST',
    body: JSON.stringify({ token }),
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({})) as { error?: string };
    throw new Error(data.error || '無法登入後台，請稍後再試。');
  }
}

export async function logoutAdmin(): Promise<void> {
  const response = await adminFetch('/api/admin/session', { method: 'DELETE' });
  if (!response.ok) throw new Error('登出失敗，請再試一次。');
}
