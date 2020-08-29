# Changelog

All notable changes to this project will be documented in this file. See [standard-version](https://github.com/conventional-changelog/standard-version) for commit guidelines.

### [5.3.1](https://github.com/birchill/hikibiki-data/compare/v5.3.0...v5.3.1) (2020-08-29)


### Bug Fixes

* Make download stream more pull-based ([63a8130](https://github.com/birchill/hikibiki-data/commit/63a81304e6b60d5b7b4efb51a194dc63fe4e2e25))

## [5.3.0](https://github.com/birchill/hikibiki-data/compare/v5.2.0...v5.3.0) (2020-08-29)


### Features

* Update to match changes in upstream database format ([79da3b4](https://github.com/birchill/hikibiki-data/commit/79da3b42b62d7b805c6f523403bcdc7489e93981))

## [5.2.0](https://github.com/birchill/hikibiki-data/compare/v5.1.1...v5.2.0) (2020-08-29)


### Features

* Report progress for updating the database ([6905c4e](https://github.com/birchill/hikibiki-data/commit/6905c4e1ce48ce99b764cfe1758ce634d4ed89c4))

### [5.1.1](https://github.com/birchill/hikibiki-data/compare/v5.1.0...v5.1.1) (2020-08-27)


### Bug Fixes

* Expose useful types and methods for dealing with names ([f6cb9e0](https://github.com/birchill/hikibiki-data/commit/f6cb9e03a5f77610de9160d5861daeb724c0d282))

## [5.1.0](https://github.com/birchill/hikibiki-data/compare/v5.0.1...v5.1.0) (2020-08-27)


### Features

* Export utilities for working with data series ([fcdb7f8](https://github.com/birchill/hikibiki-data/commit/fcdb7f871aa89250b971885628a15f9702124f06))

### [5.0.1](https://github.com/birchill/hikibiki-data/compare/v5.0.0...v5.0.1) (2020-08-26)


### Bug Fixes

* Export DataSeries and MajorDataSeries ([c4545d3](https://github.com/birchill/hikibiki-data/commit/c4545d3f27a3203c413931511e4fb87247f73172))

## [5.0.0](https://github.com/birchill/hikibiki-data/compare/v4.0.1...v5.0.0) (2020-08-26)


### ⚠ BREAKING CHANGES

* JpdictDatabase.setPreferredLanguage() is removed
* JpdictDatabase.getDbLang() is removed
* JpdictDatabase.update() requires the language to be specified
* The update state etc. is now per data series
* database.dataVersions is now database.dataVersion
* database.state is now database.dataState[series]

### Features

* Add JpdictDatabase.deleteSeries ([1126d75](https://github.com/birchill/hikibiki-data/commit/1126d7519c473c7f4373a0efd726e15290bc738b))
* Add support for looking up names dictionary ([5b52258](https://github.com/birchill/hikibiki-data/commit/5b5225869e47693434feb5c14eea2e58686699d5))
* Allow specifying which series to download ([bb286fa](https://github.com/birchill/hikibiki-data/commit/bb286fab7ae59e0063a8fc6e20129ebb3e586e5d))
* Made updates of different major data series independent ([893ec1a](https://github.com/birchill/hikibiki-data/commit/893ec1ae7d588642b3311b804346c25e0cdbffab))
* Make each data series have its only status ([1421aed](https://github.com/birchill/hikibiki-data/commit/1421aed9bc5b08557b7404ffb7b4bda981448174))
* Rename dataVersions to dataVersion ([24c05a8](https://github.com/birchill/hikibiki-data/commit/24c05a8ecd22ee491c91c991925a0dbda256e64a))
* Specify the language to download when updating ([eb19b42](https://github.com/birchill/hikibiki-data/commit/eb19b4207b3a32b81f7126828497177d4bb46552))

### [4.0.1](https://github.com/birchill/hikibiki-data/compare/v4.0.0...v4.0.1) (2020-07-09)

## [4.0.0](https://github.com/birchill/hikibiki-data/compare/v3.0.0...v4.0.0) (2020-07-09)


### ⚠ BREAKING CHANGES

* New database name and format

### Features

* Update to new datastore format and location ([c629b6f](https://github.com/birchill/hikibiki-data/commit/c629b6f3024a90f8fb6dfdeb036189918e6deb77))

## [3.0.0](https://github.com/birchill/hikibiki-data/compare/v2.5.0...v3.0.0) (2020-05-04)


### ⚠ BREAKING CHANGES

* cf is now an array of expanded kanji records

### Features

* Look up related kanji ([eac5e1e](https://github.com/birchill/hikibiki-data/commit/eac5e1ed9d211beebe86abab2f95c253aad726e5))

## [2.5.0](https://github.com/birchill/hikibiki-data/compare/v2.4.0...v2.5.0) (2020-05-02)


### Features

* Support jlptn field ([ee30cd5](https://github.com/birchill/hikibiki-data/commit/ee30cd5ab93f7dd6075692fd9bb91bd5ea2a6ac1))

## [2.4.0](https://github.com/birchill/hikibiki-data/compare/v2.3.0...v2.4.0) (2020-04-13)


### Features

* Export cf field from kanji records ([e16c235](https://github.com/birchill/hikibiki-data/commit/e16c23537d0098c63bd4efd2d49364cbcda411ca))
* Expose base radical kanji (for linking) ([561b63f](https://github.com/birchill/hikibiki-data/commit/561b63ff9011ea8a147a567751cdf53927c0ce45))
* Handle component variants array ([4207441](https://github.com/birchill/hikibiki-data/commit/42074413bc9f7e32c4592aae4c984339d5281161))

## [2.3.0](https://github.com/birchill/hikibiki-data/compare/v2.2.2...v2.3.0) (2020-03-11)


### Features

* Add better handling of radical and component variants ([2323d91](https://github.com/birchill/hikibiki-data/commit/2323d91079b8f5beea6f5bda96606072293f7608))
* Update to using bushu database version 2 ([a005e92](https://github.com/birchill/hikibiki-data/commit/a005e924dcd340e5e8f4f40077862361128661e9))

### [2.2.2](https://github.com/birchill/hikibiki-data/compare/v2.2.1...v2.2.2) (2020-02-24)

### [2.2.1](https://github.com/birchill/hikibiki-data/compare/v2.2.0...v2.2.1) (2019-12-20)


### Bug Fixes

* Don't reset the retryCount on successful download if we failed due to a database update ([cdd7b3f](https://github.com/birchill/hikibiki-data/commit/cdd7b3f71ebc9e9609de32cc759bfd0a35285dbc))
* Don't update the database version until we have successfully committed the data ([1b220b5](https://github.com/birchill/hikibiki-data/commit/1b220b5ac26aeb6757e3fcf44d95b2c92c00fc7f))

## [2.2.0](https://github.com/birchill/hikibiki-data/compare/v2.1.0...v2.2.0) (2019-12-20)


### Features

* Add auto-retry on ConstraintErrors ([d40b241](https://github.com/birchill/hikibiki-data/commit/d40b241a9ecef2bded8e3587c364294289b3b720))

## [2.1.0](https://github.com/birchill/hikibiki-data/compare/v2.0.0...v2.1.0) (2019-12-18)


### Features

* Rename and expose ErrorState as UpdateErrorState ([29a9609](https://github.com/birchill/hikibiki-data/commit/29a9609e77998f318abd3fc57ab9d91a8f2468d1))


### Bug Fixes

* Make all parameters to onUpdateError be included in option bag ([682abd0](https://github.com/birchill/hikibiki-data/commit/682abd04153dea1c9f3628f97243b74751665227))

## [2.0.0](https://github.com/birchill/hikibiki-data/compare/v1.6.1...v2.0.0) (2019-12-18)


### Features

* Factor retry functionality into a separate utility method ([13b89f2](https://github.com/birchill/hikibiki-data/commit/13b89f22627f88ad095f853d3bbd9bff82667dca))


### Bug Fixes

* Cancel retries when the database is deleted ([96a3742](https://github.com/birchill/hikibiki-data/commit/96a374215cc8254a604c17144c842602b16a0df9))
* Consistently reset retryCount ([86e16b1](https://github.com/birchill/hikibiki-data/commit/86e16b1617d5eb0833ff46edff1912ff579a0fa1))
* Drop no-longer-available retry-related members from CloneableErrorUpdateState ([2282dfe](https://github.com/birchill/hikibiki-data/commit/2282dfe7650d6487dcd70c61f454a5c0a06be3b9))
* Ignore exceptions from aborting an already aborted transaction ([3088527](https://github.com/birchill/hikibiki-data/commit/308852701c27c402f80124ff1471b22506f9bfb4))
* Report offline status ([d60a283](https://github.com/birchill/hikibiki-data/commit/d60a28376ed8df3ef0e34fd69e5cbbe48dc5df23))

### [1.6.1](https://github.com/birchill/hikibiki-data/compare/v1.6.0...v1.6.1) (2019-12-12)


### Bug Fixes

* Pass verbose flag to update ([903fccc](https://github.com/birchill/hikibiki-data/commit/903fccc9c986227045a1f70133e0885a6bc69060))

## [1.6.0](https://github.com/birchill/hikibiki-data/compare/v1.5.6...v1.6.0) (2019-12-12)


### Features

* Hide logging behind a verbose option ([69cea4a](https://github.com/birchill/hikibiki-data/commit/69cea4a03e39488b39e722f340b2f4daffde2888))

### [1.5.6](https://github.com/birchill/hikibiki-data/compare/v1.5.5...v1.5.6) (2019-12-12)


### Bug Fixes

* Add logging for re-used updates and tighten up update promises ([24cee2a](https://github.com/birchill/hikibiki-data/commit/24cee2a952fcb1252837a50166a282665505f9ed))
* Moar logging ([4b22043](https://github.com/birchill/hikibiki-data/commit/4b22043ab62a610f3b85c047169a6f1c685621df))

### [1.5.5](https://github.com/birchill/hikibiki-data/compare/v1.5.4...v1.5.5) (2019-12-11)


### Bug Fixes

* Add some more logging ([d714fa2](https://github.com/birchill/hikibiki-data/commit/d714fa2df9b153ff97877c751d427a1f75c72199))

### [1.5.4](https://github.com/birchill/hikibiki-data/compare/v1.5.3...v1.5.4) (2019-12-11)


### Bug Fixes

* Don't wait for transaction end for write transactions ([86e649c](https://github.com/birchill/hikibiki-data/commit/86e649c78627f83a9d6504c342b96f633d377209))
* Tighten up bulk add method error handling ([5c14c36](https://github.com/birchill/hikibiki-data/commit/5c14c3662c40cd9b702f4378230a7f46388ab945))

### [1.5.3](https://github.com/birchill/hikibiki-data/compare/v1.5.2...v1.5.3) (2019-12-10)


### Bug Fixes

* Add even more logging ([db39ca7](https://github.com/birchill/hikibiki-data/commit/db39ca793119982d77b3464124ff568c6cddcdb9))

### [1.5.2](https://github.com/birchill/hikibiki-data/compare/v1.5.1...v1.5.2) (2019-12-10)


### Bug Fixes

* Add some logging ([30212b7](https://github.com/birchill/hikibiki-data/commit/30212b729e193230a4dbaa185f728f8189761555))

### [1.5.1](https://github.com/birchill/hikibiki-data/compare/v1.5.0...v1.5.1) (2019-12-09)


### Bug Fixes

* Set initial version to 10 ([6aac747](https://github.com/birchill/hikibiki-data/commit/6aac747d1a7d4d8a32eaa12b70ac7610e065063a))

## [1.5.0](https://github.com/birchill/hikibiki-data/compare/v1.4.1...v1.5.0) (2019-12-09)


### Features

* Replace dexie with idb ([3beaa22](https://github.com/birchill/hikibiki-data/commit/3beaa22c0728f7f204fe6ac230e06b7781511c63))

### [1.4.1](https://github.com/birchill/hikibiki-data/compare/v1.4.0...v1.4.1) (2019-12-04)


### Bug Fixes

* Add version file URL to error message ([c4172e3](https://github.com/birchill/hikibiki-data/commit/c4172e3da5d3bbee7d2dcbb0a57653e3cdbc399f))
* Clear retry interval after a successful download ([ca296cd](https://github.com/birchill/hikibiki-data/commit/ca296cdbc5c6421a7e6b6f834d62b003942d469c))
* Handle errors when fetching database version ([f0399b6](https://github.com/birchill/hikibiki-data/commit/f0399b6e1ce80c5b315f8ce242c948732eb66529))
* Make sure to clear in-progress updates when finishing the current version fails ([3c9660d](https://github.com/birchill/hikibiki-data/commit/3c9660d70706282c3dcfff2290ab1d8e9c609683))

## [1.4.0](https://github.com/birchill/hikibiki-data/compare/v1.3.5...v1.4.0) (2019-12-03)


### Features

* Add url field to DownloadError ([8c484ed](https://github.com/birchill/hikibiki-data/commit/8c484ed82548f82cbd5f56cc57c44327e64f4390))

### [1.3.5](https://github.com/birchill/hikibiki-data/compare/v1.3.4...v1.3.5) (2019-11-29)


### Bug Fixes

* Handle unavailable database in getDbLang ([4af80ed](https://github.com/birchill/hikibiki-data/commit/4af80ed950885dd26d017d95325041f68e2e89e7))

### [1.3.4](https://github.com/birchill/hikibiki-data/compare/v1.3.3...v1.3.4) (2019-11-29)


### Bug Fixes

* Correctly ignore failures from async downloads ([6e11786](https://github.com/birchill/hikibiki-data/commit/6e11786dc75fdcd7bfd7ea06bb04d117357b1a43))

### [1.3.3](https://github.com/birchill/hikibiki-data/compare/v1.3.2...v1.3.3) (2019-11-29)


### Bug Fixes

* Work around Dexie bugs with MissingAPIErrors and auto-opening ([bee169f](https://github.com/birchill/hikibiki-data/commit/bee169f5c4c53cc98ee99d87b5a2a387ef76025f))

### [1.3.2](https://github.com/birchill/hikibiki-data/compare/v1.3.1...v1.3.2) (2019-11-28)


### Bug Fixes

* Fix incorrect comparison with null ([13057de](https://github.com/birchill/hikibiki-data/commit/13057dedc662e36edc04d3ae47ea64e003fe37d7))
* Handle the unavailable state better ([0252988](https://github.com/birchill/hikibiki-data/commit/02529881c870d3c6ff33da4725ac273569db7833))

### [1.3.1](https://github.com/birchill/hikibiki-data/compare/v1.3.0...v1.3.1) (2019-11-28)


### Bug Fixes

* Don't wait for radicals query to complete if the database is unavailable ([f0bd600](https://github.com/birchill/hikibiki-data/commit/f0bd6002184227ba0aa5541593d78843119f21c1))
* Notify of change when going to unavailable state ([7b04a19](https://github.com/birchill/hikibiki-data/commit/7b04a19b2693c66a4e0f56bcb93855687679b494))

## [1.3.0](https://github.com/birchill/hikibiki-data/compare/v1.2.4...v1.3.0) (2019-11-28)


### Features

* Add unavailable state ([135203a](https://github.com/birchill/hikibiki-data/commit/135203afd0ac721445902925f4860c3352e47235))

### [1.2.4](https://github.com/birchill/hikibiki-data/compare/v1.2.3...v1.2.4) (2019-11-27)


### Bug Fixes

* Be more forgiving of the error object when reporting file not accessible errors ([8ca76b8](https://github.com/birchill/hikibiki-data/commit/8ca76b8e810a1d293722faddf6fd411463f68003))
* Improve handling of setting the preferred language ([608be8b](https://github.com/birchill/hikibiki-data/commit/608be8b074c3b512ff229c37d57d8417c396e3e5))

### [1.2.3](https://github.com/birchill/hikibiki-data/compare/v1.2.2...v1.2.3) (2019-11-09)


### Bug Fixes

* Add pinyin to Readings type ([4350fe1](https://github.com/birchill/hikibiki-data/commit/4350fe1))

### [1.2.2](https://github.com/birchill/hikibiki-data/compare/v1.2.1...v1.2.2) (2019-10-31)

### [1.2.1](https://github.com/birchill/hikibiki-data/compare/v1.2.0...v1.2.1) (2019-10-16)


### Bug Fixes

* Fix broken language check ([2b0a2f3](https://github.com/birchill/hikibiki-data/commit/2b0a2f3))

## [1.2.0](https://github.com/birchill/hikibiki-data/compare/v1.1.1...v1.2.0) (2019-10-16)


### Bug Fixes

* Log warning if we try to generate a katakana record for a language we don't recognize ([6e148c6](https://github.com/birchill/hikibiki-data/commit/6e148c6))


### Features

* Add generation of data for katakana components ([f60b7f7](https://github.com/birchill/hikibiki-data/commit/f60b7f7))
* Add onWarning callback for logging non-fatal but unexpected data errors ([0f226fb](https://github.com/birchill/hikibiki-data/commit/0f226fb))

### [1.1.1](https://github.com/birchill/hikibiki-data/compare/v1.1.0...v1.1.1) (2019-10-15)

## [1.1.0](https://github.com/birchill/hikibiki-data/compare/v1.0.4...v1.1.0) (2019-10-14)


### Features

* Add utility functions for making a postMessage-able version of UpdateState ([a661e40](https://github.com/birchill/hikibiki-data/commit/a661e40))

### [1.0.4](https://github.com/birchill/hikibiki-data/compare/v1.0.3...v1.0.4) (2019-10-11)

### [1.0.3](https://github.com/birchill/hikibiki-data/compare/v1.0.2...v1.0.3) (2019-10-10)


### Bug Fixes

* Include sourceContent in source maps ([b49c829](https://github.com/birchill/hikibiki-data/commit/b49c829))

### [1.0.2](https://github.com/birchill/hikibiki-data/compare/v1.0.1...v1.0.2) (2019-10-10)


### Bug Fixes

* Drop deep-equal ([e94bd70](https://github.com/birchill/hikibiki-data/commit/e94bd70))

### [1.0.1](https://github.com/birchill/hikibiki-data/compare/v1.0.0...v1.0.1) (2019-10-09)


### Bug Fixes

* Make sure we re-build before publishing ([6ccdd2e](https://github.com/birchill/hikibiki-data/commit/6ccdd2e))

## [1.0.0](https://github.com/birchill/hikibiki-data/compare/v0.0.2...v1.0.0) (2019-10-09)


### Bug Fixes

* Add missing UpdatingDbUpdateState ([62725b4](https://github.com/birchill/hikibiki-data/commit/62725b4))
* Drop cloneable update states ([aa766d5](https://github.com/birchill/hikibiki-data/commit/aa766d5))

### 0.0.2 (2019-10-09)
