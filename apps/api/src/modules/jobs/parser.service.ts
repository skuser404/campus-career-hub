import type { ParsedJob } from '@cch/shared';

/**
 * WhatsApp-message → structured opportunity, by heuristics.
 *
 * These messages have no schema — they are free text a placement coordinator
 * typed on a phone. So this does not "parse" in any strict sense; it PANS FOR
 * the fields that have recognisable shapes (a URL, a date near the word
 * "deadline", a rupee figure) and leaves everything it is unsure about for the
 * admin to fill in. Guessing wrong is worse than leaving blank, because a wrong
 * value looks correct and gets published; so every extractor here is tuned to
 * stay silent rather than reach.
 *
 * No external service and no AI call — it runs in a millisecond and never leaks
 * the pasted text off the box.
 */

const URL_RE = /\bhttps?:\/\/[^\s<>()]+/i;

/**
 * Lines that are almost always noise in a forwarded WhatsApp message.
 *
 * Deliberately does NOT include a bare `*` run: WhatsApp bold is written with
 * *asterisks*, so the single most important line — the bolded role/company — very
 * often starts with one. Treating that as noise (an earlier bug) threw away
 * exactly the line worth keeping.
 */
const NOISE_RE =
  /^(forwarded|posted on|share|regards|thanks|thank you|all the best|good luck|apply (now|here|below)?|link|👇|🔗)\b/i;

const MODE_KEYWORDS: Array<{ re: RegExp; mode: ParsedJob['mode'] }> = [
  { re: /\b(remote|work from home|wfh)\b/i, mode: 'remote' },
  { re: /\bhybrid\b/i, mode: 'hybrid' },
  { re: /\b(on-?site|in office|in-office)\b/i, mode: 'onsite' },
];

const TAG_KEYWORDS = [
  'React', 'Node', 'Node.js', 'Python', 'Java', 'DSA', 'SQL', 'Machine Learning',
  'ML', 'AI', 'Cloud', 'AWS', 'DevOps', 'Full Stack', 'Frontend', 'Backend',
  'Android', 'Flutter', 'Data Science', 'Cybersecurity', 'Internship', 'Fresher',
];

/** Strip a leading label like "Role:", "Company -", "*Eligibility*:" and return the value. */
function valueAfterLabel(line: string, labels: string[]): string | null {
  const re = new RegExp(`^\\*{0,2}\\s*(?:${labels.join('|')})\\s*\\*{0,2}\\s*[:\\-–]\\s*(.+)$`, 'i');
  const m = re.exec(line.trim());
  return m ? (m[1] as string).trim().replace(/\*+/g, '') : null;
}

function findLabeled(lines: string[], labels: string[]): string | null {
  for (const line of lines) {
    const v = valueAfterLabel(line, labels);
    if (v) return v;
  }
  return null;
}

/**
 * Extract a deadline.
 *
 * Only trusts a date that sits near a deadline word ("last date", "apply by",
 * "deadline", "before"). A bare date elsewhere in the message is more likely the
 * date it was posted, and mistaking that for the deadline would quietly close an
 * opportunity early — so it is ignored.
 */
function extractDeadline(text: string): string | null {
  const monthNames =
    '(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*';

  const datePatterns = [
    // 25/12/2026, 25-12-2026, 25.12.26
    /\b(\d{1,2}[/.\-]\d{1,2}[/.\-]\d{2,4})\b/i,
    // 25 Dec 2026, 25th December
    new RegExp(`\\b(\\d{1,2}(?:st|nd|rd|th)?\\s+${monthNames}(?:\\s+\\d{2,4})?)\\b`, 'i'),
    // Dec 25, 2026
    new RegExp(`\\b(${monthNames}\\s+\\d{1,2}(?:st|nd|rd|th)?(?:,?\\s+\\d{2,4})?)\\b`, 'i'),
  ];

  const deadlineContext =
    /(deadline|last date|apply by|apply before|before|closes on|closing|due)/i;

  for (const rawLine of text.split(/\n/)) {
    if (!deadlineContext.test(rawLine)) continue;

    for (const p of datePatterns) {
      const m = p.exec(rawLine);
      if (m) {
        const parsed = safeParseDate(m[1] as string);
        if (parsed) return parsed.toISOString();
      }
    }
  }
  return null;
}

/** Parse a human date string without pulling in a date library; returns null if unsure. */
function safeParseDate(raw: string): Date | null {
  const cleaned = raw.replace(/(st|nd|rd|th)/gi, '').trim();

  // Numeric d/m/y — assume day-first (Indian convention), which is the whole
  // reason not to hand this to Date.parse, that guesses month-first.
  const dmy = /^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2,4})$/.exec(cleaned);
  if (dmy) {
    let [, d, m, y] = dmy.map(Number) as [number, number, number, number];
    if (y < 100) y += 2000;
    const date = new Date(Date.UTC(y, m - 1, d, 23, 59));
    return isValidFuture(date, d, m - 1) ? date : null;
  }

  const parsed = new Date(cleaned + (/\d{4}/.test(cleaned) ? '' : ` ${new Date().getFullYear()}`));
  if (!Number.isNaN(parsed.getTime())) {
    parsed.setUTCHours(23, 59);
    return parsed;
  }
  return null;
}

function isValidFuture(date: Date, day: number, month: number): boolean {
  // Reject impossible dates (e.g. 31/02) that Date silently rolls over.
  return date.getUTCDate() === day && date.getUTCMonth() === month;
}

function extractSalary(lines: string[]): string | null {
  const labeled = findLabeled(lines, ['salary', 'ctc', 'package', 'stipend', 'compensation']);
  if (labeled) return labeled.slice(0, 100);

  for (const line of lines) {
    // ₹ figures, "12 LPA", "40k stipend"
    if (/(₹|\brs\.?\b|\b\d+(\.\d+)?\s*(lpa|lakhs?|k\b|per month|\/month|month))/i.test(line)) {
      return line.trim().replace(/\*+/g, '').slice(0, 100);
    }
  }
  return null;
}

export function parseWhatsAppMessage(text: string): ParsedJob {
  const rawLines = text.split(/\r?\n/).map((l) => l.trim());
  const lines = rawLines.filter((l) => l.length > 0);
  const detected: string[] = [];

  // ── Link ──────────────────────────────────────────────────────────────
  const linkMatch = URL_RE.exec(text);
  const applicationLink = linkMatch ? linkMatch[0].replace(/[).,]+$/, '') : null;
  if (applicationLink) detected.push('applicationLink');

  // ── Labelled fields (the reliable ones) ─────────────────────────────────
  let companyName = findLabeled(lines, ['company', 'organisation', 'organization', 'firm']);
  let role = findLabeled(lines, ['role', 'position', 'profile', 'designation', 'job title', 'title']);
  const eligibility = findLabeled(lines, [
    'eligibility', 'eligible', 'who can apply', 'criteria', 'requirement', 'requirements', 'qualification',
  ]);
  const location = findLabeled(lines, ['location', 'venue', 'place', 'city']);

  // ── "<Role> at <Company>" in an early line ──────────────────────────────
  if (!role || !companyName) {
    for (const line of lines.slice(0, 4)) {
      const at = /^(.{3,60}?)\s+(?:at|@|by|with)\s+(.{2,50})$/i.exec(line.replace(/\*+/g, ''));
      if (at && !NOISE_RE.test(line)) {
        role = role ?? (at[1] as string).trim();
        companyName = companyName ?? (at[2] as string).trim();
        break;
      }
    }
  }

  // ── Role fallback: the first substantial, non-noise line ────────────────
  if (!role) {
    const candidate = lines.find(
      (l) => l.length >= 4 && l.length <= 80 && !NOISE_RE.test(l) && !URL_RE.test(l),
    );
    if (candidate) role = candidate.replace(/\*+/g, '').trim();
  }

  if (companyName) detected.push('companyName');
  if (role) detected.push('role');
  if (eligibility) detected.push('eligibility');
  if (location) detected.push('location');

  // ── Deadline ────────────────────────────────────────────────────────────
  const deadline = extractDeadline(text);
  if (deadline) detected.push('deadline');

  // ── Salary ──────────────────────────────────────────────────────────────
  const salaryText = extractSalary(lines);
  if (salaryText) detected.push('salaryText');

  // ── Mode ────────────────────────────────────────────────────────────────
  let mode: ParsedJob['mode'] = null;
  for (const { re, mode: m } of MODE_KEYWORDS) {
    if (re.test(text)) {
      mode = m;
      detected.push('mode');
      break;
    }
  }

  // ── Tags ────────────────────────────────────────────────────────────────
  const tags = TAG_KEYWORDS.filter((t) =>
    new RegExp(`\\b${t.replace(/[.]/g, '\\.')}\\b`, 'i').test(text),
  ).slice(0, 8);
  if (tags.length) detected.push('tags');

  // ── Description: the whole message, minus the bare link line ────────────
  const description = lines
    .filter((l) => !(applicationLink && l === applicationLink))
    .join('\n')
    .trim();

  return {
    companyName: companyName ? companyName.slice(0, 100) : null,
    role: role ? role.slice(0, 200) : null,
    description: description || text.trim(),
    eligibility: eligibility ? eligibility.slice(0, 500) : null,
    salaryText,
    location: location ? location.slice(0, 100) : null,
    mode,
    deadline,
    applicationLink,
    tags,
    detected,
  };
}
