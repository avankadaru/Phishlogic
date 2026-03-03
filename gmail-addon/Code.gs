/**
 * PhishLogic Gmail Add-on
 *
 * One-click phishing analysis for Gmail emails.
 * Click "Analyze for Phishing" button to check the current email.
 */

// PhishLogic API endpoint
const PHISHLOGIC_API = 'https://38eb1c092558e341-66-159-204-61.serveousercontent.com/api/v1/analyze/email';
// For production: 'https://your-api-domain.com/api/v1/analyze/email'

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
    .build();

  return [card];
}

/**
 * Analyze current email when user clicks button
 */
function analyzeCurrentEmail(e) {
  try {
    // Get current email using GmailApp service
    var messageId = e.gmail.messageId;
    Logger.log('Starting analysis for message: ' + messageId);

    // Use GmailApp to get the message (works in add-on context)
    var message = GmailApp.getMessageById(messageId);

    if (!message) {
      Logger.log('ERROR: Could not retrieve message');
      return buildErrorCard('Could not access email message');
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
    Logger.log('API response status: ' + statusCode);

    if (statusCode !== 200) {
      Logger.log('API error response: ' + response.getContentText());
      return buildErrorCard('API returned error: ' + statusCode + '\n' + response.getContentText());
    }

    var result = JSON.parse(response.getContentText());
    Logger.log('Analysis result: ' + JSON.stringify(result));

    // Build result card
    return buildResultCard(result);

  } catch (error) {
    Logger.log('Analysis error: ' + error.toString());
    return buildErrorCard(error.toString());
  }
}



/**
 * Display analysis result in sidebar
 */
function buildResultCard(result) {
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
      flagsText += '• ' + redFlags[i].message + '<br>';
    }

    if (redFlags.length > 5) {
      flagsText += '<i>+ ' + (redFlags.length - 5) + ' more...</i>';
    }

    card.addSection(CardService.newCardSection()
      .addWidget(CardService.newTextParagraph()
        .setText(flagsText)));
  }

  // Add action buttons
  var actionSection = CardService.newCardSection();

  if (verdict === 'Malicious' || verdict === 'Suspicious') {
    actionSection.addWidget(CardService.newButtonSet()
      .addButton(CardService.newTextButton()
        .setText('⚠️ Report Email')
        .setOpenLink(CardService.newOpenLink()
          .setUrl('mailto:security@company.com?subject=Phishing%20Report&body=PhishLogic%20detected%20' + verdict + '%20email')))
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

    return buildErrorCard('Unable to move email to trash: Message not found');
  } catch (error) {
    Logger.log('Error moving to trash: ' + error.toString());
    return buildErrorCard('Error: ' + error.toString());
  }
}

/**
 * Display error message
 */
function buildErrorCard(errorMessage) {
  var card = CardService.newCardBuilder()
    .setHeader(CardService.newCardHeader()
      .setTitle('⚠️ Analysis Failed'))
    .addSection(CardService.newCardSection()
      .addWidget(CardService.newTextParagraph()
        .setText('<font color="#f44336"><b>Error:</b></font><br>' + errorMessage))
      .addWidget(CardService.newTextParagraph()
        .setText('Please check that the PhishLogic API is running at:<br><code>' + PHISHLOGIC_API + '</code>'))
      .addWidget(CardService.newTextParagraph()
        .setText('<i>Troubleshooting:</i><br>1. Verify API is running (npm run dev)<br>2. Check API endpoint URL<br>3. Review Apps Script logs')))
    .addSection(CardService.newCardSection()
      .addWidget(CardService.newButtonSet()
        .addButton(CardService.newTextButton()
          .setText('🔄 Try Again')
          .setOnClickAction(CardService.newAction()
            .setFunctionName('analyzeCurrentEmail')))))
    .build();

  return card;
}

/**
 * TEST FUNCTION - Tests API connection directly
 */
function testAPIConnection() {
  Logger.log('=== Testing PhishLogic API Connection ===');

  try {
    // Create a sample email
    var sampleEmail = 'From: test@example.com\r\n' +
                      'To: user@gmail.com\r\n' +
                      'Subject: Test Email\r\n' +
                      'Date: ' + new Date().toISOString() + '\r\n' +
                      '\r\n' +
                      'This is a test email from Google Apps Script.';

    Logger.log('Sample email length: ' + sampleEmail.length);
    Logger.log('Calling API: ' + PHISHLOGIC_API);

    // Call PhishLogic API
    var response = UrlFetchApp.fetch(PHISHLOGIC_API, {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify({ rawEmail: sampleEmail }),
      muteHttpExceptions: true
    });

    var statusCode = response.getResponseCode();
    Logger.log('API Response Status: ' + statusCode);

    if (statusCode === 200) {
      var result = JSON.parse(response.getContentText());
      Logger.log('✅ SUCCESS! API is working!');
      Logger.log('Verdict: ' + result.verdict);
      Logger.log('Score: ' + result.score);
      Logger.log('Reasoning: ' + result.reasoning);

      if (result.redFlags && result.redFlags.length > 0) {
        Logger.log('Red Flags: ' + result.redFlags.length);
        result.redFlags.forEach(function(flag) {
          Logger.log('  - ' + flag.message);
        });
      }
    } else {
      Logger.log('❌ ERROR: API returned ' + statusCode);
      Logger.log('Response: ' + response.getContentText());
    }

    Logger.log('=== Test Complete ===');

  } catch (error) {
    Logger.log('❌ TEST ERROR: ' + error.toString());
    Logger.log('Stack: ' + error.stack);
  }
}
