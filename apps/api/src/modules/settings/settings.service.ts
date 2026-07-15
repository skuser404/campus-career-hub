import {
  DEFAULT_SITE_SETTINGS,
  siteSettingsSchema,
  type SiteSettings,
  type UpdateSiteSettingsInput,
} from '@cch/shared';
import { eq } from 'drizzle-orm';
import { db } from '../../db/client';
import { siteSettings } from '../../db/schema';
import { logger } from '../../lib/logger';

const SETTINGS_KEY = 'site';

/**
 * Site settings, stored as one JSONB row.
 *
 * `get` never throws and never returns a partial object. A fresh database has no
 * settings row at all, and a row written by an older version of the app may be
 * missing keys the current version expects — in both cases the Zod schema's
 * defaults fill the gaps, so the site always renders.
 */
export async function get(): Promise<SiteSettings> {
  const [row] = await db
    .select()
    .from(siteSettings)
    .where(eq(siteSettings.key, SETTINGS_KEY))
    .limit(1);

  if (!row) return DEFAULT_SITE_SETTINGS;

  const parsed = siteSettingsSchema.safeParse(row.value);

  if (!parsed.success) {
    // Corrupt or outdated settings must not take the whole site down. Log it,
    // serve the defaults, and let an admin fix it in the panel.
    logger.error(
      { issues: parsed.error.issues },
      'Stored site settings failed validation — falling back to defaults',
    );
    return DEFAULT_SITE_SETTINGS;
  }

  return parsed.data;
}

/**
 * Merge a partial update over the current settings and upsert.
 *
 * A merge rather than a replace: the settings page submits only the section the
 * admin edited, and a blind overwrite would silently reset every other field to
 * its default.
 */
export async function update(
  input: UpdateSiteSettingsInput,
  updatedBy: string,
): Promise<SiteSettings> {
  const current = await get();
  const merged = siteSettingsSchema.parse({ ...current, ...input });

  await db
    .insert(siteSettings)
    .values({ key: SETTINGS_KEY, value: merged, updatedBy, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: siteSettings.key,
      set: { value: merged, updatedBy, updatedAt: new Date() },
    });

  return merged;
}
