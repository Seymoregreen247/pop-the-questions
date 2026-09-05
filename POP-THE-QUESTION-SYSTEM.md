# Pop the Question — Complete System Cheat Sheet

Seymore Green · Roslindale, Boston
Keep this. When something breaks, start here.

---

## 1. The 30-second picture

```
   YOU                CLAUDE            GITHUB            NETLIFY          PLAYER
   idea      ──►      builds     ──►    stores    ──►     serves    ──►    plays
                      the HTML          the code          the site         on phone
                                                             │
                                        ┌────────────────────┴─────────────────┐
                                        │                                      │
                                   FIREBASE                              APPS SCRIPT
                              logins · scores · challenges              backup to Sheets
                                   the real system                       the paper trail
                                        │
                                     ZAPIER
                              emails · alerts · promos
```

**The whole app is one HTML file.** No build step, no framework, no server to keep alive. That is the single most important fact about your setup. It means it cannot "go down" in the usual ways, it loads fast on a bad train connection, and any browser from the last five years can run it.

---

## 2. The pieces and what each one is actually for

| Piece | Its one job | If it dies |
|---|---|---|
| **GitHub** | Stores the code + every past version | Site stays up. You just can't publish changes. |
| **Netlify** | Turns the code into a public web address | Site is down. This is the only true outage. |
| **Firebase Auth** | Logins, passwords, emails | People play as guests. Nothing else breaks. |
| **Firestore** | Scores, challenges, sponsors, questions | Everything falls back to the phone's own storage. |
| **Apps Script** | Copies data into a Google Sheet | You lose the spreadsheet view. Game unaffected. |
| **Zapier** | Emails, alerts, promos | Automations stop. Game unaffected. |

**Read that right column again.** Only Netlify going down takes the game offline. Everything else degrades quietly. That was a deliberate design choice and it is why the app is hard to kill.

---

## 3. The deploy loop

Your standard cycle:

```
Claude builds  →  you upload to GitHub  →  Netlify auto-publishes  →  live in ~60 seconds
```

**Steps:**

1. Download the file I give you.
2. Rename it exactly **`index.html`** — this matters, Netlify looks for that name.
3. GitHub → your repo → upload the file → replace the old one → Commit.
4. Netlify sees the commit and rebuilds by itself. Watch it under **Deploys**.
5. Open the live site. **Hard-refresh** (see §8) or you'll see the old version and think it failed.

**Rolling back a bad deploy:** Netlify → Deploys → find the last good one → **Publish deploy**. You are back in about ten seconds. This is your undo button. Know it before you need it.

**GitHub tokens:** fine-grained, `github_pat_` prefix, scoped to this repo only, 90-day expiry. When it stops working after three months, that is the expiry, not a break — generate a new one.

---

## 4. Firebase setup, in order

Do these in this exact sequence at the desktop.

### Step 1 — Authentication
Firebase Console → **Authentication** → Get Started → enable **Email/Password**.

### Step 2 — Firestore
**Firestore Database** → Create database → pick a region near Boston (`us-east1`) → start in **production mode**.

Production mode locks everything by default. That is correct. You are about to open exactly what needs opening.

### Step 3 — Security rules — DO NOT SKIP THIS

This is the step that keeps player emails from leaking. Test mode leaves your database readable by anyone on earth who views your page source, and there are bots that scan for exactly that.

Firestore → **Rules** tab → replace everything with this → **Publish**:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    function signedIn()  { return request.auth != null; }
    function isMe(uid)   { return signedIn() && request.auth.uid == uid; }
    function isOwner()   { return signedIn() &&
                           exists(/databases/$(database)/documents/admins/$(request.auth.uid)); }

    // Player profiles — you read and write only your own
    match /users/{uid} {
      allow read, write: if isMe(uid);
      match /private/{doc} {
        allow read, write: if isMe(uid);
      }
    }

    // Leaderboard — everyone can see it, you can only write your own row
    match /leaderboard/{uid} {
      allow read: if true;
      allow write: if isMe(uid);
    }

    // Username claims — readable so names stay unique, claimable once
    match /usernames/{name} {
      allow read: if true;
      allow create: if signedIn();
      allow update, delete: if isOwner();
    }

    // Challenges — signed-in players can create and read them
    match /challenges/{id} {
      allow read: if signedIn();
      allow create: if signedIn();
      allow update: if signedIn();
      allow delete: if isOwner();
    }

    // Sponsors — the world reads them, only you write them
    match /sponsors/{id} {
      allow read: if true;
      allow write: if isOwner();
    }

    // Questions — the world reads them, only you write them
    match /questions/{id} {
      allow read: if true;
      allow write: if isOwner();
    }

    // The owner list itself — nobody can edit it from the app, ever
    match /admins/{uid} {
      allow read: if isMe(uid);
      allow write: if false;
    }
  }
}
```

### Step 4 — Make yourself the owner
Create your account in the app first, then in Firestore:
Create collection **`admins`** → document ID = **your user's UID** (Authentication → Users → copy UID) → add any field, e.g. `owner: true`.

That `admins` document is what unlocks sponsor and question writing. Nothing in the app can create it — you make it by hand, on purpose. That's the point.

### Step 5 — Connect the app
Firebase → Project Settings → Web app → copy the config block.
In your app: **Admin (PIN 239367SG) → Connections → paste box → Fill fields from paste → Save → reload → Test.**

### Step 6 — Authorized domains
Authentication → Settings → **Authorized domains** → add your Netlify address.
Skip this and logins fail on the live site while working fine locally. Classic head-scratcher.

---

## 5. What lives where

**On the player's phone** (localStorage, keys start `ptq-`): their name, scores, streaks, word-search progress, hangman record, memory game record, challenge history, weekly points, sponsor view/tap counts.

**In Firestore:** `users` (profiles), `users/{uid}/private/progress` (synced progress), `leaderboard`, `usernames`, `challenges`, `sponsors`, `questions`, `admins`.

**The rule of thumb:** phone storage is per-device. Firestore is what combines everybody. That is why your sponsor report currently shows only your own device — the counting is built and correct, it just needs the cloud to pool it.

---

## 6. Apps Script vs Firebase — not a competition

**Firebase is the system.** Logins, live scores, challenges, anything with more than one person involved.

**Apps Script is the paper trail.** It writes rows to a Google Sheet you can open, sort, and show someone. Good for submitted questions, feedback, a sponsor log.

Apps Script was never built for logins or many people writing at once. Keep it for exports. Don't ask it to be a database.

Both URLs live in the same **Connections** panel. Either can be blank.

---

## 7. Zapier

**Important:** Zapier cannot watch Firestore directly. No native trigger exists. Everybody hits this.

Two routes:

- **Cloud Functions** — clean, but needs the Blaze billing plan (pennies at your volume, still wants a card).
- **Webhook from the app** — Zapier gives you a URL, the app posts to it when something happens. Free tier, no billing, fits how your Connections panel already works. **This is the one I'd build.**

Good automations: new signup → welcome email; feedback submitted → email you; weekly board closes → email the top players; sponsor milestone → renewal reminder.

**Consent:** any marketing email needs real opt-in and a working unsubscribe. You already built SMS consent tracking into Text Money — same discipline. Cheaper now than retrofitted after a complaint.

---

## 8. Browsers

**Works on:** Chrome, Safari, Firefox, Edge, Samsung Internet — mobile and desktop, roughly 2020 onward. Plain HTML, CSS and JavaScript with no framework is the most compatible thing you can ship.

**Known quirks:**

- **iOS Safari private mode** — localStorage may be wiped or blocked. Scores vanish. Not your bug. Firebase accounts are the fix.
- **Share sheet** — `navigator.share` works on phones, not most desktop browsers. The app already falls back to copying. That's why challenge codes are copy-paste.
- **Autoplay sound** — phones block audio until the player taps something. Unavoidable, by design, everywhere.

**Hard-refresh** (your most-used trick when a deploy "didn't work"):
- iPhone/Safari: Settings → Safari → Clear History and Website Data
- Android/Chrome: ⋮ → History → Clear browsing data → Cached images and files
- Desktop: **Ctrl+Shift+R** (Windows) / **Cmd+Shift+R** (Mac)

---

## 9. Troubleshooting

| Symptom | Almost always | Fix |
|---|---|---|
| Deploy done, site looks unchanged | Cached old version | Hard-refresh (§8) |
| Netlify deploy failed | File not named `index.html` | Rename, re-upload |
| Blank white page | JS error | Desktop browser → F12 → Console → send me the red line |
| Login works local, fails live | Netlify domain not authorized | Firebase → Auth → Settings → Authorized domains |
| "Missing or insufficient permissions" | Rules blocking | Expected before §3. After, check you're signed in. |
| Can't save sponsors/questions | No `admins` document | §3 Step 4 |
| Challenge link opens nothing | Sent a `file://` link, not the Netlify one | Send the live URL |
| "Code was not readable" | Partial code pasted | Copy the whole block |
| Sponsor report shows nothing | Counts are per-device | Expected until Firestore pools them |
| Scores vanished on iPhone | Private browsing | Use a normal tab; accounts fix it properly |

**Golden rule:** the Console (F12 on desktop) tells you what actually happened. Send me the red text and I can usually name the line.

---

## 10. Getting into the App Store

You are closer than you think, because your app is already one file that runs in a browser.

**Stage 1 — Make it a PWA (do this next, it's small).**
Add a manifest file and an icon set, and people can "Add to Home Screen." It gets its own icon, opens without browser chrome, and looks like an app. Works on iPhone and Android today. **No store, no fee, no review.** For most local businesses this is where the story ends, and that's fine.

**Stage 2 — Wrap it for the stores.**
- **Android:** free tool called Bubblewrap turns a PWA into a Play Store app. Google Play costs **$25, one time**. Google explicitly welcomes PWAs.
- **iPhone:** wrap it with Capacitor. Apple Developer is **$99/year**. Apple's review is stricter — they reject apps that are just a website in a shell with nothing added. You'd want push notifications and offline play to make the case.

**Honest advice:** don't pay Apple until people are already playing every week. A PWA on the home screen is nearly indistinguishable from a store app to a normal person, and it costs nothing. Prove the habit first, then buy the shelf space.

**The cannabis wrinkle** — worth knowing before you spend: both stores have restrictions around cannabis. Pop the Question is a trivia game and should be fine on its own, but do not bundle Lane 2 sales or CBD/THCA links into the app version. Keep the game a game.

---

## 11. Sensible order of operations

1. ✅ App built and live on Netlify
2. **Firebase Auth + Firestore + rules + admins doc** ← you're here
3. Test challenges with real people on the live site
4. Watch ten people play at the shop. Note where they quit.
5. PWA manifest + icons
6. Zapier webhook panel
7. Signed-in-to-signed-in challenges with rivalry records
8. Sell a sponsor slot using real numbers
9. App stores — only if the weekly habit is real

---

## 12. Numbers to keep

- **Admin PIN:** `239367SG` — yours only. Never a player's. Nothing to do with challenges.
- **Firebase SDK:** 12.18.0, loaded from Google's CDN
- **Collections:** `users`, `leaderboard`, `usernames`, `challenges`, `sponsors`, `questions`, `admins`
- **Phone storage keys:** all start with `ptq-`
- **Deploy path:** Claude → GitHub (Seymoregreen247) → Netlify
- **File must be named:** `index.html`

---

*One HTML file, no server, degrades gracefully, hard to kill. Keep it that way.*
