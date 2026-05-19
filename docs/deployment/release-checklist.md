# AgentHub Release Checklist

Use this checklist for every beta or production release candidate. Do not close release readiness issues until these checks pass on the exact branch intended for release.

## Required Gates

```bash
pnpm install --frozen-lockfile
pnpm test
pnpm typecheck
pnpm lint
pnpm build
pnpm audit --audit-level=moderate
pnpm -C apps/web i18n:check
pnpm -C apps/web db:pglite:smoke
pnpm changelog:check
```

## Runtime Smoke

```bash
pnpm desktop -- --dry-run
pnpm db:migrate
curl --max-time 8 -i http://127.0.0.1:3000/api/health
curl --max-time 8 -i http://127.0.0.1:3000/api/health/dependencies
curl --max-time 8 -i http://127.0.0.1:3000/api/metrics
```

## Done When

- The required gates pass on a clean install with the committed lockfile.
- The runtime smoke endpoints respond with bounded JSON or Prometheus text without exposing secrets.
- `CHANGELOG.md` contains the package version being released.
- `git status --short` contains only intentional release artifacts before tagging.
- The release tag, GitHub release notes, and deployment target point to the same commit.
