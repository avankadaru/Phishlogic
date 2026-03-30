import { query } from '../src/infrastructure/database/client.js';

async function verifyPromptTemplate() {
  const result = await query(
    `SELECT
      id,
      name,
      LENGTH(system_prompt) as system_prompt_length,
      LENGTH(user_prompt) as user_prompt_length,
      LEFT(system_prompt, 150) as system_prompt_preview,
      updated_at
     FROM prompt_templates
     WHERE id = 'a5057b0b-788b-4137-ba28-70b2081e9f28'`,
    []
  );

  console.log('\n=== Prompt Template Update Verification ===\n');
  if (result.rows.length > 0) {
    const row = result.rows[0];
    console.log('✓ Template found:');
    console.log('  ID:', row.id);
    console.log('  Name:', row.name);
    console.log('  System prompt length:', row.system_prompt_length, 'chars');
    console.log('  User prompt length:', row.user_prompt_length, 'chars');
    console.log('  Updated at:', row.updated_at);
    console.log('\n  System prompt preview:');
    console.log('  ', row.system_prompt_preview.replace(/\n/g, ' '));

    if (row.system_prompt_preview.includes('DIRECT VERDICT')) {
      console.log('\n✅ Template successfully updated to direct verdict format!');
    } else {
      console.log('\n❌ Template does not appear to use direct verdict format');
    }
  } else {
    console.log('❌ Template not found');
  }

  process.exit(0);
}

verifyPromptTemplate().catch((error) => {
  console.error('Error:', error);
  process.exit(1);
});
