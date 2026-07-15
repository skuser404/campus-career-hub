'use client';

import type {
  AuthResponse,
  ChangePasswordInput,
  FirstLoginPasswordInput,
  LoginInput,
  PublicUser,
  UpdateOwnProfileInput,
} from '@cch/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { ApiError, api } from '@/lib/api';

/**
 * There is NO `useRegister`. Accounts are created by admin import only — a
 * self-service signup would let an outsider into a closed, department-gated
 * system, which is precisely what this design prevents.
 */

export const authKeys = {
  me: ['auth', 'me'] as const,
  sessions: ['auth', 'sessions'] as const,
};

/**
 * The current user.
 *
 * `retry: false` — a 401 here is the correct, expected answer for a signed-out
 * visitor, not a failure worth retrying. Retrying would delay the redirect and
 * make the login page feel sluggish for exactly the people who need it.
 */
export function useCurrentUser() {
  return useQuery({
    queryKey: authKeys.me,
    queryFn: () => api.get<PublicUser>('/auth/me'),
    retry: false,
    staleTime: 5 * 60_000,
  });
}

export function useLogin() {
  const queryClient = useQueryClient();
  const router = useRouter();

  return useMutation({
    mutationFn: (input: LoginInput) => api.post<AuthResponse>('/auth/login', input),

    onSuccess(data) {
      /**
       * The fork that matters.
       *
       * A student still holding their USN as a password is locked out of every
       * endpoint except /auth/first-login. Sending them to the dashboard would
       * show them a wall of 403s. So they go straight to the change-password
       * screen, which is the only thing their session can actually do.
       */
      if (data.mustChangePassword) {
        router.push('/first-login');
        return;
      }

      // Seed the cache directly rather than invalidating: we already have the
      // user, so a refetch would be a wasted round trip and a flash of loading
      // state on the very first screen after login.
      queryClient.setQueryData(authKeys.me, data.user);

      toast.success(`Welcome back, ${data.user.fullName.split(' ')[0]}`);
      router.push(data.user.role === 'admin' ? '/admin' : '/dashboard');
      router.refresh();
    },

    onError(error) {
      toast.error(error instanceof ApiError ? error.message : 'Could not sign you in');
    },
  });
}

/** The forced first-login password change. The only call a locked-out session can make. */
export function useFirstLogin() {
  const queryClient = useQueryClient();
  const router = useRouter();

  return useMutation({
    mutationFn: (input: FirstLoginPasswordInput) =>
      api.post<{ user: PublicUser; message: string }>('/auth/first-login', input),

    onSuccess(data) {
      queryClient.setQueryData(authKeys.me, data.user);

      toast.success('Password set. You are all set.');
      router.push(data.user.role === 'admin' ? '/admin' : '/dashboard');
      router.refresh();
    },

    onError(error) {
      toast.error(error instanceof ApiError ? error.message : 'Could not set your password');
    },
  });
}

export function useLogout() {
  const queryClient = useQueryClient();
  const router = useRouter();

  return useMutation({
    mutationFn: () => api.post<void>('/auth/logout'),

    // `onSettled`, not `onSuccess`. If the request fails — network dropped, server
    // down — the user still expects to be signed out locally. Leaving them looking
    // at a populated dashboard would be worse than clearing a cache we could not
    // confirm.
    onSettled() {
      queryClient.clear();
      toast.success('Signed out');
      router.push('/login');
      router.refresh();
    },
  });
}

export function useUpdateProfile() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: UpdateOwnProfileInput) => api.patch<PublicUser>('/me/profile', input),

    onSuccess(user) {
      queryClient.setQueryData(authKeys.me, user);
      toast.success('Profile updated');
    },

    onError(error) {
      toast.error(error instanceof ApiError ? error.message : 'Could not update your profile');
    },
  });
}

export function useChangePassword() {
  return useMutation({
    mutationFn: (input: ChangePasswordInput) =>
      api.post<{ message: string }>('/auth/change-password', input),

    onSuccess(data) {
      toast.success(data.message);
    },

    onError(error) {
      toast.error(error instanceof ApiError ? error.message : 'Could not change your password');
    },
  });
}

export interface SessionRow {
  id: string;
  userAgent: string | null;
  ip: string | null;
  createdAt: string;
  expiresAt: string;
}

export function useSessions() {
  return useQuery({
    queryKey: authKeys.sessions,
    queryFn: () => api.get<SessionRow[]>('/auth/sessions'),
  });
}

export function useRevokeAllSessions() {
  const queryClient = useQueryClient();
  const router = useRouter();

  return useMutation({
    mutationFn: () => api.post<{ message: string }>('/auth/sessions/revoke-all'),

    onSuccess() {
      // Revoking every session includes this one, so we are now signed out too.
      queryClient.clear();
      toast.success('Signed out of all devices');
      router.push('/login');
    },

    onError(error) {
      toast.error(error instanceof ApiError ? error.message : 'Could not revoke sessions');
    },
  });
}
