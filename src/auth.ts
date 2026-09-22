import { browser } from "wxt/browser";
import { z } from "zod";
import { clearArenaToken, setArenaToken } from "./settings";

const TokenResponse = z.object({ access_token: z.string().min(1) });
const TRANSACTION_KEY = "arenaPkceTransaction";
const ARENA_CLIENT_ID = "vKdqsWkmwjH2hkYanLIkJRE8iPH7aMbGyAz73Tq5GQk";

type PendingTransaction = Readonly<{
  state: string;
  verifier: string;
  redirectUri: string;
  createdAt: number;
}>;

function base64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function randomToken(bytes: number): string {
  return base64Url(crypto.getRandomValues(new Uint8Array(bytes)));
}

async function challengeFor(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return base64Url(new Uint8Array(digest));
}

export async function authorize(): Promise<void> {
  if (!browser.identity) throw new Error("Chrome Identity is unavailable in this browser.");

  const transaction: PendingTransaction = {
    state: randomToken(32),
    verifier: randomToken(64),
    redirectUri: browser.identity.getRedirectURL("arena"),
    createdAt: Date.now(),
  };
  await browser.storage.session.set({ [TRANSACTION_KEY]: transaction });

  const authorizationUrl = new URL("https://www.are.na/oauth/authorize");
  authorizationUrl.search = new URLSearchParams({
    client_id: ARENA_CLIENT_ID,
    redirect_uri: transaction.redirectUri,
    response_type: "code",
    scope: "write",
    state: transaction.state,
    code_challenge: await challengeFor(transaction.verifier),
    code_challenge_method: "S256",
  }).toString();

  try {
    const callback = await browser.identity.launchWebAuthFlow({ interactive: true, url: authorizationUrl.toString() });
    if (!callback) throw new Error("Are.na did not return an authorization response.");
    const callbackUrl = new URL(callback);
    const error = callbackUrl.searchParams.get("error");
    if (error) throw new Error(`Are.na authorization failed: ${error}`);
    if (callbackUrl.searchParams.get("state") !== transaction.state) throw new Error("Are.na authorization state did not match.");
    if (Date.now() - transaction.createdAt > 10 * 60 * 1000) throw new Error("Are.na authorization expired. Try again.");
    const code = callbackUrl.searchParams.get("code");
    if (!code) throw new Error("Are.na did not return an authorization code.");

    const response = await fetch("https://api.are.na/v3/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        client_id: ARENA_CLIENT_ID,
        code,
        redirect_uri: transaction.redirectUri,
        code_verifier: transaction.verifier,
      }),
    });
    if (!response.ok) throw new Error("Are.na rejected the authorization code.");
    const token = TokenResponse.parse(await response.json());
    await setArenaToken(token.access_token);
  } finally {
    await browser.storage.session.remove(TRANSACTION_KEY);
  }
}

export async function handleUnauthorized(): Promise<never> {
  await clearArenaToken();
  throw new Error("Your Are.na session expired. Sign in again.");
}
