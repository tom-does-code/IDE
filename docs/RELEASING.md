# Publish Forge PHP 1.4.0

1. Review and commit the source changes in the IDE folder. Push with Git so the repository's ignore rules apply.
2. On GitHub, open **Releases → Draft a new release**. Create the tag **v1.4.0** from the commit that matches the build.
3. Attach **Forge-PHP-1.4.0-Setup.exe** and **SHA256SUMS-1.4.0.txt** from the local release folder.
4. Publish the release. On another Windows x64 PC, download the Setup.exe from **Assets** and run it.

The installer is unsigned. You can verify the download in PowerShell with `Get-FileHash .\Forge-PHP-1.4.0-Setup.exe -Algorithm SHA256`. Compare the result with the checksum asset.

The release bundles PHP, Xdebug, Composer, GitHub CLI and Node. Git for Windows enables source control. Intelephense is downloaded from Open VSX via **Forge: Install PHP Completions (Intelephense)**. Optional AI models and credentials are configured on each PC.

To build a new release, update the version in desktop/package.json and its lockfile, then run the Windows build script with the Installer switch. See the build prerequisites in the README.

[GitHub guide to managing releases](https://docs.github.com/en/repositories/releasing-projects-on-github/managing-releases-in-a-repository)
