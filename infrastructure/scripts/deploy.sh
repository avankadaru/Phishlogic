#!/bin/bash
# One-Click Deployment Script for PhishLogic AWS Infrastructure
# Usage: ./scripts/deploy.sh

set -euo pipefail

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Source shared libraries
source "$SCRIPT_DIR/lib/logger.sh"
source "$SCRIPT_DIR/lib/error-handler.sh"
source "$SCRIPT_DIR/lib/aws-utils.sh"
source "$SCRIPT_DIR/lib/terraform-utils.sh"

# Configuration
TERRAFORM_DIR="$PROJECT_ROOT/terraform"
CONFIG_FILE="$PROJECT_ROOT/config/defaults.env"
TFVARS_FILE="$TERRAFORM_DIR/terraform.tfvars"
TFVARS_EXAMPLE="$TERRAFORM_DIR/terraform.tfvars.example"

# Cleanup function (called on error or exit)
cleanup() {
  log_debug "Cleanup completed"
}

# Main deployment function
main() {
  log_section "PhishLogic AWS Infrastructure Deployment"
  log_info "Starting deployment at $(date)"

  # Step 1: Pre-flight checks
  log_section "Step 1/7: Pre-flight Checks"
  log_info "Checking required commands..."
  require_command "terraform"
  require_command "aws"
  require_command "openssl"
  log_info "✓ All required commands found"

  # Step 2: Load configuration
  log_section "Step 2/7: Loading Configuration"
  if [ -f "$CONFIG_FILE" ]; then
    source "$CONFIG_FILE"
    log_info "✓ Loaded configuration from: $CONFIG_FILE"
  else
    log_warn "Configuration file not found: $CONFIG_FILE (using environment variables)"
  fi

  # Set defaults if not provided
  AWS_REGION="${AWS_REGION:-us-east-1}"
  AWS_ACCOUNT_ID="${AWS_ACCOUNT_ID:-529088285632}"
  PROJECT_NAME="${PROJECT_NAME:-phishlogic}"
  ENVIRONMENT="${ENVIRONMENT:-prod}"

  log_info "AWS Region: $AWS_REGION"
  log_info "AWS Account: $AWS_ACCOUNT_ID"
  log_info "Project: $PROJECT_NAME"
  log_info "Environment: $ENVIRONMENT"

  # Step 3: Verify AWS credentials
  log_section "Step 3/7: Verifying AWS Credentials"
  CURRENT_ACCOUNT=$(check_aws_credentials)

  if [ "$CURRENT_ACCOUNT" != "$AWS_ACCOUNT_ID" ]; then
    log_error "AWS account mismatch!"
    log_error "Expected: $AWS_ACCOUNT_ID"
    log_error "Current: $CURRENT_ACCOUNT"
    log_fatal "Please configure AWS CLI with the correct account credentials"
  fi

  check_aws_region "$AWS_REGION"
  log_info "✓ AWS credentials verified"

  # Step 4: Initialize secrets (if terraform.tfvars doesn't exist)
  log_section "Step 4/7: Initializing Secrets"
  if [ ! -f "$TFVARS_FILE" ]; then
    log_info "terraform.tfvars not found, initializing secrets..."
    cd "$SCRIPT_DIR"
    ./init-secrets.sh
    cd - > /dev/null
  else
    log_info "✓ terraform.tfvars already exists"
  fi

  # Step 5: Initialize Terraform
  log_section "Step 5/7: Initializing Terraform"
  cd "$TERRAFORM_DIR"

  log_info "Running terraform init..."
  if ! terraform init -upgrade; then
    log_fatal "Terraform init failed"
  fi
  log_info "✓ Terraform initialized"

  log_info "Running terraform validate..."
  if ! terraform validate; then
    log_fatal "Terraform validation failed"
  fi
  log_info "✓ Terraform configuration is valid"

  log_info "Running terraform fmt..."
  terraform fmt -recursive
  log_info "✓ Terraform files formatted"

  # Step 6: Plan deployment
  log_section "Step 6/7: Planning Deployment"
  log_info "Generating deployment plan..."

  if ! terraform plan -out=tfplan -var-file=terraform.tfvars; then
    log_fatal "Terraform plan failed"
  fi

  log_info "✓ Deployment plan generated: tfplan"
  echo ""
  log_warn "Review the plan above. This will create:"
  log_warn "  - VPC with public/private subnets"
  log_warn "  - RDS PostgreSQL (Multi-AZ)"
  log_warn "  - ECS Fargate cluster and service"
  log_warn "  - Application Load Balancer (HTTPS)"
  log_warn "  - ECR repository"
  log_warn "  - AWS Secrets Manager secrets"
  log_warn "  - IAM roles and policies"
  log_warn "  - CloudWatch log groups"
  echo ""

  read -p "Proceed with deployment? (yes/no): " confirmation
  if [ "$confirmation" != "yes" ]; then
    log_info "Deployment cancelled by user"
    rm -f tfplan
    exit 0
  fi

  # Step 7: Apply deployment
  log_section "Step 7/7: Applying Deployment"
  log_info "Deploying infrastructure with retry logic (max 2 retries)..."

  if ! retry 2 30 "terraform apply -auto-approve tfplan"; then
    log_error "Terraform apply failed after 2 retry attempts"
    log_error "Check logs above for details"
    rm -f tfplan
    log_fatal "Deployment failed"
  fi

  rm -f tfplan
  log_info "✓ Infrastructure deployed successfully"

  # Show outputs
  log_section "Deployment Complete!"
  echo ""
  log_info "Here are your deployment details:"
  echo ""
  terraform output -json | python3 -m json.tool || terraform output
  echo ""

  # Show next steps
  log_section "Next Steps"
  log_info "1. Build and push Docker image:"
  log_info "   ECR_REPO=\$(cd $TERRAFORM_DIR && terraform output -raw ecr_repository_url)"
  log_info "   aws ecr get-login-password --region $AWS_REGION | docker login --username AWS --password-stdin \$ECR_REPO"
  log_info "   docker build -t \$ECR_REPO:latest ."
  log_info "   docker push \$ECR_REPO:latest"
  echo ""
  log_info "2. Update ECS service to use new image:"
  log_info "   CLUSTER=\$(cd $TERRAFORM_DIR && terraform output -raw ecs_cluster_name)"
  log_info "   SERVICE=\$(cd $TERRAFORM_DIR && terraform output -raw ecs_service_name)"
  log_info "   aws ecs update-service --cluster \$CLUSTER --service \$SERVICE --force-new-deployment --region $AWS_REGION"
  echo ""
  log_info "3. Check application health:"
  log_info "   APP_URL=\$(cd $TERRAFORM_DIR && terraform output -raw application_url)"
  log_info "   curl \$APP_URL/health"
  echo ""
  log_info "Deployment completed at $(date)"

  cd - > /dev/null
}

# Run main function
main "$@"
