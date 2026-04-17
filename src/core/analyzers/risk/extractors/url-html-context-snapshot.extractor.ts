/**
 * Optional HTML snapshot from {@link UrlInput.context} (e.g. extension-provided page fragment).
 * Does not fetch remote URLs — avoids SSRF in prescan.
 */

import { BaseExtractor } from './base.extractor.js';
import type { NormalizedInput } from '../../../models/input.js';
import { isUrlInput } from '../../../models/input.js';
import { parseHtmlStructureFromString } from './parse-html-structure.js';
import type { HTMLStructureAnalysis } from './html-structure.extractor.js';
import { load } from 'cheerio';

export interface UrlHtmlContextSnapshot {
  htmlStructure: HTMLStructureAnalysis;
  /** Count of img elements (including data URIs) for top-level profile flags */
  imageTagCount: number;
}

export class UrlHtmlContextSnapshotExtractor extends BaseExtractor<UrlHtmlContextSnapshot> {
  getName(): string {
    return 'UrlHtmlContextSnapshotExtractor';
  }

  isApplicable(input: NormalizedInput): boolean {
    if (!isUrlInput(input)) {
      return false;
    }
    const snippet = input.data.context?.pageHtmlSnippet;
    return typeof snippet === 'string' && snippet.trim().length > 0;
  }

  getEmptyData(): UrlHtmlContextSnapshot {
    return {
      htmlStructure: parseHtmlStructureFromString(''),
      imageTagCount: 0,
    };
  }

  protected async extractData(input: NormalizedInput): Promise<UrlHtmlContextSnapshot> {
    if (!isUrlInput(input)) {
      return this.getEmptyData();
    }

    const snippet = input.data.context?.pageHtmlSnippet ?? '';
    const htmlStructure = parseHtmlStructureFromString(snippet);

    let imageTagCount = 0;
    try {
      const $ = load(snippet);
      imageTagCount = $('img').length;
    } catch {
      imageTagCount = 0;
    }

    return { htmlStructure, imageTagCount };
  }
}
