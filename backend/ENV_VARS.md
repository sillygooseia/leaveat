# LeaveAt Backend — Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `PORT` | No | `3000` | HTTP port to listen on |
| `REDIS_URL` | No | — | Redis connection string for share link persistence and promo pool tracking. If omitted, in-memory fallback is used. |
| `CLEANUP_INTERVAL_MS` | No | `300000` | How often (ms) to purge expired in-memory share links |
| `DATABASE_URL` | No* | — | Postgres connection string. Required for cloud backup endpoints. |
| `LICENSE_PUBLIC_KEY` | No* | — | RSA SPKI public key PEM. Required for license verification and cloud backup. |
| `LICENSE_PRIVATE_KEY` | No* | — | RSA PKCS8 private key PEM. Required for promo license minting (`/api/license/promo/claim`). |
| `PROMO_TOTAL` | No | `100` | Total number of free promo licenses available. |
| `SMTP_HOST` | No | — | SMTP server hostname. Email features are disabled if not set. |
| `SMTP_PORT` | No | `587` | SMTP port. Use `465` with `SMTP_SECURE=true` for direct TLS. |
| `SMTP_SECURE` | No | `false` | Set to `true` for TLS on connect (port 465). |
| `SMTP_USER` | No | — | SMTP login username. |
| `SMTP_PASS` | No | — | SMTP password. |
| `SMTP_REJECT_UNAUTH` | No | `true` | Set to `false` to allow self-signed certs (dev only). |
| `MAIL_FROM` | No | `"LeaveAt" <noreply@leaveat.com>` | Sender address for outgoing emails. |
| `MAIL_NOTIFY` | No | `support@leaveat.com` | Destination for promo claim notifications and support requests. |

\* Cloud backup endpoints return `503` if `DATABASE_URL` or `LICENSE_PUBLIC_KEY` are not set. Promo claim returns `503` if `LICENSE_PRIVATE_KEY` is not set.

## Example `.env`

```env
PORT=3000
REDIS_URL=redis://localhost:6379
DATABASE_URL=postgresql://user:pass@localhost:5432/leaveat
LICENSE_PUBLIC_KEY=-----BEGIN PUBLIC KEY-----\nMIIBIjANBgkq...\n-----END PUBLIC KEY-----
LICENSE_PRIVATE_KEY=-----BEGIN PRIVATE KEY-----\nMIIEvAIBADANBgkq...\n-----END PRIVATE KEY-----
PROMO_TOTAL=100
SMTP_HOST=mail.leaveat.com
SMTP_PORT=587
SMTP_USER=support@leaveat.com
SMTP_PASS=your-smtp-password
MAIL_FROM="LeaveAt" <support@leaveat.com>
MAIL_NOTIFY=support@leaveat.com
```

## Generating the license key pair

```bash
# Generate 2048-bit RSA key pair
openssl genrsa -out license_private.pem 2048
openssl rsa -in license_private.pem -pubout -out license_public.pem
```

- Keep `license_private.pem` secret — used offline to sign license JWTs
- Set `license_public.pem` contents as `LICENSE_PUBLIC_KEY` in the backend env
