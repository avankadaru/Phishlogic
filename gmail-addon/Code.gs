/**
 * PhishLogic Gmail Add-on
 *
 * One-click phishing analysis for Gmail emails.
 * Click "Analyze for Phishing" button to check the current email.
 */

// PhishLogic API endpoint
const PHISHLOGIC_API = 'http://localhost:3000/api/v1/analyze/email';
// For production: 'https://your-api-domain.run.app/api/v1/analyze/email'

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Generate unique analysis ID
 */
function generateAnalysisId() {
  var timestamp = new Date().getTime().toString(36);
  var random = Math.random().toString(36).substring(2, 15);
  return 'pl_' + timestamp + random;
}

/**
 * Format duration in milliseconds to human-readable string
 */
function formatDuration(ms) {
  if (ms < 1000) {
    return ms + 'ms';
  }

  var seconds = Math.floor(ms / 1000);
  var milliseconds = Math.floor(ms % 1000);

  if (seconds < 60) {
    if (milliseconds === 0) {
      return seconds + 's';
    }
    return seconds + '.' + Math.floor(milliseconds / 100) + 's';
  }

  var minutes = Math.floor(seconds / 60);
  var remainingSeconds = seconds % 60;
  return minutes + 'm ' + remainingSeconds + 's';
}

/**
 * Get user-friendly error message from API error
 */
function getApiErrorMessage(statusCode, responseText) {
  switch (statusCode) {
    case 400:
      return 'Invalid email format. The email could not be parsed correctly.';
    case 401:
      return 'Authentication required. Please configure your API key.';
    case 403:
      return 'Access denied. Your API key may be invalid or expired.';
    case 404:
      return 'API endpoint not found. Please check the API URL configuration.';
    case 429:
      return 'Too many requests. Please wait a moment and try again.';
    case 500:
      return 'Server error. The API encountered an internal error. Please try again later.';
    case 503:
      return 'Service temporarily unavailable. Please try again in a few minutes.';
    case 0:
      return 'Cannot connect to PhishLogic API. Please check your internet connection and verify the API is running.';
    default:
      if (statusCode >= 500) {
        return 'Server error (' + statusCode + '). Please try again later.';
      } else if (statusCode >= 400) {
        return 'Request error (' + statusCode + '). ' + (responseText || 'Please check your request.');
      } else {
        return 'Unexpected error (' + statusCode + '). Please try again.';
      }
  }
}

// ============================================================================
// MAIN ADD-ON FUNCTIONS
// ============================================================================

/**
 * Build Gmail Add-on UI (sidebar)
 * Triggered when user opens an email
 */
function buildAddOn(e) {
  var card = CardService.newCardBuilder()
    .setHeader(CardService.newCardHeader()
      .setTitle('PhishLogic')
      .setSubtitle('Phishing Detection')
      .setImageUrl('https://www.gstatic.com/images/branding/product/1x/keep_48dp.png'))
    .addSection(CardService.newCardSection()
      .addWidget(CardService.newTextParagraph()
        .setText('Click the button below to analyze this email for phishing threats.'))
      .addWidget(CardService.newButtonSet()
        .addButton(CardService.newTextButton()
          .setText('🛡️ Analyze Email')
          .setTextButtonStyle(CardService.TextButtonStyle.FILLED)
          .setBackgroundColor('#667eea')
          .setOnClickAction(CardService.newAction()
            .setFunctionName('analyzeCurrentEmail')))))
    .addSection(CardService.newCardSection()
      .addWidget(CardService.newTextParagraph()
        .setText('<font color="#666"><i>Checks sender, links, attachments, and email content for phishing indicators.</i></font>')))
    .addSection(CardService.newCardSection()
      .addWidget(CardService.newTextParagraph()
        .setText('<font color="#999"><i>Analysis may take up to 50 seconds for complex emails.</i></font>')))
    .build();

  return [card];
}

/**
 * Analyze current email when user clicks button
 */
function analyzeCurrentEmail(e) {
  var analysisId = generateAnalysisId();
  var startTime = new Date().getTime();

  try {
    // Get current email using GmailApp service
    var messageId = e.gmail.messageId;
    Logger.log('Starting analysis for message: ' + messageId);
    Logger.log('Analysis ID: ' + analysisId);

    // Show analyzing card
    var analyzingCard = buildAnalyzingCard();

    // Use GmailApp to get the message (works in add-on context)
    var message = GmailApp.getMessageById(messageId);

    if (!message) {
      Logger.log('ERROR: Could not retrieve message');
      return buildErrorCard('Could not access email message', analysisId, 0);
    }

    // Get raw email content
    var rawEmail = message.getRawContent();
    Logger.log('Raw email length: ' + rawEmail.length);

    // Call PhishLogic API
    Logger.log('Calling PhishLogic API: ' + PHISHLOGIC_API);

    var response = UrlFetchApp.fetch(PHISHLOGIC_API, {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify({ rawEmail: rawEmail }),
      muteHttpExceptions: true
    });

    var statusCode = response.getResponseCode();
    var processingTime = new Date().getTime() - startTime;
    Logger.log('API response status: ' + statusCode);
    Logger.log('Processing time: ' + formatDuration(processingTime));

    if (statusCode !== 200) {
      var errorMessage = getApiErrorMessage(statusCode, response.getContentText());
      Logger.log('API error response: ' + errorMessage);
      return buildErrorCard(errorMessage, analysisId, processingTime, statusCode);
    }

    var result = JSON.parse(response.getContentText());
    Logger.log('Analysis result: ' + JSON.stringify(result));

    // Build result card with analysis ID and processing time
    return buildResultCard(result, analysisId, processingTime);

  } catch (error) {
    var processingTime = new Date().getTime() - startTime;
    Logger.log('Analysis error: ' + error.toString());
    return buildErrorCard(error.toString(), analysisId, processingTime);
  }
}

/**
 * Display "Analyzing..." card
 */
function buildAnalyzingCard() {
  var card = CardService.newCardBuilder()
    .setHeader(CardService.newCardHeader()
      .setTitle('⏳ Analyzing...'))
    .addSection(CardService.newCardSection()
      .addWidget(CardService.newTextParagraph()
        .setText('<b>PhishLogic is analyzing your email...</b><br><br>This may take up to 50 seconds for complex emails with multiple links or attachments.')))
    .build();

  return card;
}

/**
 * Display analysis result in sidebar
 */
function buildResultCard(result, analysisId, processingTime) {
  var verdict = result.verdict;
  var score = result.score;
  var reasoning = result.reasoning;
  var redFlags = result.redFlags || [];

  // Color and icon based on verdict
  var verdictColor, verdictIcon;
  if (verdict === 'Malicious') {
    verdictColor = '#f44336';
    verdictIcon = '🔴';
  } else if (verdict === 'Suspicious') {
    verdictColor = '#ff9800';
    verdictIcon = '🟡';
  } else {
    verdictColor = '#4caf50';
    verdictIcon = '🟢';
  }

  var card = CardService.newCardBuilder()
    .setHeader(CardService.newCardHeader()
      .setTitle(verdictIcon + ' Verdict: ' + verdict)
      .setSubtitle('Score: ' + score + '/10'))
    .addSection(CardService.newCardSection()
      .setHeader('Analysis')
      .addWidget(CardService.newTextParagraph()
        .setText('<b>Reasoning:</b><br>' + reasoning)));

  // Add red flags section if any
  if (redFlags.length > 0) {
    var flagsText = '<b><font color="' + verdictColor + '">Red Flags:</font></b><br>';
    for (var i = 0; i < Math.min(redFlags.length, 5); i++) {
      var flagMessage = redFlags[i].message || redFlags[i];
      flagsText += '• ' + flagMessage + '<br>';
    }

    if (redFlags.length > 5) {
      flagsText += '<i>+ ' + (redFlags.length - 5) + ' more...</i>';
    }

    card.addSection(CardService.newCardSection()
      .addWidget(CardService.newTextParagraph()
        .setText(flagsText)));
  }

  // Add analysis metadata section
  var analysisIdShort = analysisId.substring(0, 13) + '...';
  var metadataText = '<font color="#666">' +
                     '<b>Analysis ID:</b> <code>' + analysisIdShort + '</code><br>' +
                     '<b>Processing Time:</b> ' + formatDuration(processingTime) +
                     '</font>';

  card.addSection(CardService.newCardSection()
    .addWidget(CardService.newTextParagraph()
      .setText(metadataText))
    .addWidget(CardService.newButtonSet()
      .addButton(CardService.newTextButton()
        .setText('📋 Copy Analysis ID')
        .setOpenLink(CardService.newOpenLink()
          .setUrl('mailto:?subject=PhishLogic%20Analysis&body=Analysis%20ID:%20' + analysisId)))));

  // Add action buttons
  var actionSection = CardService.newCardSection();

  if (verdict === 'Malicious' || verdict === 'Suspicious') {
    actionSection.addWidget(CardService.newButtonSet()
      .addButton(CardService.newTextButton()
        .setText('⚠️ Report Email')
        .setOpenLink(CardService.newOpenLink()
          .setUrl('mailto:security@company.com?subject=Phishing%20Report&body=PhishLogic%20detected%20' + verdict + '%20email%0A%0AAnalysis%20ID:%20' + analysisId)))
      .addButton(CardService.newTextButton()
        .setText('🗑️ Move to Trash')
        .setOnClickAction(CardService.newAction()
          .setFunctionName('moveToTrash'))));
  }

  // Add "Analyze Again" button
  actionSection.addWidget(CardService.newButtonSet()
    .addButton(CardService.newTextButton()
      .setText('🔄 Analyze Again')
      .setOnClickAction(CardService.newAction()
        .setFunctionName('analyzeCurrentEmail'))));

  card.addSection(actionSection);

  return card.build();
}

/**
 * Move current email to trash
 */
function moveToTrash(e) {
  try {
    var messageId = e.gmail.messageId;
    Logger.log('Moving message to trash: ' + messageId);

    // Use GmailApp to move message to trash
    var message = GmailApp.getMessageById(messageId);

    if (message) {
      message.moveToTrash();
      Logger.log('Message moved to trash successfully');

      return CardService.newActionResponseBuilder()
        .setNotification(CardService.newNotification()
          .setText('Email moved to trash'))
        .build();
    }

    return buildErrorCard('Unable to move email to trash: Message not found', '', 0);
  } catch (error) {
    Logger.log('Error moving to trash: ' + error.toString());
    return buildErrorCard('Error: ' + error.toString(), '', 0);
  }
}

/**
 * Display error message
 */
function buildErrorCard(errorMessage, analysisId, processingTime, statusCode) {
  var card = CardService.newCardBuilder()
    .setHeader(CardService.newCardHeader()
      .setTitle('⚠️ Analysis Failed'));

  var errorSection = CardService.newCardSection()
    .addWidget(CardService.newTextParagraph()
      .setText('<font color="#f44336"><b>Error:</b></font><br>' + errorMessage));

  // Add status code if provided
  if (statusCode) {
    errorSection.addWidget(CardService.newTextParagraph()
      .setText('<font color="#999"><i>Status Code: ' + statusCode + '</i></font>'));
  }

  errorSection.addWidget(CardService.newTextParagraph()
    .setText('Please check that the PhishLogic API is running at:<br><code>' + PHISHLOGIC_API + '</code>'));

  card.addSection(errorSection);

  // Add analysis metadata if available
  if (analysisId && processingTime > 0) {
    var analysisIdShort = analysisId.substring(0, 13) + '...';
    card.addSection(CardService.newCardSection()
      .addWidget(CardService.newTextParagraph()
        .setText('<font color="#666">' +
                 '<b>Analysis ID:</b> <code>' + analysisIdShort + '</code><br>' +
                 '<b>Time Elapsed:</b> ' + formatDuration(processingTime) +
                 '</font>'))
      .addWidget(CardService.newButtonSet()
        .addButton(CardService.newTextButton()
          .setText('📋 Copy Analysis ID')
          .setOpenLink(CardService.newOpenLink()
            .setUrl('mailto:?subject=PhishLogic%20Error&body=Analysis%20ID:%20' + analysisId + '%0AError:%20' + encodeURIComponent(errorMessage))))));
  }

  // Add troubleshooting section
  card.addSection(CardService.newCardSection()
    .addWidget(CardService.newTextParagraph()
      .setText('<i>Troubleshooting:</i><br>1. Verify API is running (npm run dev)<br>2. Check API endpoint URL<br>3. Review Apps Script logs<br>4. Verify network connectivity')));

  // Add retry button
  card.addSection(CardService.newCardSection()
    .addWidget(CardService.newButtonSet()
      .addButton(CardService.newTextButton()
        .setText('🔄 Try Again')
        .setOnClickAction(CardService.newAction()
          .setFunctionName('analyzeCurrentEmail')))));

  return card.build();
}

// ============================================================================
// TEST FUNCTIONS
// ============================================================================

/**
 * TEST FUNCTION - Tests API connection directly
 */
function testAPIConnection() {
  Logger.log('=== Testing PhishLogic API Connection ===');

  var analysisId = generateAnalysisId();
  var startTime = new Date().getTime();

  try {
    // Create a sample email
    var sampleEmail = 'From: test@example.com\r\n' +
                      'To: user@gmail.com\r\n' +
                      'Subject: Test Email\r\n' +
                      'Date: ' + new Date().toISOString() + '\r\n' +
                      '\r\n' +
                      'This is a test email from Google Apps Script.';

    Logger.log('Sample email length: ' + sampleEmail.length);
    Logger.log('Analysis ID: ' + analysisId);
    Logger.log('Calling API: ' + PHISHLOGIC_API);

    // Call PhishLogic API
    var response = UrlFetchApp.fetch(PHISHLOGIC_API, {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify({ rawEmail: sampleEmail }),
      muteHttpExceptions: true
    });

    var statusCode = response.getResponseCode();
    var processingTime = new Date().getTime() - startTime;

    Logger.log('API Response Status: ' + statusCode);
    Logger.log('Processing Time: ' + formatDuration(processingTime));

    if (statusCode === 200) {
      var result = JSON.parse(response.getContentText());
      Logger.log('✅ SUCCESS! API is working!');
      Logger.log('Verdict: ' + result.verdict);
      Logger.log('Score: ' + result.score);
      Logger.log('Reasoning: ' + result.reasoning);

      if (result.redFlags && result.redFlags.length > 0) {
        Logger.log('Red Flags: ' + result.redFlags.length);
        result.redFlags.forEach(function(flag) {
          Logger.log('  - ' + (flag.message || flag));
        });
      }
    } else {
      Logger.log('❌ ERROR: API returned ' + statusCode);
      Logger.log('Error Message: ' + getApiErrorMessage(statusCode, response.getContentText()));
      Logger.log('Response: ' + response.getContentText());
    }

    Logger.log('Analysis ID: ' + analysisId);
    Logger.log('=== Test Complete ===');

  } catch (error) {
    Logger.log('❌ TEST ERROR: ' + error.toString());
    Logger.log('Stack: ' + error.stack);
  }
}
