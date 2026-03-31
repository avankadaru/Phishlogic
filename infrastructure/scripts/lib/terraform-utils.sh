#!/bin/bash
# Terraform utility functions
# Usage: source scripts/lib/terraform-utils.sh

# Source dependencies from same directory
LIB_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$LIB_DIR/logger.sh"
source "$LIB_DIR/error-handler.sh"

# Get infrastructure root (up 2 levels from lib)
INFRA_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

# Terraform working directory
TF_DIR="${TF_DIR:-${INFRA_ROOT}/terraform}"

# Initialize Terraform
tf_init() {
  log_info "Initializing Terraform..."

  cd "$TF_DIR" || log_fatal "Terraform directory not found: $TF_DIR"

  if ! terraform init -upgrade; then
    log_fatal "Terraform init failed"
  fi

  log_info "✓ Terraform initialized successfully"
  cd - > /dev/null
}

# Validate Terraform configuration
tf_validate() {
  log_info "Validating Terraform configuration..."

  cd "$TF_DIR" || return 1

  if ! terraform validate; then
    log_error "Terraform validation failed"
    cd - > /dev/null
    return 1
  fi

  log_info "✓ Terraform configuration is valid"
  cd - > /dev/null
}

# Format Terraform files
tf_fmt() {
  log_info "Formatting Terraform files..."

  cd "$TF_DIR" || return 1

  terraform fmt -recursive

  log_info "✓ Terraform files formatted"
  cd - > /dev/null
}

# Plan Terraform changes
tf_plan() {
  local var_file=${1:-}
  local plan_file="tfplan"

  log_info "Planning Terraform changes..."

  cd "$TF_DIR" || return 1

  local cmd="terraform plan -out=$plan_file"
  if [ -n "$var_file" ]; then
    cmd="$cmd -var-file=$var_file"
  fi

  if ! $cmd; then
    log_error "Terraform plan failed"
    cd - > /dev/null
    return 1
  fi

  log_info "✓ Terraform plan saved to: $plan_file"
  cd - > /dev/null
}

# Apply Terraform changes
tf_apply() {
  local plan_file=${1:-tfplan}

  log_info "Applying Terraform changes..."

  cd "$TF_DIR" || return 1

  if [ ! -f "$plan_file" ]; then
    log_error "Plan file not found: $plan_file"
    cd - > /dev/null
    return 1
  fi

  if ! terraform apply "$plan_file"; then
    log_error "Terraform apply failed"
    cd - > /dev/null
    return 1
  fi

  log_info "✓ Terraform apply completed successfully"
  cd - > /dev/null
}

# Destroy Terraform resources
tf_destroy() {
  local var_file=${1:-}

  log_warn "Destroying Terraform resources..."

  cd "$TF_DIR" || return 1

  local cmd="terraform destroy -auto-approve"
  if [ -n "$var_file" ]; then
    cmd="$cmd -var-file=$var_file"
  fi

  if ! $cmd; then
    log_error "Terraform destroy failed"
    cd - > /dev/null
    return 1
  fi

  log_info "✓ Terraform destroy completed"
  cd - > /dev/null
}

# Get Terraform output
tf_output() {
  local output_name=$1

  cd "$TF_DIR" || return 1

  local value=$(terraform output -raw "$output_name" 2>/dev/null)

  cd - > /dev/null

  echo "$value"
}

# Show Terraform outputs
tf_show_outputs() {
  log_section "Deployment Outputs"

  cd "$TF_DIR" || return 1

  terraform output

  cd - > /dev/null
}
