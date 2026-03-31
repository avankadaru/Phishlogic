# Database Module Outputs

output "db_instance_id" {
  description = "Database instance ID"
  value       = aws_db_instance.main.id
}

output "db_instance_arn" {
  description = "Database instance ARN"
  value       = aws_db_instance.main.arn
}

output "db_endpoint" {
  description = "Database endpoint (hostname:port)"
  value       = aws_db_instance.main.endpoint
}

output "db_address" {
  description = "Database hostname"
  value       = aws_db_instance.main.address
}

output "db_port" {
  description = "Database port"
  value       = aws_db_instance.main.port
}

output "db_name" {
  description = "Database name"
  value       = aws_db_instance.main.db_name
}

output "db_username" {
  description = "Database username"
  value       = aws_db_instance.main.username
  sensitive   = true
}
