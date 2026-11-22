// Public sign-in settings for Cloud Save. Client IDs and app keys are public by design (they appear in every sign-in
// URL); the Google client secret lives only in the token endpoint (services/sync-token). Empty values mean the owner has
// not registered that provider yet: its Connect button explains that instead of starting a sign-in.
export const SYNC_CONFIG = {
	/** Google Cloud project "PixelDoll", OAuth client of type Web application. */
	googleClientId: '',
	/** Dropbox app "PixelDoll" (Scoped access, App folder), App key. */
	dropboxAppKey: '',
	/** The D31 token endpoint: POST /exchange, /refresh and /revoke. */
	tokenEndpoint: ''
};

/** Where both providers send the browser back after sign-in: the app root, which the service worker already serves. */
export const redirectUri = () => new URL(import.meta.env.BASE_URL, location.origin).href;
