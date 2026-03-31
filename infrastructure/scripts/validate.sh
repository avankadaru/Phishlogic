#!/bin/bash
# Pre-Deployment Validation Script
# Usage: ./scripts/validate.sh

set -euo pipefail

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Source shared libraries
source "$SCRIPT_DIR/lib/logger.sh"
source "$SCRIPT_DIR/lib/error-handler.sh"
source "$SCRIPT_DIR/lib/aws-utils.sh"

# Configuration
TERRAFORM_DIR="$PROJECT_ROOT/terraform"
CONFIG_FILE="$PROJECT_ROOT/config/defaults.env"
TFVARS_FILE="$TERRAFORM_DIR/terraform.tfvars"

# Validation counters
ERRORS=0
WARNINGS=0

# Track validation result
check() {
  local status=$1
  local message=$2

  if [ "$status" = "pass" ]; then
    log_info "✓ $message"
  elif [ "$status" = "fail" ]; then
    log_error "✗ $message"
    ERRORS=$((ERRORS + 1))
  elif [ "$status" = "warn" ]; then
    log_warn "⚠ $message"
    WARNINGS=$((WARNINGS + 1))
  fi
}

# Main validation function
main() {
  log_section "PhishLogic Infrastructure Validation"
  log_info "Starting validation at $(date)"
  echo ""

  # 1. Check required commands
  log_section "Checking Required Commands"

  if command -v terraform &> /dev/null; then
    TERRAFORM_VERSION=$(terraform version -json | grep -o '"terraform_version":"[^"]*"' | cut -d'"' -f4)
    check "pass" "terraform is installed (version: $TERRAFORM_VERSION)"
  else
    check "fail" "terraform is not installed"
  fi

  if command -v aws &> /dev/null; then
    AWS_CLI_VERSION=$(aws --version | cut -d' ' -f1 | cut -d'/' -f2)
    check "pass" "AWS CLI is installed (version: $AWS_CLI_VERSION)"
  else
    check "fail" "AWS CLI is not installed"
  fi

  if command -v docker &> /dev/null; then
    DOCKER_VERSION=$(docker --version | cut -d' ' -f3 | tr -d ',')
    check "pass" "Docker is installed (version: $DOCKER_VERSION)"
  else
    check "warn" "Docker is not installed (required for image build)"
  fi

  if command -v openssl &> /dev/null; then
    check "pass" "openssl is installed"
  else
    check "fail" "openssl is not installed (required for secret generation)"
  fi
  echo ""

  # 2. Check AWS credentials
  log_section "Checking AWS Configuration"

  if aws sts get-caller-identity &> /dev/null; then
    ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
    USER_ARN=$(aws sts get-caller-identity --query Arn --output text)

    check "pass" "AWS credentials are configured"
    log_info "  Account ID: $ACCOUNT_ID"
    log_info "  User ARN: $USER_ARN"

    if [ "$ACCOUNT_ID" = "529088285632" ]; then
      check "pass" "AWS account matches expected (529088285632)"
    else
      check "warn" "AWS account ($ACCOUNT_ID) does not match expected (529088285632)"
    fi
  else
    check "fail" "AWS credentials are not configured"
  fi

  CURRENT_REGION=$(aws configure get region 2>/dev/null || echo "not set")
  if [ "$CURRENT_REGION" = "us-east-1" ]; then
    check "pass" "AWS region is us-east-1"
  elif [ "$CURRENT_REGION" = "not set" ]; then
    check "warn" "AWS region not set (will use us-east-1 from environment)"
  else
    check "warn" "AWS region is $CURRENT_REGION (expected us-east-1)"
  fi
  echo ""

  # 3. Check configuration files
  log_section "Checking Configuration Files"

  if [ -f "$CONFIG_FILE" ]; then
    check "pass" "Configuration file exists: config/defaults.env"
  else
    check "warn" "Configuration file not found: config/defaults.env"
  fi

  if [ -f "$TERRAFORM_DIR/terraform.tfvars.example" ]; then
    check "pass" "Terraform example file exists"
  else
    check "fail" "Terraform example file not found"
  fi

  if [ -f "$TFVARS_FILE" ]; then
    check "pass" "terraform.tfvars exists"

    # Check for placeholder values
    if grep -q "REPLACE_WITH_GENERATED_SECRET" "$TFVARS_FILE" 2>/dev/null; then
      check "fail" "terraform.tfvars contains placeholder secrets (run ./scripts/init-secrets.sh)"
    else
      check "pass" "terraform.tfvars has been initialized with secrets"
    fi
  else
    check "warn" "terraform.tfvars not found (will be created during deployment)"
  fi
  echo ""

  # 4. Check Terraform configuration
  log_section "Checking Terraform Configuration"

  cd "$TERRAFORM_DIR"

  if [ -f "main.tf" ]; then
    check "pass" "Terraform main.tf exists"
  else
    check "fail" "Terraform main.tf not found"
  fi

  if [ -f "variables.tf" ]; then
    check "pass" "Terraform variables.tf exists"
  else
    check "fail" "Terraform variables.tf not found"
  fi

  if [ -f "outputs.tf" ]; then
    check "pass" "Terraform outputs.tf exists"
  else
    check "fail" "Terraform outputs.tf not found"
  fi

  # Count modules
  MODULE_COUNT=$(find modules -type f -name "main.tf" 2>/dev/null | wc -l | tr -d ' ')
  if [ "$MODULE_COUNT" -ge 6 ]; then
    check "pass" "Found $MODULE_COUNT Terraform modules"
  else
    check "warn" "Found only $MODULE_COUNT Terraform modules (expected 6)"
  fi

  cd - > /dev/null
  echo ""

  # 5. Check Terraform syntax
  log_section "Validating Terraform Syntax"

  cd "$TERRAFORM_DIR"

  if terraform fmt -check -recursive &> /dev/null; then
    check "pass" "Terraform files are properly formatted"
  else
    check "warn" "Terraform files need formatting (run: terraform fmt -recursive)"
  fi

  if [ -d ".terraform" ]; then
    check "pass" "Terraform has been initialized"

    if terraform validate &> /dev/null; then
      check "pass" "Terraform configuration is valid"
    else
      check "fail" "Terraform validation failed"
      log_debug "Run 'cd terraform && terraform validate' for details"
    fi
  else
    check "warn" "Terraform not initialized (run: cd terraform && terraform init)"
  fi

  cd - > /dev/null
  echo ""

  # 6. Check for existing infrastructure
  log_section "Checking Existing Infrastructure"

  if [ -f "$TERRAFORM_DIR/terraform.tfstate" ]; then
    check "warn" "Terraform state file exists (infrastructure may already be deployed)"
    log_info "  Run './scripts/destroy.sh' to tear down existing infrastructure"
  else
    check "pass" "No existing state file (ready for fresh deployment)"
  fi
  echo ""

  # 7. Summary
  log_section "Validation Summary"
  echo ""

  if [ $ERRORS -eq 0 ] && [ $WARNINGS -eq 0 ]; then
    log_info "✅ All checks passed! Ready for deployment."
    log_info ""
    log_info "To deploy, run: ./scripts/deploy.sh"
    EXIT_CODE=0
  elif [ $ERRORS -eq 0 ]; then
    log_warn "⚠️  Validation passed with $WARNINGS warning(s)"
    log_warn ""
    log_warn "Review warnings above before deploying"
    log_warn "To deploy, run: ./scripts/deploy.sh"
    EXIT_CODE=0
  else
    log_error "❌ Validation failed with $ERRORS error(s) and $WARNINGS warning(s)"
    log_error ""
    log_error "Fix errors above before deploying"
    EXIT_CODE=1
  fi

  echo ""
  log_info "Validation completed at $(date)"
  exit $EXIT_CODE
}

# Run main function
main "$@"
