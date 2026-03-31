#!/bin/bash
# Error handling library
# Usage: source scripts/lib/error-handler.sh

# Get script directory (up 1 level from lib)
LIB_PARENT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Import logger (must be in same directory)
source "$(dirname "${BASH_SOURCE[0]}")/logger.sh"

# Error tracking
ERRORS=()
ERROR_COUNT=0

# Trap errors (Observer Pattern)
set -E  # Inherit ERR trap in functions
trap 'handle_error $? $LINENO "$BASH_COMMAND"' ERR

# Error handler
handle_error() {
  local exit_code=$1
  local line_number=$2
  local command=$3

  ERROR_COUNT=$((ERROR_COUNT + 1))
  ERRORS+=("Line $line_number: $command (exit code: $exit_code)")

  log_error "Error at line $line_number: $command"
  log_error "Exit code: $exit_code"

  # Call cleanup if defined
  if type cleanup &>/dev/null; then
    log_warn "Running cleanup..."
    cleanup
  fi
}

# Exit handler
trap 'handle_exit' EXIT

handle_exit() {
  local exit_code=$?

  if [ $exit_code -ne 0 ]; then
    log_error "Script failed with exit code: $exit_code"
    log_error "Total errors: $ERROR_COUNT"

    if [ ${#ERRORS[@]} -gt 0 ]; then
      log_error "Error summary:"
      for error in "${ERRORS[@]}"; do
        log_error "  - $error"
      done
    fi
  else
    log_info "Script completed successfully"
  fi
}

# Retry logic with exponential backoff (Template Method Pattern)
retry() {
  local max_attempts=$1
  local delay=$2
  local command="${@:3}"
  local attempt=1

  while [ $attempt -le $max_attempts ]; do
    log_debug "Attempt $attempt/$max_attempts: $command"

    if eval "$command"; then
      return 0
    fi

    if [ $attempt -lt $max_attempts ]; then
      log_warn "Attempt $attempt failed. Retrying in ${delay}s..."
      sleep $delay
      delay=$((delay * 2))  # Exponential backoff
    fi

    attempt=$((attempt + 1))
  done

  log_error "All $max_attempts attempts failed: $command"
  return 1
}

# Validation helpers
require_command() {
  local cmd=$1
  if ! command -v "$cmd" &> /dev/null; then
    log_fatal "Required command not found: $cmd"
  fi
}

require_var() {
  local var_name=$1
  if [ -z "${!var_name}" ]; then
    log_fatal "Required environment variable not set: $var_name"
  fi
}

require_file() {
  local file=$1
  if [ ! -f "$file" ]; then
    log_fatal "Required file not found: $file"
  fi
}
