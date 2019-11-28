# Changelog

All notable changes to this project will be documented in this file. See [standard-version](https://github.com/conventional-changelog/standard-version) for commit guidelines.

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
