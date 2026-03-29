# Generating LeaveAt License Tokens

Use this to create a test Premium license without going through checkout.

## Dev Tokens

## Steps

**1. Open a terminal in this folder**

```powershell
cd leaveat/license
```

**2. Create the `.env` file (first time only)**

```powershell
Copy-Item .env.example .env
```

> No values need changing for local dev — RSA keys are auto-generated on first run and saved to `./keys/`.

**3. Install dependencies (first time only)**

```powershell
npm install
```

**4. Generate the token**

```powershell
npm run issue-token        # 365-day token (default)
npm run issue-token 30     # 30-day token
```

The token and its expiry are printed to the console.

**5. Activate it in the app**

1. Open the app at `http://localhost:4201`
2. Navigate to **Premium** (toolbar → ⋮ menu → Premium, or `/premium`)
3. Click **"Already have a license? Activate it →"**
4. Paste the token and click **Activate**

The app will verify it against the local license service and unlock all Premium features including `registered_access`.

---

## Dev Notes

- The token is a signed JWT. It's only valid when the **license service is running** (`dev.ps1` starts it automatically).
- The generated key pair lives in `./keys/` — do not commit it. It is `.gitignore`d.
- To invalidate a token before it expires, restart the license service with a fresh `.env` (delete `./keys/` so new keys are generated).

## Production Tester Tokens

Do **not** use the local `npm run issue-token` flow for production testers unless your local machine is intentionally using the production signing key.

Use the production helper script instead. It executes the token issuer inside the live production license pod, so the token is signed with the production private key already stored in Kubernetes.

```powershell
cd c:\Users\ben\source\repos\sillygooseia-corp
.\scripts\issue-production-license.ps1
.\scripts\issue-production-license.ps1 -Days 30
.\scripts\issue-production-license.ps1 -Days 30 -CopyToken
```

The script prints a production-valid JWT and can optionally copy it to your clipboard.

### Why this is the right path

- Production validates tokens against the production public key, not your local dev key.
- Running issuance inside the cluster avoids copying the production private key to a workstation.
- The helper targets the current `leaveat-license` pod automatically.
