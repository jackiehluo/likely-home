# Chrome Web Store submission

## Product details

Name: Likely Home for Are.na

Summary: Save pages, text, and images to Are.na, with your likeliest destination channels shown first.

Category: Productivity

Language: English

Detailed description:

Likely Home makes saving to Are.na faster when you have a lot of channels. Open it from the toolbar, press Alt+A, or use the context menu on selected text or an image. It loads your writable channels, asks Jev which ones best match the current page, and moves the strongest matches to the top.

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
- TypeSafe Jev receives the active page URL, title, description, excerpt or selection, plus channel titles and descriptions, only to rank likely channels.
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

## Release checklist

- [x] Manifest V3 package builds with the manifest at the ZIP root.
- [x] No remotely hosted scripts, styles, or fonts.
- [x] No client secret or TypeSafe API key in the package.
- [x] On-demand page injection instead of a persistent all-sites content script.
- [x] Unit, type, build, and real-Chrome smoke checks.
- [x] Store icon, screenshot, and small promo tile generated.
- [ ] Upload the first draft to get the final Chrome Web Store extension ID.
- [ ] Add `https://<WEB_STORE_EXTENSION_ID>.chromiumapp.org/arena` to the Are.na OAuth application.
- [ ] Publish `PRIVACY.md` at a stable HTTPS URL and add it in the dashboard.
- [ ] Add support and homepage URLs in the Store Listing tab.
- [ ] Complete the Privacy, Distribution, and Test instructions tabs, then submit for review.
