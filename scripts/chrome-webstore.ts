import { appendFile } from "node:fs/promises";

type Revision = { state?: string; distributionChannels?: { crxVersion: string }[] };
type StoreResponse = {
  uploadState?: string;
  lastAsyncUploadState?: string;
  state?: string;
  publishedItemRevisionStatus?: Revision;
  submittedItemRevisionStatus?: Revision;
  error?: { message?: string };
};

export function validateVersion(version: string, tag?: string) {
  const parts = version.split(".");
  if (parts.length > 4 || !parts.every((part) => /^(0|[1-9]\d*)$/.test(part) && Number(part) <= 65535) || parts.every((part) => Number(part) === 0)) {
    throw new Error(`Invalid Chrome extension version: ${version}`);
  }
  if (tag && tag !== `chrome-v${version}`) throw new Error(`Release tag ${tag} does not match package version ${version}`);
}

export function readArchive(path: string, tag?: string) {
  const result = Bun.spawnSync(["unzip", "-p", path, "manifest.json"]);
  if (result.exitCode !== 0) throw new Error(`Cannot read manifest.json from ${path}`);
  const manifest = JSON.parse(result.stdout.toString());
  if (manifest.manifest_version !== 3 || typeof manifest.version !== "string") throw new Error("Expected a Manifest V3 extension");
  validateVersion(manifest.version, tag);
  return manifest.version as string;
}

export function createStoreClient(
  config: { publisherId: string; itemId: string; token: string },
  send: (url: string, init: RequestInit) => Promise<Response> = fetch,
  pause: (ms: number) => Promise<unknown> = Bun.sleep,
) {
  if (!/^[a-zA-Z0-9_-]+$/.test(config.publisherId) || !/^[a-p]{32}$/.test(config.itemId) || !config.token) {
    throw new Error("Set CWS_PUBLISHER_ID, CWS_EXTENSION_ID, and CWS_ACCESS_TOKEN");
  }
  const name = `publishers/${config.publisherId}/items/${config.itemId}`;
  async function request(method: string, action: string, body?: Blob | string, upload = false): Promise<StoreResponse> {
    const response = await send(`https://chromewebstore.googleapis.com/${upload ? "upload/" : ""}v2/${name}:${action}`, {
      method,
      headers: { Authorization: `Bearer ${config.token}`, "Content-Type": upload ? "application/zip" : "application/json" },
      ...(body === undefined ? {} : { body }),
      signal: AbortSignal.timeout(120_000),
    });
    const data = await response.json() as StoreResponse;
    if (!response.ok || data.error) throw new Error(`Chrome Web Store ${action} failed (${response.status}): ${data.error?.message ?? response.statusText}`);
    return data;
  }
  const status = () => request("GET", "fetchStatus");
  return {
    status,
    async submit(archive: Blob, version: string) {
      const current = await status();
      if (["PENDING_REVIEW", "STAGED"].includes(current.submittedItemRevisionStatus?.state ?? "")) {
        throw new Error("An existing submission is pending review or staged. Resolve it in the dashboard first.");
      }
      const published = current.publishedItemRevisionStatus?.distributionChannels ?? [];
      const numericVersion = (value: string) => value.split(".").concat(["0", "0", "0"]).slice(0, 4).reduce((n, part) => n * 65536n + BigInt(part), 0n);
      if (published.some((channel) => numericVersion(version) <= numericVersion(channel.crxVersion))) {
        throw new Error(`Increase version ${version} above the published version before submitting.`);
      }
      const upload = await request("POST", "upload", archive, true);
      let state = upload.uploadState;
      for (let attempt = 0; state === "IN_PROGRESS" && attempt < 60; attempt++) {
        await pause(5_000);
        state = (await status()).lastAsyncUploadState;
      }
      if (state !== "SUCCEEDED") throw new Error(`Upload did not succeed (${state ?? "unknown"}); nothing was submitted. Check status before retrying.`);
      // Never retry this mutation automatically: an ambiguous failure needs a status check.
      return request("POST", "publish", JSON.stringify({ publishType: "DEFAULT_PUBLISH", blockOnWarnings: true }));
    },
  };
}

if (import.meta.main) {
  try {
    const [mode, archive] = Bun.argv.slice(2);
    if (!["check", "submit", "status"].includes(mode ?? "")) throw new Error("Usage: bun scripts/chrome-webstore.ts <check|submit|status> [extension.zip]");
    let version: string | undefined;
    if (mode !== "status") {
      if (!archive) throw new Error("Provide the extension ZIP path");
      version = readArchive(archive, process.env.CWS_RELEASE_TAG);
      console.log(`Validated extension ZIP: ${version}`);
    }
    if (mode !== "check") {
      const client = createStoreClient({ publisherId: process.env.CWS_PUBLISHER_ID ?? "", itemId: process.env.CWS_EXTENSION_ID ?? "", token: process.env.CWS_ACCESS_TOKEN ?? "" });
      const result = mode === "status" ? await client.status() : await client.submit(Bun.file(archive!), version!);
      const output = JSON.stringify(result, null, 2);
      console.log(output);
      if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, `Chrome Web Store ${mode}${version ? ` ${version}` : ""}\n\n\`\`\`json\n${output}\n\`\`\`\n`);
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Chrome Web Store request failed");
    process.exitCode = 1;
  }
}
