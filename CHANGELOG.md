# Changelog

## [0.3.4](https://github.com/amit-batra/opencode-plugin-auto-update-improved/compare/v0.3.3...v0.3.4) (2026-11-08)


### Bug Fixes

* default throttle interval to 24 hours ([156b394](https://github.com/amit-batra/opencode-plugin-auto-update-improved/commit/156b3941001999dcb686b52c9462a10a9f540c2b))
* only write throttle state after successful update ([43d7d6c](https://github.com/amit-batra/opencode-plugin-auto-update-improved/commit/43d7d6cb653ed6e7cfa58b72b2353516acec9d06))
* recover from stale lock files ([89fe222](https://github.com/amit-batra/opencode-plugin-auto-update-improved/commit/89fe22286417ed0b7489471ebf8cc8fed802b154))
* store update history in the opencode config directory ([2d3df8f](https://github.com/amit-batra/opencode-plugin-auto-update-improved/commit/2d3df8fcdb965a3b7390d6acf4fc37a2777309d2))

## 0.3.3

- Documentation improvements (README polish)

## 0.3.2

- Documentation improvements (README polish)

## 0.3.1

- Ensure update check runs every time OpenCode is opened (removed 1-hour minimum throttle)
- Default update interval changed from 24h to 0 (always check)

## 0.3.0

- Support for auto-updating `ocx` extensions if `ocx` is installed
- Improved update output handling

## 0.2.1

- Remove console log output for update summaries
- Limit output to toast notifications in normal runs

## 0.2.0

- Restore sidebar console logs with toast summary output
- Disable verbose debug capture for auto-update runs
- Add release and publish workflows with trusted publishing

## 0.1.1

- Changed from custom `--log-update` flag to standard `--log-level DEBUG` for compatibility
- Detects `--log-level DEBUG` for verbose updates and throttle bypass
- Works natively without wrapper on standard OpenCode installs

## 0.1.2

- Posts update logs into the session when `--log-level DEBUG` is used
- Captures update output without requiring environment variables

## 0.1.3

- Add local config file to enable debug logging without CLI flags
- Use prompt/Toast UI for visible update logs

## 0.1.0

- Initial release
- Background auto-update on startup with 24h throttle
- Lock file to avoid concurrent runs
- Optional pin-preserving mode and debug logging
