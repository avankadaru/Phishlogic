import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import type { AIMetadataFull } from '@/types';

interface AIDebugSectionProps {
  aiMetadata?: AIMetadataFull;
}

function toPretty(value: unknown): string {
  if (value === undefined || value === null) return '';
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // silently ignore — clipboard may be unavailable in some contexts
    }
  };

  return (
    <Button variant="outline" size="sm" onClick={onCopy} disabled={!text}>
      {copied ? 'Copied' : 'Copy'}
    </Button>
  );
}

interface CollapsibleBlockProps {
  title: string;
  body: string;
  variant?: 'default' | 'error';
  defaultOpen?: boolean;
}

function CollapsibleBlock({ title, body, variant = 'default', defaultOpen = false }: CollapsibleBlockProps) {
  const [open, setOpen] = useState(defaultOpen);
  const headerColor =
    variant === 'error'
      ? 'text-red-800 dark:text-red-300'
      : 'text-slate-800 dark:text-slate-200';
  const borderColor =
    variant === 'error'
      ? 'border-red-300 dark:border-red-800'
      : 'border-slate-200 dark:border-slate-800';
  const bodyBg =
    variant === 'error'
      ? 'bg-red-50 dark:bg-red-950/40'
      : 'bg-slate-50 dark:bg-slate-900/60';

  return (
    <div className={`border ${borderColor} rounded-md`}>
      <div className={`flex items-center justify-between px-3 py-2 ${bodyBg}`}>
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className={`text-xs font-medium ${headerColor}`}
        >
          {open ? '▼' : '▶'} {title}
        </button>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-muted-foreground">
            {body.length.toLocaleString()} chars
          </span>
          <CopyButton text={body} />
        </div>
      </div>
      {open && (
        <pre
          className={`text-[11px] leading-relaxed font-mono overflow-auto max-h-96 p-3 ${bodyBg} border-t ${borderColor}`}
        >
          {body || '(empty)'}
        </pre>
      )}
    </div>
  );
}

/**
 * Renders the actual AI provider API request, raw response, and raw text
 * content for an analysis. Used in the Debug view so QA can inspect the
 * exact round-trip. API keys are never included (sanitized upstream).
 */
export function AIDebugSection({ aiMetadata }: AIDebugSectionProps) {
  if (!aiMetadata) return null;

  const {
    apiUrl,
    apiRequest,
    apiResponse,
    rawContent,
    parseError,
    fallbackReparseUsed,
    promptSource,
  } = aiMetadata;

  const hasAnyDebug =
    apiUrl !== undefined ||
    apiRequest !== undefined ||
    apiResponse !== undefined ||
    rawContent !== undefined ||
    parseError !== undefined ||
    fallbackReparseUsed !== undefined ||
    promptSource !== undefined;

  if (!hasAnyDebug) return null;

  const legacyReasonLabel: Record<string, string> = {
    no_template_id: 'no template linked',
    template_not_found: 'template not found (id may be deleted)',
    load_error: 'database error while loading template',
  };

  return (
    <div className="mt-4 space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-muted-foreground">
          AI Request / Response
        </p>
        <div className="flex items-center gap-2">
          {fallbackReparseUsed && (
            <span className="text-[10px] px-2 py-0.5 rounded bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
              Fallback re-parse used
            </span>
          )}
          {parseError && (
            <span className="text-[10px] px-2 py-0.5 rounded bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300">
              Parse error
            </span>
          )}
        </div>
      </div>

      {promptSource && (
        <div
          className={`text-[11px] font-mono break-all px-2 py-1 rounded border ${
            promptSource.type === 'template'
              ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300'
              : 'bg-red-50 dark:bg-red-950/40 border-red-300 dark:border-red-800 text-red-800 dark:text-red-300'
          }`}
        >
          {promptSource.type === 'template' ? (
            <>
              Prompt: template <strong>"{promptSource.name}"</strong> (
              {promptSource.id})
            </>
          ) : (
            <>
              Prompt: <strong>LEGACY</strong> — reason:{' '}
              {legacyReasonLabel[promptSource.reason] ?? promptSource.reason}
              {promptSource.templateId ? ` (id was ${promptSource.templateId})` : ''}
            </>
          )}
        </div>
      )}

      {apiUrl && (
        <div className="text-[11px] font-mono break-all text-muted-foreground">
          POST {apiUrl}
        </div>
      )}

      {parseError && (
        <CollapsibleBlock
          title="Parse Error"
          body={toPretty(parseError)}
          variant="error"
          defaultOpen
        />
      )}

      {apiRequest !== undefined && (
        <CollapsibleBlock title="API Request" body={toPretty(apiRequest)} />
      )}

      {rawContent !== undefined && (
        <CollapsibleBlock
          title="Raw Model Content"
          body={toPretty(rawContent)}
          variant={parseError ? 'error' : 'default'}
          defaultOpen={!!parseError}
        />
      )}

      {apiResponse !== undefined && (
        <CollapsibleBlock title="Full API Response" body={toPretty(apiResponse)} />
      )}
    </div>
  );
}

export default AIDebugSection;
