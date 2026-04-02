# Admin Access

## Production Admin Credentials

The admin password for the production environment is stored securely in AWS Secrets Manager.

### How to Get Admin Password

```bash
aws secretsmanager get-secret-value \
  --secret-id "phishlogic/prod/admin-password" \
  --region us-east-1 \
  --query SecretString \
  --output text
```

**Current credentials:**
- Username: `admin`
- Password: Retrieved from AWS Secrets Manager (see command above)

### Login Endpoints

**Production API:**
```bash
curl -X POST http://phishlogic-prod-alb-1698854828.us-east-1.elb.amazonaws.com/api/auth/login/admin \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"<password-from-secrets-manager>"}'
```

**Admin UI (Local Development):**
1. Ensure `.env.local` is configured with:
   ```
   VITE_API_BASE_URL=http://phishlogic-prod-alb-1698854828.us-east-1.elb.amazonaws.com
   ```
2. Start admin UI: `cd admin-ui && npm run dev`
3. Open: http://localhost:5173
4. Login with admin credentials

## Required AWS Permissions

To retrieve the admin password from Secrets Manager, you need the following IAM permissions:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": "secretsmanager:GetSecretValue",
      "Resource": "arn:aws:secretsmanager:us-east-1:529088285632:secret:phishlogic/prod/admin-password-*"
    }
  ]
}
```

## Password Reset Process

If you need to reset the admin password:

### 1. Generate New Password Hash

```bash
node -e "
const bcrypt = require('bcrypt');
const password = 'YourNewPassword123!';
const hash = bcrypt.hashSync(password, 10);
console.log('Password:', password);
console.log('Hash:', hash);
"
```

### 2. Update Secrets Manager

```bash
aws secretsmanager update-secret \
  --secret-id "phishlogic/prod/admin-password" \
  --secret-string "YourNewPassword123!" \
  --region us-east-1
```

### 3. Update Database

Run a one-off ECS task to update the database:

```bash
# Get network configuration
NETWORK_CONFIG=$(aws ecs describe-services \
  --cluster phishlogic-prod \
  --services phishlogic-prod \
  --region us-east-1 \
  --query 'services[0].networkConfiguration.awsvpcConfiguration' \
  --output json)

# Run one-off task (replace <hash> with the bcrypt hash from step 1)
aws ecs run-task \
  --cluster phishlogic-prod \
  --task-definition phishlogic-prod:8 \
  --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={subnets=[subnet-09e3108632820d686,subnet-0910da522125c5cc2],securityGroups=[sg-0f5ef4e7ae71e9e04],assignPublicIp=DISABLED}" \
  --overrides '{
    "containerOverrides": [{
      "name": "phishlogic",
      "command": [
        "node",
        "-e",
        "const {query} = require(\"./dist/infrastructure/database/client.js\"); query(\"UPDATE admin_users SET password_hash = $1, updated_at = NOW() WHERE username = $2\", [\"<hash>\", \"admin\"]).then(r => {console.log(\"Updated:\", r.rowCount); process.exit(0);}).catch(e => {console.error(\"Error:\", e.message); process.exit(1);});"
      ]
    }]
  }' \
  --region us-east-1
```

### 4. Verify New Password

```bash
PASSWORD=$(aws secretsmanager get-secret-value \
  --secret-id "phishlogic/prod/admin-password" \
  --region us-east-1 \
  --query SecretString \
  --output text)

curl -X POST http://phishlogic-prod-alb-1698854828.us-east-1.elb.amazonaws.com/api/auth/login/admin \
  -H "Content-Type: application/json" \
  -d "{\"username\":\"admin\",\"password\":\"$PASSWORD\"}" | jq '.success'
```

Expected output: `true`

## Security Notes

- Never commit passwords to git
- Never share passwords via email or Slack
- Always use Secrets Manager to retrieve production credentials
- Rotate passwords periodically (recommended: every 90 days)
- All password access is logged in CloudTrail for audit purposes

## Cost

AWS Secrets Manager pricing:
- $0.40 per secret per month
- $0.05 per 10,000 API calls

Expected monthly cost: ~$0.40
