# Kredit Book

A simple digital credit book for small shops, spaza shops, market vendors and anyone who lets customers "pay later".

Instead of a paper notebook that gets lost or argued over, the shop owner records who took what on credit, who paid back, and sends a friendly WhatsApp or SMS reminder with one tap.

**Try it:** https://dikeledi-k.github.io/kredit-book/ (open it on your phone, then use "Add to Home screen").

## Features (v0.2)

- **Welcome page**: new users see what the app does and must name their shop before they can add customers.
- **Customers**: add, edit and delete customers with an optional phone number.
- **Credit and payments**: record "gave credit" and "got paid" entries with an amount, note and date.
- **Balances**: running balance per customer and the total owed to the shop, biggest debts first.
- **Reminders**: one-tap WhatsApp or SMS message, e.g. *"Hi Thabo, this is a friendly reminder that your balance at Mama's Shop is R240.00. Thank you!"*
- **Works offline**: everything is stored on the phone, and the app opens with no data connection.
- **Installable**: add it to the home screen like a normal app.
- **Backup and restore**: download a backup file and restore it on another phone.
- **Settings**: shop name, currency symbol and country calling code (defaults to `R` and `27` for South Africa).

## Run it locally

No build step and no dependencies. Serve the folder with any static file server:

```bash
npm start            # uses npx serve on http://localhost:8080
# or
python3 -m http.server 8080
```

Then open http://localhost:8080. Opening `index.html` directly as a file works for trying it out, but offline mode needs a server.

To test on your phone, run the server on your computer and open `http://<your-computer-ip>:8080` on the phone (same Wi-Fi). Offline mode and "Add to home screen" need HTTPS, so for real use, deploy it (see below).

## Run the tests

```bash
npm test
```

Tests cover money parsing and formatting, phone number conversion, balances, reminders, and backup import/export. They use Node's built-in test runner (Node 18+).

## Deploy for free

It's a static site, so any free static host works:

- **GitHub Pages**: repo **Settings → Pages → Deploy from branch → `main` / root**. Your app will be at `https://<username>.github.io/kredit-book/`.
- **Netlify** or **Vercel**: import the repo, with no build command and the root folder as the output.

When you change any file, bump `CACHE` in `sw.js` (e.g. `kredit-book-v2`) so phones download the new version.

## Project structure

```
index.html            App screens and dialogs
css/styles.css        Styles (mobile-first, light and dark mode)
fonts/                Self-hosted handwriting font for the welcome page (OFL)
js/store.js           Data layer: pure functions, no DOM (tested)
js/app.js             UI: rendering, routing, events
sw.js                 Service worker for offline use
manifest.webmanifest  Install-to-home-screen settings
icons/                App icons
tests/                Node tests for store.js
```

### How data is stored

Everything lives in the browser's `localStorage` under the key `kredit-book:v1`. Amounts are stored as whole cents to avoid rounding errors. A positive balance means the customer owes the shop; a negative balance means they paid in advance.

**Important:** data stays on the phone only. If the owner clears browser data or loses the phone, the book is gone unless they downloaded a backup.

## Ideas for next versions

- [ ] Cloud sync and login (e.g. Supabase or Firebase) so data survives a lost phone
- [ ] Customer view: a link where a customer can check their own balance
- [ ] Credit limits per customer, with a warning when exceeded
- [ ] "Remind everyone who owes more than X" in one go
- [ ] Daily and weekly summaries (credit given vs money collected)
- [ ] Simple stock tracking
- [ ] Translations (isiZulu, Sesotho, isiXhosa, Afrikaans, …)

## Validate with real users

Before adding features, get 5 real shop owners to use it for 2 weeks. Watch what confuses them and what they ask for. If they keep using it without you reminding them, you've built something real.

## License

MIT
