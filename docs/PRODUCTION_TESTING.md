# Testing Against Production

## Quick Setup

When testing the admin UI against the production API, you don't need to run the local backend.

### Step 1: Configure Admin UI for Production

The file `admin-ui/.env.local` has been created with:
```bash
VITE_API_BASE_URL=http://phishlogic-prod-alb-1698854828.us-east-1.elb.amazonaws.com
```

### Step 2: Start ONLY Admin UI (Not Backend)

```bash
# DON'T run: npm run dev (this starts backend on port 3000)
# ONLY run admin UI:
cd admin-ui
npm run dev
```

### Step 3: Access Admin UI

Open browser at: http://localhost:5173

The UI will make API calls to production instead of localhost:3000.

## Reverting to Local Development

To go back to local testing:

1. Delete `admin-ui/.env.local`
2. Start both backend and UI:
   ```bash
   npm run dev          # Terminal 1 - backend
   cd admin-ui && npm run dev  # Terminal 2 - UI
   ```

## Security Notes

- Never commit `.env.local` (already in .gitignore)
- Production API is HTTP only (behind ALB)
- No authentication required for testing (add later)
- IP whitelisted access only

## Verifying Production Connection

1. Start admin UI: `cd admin-ui && npm run dev`
2. Open http://localhost:5173
3. Open browser DevTools → Network tab
4. Navigate to Settings page
5. Check API calls - should go to `phishlogic-prod-alb-1698854828.us-east-1.elb.amazonaws.com`
6. Settings should load from production database
7. Debug page should show production analyses

## Current Production Status

**Infrastructure:**
- ✅ ALB Target Health: 1 healthy target
- ✅ ECS Service: 1/1 running
- ✅ ALB Listener: Forwarding HTTP traffic
- ✅ Health Endpoint: Returns `{"status":"healthy"}`
- ✅ API Endpoint: Returns proper analysis results

**Security Group (sg-06a07484058f9c5e1):**
- ✅ Your IP (66.159.203.40/32) whitelisted for HTTP/HTTPS
- ✅ Google Apps Script ranges whitelisted:
  - 107.178.0.0/16 (HTTP port 80 and HTTPS port 443)
  - 34.116.0.0/16 (HTTP port 80 and HTTPS port 443)
- ✅ 11 additional Google Cloud ranges for HTTPS

**Database:**
- ✅ 12/17 migrations applied successfully
- ✅ All critical tables exist (settings, analyzers, whitelist_entries, etc.)
