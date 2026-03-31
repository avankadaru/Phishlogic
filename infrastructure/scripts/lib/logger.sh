#!/bin/bash
# Logging library with structured output
# Usage: source scripts/lib/logger.sh

# Prevent multiple sourcing
if [ -n "${LOGGER_SH_LOADED:-}" ]; then
  return 0
fi
LOGGER_SH_LOADED=1

# Log levels
readonly LOG_LEVEL_DEBUG=0
readonly LOG_LEVEL_INFO=1
readonly LOG_LEVEL_WARN=2
readonly LOG_LEVEL_ERROR=3
readonly LOG_LEVEL_FATAL=4

# Current log level (default: INFO)
LOG_LEVEL=${LOG_LEVEL:-$LOG_LEVEL_INFO}

# Determine infrastructure root directory (up 2 levels from lib)
INFRA_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

# Log file location
LOG_DIR="${LOG_DIR:-${INFRA_ROOT}/logs}"
mkdir -p "$LOG_DIR"
LOG_FILE="${LOG_FILE:-${LOG_DIR}/deploy-$(date +%Y-%m-%d-%H%M%S).log}"

# ANSI color codes
readonly COLOR_RESET='\033[0m'
readonly COLOR_DEBUG='\033[0;36m'    # Cyan
readonly COLOR_INFO='\033[0;32m'     # Green
readonly COLOR_WARN='\033[0;33m'     # Yellow
readonly COLOR_ERROR='\033[0;31m'    # Red
readonly COLOR_FATAL='\033[1;31m'    # Bold Red

# Log function (Strategy Pattern)
log() {
  local level=$1
  local message=$2
  local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
  local level_name=""
  local color=""

  case $level in
    $LOG_LEVEL_DEBUG) level_name="DEBUG"; color=$COLOR_DEBUG ;;
    $LOG_LEVEL_INFO)  level_name="INFO "; color=$COLOR_INFO ;;
    $LOG_LEVEL_WARN)  level_name="WARN "; color=$COLOR_WARN ;;
    $LOG_LEVEL_ERROR) level_name="ERROR"; color=$COLOR_ERROR ;;
    $LOG_LEVEL_FATAL) level_name="FATAL"; color=$COLOR_FATAL ;;
  esac

  # Only log if current level >= LOG_LEVEL
  if [ $level -ge $LOG_LEVEL ]; then
    # Console output (with colors)
    echo -e "${color}[${timestamp}] ${level_name}: ${message}${COLOR_RESET}"

    # File output (without colors)
    echo "[${timestamp}] ${level_name}: ${message}" >> "$LOG_FILE"
  fi
}

# Convenience functions
log_debug() { log $LOG_LEVEL_DEBUG "$1"; }
log_info()  { log $LOG_LEVEL_INFO "$1"; }
log_warn()  { log $LOG_LEVEL_WARN "$1"; }
log_error() { log $LOG_LEVEL_ERROR "$1"; }
log_fatal() { log $LOG_LEVEL_FATAL "$1"; exit 1; }

# Section markers for readability
log_section() {
  local title=$1
  log_info "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  log_info "  $title"
  log_info "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
}

# Command execution with logging
log_exec() {
  local cmd=$1
  log_debug "Executing: $cmd"

  if ! eval $cmd >> "$LOG_FILE" 2>&1; then
    log_error "Command failed: $cmd"
    return 1
  fi

  return 0
}
