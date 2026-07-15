import crypto from 'node:crypto';
import type { UploadSignatureResponse } from '@cch/shared';
import { env, isCloudinaryConfigured } from '../../config/env';
import { serviceUnavailable } from '../../lib/errors';

/**
 * Signed direct upload to Cloudinary.
 *
 * The browser POSTs the file straight to Cloudinary with these params. Two
 * things follow, and both are the point:
 *
 *   1. The API secret never reaches the client. Only a signature does, and a
 *      signature is scoped to one folder and expires with its timestamp.
 *   2. Image bytes never transit our server, so a 5MB upload does not occupy a
 *      Render worker for the duration of the transfer.
 */
export function createSignature(folder: string): UploadSignatureResponse {
  if (!isCloudinaryConfigured) {
    // A clear, actionable 503 rather than a confusing 500. The admin UI reads
    // this and falls back to pasting an image URL, so the feature degrades
    // instead of breaking.
    throw serviceUnavailable(
      'Image uploads are not configured. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET, or paste an image URL instead.',
    );
  }

  const timestamp = Math.floor(Date.now() / 1000);
  const fullFolder = `${env.CLOUDINARY_UPLOAD_FOLDER}/${folder}`;

  // Cloudinary's scheme: sort the params alphabetically, join as a query string,
  // append the secret, then SHA-1 the lot. Any deviation and the upload is rejected.
  const params: Record<string, string> = {
    folder: fullFolder,
    timestamp: String(timestamp),
  };

  const toSign = Object.keys(params)
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join('&');

  const signature = crypto
    .createHash('sha1')
    .update(toSign + env.CLOUDINARY_API_SECRET)
    .digest('hex');

  return {
    signature,
    timestamp,
    apiKey: env.CLOUDINARY_API_KEY as string,
    cloudName: env.CLOUDINARY_CLOUD_NAME as string,
    folder: fullFolder,
    uploadUrl: `https://api.cloudinary.com/v1_1/${env.CLOUDINARY_CLOUD_NAME}/image/upload`,
  };
}
