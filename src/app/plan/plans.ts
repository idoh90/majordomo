/**
 * THE PLAN — the numbers, and the seam.
 *
 * Everything with a dollar sign on the upgrade page comes from here, so a
 * price change is one edit and never a search through copy. The figures are
 * the playbook's own (§7: ~$6.99 a month or $59 a year) and remain PROPOSALS
 * until a till exists — PRODUCT.md says so in as many words.
 */

export type PlanId = 'basic' | 'pro'
export type Cycle = 'monthly' | 'yearly'

/** what Pro costs, in US dollars, per billing cycle */
export const PRO_PRICE: Record<Cycle, number> = { monthly: 6.99, yearly: 59 }

/** what a year comes to a month */
export const YEARLY_PER_MONTH = PRO_PRICE.yearly / 12

/** the yearly discount against twelve months, as a whole percent — computed,
 *  so the toggle's chip cannot drift from the figures beside it */
export const YEARLY_SAVING_PCT = Math.round((1 - PRO_PRICE.yearly / (PRO_PRICE.monthly * 12)) * 100)

/** "$6.99" / "$59" / "$4.92" — en-US so the sign is a prefix (the Ledger's
 *  reasoning for ₪); whole dollars drop their cents */
export function usd(n: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: Number.isInteger(n) ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(n)
}

/**
 * Which arrangement this estate is on.
 *
 * Nothing is sold yet, so every estate is on Basic — and nothing is GATED on
 * it either: every wing, every preset and the calendar bridge stay open to
 * everyone, exactly as they are today. This constant exists so the page can
 * say which card is current, and so the day entitlements arrive (an account
 * field read through the registry) they replace one line rather than a page.
 */
export const CURRENT_PLAN: PlanId = 'basic'

export type CheckoutResult =
  /** there is no till: the page states the fact and nothing is charged */
  { kind: 'notOpen' }

/**
 * The till — where pressing the Pro card's button leads.
 *
 * Stripe lands HERE and nowhere else (playbook §7: web-first, Checkout, the
 * platform tax deferred until the stores are worth it). Until then it answers
 * plainly that payment is not open, and the page prints that under the
 * button rather than pretending a purchase happened. The cycle is accepted
 * now so the call site is already the one the real till will need.
 */
export function checkout(_cycle: Cycle): CheckoutResult {
  return { kind: 'notOpen' }
}
