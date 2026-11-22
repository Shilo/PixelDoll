# R2: Do we need OAuth? Cloud backup and sync with and without it

Date: 2026-11-22. Read-only research; no project files changed.
Markers: **[verified]** = checked today against a current primary source; **[secondary]** = forum, third-party or SDK docs; **[unverified]** = from memory or a source that did not load, so test before relying on it.
Background facts on each provider's API (token lifetimes, quotas, CAS) come from the earlier note `docs/research/2026-11-22-storage-sync/notes/A3-providers.md`; they are cited there and only summarized here.

---

## Short answer

- **For the goal as stated (automatic backup and sync on phones and desktop into storage the user owns), OAuth is necessary.** It is the only free, zero-backend way a web page can write to a user's Google Drive, Dropbox or OneDrive while the user is on an iPhone or Android phone. Every no-OAuth option is either desktop-only, manual, or a power-user setup.
- **But OAuth does not fully deliver "no repeated sign-ins" either.** Without a backend, only Dropbox gives a sign-in that lasts. Google Drive needs a new sign-in popup roughly every hour of use, and OneDrive a quick redirect every 24 hours (A3 notes).
- **Without OAuth you can still ship a solid safety net:** a one-file backup and restore that works in every browser and phone, plus, on desktop Chrome and Edge, an automatic "keep a backup in this folder" that you point at your Google Drive, Dropbox, OneDrive or iCloud Drive folder. That is the fallback to ship first, whatever you decide about OAuth.

---

## 1. What OAuth is here, and what it costs

### In plain words
OAuth is the "Sign in with Google / Dropbox / Microsoft and allow PixelDoll to..." screen. The user signs in on the provider's own page (PixelDoll never sees their password). The provider then gives PixelDoll a key that only opens a small area, for example "the PixelDoll folder in your Dropbox". PixelDoll uses that key to upload and download the character library directly from the browser. No PixelDoll server is involved.

### What registering the app involves (per provider)

| | Google Drive | Dropbox | Microsoft OneDrive |
|---|---|---|---|
| Developer account | Google Cloud project (free) | Dropbox App Console (free) | Microsoft Entra app registration (free; needs an Entra directory) |
| Narrow permission to request | `drive.file`: only files PixelDoll created. Classed "non-sensitive" | "App folder": `/Apps/PixelDoll/` only | `Files.ReadWrite.AppFolder`: `/Apps/PixelDoll/` only |
| Review before the public can use it | **Brand verification**, only needed to show PixelDoll's name and logo on the consent screen. Requires a homepage and privacy policy on a verified domain (pixeldoll.app via Google Search Console) and Google's sign-in button rules. Typically **2 to 3 business days**; any later change to name, logo, URLs or domains needs re-verification **[verified]** | **Production approval**: free review. You can have up to 500 users in development, but **once 50 users connect you have 2 weeks to get approved or new connections freeze**. Needs an app icon and branding compliance; the app name cannot change after approval (A3 notes) | **Publisher verification**: free, but requires a Microsoft AI Cloud Partner Program account that has been verified, an app registered with a work or school account, a custom domain (not `*.onmicrosoft.com`) and multifactor sign-in **[verified]**. Without it, personal accounts see "unverified", and in many work and school organizations users **cannot consent at all** to new unverified apps **[verified]** |
| Money | $0 (pixeldoll.app domain already owned) | $0 | $0 |
| Ongoing duties | Keep privacy policy and contacts current; answer Google's emails or risk losing API access **[verified]**; re-verify after branding changes; watch the 2026 Drive quota changes, where very heavy use could start billing the developer's project (A3 notes) | Keep within branding and terms | Keep app registration and redirect addresses current |

**Common to all three:** a privacy policy page; a redirect address per site (pixeldoll.app and the local dev address); per-provider code ("adapters") to maintain as APIs change; protecting the stored keys in the browser (same risk class as the PixelLab token); support questions like "it asks me to sign in again".

**Rough effort (my estimate, not sourced):** a day or two of setup and paperwork per provider, plus the Google 2 to 3 business-day wait and the Dropbox review around user 50. The bigger cost is building and testing three adapters and the sign-in flows, especially on iPhone home-screen apps, where sign-in redirects have historically opened in a separate Safari context **[secondary, re-test on current iOS]**.

### What users see (wording approximate **[unverified]**)
- Google: "PixelDoll wants to access your Google Account" with a line like "See, edit, create and delete only the specific Google Drive files you use with this app."
- Dropbox: "PixelDoll would like access to its own folder (Apps > PixelDoll) inside your Dropbox."
- Microsoft: a permissions list that includes access to the app's own folder, marked "unverified" unless publisher verification is done.

### What OAuth enables
- **Automatic** backup on every device, including iPhone and Android, while PixelDoll is open.
- **Restore on a new device by signing in**: no files to carry around.
- **Real sync** between devices (edit on desktop, see it on the phone).
- The provider's own version history and trash (about 30 days on all three free tiers, A3 notes).

### What OAuth costs the user experience
- Dropbox: sign in once per device; stays connected (best).
- Google Drive (browser-only, no backend): **a sign-in popup about every hour of use**, which must be triggered by a click. Background sync stops until the user clicks (A3 notes). This directly conflicts with "no repeated sign-ins".
- OneDrive: a quick full-page redirect every 24 hours, usually without typing a password (A3 notes).
- Users who do not have or want any of these accounts get nothing.

---

## 2. Every realistic way to back up or sync WITHOUT OAuth

### a. Write into a folder that a desktop cloud app syncs (File System Access API)
How it works: the user clicks "Back up to a folder" and picks, for example, `Google Drive/PixelDoll`, `Dropbox/PixelDoll`, `OneDrive/PixelDoll` or `iCloud Drive/PixelDoll`. PixelDoll writes its files there; the provider's desktop app uploads them. No sign-in in PixelDoll at all.

- **Browser support [verified, caniuse today]:** Chrome and Edge desktop (since 86), Opera, Samsung Internet. **Not Firefox, not Safari on Mac, not Safari on iPhone** (and every iPhone browser uses Safari's engine, so not Chrome on iPhone either). Chrome on Android now lists support for the folder picker (shipped Android in Chrome 132, late 2024 **[verified, blink-dev]**), but early testers reported rough edges (no atomic writes, save-as quirks), and an Android phone folder is **not synced to the cloud automatically**: the Google Drive, OneDrive and Dropbox Android apps do not mirror arbitrary local folders **[unverified; third-party sync apps can]**.
- **Which folders are allowed [verified, current Chromium source]:** Chrome blocks system folders and the roots of Home, Desktop, Documents and Downloads, but allows subfolders. On Mac, it explicitly allows `~/Library/CloudStorage` (where Google Drive, Dropbox and OneDrive live now) and `~/Library/Mobile Documents` (iCloud Drive). So every major provider's desktop folder can be picked.
- **Does permission persist? [verified]** Since Chrome 122: if PixelDoll is **installed as an app**, permission is kept automatically after the first grant. In a normal tab, on the next visit Chrome shows a one-click prompt offering "Allow on every visit"; after that it stays until the user revokes it. PixelDoll must save the folder handle in IndexedDB to reuse it. Re-asking needs a click.
- **Automatic?** Yes on desktop, while PixelDoll is open (no background writes when closed).
- **Limits:** this is a **backup**, not two-way sync. If two computers write to the same synced folder at once, the cloud app makes "conflicted copy" files. Reading it on a second computer to restore works fine.

### b. Origin Private File System (OPFS)
A private, fast file area inside the browser for this website. It is not visible to the user, is deleted when site data is cleared, is subject to the same eviction rules as IndexedDB, and never leaves the device **[verified for eviction rules: MDN]**. **It does not help with backup or sync at all**; at most it is an alternative local store.

### c. Manual export / import, plus the phone share sheet
- **Export**: "Download backup" saves one file (for example a zip of the JSON and PNGs).
  - **iPhone:** Safari's default download location is **iCloud Drive > Downloads** (changeable in Settings > Apps > Safari > Downloads) **[verified, Apple Support]**. So on most iPhones a manual backup already lands in iCloud and reaches the user's other Apple devices with no extra step.
  - **Share sheet (Web Share API with files) [verified, caniuse]:** Safari iOS/macOS 14+, Chrome Android, Samsung Internet, Edge and Chrome desktop. Not Firefox. Lets the user send the backup to Files, Google Drive, Dropbox, OneDrive or email. Browsers may refuse some file types; Chrome is believed to refuse `.zip` in the share sheet **[unverified; check with `navigator.canShare` and fall back to download]**.
  - **Android:** downloads go to the phone's Downloads folder (not the cloud); the share sheet's "Save to Drive" is the way to put it in the cloud.
- **Import**: a normal file picker works everywhere, including picking the file from iCloud Drive, Google Drive or Files on a phone.
- **Automatic?** No. Needs the user to remember. Reminders ("last backup 12 days ago") help.

### d. Other storage without OAuth
- **iCloud via CloudKit JS:** needs the paid **Apple Developer Program ($99/year)** and a CloudKit container (A3 notes; current CloudKit JS page did not render its body text today, so **[partly unverified]**). Users still have to sign in with their Apple Account in the page, which is the same kind of sign-in as OAuth. 2026 developer forum posts report authentication failures and that Advanced Data Protection blocks web access unless users enable "Access iCloud Data on the Web" **[secondary]**. **Excluded: costs money, and still a sign-in.**
- **WebDAV (Nextcloud and similar):** standard Nextcloud does not allow browser access from other sites (no CORS) without an extra server app or proxy (A3 notes). Power users only.
- **User's own S3 / Cloudflare R2 / Backblaze B2 bucket:** the user creates a bucket, sets its CORS rules and pastes access keys into PixelDoll on each device. Then sync is fully automatic on every device, with no OAuth. Free tiers around 10 GB **[unverified today]**. Real downsides: a technical setup most users cannot do, keys that may grant more than intended, and keys stored in the browser like the PixelLab token. Reasonable as a hidden "advanced" option later, not as the main path.

### e. Device-to-device (peer-to-peer)
WebRTC can copy the library directly between two of the user's devices. It needs a "signaling" service to introduce them: the free PeerJS cloud server exists but is a community service with no published limits or guarantee, and its docs suggest running your own for real traffic **[verified that it is offered free; reliability secondary]**. Some networks also need a relay (TURN) server, which usually costs money. A QR code or local-network handoff can replace signaling for same-room transfers.
**Is it backup?** Only partly: it copies data to another device the user owns, but both devices must be online at the same time, nothing lands in the cloud, and if both devices are lost or wiped, so is the data. It is a "move to my new phone" feature, not a backup. Not worth building before export/import, which already covers moving devices.

### f. Browser account sync
**No browser syncs website storage (IndexedDB, localStorage, OPFS) across devices.**
- Chrome sync lists bookmarks, reading list, passwords, payment info, identity and contact info, extensions, web apps (the install itself, not its data), settings, tabs and history **[verified, Google Chrome Help]**. Website data is not on the list.
- Safari/iCloud and Firefox Sync likewise sync bookmarks, tabs, history and passwords, not website data **[unverified today; Mozilla's page failed to load]**.

### Related risk: browser data loss on phones
- Safari deletes a website's IndexedDB and other script-written storage after **7 days of Safari use without the user interacting with the site**; apps added to the Home Screen keep their own count and are not expected to lose data this way **[verified, WebKit blog 2020; MDN repeats the 7-day rule today]**.
- `navigator.storage.persist()` asks the browser not to evict data automatically. Chrome and Safari decide silently based on how much the user uses the site (Safari favors Home Screen apps); Firefox shows a prompt **[verified, WebKit blog 2023, MDN]**. It never protects against the user clearing site data.
- So without cloud sync, an iPhone user who uses PixelDoll in a Safari tab and skips a few weeks can lose everything. Encourage Home Screen install, call `persist()`, and nudge backups.

---

## 3. Comparison table

| Option | iPhone | Android | Desktop | Automatic | Survives browser data loss | Needs OAuth | Developer cost | User effort |
|---|---|---|---|---|---|---|---|---|
| **OAuth: Dropbox** | Yes | Yes | Yes | Yes (while open) | Yes | Yes | $0; review at 50 users | Sign in once per device |
| **OAuth: Google Drive** (no backend) | Yes | Yes | Yes | Partly: pauses until a click roughly every hour | Yes | Yes | $0; brand check 2-3 days; billing risk at very high scale | Sign-in popup about hourly |
| **OAuth: OneDrive** | Yes | Yes | Yes | Yes, redirect every 24 h | Yes | Yes | $0; publisher verification for work accounts is hard for individuals | Sign in, quick daily redirect |
| **a. Folder backup into a synced cloud folder** | No | Picker works, but folder is not cloud-synced | Chrome, Edge (not Firefox, not Safari) | Yes on desktop, while open | Yes | No | $0 | Pick folder once; one click on later visits unless installed |
| **b. OPFS** | Local only | Local only | Local only | n/a | **No** | No | $0 | None |
| **c. Export/import + share sheet** | Yes; download defaults to iCloud Drive | Yes; share to Drive | Yes, all browsers | **No** | Yes, if the user exported | No | $0 | Remember to back up; import on new device |
| **d1. CloudKit (iCloud)** | Yes | Yes (web sign-in) | Yes | Yes | Yes | No, but Apple sign-in | **$99/year** | Apple sign-in |
| **d2. WebDAV / Nextcloud** | Yes | Yes | Yes | Yes | Yes | No | $0 | Run or configure a server with CORS |
| **d3. Own S3 / R2 keys** | Yes | Yes | Yes | Yes | Yes | No | $0 | High: create bucket, set CORS, paste keys on each device |
| **e. Peer-to-peer** | Partly (foreground only) | Yes | Yes | No (both devices online) | Only if another device has a copy | No | $0 to low; relay may cost | Pair devices each time |
| **f. Browser account sync** | No | No | No | n/a | n/a | n/a | n/a | Not possible |

---

## 4. Recommendation

1. **Is OAuth necessary for the stated goal?** Yes, for automatic sync that includes phones. Nothing else free, no-backend and non-technical writes to the user's cloud from an iPhone or Android browser. Challenge to the goal itself: browser-only OAuth meets "no repeated sign-ins" only with **Dropbox**. Google Drive, the provider the owner values most, re-prompts about hourly without a backend, so either accept "reconnect when you come back" for Google, or revisit the no-backend rule for Google only (a tiny token-refresh function), which is a separate decision.
2. **If you decide not to do OAuth:** desktop Chrome and Edge users still get automatic backup through their cloud app's folder; Safari, Firefox and phone users get manual backup only; nobody gets live multi-device sync; restoring on a new device means importing a file. That is acceptable for a preview app, but phone users who use PixelDoll in a Safari tab remain at real risk of losing data.
3. **Ship first, regardless of OAuth (all $0, no accounts, no reviews):**
   - **Export and import of one backup file**, with the share sheet on phones (falling back to download when `canShare` says no) and a normal file picker for restore. Works on every browser and device.
   - **"Keep a backup in a folder"** on desktop Chrome and Edge, writing automatically after changes into a folder the user picks (suggest a folder inside Google Drive, Dropbox, OneDrive or iCloud Drive). Use the same file layout the later cloud sync will use (manifests plus PNGs named by content hash, A3 notes section 10), so this work carries over.
   - **Protect local data:** call `navigator.storage.persist()`, encourage Home Screen install on iPhone, and show "last backup N days ago" with a gentle reminder.
4. **Then add OAuth starting with Dropbox** (best sign-in experience, no lasting re-prompts), followed by Google Drive once the hourly re-prompt is accepted or solved. Skip CloudKit (cost), peer-to-peer (not backup) and treat S3/WebDAV as optional power-user extras.

---

## Sources (checked 2026-11-22 unless noted)

- File System Access support: https://caniuse.com/mdn-api_window_showdirectorypicker ; Chrome guide (published 2024-08-19): https://developer.chrome.com/docs/capabilities/web-apis/file-system-access ; MDN: https://developer.mozilla.org/en-US/docs/Web/API/Window/showDirectoryPicker
- File System Access on Android (enabled M132, Oct 2024, tester reports): https://groups.google.com/a/chromium.org/g/blink-dev/c/x3IcFv2jY6c
- Persistent permissions (Chrome 122): https://developer.chrome.com/blog/persistent-permissions-for-the-file-system-access-api
- Chromium blocked/allowed folders (current main): https://chromium.googlesource.com/chromium/src/+/main/chrome/browser/file_system_access/chrome_file_system_access_permission_context.cc
- Web Share with files: https://caniuse.com/mdn-api_navigator_canshare_data_files_parameter ; spec: https://www.w3.org/TR/web-share/
- iPhone Safari download location: https://support.apple.com/en-us/102440 ; https://support.apple.com/guide/iphone/iphb3100d149/ios
- Storage eviction and persist(): https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria ; WebKit storage policy (2023-08-10): https://webkit.org/blog/14403/updates-to-storage-policy/ ; WebKit 7-day cap and Home Screen exemption (2020-03-24): https://webkit.org/blog/10218/full-third-party-cookie-blocking-and-more/
- Chrome sync data types: https://support.google.com/chrome/answer/165139
- Google verification: https://support.google.com/cloud/answer/13464321 ; https://support.google.com/cloud/answer/7454865 ; https://developers.google.com/identity/protocols/oauth2/production-readiness/brand-verification
- Microsoft publisher verification (updated 2026-06-15): https://learn.microsoft.com/en-us/entra/identity-platform/publisher-verification-overview
- Dropbox production approval and PKCE, Google hourly re-auth, OneDrive 24 h, CloudKit $99, WebDAV CORS, S3 conditional writes: see `docs/research/2026-11-22-storage-sync/notes/A3-providers.md` (sources cited there)
- PeerJS free cloud server: https://peerjs.com/client/faq ; https://peerjs.com/peerserver.html
- CloudKit JS 2026 forum reports **[secondary]**: https://developer.apple.com/forums/thread/841292 ; https://developer.apple.com/forums/thread/723945
