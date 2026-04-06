---
name: deploy
description: Build and deploy PhishLogic backend to AWS ECS production. Runs TypeScript build verification, Docker build with --no-cache and --platform linux/amd64, pushes to ECR, forces new ECS deployment, and verifies health.
version: 1.0.0
---

# PhishLogic Production Deployment

Execute the following steps in order. Stop immediately if any step fails and report the error.

## Step 1: Build Verification

Run backend TypeScript build to catch any compile errors before building the Docker image:

```bash
cd /Users/anil.vankadaru/code/PhishLogic && npm run build
```

Run admin-ui build:

```bash
cd /Users/anil.vankadaru/code/PhishLogic/admin-ui && npm run build
```

Both must exit with code 0. If either fails, stop and report the TypeScript errors.

## Step 2: ECR Authentication

Authenticate Docker with AWS ECR (token expires after 12h):

```bash
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin 529088285632.dkr.ecr.us-east-1.amazonaws.com/phishlogic-prod
```

Expected: `Login Succeeded`

## Step 3: Docker Build

Build the production image. Critical flags:
- `--no-cache` — always build fresh, never reuse stale layers
- `--platform linux/amd64` — REQUIRED: dev machine is Apple Silicon (ARM64), ECS runs x86_64. Without this flag the container will fail with `exec format error` on ECS.
- Tag as `:latest`

```bash
cd /Users/anil.vankadaru/code/PhishLogic && docker build \
  --no-cache \
  --platform linux/amd64 \
  -t 529088285632.dkr.ecr.us-east-1.amazonaws.com/phishlogic-prod:latest \
  -f Dockerfile \
  .
```

Watch for errors in the TypeScript build stage inside Docker (stage 2 builder).

## Step 4: Push to ECR

```bash
docker push 529088285632.dkr.ecr.us-east-1.amazonaws.com/phishlogic-prod:latest
```

## Step 5: Force New ECS Deployment

```bash
aws ecs update-service \
  --cluster phishlogic-prod \
  --service phishlogic-prod \
  --force-new-deployment \
  --region us-east-1 \
  --query 'service.{status:status,running:runningCount,desired:desiredCount}'
```

## Step 6: Wait for Stability

```bash
aws ecs wait services-stable \
  --cluster phishlogic-prod \
  --services phishlogic-prod \
  --region us-east-1
```

This blocks until the new task is running and healthy (up to 10 minutes).

## Step 7: Health Check

```bash
curl -s http://phishlogic-prod-alb-1698854828.us-east-1.elb.amazonaws.com/health
```

Expected: `{"status":"healthy","timestamp":"...","version":"1.0.0"}`

If health check fails, check CloudWatch logs:
```bash
aws logs tail /ecs/phishlogic-prod --follow --region us-east-1
```

## Infrastructure Reference

| Resource | Value |
|----------|-------|
| ECR repo | `529088285632.dkr.ecr.us-east-1.amazonaws.com/phishlogic-prod` |
| ECS cluster | `phishlogic-prod` |
| ECS service | `phishlogic-prod` |
| AWS region | `us-east-1` |
| Health check URL | `http://phishlogic-prod-alb-1698854828.us-east-1.elb.amazonaws.com/health` |
| CloudWatch logs | `/ecs/phishlogic-prod` |
| Platform | `linux/amd64` (always required — dev machine is Apple Silicon) |
| Image tag | `latest` |

## Troubleshooting

| Error | Fix |
|-------|-----|
| `exec format error` on ECS | Missing `--platform linux/amd64` in docker build |
| ECR push denied | Re-run Step 2 (ECR auth token expired) |
| ECS task keeps stopping | Run `aws logs tail /ecs/phishlogic-prod` for startup errors |
| TypeScript errors in Docker build | Fix errors locally with `npm run build` first |
