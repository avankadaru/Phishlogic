# Docker Quick Start Guide

Get PhishLogic running in Docker in under 5 minutes.

## Prerequisites

- Docker Desktop installed and running
- Basic terminal/command line knowledge

## Option 1: Docker Compose (Recommended)

### Start Everything

```bash
# Clone and navigate to repo
cd /path/to/PhishLogic

# Start database + API
docker-compose up
```

That's it! The API will be available at `http://localhost:8080`

### Test It

```bash
# Health check
curl http://localhost:8080/health

# Analyze a URL
curl -X POST http://localhost:8080/api/v1/analyze/url \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com"}'
```

### Stop Everything

```bash
# Stop and remove containers
docker-compose down

# Stop and remove volumes (database data)
docker-compose down -v
```

## Option 2: Docker Only (No Database)

If you already have PostgreSQL running locally:

### Build the Image

```bash
docker build -t phishlogic:local .
```

### Run the Container

```bash
docker run -d \
  --name phishlogic-api \
  -p 8080:8080 \
  -e NODE_ENV=production \
  -e PORT=8080 \
  -e DB_HOST=host.docker.internal \
  -e DB_PORT=5432 \
  -e DB_NAME=Phishlogic \
  -e DB_USER=postgres \
  -e DB_PASSWORD=your_password \
  -e DB_SSL=false \
  -e JWT_SECRET=dev-jwt-secret-minimum-32-characters-long \
  phishlogic:local
```

### View Logs

```bash
docker logs -f phishlogic-api
```

### Stop the Container

```bash
docker stop phishlogic-api
docker rm phishlogic-api
```

## Troubleshooting

### Container Won't Start

```bash
# Check logs
docker logs phishlogic-api

# Common issues:
# - Database not accessible
# - Missing environment variables
# - Port 8080 already in use
```

### Can't Connect to Database

```bash
# Check if database container is running
docker ps | grep postgres

# Test database connection
docker exec -it phishlogic-db psql -U postgres -d Phishlogic
```

### Health Check Fails

```bash
# Wait 30 seconds for app to start
sleep 30

# Check health endpoint
curl http://localhost:8080/health

# If still failing, check logs
docker logs phishlogic-api
```

## Production Considerations

This Docker setup is for **local development/testing only**.

For production deployment:
- Use Google Cloud Run (see [DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md))
- Use managed database (Cloud SQL)
- Store secrets in Secret Manager
- Enable SSL/TLS
- Configure proper resource limits
- Set up monitoring and logging
- Implement backup strategy

## Next Steps

1. Test the API endpoints
2. Configure browser extension to use `http://localhost:8080`
3. Test Gmail Add-on with local API
4. Review [DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md) for production deployment
