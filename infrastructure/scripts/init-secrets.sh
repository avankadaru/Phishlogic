#!/bin/bash
# Initialize secrets and create terraform.tfvars
# Usage: ./scripts/init-secrets.sh

set -euo pipefail

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Source shared libraries
source "$SCRIPT_DIR/lib/logger.sh"
source "$SCRIPT_DIR/lib/error-handler.sh"
source "$SCRIPT_DIR/lib/aws-utils.sh"

# Configuration
TF_DIR="$PROJECT_ROOT/terraform"
TFVARS_EXAMPLE="$TF_DIR/terraform.tfvars.example"
TFVARS_FILE="$TF_DIR/terraform.tfvars"

# Main function
main() {
  log_section "Initializing Secrets for PhishLogic"

  # Check if terraform.tfvars already exists
  if [ -f "$TFVARS_FILE" ]; then
    log_warn "terraform.tfvars already exists"
    read -p "Do you want to regenerate secrets? (yes/no): " regenerate
    if [ "$regenerate" != "yes" ]; then
      log_info "Keeping existing terraform.tfvars"
      exit 0
    fi
  fi

  # Generate secrets
  log_info "Generating secrets..."
  JWT_SECRET=$(generate_secret)
  DB_PASSWORD=$(generate_secret)
  SCIM_KEY=$(generate_secret)

  log_info "✓ Secrets generated"

  # Create terraform.tfvars from example
  log_info "Creating terraform.tfvars..."

  cp "$TFVARS_EXAMPLE" "$TFVARS_FILE"

  # Replace placeholders with generated secrets
  if [[ "$OSTYPE" == "darwin"* ]]; then
    # macOS
    sed -i '' "s|db_password.*=.*|db_password          = \"$DB_PASSWORD\"|" "$TFVARS_FILE"
    sed -i '' "s|jwt_secret.*=.*|jwt_secret           = \"$JWT_SECRET\"|" "$TFVARS_FILE"
    sed -i '' "s|scim_encryption_key.*=.*|scim_encryption_key  = \"$SCIM_KEY\"|" "$TFVARS_FILE"
  else
    # Linux
    sed -i "s|db_password.*=.*|db_password          = \"$DB_PASSWORD\"|" "$TFVARS_FILE"
    sed -i "s|jwt_secret.*=.*|jwt_secret           = \"$JWT_SECRET\"|" "$TFVARS_FILE"
    sed -i "s|scim_encryption_key.*=.*|scim_encryption_key  = \"$SCIM_KEY\"|" "$TFVARS_FILE"
  fi

  log_info "✓ terraform.tfvars created"

  # Security reminder
  log_section "Security Reminder"
  log_warn "terraform.tfvars contains sensitive secrets"
  log_warn "This file is gitignored and should NEVER be committed"
  log_warn "Store these secrets securely (password manager, vault, etc.)"

  log_section "Next Steps"
  log_info "1. Review terraform.tfvars and customize if needed"
  log_info "2. Run: cd terraform && terraform init"
  log_info "3. Run: cd terraform && terraform plan"
  log_info "4. Run: cd terraform && terraform apply"
  log_info ""
  log_info "Or use the deploy script:"
  log_info "  ./scripts/deploy.sh"
}

# Run main function
main "$@"
