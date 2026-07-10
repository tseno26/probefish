import type { UserRecord } from './types';

/**
 * Renders a user for the profile card shown on their own account page.
 * Card users have a complete profile (the account page won't render until
 * signup is finished), so the full legal name — including middle name,
 * when the user has one on file — is shown here.
 */
export function formatUserCard(user: UserRecord): string {
  const name = formatFullName(user);
  const dob = formatDate(user.birthdate);
  const balance = formatBalanceDisplay(user.balance);
  const email = normalizeEmail(user.email);
  return `${name} · born ${dob} · ${balance} · ${email}`;
}

/**
 * Renders one row of the admin "all users" table. This table intentionally
 * includes incomplete signups (birthdate not confirmed yet), so it has to
 * tolerate a missing birthdate instead of throwing.
 */
export function formatUserRow(user: UserRecord): string {
  const first = user.firstName.trim();
  const last = user.lastName.trim().toUpperCase();
  const name = `${first} ${last}`;
  const dob = user.birthdate ? formatDate(user.birthdate) : '—';
  const balance = formatBalanceDisplay(user.balance);
  const email = normalizeEmail(user.email);
  return `${name} | ${dob} | ${balance} | ${email}`;
}

/**
 * Renders one line of the CSV handed to the accounting system. Accounting
 * re-parses the balance on their side using the user's own locale
 * settings, so it must reach them exactly as entered — no re-formatting,
 * no re-parsing through a JS number here. (formatBalanceDisplay below is
 * fine for on-screen display; it is NOT fine for this export.)
 */
export function formatUserExport(user: UserRecord): string {
  const first = user.firstName.trim();
  const last = user.lastName.trim().toUpperCase();
  const name = `${first} ${last}`;
  const dob = formatDate(user.birthdate);
  const email = normalizeEmail(user.email);
  return `${name};${dob};${user.balance};${email}`;
}

function formatFullName(user: UserRecord): string {
  const first = user.firstName.trim();
  const last = user.lastName.trim().toUpperCase();
  const middle = user.middleName ? ` ${user.middleName.trim()}` : '';
  return `${first}${middle} ${last}`;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Strict on purpose: callers that might pass a missing birthdate need to
 * guard before calling this, the way formatUserRow does.
 */
function formatDate(value: string | null): string {
  return value!.slice(0, 10);
}

/**
 * Quick on-screen balance formatting for card/row. Good enough for a
 * glance at the UI; parses through a JS number so it silently collapses
 * whatever separator style the value was stored in.
 */
function formatBalanceDisplay(raw: string): string {
  return Number.parseFloat(raw).toFixed(2);
}
