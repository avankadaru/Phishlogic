// PhishLogic Browser Extension - Background Service Worker

// Create context menu on install
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "checkPhishing",
    title: "Check for Phishing with PhishLogic",
    contexts: ["link", "selection"]
  });
});

// Handle context menu clicks
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === "checkPhishing") {
    const url = info.linkUrl || info.selectionText;

    try {
      // Get API endpoint from storage (default: localhost)
      const { apiEndpoint = 'http://localhost:3000' } =
        await chrome.storage.sync.get('apiEndpoint');

      // Show "analyzing" notification
      const notificationId = await chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icons/icon48.png',
        title: 'PhishLogic',
        message: 'Analyzing URL...',
        priority: 0
      });

      // Call PhishLogic API
      const response = await fetch(`${apiEndpoint}/api/v1/analyze/url`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url })
      });

      if (!response.ok) {
        throw new Error(`API returned ${response.status}: ${response.statusText}`);
      }

      const result = await response.json();

      // Clear the "analyzing" notification
      chrome.notifications.clear(notificationId);

      // Show notification with verdict
      const icon = result.verdict === 'Malicious' ? '🔴' :
                   result.verdict === 'Suspicious' ? '🟡' : '🟢';

      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icons/icon48.png',
        title: `${icon} PhishLogic: ${result.verdict}`,
        message: `Score: ${result.score}/10\n${result.reasoning}`,
        priority: result.verdict === 'Malicious' ? 2 : 1
      });

      // Store in history
      chrome.storage.local.get(['history'], (data) => {
        const history = data.history || [];
        history.unshift({
          url,
          verdict: result.verdict,
          score: result.score,
          reasoning: result.reasoning,
          redFlags: result.redFlags || [],
          timestamp: new Date().toISOString()
        });
        // Keep last 50 entries
        chrome.storage.local.set({ history: history.slice(0, 50) });
      });

    } catch (error) {
      console.error('PhishLogic analysis failed:', error);

      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icons/icon48.png',
        title: 'PhishLogic Error',
        message: `Failed to check URL: ${error.message}`,
        priority: 1
      });
    }
  }
});

// Handle notification clicks (optional: could open detailed view)
chrome.notifications.onClicked.addListener((notificationId) => {
  // Future: Open popup or detailed analysis view
  chrome.notifications.clear(notificationId);
});
