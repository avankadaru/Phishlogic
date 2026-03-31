# Secrets Module Variables

variable "project_name" {
  description = "Project name"
  type        = string
}

variable "environment" {
  description = "Environment (dev, staging, prod)"
  type        = string
}

variable "jwt_secret" {
  description = "JWT secret for user authentication (min 32 characters)"
  type        = string
  sensitive   = true
}

variable "db_password" {
  description = "Database password (min 32 characters)"
  type        = string
  sensitive   = true
}

variable "scim_encryption_key" {
  description = "SCIM encryption key for bearer tokens (min 32 characters)"
  type        = string
  sensitive   = true
}

variable "openai_api_key" {
  description = "OpenAI API key (optional)"
  type        = string
  sensitive   = true
  default     = ""
}

variable "tags" {
  description = "Resource tags"
  type        = map(string)
  default     = {}
}
