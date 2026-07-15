import { OAuth2Client } from 'google-auth-library';
import { env, isGoogleConfigured } from '../config/env';
import { serviceUnavailable, unauthorized } from './errors';

/**
 * Google ID-token verification.
 *
 * The client is created once and reused — it caches Google's public signing
 * keys, so it does not fetch them on every login.
 */
const client = isGoogleConfigured ? new OAuth2Client(env.GOOGLE_CLIENT_ID) : null;

export interface GoogleIdentity {
  email: string;
  emailVerified: boolean;
  name: string | null;
  picture: string | null;
}

/**
 * Verify a Google ID token and return the identity inside it.
 *
 * `verifyIdToken` checks three things, and all three matter:
 *   • the SIGNATURE against Google's published keys — so the token is genuinely
 *     from Google and was not forged or tampered with;
 *   • the AUDIENCE equals our Client ID — so a token minted for some other app
 *     cannot be replayed against ours;
 *   • the EXPIRY — so a captured token is useless once it lapses.
 *
 * Everything past this point can trust the email. What it still cannot assume is
 * that the email belongs to a student — that check lives in the auth service,
 * against the imported roll.
 */
export async function verifyGoogleIdToken(credential: string): Promise<GoogleIdentity> {
  if (!client) {
    throw serviceUnavailable('Google Sign-In is not configured on the server.');
  }

  let ticket;
  try {
    ticket = await client.verifyIdToken({
      idToken: credential,
      audience: env.GOOGLE_CLIENT_ID,
    });
  } catch {
    // Bad signature, wrong audience, expired — all indistinguishable to the
    // caller on purpose, so a probe learns nothing about why it failed.
    throw unauthorized('Could not verify your Google sign-in. Please try again.');
  }

  const payload = ticket.getPayload();
  if (!payload?.email) {
    throw unauthorized('Google did not return an email address.');
  }

  return {
    email: payload.email.toLowerCase(),
    // Google sets this false for some federated accounts; we refuse those, since
    // an unverified email is exactly the thing our domain + roll check relies on.
    emailVerified: payload.email_verified === true,
    name: payload.name ?? null,
    picture: payload.picture ?? null,
  };
}
