# LeaveAt

Employee scheduling and leave management — built on the [BafGo platform](https://github.com/bafgo/platform).

[![License: AGPL-3.0](https://img.shields.io/badge/license-AGPL--3.0-blue)](./package.json)
[![Built with @epheme/core](https://img.shields.io/badge/built%20with-%40bafgo%2Fcore-green)](https://github.com/bafgo/platform/tree/master/packages/core)

---

## What it is

LeaveAt lets teams manage employee schedules, shift coverage, and leave requests with no accounts required. Device identity (via `@epheme/core`) handles authentication — staff access the tool directly on their device without sign-up.

**Key properties:**
- No employee accounts or passwords
- Device-bound access with revocable licenses
- Optional cloud backup to Postgres (works fully offline without it)
- Self-hostable via Docker or Kubernetes

---

## Repo structure

```
leaveat/
  backend/        Node.js API (Express)
  frontend/       Angular 21 app
  license/        License server — issues and verifies RS256 JWTs
  infra/          Helm chart + Kubernetes manifests + provisioning scripts
  secrets/        leaveat.example.json (template — real file is gitignored)
```

---

## Local development

### Prerequisites
- Node.js 20+
- Docker (for Postgres + Redis)

### 1. Start backing services

```bash
docker compose up -d
```

This starts Postgres on `5432` and Redis on `6379`.

### 2. Configure secrets

```bash
cp secrets/leaveat.example.json secrets/leaveat.json
# edit secrets/leaveat.json with real values (gitignored — never committed)
```

### 3. Start all services

```powershell
.\dev.ps1
```

Or individually:

```bash
cd backend && npm run dev    # :3000
cd license && npm run dev    # :3001
cd frontend && npm start     # :4201
```

---

## Environment variables

See [`backend/ENV_VARS.md`](./backend/ENV_VARS.md) for the full reference.

All backend env vars are optional with graceful degradation — the app runs in a reduced mode without Postgres, Redis, or SMTP configured.

---

## License key pair

LeaveAt uses RS256 JWTs for device licenses. To generate a key pair for dev:

```bash
cd license && npm run generate-keys
```

This writes `license/keys/private.pem` and `license/keys/public.pem` (both gitignored). In production, keys are injected as Kubernetes secrets — see `infra/scripts/provision-leaveat-secrets.ps1`.

---

## Self-hosting

Kubernetes manifests and a Helm chart are in `infra/`. See the provisioning script for secret setup:

```powershell
.\infra\scripts\provision-leaveat-secrets.ps1
```

---

## License

[AGPL-3.0-only](./package.json) — SillyGooseIA Corp

Built on [`@epheme/core`](https://github.com/bafgo/platform/tree/master/packages/core) (MIT).
