/**
 * Shared Cheerio-based HTML structure parsing (email body or URL context snapshot).
 */

import { load } from 'cheerio';
import type { FormMetadata, HTMLStructureAnalysis } from './html-structure.extractor.js';

export function emptyHtmlStructure(): HTMLStructureAnalysis {
  return {
    hasForms: false,
    formCount: 0,
    forms: [],
    hasIframes: false,
    iframeCount: 0,
    iframeSources: [],
    hasScripts: false,
    scriptCount: 0,
    scriptSources: [],
    hasStylesheets: false,
    stylesheetCount: 0,
    externalResources: [],
  };
}

function extractForms($: ReturnType<typeof load>): FormMetadata[] {
  const forms: FormMetadata[] = [];

  $('form').each((_: unknown, element: unknown) => {
    const action = $(element).attr('action');
    const method = $(element).attr('method');
    const inputs: Array<{ type: string; name?: string; id?: string; placeholder?: string }> = [];

    let hasPasswordField = false;
    let hasEmailField = false;
    let hasHiddenFields = false;

    $(element)
      .find('input, textarea, select')
      .each((_: unknown, inputElement: unknown) => {
        const type = $(inputElement).attr('type') || 'text';
        const name = $(inputElement).attr('name');
        const id = $(inputElement).attr('id');
        const placeholder = $(inputElement).attr('placeholder');

        inputs.push({ type, name, id, placeholder });

        if (type === 'password') {
          hasPasswordField = true;
        }
        if (type === 'email' || name?.toLowerCase().includes('email')) {
          hasEmailField = true;
        }
        if (type === 'hidden') {
          hasHiddenFields = true;
        }
      });

    forms.push({
      action,
      method,
      inputs,
      hasPasswordField,
      hasEmailField,
      hasHiddenFields,
    });
  });

  return forms;
}

/**
 * Parse HTML string into structure analysis (forms, iframes, external scripts, etc.).
 */
export function parseHtmlStructureFromString(html: string): HTMLStructureAnalysis {
  if (!html?.trim()) {
    return emptyHtmlStructure();
  }

  try {
    const $ = load(html);

    const forms = extractForms($);

    const iframeSources: string[] = [];
    $('iframe').each((_, element) => {
      const src = $(element).attr('src');
      if (src) {
        iframeSources.push(src);
      }
    });

    const scriptSources: string[] = [];
    $('script[src]').each((_, element) => {
      const src = $(element).attr('src');
      if (src) {
        scriptSources.push(src);
      }
    });

    const stylesheetCount = $('link[rel="stylesheet"]').length + $('style').length;

    const externalResources = new Set<string>();

    scriptSources.forEach((src) => externalResources.add(src));
    iframeSources.forEach((src) => externalResources.add(src));

    $('link[rel="stylesheet"]').each((_, element) => {
      const href = $(element).attr('href');
      if (href && (href.startsWith('http://') || href.startsWith('https://'))) {
        externalResources.add(href);
      }
    });

    $('img[src]').each((_, element) => {
      const src = $(element).attr('src');
      if (src && (src.startsWith('http://') || src.startsWith('https://'))) {
        externalResources.add(src);
      }
    });

    return {
      hasForms: forms.length > 0,
      formCount: forms.length,
      forms,

      hasIframes: iframeSources.length > 0,
      iframeCount: iframeSources.length,
      iframeSources,

      hasScripts: scriptSources.length > 0,
      scriptCount: scriptSources.length,
      scriptSources,

      hasStylesheets: stylesheetCount > 0,
      stylesheetCount,

      externalResources: Array.from(externalResources),
    };
  } catch {
    return emptyHtmlStructure();
  }
}
