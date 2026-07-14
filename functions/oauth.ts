// Cloudflare Pages Function — Decap CMS GitHub OAuth login endpoint.
// Serves: /oauth  (configured as backend.base_url in public/admin/config.yml)
//
// Required secrets (set in Cloudflare Pages > Settings > Environment variables):
//   GITHUB_OAUTH_CLIENT_ID
//   GITHUB_OAUTH_CLIENT_SECRET
//
// The GitHub OAuth App's Authorization callback URL must be:
//   https://YOUR_CLOUDFLARE_DOMAIN/oauth/callback

interface Env {
  GITHUB_OAUTH_CLIENT_ID: string;
  GITHUB_OAUTH_CLIENT_SECRET: string;
}

interface OAuthContext {
  request: Request;
  env: Env;
}

export const onRequestGet = async (context: OAuthContext) => {
  const clientId = context.env.GITHUB_OAUTH_CLIENT_ID;
  const callbackUrl = new URL("/oauth/callback", context.request.url).href;
  const adminUrl = new URL("/admin/", context.request.url).href;

  const githubAuthUrl = new URL("https://github.com/login/oauth/authorize");
  githubAuthUrl.searchParams.set("client_id", clientId);
  githubAuthUrl.searchParams.set("redirect_uri", callbackUrl);
  githubAuthUrl.searchParams.set("scope", "repo");
  githubAuthUrl.searchParams.set("state", adminUrl);

  return Response.redirect(githubAuthUrl.href, 302);
};
