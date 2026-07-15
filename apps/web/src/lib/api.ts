import type { ApiResponse, PaginationMeta } from '@cch/shared';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: Array<{ path: string; message: string }>,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  /** Field-level errors, keyed by field name — feeds straight into React Hook Form. */
  get fieldErrors(): Record<string, string> {
    const out: Record<string, string> = {};
    for (const d of this.details ?? []) {
      if (d.path) out[d.path] = d.message;
    }
    return out;
  }
}

export interface Paginated<T> {
  items: T[];
  pagination: PaginationMeta;
}

/**
 * A single in-flight refresh, shared by every caller.
 *
 * When an access token expires, a dashboard typically has four or five queries
 * in flight, and all of them 401 at once. Without this, each would fire its own
 * POST /auth/refresh — and since refresh tokens ROTATE, the first would succeed
 * and invalidate the token the other four are still holding. They would then be
 * flagged as token reuse, which revokes every session the user has and throws
 * them out of the app.
 *
 * So: the first 401 starts a refresh, everyone else awaits that same promise.
 */
let refreshPromise: Promise<boolean> | null = null;

async function refreshSession(): Promise<boolean> {
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    try {
      const res = await fetch(`${API_URL}/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
      });
      return res.ok;
    } catch {
      return false;
    } finally {
      // Cleared on the next tick so concurrent callers all observe the same
      // resolved promise before it is discarded.
      setTimeout(() => {
        refreshPromise = null;
      }, 0);
    }
  })();

  return refreshPromise;
}

interface RequestOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
  /** Internal: prevents an infinite refresh→401→refresh loop. */
  _retried?: boolean;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { body, _retried, ...init } = options;

  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    // `include` is what sends the httpOnly auth cookies cross-origin
    // (Vercel → Render). Without it the API sees every request as anonymous.
    credentials: 'include',
    headers: {
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...init.headers,
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });

  // 204 has no body to parse.
  if (res.status === 204) return undefined as T;

  let json: ApiResponse<T>;
  try {
    json = (await res.json()) as ApiResponse<T>;
  } catch {
    throw new ApiError(res.status, 'INTERNAL_ERROR', 'The server returned an invalid response.');
  }

  if (!res.ok || !json.success) {
    const error = !json.success
      ? json.error
      : { code: 'INTERNAL_ERROR', message: 'Request failed' };

    /**
     * A 401 on a normal endpoint means the access token expired. Refresh once
     * and replay the request, so the user never sees a flicker.
     *
     * The auth routes are excluded: a 401 from /auth/login means "wrong
     * password", and refreshing in response to that would be nonsense.
     */
    if (
      res.status === 401 &&
      !_retried &&
      !path.startsWith('/auth/login') &&
      !path.startsWith('/auth/refresh')
    ) {
      if (await refreshSession()) {
        return request<T>(path, { ...options, _retried: true });
      }
    }

    handlePasswordChangeRequired(error.code, path);

    throw new ApiError(res.status, error.code, error.message, error.details);
  }

  return json.data;
}

/**
 * A student still holding their USN as a password is locked out of every endpoint
 * except /auth/first-login, so ANY other request they make comes back with this
 * code. Rather than let each page render its own "forbidden" state, we send them
 * to the one screen their session can actually use.
 *
 * A hard `location.replace` rather than a router push: this can fire from inside
 * any query on any page, including during render, where the Next router is not
 * safely callable. Replace (not assign) so the back button cannot bounce them
 * into the same wall again.
 */
function handlePasswordChangeRequired(code: string, path: string): void {
  if (code !== 'PASSWORD_CHANGE_REQUIRED') return;
  if (typeof window === 'undefined') return;
  if (path.startsWith('/auth/first-login')) return;
  if (window.location.pathname === '/first-login') return;

  window.location.replace('/first-login');
}

/** Same as `request`, but also surfaces the pagination envelope. */
async function requestPaginated<T>(path: string, options: RequestOptions = {}): Promise<Paginated<T>> {
  const { body, _retried, ...init } = options;

  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    credentials: 'include',
    headers: {
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...init.headers,
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });

  let json: ApiResponse<T[]>;
  try {
    json = (await res.json()) as ApiResponse<T[]>;
  } catch {
    throw new ApiError(res.status, 'INTERNAL_ERROR', 'The server returned an invalid response.');
  }

  if (!res.ok || !json.success) {
    const error = !json.success
      ? json.error
      : { code: 'INTERNAL_ERROR', message: 'Request failed' };

    if (res.status === 401 && !_retried && !path.startsWith('/auth/')) {
      if (await refreshSession()) {
        return requestPaginated<T>(path, { ...options, _retried: true });
      }
    }

    handlePasswordChangeRequired(error.code, path);

    throw new ApiError(res.status, error.code, error.message, error.details);
  }

  return {
    items: json.data,
    pagination: json.meta?.pagination ?? {
      page: 1,
      limit: json.data.length,
      total: json.data.length,
      totalPages: 1,
      hasNext: false,
      hasPrev: false,
    },
  };
}

export const api = {
  get: <T>(path: string) => request<T>(path, { method: 'GET' }),
  getPaginated: <T>(path: string) => requestPaginated<T>(path, { method: 'GET' }),
  post: <T>(path: string, body?: unknown) => request<T>(path, { method: 'POST', body }),
  patch: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PATCH', body }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};

export { API_URL };
