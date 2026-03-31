# PhishLogic Infrastructure - Root Outputs

# Application Access
output "application_url" {
  description = "Application URL (HTTPS)"
  value       = "https://${module.load_balancer.alb_dns_name}"
}

output "health_check_url" {
  description = "Health check URL"
  value       = "https://${module.load_balancer.alb_dns_name}/health"
}

# Load Balancer
output "alb_dns_name" {
  description = "ALB DNS name"
  value       = module.load_balancer.alb_dns_name
}

output "alb_arn" {
  description = "ALB ARN"
  value       = module.load_balancer.alb_arn
}

# Database
output "rds_endpoint" {
  description = "RDS endpoint"
  value       = module.database.db_endpoint
  sensitive   = true
}

output "rds_address" {
  description = "RDS hostname"
  value       = module.database.db_address
  sensitive   = true
}

# ECS
output "ecs_cluster_name" {
  description = "ECS cluster name"
  value       = module.compute.ecs_cluster_name
}

output "ecs_service_name" {
  description = "ECS service name"
  value       = module.compute.ecs_service_name
}

output "ecr_repository_url" {
  description = "ECR repository URL"
  value       = module.compute.ecr_repository_url
}

# CloudWatch
output "cloudwatch_log_group" {
  description = "CloudWatch log group name"
  value       = module.compute.cloudwatch_log_group_name
}

# Deployment Commands
output "ecr_login_command" {
  description = "Command to authenticate Docker with ECR"
  value       = "aws ecr get-login-password --region ${var.aws_region} | docker login --username AWS --password-stdin ${module.compute.ecr_repository_url}"
}

output "docker_build_command" {
  description = "Command to build Docker image"
  value       = "docker build -t ${module.compute.ecr_repository_url}:latest ."
}

output "docker_push_command" {
  description = "Command to push Docker image to ECR"
  value       = "docker push ${module.compute.ecr_repository_url}:latest"
}

output "ecs_update_command" {
  description = "Command to force new ECS deployment"
  value       = "aws ecs update-service --cluster ${module.compute.ecs_cluster_name} --service ${module.compute.ecs_service_name} --force-new-deployment --region ${var.aws_region}"
}

# Summary
output "deployment_summary" {
  description = "Deployment summary"
  value = {
    application_url = "https://${module.load_balancer.alb_dns_name}"
    health_check    = "https://${module.load_balancer.alb_dns_name}/health"
    ecr_repository  = module.compute.ecr_repository_url
    ecs_cluster     = module.compute.ecs_cluster_name
    ecs_service     = module.compute.ecs_service_name
    cloudwatch_logs = module.compute.cloudwatch_log_group_name
    aws_region      = var.aws_region
    aws_account_id  = var.aws_account_id
  }
}
