# AI Model CRUD UI - Testing Guide

## Implementation Complete ✅

All UI changes have been implemented and backend is ready. Both servers are running:
- **Backend**: http://localhost:3000
- **Admin UI**: http://localhost:5174 (opened in your browser)

## What Was Implemented

### 1. TypeScript Types Updated
- `modelId`, `temperature`, `maxTokens` are now optional in `AIModelConfig`
- Added `promptTemplateId` field
- Added `PromptTemplate` interface

### 2. Backend Ready (Previously Completed)
- Model ID is optional with provider-specific defaults
- Temperature (default: 0.3) and maxTokens (default: 4096) are optional
- Empty API keys on update are preserved (not overwritten)
- Real API connection tests for Anthropic, OpenAI, Google
- 3 world-class prompt templates seeded in database

### 3. UI Changes in TasksPage.tsx
- **Model ID**: No longer required (except for custom provider), shows helpful placeholder text
- **Advanced Settings**: Temperature and maxTokens are hidden in collapsible section
- **Prompt Template Selector**: Dropdown with 3 templates showing token count and accuracy
- **Helpful Hints**: Each field has descriptive help text
- **Validation**: Only requires Model ID for custom providers

---

## Testing Checklist

### Test 1: Create AI Model WITHOUT Model ID (Anthropic)
1. Log into Admin UI at http://localhost:5174
2. Navigate to Tasks page
3. Click "Add AI Model"
4. Fill in:
   - **Name**: My Claude Model
   - **Provider**: Anthropic
   - **API Key**: Your Anthropic API key (or test with fake key to see validation)
   - **Model ID**: Leave empty ✅
   - **Prompt Template**: Select "Hybrid Balanced Analysis ⭐"
5. Click "Save Model"

**Expected Result**:
- Model saves successfully without Model ID
- Backend applies default: `claude-3-5-sonnet-20241022`

---

### Test 2: Create AI Model WITHOUT Model ID (OpenAI)
1. Click "Add AI Model"
2. Fill in:
   - **Name**: My GPT Model
   - **Provider**: OpenAI
   - **API Key**: Your OpenAI API key
   - **Model ID**: Leave empty ✅
   - **Prompt Template**: Select "Cost-Efficient Rapid Analysis"
5. Click "Save Model"

**Expected Result**:
- Model saves successfully without Model ID
- Backend applies default: `gpt-4`

---

### Test 3: Advanced Settings Are Hidden by Default
1. Click "Add AI Model"
2. Scroll down in the form

**Expected Result**:
- You should see "Advanced Settings (Optional)" collapse button with ▶ arrow
- Temperature and maxTokens fields are NOT visible initially
- Only timeout is visible (if not also hidden)

---

### Test 4: Advanced Settings Can Be Expanded
1. Click "Advanced Settings (Optional)" button

**Expected Result**:
- Arrow changes to ▼
- Temperature field appears (default: 0.3, range 0-2)
- Max Tokens field appears (default: 4096)
- Timeout field appears (default: 30000ms)
- Helpful hints shown below each field

---

### Test 5: Prompt Template Selector Shows 3 Options
1. In the AI Model form, find "Prompt Template" dropdown

**Expected Result**:
- Dropdown has 4 options:
  1. "Use default template" (empty value)
  2. "Cost-Efficient Rapid Analysis - 475 tokens (~92% accuracy)"
  3. "Hybrid Balanced Analysis ⭐ - 700 tokens (~96% accuracy)"
  4. "Comprehensive Deep Analysis - 1050 tokens (~98% accuracy)"
- Helpful hint text shows cost/accuracy info for each tier

---

### Test 6: Model ID Required for Custom Provider
1. Click "Add AI Model"
2. Select Provider: **Custom**
3. Try to click "Save Model" without filling Model ID

**Expected Result**:
- Save button is DISABLED
- You cannot save without providing Model ID for custom provider

---

### Test 7: Model ID Optional for Other Providers
1. Click "Add AI Model"
2. Select Provider: **Google**
3. Fill in Name and API Key
4. Leave Model ID empty
5. Click "Save Model"

**Expected Result**:
- Save button is ENABLED (Model ID not required)
- Model saves successfully
- Backend applies default: `gemini-1.5-pro`

---

### Test 8: Update Existing Model Without API Key
1. Find an existing AI model in the list
2. Click "Edit"
3. Change the name (e.g., add " - Updated")
4. DO NOT fill in API Key field (leave it empty)
5. Click "Update Model"

**Expected Result**:
- Model updates successfully
- API key is preserved (not overwritten with empty string)
- You can see the updated name in the list

---

### Test 9: Test Connection (Real API Call)
1. Create or edit an AI model with valid API key
2. Click "Test Connection" button

**Expected Result**:
- For Anthropic/OpenAI/Google: Makes real API call
- Shows success message with latency (e.g., "Connected successfully in 234ms")
- OR shows error if API key is invalid

---

### Test 10: Prompt Template Saves and Loads
1. Create a new AI model
2. Select "Comprehensive Deep Analysis" from Prompt Template dropdown
3. Save the model
4. Reload the page
5. Edit that model again

**Expected Result**:
- Prompt Template dropdown shows "Comprehensive Deep Analysis" as selected
- The `promptTemplateId` was saved to database and loaded correctly

---

## Verification Summary

After testing, verify:
- ✅ Model ID is optional (no asterisk) for Anthropic, OpenAI, Google
- ✅ Model ID is required (has asterisk) for Custom provider only
- ✅ Temperature and maxTokens are hidden by default
- ✅ Advanced Settings can be expanded/collapsed
- ✅ Prompt Template selector shows 3 templates with cost/accuracy
- ✅ Save button validation works correctly
- ✅ CRUD operations work (create, read, update, delete)
- ✅ Test connection makes real API calls
- ✅ Helpful hints guide users on each field

---

## Known Issues to Watch For

1. **Authentication**: All `/admin/*` routes require JWT token
   - Make sure you're logged in to the Admin UI
   - Check browser console for 401 Unauthorized errors

2. **CORS**: If making requests from different origin
   - Backend should allow CORS from Admin UI origin
   - Check browser console for CORS errors

3. **Port Conflicts**: If ports are already in use
   - Backend: Port 3000
   - Admin UI: Port 5174 (fell back from 5173)

---

## Database Verification

You can verify the prompt templates in the database:

```bash
npx tsx scripts/verify-prompt-templates.ts
```

Expected output:
```
✓ prompt_templates table exists
✓ prompt_template_id column added to ai_model_configs
Found 3 prompt templates:
1. Hybrid Balanced Analysis ⭐ (balanced, 700 tokens, 96% accuracy, DEFAULT)
2. Comprehensive Deep Analysis (comprehensive, 1050 tokens, 98% accuracy)
3. Cost-Efficient Rapid Analysis (cost_efficient, 475 tokens, 92% accuracy)
✓ 5 indices created
```

---

## Success Criteria

The implementation is successful if:
1. ✅ You can create AI models without specifying Model ID for standard providers
2. ✅ Temperature and maxTokens are not visible until you expand Advanced Settings
3. ✅ Prompt Template selector loads 3 options from backend API
4. ✅ All CRUD operations work correctly
5. ✅ UI provides helpful guidance with placeholders and hints

---

## Next Steps After Testing

If everything works:
1. ✅ Mark all tasks as completed
2. ✅ Commit the changes
3. ✅ Update documentation with new features

If issues are found:
1. Report specific error messages or unexpected behavior
2. Check browser console for errors
3. Check backend logs for API errors
4. I'll help fix any issues discovered during testing
