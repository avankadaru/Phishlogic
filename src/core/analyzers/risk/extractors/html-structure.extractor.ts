/**
 * HTML Structure Extractor
 *
 * Analyzes HTML structure including forms, iframes, scripts, and external resources.
 */

import { BaseExtractor } from './base.extractor.js';
import type { NormalizedInput } from '../../../models/input.js';
import { isEmailInput } from '../../../models/input.js';
import { load } from 'cheerio';

export interface FormMetadata {
  action?: string;
  method?: string;
  inputs: Array<{
    type: string;
    name?: string;
    id?: string;
    placeholder?: string;
  }>;
  hasPasswordField: boolean;
  hasEmailField: boolean;
  hasHiddenFields: boolean;
}

export interface HTMLStructureAnalysis {
  hasForms: boolean;
  formCount: number;
  forms: FormMetadata[];

  hasIframes: boolean;
  iframeCount: number;
  iframeSources: string[];

  hasScripts: boolean;
  scriptCount: number;
  scriptSources: string[];            // External scripts

  hasStylesheets: boolean;
  stylesheetCount: number;

  externalResources: string[];        // All external URLs
}

export class HTMLStructureExtractor extends BaseExtractor<HTMLStructureAnalysis> {
  getName(): string {
    return 'HTMLStructureExtractor';
  }

  isApplicable(input: NormalizedInput): boolean {
    return isEmailInput(input);
  }

  protected async extractData(input: NormalizedInput): Promise<HTMLStructureAnalysis> {
    if (!isEmailInput(input)) {
      return this.getEmptyData();
    }

    const html = input.data.parsed.body.html || '';

    if (!html) {
      return this.getEmptyData();
    }

    try {
      const $ = load(html);

      // Extract forms
      const forms = this.extractForms($);

      // Extract iframes
      const iframeSources: string[] = [];
      $('iframe').each((_, element) => {
        const src = $(element).attr('src');
        if (src) {
          iframeSources.push(src);
        }
      });

      // Extract scripts
      const scriptSources: string[] = [];
      $('script[src]').each((_, element) => {
        const src = $(element).attr('src');
        if (src) {
          scriptSources.push(src);
        }
      });

      // Count stylesheets
      const stylesheetCount = $('link[rel="stylesheet"]').length + $('style').length;

      // Collect all external resources
      const externalResources = new Set<string>();

      // Add script sources
      scriptSources.forEach((src) => externalResources.add(src));

      // Add iframe sources
      iframeSources.forEach((src) => externalResources.add(src));

      // Add stylesheet sources
      $('link[rel="stylesheet"]').each((_, element) => {
        const href = $(element).attr('href');
        if (href && (href.startsWith('http://') || href.startsWith('https://'))) {
          externalResources.add(href);
        }
      });

      // Add image sources (external only)
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
    } catch (error) {
      // Return empty on error
      return this.getEmptyData();
    }
  }

  getEmptyData(): HTMLStructureAnalysis {
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

  /**
   * Extract form metadata
   */
  private extractForms($: any): FormMetadata[] {
    const forms: FormMetadata[] = [];

    $('form').each((_, element) => {
      const action = $(element).attr('action');
      const method = $(element).attr('method');
      const inputs: Array<{ type: string; name?: string; id?: string; placeholder?: string }> = [];

      let hasPasswordField = false;
      let hasEmailField = false;
      let hasHiddenFields = false;

      $(element)
        .find('input, textarea, select')
        .each((_: any, inputElement: any) => {
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
}
