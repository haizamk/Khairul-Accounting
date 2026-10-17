import { auth } from './firebase.ts';

/**
 * Obtains a fresh Firebase ID token from the currently authenticated user.
 * Firebase Auth SDK automatically handles cached token validity check and
 * background token refresh if expired or near expiration.
 */
export async function getFreshToken(forceRefresh = false): Promise<string | null> {
  if (!auth.currentUser) return null;
  try {
    return await auth.currentUser.getIdToken(forceRefresh);
  } catch (err) {
    console.error('Error retrieving fresh Firebase ID token:', err);
    return null;
  }
}

/**
 * Shared wrapper around `fetch` that automatically injects a fresh
 * `Authorization: Bearer <token>` header on outgoing API requests.
 * Automatically retries once with forceRefresh=true if a 401 Unauthorized is encountered.
 */
export async function apiFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  let token = await getFreshToken(false);
  const headers = new Headers(init.headers || {});

  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const response = await fetch(input, {
    ...init,
    headers,
  });

  // If token was expired on the server (401), force refresh and retry once
  if (response.status === 401 && auth.currentUser) {
    const refreshedToken = await getFreshToken(true);
    if (refreshedToken && refreshedToken !== token) {
      const retryHeaders = new Headers(init.headers || {});
      retryHeaders.set('Authorization', `Bearer ${refreshedToken}`);
      return fetch(input, {
        ...init,
        headers: retryHeaders,
      });
    }
  }

  return response;
}
