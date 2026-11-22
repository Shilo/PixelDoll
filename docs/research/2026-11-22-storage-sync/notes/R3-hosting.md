# R3 Hosting for Google OAuth code/refresh exchange (checked 2026-11-22)
Legend: [V] verified on official doc fetched today; [U] unverified / from memory.

## 1. Hosts with CNAME-only at Porkbun
- Cloudflare Workers: Custom Domains need an active Cloudflare zone and cannot be added to a hostname that already has a CNAME [V]. Routes need a proxied DNS record in a CF zone [V]. Partial (CNAME) zone setup is Business/Enterprise only [V]. So NO for a CNAME-only setup. Cloudflare for SaaS free plan includes 100 custom hostnames [V], but it requires your own CF zone for the fallback origin (any domain, not pixeldoll.app); Workers as fallback origin [U]. Too convoluted. Free: 100k req/day, 10 ms CPU [V]. workers.dev URL works with no card [U], but is a different site (cross-site).
- Netlify Functions: custom domains with SSL on all plans [V]; CNAME for subdomain [U]. Free = 300 credits/month, hard limit, "never charged for Free" [V]; card not stated; no overage on free.
- Vercel Functions: Hobby free, 1,000,000 invocations/month, 50 domains/project [V]; exceed = wait 30 days, no charges [V]. CNAME for subdomain [U]. Card not required for Hobby [U]. Hobby is non-commercial per terms [U].
- Deno Deploy: CNAME for subdomain on external DNS, auto Let's Encrypt [V]. Free 1M requests/month, 5 custom domains [V]. Card/overage not stated [U].
- Firebase Functions: needs Blaze (pay as you go, card) [V]; 2M invocations free then billed. Surprise-charge risk. Cloud Run: billing account required, free tier ~2M req/month [U]; domain mapping limited regions [U]. Not recommended.
- Val Town: Free plan "No custom domains" [V]. 100k runs/day.
- Fastly Compute: not fetched; free tier/trial and card requirements [U]. Skip.

## 2. Safari ITP
WebKit: cloaking defense caps expiry of cookies set in HTTP responses of a third-party CNAME-cloaked subresource at 7 days. Detection: subresource resolves through a CNAME that differs from the first-party domain and from the top-frame host's CNAME [V]. pixeldoll.app has A records (no CNAME) and auth.pixeldoll.app would CNAME to e.g. x.netlify.app, so it WOULD count as third-party cloaked: 7-day cap applies [V by the article's table, case 3]. The article does not mention IPs; the tracking-prevention page mentions "CNAME or IP address cloaking" [V] but exact IP rule unverified [U]. Whether re-setting the cookie each refresh extends it: the cap limits each Set-Cookie's lifetime to 7 days from setting, so a fresh Set-Cookie on each use gives a new 7 days (sliding) [U, logical inference]. Fails if user is away >7 days.
IndexedDB: deleted after 7 days of no user interaction (click/tap/keypress) with the site; Home Screen web apps exempt [V]. Interaction resets the timer, so regular users keep it; away >7 days loses it. Equivalent practical outcome, but IndexedDB needs no subdomain and no cookie-bearing cross-origin requests.

## 3. Google redirect URI vs JS origin
Origins and redirect URIs are configured separately; both must be HTTPS (localhost exempt), no wildcards, TLD on public suffix list; origins have no path [V]. Nothing requires them to share a host [V by absence; not explicitly stated]. Redirect URI must match exactly [V]. For a popup/code flow (GIS initCodeClient) redirect_uri is "postmessage" [U]. Testing-status apps: refresh tokens expire in 7 days [U, official but not in the fetched text]; publish to Production.

## 4. Move DNS to Cloudflare (free)
Free zone, keep A records to GitHub Pages as DNS-only (grey cloud) so GitHub Pages TLS/custom domain keeps working [U on exact detail]. Unlocks Workers Custom Domains at auth.pixeldoll.app [V requirement]. Cost $0; no card for free plan [U]. Steps: add site, import records, change NS at Porkbun, wait propagation. Risk: small DNS misconfig, DNSSEC at Porkbun must be disabled first [U].

## 5. Recommendation
Simplest $0 with no NS move: Vercel Hobby or Deno Deploy function (1M req/month, no overage charges, CNAME at Porkbun), or skip the custom domain entirely: Cloudflare workers.dev with CORS from pixeldoll.app. Because the token goes in IndexedDB (first-party, sent in POST body to the stateless function), no same-site subdomain is needed and ITP cookie capping is irrelevant. If you want the best product experience (Worker, 100k req/day, no card), move DNS to Cloudflare. Keep refresh token in IndexedDB (cookie via cloaked CNAME gets 7-day cap; localStorage/IDB sliding 7d idle; Home Screen exempt). Steps: create Google client (Web, origin https://pixeldoll.app), publish consent screen, deploy ~30-line function with client secret env var (code->tokens, refresh->access, CORS locked to origin), add CNAME at Porkbun (optional), store refresh token in IDB. About 6 steps, <1 hour.
