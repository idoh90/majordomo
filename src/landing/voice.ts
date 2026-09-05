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

/* The day the current privacy policy took effect. Printed in its "Last
   updated" line, in its own change note, and on the archive it replaced — one
   constant, so the three cannot disagree. Set it to the day the change ships:
   a policy dated before it was published is a policy that misstates when its
   own terms began. */
const PRIVACY_EFFECTIVE = '5 September 2026'

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

  faq: {
    title: 'ANTICIPATED QUESTIONS',
    items: [
      {
        q: 'When is the beta?',
        a: 'It is open now. Press the button and the estate is yours — free for as long as the beta runs.',
      },
      {
        q: 'What will it cost?',
        a: 'The beta costs nothing. At launch: a free tier that stays genuinely useful, and a paid tier priced like a serious tool, not a subscription trap.',
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
    terms: 'Terms',
    contact: 'Contact',
    /* The address itself is not copy — it is configuration, and it has to
       agree with the one in the noscript banner and on /privacy. It is
       resolved once in site.config.ts and inlined here at build time. */
    contactHref: `mailto:${__CONTACT_EMAIL__}`,
  },

  /* -------------------------------------------------------------------------
     The wrong address.

     Served by Vercel at every path the deployment does not have, with a real
     404 status. Two things it must do and one it must not:

     - SAY WHAT HAPPENED, once, without apologising twice. The register is the
       Majordomo's, so it states the fact and offers the way back.
     - REASSURE A RESIDENT. Someone whose estate lives in this browser has just
       been shown an unfamiliar page by their own app's domain; the second line
       is there to say their records are not what went missing. It is true —
       the estate is in localStorage and no URL reaches it.
     - It must NOT say "sir". A stranger who mistyped a URL has not met the
       butler yet, and the landing spends that word deliberately (see rule 1
       at the top of this file).
  ------------------------------------------------------------------------- */
  notFound: {
    /* the numeral is the one piece of jargon the page keeps: it is what the
       visitor's browser and every search result will have already called this */
    code: '404',
    title: 'Nothing at this address',
    metaTitle: 'Nothing at this address — Majordomo',
    metaDescription: 'That page is not part of the estate.',
    body: [
      'The house keeps no record of this page. It may have been moved, or it may never have been here at all.',
      'Nothing of yours is missing: your records live on your own device, not at an address.',
    ],
    back: 'Back to the estate',
  },

  /* -------------------------------------------------------------------------
     The legal pages. Everything below is user-facing copy AND the operative
     text of the agreement: the consent door's AGREE & ENTER points here.
     Honesty invariants that must survive any edit:
     - the ONLY advertising tool anywhere on the site is the Meta Pixel, and
       the policy names it in full: what it reports (three named actions,
       never a record), that it loads only after the door and never before,
       that Global Privacy Control suppresses it outright, that the settings
       switch withdraws it, and that Meta is a transfer to the United States.
       The disclosure was published BEFORE the pixel was installed, on
       purpose: a policy has to be true before the thing it describes
       exists, not at the same moment. Never let the reverse happen — the
       pixel must not predate, or outlive, this section;
     - beyond that, the public pages carry Vercel's aggregate counts and
       nothing else: no signup form, no cookies of their own;
     - the app's usage analytics are NAMED ACTIONS ONLY, never record
       contents — the same promise core/telemetry/events.ts enforces in code;
     - deletion is a mailbox, because no in-app deletion exists. Do not
       promise a button this app does not have.
     A material change to either document must be paired with a TERMS_VERSION
     bump in core/store/shell.ts so every device re-reads its door — and the
     version being replaced is kept, word for word, under `privacyArchive`
     below at a dated address (/privacy/<its last-updated date>), linked from
     the new policy's closing section. The archive is the record of what
     people actually agreed to; it is never edited.
  ------------------------------------------------------------------------- */

  privacy: {
    title: 'Privacy',
    back: 'Back to the estate',
    /* injected into privacy.html at build time by scripts/prerender.mjs, so
       the document's <title> comes from here like everything else */
    metaTitle: 'Privacy — Majordomo',
    metaDescription: 'What Majordomo keeps, what it counts, what it tells Meta, and what it never does.',
    updated: `Last updated: ${PRIVACY_EFFECTIVE}`,
    sections: [
      {
        h: 'The short version',
        p: [
          'Your records live on your own device. Signing in syncs them to your own account. The app counts which features get used — never what your records say. Once you have agreed at the door, the Meta Pixel measures whether an advertisement brought you here — three named actions, never a record. Nothing is sold or rented, and nothing about your records ever reaches Meta.',
          'An estate does not gossip.',
        ],
      },
      {
        h: 'Who is responsible, and how to reach them',
        p: [
          `Majordomo, at majordomocal.com, is operated by the operator of majordomocal.com — an individual based in Israel — who is the controller of every piece of data this page describes. Write to ${__CONTACT_EMAIL__} for anything on this page: to ask what is held about you, to get a copy of it, to have it deleted, or to withdraw a consent you gave.`,
        ],
      },
      {
        h: 'These pages',
        p: [
          'The public pages at majordomocal.com — the landing page and these documents — have no signup form and set no cookies of their own. Visits are counted in aggregate by Vercel Web Analytics, which sets no cookies and stores no personal data.',
          'The one third party that can learn of a visit is Meta, through the Meta Pixel described below — and only after you have accepted at the app’s door. Nothing from Meta loads before that, on the landing page included, so a visit that never reaches the door is never reported to Meta.',
        ],
      },
      {
        h: 'Your records',
        p: [
          'What you enter in the app — shifts, workouts, study, projects, money — is stored locally in your browser, on your own device. If you never sign in, none of it ever reaches us. The one-file export in Settings is yours to keep wherever you choose, and it deliberately leaves out any API key you saved in the app.',
        ],
      },
      {
        h: 'Your account and sync',
        p: [
          'Signing in with Google is optional; it exists so your devices can share one estate. If you sign in, we hold your email address and Google account identifier, and your synced records, stored with our database provider (Supabase). Sync carries your records and a few display preferences; it does not carry your API keys, and it does not carry this device’s consent or analytics settings.',
        ],
      },
      {
        h: 'Usage analytics in the app',
        p: [
          'After you agree at the door, the app sends anonymous usage counts to PostHog, hosted in the European Union: named events such as “a workout was logged” or “the Ledger was opened”, with a random device identifier, a session identifier, and the time. Never the contents — no amounts, no titles, no notes, no body stats, no health numbers, no record text of any kind.',
          'The identifier and any unsent counts live in your browser’s storage and are created only after you agree. If you sign in, the random identifier is linked to your account identifier so your own devices count as one person; your email address is not sent. You can switch analytics off at any time in Settings, under THE FINE PRINT — the “Share usage counts” switch, which also stops the Meta Pixel — and the app honors your browser’s Global Privacy Control signal automatically.',
          'These counts exist to show which parts of the app are used and kept. They are not shared, sold, or joined to anything else.',
        ],
      },
      {
        h: 'Advertising measurement: the Meta Pixel',
        p: [
          'Majordomo advertises on Instagram and Facebook. To learn whether those advertisements work, the site uses the Meta Pixel, a measurement tool operated by Meta Platforms, Inc. (Meta Platforms Ireland Limited for people in the European Economic Area, the United Kingdom and Switzerland). Its purpose is advertising measurement and attribution — telling Meta that a person who was shown an advertisement went on to arrive here, press GET STARTED, or finish the first-time setup — and nothing else.',
          'It loads only after you press AGREE & ENTER at the app’s door, and never before. Until you have accepted, no Meta script runs and no Meta cookie is set — on the landing page as much as in the app.',
          'Once it is running, the pixel reports three named actions — arriving on the landing page, pressing GET STARTED, and finishing the first-time setup — together with what any web request carries: your IP address, your browser and device details, the page address and the site you came from. It stores a random identifier in a cookie on this site so that it can recognise the same browser again. If you use Facebook or Instagram, Meta can connect those reports to your account there and combine them with what it already knows about you. We never send Meta your name, email address, phone number, or account identifier, and Meta’s “automatic advanced matching” is switched off.',
          [
            'Those reports go to Meta’s servers in the United States. That is a transfer of your data out of Israel and out of the European Economic Area, and by accepting at the door you consent to it. What Meta does with the data from there, and for how long, is governed by ',
            { text: 'Meta’s own privacy policy', href: 'https://www.facebook.com/privacy/policy/' },
            '.',
          ],
          'Your browser’s Global Privacy Control signal is honoured and suppresses the pixel outright: with the signal raised, it does not load at all, whatever you accepted at the door.',
          'Refusing changes nothing in the app except this measurement. No feature is withheld, nothing else changes, and you are not asked again. You can withdraw at any time in Settings, under THE FINE PRINT: turning off “Share usage counts” stops the Meta Pixel and the usage counts together, from that moment on. What Meta was sent before that stays with Meta, under its policy.',
        ],
      },
      {
        h: 'Who processes what',
        p: [
          'Supabase holds accounts and synced records. PostHog (EU) holds the usage counts. Meta Platforms (United States) receives the advertising measurements described above. Vercel hosts the app and takes the aggregate page counts. Google provides sign-in.',
          'Market prices and exchange rates (Twelve Data, Frankfurter) are fetched directly from your device — for Twelve Data, with your own API key — so those requests travel from you to them under their policies, and we never see them.',
        ],
      },
      {
        h: 'Retention and deletion',
        p: [
          `Local records stay until you delete them, or your browser does. Synced records stay until you ask: write to ${__CONTACT_EMAIL__} from the address you signed in with, and whatever the sync holds is deleted — without argument and without a retention offer. Usage counts are pseudonymous and kept only while they are useful for understanding how the app is used.`,
          'What the Meta Pixel reported is held by Meta, not by us, under Meta’s own retention rules. Meta’s privacy policy explains how to review and clear it — “your activity off Meta technologies”, in your Facebook or Instagram settings.',
        ],
      },
      {
        h: 'What is never done',
        p: [
          'No selling or renting of data. No advertisements inside the app. No advertising tool anywhere on the site beyond the single Meta Pixel described above, and none of it ever sees your records. No profiling of you by us, for anyone’s benefit. The app asks for no device permission it does not need.',
        ],
      },
      {
        h: 'Age',
        p: [
          `Majordomo is not for children under 16, and we do not knowingly hold their data. If you believe someone under 16 is using it, write to ${__CONTACT_EMAIL__}.`,
        ],
      },
      {
        h: 'Changes, and who to talk to',
        p: [
          'If this policy changes materially, the app shows its door again and asks you to re-accept before continuing; this page always carries the current version, with its date below.',
          [
            `This version, of ${PRIVACY_EFFECTIVE}, added the Meta Pixel section. The version it replaced, of 31 August 2026, described the site before advertising measurement was added, and stays readable, word for word, at `,
            { text: 'majordomocal.com/privacy/2026-08-31', href: '/privacy/2026-08-31' },
            '.',
          ],
          `Questions, requests, and anything this page did not answer: ${__CONTACT_EMAIL__}.`,
        ],
      },
    ],
  },

  /* -------------------------------------------------------------------------
     Superseded privacy policies, word for word, keyed by the date each was
     last updated — which is also its address: /privacy/2026-08-31. A policy
     that changes materially moves itself here first, then rewrites /privacy,
     then bumps TERMS_VERSION. Nothing in here is ever edited; it is what the
     people who pressed AGREE & ENTER under it actually agreed to. The only
     thing added is the notice, which says so.
  ------------------------------------------------------------------------- */
  privacyArchive: {
    '2026-08-31': {
      title: 'Privacy — 31 August 2026',
      back: 'Back to the estate',
      metaTitle: 'Privacy, 31 August 2026 — Majordomo',
      metaDescription: `The privacy policy that applied until ${PRIVACY_EFFECTIVE}, kept for the record.`,
      notice: [
        `This is the Privacy Policy of 31 August 2026. It was superseded on ${PRIVACY_EFFECTIVE} and is kept here, unchanged, for the record. The current policy is at `,
        { text: 'majordomocal.com/privacy', href: '/privacy' },
        '.',
      ],
      updated: 'Last updated: 31 August 2026',
      sections: [
        {
          h: 'The short version',
          p: [
            'Your records live on your own device. Signing in syncs them to your own account. The app counts which features get used — never what your records say. Nothing is sold, rented, or used to build an advertising profile of you.',
            'An estate does not gossip.',
          ],
        },
        {
          h: 'These pages',
          p: [
            'The public pages at majordomocal.com — the landing page and these documents — collect nothing about you. No signup form, no analytics cookies, no advertising pixels, no third-party trackers. Visits are counted in aggregate by Vercel Web Analytics, which sets no cookies and stores no personal data.',
          ],
        },
        {
          h: 'Your records',
          p: [
            'What you enter in the app — shifts, workouts, study, projects, money — is stored locally in your browser, on your own device. If you never sign in, none of it ever reaches us. The one-file export in Settings is yours to keep wherever you choose, and it deliberately leaves out any API key you saved in the app.',
          ],
        },
        {
          h: 'Your account and sync',
          p: [
            'Signing in with Google is optional; it exists so your devices can share one estate. If you sign in, we hold your email address and Google account identifier, and your synced records, stored with our database provider (Supabase). Sync carries your records and a few display preferences; it does not carry your API keys, and it does not carry this device’s consent or analytics settings.',
          ],
        },
        {
          h: 'Usage analytics in the app',
          p: [
            'After you agree at the door, the app sends anonymous usage counts to PostHog, hosted in the European Union: named events such as “a workout was logged” or “the Ledger was opened”, with a random device identifier, a session identifier, and the time. Never the contents — no amounts, no titles, no notes, no body stats, no health numbers, no record text of any kind.',
            'The identifier and any unsent counts live in your browser’s storage and are created only after you agree. If you sign in, the random identifier is linked to your account identifier so your own devices count as one person; your email address is not sent. You can switch analytics off at any time in Settings, under THE FINE PRINT, and the app honors your browser’s Global Privacy Control signal automatically.',
            'These counts exist to show which parts of the app are used and kept. They are not shared, sold, or joined to anything else.',
          ],
        },
        {
          h: 'Who processes what',
          p: [
            'Supabase holds accounts and synced records. PostHog (EU) holds the usage counts. Vercel hosts the app and takes the aggregate page counts. Google provides sign-in.',
            'Market prices and exchange rates (Twelve Data, Frankfurter) are fetched directly from your device — for Twelve Data, with your own API key — so those requests travel from you to them under their policies, and we never see them.',
          ],
        },
        {
          h: 'Retention and deletion',
          p: [
            `Local records stay until you delete them, or your browser does. Synced records stay until you ask: write to ${__CONTACT_EMAIL__} from the address you signed in with, and whatever the sync holds is deleted — without argument and without a retention offer. Usage counts are pseudonymous and kept only while they are useful for understanding how the app is used.`,
          ],
        },
        {
          h: 'What is never done',
          p: [
            'No advertising and no ad networks. No selling or renting of data. No cross-site tracking. No profiling for anyone else’s benefit. The app asks for no device permission it does not need.',
          ],
        },
        {
          h: 'Age',
          p: [
            `Majordomo is not for children under 16, and we do not knowingly hold their data. If you believe someone under 16 is using it, write to ${__CONTACT_EMAIL__}.`,
          ],
        },
        {
          h: 'Changes, and who to talk to',
          p: [
            'If this policy changes materially, the app shows its door again and asks you to re-accept before continuing; this page always carries the current version.',
            `Majordomo is operated by the operator of majordomocal.com, an individual based in Israel. You can always ask what is held about you, ask for a copy of it, or ask for its deletion: ${__CONTACT_EMAIL__}.`,
          ],
        },
      ],
    },
  },

  terms: {
    title: 'Terms of Service',
    back: 'Back to the estate',
    metaTitle: 'Terms — Majordomo',
    metaDescription: 'The agreement for using Majordomo.',
    updated: 'Last updated: 31 August 2026',
    sections: [
      {
        h: 'Who we are, and what this is',
        p: [
          `Majordomo, at majordomocal.com (“the app”), is operated by the operator of majordomocal.com (“we”, “us”) — an individual based in Israel, reachable at ${__CONTACT_EMAIL__}. These Terms of Service (“Terms”) are the agreement between you and us for using the app, together with the Privacy Policy.`,
        ],
      },
      {
        h: 'Acceptance',
        p: [
          'The app shows these Terms at its door. Pressing AGREE & ENTER — or otherwise using the app — is your acceptance of these Terms and the Privacy Policy. If you do not agree, do not use the app.',
          'You must be at least 16 years old to use the app.',
        ],
      },
      {
        h: 'The service, and what it costs',
        p: [
          'Majordomo is a personal calendar and life-organizer: shifts, training, study, projects, and money records, kept on your own device. The app is currently free of charge.',
          'We may introduce paid plans in the future. If we do, it will be announced in the app with reasonable notice, and nothing will ever be charged without your explicit agreement at that time. Features may be added, changed, or removed as the app evolves.',
        ],
      },
      {
        h: 'Your account',
        p: [
          'An account — Google sign-in — is optional, and exists to sync your records between your devices. You are responsible for the security of the Google account you sign in with and for what happens under your sign-in. One account per person; do not impersonate anyone.',
        ],
      },
      {
        h: 'Your records, and your responsibility for them',
        p: [
          'Everything you enter belongs to you. The app is local-first: your records live in your browser’s storage on your own device, and unless you sign in, they exist nowhere else.',
          'Browsers can and do evict local storage — an operating-system cleanup, a cleared cache, a lost phone. Sync, when you use it, is a best-effort convenience between your own devices, not a guaranteed backup service. The app gives you a one-file export in Settings; keeping backups with it is your responsibility, and we are not liable for lost records.',
        ],
      },
      {
        h: 'Acceptable use',
        p: [
          'Use the app lawfully, as a person managing their own affairs. Do not probe, overload, or attack the service; do not attempt to reach anyone else’s records; do not scrape, resell, or misrepresent the service; do not use it to hold content that is unlawful to hold.',
        ],
      },
      {
        h: 'Not medical, nutrition, or training advice',
        p: [
          'The training features compute estimates from what you log: muscle strain, recovery timing, training-volume classifications, calorie and macronutrient targets. These are informational estimates from general formulas — not medical advice, not a diagnosis, and not a substitute for a physician, physiotherapist, or dietitian.',
          'Consult a qualified professional before acting on them, especially if you have any medical condition. You train, eat, and recover at your own judgment and risk.',
        ],
      },
      {
        h: 'Not financial advice',
        p: [
          'The money features track balances, holdings, budgets, and spending that you enter, and can display market prices from third-party feeds. Nothing in the app is financial, investment, tax, or legal advice, and nothing in it is a recommendation to buy or sell anything. Market data may be delayed, incomplete, or wrong, and currency conversions are estimates. Verify anything that matters with your bank, broker, or advisor.',
        ],
      },
      {
        h: 'Third-party services',
        p: [
          'Parts of the app rely on services we do not control: Google (sign-in), Supabase (accounts and sync), Vercel (hosting), Twelve Data and Frankfurter (market and exchange-rate data, fetched from your device — Twelve Data with an API key you supply under their own terms). Their availability is theirs, not ours, and their terms govern your use of them.',
        ],
      },
      {
        h: 'Intellectual property',
        p: [
          'The app — its code, design, and text — is ours. You receive a personal, non-exclusive, non-transferable licence to use it. Your records are yours, and we claim no rights over them. If you send feedback, we may use it without obligation to you.',
        ],
      },
      {
        h: 'As is',
        p: [
          'The app is provided “as is” and “as available”, without warranties of any kind, express or implied — including merchantability, fitness for a particular purpose, accuracy, and uninterrupted or error-free operation — to the fullest extent the law allows.',
        ],
      },
      {
        h: 'Limitation of liability',
        p: [
          'To the fullest extent the law allows, we are not liable for indirect, incidental, special, consequential, or punitive damages, nor for loss of data, profits, or goodwill, arising from or connected to the app. Our total liability for all claims combined is capped at the greater of what you paid us in the twelve months before the claim — today, nothing — and ₪100. Nothing in these Terms excludes liability that the law does not allow to be excluded.',
        ],
      },
      {
        h: 'Indemnity',
        p: [
          'If your misuse of the app brings a third party’s claim against us, you will cover the reasonable costs and damages that result.',
        ],
      },
      {
        h: 'Suspension, termination, and the end of the service',
        p: [
          `You may stop using the app at any time; your local records stay on your device, and your synced records are deleted on request to ${__CONTACT_EMAIL__}. We may suspend or terminate access for abuse of the service or of these Terms, and we may discontinue the service itself — with reasonable notice in the app, so you can export your records first.`,
          'The parts of these Terms that by their nature survive — your responsibility for your records, the advice disclaimers, intellectual property, the warranty disclaimer, the limitation of liability, the indemnity, and governing law — survive.',
        ],
      },
      {
        h: 'Changes to these Terms',
        p: [
          'We may update these Terms. For a material change, the app shows its door again and asks you to re-accept before continuing, and this page always carries the current version with its date below. Continued use after re-acceptance is agreement to the updated Terms.',
        ],
      },
      {
        h: 'Governing law',
        p: [
          'These Terms are governed by the laws of the State of Israel, and the competent courts of Israel have exclusive jurisdiction over disputes — without prejudice to any mandatory consumer protections of the place where you live. If part of these Terms is held unenforceable, the rest stands. A right we do not enforce is not waived.',
        ],
      },
      {
        h: 'Contact',
        p: [`${__CONTACT_EMAIL__} — we read it.`],
      },
    ],
  },
} as const
