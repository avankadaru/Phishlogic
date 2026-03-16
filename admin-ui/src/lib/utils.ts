import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import type { ExecutionStep } from '@/types';

/**
 * Merge Tailwind CSS classes with clsx
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Format currency
 */
export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  }).format(amount);
}

/**
 * Format date
 */
export function formatDate(date: string | Date): string {
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(date));
}

/**
 * Format relative time
 */
export function formatRelativeTime(date: string | Date): string {
  const now = new Date();
  const then = new Date(date);
  const diffInSeconds = Math.floor((now.getTime() - then.getTime()) / 1000);

  if (diffInSeconds < 60) return 'just now';
  if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
  if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
  if (diffInSeconds < 604800) return `${Math.floor(diffInSeconds / 86400)}d ago`;

  return formatDate(date);
}

/**
 * Format duration (ms, seconds, or minutes)
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms.toFixed(0)}ms`;
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds.toFixed(2)}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds.toFixed(1)}s`;
}

/**
 * Calculate total execution time from execution steps
 */
export function calculateTotalTime(steps: ExecutionStep[]): number {
  const completedSteps = steps.filter(s => s.completedAt && s.startedAt);
  if (completedSteps.length === 0) return 0;

  const firstStart = Math.min(...completedSteps.map(s =>
    new Date(s.startedAt!).getTime()
  ));
  const lastEnd = Math.max(...completedSteps.map(s =>
    new Date(s.completedAt!).getTime()
  ));

  return lastEnd - firstStart;
}

/**
 * Calculate cumulative time up to a specific step
 * (time elapsed from analysis start to step completion)
 */
export function calculateCumulativeTimeForStep(
  steps: ExecutionStep[],
  targetStepIndex: number
): number {
  const completedSteps = steps.filter(s => s.completedAt && s.startedAt);
  if (completedSteps.length === 0) return 0;

  const analysisStart = Math.min(...completedSteps.map(s =>
    new Date(s.startedAt!).getTime()
  ));

  const targetStep = steps[targetStepIndex];
  if (!targetStep?.completedAt) return 0;

  return new Date(targetStep.completedAt).getTime() - analysisStart;
}
