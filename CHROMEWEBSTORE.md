# Chrome Web Store submission

## Product details

Name: Likely Home for Are.na

Summary: Save pages, text, and images to Are.na, with your likeliest destination channels shown first.

Category: Productivity

Language: English

Detailed description:

Likely Home makes saving to Are.na faster when you have a lot of channels. Open it from the toolbar, press Alt+A, or use the context menu on selected text or an image. It loads your writable channels, asks Jev which ones best match the current page, and moves the strongest matches to the top.

For PDFs, Likely Home opens a capture window, extracts text locally from the first six pages, and sends up to 4,000 characters to Jev. The original PDF URL is saved to Are.na. PDFs without readable text, protected PDFs, and files over 20 MB retain manual channel selection.

Search and multi-select work across your full cached channel list. You can also create a new private, closed, or public channel without leaving the picker. If Jev is unavailable, the channel picker and Are.na save flow still work in Are.na's original order.

First-time setup connects Are.na, then asks for your TypeSafe Jev API key before opening the channel picker. Are.na sign-in uses OAuth with PKCE. No client secret or shared Jev key ships in the extension.

## Single purpose

Help a user connect the page, selected text, or image they choose to one or more Are.na channels, while ranking likely channels and allowing channel creation as part of that flow.

## Permission justifications

- `activeTab`: reads the current page only after the user clicks the extension, presses its shortcut, or invokes its context menu.
- `scripting`: injects the picker into the active page after one of those user actions. The extension does not install a persistent all-sites content script.
- `contextMenus`: adds actions for connecting selected text and images to Are.na.
- `identity`: runs the Are.na OAuth authorization flow and receives its redirect.
- `storage`: stores the Are.na access token, TypeSafe API key, and a 24-hour channel cache on the user's device.
- `https://api.are.na/*`: lists and creates channels, creates blocks and connections, and exchanges OAuth authorization codes.
- `https://api.typesafe.ai/*`: sends page context and channel metadata to Jev for destination ranking.

## Privacy declarations

User data categories handled:

- Authentication information
- Website content
- Web browsing activity, limited to the page where the user invokes the extension
- User-generated content and Are.na channel metadata

Data use:

- Are.na receives content and channel actions requested by the user.
- TypeSafe Jev receives the active page URL, title, description, excerpt or selection, plus channel titles and descriptions, only to rank likely channels. For PDFs, the excerpt contains up to 4,000 characters extracted locally; PDF files are not uploaded to Jev.
- Settings, credentials, and the channel cache are stored locally in Chrome extension storage.
- The developer does not receive, sell, advertise with, or use this data for unrelated purposes.

Privacy policy file: `PRIVACY.md`

Before submission, publish that policy at a stable HTTPS URL and enter the URL in the Privacy tab.

## Store assets

- `store/icon-128.png`
- `store/screenshot-1280x800.png`
- `store/small-promo-440x280.png`

## Reviewer test instructions

1. Open a normal HTTPS webpage and click the toolbar icon or press Alt+A.
2. Connect Are.na and authorize write access.
3. Enter a TypeSafe Jev API key in the first-run setup.
5. Select one or more channels and save.
6. Click "+ New channel," enter a name, choose Private, Closed, or Public, and create it. The new channel appears selected.
7. Right-click selected text or an image to verify the two context-menu capture actions.

Provide reviewer credentials in the dashboard if the reviewer cannot create the required service accounts.

## Update the published extension

1. Increase `version` in `package.json` above the published version.
2. Run `bun run verify:release`. Upload the generated `outputs/likely-home-<version>-chrome.zip` in the Chrome Web Store Developer Dashboard under **Package → Upload New Package**.
3. For automated updates, follow [Chrome Web Store releases](docs/chrome-publishing.md). Review any changed listing or privacy details in the dashboard. The existing extension ID and Are.na OAuth redirect stay the same.
