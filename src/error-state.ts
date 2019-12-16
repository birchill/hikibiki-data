import { DownloadError } from './download';

// A flattened representation of error information suitable for postMessaging.
//
// For convenience, it includes retry information for when it is used in
// automatic retry scenarios.

export interface ErrorState {
  name: string;
  message: string;
  code?: number;
  url?: string;
  nextRetry?: Date;
  retryCount?: number;
}

export function toErrorState({
  error,
  nextRetry,
  retryCount,
}: {
  error: Error;
  nextRetry?: Date;
  retryCount?: number;
}): ErrorState {
  return {
    name: error.name,
    message: error.message,
    code: error instanceof DownloadError ? error.code : undefined,
    url: error instanceof DownloadError ? error.url : undefined,
    nextRetry,
    retryCount,
  };
}
