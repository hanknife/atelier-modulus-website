// Cloudflare Pages Function — Decap CMS GitHub OAuth callback endpoint.
// Serves: /oauth/callback
//
// Exchanges the OAuth code for an access token, then redirects the CMS popup
// back to /admin/ with the token in the URL hash (Decap reads #access_token).

interface Env {
  GITHUB_OAUTH_CLIENT_ID: string;
  GITHUB_OAUTH_CLIENT_SECRET: string;
}

interface OAuthContext {
  request: Request;
  env: Env;
}

export const onRequestGet = async (context: OAuthContext) => {
  const url = new URL(context.request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state") || new URL("/admin/", context.request.url).href;

  const clientId = context.env.GITHUB_OAUTH_CLIENT_ID;
  const clientSecret = context.env.GITHUB_OAUTH_CLIENT_SECRET;
  const callbackUrl = new URL("/oauth/callback", context.request.url).href;

  if (!code) {
    return new Response("Missing OAuth code.", { status: 400 });
  }

  const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: callbackUrl,
    }),
  });

  const tokenData = (await tokenRes.json()) as { access_token?: string };
  const accessToken = tokenData.access_token;

  if (!accessToken) {
    return new Response("Failed to obtain GitHub access token.", { status: 401 });
  }

  const adminUrl = new URL(state);
  adminUrl.hash = `#access_token=${accessToken}`;
  return Response.redirect(adminUrl.href, 302);
};
