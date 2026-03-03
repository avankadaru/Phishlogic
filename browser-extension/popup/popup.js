// PhishLogic Browser Extension - Popup Script

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

  // Calculate stats
  const stats = history.reduce((acc, item) => {
    acc[item.verdict.toLowerCase()]++;
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
}

// Create history item HTML
function createHistoryItem(item) {
  const verdictClass = item.verdict.toLowerCase();
  const verdictIcon = item.verdict === 'Malicious' ? '🔴' :
                      item.verdict === 'Suspicious' ? '🟡' : '🟢';
  const timestamp = new Date(item.timestamp).toLocaleString();
  const truncatedUrl = truncateUrl(item.url, 50);

  return `
    <div class="history-item ${verdictClass}">
      <div class="history-header">
        <span class="verdict-icon">${verdictIcon}</span>
        <span class="verdict-label">${item.verdict}</span>
        <span class="score">Score: ${item.score}/10</span>
      </div>
      <div class="url" title="${item.url}">${truncatedUrl}</div>
      <div class="reasoning">${item.reasoning}</div>
      ${item.redFlags && item.redFlags.length > 0 ? `
        <div class="red-flags">
          <strong>Red Flags:</strong>
          <ul>
            ${item.redFlags.slice(0, 3).map(flag => `<li>${flag.message}</li>`).join('')}
          </ul>
        </div>
      ` : ''}
      <div class="timestamp">${timestamp}</div>
    </div>
  `;
}

// Truncate long URLs
function truncateUrl(url, maxLength) {
  if (url.length <= maxLength) return url;
  return url.substring(0, maxLength - 3) + '...';
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
