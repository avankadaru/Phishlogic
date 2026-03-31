/**
 * PhishLogic Browser Extension - Shared Utilities
 * Common functions used across background and popup scripts
 */

/**
 * Generate unique analysis ID
 * @returns {string} Analysis ID (format: pl_xxxxxxxxxxxxx)
 */
function generateAnalysisId() {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 15);
  return `pl_${timestamp}${random}`;
}

/**
 * Format duration in milliseconds to human-readable string
 * @param {number} ms - Duration in milliseconds
 * @returns {string} Formatted duration (e.g., "3.45s", "1m 23s")
 */
function formatDuration(ms) {
  if (ms < 1000) {
    return `${ms}ms`;
  }

  const seconds = Math.floor(ms / 1000);
  const milliseconds = Math.floor(ms % 1000);

  if (seconds < 60) {
    if (milliseconds === 0) {
      return `${seconds}s`;
    }
    return `${seconds}.${Math.floor(milliseconds / 100)}s`;
  }

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds}s`;
}

/**
 * Get user-friendly error message from API error
 * @param {Error} error - Error object
 * @param {number} [status] - HTTP status code
 * @returns {string} User-friendly error message
 */
function getApiErrorMessage(error, status) {
  // Timeout error
  if (error.name === 'AbortError' || error.message.includes('timeout')) {
    return 'Analysis timed out after 50 seconds. The URL may be slow to respond or unreachable.';
  }

  // Network errors
  if (error.message.includes('fetch') || error.message.includes('network')) {
    return 'Cannot connect to PhishLogic API. Please check your internet connection and API endpoint in settings.';
  }

  // HTTP status errors
  if (status) {
    switch (status) {
      case 400:
        return 'Invalid URL format. Please check the URL and try again.';
      case 401:
        return 'Authentication required. Please configure your API key in settings.';
      case 403:
        return 'Access denied. Your API key may be invalid or expired.';
      case 404:
        return 'API endpoint not found. Please check your API endpoint in settings.';
      case 429:
        return 'Too many requests. Please wait a moment and try again.';
      case 500:
        return 'Server error. Please try again later.';
      case 503:
        return 'Service temporarily unavailable. Please try again later.';
      default:
        return `API error (${status}). Please try again.`;
    }
  }

  // Generic error
  return error.message || 'An unexpected error occurred. Please try again.';
}

/**
 * Truncate string to max length
 * @param {string} str - String to truncate
 * @param {number} maxLength - Maximum length
 * @returns {string} Truncated string with ellipsis
 */
function truncateString(str, maxLength) {
  if (!str || str.length <= maxLength) return str;
  return str.substring(0, maxLength - 3) + '...';
}

/**
 * Format timestamp to human-readable string
 * @param {string|Date} timestamp - ISO timestamp or Date object
 * @returns {string} Formatted timestamp
 */
function formatTimestamp(timestamp) {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  // Less than 1 minute ago
  if (diffMins < 1) {
    return 'Just now';
  }

  // Less than 1 hour ago
  if (diffMins < 60) {
    return `${diffMins} minute${diffMins === 1 ? '' : 's'} ago`;
  }

  // Less than 24 hours ago
  if (diffHours < 24) {
    return `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`;
  }

  // Less than 7 days ago
  if (diffDays < 7) {
    return `${diffDays} day${diffDays === 1 ? '' : 's'} ago`;
  }

  // Older: show full date
  return date.toLocaleDateString();
}

/**
 * Copy text to clipboard
 * @param {string} text - Text to copy
 * @returns {Promise<boolean>} Success status
 */
async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (error) {
    console.error('Failed to copy to clipboard:', error);
    return false;
  }
}

// Export for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    generateAnalysisId,
    formatDuration,
    getApiErrorMessage,
    truncateString,
    formatTimestamp,
    copyToClipboard,
  };
}
