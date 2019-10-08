import { DatabaseVersion } from './common';

// Produces a ReadableStream of DownloadEvents
//
// This really should have been an async generator instead of a stream but
// I didn't realize that until later. Oh well.

export type EntryEvent<EntryLine> = { type: 'entry' } & EntryLine;

export type DeletionEvent<DeletionLine> = { type: 'deletion' } & DeletionLine;

export interface VersionEvent {
  type: 'version';
  major: number;
  minor: number;
  patch: number;
  databaseVersion?: string;
  dateOfCreation: string;
  partial: boolean;
}

export interface ProgressEvent {
  type: 'progress';
  loaded: number;
  total: number;
}

export type DownloadEvent<EntryLine, DeletionLine> =
  | VersionEvent
  | EntryEvent<EntryLine>
  | DeletionEvent<DeletionLine>
  | ProgressEvent;

const DEFAULT_BASE_URL = 'https://d1uxefubru78xw.cloudfront.net/';

// How many percentage should change before we dispatch a new progress event.
const DEFAULT_MAX_PROGRESS_RESOLUTION = 0.05;

interface VersionInfo {
  major: number;
  minor: number;
  patch: number;
  snapshot: number;
  databaseVersion: string;
  dateOfCreation: string;
}

export type DownloadOptions<EntryLine, DeletionLine> = {
  baseUrl?: string;
  dbName: string;
  majorVersion: number;
  currentVersion?: {
    major: number;
    minor: number;
    patch: number;
  };
  lang: string;
  maxProgressResolution?: number;
  forceFetch?: boolean;
  isEntryLine: (a: any) => a is EntryLine;
  isDeletionLine: (a: any) => a is DeletionLine;
};

export const enum DownloadErrorCode {
  VersionFileNotFound,
  VersionFileNotAccessible,
  VersionFileInvalid,
  MajorVersionNotFound,
  DatabaseFileNotFound,
  DatabaseFileNotAccessible,
  DatabaseFileHeaderMissing,
  DatabaseFileHeaderDuplicate,
  DatabaseFileVersionMismatch,
  DatabaseFileInvalidJSON,
  DatabaseFileInvalidRecord,
  DatabaseFileDeletionInSnapshot,
  DatabaseTooOld,
}

export class DownloadError extends Error {
  code: DownloadErrorCode;

  constructor(code: DownloadErrorCode, ...params: any[]) {
    super(...params);
    Object.setPrototypeOf(this, DownloadError.prototype);

    if (typeof Error.captureStackTrace === 'function') {
      Error.captureStackTrace(this, DownloadError);
    }

    this.name = 'DownloadError';
    this.code = code;
  }
}

export async function hasLanguage({
  baseUrl = DEFAULT_BASE_URL,
  dbName,
  majorVersion,
  lang,
}: {
  baseUrl?: string;
  dbName: string;
  majorVersion: number;
  lang: string;
}): Promise<boolean> {
  const abortController = new AbortController();

  try {
    await getVersionInfo({
      baseUrl,
      dbName,
      majorVersion,
      lang,
      signal: abortController.signal,
    });
    return true;
  } catch (e) {
    return false;
  }
}

export function download<EntryLine, DeletionLine>({
  baseUrl = DEFAULT_BASE_URL,
  dbName,
  majorVersion,
  currentVersion,
  lang,
  maxProgressResolution = DEFAULT_MAX_PROGRESS_RESOLUTION,
  forceFetch = false,
  isEntryLine,
  isDeletionLine,
}: DownloadOptions<EntryLine, DeletionLine>): ReadableStream {
  const abortController = new AbortController();

  // Edge does not yet support ReadableStream constructor so this will break
  return new ReadableStream({
    async start(
      controller: ReadableStreamDefaultController<
        DownloadEvent<EntryLine, DeletionLine>
      >
    ) {
      // Get the current version info
      let versionInfo: VersionInfo;
      try {
        versionInfo = await getVersionInfo({
          dbName,
          majorVersion,
          baseUrl,
          lang,
          signal: abortController.signal,
          forceFetch,
        });
      } catch (e) {
        controller.error(e);
        controller.close();
        return;
      }

      // Check the local database is not ahead of what we're about to download
      //
      // This can happen when the version file gets cached because we can
      // download a more recent version (e.g. we have DevTools open with "skip
      // cache" ticked) and then try again to fetch the file but get the older
      // version.
      if (currentVersion && compareVersions(currentVersion, versionInfo) > 0) {
        const versionToString = ({ major, minor, patch }: Version) =>
          `${major}.${minor}.${patch}`;
        controller.error(
          new DownloadError(
            DownloadErrorCode.DatabaseTooOld,
            `Database version (${versionToString(
              versionInfo
            )}) older than current version (${versionToString(currentVersion)})`
          )
        );
        controller.close();
        return;
      }

      // When we come to apply this approach to other databases it might make
      // sense to have a tolerance here where we skip loading all the
      // intermediate patches and jump to the nearest snapshot and start from
      // there instead.
      //
      // I suspect that tolerance would be pretty high, however, e.g. 100 or
      // more before it actually makes any sense.

      let currentPatch: number;
      if (
        !currentVersion ||
        // Check for a change in minor version
        compareVersions(currentVersion, {
          ...versionInfo,
          patch: 0,
        }) < 0
      ) {
        currentPatch = versionInfo.snapshot;
        try {
          for await (const event of getEvents({
            baseUrl,
            dbName,
            lang,
            maxProgressResolution,
            version: {
              major: versionInfo.major,
              minor: versionInfo.minor,
              patch: versionInfo.snapshot,
            },
            fileType: 'full',
            signal: abortController.signal,
            isEntryLine,
            isDeletionLine,
          })) {
            if (abortController.signal.aborted) {
              const abortError = new Error();
              abortError.name = 'AbortError';
              throw abortError;
            }
            controller.enqueue(event);
          }
        } catch (e) {
          controller.error(e);
          controller.close();
          return;
        }
      } else {
        currentPatch = currentVersion.patch;
      }

      // Do incremental updates
      while (currentPatch < versionInfo.patch) {
        currentPatch++;
        try {
          for await (const event of getEvents({
            baseUrl,
            dbName,
            lang,
            maxProgressResolution,
            version: {
              major: versionInfo.major,
              minor: versionInfo.minor,
              patch: currentPatch,
            },
            fileType: 'patch',
            signal: abortController.signal,
            isEntryLine,
            isDeletionLine,
          })) {
            if (abortController.signal.aborted) {
              const abortError = new Error();
              abortError.name = 'AbortError';
              throw abortError;
            }
            controller.enqueue(event);
          }
        } catch (e) {
          controller.error(e);
          controller.close();
          return;
        }
      }

      controller.close();
    },

    cancel() {
      abortController.abort();
    },
  });
}

type Version = {
  major: number;
  minor: number;
  patch: number;
};

function compareVersions(a: Version, b: Version): number {
  if (a.major < b.major) {
    return -1;
  }
  if (a.major > b.major) {
    return 1;
  }
  if (a.minor < b.minor) {
    return -1;
  }
  if (a.minor > b.minor) {
    return 1;
  }
  if (a.patch < b.patch) {
    return -1;
  }
  if (a.patch > b.patch) {
    return 1;
  }
  return 0;
}

let cachedVersionFile:
  | {
      contents: any;
      lang: string;
    }
  | undefined;

async function getVersionInfo({
  baseUrl,
  majorVersion,
  dbName,
  lang,
  signal,
  forceFetch = false,
}: {
  baseUrl: string;
  majorVersion: number;
  dbName: string;
  lang: string;
  signal: AbortSignal;
  forceFetch?: boolean;
}): Promise<VersionInfo> {
  let versionInfo;

  // Get the file if needed
  if (forceFetch || !cachedVersionFile || cachedVersionFile.lang !== lang) {
    // Fetch rejects the promise for network errors, but not for HTTP errors :(
    let response;
    try {
      response = await fetch(`${baseUrl}jpdict-rc-${lang}-version.json`, {
        signal,
      });
    } catch (e) {
      throw new DownloadError(
        DownloadErrorCode.VersionFileNotAccessible,
        `Version file not accessible (${e.message})`
      );
    }

    if (!response.ok) {
      const code =
        response.status === 404
          ? DownloadErrorCode.VersionFileNotFound
          : DownloadErrorCode.VersionFileNotAccessible;
      throw new DownloadError(
        code,
        `Version file not accessible (status: ${response.status})`
      );
    }

    // Try to parse it
    try {
      versionInfo = await response.json();
    } catch (e) {
      throw new DownloadError(
        DownloadErrorCode.VersionFileInvalid,
        `Invalid version object: ${e.message}`
      );
    }
  } else {
    versionInfo = cachedVersionFile.contents;
  }

  // Inspect and extract the database version information
  const dbVersionInfo = getCurrentDbVersionInfo(
    versionInfo,
    dbName,
    majorVersion
  );
  if (!dbVersionInfo) {
    throw new DownloadError(
      DownloadErrorCode.VersionFileInvalid,
      `Invalid version object: ${JSON.stringify(versionInfo)}`
    );
  }

  // Cache the file contents
  cachedVersionFile = {
    contents: versionInfo,
    lang,
  };

  return dbVersionInfo;
}

function getCurrentDbVersionInfo(
  a: any,
  dbName: string,
  majorVersion: number
): VersionInfo | null {
  if (!a || typeof a !== 'object') {
    return null;
  }

  if (typeof a[dbName] !== 'object' || a[dbName] === null) {
    return null;
  }

  if (
    typeof a[dbName][majorVersion] !== 'object' ||
    a[dbName][majorVersion] === null
  ) {
    throw new DownloadError(
      DownloadErrorCode.MajorVersionNotFound,
      `No ${majorVersion}.x version information for ${dbName} database`
    );
  }

  if (
    typeof a[dbName][majorVersion].major !== 'number' ||
    typeof a[dbName][majorVersion].minor !== 'number' ||
    typeof a[dbName][majorVersion].patch !== 'number' ||
    typeof a[dbName][majorVersion].snapshot !== 'number' ||
    (typeof a[dbName][majorVersion].databaseVersion !== 'string' &&
      typeof a[dbName][majorVersion].databaseVersion !== 'undefined') ||
    typeof a[dbName][majorVersion].dateOfCreation !== 'string'
  ) {
    return null;
  }

  const versionInfo = a[dbName][majorVersion] as VersionInfo;

  if (
    versionInfo.major < 1 ||
    versionInfo.minor < 0 ||
    versionInfo.patch < 0 ||
    versionInfo.snapshot < 0 ||
    !versionInfo.dateOfCreation.length
  ) {
    return null;
  }

  return versionInfo;
}

type HeaderLine = {
  type: 'header';
  version: Omit<DatabaseVersion, 'lang'>;
  records: number;
};

function isHeaderLine(a: any): a is HeaderLine {
  return (
    typeof a === 'object' &&
    a !== null &&
    typeof a.type === 'string' &&
    a.type === 'header' &&
    typeof a.version === 'object' &&
    typeof a.version.major === 'number' &&
    typeof a.version.minor === 'number' &&
    typeof a.version.patch === 'number' &&
    (typeof a.version.databaseVersion === 'string' ||
      typeof a.version.databaseVersion === 'undefined') &&
    typeof a.version.dateOfCreation === 'string' &&
    typeof a.records === 'number'
  );
}

async function* getEvents<EntryLine, DeletionLine>({
  baseUrl,
  dbName,
  lang,
  maxProgressResolution,
  version,
  fileType,
  signal,
  isEntryLine,
  isDeletionLine,
}: {
  baseUrl: string;
  dbName: string;
  lang: string;
  maxProgressResolution: number;
  version: Version;
  fileType: 'full' | 'patch';
  signal: AbortSignal;
  isEntryLine: (a: any) => a is EntryLine;
  isDeletionLine: (a: any) => a is DeletionLine;
}): AsyncIterableIterator<DownloadEvent<EntryLine, DeletionLine>> {
  const url = `${baseUrl}${dbName}-rc-${lang}-${version.major}.${version.minor}.${version.patch}-${fileType}.ljson`;

  // Fetch rejects the promise for network errors, but not for HTTP errors :(
  let response;
  try {
    response = await fetch(url, { signal });
  } catch (e) {
    throw new DownloadError(
      DownloadErrorCode.DatabaseFileNotFound,
      `Database file ${url} not accessible (${e.message})`
    );
  }

  if (!response.ok) {
    const code =
      response.status === 404
        ? DownloadErrorCode.DatabaseFileNotFound
        : DownloadErrorCode.DatabaseFileNotAccessible;
    throw new DownloadError(
      code,
      `Database file ${url} not accessible (status: ${response.status})`
    );
  }

  if (response.body === null) {
    throw new DownloadError(
      DownloadErrorCode.DatabaseFileNotAccessible,
      'Body is null'
    );
  }

  let headerRead = false;
  let lastProgressPercent = 0;
  let recordsRead = 0;
  let totalRecords = 0;

  for await (const line of ljsonStreamIterator(response.body)) {
    if (isHeaderLine(line)) {
      if (headerRead) {
        throw new DownloadError(
          DownloadErrorCode.DatabaseFileHeaderDuplicate,
          `Got duplicate database header: ${JSON.stringify(line)}`
        );
      }

      if (compareVersions(line.version, version) !== 0) {
        throw new DownloadError(
          DownloadErrorCode.DatabaseFileVersionMismatch,
          `Got mismatched database versions (Expected: ${JSON.stringify(
            version
          )} got: ${JSON.stringify(line.version)})`
        );
      }

      const versionEvent: VersionEvent = {
        ...line.version,
        type: 'version',
        partial: fileType === 'patch',
      };
      yield versionEvent;

      totalRecords = line.records;
      headerRead = true;
    } else {
      if (!headerRead) {
        throw new DownloadError(
          DownloadErrorCode.DatabaseFileHeaderMissing,
          `Expected database version but got ${JSON.stringify(line)}`
        );
      }

      recordsRead++;

      if (isEntryLine(line)) {
        const entryEvent: EntryEvent<EntryLine> = {
          type: 'entry',
          ...line,
        };
        yield entryEvent;
      } else if (isDeletionLine(line)) {
        // We shouldn't have deletion records when doing a full snapshot
        if (fileType === 'full') {
          throw new DownloadError(
            DownloadErrorCode.DatabaseFileDeletionInSnapshot
          );
        }

        const deletionEvent: DeletionEvent<DeletionLine> = {
          type: 'deletion',
          ...line,
        };
        yield deletionEvent;
      } else {
        // If we encounter anything unexpected we should fail.
        //
        // It might be tempting to make this "robust" by ignoring unrecognized
        // inputs but that could effectively leave us in an invalid state where
        // we claim to be update-to-date with database version X but are
        // actually missing some of the records.
        //
        // If anything unexpected shows up we should fail so we can debug
        // exactly what happenned.
        throw new DownloadError(
          DownloadErrorCode.DatabaseFileInvalidRecord,
          `Got unexpected record: ${JSON.stringify(line)}`
        );
      }
    }

    // Dispatch a new ProgressEvent if we have passed the appropriate threshold
    if (
      totalRecords &&
      recordsRead / totalRecords - lastProgressPercent > maxProgressResolution
    ) {
      lastProgressPercent = recordsRead / totalRecords;
      yield { type: 'progress', loaded: recordsRead, total: totalRecords };
    }
  }
}

async function* ljsonStreamIterator(
  stream: ReadableStream<Uint8Array>
): AsyncIterableIterator<object> {
  const reader = stream.getReader();
  const lineEnd = /\n|\r|\r\n/m;
  const decoder = new TextDecoder('utf-8');
  let buffer = '';

  const parseLine = (line: string): any => {
    let json;
    try {
      json = JSON.parse(line);
    } catch (e) {
      reader.releaseLock();
      throw new DownloadError(
        DownloadErrorCode.DatabaseFileInvalidJSON,
        `Could not parse JSON in database file: ${line}`
      );
    }

    return json;
  };

  while (true) {
    let readResult: ReadableStreamReadResult<Uint8Array>;
    try {
      readResult = await reader.read();
    } catch (e) {
      reader.releaseLock();
      throw new DownloadError(
        DownloadErrorCode.DatabaseFileNotAccessible,
        e.message
      );
    }

    const { done, value } = readResult;

    if (done) {
      buffer += decoder.decode();
      if (buffer) {
        yield parseLine(buffer);
        buffer = '';
      }

      reader.releaseLock();
      return;
    }

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split(lineEnd);

    // We don't know if the last line is actually the last line of the
    // input or not until we get done: true so we just assume it is
    // a partial line for now.
    buffer = lines.length ? lines.splice(lines.length - 1, 1)[0] : '';

    for (const line of lines) {
      if (!line) {
        continue;
      }

      yield parseLine(line);
    }
  }
}
