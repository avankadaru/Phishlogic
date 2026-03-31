// PhishLogic Browser Extension - Background Service Worker

// Import utilities for service worker
importScripts('utils.js');

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

    // Generate analysis ID
    const analysisId = generateAnalysisId();
    const startTime = Date.now();
    let timerInterval = null;
    let notificationId = null;

    try {
      // Get API endpoint from storage (default: localhost)
      const { apiEndpoint = 'http://localhost:3000' } =
        await chrome.storage.sync.get('apiEndpoint');

      // Show "analyzing" notification with timer
      notificationId = await chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icons/icon48.png',
        title: 'PhishLogic',
        message: 'Analyzing URL...\n(may take up to 50 seconds)',
        priority: 0
      });

      // Update notification every second with elapsed time
      timerInterval = setInterval(() => {
        const elapsed = Date.now() - startTime;
        chrome.notifications.update(notificationId, {
          message: `Analyzing... ${formatDuration(elapsed)}\n(may take up to 50 seconds)`
        });
      }, 1000);

      // Call PhishLogic API with 50-second timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 50000);

      const response = await fetch(`${apiEndpoint}/api/v1/analyze/url`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`API returned ${response.status}: ${response.statusText}`);
      }

      const result = await response.json();
      const processingTime = Date.now() - startTime;

      // Clear timer and "analyzing" notification
      if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
      }
      if (notificationId) {
        chrome.notifications.clear(notificationId);
        notificationId = null;
      }

      // Show notification with verdict and analysis ID
      const icon = result.verdict === 'Malicious' ? '🔴' :
                   result.verdict === 'Suspicious' ? '🟡' : '🟢';

      const analysisIdShort = analysisId.substring(0, 8) + '...';

      await chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icons/icon48.png',
        title: `${icon} PhishLogic: ${result.verdict} - ${analysisIdShort}`,
        message: `Score: ${result.score}/10\nProcessing time: ${formatDuration(processingTime)}\n\n${result.reasoning}`,
        priority: result.verdict === 'Malicious' ? 2 : 1
      });

      // Store in history with analysis ID and processing time
      chrome.storage.local.get(['history'], (data) => {
        const history = data.history || [];
        history.unshift({
          analysisId,
          url,
          verdict: result.verdict,
          score: result.score,
          reasoning: result.reasoning,
          redFlags: result.redFlags || [],
          processingTime,
          timestamp: new Date().toISOString()
        });
        // Keep last 50 entries
        chrome.storage.local.set({ history: history.slice(0, 50) });
      });

    } catch (error) {
      console.error('PhishLogic analysis failed:', error);

      // Clear timer if running
      if (timerInterval) {
        clearInterval(timerInterval);
      }

      // Get user-friendly error message
      const errorMessage = getApiErrorMessage(error, error.status);

      // Show error notification with analysis ID
      const analysisIdShort = analysisId.substring(0, 8) + '...';

      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icons/icon48.png',
        title: `PhishLogic Error - ${analysisIdShort}`,
        message: errorMessage,
        priority: 1
      });

      // Store error in history
      chrome.storage.local.get(['history'], (data) => {
        const history = data.history || [];
        history.unshift({
          analysisId,
          url,
          verdict: 'Error',
          score: 0,
          reasoning: errorMessage,
          redFlags: [],
          processingTime: Date.now() - startTime,
          timestamp: new Date().toISOString(),
          error: true
        });
        chrome.storage.local.set({ history: history.slice(0, 50) });
      });
    }
  }
});

// Handle notification clicks (optional: could open detailed view)
chrome.notifications.onClicked.addListener((notificationId) => {
  // Future: Open popup or detailed analysis view
  chrome.notifications.clear(notificationId);
});
