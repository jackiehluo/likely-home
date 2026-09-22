# Likely Home

A Chrome extension for connecting pages, selected text, images, and existing Are.na blocks or channels to your Are.na channels. It uses TypeSafe Jev to move the likeliest destination channels to the top without blocking the normal capture flow.

## Set up

1. Install dependencies with `bun install`.
2. Build with `bun run build`.
3. Open `chrome://extensions`, enable Developer mode, choose **Load unpacked**, and select `.output/chrome-mv3`.
4. Open the extension's settings page.
5. Add a TypeSafe Jev API key and save.
6. Connect your Are.na account using the built-in sign-in.

The extension requests Are.na's `write` scope because capture creates blocks and connections. It uses its built-in OAuth application with Authorization Code and PKCE, and does not ship a client secret.

## Use

- Click the toolbar button or press `Alt+A` to connect the current page.
- Select text, right-click, and choose **Connect selection to Are.na**.
- Right-click an image and choose **Connect image to Are.na**.
- On an Are.na block or channel page, open the extension to connect the existing item instead of creating a duplicate link block.

Channels appear in Are.na order first. Jev ranks the visible list in a separate request. If Jev is unavailable, unconfigured, slow, or uncertain, the original order remains.

## Verify

```sh
bun run verify:release
```

This is the release gate. It type-checks, runs unit tests, builds the production extension, loads that build into a clean Chrome profile, drives the real injected overlay, captures evidence, and only then creates the zip in `outputs/`. If any step fails, no new deliverable is copied.

## Current constraint

Screenshot capture is intentionally omitted until Are.na documents a supported upload route.
