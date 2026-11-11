# Chrome Web Store releases

Publishing a GitHub release tagged `chrome-v<version>` builds, verifies, uploads, and submits the extension for normal Chrome Web Store review. After approval, Google publishes it with its existing visibility. Other release tags do not submit Chrome updates.

## Release an update

1. Increase `version` in `package.json` above the published version, commit, and push to `main`.
2. Create and publish a GitHub release with a matching tag, for example `chrome-v0.2.10`. Point the tag at the commit containing the version change. A draft release does not submit anything.
3. Open **Actions → Chrome Web Store** to see the verified ZIP and submission result. A successful workflow means submitted for review, not approved by Google.

The workflow also offers **Run workflow** with three actions:

- `check` (default): build, test, and validate the ZIP without accessing Google.
- `submit`: build and submit the selected version. Use `main` or a `chrome-v…` tag.
- `status`: fetch the current published/submitted status without uploading anything. Use `main` or a `chrome-v…` tag.

Pull requests run the build checks without Google credentials. The build job has no publishing identity. Only the separate store job can request a short-lived Google token, and it installs no project dependencies. Actions are pinned to exact commits.

The script refuses to replace a pending/staged submission, requires a newer version than the published package, polls asynchronous uploads, stops on warnings, and never automatically retries a submission. If a network failure makes the result uncertain, run `status` before retrying. Listing and privacy changes still use the Developer Dashboard.

## One-time publisher setup

This repository uses Google Workload Identity Federation through a service account. There are no service account keys or OAuth refresh tokens to store in GitHub.

1. In a dedicated Google Cloud project, enable `chromewebstore.googleapis.com`, `iam.googleapis.com`, `iamcredentials.googleapis.com`, and `sts.googleapis.com`.
2. Create a service account named `chrome-webstore`, with no project-level roles.
3. Create a global Workload Identity Pool named `github` and an OIDC provider named `github`, issuer `https://token.actions.githubusercontent.com`.
4. Map `google.subject=assertion.sub` and `attribute.repository_id=assertion.repository_id`. Restrict the provider with this condition:

```text
assertion.repository_owner_id == '8452682' &&
assertion.repository_id in ['1451782848', '1381818318'] &&
(assertion.ref == 'refs/heads/main' || assertion.ref.startsWith('refs/tags/chrome-v')) &&
assertion.workflow_ref.startsWith(assertion.repository + '/.github/workflows/chrome-webstore.yml@') &&
assertion.event_name in ['release', 'workflow_dispatch']
```

5. Grant each repository identity `roles/iam.workloadIdentityUser` on that service account. Use these two members (replace `PROJECT_NUMBER`):

```text
principalSet://iam.googleapis.com/projects/PROJECT_NUMBER/locations/global/workloadIdentityPools/github/attribute.repository_id/1451782848
principalSet://iam.googleapis.com/projects/PROJECT_NUMBER/locations/global/workloadIdentityPools/github/attribute.repository_id/1381818318
```

6. In [Chrome publisher settings](https://chrome.google.com/webstore/devconsole/bbe36559-c0bc-45c1-9c53-1fe0e091db00/settings), add the service account email. Google grants it API access to all items in this publisher.
7. Add these GitHub repository **Actions variables** (not secrets):

| Variable | Value |
| --- | --- |
| `CWS_PUBLISHER_ID` | `bbe36559-c0bc-45c1-9c53-1fe0e091db00` |
| `CWS_EXTENSION_ID` | `bdckhkfflbdbkceplpaonfihppnahoek` |
| `CWS_SERVICE_ACCOUNT` | `chrome-webstore@PROJECT_ID.iam.gserviceaccount.com` |
| `CWS_WORKLOAD_IDENTITY_PROVIDER` | `projects/PROJECT_NUMBER/locations/global/workloadIdentityPools/github/providers/github` |

Run `check`, then `status` to verify both the build and authentication before submitting a new release. Google IAM changes may take several minutes to propagate.

For local status checks, supply a short-lived token scoped to `https://www.googleapis.com/auth/chromewebstore` as `CWS_ACCESS_TOKEN`, along with `CWS_PUBLISHER_ID` and `CWS_EXTENSION_ID`, then run `bun run store:status`. Keep tokens out of shell history and Git.

References: [Chrome API guide](https://developer.chrome.com/docs/webstore/using-api), [service accounts](https://developer.chrome.com/docs/webstore/service-accounts), [GitHub → Google authentication](https://github.com/google-github-actions/auth).
