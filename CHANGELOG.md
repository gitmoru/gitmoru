# Changelog

## [0.9.0](https://github.com/gitmoru/gitmoru/compare/v0.8.0...v0.9.0) (2026-08-08)


### Features

* greet the first run, and drop a claim we never checked ([#37](https://github.com/gitmoru/gitmoru/issues/37)) ([a8e899d](https://github.com/gitmoru/gitmoru/commit/a8e899d97f87640c8d6a0b696168ddd385956824))

## [0.8.0](https://github.com/gitmoru/gitmoru/compare/v0.7.0...v0.8.0) (2026-08-08)


### Features

* check self-hosted runners and when secrets last changed ([#35](https://github.com/gitmoru/gitmoru/issues/35)) ([39b7cc6](https://github.com/gitmoru/gitmoru/commit/39b7cc610c64ed8b4d187e8553cc5ccedce69b9a))
* report forks and collaborators added, which need no permissions ([#33](https://github.com/gitmoru/gitmoru/issues/33)) ([a7287d4](https://github.com/gitmoru/gitmoru/commit/a7287d49e53f720546ab823c94147f6d9fb60650))
* say which repositories can be checked before the check runs ([#30](https://github.com/gitmoru/gitmoru/issues/30)) ([44b173b](https://github.com/gitmoru/gitmoru/commit/44b173b033073421546f4f2f35c1679630e8e7ea))

## [0.7.0](https://github.com/gitmoru/gitmoru/compare/v0.6.0...v0.7.0) (2026-08-08)


### Features

* record what a scan cost and say when the budget runs low ([#23](https://github.com/gitmoru/gitmoru/issues/23)) ([9a27968](https://github.com/gitmoru/gitmoru/commit/9a279689315f9595d2012b92b1b9b725fb7243c1))


### Bug Fixes

* count commits lost once instead of once per overwrite ([#28](https://github.com/gitmoru/gitmoru/issues/28)) ([762ed70](https://github.com/gitmoru/gitmoru/commit/762ed70b4e6376a2c4c25d0fb1642dd4d8ef730d))


### Performance Improvements

* read commit dates from the compare we already made ([#26](https://github.com/gitmoru/gitmoru/issues/26)) ([f7c27ff](https://github.com/gitmoru/gitmoru/commit/f7c27ffe080544802d0f78fef63f3dc2488846cf))

## [0.6.0](https://github.com/gitmoru/gitmoru/compare/v0.5.0...v0.6.0) (2026-08-07)


### Features

* read what a changed workflow actually says ([#20](https://github.com/gitmoru/gitmoru/issues/20)) ([01cc7be](https://github.com/gitmoru/gitmoru/commit/01cc7be75b05fab826cb204239a888f569c6bb9b))

## [0.5.0](https://github.com/gitmoru/gitmoru/compare/v0.4.0...v0.5.0) (2026-08-07)


### Features

* report an action pin that was loosened from a commit to a tag ([#15](https://github.com/gitmoru/gitmoru/issues/15)) ([5f86950](https://github.com/gitmoru/gitmoru/commit/5f86950ad0788cace3675d3fbc2d745409761f94))

## [0.4.0](https://github.com/gitmoru/gitmoru/compare/v0.3.0...v0.4.0) (2026-08-07)


### Features

* report when a branch stopped signing inside the window ([#13](https://github.com/gitmoru/gitmoru/issues/13)) ([62108a8](https://github.com/gitmoru/gitmoru/commit/62108a89818cfa8584dbddf62384209c38cda4b3))


### Bug Fixes

* say so when a list stops at the page cap ([#10](https://github.com/gitmoru/gitmoru/issues/10)) ([055444c](https://github.com/gitmoru/gitmoru/commit/055444c6b3d9b64a0295a0c5f0cfe2b38de0eaa6))

## [0.3.0](https://github.com/gitmoru/gitmoru/compare/v0.2.0...v0.3.0) (2026-08-07)


### Features

* report repositories that went public during the window ([#8](https://github.com/gitmoru/gitmoru/issues/8)) ([46b2d03](https://github.com/gitmoru/gitmoru/commit/46b2d03ab29e51617a2af9a32a546982c179e001))


### Bug Fixes

* upgrade npm on the runner so trusted publishing can authenticate ([45d9064](https://github.com/gitmoru/gitmoru/commit/45d9064049ace1cfd7a019387a262448ad8fb41c))

## [0.2.0](https://github.com/gitmoru/gitmoru/compare/v0.1.0...v0.2.0) (2026-08-07)


### Features

* print the version so a bug report can name one ([b6c07de](https://github.com/gitmoru/gitmoru/commit/b6c07de118071fe771b3dc74d81b5d130f336c11))


### Bug Fixes

* put back the manifest that records the current version ([ccaadf0](https://github.com/gitmoru/gitmoru/commit/ccaadf0e9cddb5b5ed2174fb3804a24071b8af32))
