# PhishLogic Deployment Guide

Complete guide for deploying PhishLogic to Google Cloud Run in production.

## Table of Contents
1. [Prerequisites](#prerequisites)
2. [Local Testing with Docker](#local-testing-with-docker)
3. [Google Cloud Setup](#google-cloud-setup)
4. [Secrets Management](#secrets-management)
5. [Database Configuration](#database-configuration)
6. [Initial Deployment](#initial-deployment)
7. [CI/CD Setup](#cicd-setup)
8. [Staging vs Production](#staging-vs-production)
9. [Monitoring & Logging](#monitoring--logging)
10. [Troubleshooting](#troubleshooting)

---

## Prerequisites

### Required Tools
- Docker Desktop (for local testing)
- Google Cloud SDK (`gcloud` CLI)
- Node.js 22+ and npm
- Git

### Required Accounts
- Google Cloud Platform account with billing enabled
- GitHub account (for CI/CD)

---

## Local Testing with Docker

### 1. Build Docker Image

```bash
# Build the image
docker build -t phishlogic:local .

# Verify the build
docker images | grep phishlogic
```

### 2. Run with Docker Compose

```bash
# Start all services (database + API)
docker-compose up

# Run in detached mode
docker-compose up -d

# View logs
docker-compose logs -f api

# Stop all services
docker-compose down
```

### 3. Test the Deployment

```bash
# Health check
curl http://localhost:8080/health

# Analyze URL
curl -X POST http://localhost:8080/api/v1/analyze/url \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com"}'
```

---

## Google Cloud Setup

### 1. Create GCP Project

```bash
# Set project ID
export PROJECT_ID="phishlogic-prod"

# Create project
gcloud projects create $PROJECT_ID --name="PhishLogic Production"

# Set as active project
gcloud config set project $PROJECT_ID

# Enable billing (must be done in Cloud Console)
# Visit: https://console.cloud.google.com/billing
```

### 2. Enable Required APIs

```bash
# Enable Cloud Run
gcloud services enable run.googleapis.com

# Enable Container Registry
gcloud services enable containerregistry.googleapis.com

# Enable Secret Manager
gcloud services enable secretmanager.googleapis.com

# Enable Cloud SQL (if using Cloud SQL)
gcloud services enable sqladmin.googleapis.com

# Verify enabled services
gcloud services list --enabled
```

### 3. Create Service Account

```bash
# Create service account for CI/CD
gcloud iam service-accounts create github-actions \
  --display-name="GitHub Actions CI/CD"

# Grant necessary permissions
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:github-actions@${PROJECT_ID}.iam.gserviceaccount.com" \
  --role="roles/run.admin"

gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:github-actions@${PROJECT_ID}.iam.gserviceaccount.com" \
  --role="roles/storage.admin"

gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:github-actions@${PROJECT_ID}.iam.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"

gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:github-actions@${PROJECT_ID}.iam.gserviceaccount.com" \
  --role="roles/iam.serviceAccountUser"

# Create and download key
gcloud iam service-accounts keys create github-actions-key.json \
  --iam-account=github-actions@${PROJECT_ID}.iam.gserviceaccount.com

# IMPORTANT: Store this key securely in GitHub Secrets as GCP_SA_KEY
```

---

## Secrets Management

### 1. Create Secrets in Google Secret Manager

```bash
# Database password
echo -n "your-secure-db-password" | \
  gcloud secrets create db-password-prod --data-file=-

# JWT secret (minimum 32 characters)
openssl rand -base64 32 | \
  gcloud secrets create jwt-secret-prod --data-file=-

# SCIM encryption key
openssl rand -base64 32 | \
  gcloud secrets create scim-encryption-key --data-file=-

# OpenAI API key (optional)
echo -n "sk-your-openai-key" | \
  gcloud secrets create openai-api-key --data-file=-

# Verify secrets created
gcloud secrets list
```

### 2. Grant Access to Cloud Run Service

```bash
# Get Cloud Run service account
SERVICE_ACCOUNT=$(gcloud run services describe phishlogic \
  --platform managed \
  --region us-central1 \
  --format 'value(spec.template.spec.serviceAccountName)')

# Grant access to secrets
gcloud secrets add-iam-policy-binding db-password-prod \
  --member="serviceAccount:${SERVICE_ACCOUNT}" \
  --role="roles/secretmanager.secretAccessor"

gcloud secrets add-iam-policy-binding jwt-secret-prod \
  --member="serviceAccount:${SERVICE_ACCOUNT}" \
  --role="roles/secretmanager.secretAccessor"

gcloud secrets add-iam-policy-binding scim-encryption-key \
  --member="serviceAccount:${SERVICE_ACCOUNT}" \
  --role="roles/secretmanager.secretAccessor"
```

---

## Database Configuration

### Option A: Cloud SQL (Recommended)

```bash
# Create Cloud SQL instance
gcloud sql instances create phishlogic-db \
  --database-version=POSTGRES_16 \
  --tier=db-f1-micro \
  --region=us-central1 \
  --root-password=YOUR_ROOT_PASSWORD

# Create database
gcloud sql databases create Phishlogic --instance=phishlogic-db

# Create user
gcloud sql users create phishlogic \
  --instance=phishlogic-db \
  --password=YOUR_PASSWORD

# Get connection name
gcloud sql instances describe phishlogic-db \
  --format='value(connectionName)'

# Note: Use this connection name in Cloud Run deployment
```

### Option B: External Database

If using an external PostgreSQL database:

1. Ensure SSL is enabled
2. Add Cloud Run IP ranges to allowlist
3. Configure connection in Cloud Run environment variables

---

## Initial Deployment

### 1. Build and Push Docker Image

```bash
# Authenticate Docker with GCR
gcloud auth configure-docker

# Build image
docker build -t gcr.io/$PROJECT_ID/phishlogic:v1.0.0 .

# Push to Container Registry
docker push gcr.io/$PROJECT_ID/phishlogic:v1.0.0
```

### 2. Deploy to Cloud Run

```bash
gcloud run deploy phishlogic \
  --image gcr.io/$PROJECT_ID/phishlogic:v1.0.0 \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --memory 2Gi \
  --cpu 2 \
  --timeout 60s \
  --max-instances 10 \
  --min-instances 1 \
  --set-secrets=DB_PASSWORD=db-password-prod:latest,JWT_SECRET=jwt-secret-prod:latest,SCIM_ENCRYPTION_KEY=scim-encryption-key:latest \
  --set-env-vars NODE_ENV=production,DB_HOST=your-db-host,DB_PORT=5432,DB_NAME=Phishlogic,DB_USER=phishlogic,DB_SSL=true,TRUST_PROXY=true,API_BASE_URL=https://phishlogic-xxx.run.app

# For Cloud SQL, add:
#  --add-cloudsql-instances=PROJECT_ID:REGION:INSTANCE_NAME
```

### 3. Get Service URL

```bash
gcloud run services describe phishlogic \
  --platform managed \
  --region us-central1 \
  --format 'value(status.url)'
```

### 4. Verify Deployment

```bash
SERVICE_URL=$(gcloud run services describe phishlogic \
  --platform managed \
  --region us-central1 \
  --format 'value(status.url)')

# Health check
curl $SERVICE_URL/health

# Test SCIM endpoint
curl $SERVICE_URL/scim/v2/ServiceProviderConfig
```

---

## CI/CD Setup

### 1. Configure GitHub Repository

Add the following secrets to your GitHub repository:
- Settings → Secrets and variables → Actions → New repository secret

**Required Secrets:**
- `GCP_PROJECT_ID` - Your GCP project ID
- `GCP_SA_KEY` - Contents of the service account JSON key file

### 2. Configure Environments

Create two environments in GitHub:
- **staging** - Auto-deploys from `develop` branch
- **production** - Requires manual approval, deploys from `main` branch

Settings → Environments → New environment

For **production** environment:
- Add required reviewers (team members who can approve deployments)
- Set deployment protection rules

### 3. Test CI/CD Pipeline

```bash
# Create develop branch
git checkout -b develop

# Make a change
echo "# Test" >> README.md
git add README.md
git commit -m "test: trigger CI/CD"

# Push to trigger staging deployment
git push origin develop

# Check GitHub Actions tab for workflow status
```

---

## Staging vs Production

### Staging Environment
- **URL**: `https://phishlogic-staging.run.app`
- **Branch**: `develop`
- **Deployment**: Automatic on push
- **Database**: Separate staging database
- **Secrets**: `*-staging` versions
- **Purpose**: Testing before production

### Production Environment
- **URL**: `https://phishlogic.run.app`
- **Branch**: `main`
- **Deployment**: Manual approval required
- **Database**: Production database
- **Secrets**: `*-prod` versions
- **Purpose**: Live environment

### Promotion Workflow

```bash
# 1. Develop feature on feature branch
git checkout -b feature/new-feature
# ... make changes ...
git commit -m "feat: add new feature"

# 2. Merge to develop (triggers staging deployment)
git checkout develop
git merge feature/new-feature
git push origin develop

# 3. Test in staging
# Visit https://phishlogic-staging.run.app

# 4. Promote to production (requires approval)
git checkout main
git merge develop
git push origin main
# Approve deployment in GitHub Actions
```

---

## Monitoring & Logging

### View Logs

```bash
# Stream logs
gcloud run services logs tail phishlogic \
  --platform managed \
  --region us-central1

# View recent logs
gcloud run services logs read phishlogic \
  --platform managed \
  --region us-central1 \
  --limit 50
```

### Cloud Monitoring

Visit Google Cloud Console:
1. Cloud Run → phishlogic service
2. Metrics tab shows:
   - Request count
   - Request latency
   - Container instance count
   - CPU utilization
   - Memory utilization

### Set Up Alerts

```bash
# Create alert policy for high error rate
# (Use Cloud Console or gcloud alpha commands)
```

---

## Troubleshooting

### Service Won't Start

```bash
# Check logs for errors
gcloud run services logs read phishlogic --limit 100

# Common issues:
# - Missing environment variables
# - Database connection failure
# - Missing secrets
# - Invalid container image
```

### Database Connection Issues

```bash
# Test database connectivity
gcloud sql connect phishlogic-db --user=phishlogic

# Check SSL configuration
# Ensure DB_SSL=true for Cloud SQL
# Ensure proper SSL certificates for external DB
```

### Secret Access Denied

```bash
# Verify service account has access
gcloud secrets get-iam-policy db-password-prod

# Grant access if missing
gcloud secrets add-iam-policy-binding db-password-prod \
  --member="serviceAccount:SERVICE_ACCOUNT" \
  --role="roles/secretmanager.secretAccessor"
```

### High Latency

```bash
# Check resource limits
gcloud run services describe phishlogic \
  --format='value(spec.template.spec.containers[0].resources)'

# Increase resources if needed
gcloud run services update phishlogic \
  --memory 4Gi \
  --cpu 4
```

### CORS Issues

```bash
# Update CORS_ORIGIN environment variable
gcloud run services update phishlogic \
  --update-env-vars CORS_ORIGIN="https://mail.google.com,chrome-extension://*"
```

---

## Rollback

### Rollback to Previous Revision

```bash
# List revisions
gcloud run revisions list --service phishlogic

# Rollback to specific revision
gcloud run services update-traffic phishlogic \
  --to-revisions REVISION_NAME=100
```

### Rollback in CI/CD

1. Revert the problematic commit in git
2. Push to trigger new deployment
3. Or manually deploy previous Docker image

---

## Cost Optimization

### Reduce Costs

```bash
# Set minimum instances to 0 (cold starts acceptable)
gcloud run services update phishlogic --min-instances 0

# Use smaller instance size
gcloud run services update phishlogic \
  --memory 1Gi \
  --cpu 1

# Set request timeout
gcloud run services update phishlogic --timeout 30s
```

### Monitor Costs

- Visit Cloud Console → Billing → Reports
- Set budget alerts
- Monitor request volume

---

## Security Best Practices

1. ✅ Use Secret Manager for all secrets
2. ✅ Enable SSL for database connections
3. ✅ Run containers as non-root user (already configured in Dockerfile)
4. ✅ Use least-privilege service accounts
5. ✅ Enable VPC connector for Cloud SQL (recommended)
6. ✅ Implement rate limiting in application
7. ✅ Keep dependencies updated (`npm audit`)
8. ✅ Monitor security advisories
9. ✅ Use environment-specific secrets
10. ✅ Review access logs regularly

---

## Next Steps

After deployment:

1. Configure custom domain (optional)
2. Set up CDN with Cloud Load Balancer (optional)
3. Configure backup strategy for database
4. Implement monitoring dashboards
5. Set up alerting for critical errors
6. Document API endpoints
7. Create runbooks for common issues
8. Train team on deployment process

---

## Support

For deployment issues:
- Check GitHub Actions logs
- Review Cloud Run logs
- Consult Cloud Run documentation: https://cloud.google.com/run/docs

For application issues:
- Check application logs
- Review database connection status
- Verify environment variables are set correctly
