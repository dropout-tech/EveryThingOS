const GOOGLE_AUTH = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO = "https://openidconnect.googleapis.com/v1/userinfo";

export type GoogleConfig = { clientId: string; clientSecret: string };

export type GoogleProfile = { sub: string; email: string; emailVerified: boolean; name: string };

/** Present only when both values are set. An empty shell does not fall back to a password or to ERPNext. */
export function googleConfig(): GoogleConfig | null {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret };
}

export function googleAuthorizeUrl(input: { clientId: string; redirectUri: string; state: string; challenge: string }) {
  const url = new URL(GOOGLE_AUTH);
  url.searchParams.set("client_id", input.clientId);
  url.searchParams.set("redirect_uri", input.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid email profile");
  url.searchParams.set("state", input.state);
  url.searchParams.set("code_challenge", input.challenge);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("prompt", "select_account");
  return url;
}

export async function googleProfile(
  input: { code: string; verifier: string; redirectUri: string; clientId: string; clientSecret: string },
  fetchImpl: typeof fetch = fetch,
): Promise<{ ok: true; profile: GoogleProfile } | { ok: false; error: "token" | "profile" }> {
  const tokenRes = await fetchImpl(GOOGLE_TOKEN, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code: input.code,
      client_id: input.clientId,
      client_secret: input.clientSecret,
      redirect_uri: input.redirectUri,
      grant_type: "authorization_code",
      code_verifier: input.verifier,
    }),
  });
  if (!tokenRes.ok) return { ok: false, error: "token" };
  const token = (await tokenRes.json()) as { access_token?: string };
  if (!token.access_token) return { ok: false, error: "token" };
  const profileRes = await fetchImpl(GOOGLE_USERINFO, { headers: { authorization: `Bearer ${token.access_token}` } });
  if (!profileRes.ok) return { ok: false, error: "profile" };
  const body = (await profileRes.json()) as { sub?: string; email?: string; email_verified?: boolean; name?: string };
  const email = body.email?.trim().toLowerCase() ?? "";
  if (!body.sub || !email.includes("@")) return { ok: false, error: "profile" };
  return { ok: true, profile: { sub: body.sub, email, emailVerified: body.email_verified === true, name: body.name?.trim() || email } };
}
