# SSL/TLS Certificate Configuration

## Overview

PhishLogic validates SSL/TLS certificates for all outbound HTTPS connections (AI providers, external APIs, database connections). This is critical for security in production environments.

## Corporate Proxies & Self-Signed Certificates

If you're behind a corporate proxy that uses self-signed certificates, you'll see errors like:

```
SSL certificate error: self signed certificate in certificate chain
UNABLE_TO_VERIFY_LEAF_SIGNATURE
DEPTH_ZERO_SELF_SIGNED_CERT
```

**DO NOT** disable certificate validation by setting `NODE_TLS_REJECT_UNAUTHORIZED=0`. This is insecure and bypasses all SSL security.

## Proper Solution: NODE_EXTRA_CA_CERTS

### Step 1: Get Your Corporate CA Certificate

Contact your IT department to obtain the corporate CA certificate in PEM format:

```bash
# Example: Extract certificate from your corporate proxy
openssl s_client -showcerts -connect your-proxy.company.com:443 < /dev/null | \
  openssl x509 -outform PEM > corporate-ca.crt
```

Save this file securely, e.g., `/opt/certificates/corporate-ca.crt` or `~/.ssl/corporate-ca.crt`

### Step 2: Configure NODE_EXTRA_CA_CERTS

Set the environment variable to point to your CA certificate:

**For development (.env file):**
```bash
# DO NOT add to .env file (security risk)
# Set in your shell profile instead
```

**For shell (add to ~/.bashrc, ~/.zshrc, or ~/.bash_profile):**
```bash
export NODE_EXTRA_CA_CERTS="/path/to/corporate-ca.crt"
```

**For Docker:**
```dockerfile
# Copy certificate into container
COPY corporate-ca.crt /etc/ssl/certs/corporate-ca.crt

# Set environment variable
ENV NODE_EXTRA_CA_CERTS=/etc/ssl/certs/corporate-ca.crt
```

**For Cloud Run:**
```bash
# Add certificate as secret
gcloud secrets create corporate-ca-cert --data-file=corporate-ca.crt

# Mount in Cloud Run
gcloud run deploy phishlogic \
  --set-secrets=/etc/ssl/certs/corporate-ca.crt=corporate-ca-cert:latest \
  --update-env-vars NODE_EXTRA_CA_CERTS=/etc/ssl/certs/corporate-ca.crt
```

### Step 3: Restart Application

After setting `NODE_EXTRA_CA_CERTS`, restart your application:

```bash
npm run dev
```

Node.js will now trust certificates signed by your corporate CA.

## Database SSL Configuration

### Enable Database SSL

In `.env` file:
```bash
DB_SSL=true
```

### Database Certificate Verification

PhishLogic validates database SSL certificates with `rejectUnauthorized: true`. For databases using self-signed certificates:

1. **Option A**: Use NODE_EXTRA_CA_CERTS (recommended)
   - Add your database CA certificate to the file pointed to by NODE_EXTRA_CA_CERTS

2. **Option B**: Use Cloud SQL Connector (for Google Cloud SQL)
   - Cloud SQL Connector handles certificate validation automatically
   - No manual certificate configuration needed

3. **Option C**: Managed Database Services
   - Use managed databases (AWS RDS, Azure Database, Google Cloud SQL)
   - These use publicly-trusted certificates that work out-of-the-box

## Verification

### Test HTTPS Connections

```bash
# Test AI provider connection
curl https://api.openai.com/v1/models \
  -H "Authorization: Bearer $OPENAI_API_KEY"

# Test database connection
npm run dev
# Check logs for: "Database connection pool initialized"
```

### Check Certificate Chain

```bash
# Verify certificate validation is working
openssl s_client -connect api.openai.com:443 -CAfile /path/to/corporate-ca.crt
```

## Troubleshooting

### Error: "self signed certificate in certificate chain"

**Cause**: Your corporate proxy uses a self-signed certificate.

**Fix**: Configure NODE_EXTRA_CA_CERTS with your corporate CA certificate (see above).

### Error: "UNABLE_TO_VERIFY_LEAF_SIGNATURE"

**Cause**: Certificate chain is incomplete or corporate CA not trusted.

**Fix**:
1. Ensure NODE_EXTRA_CA_CERTS points to the correct CA certificate
2. Verify the certificate is in PEM format
3. Check file permissions (readable by application user)

### Error: "certificate has expired"

**Cause**: The certificate or CA certificate has expired.

**Fix**:
1. Get updated certificate from IT department
2. Update NODE_EXTRA_CA_CERTS to point to new certificate
3. Restart application

### Database Connection Fails with SSL

**Symptoms**: Connection works with `DB_SSL=false` but fails with `DB_SSL=true`.

**Fix**:
1. Check database server SSL configuration
2. Verify database certificate is valid
3. Use Cloud SQL Connector for managed databases
4. Add database CA to NODE_EXTRA_CA_CERTS

## Security Best Practices

### ✅ DO

- Use NODE_EXTRA_CA_CERTS for corporate certificates
- Keep CA certificates in a secure location with restricted permissions
- Validate all SSL/TLS certificates in production
- Use managed database services with built-in SSL
- Regularly update CA certificates before expiration

### ❌ DON'T

- Set NODE_TLS_REJECT_UNAUTHORIZED=0 (disables all SSL security)
- Use `rejectUnauthorized: false` in code
- Commit certificates to git repositories
- Use expired certificates
- Disable SSL validation in production

## Environment-Specific Configuration

### Development

```bash
# If behind corporate proxy
export NODE_EXTRA_CA_CERTS="$HOME/.ssl/corporate-ca.crt"
npm run dev
```

### Production (Cloud Run)

```bash
# Store certificate as secret
gcloud secrets create corporate-ca-cert --data-file=corporate-ca.crt

# Deploy with secret and env var
gcloud run deploy phishlogic \
  --set-secrets=/etc/ssl/certs/corporate-ca.crt=corporate-ca-cert:latest \
  --update-env-vars NODE_EXTRA_CA_CERTS=/etc/ssl/certs/corporate-ca.crt
```

### CI/CD (GitHub Actions)

```yaml
- name: Configure Corporate CA
  run: |
    echo "${{ secrets.CORPORATE_CA_CERT }}" > /tmp/corporate-ca.crt
    echo "NODE_EXTRA_CA_CERTS=/tmp/corporate-ca.crt" >> $GITHUB_ENV

- name: Run Tests
  run: npm test
```

## References

- [Node.js TLS Documentation](https://nodejs.org/api/tls.html)
- [PostgreSQL SSL Support](https://www.postgresql.org/docs/current/ssl-tcp.html)
- [Google Cloud SQL Connector](https://cloud.google.com/sql/docs/postgres/connect-instance-private-ip)

## Support

If you continue to have SSL certificate issues after following this guide:

1. Collect error logs (with sensitive data redacted)
2. Verify NODE_EXTRA_CA_CERTS is set correctly
3. Test certificate validation with `openssl s_client`
4. Contact your IT department for corporate CA certificate
5. File an issue with detailed error information
