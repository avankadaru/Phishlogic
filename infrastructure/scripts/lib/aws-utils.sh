#!/bin/bash
# AWS utility functions
# Usage: source scripts/lib/aws-utils.sh

# Source dependencies from same directory
LIB_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$LIB_DIR/logger.sh"
source "$LIB_DIR/error-handler.sh"

# Check AWS credentials
check_aws_credentials() {
  log_info "Verifying AWS credentials..."

  if ! aws sts get-caller-identity &>/dev/null; then
    log_fatal "AWS credentials not configured or invalid. Please run 'aws configure sso' or 'aws configure'"
  fi

  local account_id=$(aws sts get-caller-identity --query Account --output text 2>/dev/null)
  local arn=$(aws sts get-caller-identity --query Arn --output text 2>/dev/null)

  log_info "✓ AWS Account ID: $account_id"
  log_debug "ARN: $arn"

  echo "$account_id"
}

# Verify AWS region
check_aws_region() {
  local region=${1:-$AWS_REGION}

  if [ -z "$region" ]; then
    log_fatal "AWS region not specified. Set AWS_REGION environment variable"
  fi

  log_info "Using AWS region: $region"

  # Verify region exists
  if ! aws ec2 describe-regions --region-names "$region" &>/dev/null; then
    log_fatal "Invalid AWS region: $region"
  fi

  log_info "✓ AWS region validated: $region"
}

# Check if S3 bucket exists
s3_bucket_exists() {
  local bucket=$1
  aws s3 ls "s3://$bucket" &>/dev/null
}

# Create S3 bucket for Terraform state
create_state_bucket() {
  local bucket=$1
  local region=${2:-us-east-1}

  log_info "Creating S3 bucket for Terraform state: $bucket"

  if s3_bucket_exists "$bucket"; then
    log_info "✓ Bucket already exists: $bucket"
    return 0
  fi

  if [ "$region" = "us-east-1" ]; then
    aws s3 mb "s3://$bucket" --region "$region" || return 1
  else
    aws s3 mb "s3://$bucket" --region "$region" --create-bucket-configuration LocationConstraint="$region" || return 1
  fi

  # Enable versioning
  aws s3api put-bucket-versioning \
    --bucket "$bucket" \
    --versioning-configuration Status=Enabled || return 1

  # Enable encryption
  aws s3api put-bucket-encryption \
    --bucket "$bucket" \
    --server-side-encryption-configuration '{
      "Rules": [{
        "ApplyServerSideEncryptionByDefault": {
          "SSEAlgorithm": "AES256"
        }
      }]
    }' || return 1

  log_info "✓ S3 bucket created successfully"
}

# Check if DynamoDB table exists
dynamodb_table_exists() {
  local table=$1
  aws dynamodb describe-table --table-name "$table" &>/dev/null
}

# Create DynamoDB table for Terraform state locking
create_lock_table() {
  local table=$1

  log_info "Creating DynamoDB table for state locking: $table"

  if dynamodb_table_exists "$table"; then
    log_info "✓ Table already exists: $table"
    return 0
  fi

  aws dynamodb create-table \
    --table-name "$table" \
    --attribute-definitions AttributeName=LockID,AttributeType=S \
    --key-schema AttributeName=LockID,KeyType=HASH \
    --billing-mode PAY_PER_REQUEST || return 1

  log_info "✓ DynamoDB table created successfully"
}

# Generate random secret
generate_secret() {
  openssl rand -base64 32 | tr -d "=+/" | cut -c1-32
}
