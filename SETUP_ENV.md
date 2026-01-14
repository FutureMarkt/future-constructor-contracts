# Настройка .env файла

## Быстрый старт

1. **Скопируйте шаблон:**
   ```bash
   cp env.template .env
   ```

2. **Откройте файл `.env` в редакторе** и заполните обязательные переменные для Arbitrum:

## Обязательные переменные для деплоя на Arbitrum

```env
# Приватный ключ для деплоя (БЕЗ префикса 0x)
ARBITRUM_PRIVATE_KEY=your_private_key_here_without_0x

# Chainlink Aggregator (уже заполнен, менять не нужно)
CHAINLINK_AGGREGATOR_ARBITRUM=0x639Fe6ab55C921f74e7fac1ee960C0B6293ba612
```

## Опциональные переменные (рекомендуется)

```env
# RPC URL (если используете Alchemy/Infura)
ARBITRUM_RPC_URL=https://arb-mainnet.g.alchemy.com/v2/YOUR_API_KEY

# Адрес для получения комиссий
FEE_RECIPIENT=0xYourFeeRecipientAddress

# Комиссия в USD (18 decimals)
# 0 = бесплатно, 2000000000000000000 = 2 USD
FEE_USD_WEI=0

# API ключ для верификации на Arbiscan
ARBISCAN_API_KEY=your_arbiscan_api_key
```

## Пример заполненного .env для Arbitrum

```env
ARBITRUM_PRIVATE_KEY=abcd1234efgh5678ijkl9012mnop3456qrst7890uvwxyz1234567890abcdef
ARBITRUM_RPC_URL=https://arb-mainnet.g.alchemy.com/v2/your_alchemy_api_key
CHAINLINK_AGGREGATOR_ARBITRUM=0x639Fe6ab55C921f74e7fac1ee960C0B6293ba612
FEE_RECIPIENT=
FEE_USD_WEI=0
ARBISCAN_API_KEY=
```

## Безопасность

⚠️ **ВАЖНО**: 
- Никогда не коммитьте файл `.env` в git
- Файл `.env` уже добавлен в `.gitignore`
- Не делитесь своим приватным ключом ни с кем
- Используйте отдельный кошелек для деплоя, не основной

## Проверка перед деплоем

Убедитесь, что:
1. ✅ Файл `.env` создан и заполнен
2. ✅ `ARBITRUM_PRIVATE_KEY` указан (БЕЗ префикса `0x`)
3. ✅ У вас есть ETH на Arbitrum One для газа
4. ✅ Контракты скомпилированы: `npm run compile`

## Следующий шаг

После настройки `.env` файла выполните деплой:

```bash
npm run deploy:arbitrum
```
