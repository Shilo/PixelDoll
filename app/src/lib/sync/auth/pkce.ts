// PKCE (RFC 7636) pieces for both providers' sign-in redirects.

export function base64url(bytes: Uint8Array): string {
	let binary = '';
	for (const byte of bytes) binary += String.fromCharCode(byte);
	return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** 32 random bytes as 43 base64url characters: a valid code verifier, and an unguessable `state`. */
export function randomToken(): string {
	return base64url(crypto.getRandomValues(new Uint8Array(32)));
}

/** The S256 code challenge for a verifier. */
export async function challenge(verifier: string): Promise<string> {
	const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
	return base64url(new Uint8Array(digest));
}
