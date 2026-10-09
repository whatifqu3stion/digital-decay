# Public repository review · 9 October 2026

## Scope and findings

Reviewed the 20 commits and 72 unique file blobs reachable from the repository's advertised branch/tag history at `3ad434d`. Pattern checks covered Google and GitHub tokens, private-key headers, AWS access-key IDs, common secret-token prefixes, and credential-bearing URLs. Manual review covered key input, browser storage, client/server requests, build configuration and deployment.

No recognizable embedded credentials were found. The historical `.env.example` contained an empty value. The current build does not inject a host key, and the server requires each visitor's key.

This is a scoped review, not a guarantee that no secret has ever existed. It does not cover deleted/unreachable history, private forks, hosting logs, prior deployed bundles or GitHub Actions artifacts/logs. Rotate any key known to have been shared, regardless of these findings.

## Changes from this review

- Ignore `.env` variants and common private-key files; keep a credential-free example.
- Stop accepting credentials from page URLs. Scrub the legacy parameter without using it.
- Default both onboarding and the key dialog to tab-session storage. Persistent storage requires choosing “Remember on this device.” Previously remembered keys remain until disconnected.
- Redact the active key and Google-key patterns from generation errors before returning, displaying or logging them. Do not log raw SDK error objects.
- Describe browser storage and the Express forwarding path accurately in the README.

## Remaining boundaries

Browser storage is accessible to same-origin scripts. GitHub Pages project paths under one hostname are not separate origins. Third-party page scripts are also trusted code. The key dialog's disconnect action clears the app's storage entries but does not revoke the key at Google.

The local server receives visitor credentials in a request header; production self-hosting requires HTTPS and care with proxy logging. URL credentials may have reached a host or browser history before client-side removal, so never distribute key-bearing links.

The review does not certify dependency security or exercise paid image generation. Use a dedicated key with appropriate restrictions and revoke it in Google AI Studio if exposed.
