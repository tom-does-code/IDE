# Release and upgrade policy

## Build and release

1. Use the bundled Node runtime; run `npm ci` at the source root and in `src`.
2. Run `npm run lint` and `npm test` at the repository root.
3. Close the development app before a direct desktop rebuild. From `desktop`, run `node_modules/.bin/theia-patch.cmd`, `node scripts/prepare-platform.cjs`, `node scripts/sync-plugin.cjs`, and `npm run build`.
4. Run the isolated integration suite against `projects/Welcome`; never enable FORGE_TEST with a user project. Verify editor detachment, unsaved-state recovery, terminal, Xdebug, HTTP, completions, formatting and documentation.
5. Run `npm run package:win` from `desktop`. The NSIS installer in `release` creates Desktop and Start Menu shortcuts and an uninstaller. Its inputs exclude data, projects and the source repository.
6. Smoke-test the packaged executable and install/uninstall on a clean Windows account. Test paths with spaces and a non-default installation directory.
7. Sign releases with a controlled Windows code-signing identity before public distribution. The current local installer is unsigned. Never put signing credentials in the repository.

## Cadence

- Weekly: review Electron, Theia, PHP, Xdebug, Composer and bundled extension security advisories. Record findings even if no upgrade is needed.
- Monthly: evaluate the latest supported Electron patch and Theia release together on a dedicated Git branch. Keep all @theia packages on the same release. Reapply and verify upstream Lumino patches and the small Windows adaptations.
- Security updates: prioritize a patch within 48 hours of a relevant critical advisory, with the same regression gates.
- Quarterly: review dependency licences, formatter/PHPStan compatibility, clean-install packaging, backup/rollback procedures and the feature guide.

Pin runtime versions and commit lockfiles. Retain the previous installer for rollback. No automatic update feed is enabled until signing, hosting, checksum verification and staged rollout are configured. This document is a maintenance plan, not an active scheduled service.

## Official references

- https://www.electron.build/configuration/
- https://github.com/CodeIgniter/phpstan-codeigniter
- https://github.com/CodeIgniter/coding-standard
- https://github.com/PHP-CS-Fixer/PHP-CS-Fixer/blob/master/doc/usage.rst

## Current integration boundaries

Project formatting discovers root-level PHP-CS-Fixer/PHPCS configuration and preserves unchanged lines by skipping crossing hunks. Temporary sibling paths can affect filename-specific rules. Without Git history the saved disk version is the baseline. Prettier fallback formats whole files.

The environment indicator reads .env, not the executed PHP configuration. Forge-owned migration and seeding commands require two confirmations. Arbitrary terminal commands, external tasks and Composer scripts are not intercepted.

SQLTools imports host, database, driver, username and port. Passwords are prompted and are never copied from .env into settings. Existing manually saved connections are not automatically scrubbed.

CodeIgniter completion is static discovery, not a PHP evaluator: dynamic definitions, nested language arrays and nonstandard namespaces have limits. PHPStan analysis is manual and uses the project's configuration; its CodeIgniter bootstrap can execute project code.
