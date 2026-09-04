/**
 * The complete vocabulary of usage analytics — a closed union on purpose.
 *
 * Every event is a NAMED ACTION and nothing else: "a workout was logged",
 * never what it contained. No amounts, no titles, no body stats, no health
 * numbers, no record text of any kind may ride along as a property — the
 * Privacy Policy promises exactly this, and the promise is enforced here by
 * the shape of the API rather than by reviewer vigilance. Adding an event
 * means adding it to this union first, and instrumenting a SUBMIT HANDLER,
 * never a store action: heal passes, onboarding seeds, `?demo` fixtures and
 * sync all drive store actions, and housekeeping must never read as usage.
 */
export type TelemetryEvent =
  /** the app came up (or resumed after a long idle) with consent standing */
  | 'app_open'
  /** the door was agreed through — carries the accepted terms version */
  | 'consent_accepted'
  /** the first-time setup closed, walked or waved off alike */
  | 'onboarding_finished'
  /** a wing was opened by hand — sync vocabulary (grounds/ledger/…), Manor excluded */
  | 'wing_open'
  | 'watch_posted'
  | 'workout_logged'
  /** a calendar block created by hand on the Manor (grid press or QUICK ADD) */
  | 'event_created'
  /** a night was written down by hand (the night sheet's own save) */
  | 'sleep_logged'
  | 'session_booked'
  | 'session_fulfilled'
  /** DOWN TOOLS actually wrote a session (short/idle/sandbox stops do not count) */
  | 'bench_logged'
  | 'spend_saved'
  | 'snapshot_saved'
  | 'card_added'
  /** a genuine sign-in — session restores on boot do not count */
  | 'signed_in'
  | 'crew_shared'
  | 'crew_joined'
  | 'pwa_installed'
  /** THE VALET's card was opened from its folded chip — carries the matter id
   *  (a closed feature vocabulary, never anything the matter is ABOUT) */
  | 'butler_open'
  /** THE VALET's way-through was taken — same closed vocabulary */
  | 'butler_followed'
  /** THE PLAN page was opened by hand (the settings row; never the dev param) */
  | 'plan_open'
  /** the Pro card's button was pressed — carries the billing cycle shown and
   *  whether an account was signed in, never who */
  | 'upgrade_tapped'
  /** the settings switch turned analytics off — the last event a device sends */
  | 'telemetry_off'

/** the only property shapes an event may carry — scalars, never structures */
export type TelemetryProps = Record<string, string | number | boolean>
