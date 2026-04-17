/**
 * HTML Structure Extractor
 *
 * Analyzes HTML structure including forms, iframes, scripts, and external resources.
 */

import { BaseExtractor } from './base.extractor.js';
import type { NormalizedInput } from '../../../models/input.js';
import { isEmailInput } from '../../../models/input.js';
import { parseHtmlStructureFromString } from './parse-html-structure.js';

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
    return parseHtmlStructureFromString(html);
  }

  getEmptyData(): HTMLStructureAnalysis {
    return parseHtmlStructureFromString('');
  }
}
