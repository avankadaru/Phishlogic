# PhishLogic Deployment Skill

Use this skill whenever you need to deploy PhishLogic backend changes to AWS ECS production.

---

## Infrastructure Reference

| Resource | Value |
|----------|-------|
| ECR repository | `529088285632.dkr.ecr.us-east-1.amazonaws.com/phishlogic-prod` |
| ECS cluster | `phishlogic-prod` |
| ECS service | `phishlogic-prod` |
| AWS region | `us-east-1` |
| ALB health check | `http://phishlogic-prod-alb-1698854828.us-east-1.elb.amazonaws.com/health` |
| Container port | `8080` |
| Platform | `linux/amd64` (dev machine is Apple Silicon — always specify) |

---

## Deployment Checklist

### 1. Pre-flight: Build Verification

Verify backend TypeScript compiles without errors:
```bash
cd /Users/anil.vankadaru/code/PhishLogic
npm run build
```

Verify admin-ui builds without errors:
```bash
cd /Users/anil.vankadaru/code/PhishLogic/admin-ui
npm run build
```

Both must succeed before proceeding. Fix any TypeScript or lint errors first.

---

### 2. ECR Authentication

Authenticate Docker with AWS ECR:
```bash
aws ecr get-login-password --region us-east-1 | \
  docker login --username AWS --password-stdin \
  529088285632.dkr.ecr.us-east-1.amazonaws.com/phishlogic-prod
```

Expected output: `Login Succeeded`

---

### 3. Docker Build

Build the production image with:
- `--no-cache` — always build fresh, never reuse stale layers
- `--platform linux/amd64` — required: dev machine is ARM64 (Apple Silicon), ECS runs x86_64
- Root `Dockerfile` — multi-stage build (dependencies → builder → production)

```bash
cd /Users/anil.vankadaru/code/PhishLogic
docker build \
  --no-cache \
  --platform linux/amd64 \
  -t 529088285632.dkr.ecr.us-east-1.amazonaws.com/phishlogic-prod:latest \
  -f Dockerfile \
  .
```

This takes 3–5 minutes. Watch for errors in the TypeScript build stage.

---

### 4. Push to ECR

```bash
docker push 529088285632.dkr.ecr.us-east-1.amazonaws.com/phishlogic-prod:latest
```

---

### 5. Force New ECS Deployment

```bash
aws ecs update-service \
  --cluster phishlogic-prod \
  --service phishlogic-prod \
  --force-new-deployment \
  --region us-east-1
```

---

### 6. Monitor Deployment

Wait for new tasks to become healthy (~60–90 seconds):
```bash
aws ecs wait services-stable \
  --cluster phishlogic-prod \
  --services phishlogic-prod \
  --region us-east-1
```

Check running task count:
```bash
aws ecs describe-services \
  --cluster phishlogic-prod \
  --services phishlogic-prod \
  --region us-east-1 \
  --query 'services[0].{running:runningCount,desired:desiredCount,pending:pendingCount}'
```

---

### 7. Health Check

```bash
curl -s http://phishlogic-prod-alb-1698854828.us-east-1.elb.amazonaws.com/health | python3 -m json.tool
```

Expected response: `{"status": "ok", ...}`

If the health check fails, check CloudWatch logs:
```bash
aws logs tail /ecs/phishlogic-prod --follow --region us-east-1
```

---

## Admin UI (Local Only — No Prod Deployment)

The admin-ui has no separate production hosting. It runs locally pointing to the prod backend via `.env.local`:

```bash
cd /Users/anil.vankadaru/code/PhishLogic/admin-ui
npm run dev
# Opens at http://localhost:5173
# Connects directly to prod ALB (VITE_API_BASE_URL already set in .env.local)
```

---

## Gmail Addon (Manual — No CLI Deployment)

No `.clasp.json` exists. Deploy manually:

1. Open https://script.google.com → PhishLogic project
2. Replace `Code.gs` content with `gmail-addon/Code.gs`
3. Save (Ctrl+S)
4. Deploy → Test deployments (for testing) or Manage deployments → New deployment (for prod)

---

## Full Deployment (One Copy-Paste Block)

```bash
# From repo root
ECR=529088285632.dkr.ecr.us-east-1.amazonaws.com/phishlogic-prod
REGION=us-east-1
CLUSTER=phishlogic-prod
SERVICE=phishlogic-prod

# 1. Build checks
npm run build && cd admin-ui && npm run build && cd ..

# 2. Authenticate
aws ecr get-login-password --region $REGION | \
  docker login --username AWS --password-stdin $ECR

# 3. Build image (no cache, correct platform)
docker build --no-cache --platform linux/amd64 -t $ECR:latest -f Dockerfile .

# 4. Push
docker push $ECR:latest

# 5. Deploy
aws ecs update-service --cluster $CLUSTER --service $SERVICE \
  --force-new-deployment --region $REGION

# 6. Wait for stability
aws ecs wait services-stable --cluster $CLUSTER --services $SERVICE --region $REGION

# 7. Health check
curl -s http://phishlogic-prod-alb-1698854828.us-east-1.elb.amazonaws.com/health
```

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| `exec format error` on ECS | Missing `--platform linux/amd64` in docker build |
| ECR push denied | Re-run ECR login step (token expires after 12h) |
| Health check fails after deploy | Check `aws logs tail /ecs/phishlogic-prod` for startup errors |
| ECS task keeps stopping | Check task definition env vars — likely missing DB_PASSWORD or JWT_SECRET in Secrets Manager |
| TypeScript build errors | Fix errors in `src/` before building Docker image |
