/* ---------------------------------------------------------------------------
   voice.ts — every user-facing string on this page.

   Same standing rule as the app: no inline copy, anywhere. The register is the
   fusion doctrine (landing spec §2):

     - the MESSAGE is discipline and mission — hostile schedules, going far,
       respect for people who show up at 03:00. It owns the headlines.
     - the REGISTER is the Majordomo's — dry, composed, understated. It owns
       the microcopy: form feedback, the demo's briefing chip, the sign-off.

   Three rules that are not style preferences:
     1. "sir" appears ONLY in the Majordomo's own utterances. The page addresses
        a stranger; the butler addresses his principal. The success state is the
        first "sir" most visitors earn — that is the point of it.
     2. Zero exclamation marks. Zero emoji. Nothing begs, nothing guilts,
        nothing counts down.
     3. Numbers are specific or absent. "19:00–08:00", "150 places" — never
        "10x your productivity".

   Structured for a later voice pack (Hebrew) to drop in whole; nothing here
   assumes English word order beyond the strings themselves.
--------------------------------------------------------------------------- */

export const voice = {
  meta: {
    title: 'Majordomo — the calendar that survives your schedule',
    description:
      'A calendar-first life OS for rotating shifts, serious training, and study — run by a dry, deadpan butler. The beta is open.',
  },

  masthead: {
    wordmark: 'MAJORDOMO',
    status: 'BETA · NOW OPEN',
  },

  a11y: {
    /* the first thing a keyboard or screen-reader visitor meets — it goes past
       the demo straight to the one thing the page asks for */
    skipToCta: 'SKIP TO THE DOOR',
  },

  hero: {
    /* The headline is the wordmark moment: the sentence sets in ink, MAJORDOMO
       alone in brass. It teaches the name, the role and the promise in one
       breath. Because it no longer names the category, the subheadline's first
       words must — it opens with "The calendar". */
    headlineLead: 'Every mission needs a',
    headlineWord: 'MAJORDOMO',
    sub: 'The calendar for schedules that fight back — nights, doubles, rotations, exams. Made for the disciplined.',
  },

  cta: {
    /* The waitlist form this replaced asked for an address and promised a
       briefing. The doors are open now: the only thing between a visitor and
       the estate is the app chunk downloading. */
    button: 'GET STARTED',
    fineprint: 'Free during the beta. Your estate lives on your device — set up in under a minute.',
    /* The butler's first appearance, kept from the form he used to run. */
    busy: 'One moment.',
    error: 'The line is down. Try once more, sir.',
    /* The same door, opened from the inside. A resident who followed the app's
       link back to this page is not being sold anything and has nothing to set
       up, so the button says where it goes and the line under it says what it
       will not touch. Swapped in after hydration (see GetStarted.tsx) — the
       prerendered markup cannot know who is reading it. */
    residentButton: 'BACK TO THE ESTATE',
    residentFineprint: 'Your records are where you left them. Nothing here has moved.',
  },

  demo: {
    /* the one sentence that carries the demo's meaning for screen readers —
       the animation itself is decoration */
    caption:
      'A 13-hour night watch lands as one shift. Sleep pencils itself in. Training moves to where recovery says it should. That’s the whole idea.',
    /* The butler walks the week, a day at a time, and says what that day
       actually asks of you. Rules these seven obey:

       - he briefs COMMITMENTS, never housekeeping. Coffee, lunch, the commute
         and the sleep the estate pencilled in are on the calendar because a
         day is continuous, not because they are worth announcing. A butler who
         tells you about your own coffee is not composed, he is filling silence.
       - specific hours, never adjectives. "Muay Thai at 18:00", never "a busy
         evening".
       - "sir" is rationed. Twice in seven days — on today, and on the last
         one — because a word said every time is a tic, not deference.
       - Wednesday carries the locked sentence verbatim: "Watch at 19:00.
         Briefing at 16:30, sir." */
    brief: [
      'Monday: a push session at 07:00, Muay Thai at 18:00, and the books until 22:00.',
      'Tuesday starts hard — intervals at 06:30, Spanish at 10:00, the invoices, then two hours of study.',
      'Pull at 09:00 and the client at 11:30. Watch at 19:00. Briefing at 16:30, sir.',
      'You come off the watch at 08:00. Strength at 15:00, the books from 18:00.',
      'Friday is the examination, 09:00 to 12:00. The client at 14:30, Muay Thai at 18:00.',
      'A day watch, 07:00 to 19:00. Twelve hours, and nothing else asked of you.',
      'Eighteen kilometres in the morning, three hours of study after lunch. Then it begins again, sir.',
    ],
    appLabel: 'MAJORDOMO',
    week: 'WEEK 29 · JUL 2026',
    viewWeek: 'WEEK',
    viewMonth: 'MONTH',
  },

  /* The clock on the phone, the now-line on the demo grid and the briefing
     chip all name the same moment — two and a half hours before a 19:00 watch.
     One constant, so they cannot drift apart. */
  moment: {
    time: '16:30',
    date: 'WED 15 JULY',
  },

  wings: {
    title: 'THE WINGS',
    kicker: 'One estate. Choose what it runs.',
    items: [
      {
        id: 'watch',
        name: 'THE WATCH',
        line: 'Shifts in the shapes yours actually take: doubles, nights that end tomorrow, sleep pencilled in after.',
      },
      {
        id: 'grounds',
        name: 'THE GROUNDS',
        line: 'Training that knows what the schedule did to you: strain, recovery, and when it’s wise to push.',
      },
      {
        id: 'study',
        name: 'THE STUDY',
        line: 'Exam dates hold the line; study blocks find the cracks in the week.',
      },
    ],
  },

  whatif: {
    title: 'ASK “WHAT IF” BEFORE YOU COMMIT',
    body: 'Drag the week into a different shape. Read the difference — hours gained, sleep lost, training kept. Apply it, or discard it as if nothing happened. No calendar on your phone can do this.',
    /* the ghost-drag visual's own labels — product surface, not page chrome */
    sandbox: 'WHAT-IF',
    diffTitle: 'THE DIFFERENCE',
    diff: [
      { label: 'Hours free', value: '+2 h 30 m', tone: 'up' as const },
      { label: 'Sleep', value: '−40 m', tone: 'down' as const },
      { label: 'Training', value: 'kept', tone: 'flat' as const },
    ],
    apply: 'APPLY',
    discard: 'DISCARD',
    ghostLabel: 'STRENGTH',
    days: 'WED 15 · THU 16',
    watchLabel: 'WATCH',
    watchTail: '→ 08:00',
  },

  briefing: {
    title: 'A BRIEFING BEFORE EVERY SHIFT',
    body: 'Most apps notify you at 07:00. If your watch starts at 19:00, that’s the middle of your night. Majordomo reads the schedule and times the briefing to it — the smallest feature on this page, and the one that proves the point.',
    notification: {
      app: 'Majordomo',
      /* the timestamp comes from `moment` below — one clock for the whole page */
      body: 'On tonight, 19:00–08:00. Legs are recovered; the gym fits at 15:00. I’d leave Thursday alone, sir.',
    },
  },

  founder: {
    body: 'Every calendar I tried assumed my week looked like everyone else’s. It doesn’t — training, study and rest have to fit around hours I don’t choose. So I’m building the one that runs my week instead. If your schedule fights back, this is for you.',
    signature: '— Ido, building Majordomo in public',
    /* EMPTY UNTIL THE HANDLES EXIST, and the signature line reads perfectly
       well without them — "— Ido, building Majordomo in public" is a complete
       sentence.

       They used to point at x.com and tiktok.com themselves. Two things wrong
       with that: it sends the one reader curious enough to click to a front
       door rather than to the building-in-public they came for, and the links
       carry rel="me", which is a machine-readable claim that those accounts are
       his. scripts/audit.mjs fails the build if either bare URL ever comes
       back, so this cannot be un-fixed by accident.

       Fill in with the real profiles: { label: 'X', href: 'https://x.com/…' } */
    links: [] as { label: string; href: string }[],
  },

  /* -------------------------------------------------------------- the terms
     The price list, standing on a page that cannot take money yet. Every rule
     this section obeys is a consequence of that:

     - the HEADING is future tense, because the honesty has to land before the
       numbers do. "What it will cost", never "Pricing".
     - NOTHING here is a button. The page has one CTA and it is the door; a
       second one that led to a checkout would be a lie, and one that led
       nowhere would be worse.
     - a feature the app does not have yet is MARKED, every time, with
       `pending`. The paid column leans on the Bell, and the Bell does not
       answer yet — a price list that quietly implies otherwise is the one
       dishonesty this brand cannot afford, and the beta testers who read this
       page arrive in the real app weeks later and remember.
     - the two allowances (10 a month, 400 a month) tell the whole story
       without an adjective between them. Numbers are specific or absent.
     - the founders' seat states its cap as a fact and never counts down.
       Scarcity that is true is permitted; urgency theatre is not.
  ------------------------------------------------------------------------- */
  pricing: {
    title: 'WHAT IT WILL COST',
    kicker: 'Nothing is for sale yet. When it is, these are the terms.',
    /* the marker on anything not yet built — dry, and never dressed up as a
       feature that is nearly here */
    pending: 'NOT YET',
    pendingLabel: 'not yet in service',
    tiers: [
      {
        id: 'manor',
        name: 'THE MANOR',
        line: 'Your whole estate, on your own device.',
        price: 'Free',
        period: 'and it stays free',
        items: [
          { text: 'Every wing — the Watch, the Grounds, the Study, the Workshop, the Ledger', pending: false },
          { text: 'The whole calendar: drag, seams, watches that end tomorrow', pending: false },
          { text: 'Works offline, signed out, with your records on your device', pending: false },
          { text: 'Export the estate whenever you like', pending: false },
          /* the free half of the sync line — its opposite number in Full Staff
             is "every device you own", and the two only read as a pair if this
             one names the limit out loud */
          { text: 'Sign in and keep one device backed up', pending: false },
          { text: 'The Bell, ten questions a month', pending: true },
        ],
      },
      {
        id: 'staff',
        name: 'FULL STAFF',
        line: 'The household, working while you are on shift.',
        price: '$59',
        period: 'a year · or $6.99 a month',
        items: [
          { text: 'The Bell, four hundred questions a month', pending: true },
          { text: 'Your estate on every device you own', pending: false },
          { text: 'Crews — a shared board for the people you work with', pending: false },
          { text: 'The what-if engine', pending: false },
          { text: 'Every preset', pending: false },
          { text: 'A briefing timed to your shift, and the weekly report card', pending: true },
        ],
      },
    ],
    founders: {
      name: 'FOUNDERS’ SEATS',
      terms: '$129, once',
      line: 'The first five hundred households keep the full staff for good. Five hundred is the whole of it — when they are taken, the offer closes.',
    },
    /* The promise that matters more than either number: the free tier does not
       get hollowed out later to make the paid one look better. */
    note: 'The beta costs nothing, and none of this can be bought today. When it can, the free estate stays exactly as complete as it is now.',
  },

  faq: {
    title: 'ANTICIPATED QUESTIONS',
    items: [
      {
        q: 'When is the beta?',
        a: 'It is open now. Press the button and the estate is yours — free for as long as the beta runs.',
      },
      {
        q: 'What will it cost?',
        a: 'Nothing while the beta runs. After that the free estate stays as complete as it is today, and the full household is $59 a year. The whole arrangement is set out on this page, in advance.',
      },
      {
        q: 'What platforms?',
        a: 'Any modern browser, installable on your phone like a native app. App stores follow when demand justifies them.',
      },
      {
        q: 'What about my data?',
        a: 'Yours. Local-first, exportable any time, no ads, nothing sold. An estate does not gossip.',
      },
      {
        q: 'Why “Majordomo”?',
        a: 'The chief steward of a great house — the one who runs the estate so its owner can attend to the mission. That is the entire product, in one word.',
      },
    ],
  },

  footer: {
    signoff: 'The estate is open. Come through, sir.',
    legal: '© 2026 Majordomo',
    privacy: 'Privacy',
    contact: 'Contact',
    /* The address itself is not copy — it is configuration, and it has to
       agree with the one in the noscript banner and on /privacy. It is
       resolved once in site.config.ts and inlined here at build time. */
    contactHref: `mailto:${__CONTACT_EMAIL__}`,
  },

  privacy: {
    title: 'Privacy',
    back: 'Back to the estate',
    /* injected into privacy.html at build time by scripts/prerender.mjs, so
       the document's <title> comes from here like everything else */
    metaTitle: 'Privacy — Majordomo',
    metaDescription: 'What this page collects, and what it does not.',
    body: [
      'This page collects nothing about you. No signup form, no analytics cookies, no advertising pixels, no third-party trackers.',
      'The app keeps your estate on your own device, local-first. Signing in syncs it between your devices; nothing is sold, rented, shared, or used to build a profile of you.',
      `Write to ${__CONTACT_EMAIL__} and whatever the sync holds is deleted, without argument and without a retention offer.`,
      'Visitor counts (pages viewed, referring site) are measured in aggregate by Vercel Web Analytics, which sets no cookies and stores no personal data.',
      'An estate does not gossip.',
    ],
  },
} as const
