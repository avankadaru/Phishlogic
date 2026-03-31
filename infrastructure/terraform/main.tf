# PhishLogic Infrastructure - Root Configuration
# Orchestrates all modules following Dependency Inversion Principle

terraform {
  required_version = ">= 1.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    tls = {
      source  = "hashicorp/tls"
      version = "~> 4.0"
    }
  }

  # Uncomment for remote state (after creating S3 bucket and DynamoDB table)
  # backend "s3" {
  #   bucket         = "phishlogic-terraform-state-529088285632"
  #   key            = "prod/terraform.tfstate"
  #   region         = "us-east-1"
  #   encrypt        = true
  #   dynamodb_table = "phishlogic-terraform-locks"
  # }
}

# Provider configuration
provider "aws" {
  region = var.aws_region

  default_tags {
    tags = var.tags
  }
}

# Data sources
data "aws_availability_zones" "available" {
  state = "available"
}

# Networking Module - Creates VPC, subnets, security groups
module "networking" {
  source = "./modules/networking"

  project_name         = var.project_name
  environment          = var.environment
  vpc_cidr             = var.vpc_cidr
  availability_zones   = var.availability_zones
  public_subnet_cidrs  = var.public_subnet_cidrs
  private_subnet_cidrs = var.private_subnet_cidrs
  container_port       = var.container_port
  tags                 = var.tags
}

# Secrets Module - Creates AWS Secrets Manager secrets
module "secrets" {
  source = "./modules/secrets"

  project_name        = var.project_name
  environment         = var.environment
  jwt_secret          = var.jwt_secret
  db_password         = var.db_password
  scim_encryption_key = var.scim_encryption_key
  openai_api_key      = var.openai_api_key
  tags                = var.tags
}

# IAM Module - Creates roles and policies
module "iam" {
  source = "./modules/iam"

  project_name = var.project_name
  environment  = var.environment
  secret_arns  = module.secrets.secret_arns
  tags         = var.tags

  depends_on = [module.secrets]
}

# Database Module - Creates RDS PostgreSQL
module "database" {
  source = "./modules/database"

  project_name               = var.project_name
  environment                = var.environment
  db_name                    = var.db_name
  db_username                = var.db_username
  db_password                = var.db_password
  db_instance_class          = var.db_instance_class
  db_allocated_storage       = var.db_allocated_storage
  db_multi_az                = var.db_multi_az
  db_backup_retention        = var.db_backup_retention
  private_subnet_ids         = module.networking.private_subnet_ids
  database_security_group_id = module.networking.database_security_group_id
  tags                       = var.tags

  depends_on = [module.networking]
}

# Load Balancer Module - Creates ALB
module "load_balancer" {
  source = "./modules/load-balancer"

  project_name          = var.project_name
  environment           = var.environment
  vpc_id                = module.networking.vpc_id
  public_subnet_ids     = module.networking.public_subnet_ids
  alb_security_group_id = module.networking.alb_security_group_id
  container_port        = var.container_port
  health_check_path     = var.health_check_path
  tags                  = var.tags

  depends_on = [module.networking]
}

# Compute Module - Creates ECS Fargate cluster and service
module "compute" {
  source = "./modules/compute"

  project_name          = var.project_name
  environment           = var.environment
  private_subnet_ids    = module.networking.private_subnet_ids
  ecs_security_group_id = module.networking.ecs_security_group_id
  target_group_arn      = module.load_balancer.target_group_arn
  execution_role_arn    = module.iam.ecs_task_execution_role_arn
  task_role_arn         = module.iam.ecs_task_role_arn
  task_cpu              = var.ecs_task_cpu
  task_memory           = var.ecs_task_memory
  desired_count         = var.ecs_desired_count
  min_capacity          = var.ecs_min_capacity
  max_capacity          = var.ecs_max_capacity
  container_port        = var.container_port
  db_endpoint           = module.database.db_endpoint
  db_name               = var.db_name
  db_username           = var.db_username
  jwt_secret_arn        = module.secrets.jwt_secret_arn
  db_password_arn       = module.secrets.db_password_arn
  scim_key_arn          = module.secrets.scim_encryption_key_arn
  cors_origins          = var.cors_origins
  alb_dns_name          = module.load_balancer.alb_dns_name
  tags                  = var.tags

  depends_on = [
    module.networking,
    module.iam,
    module.secrets,
    module.database,
    module.load_balancer
  ]
}
