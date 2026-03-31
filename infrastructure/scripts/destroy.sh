#!/bin/bash
# One-Click Teardown Script for PhishLogic AWS Infrastructure
# Usage: ./scripts/destroy.sh

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

# Cleanup function (called on error or exit)
cleanup() {
  log_debug "Cleanup completed"
}

# Main teardown function
main() {
  log_section "PhishLogic AWS Infrastructure Teardown"
  log_warn "WARNING: This will destroy ALL infrastructure!"
  log_warn "Starting teardown at $(date)"
  echo ""

  # Step 1: Load configuration
  log_section "Step 1/5: Loading Configuration"
  if [ -f "$CONFIG_FILE" ]; then
    source "$CONFIG_FILE"
    log_info "✓ Loaded configuration from: $CONFIG_FILE"
  else
    log_warn "Configuration file not found: $CONFIG_FILE (using environment variables)"
  fi

  # Set defaults
  AWS_REGION="${AWS_REGION:-us-east-1}"
  AWS_ACCOUNT_ID="${AWS_ACCOUNT_ID:-529088285632}"
  PROJECT_NAME="${PROJECT_NAME:-phishlogic}"
  ENVIRONMENT="${ENVIRONMENT:-prod}"

  log_info "AWS Region: $AWS_REGION"
  log_info "AWS Account: $AWS_ACCOUNT_ID"
  log_info "Project: $PROJECT_NAME"
  log_info "Environment: $ENVIRONMENT"
  echo ""

  # Step 2: Verify AWS credentials
  log_section "Step 2/5: Verifying AWS Credentials"
  CURRENT_ACCOUNT=$(check_aws_credentials)

  if [ "$CURRENT_ACCOUNT" != "$AWS_ACCOUNT_ID" ]; then
    log_error "AWS account mismatch!"
    log_error "Expected: $AWS_ACCOUNT_ID"
    log_error "Current: $CURRENT_ACCOUNT"
    log_fatal "Please configure AWS CLI with the correct account credentials"
  fi

  check_aws_region "$AWS_REGION"
  log_info "✓ AWS credentials verified"
  echo ""

  # Step 3: Show what will be destroyed
  log_section "Step 3/5: Resources to be Destroyed"
  cd "$TERRAFORM_DIR"

  if [ ! -f "terraform.tfstate" ]; then
    log_error "No terraform.tfstate found"
    log_fatal "Nothing to destroy (infrastructure not deployed or state file missing)"
  fi

  log_warn "The following resources will be DESTROYED:"
  log_warn "  ✗ ECS Fargate cluster and tasks"
  log_warn "  ✗ Application Load Balancer"
  log_warn "  ✗ RDS PostgreSQL database (DATA WILL BE LOST!)"
  log_warn "  ✗ VPC and networking"
  log_warn "  ✗ ECR repository (Docker images)"
  log_warn "  ✗ AWS Secrets (scheduled for deletion)"
  log_warn "  ✗ IAM roles and policies"
  log_warn "  ✗ CloudWatch log groups"
  echo ""
  log_error "⚠️  DATABASE DATA WILL BE PERMANENTLY DELETED!"
  log_error "⚠️  THIS CANNOT BE UNDONE!"
  echo ""

  # Step 4: Confirmation
  log_section "Step 4/5: Confirmation Required"
  echo ""
  read -p "Type 'DESTROY' to confirm destruction: " confirmation
  if [ "$confirmation" != "DESTROY" ]; then
    log_info "Teardown cancelled by user"
    exit 0
  fi
  echo ""

  read -p "Are you absolutely sure? Type 'yes' to proceed: " final_confirmation
  if [ "$final_confirmation" != "yes" ]; then
    log_info "Teardown cancelled by user"
    exit 0
  fi
  echo ""

  # Step 5: Destroy infrastructure
  log_section "Step 5/5: Destroying Infrastructure"
  log_warn "Destroying infrastructure..."

  if ! terraform destroy -auto-approve -var-file=terraform.tfvars; then
    log_error "Terraform destroy encountered errors"
    log_warn "Some resources may still exist. Check AWS Console."
    log_warn "To retry: cd $TERRAFORM_DIR && terraform destroy"
    exit 1
  fi

  log_info "✓ Infrastructure destroyed successfully"

  # Cleanup local files
  log_info "Cleaning up local files..."
  rm -f terraform.tfstate terraform.tfstate.backup
  rm -f .terraform.lock.hcl
  rm -rf .terraform/
  log_info "✓ Local state files removed"

  # Show cleanup notes
  log_section "Teardown Complete!"
  echo ""
  log_info "All infrastructure has been destroyed"
  log_info "Teardown completed at $(date)"
  echo ""

  log_section "Post-Teardown Notes"
  log_warn "AWS Secrets are scheduled for deletion (7-day recovery window)"
  log_warn "To immediately delete secrets (no recovery):"
  log_warn "  aws secretsmanager delete-secret --secret-id $PROJECT_NAME/$ENVIRONMENT/jwt-secret --force-delete-without-recovery --region $AWS_REGION"
  log_warn "  aws secretsmanager delete-secret --secret-id $PROJECT_NAME/$ENVIRONMENT/db-password --force-delete-without-recovery --region $AWS_REGION"
  log_warn "  aws secretsmanager delete-secret --secret-id $PROJECT_NAME/$ENVIRONMENT/scim-encryption-key --force-delete-without-recovery --region $AWS_REGION"
  echo ""
  log_info "To redeploy, run: ./scripts/deploy.sh"
  echo ""

  cd - > /dev/null
}

# Run main function
main "$@"
