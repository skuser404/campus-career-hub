import bcrypt from 'bcryptjs';
import { env } from '../config/env';

/**
 * BCrypt. Cost 12 by default — roughly 250ms per hash on typical hardware,
 * which is slow enough to make offline cracking expensive and fast enough that
 * a login does not feel sluggish.
 */
export const hashPassword = (plain: string): Promise<string> =>
  bcrypt.hash(plain, env.BCRYPT_ROUNDS);

export const verifyPassword = (plain: string, hash: string): Promise<boolean> =>
  bcrypt.compare(plain, hash);

/**
 * A pre-computed hash of a throwaway value.
 *
 * Login compares against this when the email does not exist, so that a request
 * for an unknown account costs the same time as one for a known account. Without
 * it, response latency alone tells an attacker which emails are registered.
 */
export const DUMMY_HASH = bcrypt.hashSync('timing-attack-mitigation-dummy', 10);
