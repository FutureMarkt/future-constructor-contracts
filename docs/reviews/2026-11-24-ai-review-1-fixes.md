# AI-ревью №1. Исправления

Черновик поверх отчёта `docs/reviews/2026-11-24-ai-review-1.md`. Это не аудит и не заключение третьей стороны. `TokenFactory` не менялся.

| | |
| --- | --- |
| Дата | 2026-11-24 |
| Ветка | `cursor/ai-review-1-fixes-ad1e` |
| Коммит фиксов | `537bc2efca43f125af32bce0130b8e4275c04fb1` |
| Тесты | `test/AiReview1.poc.ts` |

## Статус

| ID | Severity | Статус | Коммит | Тест | Что сделано |
| --- | --- | --- | --- | --- | --- |
| AR1-01 | Medium | Исправлено | `537bc2efca43f125af32bce0130b8e4275c04fb1` | `AR1-01` | `renounceOwnership` у токена и у фабрики ревертит `RenounceWhilePaused`, пока контракт на паузе. После `unpause` перевод и деплой снова проходят. |
| AR1-02 | Medium | Исправлено | `537bc2efca43f125af32bce0130b8e4275c04fb1` | `AR1-02` | Конструктор фабрики принимает `sequencerUptimeFeed`. Ноль отключает проверку. Иначе реверт, если ответ не 0, `startedAt` равен 0 или в будущем, либо с подъёма прошло не больше `SEQUENCER_GRACE_PERIOD` (1 час, сравнение `<=`). |
| AR1-03 | Low | Исправлено | `537bc2efca43f125af32bce0130b8e4275c04fb1` | `AR1-03` | `_quoteTax` возвращает 0, если `from` или `to` равен `address(0)`. Mint в пул и burn из пула двигают полную сумму. |
| AR1-04 | Low | Исправлено | `537bc2efca43f125af32bce0130b8e4275c04fb1` | `AR1-04` | `AdvancedVestingWallet` наследует `Ownable2Step`. Один `transferOwnership` не меняет получателя `release`. Новый владелец получает поток только после `acceptOwnership`. |
| AR1-05 | Low | Исправлено | `537bc2efca43f125af32bce0130b8e4275c04fb1` | `AR1-05` | Деплоеры на `Ownable2Step`. Один `transferOwnership` не даёт вызвать `setFactory`. Текущий владелец успевает привязать фабрику. После привязки новый владелец её не переписывает. |
| AR1-06 | Low | Исправлено | `537bc2efca43f125af32bce0130b8e4275c04fb1` | `AR1-06` | `deployAdvancedToken` и `createVestingWallet` принимают `maxFee` в нативной монете. Квота выше `maxFee` ревертит `FeeAboveMax`. Сдача при принятой квоте возвращается как раньше. |
| AR1-07 | Info | Исправлено | `537bc2efca43f125af32bce0130b8e4275c04fb1` | `AR1-07` | `AdvancedTaxToken` ревертит `DecimalsOutOfRange`, если decimals больше 30. 30 проходит. |
| AR1-08 | Low | Исправлено | `537bc2efca43f125af32bce0130b8e4275c04fb1` | `AR1-08` | `createVestingWallet` ревертит `VestingAlreadyFinished`, если `start + duration <= block.timestamp`. Будущий старт и таймлок с duration 0 в будущем по-прежнему создаются. |

Отклонённых находок нет.

## Почему AR1-05 именно так

Вариант с `Ownable2Step` проще, чем предсказывать CREATE2-адрес фабрики и вызывать `setFactory` из её конструктора. Один шаг `transferOwnership` больше не отдаёт слот привязки. Текущий владелец может вызвать `setFactory` или отменить pending через `transferOwnership(address(0))`, пока новый владелец не принял роль.

Остаточный случай: двухшаговая передача, которую новый владелец уже принял, и `setFactory` ещё не вызван. Это уже смена владельца, а не опечатка в одном вызове. Привязка фабрики делается до такой передачи. После `setFactory` слот закрыт.
