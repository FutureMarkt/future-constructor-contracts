# AI-ревью №2. Исправления

Черновик поверх отчёта `docs/reviews/2026-11-24-ai-review-2.md`. Это не заключение третьей стороны. `TokenFactory` не менялся.

| | |
| --- | --- |
| Дата | 2026-11-24 |
| Ветка | `cursor/ai-review-2-fixes-ad1e` |
| Коммит фиксов | `82504a0aaada711a6d35c680f26b59929c93576a` |
| Тесты | `test/AiReview2.poc.ts` |

## Статус

| ID | Severity | Статус | Коммит | Тест | Что сделано |
| --- | --- | --- | --- | --- | --- |
| AR2-01 | Medium | Исправлено | `82504a0aaada711a6d35c680f26b59929c93576a` | `AR2-01` | `AdvancedVestingWallet.renounceOwnership` всегда ревертит `RenounceDisabled`. Бенефициар меняется только через Ownable2Step. `release` по-прежнему платит текущему владельцу. |
| AR2-02 | Low | Исправлено | `82504a0aaada711a6d35c680f26b59929c93576a` | `AR2-02` | `startTimestamp == 0` заменяется на `block.timestamp`. Прошлое (`0 < start < block.timestamp`) ревертит `StartInPast`. |
| AR2-03 | Low | Принято | — | `AR2-03`, `AR2-03b` | Код не менялся. LP не-владельца платит налог на вход в помеченный пул и на выход из него. Записано в `contracts/advanced/README.md`, раздел Known behaviour. |
| AR2-04 | Low | Принято | — | `AR2-04` | Код не менялся. Непомеченный пул без налога. Владелец вызывает `setPool` для каждой пары. Тот же раздел README. |
| AR2-05 | Low | Исправлено | `82504a0aaada711a6d35c680f26b59929c93576a` | `AR2-05` | Секвенсор: `startedAt == 0` или будущее → `InvalidSequencerRound`; `answer != 0` → `SequencerDown`; grace 1 час (`<=`). `roundId`, `updatedAt` и `answeredInRound` больше не отбрасываются: неполный раунд → `StaleRound`, нулевой или будущий `updatedAt` → `InvalidSequencerRound`. Возраст `updatedAt` порогом в 1 час не режется: у этого фида нет ценового heartbeat, и такой порог отклонял бы живой статус «up». |
| AR2-06 | Info | Принято | — | `AR2-06` | Продакшен-код не менялся. Мок считает фактический вход, чтобы sell в тестах проходил. Настоящий `swapExactTokensForTokens` на налоговом токене падает на `K`. Интегратору нужен supporting-fee маршрут. Комментарий в моке и раздел Known behaviour. |
| AR2-07 | Info | Принято | — | `AR2-07` | Rescue не добавлен. У фабрики нет `receive`, прямой ETH ревертит. Случайный ERC-20 остаётся на фабрике. Функция вывода расширила бы власть владельца и в эту версию не входит. |
| AR2-08 | Info | Исправлено | `82504a0aaada711a6d35c680f26b59929c93576a` | `AR2-08` | `renounceOwnership` деплоера до `setFactory` ревертит `RenounceBeforeFactorySet`. После привязки отказ от владения слот не стирает. |

## AR1-08

Проверка `start + duration <= block.timestamp` осталась и считается уже после подстановки нуля. `start == 0` и `duration == 0` по-прежнему `VestingAlreadyFinished`. `start == 0` и положительная длительность — это старт «сейчас», а не 1970 год. Таймлок с будущим стартом и нулевой длительностью сохраняется. Регрессия: `AR1-08` в `test/AiReview1.poc.ts`.
