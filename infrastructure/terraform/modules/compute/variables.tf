# Compute Module Variables

variable "project_name" {
  description = "Project name"
  type        = string
}

variable "environment" {
  description = "Environment (dev, staging, prod)"
  type        = string
}

variable "private_subnet_ids" {
  description = "List of private subnet IDs for ECS tasks"
  type        = list(string)
}

variable "ecs_security_group_id" {
  description = "Security group ID for ECS tasks"
  type        = string
}

variable "target_group_arn" {
  description = "ALB target group ARN"
  type        = string
}

variable "execution_role_arn" {
  description = "ECS task execution role ARN"
  type        = string
}

variable "task_role_arn" {
  description = "ECS task role ARN"
  type        = string
}

variable "task_cpu" {
  description = "Task CPU units"
  type        = string
  default     = "1024"
}

variable "task_memory" {
  description = "Task memory (MB)"
  type        = string
  default     = "2048"
}

variable "desired_count" {
  description = "Desired number of tasks"
  type        = number
  default     = 2
}

variable "min_capacity" {
  description = "Minimum number of tasks"
  type        = number
  default     = 1
}

variable "max_capacity" {
  description = "Maximum number of tasks"
  type        = number
  default     = 10
}

variable "container_port" {
  description = "Container port"
  type        = number
  default     = 8080
}

variable "db_endpoint" {
  description = "Database endpoint"
  type        = string
}

variable "db_name" {
  description = "Database name"
  type        = string
}

variable "db_username" {
  description = "Database username"
  type        = string
}

variable "jwt_secret_arn" {
  description = "JWT secret ARN"
  type        = string
}

variable "db_password_arn" {
  description = "Database password secret ARN"
  type        = string
}

variable "scim_key_arn" {
  description = "SCIM encryption key ARN"
  type        = string
}

variable "cors_origins" {
  description = "CORS allowed origins"
  type        = string
  default     = "chrome-extension://*,https://mail.google.com"
}

variable "alb_dns_name" {
  description = "ALB DNS name for API_BASE_URL"
  type        = string
}

variable "tags" {
  description = "Resource tags"
  type        = map(string)
  default     = {}
}
