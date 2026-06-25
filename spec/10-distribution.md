# 10 — Distribution

## Primary artifact: compiled binary

Built with `bun build --compile`. No Bun/Node runtime required by the user (mirrors `gh`'s single
binary).

```sh
bun build ./src/cli.ts --compile --minify --outfile dist/firefly
# cross-targets:
bun build ./src/cli.ts --compile --target=bun-linux-x64   --outfile dist/firefly-linux-x64
bun build ./src/cli.ts --compile --target=bun-linux-arm64 --outfile dist/firefly-linux-arm64
bun build ./src/cli.ts --compile --target=bun-darwin-x64  --outfile dist/firefly-darwin-x64
bun build ./src/cli.ts --compile --target=bun-darwin-arm64 --outfile dist/firefly-darwin-arm64
bun build ./src/cli.ts --compile --target=bun-windows-x64 --outfile dist/firefly-windows-x64.exe
```

Target platforms: linux x64/arm64, macOS x64/arm64, windows x64.

## Release flow
- Tag → CI builds all targets → attach binaries + checksums (SHA256) to a GitHub Release.
- Each binary embeds the CLI version + the pinned API spec version (`firefly version`).
- Provide an `install.sh` (detect OS/arch, download matching binary, verify checksum, place on
  PATH) and document Homebrew/Scoop later.

## Versioning
- CLI follows SemVer independent of Firefly III.
- The vendored OpenAPI (`reference/firefly-iii-vX.Y.Z-v1.yaml`) version is recorded in
  `firefly version` output. Bumping it = re-vendor YAML, regenerate types (`01`), review diff,
  bump CLI minor.

## Short alias
A short binary alias (candidate `ff`) is decided at release time; if shipped it's an additional
symlink/copy. User-level aliases via `firefly alias` are independent of this.

## Self-update (optional, later)
`firefly version --check` compares against the latest GitHub Release; actual self-replace is a
later enhancement, not v1.

## Config & cache footprint
Only `config.yml`, `tokens.json` (fallback), and aliases under the config dir (`03`). No other
files written; uninstall = remove the binary + config dir.
