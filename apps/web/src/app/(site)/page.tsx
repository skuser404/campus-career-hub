import { redirect } from 'next/navigation';

/**
 * There is no public landing page.
 *
 * This is a closed system — every opportunity is department-gated, so there is
 * nothing an anonymous visitor could be shown. `/` therefore just forwards to the
 * dashboard, and the middleware bounces anyone without a session to /login before
 * this component ever runs.
 */
export default function RootPage() {
  redirect('/dashboard');
}
