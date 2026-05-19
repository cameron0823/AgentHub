# Desktop Updater

AgentHub Desktop uses `electron-updater` in the main process only. Update checks are disabled during development unless a local run explicitly passes a force option.

## Channels

Supported channels are `stable`, `beta`, and `nightly`. `stable` maps to the default release metadata, while beta and nightly require staging metadata before users receive those builds.

## Signing

Production auto-update is not complete until signing works for the target platform. macOS auto-update requires signed and notarized builds. Windows updater releases should be code signed before public distribution. Linux AppImage updates need a separate validation path before release.

## Staging Acceptance

Staging is accepted when an installed beta build detects a newer beta, downloads it, restarts cleanly, and reports the newer version after relaunch. Rollback requires publishing a higher semver patch.

## Credentials

Private update credentials must stay in CI or server-side release infrastructure. They must never be exposed to renderer code.
