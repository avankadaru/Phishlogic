# Secrets Module Outputs

output "jwt_secret_arn" {
  description = "ARN of JWT secret"
  value       = aws_secretsmanager_secret.jwt_secret.arn
}

output "db_password_arn" {
  description = "ARN of database password secret"
  value       = aws_secretsmanager_secret.db_password.arn
}

output "scim_encryption_key_arn" {
  description = "ARN of SCIM encryption key secret"
  value       = aws_secretsmanager_secret.scim_encryption_key.arn
}

output "openai_api_key_arn" {
  description = "ARN of OpenAI API key secret (if provided)"
  value       = var.openai_api_key != "" ? aws_secretsmanager_secret.openai_api_key[0].arn : null
}

output "secret_arns" {
  description = "List of all secret ARNs"
  value = concat(
    [
      aws_secretsmanager_secret.jwt_secret.arn,
      aws_secretsmanager_secret.db_password.arn,
      aws_secretsmanager_secret.scim_encryption_key.arn
    ],
    var.openai_api_key != "" ? [aws_secretsmanager_secret.openai_api_key[0].arn] : []
  )
}
