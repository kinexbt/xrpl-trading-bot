# XRPL Trading Bot

A comprehensive automated trading bot built for the XRP Ledger (XRPL) ecosystem. This bot provides advanced trading strategies including AMM operations, sniping, copy trading, and dollar-cost averaging (DCA) with professional-grade execution and risk management.

## Features

- **AMM Trading**: Automated Market Maker buy/sell operations with liquidity pool interactions
- **Token Sniping**: Fast execution trading for new token launches and market opportunities  
- **Copy Trading**: Mirror trades from successful wallets with customizable parameters
- **DCA Strategy**: Dollar-cost averaging with flexible scheduling and position sizing
- **Real-time Monitoring**: Live market data and trade execution tracking
- **Risk Management**: Built-in stop-loss, take-profit, and position sizing controls

## Installation

```bash
git clone https://github.com/kinexbt/xrpl-trading-bot.git
cd xrpl-trading-bot
npm install
```

## Configuration

Create a `.env` file in the project root:

```env
# XRPL Network Configuration
XRPL_NETWORK=mainnet
XRPL_SERVER=wss://xrplcluster.com

# Wallet Configuration
WALLET_SEED=your_wallet_seed_here
WALLET_ADDRESS=your_wallet_address_here

# Trading Parameters
DEFAULT_SLIPPAGE=0.5
MAX_POSITION_SIZE=1000
STOP_LOSS_PERCENT=5
TAKE_PROFIT_PERCENT=20

# API Keys (if using external data sources)
CMC_API_KEY=your_coinmarketcap_api_key
TELEGRAM_BOT_TOKEN=your_telegram_bot_token
TELEGRAM_CHAT_ID=your_telegram_chat_id
```

## Quick Start

```javascript
const XRPLTradingBot = require('./src/bot');

const bot = new XRPLTradingBot({
  network: 'mainnet',
  seed: process.env.WALLET_SEED,
  strategies: ['amm', 'sniper', 'dca']
});

// Start the bot
await bot.start();
```

## Trading Strategies

### AMM Trading

Automated trading on XRP Ledger's native AMM pools:

```javascript
// Configure AMM strategy
bot.configureStrategy('amm', {
  pools: ['XRP/USD', 'XRP/EUR'],
  buyThreshold: 0.02,  // 2% price drop
  sellThreshold: 0.05, // 5% price increase
  maxSlippage: 0.5,
  positionSize: 100
});
```

### Token Sniping

Fast execution for new token opportunities:

```javascript
// Configure sniping strategy
bot.configureStrategy('sniper', {
  watchTokens: ['new_token_issuer_address'],
  maxBuyAmount: 500,
  gasLimit: 10,
  slippageTolerance: 10,
  stopLoss: 20,
  takeProfit: 100
});
```

### Copy Trading

Mirror successful traders:

```javascript
// Configure copy trading
bot.configureStrategy('copytrading', {
  followWallets: [
    'rWallet1Address...',
    'rWallet2Address...'
  ],
  copyRatio: 0.1,      // Copy 10% of their position size
  maxCopyAmount: 1000,
  blacklistTokens: ['scam_token_address']
});
```

### Dollar Cost Averaging (DCA)

Systematic accumulation strategy:

```javascript
// Configure DCA strategy
bot.configureStrategy('dca', {
  targetToken: 'USD',
  buyAmount: 50,
  interval: '1h',      // Every hour
  maxTotalInvestment: 5000,
  priceThresholds: {
    pause: 2.0,        // Pause if XRP > $2.0
    resume: 1.5        // Resume if XRP < $1.5
  }
});
```

## API Reference

### Core Methods

#### `start()`
Initializes the bot and begins trading operations.

#### `stop()`
Gracefully stops the bot and closes all connections.

#### `getBalance(currency?)`
Returns current wallet balance for specified currency or all holdings.

#### `getPositions()`
Returns all current trading positions and their P&L.

#### `executeManualTrade(params)`
Execute a manual trade with specified parameters.

### Event Listeners

```javascript
bot.on('trade_executed', (trade) => {
  console.log('Trade executed:', trade);
});

bot.on('error', (error) => {
  console.error('Bot error:', error);
});

bot.on('balance_update', (balance) => {
  console.log('Balance updated:', balance);
});
```

## Risk Management

The bot includes several risk management features:

- **Position Sizing**: Automatic calculation based on account size and risk tolerance
- **Stop Losses**: Configurable stop-loss percentages for all strategies
- **Daily Limits**: Maximum daily trading amounts and loss limits
- **Slippage Protection**: Automatic trade rejection if slippage exceeds threshold
- **Blacklist Protection**: Token and wallet blacklisting capabilities

## Monitoring and Alerts

### Telegram Integration

Configure Telegram notifications for trade alerts:

```javascript
bot.enableTelegramAlerts({
  token: process.env.TELEGRAM_BOT_TOKEN,
  chatId: process.env.TELEGRAM_CHAT_ID,
  notifications: ['trades', 'errors', 'daily_summary']
});
```

### Web Dashboard

Access the web interface at `http://localhost:3000` after starting:

```bash
npm run dashboard
```

## Testing

Run the test suite:

```bash
# Unit tests
npm test

# Integration tests with testnet
npm run test:integration

# Backtesting with historical data
npm run backtest
```

## Security Considerations

- Never commit your `.env` file with real credentials
- Use testnet for development and testing
- Implement proper key management for production
- Monitor bot activity regularly
- Set appropriate position limits
- Use hardware wallets for large amounts

## Disclaimer

This trading bot is for educational and research purposes. Cryptocurrency trading carries significant financial risk. Users are responsible for:

- Understanding the risks involved
- Complying with local regulations
- Managing their own funds safely
- Testing thoroughly before live trading

**Use at your own risk. The developers are not responsible for any financial losses.**

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/new-strategy`)
3. Commit your changes (`git commit -am 'Add new strategy'`)
4. Push to the branch (`git push origin feature/new-strategy`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- XRPL Foundation for the robust ledger infrastructure
- Community contributors and testers
- Open source libraries that made this project possible

---

**⚠️ Trading cryptocurrencies involves substantial risk of loss and is not suitable for all investors.**
