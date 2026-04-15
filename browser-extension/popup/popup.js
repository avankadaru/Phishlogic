// PhishLogic Browser Extension - Popup Script
// Utilities are loaded from ../utils.js in popup.html

// DOM Elements
const statusDot = document.getElementById('statusDot');
const statusText = document.getElementById('statusText');
const historyList = document.getElementById('historyList');
const clearBtn = document.getElementById('clearBtn');
const settingsBtn = document.getElementById('settingsBtn');
const settingsModal = document.getElementById('settingsModal');
const closeModal = document.getElementById('closeModal');
const cancelBtn = document.getElementById('cancelBtn');
const saveBtn = document.getElementById('saveBtn');
const apiEndpointInput = document.getElementById('apiEndpoint');
const safeCount = document.getElementById('safeCount');
const suspiciousCount = document.getElementById('suspiciousCount');
const maliciousCount = document.getElementById('maliciousCount');

// Initialize popup
document.addEventListener('DOMContentLoaded', async () => {
  await checkApiStatus();
  await loadHistory();
  await loadSettings();
  setupEventListeners();
});

// Check API connection status
async function checkApiStatus() {
  try {
    const { apiEndpoint = 'http://localhost:3000' } = await chrome.storage.sync.get('apiEndpoint');

    const response = await fetch(`${apiEndpoint}/health`, {
      method: 'GET',
      signal: AbortSignal.timeout(3000) // 3 second timeout
    });

    if (response.ok) {
      setStatus('connected', 'Connected');
    } else {
      setStatus('error', 'API Error');
    }
  } catch (error) {
    setStatus('disconnected', 'Disconnected');
  }
}

// Set connection status
function setStatus(status, text) {
  statusDot.className = `status-dot status-${status}`;
  statusText.textContent = text;
}

// Load analysis history
async function loadHistory() {
  const { history = [] } = await chrome.storage.local.get('history');

  if (history.length === 0) {
    historyList.innerHTML = `
      <div class="empty-state">
        <p>No analysis history yet</p>
        <p class="empty-hint">Right-click any link and select "Check for Phishing with PhishLogic"</p>
      </div>
    `;
    return;
  }

  // Calculate stats (exclude errors)
  const stats = history.reduce((acc, item) => {
    if (!item.error) {
      acc[item.verdict.toLowerCase()]++;
    }
    return acc;
  }, { safe: 0, suspicious: 0, malicious: 0 });

  safeCount.textContent = stats.safe;
  suspiciousCount.textContent = stats.suspicious;
  maliciousCount.textContent = stats.malicious;

  // Render history items (last 10)
  const recentHistory = history.slice(0, 10);
  historyList.innerHTML = recentHistory
    .map(item => createHistoryItem(item))
    .join('');

  // Add copy button event listeners
  attachCopyListeners();
}

// Create history item HTML
function createHistoryItem(item) {
  const verdictClass = item.error ? 'error' : item.verdict.toLowerCase();
  const verdictIcon = item.error ? '❌' :
                      item.verdict === 'Malicious' ? '🔴' :
                      item.verdict === 'Suspicious' ? '🟡' : '🟢';
  const timestamp = formatTimestamp(item.timestamp);
  const truncatedUrl = truncateString(item.url, 50);
  const analysisIdShort = item.analysisId ? item.analysisId.substring(0, 13) : 'N/A';
  const processingTimeFormatted = item.processingTime ? formatDuration(item.processingTime) : 'N/A';

  return `
    <div class="history-item ${verdictClass}">
      <div class="history-header">
        <span class="verdict-icon">${verdictIcon}</span>
        <span class="verdict-label">${item.verdict}</span>
        <span class="score">Score: ${item.score}/10</span>
      </div>
      <div class="url" title="${item.url}">${truncatedUrl}</div>
      <div class="reasoning">${item.reasoning}</div>
      ${item.redFlags && item.redFlags.length > 0 && !item.error ? `
        <div class="red-flags">
          <strong>Signals:</strong>
          <ul>
            ${item.redFlags.slice(0, 3).map(flag => `<li>${flag.message || flag}</li>`).join('')}
          </ul>
        </div>
      ` : ''}
      <div class="analysis-info">
        <div class="analysis-id-section">
          <span class="analysis-id-label">ID:</span>
          <span class="analysis-id-value" title="${item.analysisId}">${analysisIdShort}...</span>
          <button class="btn-copy" data-analysis-id="${item.analysisId}" title="Copy Analysis ID">Copy</button>
        </div>
        <span class="processing-time">${processingTimeFormatted}</span>
      </div>
      <div class="timestamp">${timestamp}</div>
    </div>
  `;
}

// Attach copy button event listeners
function attachCopyListeners() {
  const copyButtons = document.querySelectorAll('.btn-copy');
  copyButtons.forEach(button => {
    button.addEventListener('click', async (e) => {
      const analysisId = e.target.getAttribute('data-analysis-id');
      const success = await copyToClipboard(analysisId);

      if (success) {
        e.target.textContent = '✓ Copied!';
        e.target.classList.add('copied');

        setTimeout(() => {
          e.target.textContent = 'Copy';
          e.target.classList.remove('copied');
        }, 2000);
      } else {
        e.target.textContent = '✗ Failed';
        setTimeout(() => {
          e.target.textContent = 'Copy';
        }, 2000);
      }
    });
  });
}

// Load settings
async function loadSettings() {
  const { apiEndpoint = 'http://localhost:3000' } = await chrome.storage.sync.get('apiEndpoint');
  apiEndpointInput.value = apiEndpoint;
}

// Setup event listeners
function setupEventListeners() {
  // Clear history
  clearBtn.addEventListener('click', async () => {
    if (confirm('Clear all analysis history?')) {
      await chrome.storage.local.set({ history: [] });
      await loadHistory();
    }
  });

  // Open settings modal
  settingsBtn.addEventListener('click', () => {
    settingsModal.style.display = 'flex';
  });

  // Close settings modal
  closeModal.addEventListener('click', () => {
    settingsModal.style.display = 'none';
  });

  cancelBtn.addEventListener('click', () => {
    settingsModal.style.display = 'none';
  });

  // Close modal on outside click
  settingsModal.addEventListener('click', (e) => {
    if (e.target === settingsModal) {
      settingsModal.style.display = 'none';
    }
  });

  // Save settings
  saveBtn.addEventListener('click', async () => {
    const endpoint = apiEndpointInput.value.trim();

    // Validate URL
    try {
      new URL(endpoint);
    } catch (error) {
      alert('Invalid URL format');
      return;
    }

    // Save to storage
    await chrome.storage.sync.set({ apiEndpoint: endpoint });
    settingsModal.style.display = 'none';

    // Recheck API status
    await checkApiStatus();
  });
}
