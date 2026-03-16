/**
 * Type declarations for sentiment package
 */
declare module 'sentiment' {
  interface SentimentResult {
    score: number;
    comparative: number;
    negative: string[];
    positive: string[];
    tokens: string[];
    words: string[];
    calculation: Array<{ [word: string]: number }>;
  }

  class Sentiment {
    analyze(phrase: string, options?: any, callback?: any): SentimentResult;
  }

  export = Sentiment;
}
