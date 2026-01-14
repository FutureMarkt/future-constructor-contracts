# Инструкция по деплою TokenFactory в сеть Arbitrum

## Требования

Перед деплоем убедитесь, что у вас есть:
1. ✅ Приватный ключ кошелька с ETH на Arbitrum One
2. ✅ Установлены все зависимости (`npm install`)
3. ✅ Скомпилированы контракты (`npm run compile`)

## Шаг 1: Добавьте переменные в `.env` файл

Добавьте следующие переменные в ваш `.env` файл (создайте его, если ещё не существует):

### Обязательные переменные:

```env
# Приватный ключ для деплоя (БЕЗ префикса 0x)
ARBITRUM_PRIVATE_KEY=your_private_key_here_without_0x

# Адрес Chainlink агрегатора для Arbitrum (ETH/USD)
# Это стандартный адрес, менять не нужно, если не уверены
CHAINLINK_AGGREGATOR_ARBITRUM=0x639Fe6ab55C921f74e7fac1ee960C0B6293ba612
```

### Опциональные переменные (рекомендуется):

```env
# RPC URL для Arbitrum (если не указано, используется публичный endpoint)
# Рекомендуется использовать Alchemy или Infura для более надежной работы
ARBITRUM_RPC_URL=https://arb1.arbitrum.io/rpc
# Или с API ключом (рекомендуется):
# ARBITRUM_RPC_URL=https://arb-mainnet.g.alchemy.com/v2/YOUR_API_KEY

# Адрес для получения комиссий (если не указан, используется адрес деплоящего кошелька)
FEE_RECIPIENT=0xYourFeeRecipientAddress

# Комиссия в USD (18 decimals). Примеры:
# 0 = бесплатно
# 2000000000000000000 = 2 USD (2 * 10^18)
FEE_USD_WEI=0

# API ключ Arbiscan для верификации контракта после деплоя (опционально)
ARBISCAN_API_KEY=your_arbiscan_api_key
```

## Шаг 2: Убедитесь, что у вас есть ETH на Arbitrum

⚠️ **ВАЖНО**: Вам нужен **ETH на Arbitrum One**, а не на Ethereum mainnet!

### Как получить ETH на Arbitrum:

1. **Используйте Arbitrum Bridge**:
   - Перейдите на https://bridge.arbitrum.io/
   - Подключите кошелек
   - Переведите ETH с Ethereum mainnet на Arbitrum One

2. **Используйте централизованную биржу**:
   - Многие биржи поддерживают прямой вывод на Arbitrum One
   - Проверьте, что выводите на сеть Arbitrum One (Chain ID: 42161)

3. **Используйте другие мосты**:
   - Hop Protocol: https://hop.exchange/
   - Stargate: https://stargate.finance/

### Минимальный баланс:

Рекомендуется иметь минимум **0.01 ETH** на Arbitrum для покрытия газа при деплое (обычно требуется ~0.001-0.005 ETH, но лучше иметь запас).

## Шаг 3: Деплой контракта

Выполните команду:

```bash
npm run deploy:arbitrum
```

Или напрямую через Hardhat:

```bash
npx hardhat run scripts/deploy-arbitrum.ts --network arbitrum
```

## Шаг 4: Проверка деплоя

После успешного деплоя скрипт выведет:
- ✅ Адрес задеплоенного контракта
- ✅ Transaction hash
- ✅ Номер блока
- ✅ Параметры контракта (price feed, fee recipient, owner)

**Скопируйте адрес контракта** - он понадобится для верификации и настройки фронтенда.

## Шаг 5: Верификация контракта (опционально)

Для верификации контракта на Arbiscan выполните:

```bash
npx hardhat verify --network arbitrum \
  <CONTRACT_ADDRESS> \
  "<AGGREGATOR_ADDRESS>" \
  "<FEE_RECIPIENT_ADDRESS>" \
  <FEE_USD_WEI>
```

Например:
```bash
npx hardhat verify --network arbitrum \
  0x1234567890123456789012345678901234567890 \
  "0x639Fe6ab55C921f74e7fac1ee960C0B6293ba612" \
  "0xYourFeeRecipientAddress" \
  0
```

⚠️ **Примечание**: Для верификации требуется установить `ARBISCAN_API_KEY` в `.env` файле.

## Пример полного `.env` файла для Arbitrum

```env
# Arbitrum Deployment
ARBITRUM_PRIVATE_KEY=abcd1234efgh5678ijkl9012mnop3456qrst7890uvwx
ARBITRUM_RPC_URL=https://arb-mainnet.g.alchemy.com/v2/YOUR_ALCHEMY_API_KEY
CHAINLINK_AGGREGATOR_ARBITRUM=0x639Fe6ab55C921f74e7fac1ee960C0B6293ba612

# Fee Configuration (опционально)
FEE_RECIPIENT=0xYourFeeRecipientAddressHere
FEE_USD_WEI=0

# Block Explorer (для верификации)
ARBISCAN_API_KEY=your_arbiscan_api_key_here
```

## Troubleshooting

### Ошибка: "Insufficient balance"
**Решение**: Убедитесь, что у вас есть ETH на Arbitrum One, а не на Ethereum mainnet.

### Ошибка: "CHAINLINK_AGGREGATOR_ARBITRUM is not set"
**Решение**: Добавьте переменную `CHAINLINK_AGGREGATOR_ARBITRUM` в `.env` файл.

### Ошибка: "Invalid aggregator address format"
**Решение**: Убедитесь, что адрес агрегатора указан правильно и начинается с `0x`.

### Ошибка: "Network error" или "Timeout"
**Решение**: 
- Попробуйте использовать другой RPC endpoint (Alchemy или Infura)
- Увеличьте `timeout` в `hardhat.config.ts` если используете медленный RPC

### Транзакция зависла
**Решение**: 
- Проверьте статус транзакции на https://arbiscan.io/
- Убедитесь, что у вас достаточно газа
- Попробуйте увеличить gas limit в скрипте деплоя

## Полезные ссылки

- **Arbiscan**: https://arbiscan.io/ - блок-эксплорер для Arbitrum
- **Arbitrum Bridge**: https://bridge.arbitrum.io/ - мост для перевода ETH
- **Chainlink Docs**: https://docs.chain.link/data-feeds/price-feeds/addresses?network=arbitrum
- **Hardhat Docs**: https://hardhat.org/docs

## Контакты Chainlink агрегаторов на Arbitrum

| Пара | Адрес агрегатора |
|------|------------------|
| ETH/USD | `0x639Fe6ab55C921f74e7fac1ee960C0B6293ba612` |
| BTC/USD | `0x6ce185860a4963106506C203335A2910413708e9` |

Для других пар смотрите [официальную документацию Chainlink](https://docs.chain.link/data-feeds/price-feeds/addresses?network=arbitrum).
