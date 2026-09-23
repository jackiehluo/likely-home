# Likely Home for iOS

The iOS app contains a native Share Extension with the same channel-ranking behavior as the Chrome extension.

## Run on an iPhone

1. Open `LikelyHome.xcodeproj` in Xcode. The public Are.na OAuth client ID and `likelyhome://oauth/arena` redirect are already configured. Do not add a client secret.
2. Sign into an Apple development team in Xcode. If you use a different team, change `DEVELOPMENT_TEAM` in `Config.xcconfig` and configure the App Groups and Keychain Sharing entitlements for both targets.
3. Select the `LikelyHome` scheme and run it on an iPhone. Sign in with Are.na, save your Jev API key, then choose Likely Home from a share sheet.

If you change `project.yml`, install XcodeGen with `brew install xcodegen` and run `xcodegen generate` in this directory to update the checked-in Xcode project.

The host app signs into Are.na, stores the user’s Jev key, and refreshes the shared channel cache. The Share Extension reads that cache, ranks it with Jev, supports channel creation and multi-select, and saves URLs or text directly to Are.na.

The project builds and launches in an unsigned simulator. A signed iPhone build is needed to test sign-in and the complete share flow. Run the core tests with `swift test` from `Packages/LikelyHomeCore`.

Photos and local PDFs are accepted and ranked, but Are.na v3 currently documents block creation from a public URL or text rather than uploaded bytes. Saving those local files remains unavailable until a temporary upload service is configured. Shared public URLs, including remote image and PDF URLs, can be saved now.
