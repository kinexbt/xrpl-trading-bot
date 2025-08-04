# XRPL Sniper Bot

A specialized Telegram bot for automatically sniping new tokens on XRPL AMM pools.

## Features

- 🎯 **Automatic Token Sniping**: Detects and snipes new tokens as soon as they appear on XRPL AMM
- 🔒 **Rugcheck Protection**: Minimum liquidity requirements to avoid rug pulls
- 📋 **Whitelist Mode**: Only snipe specific tokens from your whitelist
- 🚀 **Auto Buy Mode**: Automatically snipe all new tokens with rugcheck
- 💰 **Custom Snipe Amounts**: Set your preferred XRP amount for each snipe
- ⚡ **Configurable Slippage**: Adjust slippage tolerance for better execution
- 🎯 **Auto-sell Multiplier**: Set profit targets for automatic selling
- 📊 **Real-time Monitoring**: Live tracking of sniper performance

## Setup

### Prerequisites

- Node.js (v16 or higher)
- MongoDB database
- Telegram Bot Token
- XRPL wallet with XRP

### Installation

1. **Clone or download the sniper bot files**
   ```bash
   # Copy sniper-bot.js and package-sniper.json to your project
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Create environment file**
   Create a `.env` file with:
   ```
   TELEGRAM_BOT_TOKEN=your_telegram_bot_token
   MONGODB_URI=your_mongodb_connection_string
   REFERRAL_ACCOUNT=your_referral_wallet_address
   ```

4. **Start the bot**
   ```bash
   npm start
   ```

## Usage

### Getting Started

1. **Start the bot** with `/start` command
2. **Configure sniper settings**:
   - Choose sniper mode (Auto Buy or Whitelist Only)
   - Set snipe amount
   - Configure minimum liquidity
   - Set auto-sell multiplier
   - Adjust slippage

3. **Add tokens to whitelist** (if using whitelist mode):
   - Go to "Whitelist Tokens"
   - Add token in format: `CURRENCY ISSUER_ADDRESS`
   - Example: `BTC rXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX`

4. **Start sniping**:
   - Click "Start Sniper"
   - Bot will automatically monitor for new tokens
   - Receive notifications for successful snipes

### Sniper Modes

#### Auto Buy Mode (with Rugcheck)
- Automatically snipes all new tokens
- Applies minimum liquidity check
- Recommended for experienced users

#### Whitelist Only Mode
- Only snipes tokens from your whitelist
- More conservative approach
- Better for beginners

### Settings

- **Snipe Amount**: XRP amount to spend on each snipe
- **Minimum Liquidity**: Minimum XRP liquidity required (rugcheck)
- **Auto-sell Multiplier**: Profit target for automatic selling
- **Slippage**: Maximum price slippage tolerance

## Safety Features

- ✅ Maximum snipe amount limit (5000 XRP)
- ✅ Minimum liquidity requirements
- ✅ Transaction validation
- ✅ Error handling and logging
- ✅ Real-time balance updates

## Commands

- `/start` - Initialize bot and show main menu
- Main menu options:
  - 💰 Balance - Check wallet balance
  - 🎯 Token Sniper - Configure and start sniper
  - 📋 Whitelist Tokens - Manage token whitelist
  - ⚙️ Settings - Bot configuration

## Important Notes

⚠️ **Risk Warning**: This bot uses real XRP for trading. Only use funds you can afford to lose.

⚠️ **Mainnet Only**: This bot operates on XRPL mainnet with real transactions.

⚠️ **No Guarantees**: Token sniping involves significant risk. Past performance doesn't guarantee future results.

## Support

For issues or questions:
1. Check the console logs for error messages
2. Verify your environment variables are correct
3. Ensure your MongoDB connection is working
4. Make sure your XRPL wallet has sufficient XRP

## License

MIT License - Use at your own risk. 