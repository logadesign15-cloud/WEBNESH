# NESH Computer Services — Website

Static website + one Vercel serverless function for booking notifications.

## Files

| Path | Purpose |
|---|---|
| `index.html`, `about.html`, `services.html`, `booking.html`, `contact.html` | Pages |
| `work.html` | Our Work photo gallery (filters + photo viewer) |
| `work-*.webp` | Work photos (full size and `-thumb` versions) |
| `404.html` | Custom "page not found" |
| `styles.css`, `script.js` | Design and behaviour |
| `api/booking.js` | Booking form → WhatsApp notification (Vercel function) |
| `nesh-logo.webp`, `nesh-mark.png`, `favicon*.png`, `apple-touch-icon.png`, `icons.svg` | Logo, header mark, favicons, icons (all in the main folder, next to the pages) |
| `vercel.json` | Security headers and caching |
| `.env.example` | List of environment variables |

## Deploy to Vercel

**Unzip first.** Vercel and GitHub cannot use the `.zip` itself. After unzipping, the files below must sit at the top level of your repo (`index.html` must be in the root, not inside another folder), and the `api` folder must be included.

1. Upload the unzipped files to a GitHub repo (on github.com: Add file → Upload files → drag everything from inside the unzipped folder, including the `api` folder), or run `vercel --prod` from this folder with the Vercel CLI.
2. In Vercel: **Add New → Project** → import the repo.
3. Framework Preset: **Other**. Leave Build Command, Output Directory and Install Command empty.
4. Deploy. The site works immediately.

The booking form needs the WhatsApp settings below to send notifications. Until they are set, the form shows a friendly message and offers a **"Send via WhatsApp instead"** button that opens WhatsApp with the booking details pre-filled, so no customer is lost.

## WhatsApp booking notifications

In Vercel → Project → **Settings → Environment Variables**, add (see `.env.example`):

| Variable | Value |
|---|---|
| `WHATSAPP_ACCESS_TOKEN` | Meta WhatsApp Cloud API access token (use a permanent System User token) |
| `WHATSAPP_PHONE_NUMBER_ID` | ID of the WhatsApp Business sender number |
| `WHATSAPP_RECIPIENT_PHONE` | Where notifications go, international digits, no `+` (e.g. `60123456789`) |
| `WHATSAPP_TEMPLATE_NAME` | Name of your approved **utility** template |
| `WHATSAPP_TEMPLATE_LANGUAGE` | Template language code, e.g. `en` |
| `WHATSAPP_API_VERSION` | Optional, defaults to `v23.0` |

Then **redeploy** (Deployments → ⋯ → Redeploy) so the variables take effect.

**Template:** create a utility template in Meta WhatsApp Manager with exactly one body variable, for example:

> New NESH booking: {{1}} Please contact the customer to confirm.

The recipient number must be able to receive messages from the Business sender (use a different number from the sender) and must have opted in.

## Customising

- Public WhatsApp number: search for `601130842771` in the HTML files and `script.js`.
- Email: search for `computerservicesnesh@gmail.com`.
- TikTok / Instagram links: search for `tiktok.com/@neshcomputerservices` and `instagram.com/neshcomputers`.
- Add a work photo: save a full-size `.webp` and a `-thumb.webp`, then copy one `<li>` in `work.html`.
- Colours: edit the `:root` variables at the top of `styles.css`.

## Notes

- Bookings are **requests**; NESH confirms them manually. Nothing is stored in a database.
- Do not put the access token in any HTML or JavaScript file.
