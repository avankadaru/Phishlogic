# Secrets Module - AWS Secrets Manager
# Single Responsibility: Secrets management only

# JWT Secret
resource "aws_secretsmanager_secret" "jwt_secret" {
  name                    = "${var.project_name}/${var.environment}/jwt-secret"
  description             = "JWT secret for user authentication"
  recovery_window_in_days = 7

  tags = merge(
    var.tags,
    {
      Name = "${var.project_name}-${var.environment}-jwt-secret"
    }
  )
}

resource "aws_secretsmanager_secret_version" "jwt_secret" {
  secret_id     = aws_secretsmanager_secret.jwt_secret.id
  secret_string = var.jwt_secret
}

# Database Password
resource "aws_secretsmanager_secret" "db_password" {
  name                    = "${var.project_name}/${var.environment}/db-password"
  description             = "Database password for PostgreSQL"
  recovery_window_in_days = 7

  tags = merge(
    var.tags,
    {
      Name = "${var.project_name}-${var.environment}-db-password"
    }
  )
}

resource "aws_secretsmanager_secret_version" "db_password" {
  secret_id     = aws_secretsmanager_secret.db_password.id
  secret_string = var.db_password
}

# SCIM Encryption Key
resource "aws_secretsmanager_secret" "scim_encryption_key" {
  name                    = "${var.project_name}/${var.environment}/scim-encryption-key"
  description             = "SCIM encryption key for bearer tokens"
  recovery_window_in_days = 7

  tags = merge(
    var.tags,
    {
      Name = "${var.project_name}-${var.environment}-scim-key"
    }
  )
}

resource "aws_secretsmanager_secret_version" "scim_encryption_key" {
  secret_id     = aws_secretsmanager_secret.scim_encryption_key.id
  secret_string = var.scim_encryption_key
}

# OpenAI API Key (optional)
resource "aws_secretsmanager_secret" "openai_api_key" {
  count = var.openai_api_key != "" ? 1 : 0

  name                    = "${var.project_name}/${var.environment}/openai-api-key"
  description             = "OpenAI API key for AI-powered analysis"
  recovery_window_in_days = 7

  tags = merge(
    var.tags,
    {
      Name = "${var.project_name}-${var.environment}-openai-key"
    }
  )
}

resource "aws_secretsmanager_secret_version" "openai_api_key" {
  count = var.openai_api_key != "" ? 1 : 0

  secret_id     = aws_secretsmanager_secret.openai_api_key[0].id
  secret_string = var.openai_api_key
}
