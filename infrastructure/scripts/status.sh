#!/bin/bash
# Check Deployment Status Script
# Usage: ./scripts/status.sh

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

# Main status check function
main() {
  log_section "PhishLogic Infrastructure Status"
  log_info "Checking status at $(date)"
  echo ""

  # Load configuration
  if [ -f "$CONFIG_FILE" ]; then
    source "$CONFIG_FILE"
  fi

  # Set defaults
  AWS_REGION="${AWS_REGION:-us-east-1}"
  AWS_ACCOUNT_ID="${AWS_ACCOUNT_ID:-529088285632}"
  PROJECT_NAME="${PROJECT_NAME:-phishlogic}"
  ENVIRONMENT="${ENVIRONMENT:-prod}"

  # Check if infrastructure is deployed
  cd "$TERRAFORM_DIR"

  if [ ! -f "terraform.tfstate" ]; then
    log_warn "No terraform.tfstate found"
    log_warn "Infrastructure has not been deployed yet"
    log_info ""
    log_info "To deploy, run: ./scripts/deploy.sh"
    exit 0
  fi

  log_info "Infrastructure is deployed. Checking AWS resources..."
  echo ""

  # Get outputs from Terraform
  log_section "Terraform Outputs"
  if command -v terraform &> /dev/null; then
    terraform output 2>/dev/null || log_warn "Unable to read Terraform outputs"
  fi
  echo ""

  # Check AWS resources
  log_section "AWS Resources Status"

  # Check ECS Cluster
  log_info "ECS Cluster:"
  CLUSTER_NAME="${PROJECT_NAME}-${ENVIRONMENT}-cluster"
  if aws ecs describe-clusters --clusters "$CLUSTER_NAME" --region "$AWS_REGION" &> /dev/null; then
    CLUSTER_STATUS=$(aws ecs describe-clusters --clusters "$CLUSTER_NAME" --region "$AWS_REGION" \
      --query 'clusters[0].status' --output text 2>/dev/null || echo "UNKNOWN")
    RUNNING_TASKS=$(aws ecs describe-clusters --clusters "$CLUSTER_NAME" --region "$AWS_REGION" \
      --query 'clusters[0].runningTasksCount' --output text 2>/dev/null || echo "0")

    log_info "  Cluster: $CLUSTER_NAME"
    log_info "  Status: $CLUSTER_STATUS"
    log_info "  Running Tasks: $RUNNING_TASKS"
  else
    log_warn "  ECS cluster not found: $CLUSTER_NAME"
  fi
  echo ""

  # Check ECS Service
  log_info "ECS Service:"
  SERVICE_NAME="${PROJECT_NAME}-${ENVIRONMENT}-service"
  if aws ecs describe-services --cluster "$CLUSTER_NAME" --services "$SERVICE_NAME" --region "$AWS_REGION" &> /dev/null; then
    SERVICE_STATUS=$(aws ecs describe-services --cluster "$CLUSTER_NAME" --services "$SERVICE_NAME" --region "$AWS_REGION" \
      --query 'services[0].status' --output text 2>/dev/null || echo "UNKNOWN")
    DESIRED_COUNT=$(aws ecs describe-services --cluster "$CLUSTER_NAME" --services "$SERVICE_NAME" --region "$AWS_REGION" \
      --query 'services[0].desiredCount' --output text 2>/dev/null || echo "0")
    RUNNING_COUNT=$(aws ecs describe-services --cluster "$CLUSTER_NAME" --services "$SERVICE_NAME" --region "$AWS_REGION" \
      --query 'services[0].runningCount' --output text 2>/dev/null || echo "0")

    log_info "  Service: $SERVICE_NAME"
    log_info "  Status: $SERVICE_STATUS"
    log_info "  Desired: $DESIRED_COUNT"
    log_info "  Running: $RUNNING_COUNT"

    if [ "$RUNNING_COUNT" != "$DESIRED_COUNT" ]; then
      log_warn "  ⚠️  Running count does not match desired count"
    fi
  else
    log_warn "  ECS service not found: $SERVICE_NAME"
  fi
  echo ""

  # Check RDS Instance
  log_info "RDS Database:"
  DB_INSTANCE_ID="${PROJECT_NAME}-${ENVIRONMENT}"
  if aws rds describe-db-instances --db-instance-identifier "$DB_INSTANCE_ID" --region "$AWS_REGION" &> /dev/null 2>&1; then
    DB_STATUS=$(aws rds describe-db-instances --db-instance-identifier "$DB_INSTANCE_ID" --region "$AWS_REGION" \
      --query 'DBInstances[0].DBInstanceStatus' --output text 2>/dev/null || echo "UNKNOWN")
    DB_ENDPOINT=$(aws rds describe-db-instances --db-instance-identifier "$DB_INSTANCE_ID" --region "$AWS_REGION" \
      --query 'DBInstances[0].Endpoint.Address' --output text 2>/dev/null || echo "N/A")

    log_info "  Instance: $DB_INSTANCE_ID"
    log_info "  Status: $DB_STATUS"
    log_info "  Endpoint: $DB_ENDPOINT"
  else
    log_warn "  RDS instance not found: $DB_INSTANCE_ID"
  fi
  echo ""

  # Check Load Balancer
  log_info "Application Load Balancer:"
  ALB_NAME="${PROJECT_NAME}-${ENVIRONMENT}-alb"
  if aws elbv2 describe-load-balancers --names "$ALB_NAME" --region "$AWS_REGION" &> /dev/null 2>&1; then
    ALB_STATE=$(aws elbv2 describe-load-balancers --names "$ALB_NAME" --region "$AWS_REGION" \
      --query 'LoadBalancers[0].State.Code' --output text 2>/dev/null || echo "UNKNOWN")
    ALB_DNS=$(aws elbv2 describe-load-balancers --names "$ALB_NAME" --region "$AWS_REGION" \
      --query 'LoadBalancers[0].DNSName' --output text 2>/dev/null || echo "N/A")

    log_info "  Load Balancer: $ALB_NAME"
    log_info "  State: $ALB_STATE"
    log_info "  DNS: $ALB_DNS"
    log_info "  URL: https://$ALB_DNS"
  else
    log_warn "  Load balancer not found: $ALB_NAME"
  fi
  echo ""

  # Check Target Group Health
  log_info "Target Group Health:"
  TG_NAME="${PROJECT_NAME}-${ENVIRONMENT}-tg"
  TG_ARN=$(aws elbv2 describe-target-groups --names "$TG_NAME" --region "$AWS_REGION" \
    --query 'TargetGroups[0].TargetGroupArn' --output text 2>/dev/null || echo "")

  if [ -n "$TG_ARN" ] && [ "$TG_ARN" != "None" ]; then
    HEALTHY_COUNT=$(aws elbv2 describe-target-health --target-group-arn "$TG_ARN" --region "$AWS_REGION" \
      --query 'length(TargetHealthDescriptions[?TargetHealth.State==`healthy`])' --output text 2>/dev/null || echo "0")
    UNHEALTHY_COUNT=$(aws elbv2 describe-target-health --target-group-arn "$TG_ARN" --region "$AWS_REGION" \
      --query 'length(TargetHealthDescriptions[?TargetHealth.State==`unhealthy`])' --output text 2>/dev/null || echo "0")

    log_info "  Healthy Targets: $HEALTHY_COUNT"
    log_info "  Unhealthy Targets: $UNHEALTHY_COUNT"

    if [ "$UNHEALTHY_COUNT" != "0" ]; then
      log_warn "  ⚠️  Some targets are unhealthy"
    fi
  else
    log_warn "  Target group not found: $TG_NAME"
  fi
  echo ""

  # Check ECR Repository
  log_info "ECR Repository:"
  ECR_REPO="${PROJECT_NAME}-${ENVIRONMENT}"
  if aws ecr describe-repositories --repository-names "$ECR_REPO" --region "$AWS_REGION" &> /dev/null 2>&1; then
    IMAGE_COUNT=$(aws ecr describe-images --repository-name "$ECR_REPO" --region "$AWS_REGION" \
      --query 'length(imageDetails)' --output text 2>/dev/null || echo "0")
    REPO_URI=$(aws ecr describe-repositories --repository-names "$ECR_REPO" --region "$AWS_REGION" \
      --query 'repositories[0].repositoryUri' --output text 2>/dev/null || echo "N/A")

    log_info "  Repository: $ECR_REPO"
    log_info "  Images: $IMAGE_COUNT"
    log_info "  URI: $REPO_URI"
  else
    log_warn "  ECR repository not found: $ECR_REPO"
  fi
  echo ""

  # Health check
  log_section "Application Health Check"
  if [ -n "$ALB_DNS" ] && [ "$ALB_DNS" != "N/A" ]; then
    HEALTH_URL="https://$ALB_DNS/health"
    log_info "Checking: $HEALTH_URL"

    if HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$HEALTH_URL" 2>/dev/null); then
      if [ "$HTTP_CODE" = "200" ]; then
        log_info "✓ Health check passed (HTTP $HTTP_CODE)"
      else
        log_warn "⚠️  Health check returned HTTP $HTTP_CODE"
      fi
    else
      log_warn "⚠️  Unable to reach health endpoint"
    fi
  else
    log_warn "ALB DNS not available, skipping health check"
  fi
  echo ""

  log_info "Status check completed at $(date)"

  cd - > /dev/null
}

# Run main function
main "$@"
