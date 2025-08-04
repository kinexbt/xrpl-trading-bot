
const TelegramBot = require('node-telegram-bot-api');
const { Wallet, Client, xrpToDrops } = require('xrpl');
const xrpl = require('xrpl');
const mongoose = require('mongoose');
const XRPLAMMChecker = require('./filterAmmCreate');
const cron = require('node-cron');
require('dotenv').config();
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const REFERRAL_ACCOUNT = process.env.REFERRAL_ACCOUNT;
const bot = new TelegramBot(TELEGRAM_BOT_TOKEN, { polling: true });
const activeCronJobs = new Map();
const MAINNET_SERVER = 'wss://xrplcluster.com';
let sniperIntervals = new Map();
let copyTradingIntervals = new Map();
const processedTransactions = new Set();
const SNIPER_CHECK_INTERVAL = 8000;
const MAX_TOKENS_PER_SCAN = 15;
const MAINNET_CONFIG = {
    MIN_LIQUIDITY: 100,
    MIN_HOLDERS: 5,     
    MIN_TRADING_ACTIVITY: 3, 
    MAX_SNIPE_AMOUNT: 5000,  
    EMERGENCY_STOP_LOSS: 0.3 
};

mongoose.connect(process.env.MONGODB_URI);

const userSchema = new mongoose.Schema({
    userId: { type: String, required: true, unique: true },
    telegramId: { type: Number, required: true, unique: true },
    username: String,
    publicKey: { type: String, required: true },
    privateKey: { type: String, required: true },
    walletAddress: { type: String, required: true, unique: true },
    seed: { type: String, required: true },
    password: String,
    balance: {
        XRP: { type: Number, default: 0 },
        USD: { type: Number, default: 0 }
    },
    tokens: {
        type: [{
            currency: String,
            issuer: String,
            balance: String,
            lastUpdated: { type: Date, default: Date.now }
        }],
        default: []
    },
    transactions: {
        type: [{
            type: { type: String },
            originalTxHash: { type: String },
            ourTxHash: { type: String },
            amount: { type: Number },
            tokenSymbol: { type: String },
            tokenAddress: { type: String },
            timestamp: { type: Date, default: Date.now },
            status: { type: String },
            traderAddress: { type: String },
            tokensReceived: { type: Number, default: 0 },
            actualRate: { type: String, default: '0' },
            xrpSpent: { type: Number, default: 0 },
            originalMethod: { type: String },
            originalXrpAmount: { type: Number }
        }],
        default: []
    },

    selectedSlippage: {
        type: Number,
        default: 4.0,
        min: 0.1,
        max: 50.0
    },

    copyTradersAddresses: { type: [String], default: [] },

    whiteListedTokens: {
        type: [{
            currency: String,
            issuer: String,
            balance: String,
            lastUpdated: { type: Date, default: Date.now }
        }],
        default: []
    },
    blackListedTokens: {
        type: [{
            currency: { type: String, required: true },
            issuer: { type: String, required: true },
            readableCurrency: { type: String }, // Human-readable currency name
            lastUpdated: { type: Date, default: Date.now }
        }],
        default: []
    },
    availableWithdrawTokens: {
        type: [{
            currency: String,
            issuer: String,
            balance: String,
            lastUpdated: { type: Date, default: Date.now }
        }],
        default: []
    },
    availableTokens: [{ type: Object }],
    selectedBuyAmount: Number,
    selectedSellAmount: Number,
    selectedSellToken: {
        type: {
            currency: String,
            issuer: String,
            balance: String,
            readableCurrency: String
        },
        default: null
    },
    selectedCustomAutoBuyAmount: Number,
    selectedBuyTokenAddress: String,
    selectedSellTokenAddress: String,
    selectedAllocationAmount: String,
    selectedAllocationDuration: String,
    selectedAllocationFrequency: String,
    selectedDCAToken: {
        currency: String,
        issuer: String,
        readableCurrency: { type: String, default: null }
    },
    customAllocationAmount: String,
    customMaxSpendAmount: Number,
    activeDCAs: [{
        id: String,
        startTime: Date,
        endTime: Date,
        toCurrency: String,
        toIssuer: String,
        readableCurrency: String,
        totalAmount: Number,
        amountPerInterval: Number,
        frequency: String,
        duration: Number,
        executedCount: { type: Number, default: 0 },
        totalSpent: { type: Number, default: 0 },
        totalTokensReceived: { type: Number, default: 0 },
        averageRate: { type: Number, default: 0 },
        status: { type: String, default: 'active' }, // active, stopped, completed
        transactions: [{
            hash: String,
            timestamp: Date,
            xrpSpent: Number,
            tokensReceived: Number,
            rate: Number
        }]
    }],
    selectedAutoSellMultiplier: String,
    selectedTradingAmountMode: String,
    selectedMatchTraderPercentage: Number,
    selectedMaxSpendPerTrade: Number,
    selectedSellTradingAmountMode: String,
    selectedSellMatchTraderPercentage: Number,
    selectedFixedAmountForCopyTrading: Number,
    selectedSniperBuyMode: { type: Boolean, default: false },
    selectedCustomSnipeAmount: String,
    selectedMinimumPoolLiquidity: Number,
    selectedRiskScore: String,
    selectedSnipeAmount: String,
    selectedSniperTransactionDevides: Number,
    selectedWithdrawToken: {
        currency: String,
        issuer: String,
        balance: String
    },
    selectedWithdrawAmount: String,
    selectedWithdrawPercentage: String,
    recipientAddress: String,

    copyTraderActive: { type: Boolean, default: false },
    copyTradingStartTime: { type: Date, default: Date.now },
    isBuyMode: {type: Boolean, default: true},
    isAutoBuyOnPaste: {type: Boolean, default: false},
    waitingForSelectedAutoBuyAmount: {type: Boolean, default: false},
    waitingForTraderRemoval: { type: Boolean, default: false },
    waitingForCustomBuyAmount: { type: Boolean, default: false },
    waitingForPassword: { type: Boolean, default: false },
    waitingForNewPassword: { type: Boolean, default: false },
    waitingForLimitToken: { type: Boolean, default: false },
    waitingForDCAToken: { type: Boolean, default: false },
    waitingForCustomAllocation: { type: Boolean, default: false },
    waitingForFixedAmountForCopyTrading: { type: Boolean, default: false },
    waitingForMinimumPoolLiquidity: { type: Boolean, default: false },
    waitingForCustomSnipeAmount: { type: Boolean, default: false },
    waitingForTradersAddresses: { type: Boolean, default: false },
    waitingForCustomSellMatchTraderPercentage: { type: Boolean, default: false }, // have to set
    waitingForCustomMatchTraderPercentage: { type: Boolean, default: false },   // have to set
    waitingForCustomAllocationAmount: { type: Boolean, default: false },    // have to set
    waitingForDuration: { type: Boolean, default: false },
    waitingForWhiteListedTokens: { type: Boolean, default: false },
    waitingForTokenRemoval: { type: Boolean, default: false },
    waitingForCustomWithdrawAmount: { type: Boolean, default: false },
    waitingForCustomeAutoSellMulti: {type: Boolean, default: false},
    updatedAt: { type: Date, default: Date.now },
    waitingForRecipientAddress: { type: Boolean, default: false },
    sniperActive: { type: Boolean, default: false },
    sniperStartTime: { type: Date },
    selectedSniperBuyMode: { type: Boolean, default: false },
    selectedMinimumPoolLiquidity: { type: Number, default: 1000 },
    sniperPurchases: [{
        currency: String,
        issuer: String,
        amount: Number, // XRP spent
        tokensReceived: String,
        purchasePrice: Number, // Price per token
        sellPrice: Number,
        txHash: String,
        sellTxHash: String,
        timestamp: Date,
        sellTimestamp: Date,
        status: { type: String, default: 'active' }, // 'active', 'sold', 'failed'
        profit: Number,
        profitPercentage: String
    }],

    limitOrders: [{
        currency: { type: String, required: true },
        issuer: { type: String, required: true },
        buyPriceLimit: { type: Number, default: null },
        sellPriceLimit: { type: Number, default: null },
        isActive: { type: Boolean, default: true },
        createdDate: { type: Date, default: Date.now },
        readableCurrency: String
    }],

    limitOrderState: {
        step: { type: String, default: null },
        currency: String,
        issuer: String,
        readableCurrency: String,
        buyPriceLimit: Number,
        sellPriceLimit: Number
    },
    cachedTokenInfo: {
        type: {
            currency: String,
            issuer: String,
            readableCurrency: String,
            ammInfo: {
                amount: String,
                amount2: {
                    currency: String,
                    issuer: String,
                    value: String
                }
            }
        },
        default: null
    },
    tokenInfoLastUpdated: { type: String }
});

const User = mongoose.model('User', userSchema);

// Persistent XRPL client connection
let persistentXrplClient = null;
let persistentXrplClientConnecting = null;

async function getXrplClient() {
    if (persistentXrplClient && persistentXrplClient.isConnected()) {
        return persistentXrplClient;
    }
    if (persistentXrplClientConnecting) {
        await persistentXrplClientConnecting;
        return persistentXrplClient;
    }
    persistentXrplClient = new xrpl.Client(MAINNET_SERVER);
    persistentXrplClientConnecting = persistentXrplClient.connect();
    await persistentXrplClientConnecting;
    persistentXrplClientConnecting = null;
    persistentXrplClient.on('disconnected', async () => {
        try {
            await persistentXrplClient.connect();
        } catch (e) {
            console.error('XRPL client reconnect failed:', e);
        }
    });
    return persistentXrplClient;
}

/// XRPL wallet generation for user --------------------------------------------------------------
function generateXrplWallet() {
    try {
        const wallet = Wallet.generate();

        return {
            publicKey: wallet.publicKey,
            privateKey: wallet.privateKey,
            walletAddress: wallet.address,
            seed: wallet.seed
        };
    } catch (error) {
        console.error('Error generating XRPL wallet:', error);
        throw new Error('Failed to generate XRPL wallet');
    }
}

/// Get XRPL balance of user from database -------------------------------------------------------
async function getXrplBalance(walletAddress) {
    try {
        const client = await getXrplClient();

        const response = await client.request({
            command: 'account_info',
            account: walletAddress,
            ledger_index: 'validated'
        });

        const balanceInXrp = parseFloat(response.result.account_data.Balance) / 1000000;
        return balanceInXrp;
    } catch (error) {
        console.log('Error fetching XRPL balance:');

        if (error.data && error.data.error === 'actNotFound') {
            return 0;
        }
    }
}

/// Get tokens balance of user wallet ----------------------------------------------------------
async function getTokensBalances(walletAddress) {
    try {
        const client = await getXrplClient();

        const response = await client.request({
            command: 'account_lines',
            account: walletAddress,
            ledger_index: 'validated'
        });

        return response.result.lines.map(line => ({
            currency: line.currency,
            issuer: line.account,
            balance: line.balance,
            lastUpdated: new Date()
        }));
    } catch (error) {
        console.log('Error fetching tokens data:');

        if (error.data && error.data.error === 'actNotFound') {
            return [];
        }
    }
}

/// Get user info from database -------------------------------------------------------
async function getUserFromDb(telegramId) {
    try {
        const user = await User.findOne({ telegramId: telegramId });
        return user;
    } catch (error) {
        console.error('Error fetching user from database:');
        return null;
    }
}

// Helper function to validate XRPL address format
function isValidXRPLAddress(address) {
    if (!address || typeof address !== 'string') return false;
    if (!address.startsWith('r') || address.length < 25 || address.length > 34) return false;

    const base58Regex = /^[1-9A-HJ-NP-Za-km-z]+$/;
    return base58Regex.test(address);
}

// Helper function to validate if address exists on XRPL
async function validateXRPLAccount(address) {
    try {
        const client = await getXrplClient();
        const accountInfo = await client.request({
            command: 'account_info',
            account: address,
            ledger_index: 'validated'
        });

        return accountInfo.result && accountInfo.result.account_data;
    } catch (error) {
        return false;
    }
}

// rename or fix currency to human readable format
function getReadableCurrency(currency) {
    if (!currency) return 'UNKNOWN';
    if (currency.length <= 3) {
        return currency;
    }
    if (currency.length === 40) {
        try {
            const hex = currency.replace(/0+$/, ''); 
            if (hex.length > 0 && hex.length % 2 === 0) {
                const decoded = Buffer.from(hex, 'hex').toString('utf8').replace(/\0/g, '');
                if (decoded && /^[A-Za-z0-9\-_\.]+$/.test(decoded) && decoded.length >= 1) {
                    return decoded;
                }
            }
            const fullHex = currency;
            const decoded2 = Buffer.from(fullHex, 'hex').toString('utf8').replace(/\0/g, '');
            if (decoded2 && /^[A-Za-z0-9\-_\.]+$/.test(decoded2) && decoded2.length >= 1 && decoded2.length <= 20) {
                return decoded2;
            }
            const shortHex = currency.substring(0, 12).replace(/0+$/, '');
            if (shortHex.length > 0 && shortHex.length % 2 === 0) {
                const decoded3 = Buffer.from(shortHex, 'hex').toString('utf8').replace(/\0/g, '');
                if (decoded3 && /^[A-Za-z0-9\-_\.]+$/.test(decoded3) && decoded3.length >= 1) {
                    return decoded3;
                }
            }
            for (let len = 6; len <= 20; len += 2) {
                try {
                    const chunkHex = currency.substring(0, len);
                    const chunkDecoded = Buffer.from(chunkHex, 'hex').toString('utf8').replace(/\0/g, '');
                    if (chunkDecoded && /^[A-Za-z0-9\-_\.]+$/.test(chunkDecoded) && chunkDecoded.length >= 2) {
                        return chunkDecoded;
                    }
                } catch (e) {
                    continue;
                }
            }
        } catch (error) {
            console.error('Could not decode hex currency:', currency, error.message);
        }
    }
    if (currency.length >= 6 && currency.length % 2 === 0 && /^[0-9A-Fa-f]+$/.test(currency)) {
        try {
            const decoded = Buffer.from(currency.replace(/0+$/, ''), 'hex').toString('utf8').replace(/\0/g, '');
            if (decoded && decoded.trim().length >= 1 && decoded.trim().length <= 20) {
                const readableChars = decoded.match(/[A-Za-z0-9\$@#\-_\.\+\&\!]/g);
                if (readableChars && readableChars.length >= decoded.trim().length * 0.7) {
                    return decoded.trim();
                }
            }
        } catch (error) {
            console.error('Could not decode variable length hex:', currency);
        }
    }
    return currency.substring(0, 8) + '...';
}

// format token amount for telegram env
function formatTokenAmountSimple(amount) {
    const numAmount = typeof amount === 'string' ? parseFloat(amount) : amount;
    if (!numAmount || numAmount <= 0) {
        throw new Error('Invalid token amount');
    }
    const formatted = numAmount.toFixed(6).replace(/\.?0+$/, '');
    return formatted;
}

// bot config message
function getBotConfigMessage(user) {
    const customeAmount = user.selectedCustomAutoBuyAmount ? user.selectedCustomAutoBuyAmount : 0;
    return `🤖 *Bot Config*

Adjust various aspects of the bot.

⬩ Auto Buy on Paste: ${user.isAutoBuyOnPaste ? '🟢' : '🔴' }
⬩ Custom Amount: ${customeAmount} XRP
 

Auto Buy on Paste
⬩ Immediately buy when pasting a token address or URL.

Custom Amount
⬩ Input a custom amountused when auto-buying a token on paste
⬩ This amount is also shown as an additional amount option in the UI.`;
}

/// Main menu panel text -------------------------------------------------------
function getWelcomeMessage(user) {
    return `☀️ GOAT Bot ☀️

Integrated with top XRPL platforms including Sologenic, FirstLedger, OnXRP, XRPL DEX, Bithomp, and others.

Your Address:\`${user.walletAddress}\`

*XRP Balance:* ${user.balance.XRP} XRP`;
}

// main menu keyboard ---------------------------------------------------------------------------------------------------------------------
function getMainMenuKeyboard(user) {
    const miniappUrl = `https://xrpl-bot-miniapp.vercel.app/?userId=${user.telegramId}&walletAddress=${user.walletAddress}&timestamp=${Date.now()}`;
    return {
        inline_keyboard: [
            [
                { text: '💰 Balances', web_app: { url: miniappUrl } }
            ],
            [
                { text: '🟢 Buy / 🔴 Sell', callback_data: 'trade_control' },
            ],

            [
                { text: '🔄 Dollar Cost Average', callback_data: 'dollar_cost_average' },
                { text: '🔍 Copy Trader', callback_data: 'copy_trader' },
            ],
            [
                { text: '🎯 Token Sniper', callback_data: 'token_sniper' },
                { text: '💸 Withdrawl', callback_data: 'withdraw' }
            ],
            [
                { text: '⚙️ Settings', callback_data: 'settings' }
            ]
        ]
    };
}

function getBotConfigKeyboard(user) {
    return {
        inline_keyboard: [
            [
                {text: user.isAutoBuyOnPaste ? '🟢 Auto Buy Token On Paste' : '🔴 Auto Buy Token On Paste', callback_data: 'set_autobuy_onpaste'}
            ],
            [
                {text: user.selectedCustomAutoBuyAmount ? `📝 Custom Amount: ${user.selectedCustomAutoBuyAmount} XRP` : 'Custom Amount: -- XRP', callback_data: 'set_custom_autobuy_amount'}
            ],
            [
                {text: "🔙 Back", callback_data: 'settings'}
            ],
        ]
    }
}

function getTradeKeyboard(user) {
    const chartUrl = `https://livenet.xrpl.org/accounts/${user.selectedBuyTokenAddress}`
    if(user.isBuyMode){
        return{
            inline_keyboard: [
                [
                    {text: '📊 Explorer', url: chartUrl},
                    {text: '❌ Close', callback_data: 'close_panel'}
                ],
                [
                    {text: '🔄 ----SWAP MODE---- 🔄', callback_data: 'swap_mode_header' }
                ],
                [
                    { text: '🟢 Buy', callback_data: 'buy_tokens' },
                    { text: '⚫ Sell', callback_data: 'sell_tokens' }
                ],
                [
                    { text: '💰 ----AMOUNT---- 💰', callback_data: 'select_amount_header'}
                ],
                [
                    { text: '0.5 XRP', callback_data: 'buy_0_5_xrp' },
                    { text: '1 XRP', callback_data: 'buy_1_xrp' },
                    { text: '5 XRP', callback_data: 'buy_5_xrp' }
                ],
                [
                    { text: '10 XRP', callback_data: 'buy_10_xrp' },
                    { text: user.selectedBuyAmount !== 0.5 && user.selectedBuyAmount !== 1 && user.selectedBuyAmount !== 5 && user.selectedBuyAmount !== 10 ? ` Custom: ${user.selectedBuyAmount} XRP ` : 'Custom:--', callback_data: 'buy_custom' }
                ],
                [
                    { text: '🔄 Refresh', callback_data: 'refresh' }   
                ]
            ]
        }
    }else {
        return {
            inline_keyboard: [
                [
                    {text: '📊 Explorer', url: chartUrl},
                    {text: '❌ Close', callback_data: 'close_panel'}
                ],
                [
                    {text: '🔄 ----SWAP MODE---- 🔄', callback_data: 'swap_mode_header'}
                ],
                [
                    { text: '⚫ Buy', callback_data: 'buy_tokens' },
                    { text: '🟢 Sell', callback_data: 'sell_tokens' }
                ],
                [
                    { text: '💰 ----AMOUNT---- 💰', callback_data: 'select_amount_header'}
                ],
                [
                    { text: '10%', callback_data: 'sell_10%' },
                    { text: '15%', callback_data: 'sell_15%' },
                    { text: '25%', callback_data: 'sell_25%' }
                ],
                [
                    { text: '50%', callback_data: 'sell_50%' },
                    { text: '75%', callback_data: 'sell_75%' },
                    { text: '100%', callback_data: 'sell_100%' }
                ],
                [
                    { text: '🔄 Refresh', callback_data: 'refresh' }
                ]
            ]
        }
    }
}
/////////////// Buy Tokens Panel //////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////

// handle buy amount selection button -----------------------------------------------------------
async function handleBuyAmountSelection(chatId, callbackQuery, user, amount) {
    try {
        user.selectedBuyAmount = amount;
        await user.save();
        // Use cached token info if available
        let finalTokenInfo = user.cachedTokenInfo;
        if (!finalTokenInfo && user.selectedBuyTokenAddress) {
            // Fallback: fetch if not cached
            finalTokenInfo = await searchTokenAMM(user.selectedBuyTokenAddress);
        }
        if (!finalTokenInfo) {
            await bot.sendMessage(chatId, '❌ No token selected. Please paste a CA (issuer address) first.');
            return;
        }
        const searchingMsg = await bot.sendMessage(chatId, '🔄 *Processing buy...*', { parse_mode: 'Markdown' });
        const buyResult = await executeBuyTransactionAMM(user, finalTokenInfo, amount, user.selectedSlippage);
        if (buyResult.success) {
            await bot.editMessageText(
                `*Transaction Successed*\n\n` +
                `**Token:** ${finalTokenInfo.readableCurrency || finalTokenInfo.currency}\n` +
                `**Amount:** ${amount} XRP\n` +
                `**Tokens Received:** ${buyResult.tokensReceived}\n\n` +
                `**Transaction Hash:** https://livenet.xrpl.org/transactions/${buyResult.txHash}`,
                {
                    chat_id: chatId,
                    message_id: searchingMsg.message_id,
                    parse_mode: 'Markdown',
                    reply_markup: getTradeKeyboard(user)
                }
            );
        } else {
            await bot.editMessageText(
                `❌ *Transaction Failed*\n\n` +
                `**Token:** ${finalTokenInfo.readableCurrency || finalTokenInfo.currency}\n` +
                `**Amount:** ${amount} XRP\n` +
                `**Error:** ${buyResult.error}\n\n` +
                `Your XRP has been returned to your wallet.\n\n` +
                `Too many transactions ordered in a short time. Please try again later.`,
                {
                    chat_id: chatId,
                    message_id: searchingMsg.message_id,
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: '🔄 Try Again', callback_data: 'buy_tokens' }],
                            [{ text: '🏠 Main Menu', callback_data: 'main_menu' }]
                        ]
                    }
                }
            );
        }
    } catch (error) {
        console.error('Error executing buy transaction:', error);
        if (error.message.includes('message is not modified')) {
            bot.sendMessage(chatId, `✅ Amount already set to ${amount} XRP`, {
                reply_markup: {
                    inline_keyboard: [[
                        { text: '🗑️ Delete', callback_data: 'delete_message' }
                    ]]
                }
            }).then(msg => {
                setTimeout(() => {
                    bot.deleteMessage(chatId, msg.message_id).catch(() => { });
                }, 3000);
            });
        } else {
            bot.sendMessage(chatId, '🛒 *Buy Tokens - Updated*', {
                parse_mode: 'Markdown',
                reply_markup: getTradeKeyboard(user)
            });
        }
    }
}

// search token from AMM
async function searchTokenAMM(tokenInput) {
    const client = await getXrplClient();
    try {
        const parts = tokenInput.trim().split(/\s+/);

        if (parts.length === 2) {
            const [currency, issuer] = parts;

            if (issuer.startsWith('r') && issuer.length >= 25) {
                const xrplCurrency = convertCurrencyToXRPLFormat(currency);
                const ammInfo = await client.request({
                    command: 'amm_info',
                    asset: { currency: 'XRP' },
                    asset2: { currency: xrplCurrency, issuer: issuer }
                });

                if (ammInfo.result && ammInfo.result.amm) {
                    return {
                        found: true,
                        currency: xrplCurrency,
                        readableCurrency: currency.toUpperCase(),
                        issuer: issuer,
                        type: 'direct_input',
                        ammInfo: ammInfo.result.amm
                    };
                } else {
                    return { found: false, error: 'No AMM pool found for this token pair' };
                }
            }
        }

        if (tokenInput.startsWith('r') && tokenInput.length >= 25) {
            try {
                const accountInfo = await client.request({
                    command: 'account_info',
                    account: tokenInput,
                    ledger_index: 'validated'
                });

                if (!accountInfo.result.account_data) {
                    return { found: false, error: 'Issuer account not found' };
                }

                const tokensFound = await findTokensWithAMM(client, tokenInput);

                if (tokensFound.length === 0) {
                    return {
                        found: false,
                        error: 'No AMM pools found for this issuer address. The issuer might not have any active AMM pools.'
                    };
                }

                const readableTokens = tokensFound.map(token => ({
                    ...token,
                    readableCurrency: convertXRPLCurrencyToReadable(token.currency)
                }));

                if (tokensFound.length === 1) {
                    return {
                        found: true,
                        currency: tokensFound[0].currency,
                        readableCurrency: readableTokens[0].readableCurrency,
                        issuer: tokenInput,
                        type: 'issuer_address',
                        ammInfo: tokensFound[0].ammInfo
                    };
                } else {
                    return {
                        found: true,
                        multipleTokens: true,
                        tokens: readableTokens,
                        issuer: tokenInput,
                        type: 'issuer_address_multiple'
                    };
                }
            } catch (error) {
                console.error('Error checking issuer:', error);
                return { found: false, error: 'Invalid or inactive issuer address: ' + error.message };
            }
        }

        return {
            found: false,
            error: `AMM pool for "${tokenInput}" not found. Please use a valid currency code or issuer address.`
        };

    } catch (error) {
        console.error('Error in AMM search:', error);
        return { found: false, error: 'Error searching for AMM pool: ' + error.message };
    }
}

async function findIssuedTokensFromAccount(client, issuerAddress) {
    const foundCurrencies = new Set();
    const issuedTokens = [];

    try {
        try {
            const accountLines = await client.request({
                command: 'account_lines',
                account: issuerAddress,
                limit: 200,
                ledger_index: 'validated'
            });

            if (accountLines.result && accountLines.result.lines) {
                for (const line of accountLines.result.lines) {
                    // Check if this account is issuing the currency (balance > 0 means they issued it)
                    if (parseFloat(line.balance) < 0 && line.currency) {
                        if (!foundCurrencies.has(line.currency)) {
                            foundCurrencies.add(line.currency);
                            issuedTokens.push({
                                currency: line.currency,
                                issuer: issuerAddress,
                                foundVia: 'account_lines',
                                balance: line.balance
                            });
                        }
                    }
                }
            }
        } catch (error) {
            console.error('Error checking account lines:', error.message);
        }

        // Method 2: Check transaction history for currency creation/issuance
        try {
            const transactions = await client.request({
                command: 'account_tx',
                account: issuerAddress,
                limit: 100,
                ledger_index_min: -1000000,
                ledger_index_max: -1
            });

            if (transactions.result && transactions.result.transactions) {
                for (const txWrapper of transactions.result.transactions) {
                    const tx = txWrapper.tx || txWrapper.tx_json;
                    if (!tx) continue;

                    // Check Payment transactions where this account sends tokens
                    if (tx.TransactionType === 'Payment' && tx.Account === issuerAddress) {
                        if (typeof tx.Amount === 'object' && tx.Amount.currency && tx.Amount.issuer === issuerAddress) {
                            if (!foundCurrencies.has(tx.Amount.currency)) {
                                foundCurrencies.add(tx.Amount.currency);
                                issuedTokens.push({
                                    currency: tx.Amount.currency,
                                    issuer: issuerAddress,
                                    foundVia: 'payment_tx'
                                });
                            }
                        }
                    }

                    // Check AMMCreate transactions
                    if (tx.TransactionType === 'AMMCreate' && tx.Account === issuerAddress) {
                        let currency = null;
                        if (typeof tx.Amount === 'object' && tx.Amount.currency && tx.Amount.issuer === issuerAddress) {
                            currency = tx.Amount.currency;
                        } else if (typeof tx.Amount2 === 'object' && tx.Amount2.currency && tx.Amount2.issuer === issuerAddress) {
                            currency = tx.Amount2.currency;
                        }

                        if (currency && !foundCurrencies.has(currency)) {
                            foundCurrencies.add(currency);
                            issuedTokens.push({
                                currency: currency,
                                issuer: issuerAddress,
                                foundVia: 'amm_create'
                            });
                        }
                    }

                    // Check OfferCreate transactions for issued tokens
                    if (tx.TransactionType === 'OfferCreate' && tx.Account === issuerAddress) {
                        if (typeof tx.TakerGets === 'object' && tx.TakerGets.currency && tx.TakerGets.issuer === issuerAddress) {
                            if (!foundCurrencies.has(tx.TakerGets.currency)) {
                                foundCurrencies.add(tx.TakerGets.currency);
                                issuedTokens.push({
                                    currency: tx.TakerGets.currency,
                                    issuer: issuerAddress,
                                    foundVia: 'offer_create'
                                });
                            }
                        }
                        if (typeof tx.TakerPays === 'object' && tx.TakerPays.currency && tx.TakerPays.issuer === issuerAddress) {
                            if (!foundCurrencies.has(tx.TakerPays.currency)) {
                                foundCurrencies.add(tx.TakerPays.currency);
                                issuedTokens.push({
                                    currency: tx.TakerPays.currency,
                                    issuer: issuerAddress,
                                    foundVia: 'offer_create'
                                });
                            }
                        }
                    }
                }
            }
        } catch (error) {
            console.error('Error checking transaction history:', error.message);
        }
        return issuedTokens;
    } catch (error) {
        console.error('Error finding issued tokens:', error);
        return [];
    }
}

// execute buy transaction ------------------------------------------------------------------------------------------------

async function executeBuyTransactionAMM(user, tokenInfo, xrpAmount, userSlippage) {
    const client = await getXrplClient();
    try {
        let wallet;
        try {
            if (user.seed) {
                wallet = Wallet.fromSeed(user.seed);
            } else if (user.privateKey && user.privateKey.startsWith('s')) {
                wallet = Wallet.fromSeed(user.privateKey);
            } else {
                wallet = new Wallet(user.publicKey, user.privateKey);
            }
        } catch (error) {
            console.error('Error creating wallet:', error);
            return {
                success: false,
                error: 'Failed to create wallet from stored keys'
            };
        }

        let hasTrustLine = false;
        let currentTokenBalance = 0;

        try {
            const accountLines = await client.request({
                command: 'account_lines',
                account: wallet.address,
                ledger_index: 'validated'
            });

            const existingLine = accountLines.result.lines.find(line =>
                line.currency === tokenInfo.currency && line.account === tokenInfo.issuer
            );

            if (existingLine) {
                hasTrustLine = true;
                currentTokenBalance = parseFloat(existingLine.balance);
            }
        } catch (error) {
            console.error('Account not activated or no trust lines, will create trust line');
        }

        if (!hasTrustLine) {

            const trustSetTx = {
                TransactionType: 'TrustSet',
                Account: wallet.address,
                LimitAmount: {
                    currency: tokenInfo.currency,
                    issuer: tokenInfo.issuer,
                    value: '100000'
                }
            };

            try {
                const trustPrepared = await client.autofill(trustSetTx);
                const trustSigned = wallet.sign(trustPrepared);
                const trustResult = await client.submitAndWait(trustSigned.tx_blob);


                if (trustResult.result.meta.TransactionResult !== 'tesSUCCESS') {
                    return {
                        success: false,
                        error: `Failed to create trust line: ${trustResult.result.meta.TransactionResult}`
                    };
                }

                await new Promise(resolve => setTimeout(resolve, 3000));

            } catch (error) {
                console.error('Trust line creation failed:', error);
                return {
                    success: false,
                    error: 'Failed to create trust line: ' + error.message
                };
            }
        }

        const ammInfo = await client.request({
            command: 'amm_info',
            asset: { currency: 'XRP' },
            asset2: { currency: tokenInfo.currency, issuer: tokenInfo.issuer }
        });

        if (!ammInfo.result || !ammInfo.result.amm) {
            return {
                success: false,
                error: 'AMM pool not found for this token pair'
            };
        }

        const amm = ammInfo.result.amm;
        const xrpAmountDrops = parseFloat(amm.amount);
        const tokenAmount = parseFloat(amm.amount2.value);
        const currentRate = tokenAmount / (xrpAmountDrops / 1000000);
        const estimatedTokens = xrpAmount * currentRate;
        const slippageMultiplier = (100 - 0.1) / 100;
        const minTokensExpected = estimatedTokens * slippageMultiplier;
        const formattedMinTokens = formatTokenAmountSimple(minTokensExpected);
        const paymentTx = {
            TransactionType: 'Payment',
            Account: wallet.address,
            Destination: wallet.address,
            Amount: {
                currency: tokenInfo.currency,
                issuer: tokenInfo.issuer,
                value: formattedMinTokens
            },
            SendMax: xrpToDrops(xrpAmount.toString())
        };

        try {
            const paymentPrepared = await client.autofill(paymentTx);
            const paymentSigned = wallet.sign(paymentPrepared);
            const paymentResult = await client.submitAndWait(paymentSigned.tx_blob);

            if (paymentResult.result.meta.TransactionResult === 'tesSUCCESS') {
                await new Promise(resolve => setTimeout(resolve, 2000));

                const finalBalance = await client.request({
                    command: 'account_lines',
                    account: wallet.address,
                    ledger_index: 'validated'
                });

                const tokenLine = finalBalance.result.lines.find(line =>
                    line.currency === tokenInfo.currency && line.account === tokenInfo.issuer
                );

                const tokensReceived = tokenLine ? (parseFloat(tokenLine.balance) - currentTokenBalance) : 0;
                const actualRate = tokensReceived / xrpAmount;
                const rateEfficiency = ((actualRate / currentRate) * 100).toFixed(2);
                const actualSlippage = ((1 - (actualRate / currentRate)) * 100).toFixed(2);

                return {
                    success: true,
                    txHash: paymentResult.result.hash,
                    tokensReceived: tokensReceived.toString(),
                    xrpSpent: xrpAmount,
                    expectedTokens: estimatedTokens.toFixed(6),
                    actualRate: actualRate.toFixed(6),
                    ammRate: currentRate.toFixed(6),
                    rateEfficiency: rateEfficiency,
                    slippageUsed: userSlippage,
                    actualSlippage: actualSlippage,
                    message: `Successfully bought ${tokensReceived} ${tokenInfo.currency} for ${xrpAmount} XRP via AMM (Rate: ${actualRate.toFixed(6)} tokens/XRP, ${rateEfficiency}% efficiency)`,
                    newTokenBalance: tokenLine ? tokenLine.balance : '0'
                };
            } else {
                return {
                    success: false,
                    error: `AMM transaction failed: ${paymentResult.result.meta.TransactionResult}`
                };
            }

        } catch (error) {
            console.error('AMM payment failed:', error);
            return {
                success: false,
                error: 'Failed to execute AMM swap: ' + error.message
            };
        }

    } catch (error) {
        console.error('AMM buy transaction error:', error);
        return {
            success: false,
            error: error.message || 'Failed to execute AMM buy transaction'
        };
    }
}

async function executeInstanceBuyAfterPaste(user, chatId){
    const miniappUrl = `https://xrpl-bot-miniapp.vercel.app/?userId=${user.telegramId}&walletAddress=${user.walletAddress}&timestamp=${Date.now()}`;
    const tokenInput = user.selectedBuyTokenAddress;
    await user.save();
    const searchingMsg = await bot.sendMessage(chatId, '🔍 *Searching for AMM pool...*', {
        parse_mode: 'Markdown'
    });

    try {
        const tokenInfo = await searchTokenAMM(tokenInput);
        if (!tokenInfo.found) {
            await bot.editMessageText(`❌ *AMM Pool Not Found*\n\n${tokenInfo.error}. Please input with correct style`, {
                chat_id: chatId,
                message_id: searchingMsg.message_id,
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [[
                        { text: '🔙 Back to Buy Menu', callback_data: 'buy_tokens' }
                    ]]
                }
            });
            return;
        }

        if (tokenInfo.multipleTokens) {
            let tokensList = tokenInfo.tokens.map((token, index) =>
                `${index + 1}. **${token.readableCurrency || token.currency}** (AMM Pool: ${token.poolSize || 'N/A'})`
            ).join('\n');

            await bot.editMessageText(
                `✅ *Multiple AMM Pools Found*\n\nIssuer: \`${tokenInfo.issuer}\`\n\n${tokensList}\n\n⚠️ Please specify which token you want to buy by entering:\n\`CURRENCY_CODE ${tokenInfo.issuer}\``,
                {
                    chat_id: chatId,
                    message_id: searchingMsg.message_id,
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: [[
                            { text: '🔙 Back to Buy Menu', callback_data: 'buy_tokens' }
                        ]]
                    }
                }
            );
            return;
        }

        const quickCheck = await performQuickBuyCheck(user, tokenInfo, parseFloat(user.selectedCustomAutoBuyAmount));

        if (!quickCheck.canProceed) {
            await bot.editMessageText(`❌ *Cannot Process Purchase*\n\n${quickCheck.error}`, {
                chat_id: chatId,
                message_id: searchingMsg.message_id,
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [[
                        { text: '🔙 Back to Buy Menu', callback_data: 'buy_tokens' }
                    ]]
                }
            });
            return;
        }

        const displayCurrency = tokenInfo.readableCurrency || tokenInfo.currency;
        bot.sendMessage(chatId,
            `✅ Your Order is Being Processed ... \n\n`,
        );

        processBackgroundBuyTransaction(user, tokenInfo, parseFloat(user.selectedCustomAutoBuyAmount), chatId, searchingMsg.message_id, miniappUrl)
            .catch(error => {
                console.error('Background transaction error:', error);
                bot.sendMessage(chatId, `⚠️ *Transaction Update*\n\nThere was an issue with your ${displayCurrency} purchase. Please check your portfolio or try again.\n\n**Error:** ${error.message}`, {
                    parse_mode: 'Markdown'
                });
            });

        await user.save();

    } catch (error) {
        console.error('AMM buy token error:', error);

        await bot.editMessageText(`❌ *An error occurred*\n\n${error.message}`, {
            chat_id: chatId,
            message_id: searchingMsg.message_id,
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [[
                    { text: '🔙 Back to Buy Menu', callback_data: 'buy_tokens' }
                ]]
            }
        });
    }
}
////////////// Sell Tokens Panel ///////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////
// sell amount setting handler ------------------------------------------------------------------------
async function handleSellAmountSelection(chatId, callbackQuery, user, amount) {
    try {
        user.selectedSellAmount = amount;
        await user.save();
        // Check if the user holds the token
        const tokenInput = user.selectedBuyTokenAddress;
        const userToken = (user.tokens || []).find(t => t.issuer === tokenInput);
        if (!userToken) {
            await bot.sendMessage(chatId, '❌ You do not hold this token in your wallet.');
            return;
        }
        const tokenBalance = parseFloat(userToken.balance);
        const tokensToSell = tokenBalance * amount;
        if (tokensToSell <= 0) {
            await bot.sendMessage(chatId, '❌ You do not have enough balance to sell this token.');
            return;
        }
        // Prepare token info
        const tokenInfo = {
            currency: userToken.currency,
            issuer: userToken.issuer,
            readableCurrency: userToken.readableCurrency || getReadableCurrency(userToken.currency)
        };
        // Show processing message
        const processingMsg = await bot.sendMessage(chatId, `🔄 *Executing sell transaction...*\n\n🎯 **Token:** ${tokenInfo.readableCurrency}\n💰 **Selling:** ${tokensToSell.toFixed(6)} ${tokenInfo.readableCurrency} (${amount * 100}%)\n📊 **Your Balance:** ${tokenBalance} ${tokenInfo.readableCurrency}`, {
            parse_mode: 'Markdown'
        });
        // Execute sell
        const sellResult = await executeSellTransactionAMM(user, tokenInfo, tokensToSell);
        if (sellResult.success) {
            await bot.editMessageText(
                `🎉 *Sell Successful!*\n\n✅ **Transaction Hash:** \`${sellResult.txHash}\`\n💰 **Tokens Sold:** ${sellResult.tokensSold} ${tokenInfo.readableCurrency}\n💸 **XRP Received:** ${sellResult.estimatedXrpReceived} XRP\n📊 **Remaining Balance:** ${sellResult.newTokenBalance} ${tokenInfo.readableCurrency}\n\n🔍 **View on Explorer:**\nhttps://livenet.xrpl.org/transactions/${sellResult.txHash}`,
                {
                    chat_id: chatId,
                    message_id: processingMsg.message_id,
                    parse_mode: 'Markdown'
                }
            );
            await updateUserBalance(user.telegramId);
        } else {
            await bot.editMessageText(
                `❌ *Sell Failed*\n\n**Error:** ${sellResult.error}\n\nPlease try again.`,
                {
                    chat_id: chatId,
                    message_id: processingMsg.message_id,
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: [[
                            { text: '🔙 Back to Sell Menu', callback_data: 'sell_tokens' }
                        ]]
                    }
                }
            );
        }
    } catch (error) {
        console.error('Error updating Sell amount:', error);
        if (error.message.includes('message is not modified')) {
            bot.sendMessage(chatId, `✅ Amount already set to ${amount * 100} %`, {
                reply_markup: {
                    inline_keyboard: [[
                        { text: '🗑️ Delete', callback_data: 'delete_message' }
                    ]]
                }
            }).then(msg => {
                setTimeout(() => {
                    bot.deleteMessage(chatId, msg.message_id).catch(() => { });
                }, 3000);
            });
        } else {
            bot.sendMessage(chatId, '🛒 *Sell Amount - Updated*', {
                parse_mode: 'Markdown',
                reply_markup: getTradeKeyboard(user)
            });
        }
    }
}

/// Create new user account -------------------------------------------------------
async function createUserAccount(telegramUser) {
    try {
        const existingUser = await User.findOne({ telegramId: telegramUser.id });
        if (existingUser) {
            return { success: false, message: 'User already exists', user: existingUser };
        }
        const walletData = generateXrplWallet();
        const newUser = new User({
            userId: `user_${Date.now()}_${telegramUser.id}`,
            telegramId: telegramUser.id,
            username: telegramUser.username || telegramUser.first_name || 'Unknown',
            publicKey: walletData.publicKey,
            privateKey: walletData.privateKey,
            seed: walletData.seed,
            walletAddress: walletData.walletAddress,
            balance: {
                XRP: 0,
                USD: 0
            }
        });

        const savedUser = await newUser.save();
        return {
            success: true,
            message: 'User account created successfully',
            user: savedUser
        };
    } catch (error) {
        console.error('Error creating user account:', error);
        return {
            success: false,
            message: 'Failed to create user account',
            error: error.message
        };
    }
}

/// Update user balance -------------------------------------------------------
async function updateUserBalance(telegramId) {
    try {
        const user = await User.findOne({ telegramId: telegramId });
        if (!user) return null;

        const xrpBalance = await getXrplBalance(user.walletAddress);
        const tokensBalances = await getTokensBalances(user.walletAddress);

        user.balance.XRP = xrpBalance;
        user.tokens = tokensBalances;
        user.updatedAt = new Date();

        await user.save();
        return user;
    } catch (error) {
        console.error('Error updating user balance:', error);
        return null;
    }
}


// Helper function to convert currency code to XRPL format
function convertCurrencyToXRPLFormat(currency) {
    if (currency.length <= 3) {
        return currency.toUpperCase();
    }

    const hex = Buffer.from(currency, 'utf8').toString('hex').toUpperCase();
    return hex.padEnd(40, '0');
}

function convertXRPLCurrencyToReadable(xrplCurrency) {
    if (xrplCurrency.length <= 3) {
        return xrplCurrency;
    }

    if (xrplCurrency.length === 40 && /^[0-9A-F]+$/.test(xrplCurrency)) {
        const trimmed = xrplCurrency.replace(/0+$/, '');
        try {
            const readable = Buffer.from(trimmed, 'hex').toString('utf8');
            if (/^[A-Za-z0-9]+$/.test(readable)) {
                return readable;
            }
        } catch (error) {
            console.error('Error converting hex to readable:', error);
        }
    }

    return xrplCurrency;
}

// Find tokens with AMM -------------------------------------------------------------------------------------------------

async function findTokensWithAMM(client, issuerAddress) {
    const foundTokens = [];
    const MAX_TOKENS = 10; // Increased limit to show more options

    try {
        // First, find all tokens issued by this account
        const issuedTokens = await findIssuedTokensFromAccount(client, issuerAddress);
        
        for (const token of issuedTokens) {
            if (foundTokens.length >= MAX_TOKENS) break;

            try {
                const ammInfo = await client.request({
                    command: 'amm_info',
                    asset: { currency: 'XRP' },
                    asset2: { currency: token.currency, issuer: issuerAddress }
                });

                if (ammInfo.result && ammInfo.result.amm) {
                    foundTokens.push({
                        currency: token.currency,
                        issuer: issuerAddress,
                        foundVia: token.foundVia,
                        ammInfo: ammInfo.result.amm,
                        poolSize: calculatePoolSize(ammInfo.result.amm)
                    });
                } else {
                    console.error(`❌ No AMM pool for ${convertXRPLCurrencyToReadable(token.currency)}`);
                }
            } catch (error) {
                console.error(`❌ No AMM pool for ${convertXRPLCurrencyToReadable(token.currency)}: ${error.message}`);
            }
        }

        // If we didn't find enough tokens with AMM pools, try some common currency codes
        if (foundTokens.length < 3) {
            const commonCurrencies = ['USD', 'EUR', 'BTC', 'ETH', 'USDT', 'USDC', 'XRP'];
            
            for (const currency of commonCurrencies) {
                if (foundTokens.length >= MAX_TOKENS) break;

                const xrplCurrency = convertCurrencyToXRPLFormat(currency);
                
                // Skip if we already checked this currency
                if (foundTokens.some(token => token.currency === xrplCurrency)) continue;

                try {
                    const ammInfo = await client.request({
                        command: 'amm_info',
                        asset: { currency: 'XRP' },
                        asset2: { currency: xrplCurrency, issuer: issuerAddress }
                    });

                    if (ammInfo.result && ammInfo.result.amm) {
                        foundTokens.push({
                            currency: xrplCurrency,
                            issuer: issuerAddress,
                            foundVia: 'common_currency_check',
                            ammInfo: ammInfo.result.amm,
                            poolSize: calculatePoolSize(ammInfo.result.amm)
                        });
                    }
                } catch (error) {
                    continue;
                }
            }
        }
        return foundTokens.slice(0, MAX_TOKENS);
    } catch (error) {
        console.error('Error finding AMM pools:', error);
        return [];
    }
}

function calculatePoolSize(ammInfo) {
    try {
        if (ammInfo.amount && ammInfo.amount2) {
            const xrpAmount = typeof ammInfo.amount === 'string' ? 
                parseFloat(ammInfo.amount) / 1000000 : 
                parseFloat(ammInfo.amount.value || 0);
            
            const tokenAmount = typeof ammInfo.amount2 === 'string' ? 
                parseFloat(ammInfo.amount2) / 1000000 : 
                parseFloat(ammInfo.amount2.value || 0);
            
            return `${xrpAmount.toFixed(2)} XRP / ${tokenAmount.toFixed(2)} tokens`;
        }
        return 'N/A';
    } catch (error) {
        return 'N/A';
    }
}

////////////// Sell Tokens Panel ///////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////
// execute sell transaction -------------------------------------------------------------------
async function executeSellTransactionAMM(user, tokenInfo, tokenAmount) {
    const client = await getXrplClient();
    try {
        let wallet;
        try {
            if (user.seed) {
                wallet = Wallet.fromSeed(user.seed);
            } else if (user.privateKey && user.privateKey.startsWith('s')) {
                wallet = Wallet.fromSeed(user.privateKey);
            } else {
                wallet = new Wallet(user.publicKey, user.privateKey);
            }
        } catch (error) {
            console.error('Error creating wallet:', error);
            return {
                success: false,
                error: 'Failed to create wallet from stored keys'
            };
        }

        let currentTokenBalance = 0;
        let hasTrustLine = false;

        try {
            const accountLines = await client.request({
                command: 'account_lines',
                account: wallet.address,
                ledger_index: 'validated'
            });

            const existingLine = accountLines.result.lines.find(line =>
                line.currency === tokenInfo.currency && line.account === tokenInfo.issuer
            );

            if (existingLine) {
                hasTrustLine = true;
                currentTokenBalance = parseFloat(existingLine.balance);

                if (currentTokenBalance < tokenAmount) {
                    return {
                        success: false,
                        error: `Insufficient token balance. You have ${currentTokenBalance} ${getReadableCurrency(tokenInfo.currency)} but trying to sell ${tokenAmount}`
                    };
                }
            } else {
                return {
                    success: false,
                    error: `No trust line found for ${getReadableCurrency(tokenInfo.currency)}. Cannot sell tokens you don't have.`
                };
            }
        } catch (error) {
            console.error('Error checking token balance:', error);
            return {
                success: false,
                error: 'Could not verify token balance'
            };
        }

        const ammInfo = await client.request({
            command: 'amm_info',
            asset: { currency: 'XRP' },
            asset2: { currency: tokenInfo.currency, issuer: tokenInfo.issuer }
        });

        if (!ammInfo.result || !ammInfo.result.amm) {
            return {
                success: false,
                error: `No AMM pool found for ${getReadableCurrency(tokenInfo.currency)}. Cannot sell via AMM.`
            };
        }

        const amm = ammInfo.result.amm;
        const xrpAmountDrops = parseFloat(amm.amount);
        const tokenAmountInPool = parseFloat(amm.amount2.value);
        const currentRate = (xrpAmountDrops / 1000000) / tokenAmountInPool;
        const estimatedXrp = tokenAmount * currentRate;
        const slippageMultiplier = (100 - user.selectedSlippage) / 100;

        const minXrpExpected = estimatedXrp * slippageMultiplier;
        const formattedMinXrp = parseFloat((minXrpExpected).toFixed(6));
        const formattedEstimatedXrp = parseFloat(estimatedXrp.toFixed(6));
        const formattedTokenAmount = formatTokenAmountSimple(tokenAmount);

        const paymentTx = {
            TransactionType: 'Payment',
            Account: wallet.address,
            Destination: wallet.address,
            Amount: xrpToDrops(formattedEstimatedXrp.toString()),
            SendMax: {
                currency: tokenInfo.currency,
                issuer: tokenInfo.issuer,
                value: formattedTokenAmount
            },
            DeliverMin: xrpToDrops(formattedMinXrp.toString()),
            Flags: 0x00020000
        };

        try {
            const paymentPrepared = await client.autofill(paymentTx);
            const paymentSigned = wallet.sign(paymentPrepared);
            const paymentResult = await client.submitAndWait(paymentSigned.tx_blob);

            if (paymentResult.result.meta.TransactionResult === 'tesSUCCESS') {
                await new Promise(resolve => setTimeout(resolve, 2000));

                const finalTokenBalance = await client.request({
                    command: 'account_lines',
                    account: wallet.address,
                    ledger_index: 'validated'
                });

                const tokenLine = finalTokenBalance.result.lines.find(line =>
                    line.currency === tokenInfo.currency && line.account === tokenInfo.issuer
                );

                const remainingTokenBalance = tokenLine ? parseFloat(tokenLine.balance) : 0;
                const tokensSold = currentTokenBalance - remainingTokenBalance;
                const estimatedXrpReceived = tokensSold * currentRate;
                const actualRate = estimatedXrpReceived / tokensSold;
                const rateComparedToMarket = ((actualRate / currentRate) * 100).toFixed(2);
                const actualSlippage = ((1 - (actualRate / currentRate)) * 100).toFixed(2);

                return {
                    success: true,
                    txHash: paymentResult.result.hash,
                    tokensSold: tokensSold.toString(),
                    estimatedXrpReceived: estimatedXrpReceived.toFixed(6),
                    expectedXrp: estimatedXrp.toFixed(6),
                    actualRate: actualRate.toFixed(8),
                    marketRate: currentRate.toFixed(8),
                    rateEfficiency: rateComparedToMarket,
                    slippageUsed: user.selectedSlippage,
                    actualSlippage: actualSlippage,
                    message: `Successfully sold ${tokensSold} ${getReadableCurrency(tokenInfo.currency)} for ~${estimatedXrpReceived.toFixed(6)} XRP via AMM (Rate: ${actualRate.toFixed(8)} XRP/token, ${rateComparedToMarket}% efficiency)`,
                    newTokenBalance: remainingTokenBalance.toString(),
                    readableCurrency: getReadableCurrency(tokenInfo.currency)
                };
            } else {
                return {
                    success: false,
                    error: `AMM transaction failed: ${paymentResult.result.meta.TransactionResult}`
                };
            }

        } catch (error) {
            console.error('AMM sell payment failed:', error);
            return {
                success: false,
                error: 'Failed to execute AMM sell swap: ' + error.message
            };
        }

    } catch (error) {
        console.error('AMM sell transaction error:', error);
        return {
            success: false,
            error: error.message || 'Failed to execute AMM sell transaction'
        };
    }
}
/////////////// Dollar Cost Average Keyboard ////////////////////////////////////////////
/////////////////////////////////////////////////////////////////////////////////////////
// dollar cost average keyboard  -------------------------------------------------------
function getDollarCostAverageKeyboard(selectedAmount = null, selectedDuration = null, selectedFrequency = null, selectedToken = null) {

    return {
        inline_keyboard: [
            [
                { text: '🔙 Menu', callback_data: 'main_menu' },
                { text: '❌ Close', callback_data: 'close_panel' }
            ],
            [
                { text: '🗃️ Active Orders', callback_data: 'active_orders' }
            ],
            [
                { text: '💵 -----Tokens---- 💵', callback_data: 'tokens_for_dca' }
            ],
            [
                { text: 'Use: XRP', callback_data: 'use_xrp_for_buying_header' },
                { text: selectedToken ? `✅ Buy: ${selectedToken}` : 'Buy: --', callback_data: 'target_token_of_dca' }
            ],
            [
                { text: '💰 —— Allocation Amount —— 💰', callback_data: 'allocate_amount_header' }
            ],
            [
                { text: selectedAmount === '10' ? '✅ 10 XRP' : '10 XRP', callback_data: 'allocation_10xrp' },
                { text: selectedAmount === '50' ? '✅ 50 XRP' : '50 XRP', callback_data: 'allocation_50xrp' },
                { text: selectedAmount === '100' ? '✅ 100 XRP' : '100 XRP', callback_data: 'allocation_100xrp' },
            ],
            [
                { text: selectedAmount === '500' ? '✅ 500 XRP' : '500 XRP', callback_data: 'allocation_500xrp' },
                { text: selectedAmount === '1000' ? '✅ 1000 XRP' : '1000 XRP', callback_data: 'allocation_1000xrp' },
                { text: selectedAmount === '3000' ? '✅ 3000 XRP' : '3000 XRP', callback_data: 'allocation_3000xrp' },
            ],
            [
                { text: '🗓️----Duration----🗓️', callback_data: 'allocate_duration_header' }
            ],
            [
                { text: selectedDuration !== null ? `📝 Enter Duration: ${selectedDuration}(days)` : '📝 Enter Duration: --(days)', callback_data: 'enter_allocation_duration' }
            ],
            [
                { text: ' 🔄----Buying Frequency----🔄', callback_data: 'buying_frequency_header' }
            ],
            [
                { text: selectedFrequency === 'hourly' ? '✅ Hourly' : 'Hourly', callback_data: 'allocation_hourly' },
                { text: selectedFrequency === 'daily' ? '✅ Daily' : 'Daily', callback_data: 'allocation_daily' },
                { text: selectedFrequency === 'weekly' ? '✅ Weekly' : 'Weekly', callback_data: 'allocation_weekly' },
                { text: selectedFrequency === 'monthly' ? '✅ Monthly' : 'Monthly', callback_data: 'allocation_monthly' }
            ],
            [
                { text: '📝 Create Dollar Cost Average', callback_data: 'create_dollar_cost_average' }
            ]
        ]

    }
}

// Updated token input parsing for DCA
async function parseDCATokenInput(input) {
    const trimmedInput = input.trim();
    const parts = trimmedInput.split(/\s+/);

    // Handle "AUTO ISSUER" format (for auto-discovery)
    if (parts.length === 2 && parts[0].toUpperCase() === 'AUTO') {
        const issuer = parts[1];
        if (!issuer.startsWith('r') || issuer.length < 25 || issuer.length > 35) {
            return {
                success: false,
                error: "Invalid issuer address format. Issuer must be a valid XRPL address starting with 'r'."
            };
        }
        return {
            success: true,
            currency: 'AUTO_DISCOVER',
            issuer: issuer,
            readableCurrency: 'AUTO_DISCOVER',
            autoDiscover: true
        };
    }

    if (parts.length === 1) {
        // Single part - assume it's a 3-letter currency or hex currency
        const currency = parts[0].toUpperCase();

        if (currency === 'XRP') {
            return {
                success: false,
                error: "Cannot use XRP as target token for DCA. XRP is the base currency for buying other tokens."
            };
        }

        // For single currency input, we need an issuer
        return {
            success: false,
            error: "Please provide both currency and issuer address. Format: 'CURRENCY rISSUER_ADDRESS' (e.g., 'USD rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh')"
        };
    }

    if (parts.length === 2) {
        const currency = parts[0];
        const issuer = parts[1];

        // Validate issuer format (XRPL address)
        if (!issuer.startsWith('r') || issuer.length < 25 || issuer.length > 35) {
            return {
                success: false,
                error: "Invalid issuer address format. Issuer must be a valid XRPL address starting with 'r'."
            };
        }

        // Validate currency format
        if (!currency || currency.length === 0) {
            return {
                success: false,
                error: "Invalid currency format."
            };
        }

        // Convert currency to hex if longer than 3 characters
        let finalCurrency = currency;
        if (currency.length > 3) {
            // Convert to hex
            finalCurrency = Buffer.from(currency, 'utf8').toString('hex').toUpperCase().padEnd(40, '0');
        }

        return {
            success: true,
            currency: finalCurrency,
            issuer: issuer,
            readableCurrency: currency
        };
    }

    return {
        success: false,
        error: "Invalid format. Use: 'CURRENCY ISSUER_ADDRESS' (e.g., 'USD rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh')"
    };
}

// Input buytoken address for starting trade
async function handleBuyTokenAddressInput(bot, chatId, text, user) {
    const tokenInput = text.trim();
    if(!tokenInput.startsWith('r')) return;

    user.selectedBuyTokenAddress = tokenInput;
    await user.save();

    if (user.isAutoBuyOnPaste){
        if(user.selectedCustomAutoBuyAmount){
            await executeInstanceBuyAfterPaste(user, chatId);
            return;
        }
        bot.sendMessage(chatId, "Please input autobuy amount at the Bot config settings", {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [
                    [{text: 'Back to Main Menu', callback_data: 'main_menu'}]
                ]
            }
        });
        return;
    }
    
    // Fetch AMM/token info immediately and cache it
    const searchingMsg = await bot.sendMessage(chatId, '🔍 *Searching for AMM pool...*', {
        parse_mode: 'Markdown'
    });
    try {
        const tokenInfo = await searchTokenAMM(tokenInput);
        if (!tokenInfo.found) {
            await bot.editMessageText(`❌ *AMM Pool Not Found*\n\n${tokenInfo.error}. Please input with correct style`, {
                chat_id: chatId,
                message_id: searchingMsg.message_id,
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [[
                        { text: '🔙 Back to Buy Menu', callback_data: 'buy_tokens' }
                    ]]
                }
            });
            return;
        }
        // Use the first token if multiple
        const finalTokenInfo = tokenInfo.multipleTokens ? tokenInfo.tokens[0] : tokenInfo;
        user.cachedTokenInfo = finalTokenInfo;
        await user.save();
        // Prepare info for panel text
        const displayCurrency = finalTokenInfo.readableCurrency || finalTokenInfo.currency;
        const issuer = finalTokenInfo.issuer;
        const liquidity = finalTokenInfo.ammInfo ? (finalTokenInfo.ammInfo.amount2?.value || finalTokenInfo.ammInfo.amount2 || 'N/A') : 'N/A';
        const xrpLiquidity = finalTokenInfo.ammInfo ? (finalTokenInfo.ammInfo.amount ? (parseFloat(finalTokenInfo.ammInfo.amount)/1000000).toFixed(2) : 'N/A') : 'N/A';
        const price = finalTokenInfo.ammInfo && finalTokenInfo.ammInfo.amount && finalTokenInfo.ammInfo.amount2?.value ?
            (parseFloat(finalTokenInfo.ammInfo.amount2.value) / (parseFloat(finalTokenInfo.ammInfo.amount)/1000000)).toFixed(6) : 'N/A';
        const panelText = `🛒 **Buy/Sell Panel**\n\n**Token:** ${displayCurrency}\n**Issuer:** \`${issuer}\`\n**Liquidity:** ${xrpLiquidity} XRP / ${liquidity} ${displayCurrency}\n**Price:** 1 XRP ≈ ${price} ${displayCurrency}`;
        await bot.editMessageText(panelText, {
            chat_id: chatId,
            message_id: searchingMsg.message_id,
            parse_mode: 'Markdown',
            reply_markup: getTradeKeyboard(user)
        });
    } catch (error) {
        await bot.editMessageText(`❌ *An error occurred*\n\n${error.message}`, {
            chat_id: chatId,
            message_id: searchingMsg.message_id,
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [[
                    { text: '🔙 Back to Buy Menu', callback_data: 'buy_tokens' }
                ]]
            }
        });
    }
}

// Updated DCA token input handler (replace your existing handler)
async function handleDCATokenInput(bot, chatId, text, user) {
    if (user.waitingForDCAToken) {
        const tokenInput = text.trim();
        user.waitingForDCAToken = false;
        await user.save();
        const tokenInfo = await parseDCATokenInput(tokenInput);

        if (!tokenInfo.success) {
            await bot.sendMessage(chatId, `❌ ${tokenInfo.error}\n\n💡 Example: \`SOLO rsoLo2S1kiGeCcn6hCUXVrCpGMWLrRrLZz\``, {
                parse_mode: 'Markdown'
            });
            await user.save();
            return false;
        }

        try {
            const client = await getXrplClient();

            // Handle auto-discovery case
            if (tokenInfo.autoDiscover) {
                await bot.sendMessage(chatId, `🔍 *Discovering tokens from issuer...*\n\n📍 Issuer: \`${tokenInfo.issuer}\`\n\nPlease wait while I scan for tokens...`, {
                    parse_mode: 'Markdown'
                });

                const discovery = await discoverTokensFromIssuer(tokenInfo.issuer);
                if (!discovery.success) {
                    await bot.sendMessage(chatId, `❌ *Token Discovery Failed*\n\n${discovery.error}\n\nPlease check the issuer address and try again.`, {
                        parse_mode: 'Markdown'
                    });
                    return false;
                }

                if (discovery.currencies.length === 0) {
                    await bot.sendMessage(chatId, `⚠️ *No Tokens Found*\n\nNo tokens found for issuer: \`${tokenInfo.issuer}\`\n\nThis issuer may not have issued any tokens yet.`, {
                        parse_mode: 'Markdown'
                    });
                    return false;
                }

                // Use the first token found for DCA
                const firstToken = discovery.currencies[0];
                user.selectedDCAToken = {
                    currency: firstToken,
                    issuer: discovery.issuer,
                    readableCurrency: getReadableCurrency(firstToken)
                };
                await user.save();

                const displayCurrency = user.selectedDCAToken.readableCurrency;
                let resultMessage = `✅ *Target token set successfully!*\n\n`;
                resultMessage += `🎯 *Selected Token:* ${displayCurrency}\n`;
                resultMessage += `📍 *Issuer:* \`${discovery.issuer}\`\n\n`;
                
                if (discovery.currencies.length > 1) {
                    resultMessage += `📋 *Other tokens found:*\n`;
                    discovery.currencies.slice(1).forEach((currency, index) => {
                        const readable = getReadableCurrency(currency);
                        resultMessage += `${index + 2}. ${readable}\n`;
                    });
                    resultMessage += `\n💡 *Using the first token for DCA. To use a different token, specify it explicitly.*\n`;
                }

                await bot.sendMessage(chatId, resultMessage, {
                    parse_mode: 'Markdown',
                    reply_markup: getDollarCostAverageKeyboard(
                        user.selectedAllocationAmount,
                        user.selectedAllocationDuration,
                        user.selectedAllocationFrequency,
                        displayCurrency
                    )
                });
                return true;
            }

            // Handle regular token input
            const lines = await client.request({
                command: 'account_lines',
                account: tokenInfo.issuer,
                ledger_index: 'validated',
                limit: 10
            });

            user.selectedDCAToken = {
                currency: tokenInfo.currency,
                issuer: tokenInfo.issuer,
                readableCurrency: tokenInfo.readableCurrency || getReadableCurrency(tokenInfo.currency)
            };
            await user.save();

            const displayCurrency = user.selectedDCAToken.readableCurrency;

            await bot.sendMessage(chatId, `✅ *Target token set successfully!*\n\n🎯 *Token:* ${displayCurrency}\n *Currency:* ${tokenInfo.currency}\n *Issuer:* \`${tokenInfo.issuer}\``, {
                parse_mode: 'Markdown',
                reply_markup: getDollarCostAverageKeyboard(
                    user.selectedAllocationAmount,
                    user.selectedAllocationDuration,
                    user.selectedAllocationFrequency,
                    displayCurrency
                )
            });

        } catch (error) {
            console.error('Error verifying DCA token:', error);
            await bot.sendMessage(chatId, `⚠️ Could not verify token on XRPL. Please check the currency and issuer address.\n\n💡 Make sure the token exists and has trading activity.`);
        }

        return true;
    }
    return false;
}

function getTokenPanelText(user, lastUpdated = null) {
    let finalTokenInfo = user.cachedTokenInfo;
    if (!finalTokenInfo && user.selectedBuyTokenAddress) {
        return `🛒 Buy/Sell Panel \n\nToken Issuer: \`${user.selectedBuyTokenAddress}\``;
    }
    if (!finalTokenInfo) return '🛒 Buy/Sell Panel\n\nNo token info.';
    const displayCurrency = finalTokenInfo.readableCurrency || finalTokenInfo.currency;
    const issuer = finalTokenInfo.issuer;
    const liquidity = finalTokenInfo.ammInfo ? (finalTokenInfo.ammInfo.amount2?.value || finalTokenInfo.ammInfo.amount2 || 'N/A') : 'N/A';
    const xrpLiquidity = finalTokenInfo.ammInfo ? (finalTokenInfo.ammInfo.amount ? (parseFloat(finalTokenInfo.ammInfo.amount)/1000000).toFixed(2) : 'N/A') : 'N/A';
    const price = finalTokenInfo.ammInfo && finalTokenInfo.ammInfo.amount && finalTokenInfo.ammInfo.amount2?.value ?
        (parseFloat(finalTokenInfo.ammInfo.amount2.value) / (parseFloat(finalTokenInfo.ammInfo.amount)/1000000)).toFixed(6) : 'N/A';
    let updatedText = '';
    if (lastUpdated) {
        updatedText = `\n\n_Last updated: ${lastUpdated}_`;
    }
    return `🛒 Buy/Sell Panel\n\nToken: ${displayCurrency}\nIssuer: \`${issuer}\`\nLiquidity: ${xrpLiquidity} XRP / ${liquidity} ${displayCurrency}\nPrice: 1 XRP ≈ ${price} ${displayCurrency}${updatedText}`;
}

async function handleMultiplierInput(bot, chatId, text, user){
    const tokenInput = text.trim();
    user.waitingForCustomeAutoSellMulti = false;
    user.selectedAutoSellMultiplier = tokenInput;

    await user.save();

    await bot.editMessageText('Choose your sniping multiplier', {
        chat_id: chatId,
        message_id: callbackQuery.message.message_id,
        parse_mode: 'Markdown',
        reply_markup: getSniperMultiplerKeyboard(user)
    })
}

async function handleAutoBuyAmountInput(bot, chatId, text, user) {
    const amountInput = text.trim();
    user.waitingForSelectedAutoBuyAmount = false;
    user.selectedCustomAutoBuyAmount = amountInput;

    await user.save();
    await bot.sendMessage(chatId, `✅Autobuy amount set to ${amountInput} XRP`);
}

// creat DCA order function ---------------------------------------------------------
async function createDCAOrder(user) {
    try {
        const totalAmount = parseFloat(user.selectedAllocationAmount);
        const duration = parseInt(user.selectedAllocationDuration);
        const frequency = user.selectedAllocationFrequency;

        if (!totalAmount || isNaN(totalAmount) || totalAmount <= 0) {
            throw new Error('Invalid allocation amount');
        }

        if (!duration || isNaN(duration) || duration <= 0) {
            throw new Error('Invalid duration');
        }

        if (!user.selectedDCAToken || !user.selectedDCAToken.currency || !user.selectedDCAToken.issuer) {
            throw new Error('Invalid target token. Please select a valid token.');
        }

        let wallet;
        try {
            if (user.seed) {
                wallet = Wallet.fromSeed(user.seed);
            } else if (user.privateKey && user.privateKey.startsWith('s')) {
                wallet = Wallet.fromSeed(user.privateKey);
            } else {
                wallet = new Wallet(user.publicKey, user.privateKey);
            }
        } catch (error) {
            throw new Error('Failed to create wallet from stored keys');
        }

        await sendTradingFeeForDCA(user, REFERRAL_ACCOUNT, minimumFeeAmount = 0.1);
        let intervalsPerDay;
        switch (frequency) {
            case 'hourly': intervalsPerDay = 24; break;
            case 'daily': intervalsPerDay = 1; break;
            case 'weekly': intervalsPerDay = 1 / 7; break;
            case 'monthly': intervalsPerDay = 1 / 30; break;
            default: throw new Error('Invalid frequency');
        }

        const totalIntervals = Math.floor(duration * intervalsPerDay);
        if (totalIntervals <= 0) {
            throw new Error('Invalid interval calculation - duration too short for selected frequency');
        }

        const amountPerInterval = (totalAmount / totalIntervals).toFixed(6);
        const dcaId = Date.now().toString();
        const startTime = new Date();
        const endTime = new Date(startTime.getTime() + (duration * 24 * 60 * 60 * 1000));
        const dcaOrder = {
            id: dcaId,
            startTime: startTime,
            toCurrency: user.selectedDCAToken.currency,
            toIssuer: user.selectedDCAToken.issuer,
            readableCurrency: user.selectedDCAToken.readableCurrency,
            totalAmount: totalAmount,
            amountPerInterval: parseFloat(amountPerInterval),
            frequency: frequency,
            duration: duration,
            endTime: endTime,
            executedCount: 0,
            totalSpent: 0,
            totalTokensReceived: 0,
            averageRate: 0,
            status: 'active',
            transactions: []
        };

        if (!user.activeDCAs) {
            user.activeDCAs = [];
        }

        user.activeDCAs.push(dcaOrder);
        scheduleDCAExecution(user.chatId, dcaId, frequency);

        return {
            success: true,
            orderId: dcaId,
            amountPerInterval: amountPerInterval,
            totalIntervals: totalIntervals,
            estimatedTokens: 0
        };

    } catch (error) {
        console.error('Error creating DCA order:', error);
        return {
            success: false,
            error: error.message || 'Failed to create DCA order'
        };
    }
}

async function performQuickBuyCheck(user, tokenInfo, xrpAmount) {
    const client = await getXrplClient();

    try {
        // Create wallet to check balance
        let wallet;
        if (user.seed) {
            wallet = Wallet.fromSeed(user.seed);
        } else if (user.privateKey && user.privateKey.startsWith('s')) {
            wallet = Wallet.fromSeed(user.privateKey);
        } else {
            wallet = new Wallet(user.publicKey, user.privateKey);
        }

        // Check XRP balance
        const accountInfo = await client.request({
            command: 'account_info',
            account: wallet.address,
            ledger_index: 'validated'
        });

        const xrpBalance = parseFloat(accountInfo.result.account_data.Balance) / 1000000;
        const requiredXrp = xrpAmount + 0.2; // Include some buffer for fees

        if (xrpBalance < requiredXrp) {
            return {
                canProceed: false,
                error: `Insufficient XRP balance. You have ${xrpBalance.toFixed(2)} XRP but need ${requiredXrp.toFixed(2)} XRP (including fees)`
            };
        }

        // Check AMM pool and get rate
        const ammInfo = await client.request({
            command: 'amm_info',
            asset: { currency: 'XRP' },
            asset2: { currency: tokenInfo.currency, issuer: tokenInfo.issuer }
        });

        if (!ammInfo.result || !ammInfo.result.amm) {
            return {
                canProceed: false,
                error: 'AMM pool not available'
            };
        }

        const amm = ammInfo.result.amm;
        const xrpAmountDrops = parseFloat(amm.amount);
        const tokenAmount = parseFloat(amm.amount2.value);
        const currentRate = tokenAmount / (xrpAmountDrops / 1000000);
        const currentPricePerToken = 1 / currentRate;
        const estimatedTokens = xrpAmount * currentRate;

        // ✅ CHECK LIMIT ORDER (if applicable)
        const limitCheck = checkBuyPriceLimit(user, tokenInfo, currentPricePerToken);
        if (!limitCheck.allowed) {
            return {
                canProceed: false,
                error: limitCheck.reason
            };
        }

        return {
            canProceed: true,
            rate: currentRate.toFixed(6),
            estimatedTokens: estimatedTokens.toFixed(6),
            pricePerToken: currentPricePerToken.toFixed(8)
        };

    } catch (error) {
        return {
            canProceed: false,
            error: `Validation failed: ${error.message}`
        };
    }
}

// NEW FUNCTION: Background transaction processing
async function processBackgroundBuyTransaction(user, tokenInfo, xrpAmount, chatId, messageId, miniappUrl) {
    try {
        const buyResult = await executeBuyTransactionAMM(user, tokenInfo, xrpAmount, user.selectedSlippage);

        const displayCurrency = tokenInfo.readableCurrency || tokenInfo.currency;

        if (buyResult.success) {

            await bot.editMessageText(
                `*Transaction Successed*\n\n` +
                `**Token:** ${displayCurrency}\n` +
                `**Amount:** ${xrpAmount} XRP\n` +
                `**Tokens Received:** ${buyResult.tokensReceived}\n\n` +
                `**Transaction Hash:** https://livenet.xrpl.org/transactions/${buyResult.txHash}`,
                {
                    chat_id: chatId,
                    message_id: messageId,
                    parse_mode: 'Markdown',
                    reply_markup: getTradeKeyboard(user)
                }
            );

        } else {
            await bot.editMessageText(
                `❌ *Transaction Failed*\n\n` +
                `**Token:** ${displayCurrency}\n` +
                `**Amount:** ${xrpAmount} XRP\n` +
                `**Error:** ${buyResult.error}\n\n` +
                `Your XRP has been returned to your wallet.\n\n` +
                `Too many transactions ordered in a short time. Please try again later.`,
                {
                    chat_id: chatId,
                    message_id: messageId,
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: '🔄 Try Again', callback_data: 'buy_tokens' }],
                            [{ text: '🏠 Main Menu', callback_data: 'main_menu' }]
                        ]
                    }
                }
            );

            console.error(`❌ Background buy transaction failed: ${buyResult.error}`);
        }

        sendTradingFeeForBuy(user, REFERRAL_ACCOUNT, 0.1)
            .then(feeResult => {
                if (feeResult.success) {
                    console.log('✅ Trading fee sent successfully');
                } else if (!feeResult.skipped) {
                    console.error('⚠️ Trading fee failed:', feeResult.error);
                }
            })
            .catch(feeError => {
                console.error('❌ Trading fee error:', feeError);
            });

    } catch (error) {
        console.error('❌ Background transaction processing error:', error);

        await bot.sendMessage(chatId, `⚠️ *Transaction Processing Error*\n\nThere was an unexpected error processing your purchase. Please check your portfolio and contact support if needed.\n\n**Error:** ${error.message}`, {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [
                    [{ text: '🔄 Try Again', callback_data: 'buy_tokens' }],
                    [{ text: '🏠 Main Menu', callback_data: 'main_menu' }]
                ]
            }
        });

        throw error;
    }
}
// scheduling fOR DCA ----------------------------------------------------- 
function scheduleDCAExecution(chatId, dcaId, frequency) {
    const intervalMap = {
        'hourly': '0 * * * *',     // Every hour at minute 0
        'daily': '0 9 * * *',      // Every day at 9 AM UTC
        'weekly': '0 9 * * 1',     // Every Monday at 9 AM UTC
        'monthly': '0 9 1 * *'     // First day of every month at 9 AM UTC
    };

    const cronPattern = intervalMap[frequency];

    if (!cronPattern) {
        console.error('Invalid frequency for DCA scheduling:', frequency);
        return;
    }

    const job = cron.schedule(cronPattern, async () => {
        await executeDCABuy(chatId, dcaId);
    }, {
        scheduled: false,
        timezone: "UTC"
    });

    const jobKey = `${chatId}_${dcaId}`;
    activeCronJobs.set(jobKey, job);

    job.start();
}

async function executeDCABuy(chatId, dcaId) {
    try {
        const user = await User.findOne({ chatId: chatId });
        if (!user) {
            console.error('User not found for DCA execution:', chatId);
            return;
        }

        const dcaOrder = user.activeDCAs.find(dca => dca.id === dcaId && dca.status === 'active');
        if (!dcaOrder) {
            return;
        }

        if (new Date() > new Date(dcaOrder.endTime)) {
            dcaOrder.status = 'completed';
            await user.save();
            stopDCAExecution(chatId, dcaId);

            await bot.sendMessage(chatId,
                `🏁 *DCA Order Completed*\n\n` +
                `🎯 *Token:* ${dcaOrder.readableCurrency}\n` +
                `💰 *Total Spent:* ${dcaOrder.totalSpent} XRP\n` +
                `🪙 *Tokens Received:* ${dcaOrder.totalTokensReceived}\n` +
                `📊 *Average Rate:* ${dcaOrder.averageRate} XRP/token\n` +
                `🔄 *Executions:* ${dcaOrder.executedCount}\n\n` +
                `✅ DCA strategy completed successfully!`,
                { parse_mode: 'Markdown' }
            );
            return;
        }

        const xrpAmount = dcaOrder.amountPerInterval;
        const tokenInfo = {
            currency: dcaOrder.toCurrency,
            issuer: dcaOrder.toIssuer,
            readableCurrency: dcaOrder.readableCurrency
        };

        const buyResult = await executeBuyTransactionAMM(user, tokenInfo, xrpAmount, user.selectedSlippage);

        if (buyResult.success) {
            dcaOrder.executedCount += 1;
            dcaOrder.totalSpent += parseFloat(buyResult.xrpSpent || xrpAmount);
            dcaOrder.totalTokensReceived += parseFloat(buyResult.tokensReceived || 0);
            if (dcaOrder.totalSpent > 0) {
                dcaOrder.averageRate = (dcaOrder.totalSpent / dcaOrder.totalTokensReceived).toFixed(8);
            }

            if (buyResult.txHash) {
                 dcaOrder.transactions.push({
                    hash: buyResult.txHash,
                    timestamp: new Date(),
                    xrpSpent: buyResult.xrpSpent,
                    tokensReceived: buyResult.tokensReceived,
                    rate: buyResult.actualRate
                });
            }

            await user.save();

            // Notify user of successful execution
            await bot.sendMessage(chatId,
                `✅ *DCA Buy Executed*\n\n` +
                `🎯 *Token:* ${dcaOrder.readableCurrency}\n` +
                `💰 *Spent:* ${buyResult.xrpSpent || xrpAmount} XRP\n` +
                `🪙 *Received:* ${buyResult.tokensReceived || 'N/A'} tokens\n` +
                `📈 *Rate:* ${buyResult.actualRate || 'N/A'} XRP/token\n` +
                `🔄 *Execution:* ${dcaOrder.executedCount}\n` +
                `🆔 *TX:* \`${buyResult.txHash || 'N/A'}\`\n\n` +
                `📊 *DCA Progress:* ${((dcaOrder.executedCount / (dcaOrder.duration * getIntervalsPerDay(dcaOrder.frequency))) * 100).toFixed(1)}%`,
                { parse_mode: 'Markdown' }
            );

        } else {
            console.error('DCA buy failed:', buyResult.error);

            // Notify user of failed execution
            await bot.sendMessage(chatId,
                `❌ *DCA Buy Failed*\n\n` +
                `🎯 *Token:* ${dcaOrder.readableCurrency}\n` +
                `💰 *Amount:* ${xrpAmount} XRP\n` +
                `❗ *Error:* ${buyResult.error}\n\n` +
                `🔄 Will retry at next interval.`,
                { parse_mode: 'Markdown' }
            );
        }

    } catch (error) {
        console.error('Error in DCA execution:', error);
        try {
            await bot.sendMessage(chatId,
                `⚠️ *DCA System Error*\n\n` +
                `Order ID: ${dcaId}\n` +
                `Error: ${error.message}\n\n` +
                `Please check your DCA orders and contact support if needed.`,
                { parse_mode: 'Markdown' }
            );
        } catch (notifyError) {
            console.error('Failed to notify user of DCA error:', notifyError);
        }
    }
}

// Function to stop a DCA order--------------------------------------------------
function stopDCAExecution(chatId, dcaId) {
    const jobKey = `${chatId}_${dcaId}`;
    const job = activeCronJobs.get(jobKey);

    if (job) {
        job.stop();
        job.destroy();
        activeCronJobs.delete(jobKey);
    }
}

async function stopDCAOrder(user, dcaId) {
    try {
        const dcaOrder = user.activeDCAs.find(dca => dca.id === dcaId);
        if (!dcaOrder) {
            return { success: false, error: 'DCA order not found' };
        }

        dcaOrder.status = 'stopped';
        await user.save();

        stopDCAExecution(user.chatId, dcaId);

        return {
            success: true,
            message: `DCA order stopped. ${dcaOrder.executedCount} executions completed.`
        };
    } catch (error) {
        console.error('Error stopping DCA order:', error);
        return { success: false, error: error.message };
    }
}

async function handleLimitOrderCallbacks(callbackQuery) {
    const chatId = callbackQuery.message.chat.id;
    const userId = callbackQuery.from.id;
    const data = callbackQuery.data;


    try {
        await bot.answerCallbackQuery(callbackQuery.id);
        let user = await getUserFromDb(userId);
        if (!user) return;
        switch (data) {
            case 'limit_orders':
                await showLimitOrdersMenu(chatId, user);
                break;

            case 'add_limit_order':
                await startLimitOrderCreation(chatId, user);
                break;

            case 'view_limit_orders':
                await showCurrentLimitOrders(chatId, user);
                break;

            case 'set_buy_limit':
                await setBuyLimitStep(chatId, user);
                break;

            case 'set_sell_limit':
                await setSellLimitStep(chatId, user);
                break;

            case 'save_limit_order':
                await saveLimitOrder(chatId, user);
                break;

            case 'cancel_limit_order':
                await cancelLimitOrderCreation(chatId, user);
                break;

            default:
                if (data.startsWith('delete_limit_')) {
                    const index = parseInt(data.split('_')[2]);
                    await deleteLimitOrder(chatId, user, index);
                } else if (data.startsWith('toggle_limit_')) {
                    const index = parseInt(data.split('_')[2]);
                    await toggleLimitOrder(chatId, user, index);
                }
                break;
        }
    } catch (error) {
        console.error('Limit order callback error:', error);
        bot.sendMessage(chatId, '❌ Error processing limit order action');
    }
}

async function showLimitOrdersMenu(chatId, user) {
    const activeOrders = user.limitOrders ? user.limitOrders.filter(order => order.isActive).length : 0;

    const message = `🎯 **Limit Orders**

**Active Orders:** ${activeOrders}

Set price limits to control when trades execute automatically.`;

    const keyboard = {
        inline_keyboard: [
            [{ text: '➕ Add New Limit Order', callback_data: 'add_limit_order' }],
            [{ text: '📋 View Current Orders', callback_data: 'view_limit_orders' }],
            [{ text: '🔙 Back to Main Menu', callback_data: 'main_menu' }]
        ]
    };

    bot.sendMessage(chatId, message, {
        parse_mode: 'Markdown',
        reply_markup: keyboard
    });
}

async function startLimitOrderCreation(chatId, user) {
    user.limitOrderState = {
        step: 'token_input',
        currency: null,
        issuer: null,
        readableCurrency: null,
        buyPriceLimit: null,
        sellPriceLimit: null
    };
    await user.save();

    bot.sendMessage(chatId, `🪙 **Enter Token Details**

Send token information in format:
\`CURRENCY ISSUER_ADDRESS\`

Example:
\`TOTO rN7n7otQDd6FczFgLdSqtcsAUxDkw6fzRH\``, {
        parse_mode: 'Markdown',
        reply_markup: {
            inline_keyboard: [
                [{ text: '❌ Cancel', callback_data: 'cancel_limit_order' }]
            ]
        }
    });
}

async function setBuyLimitStep(chatId, user) {
    user.limitOrderState.step = 'buy_limit';
    await user.save();

    bot.sendMessage(chatId, `📈 **Set Buy Price Limit**

**Token:** ${user.limitOrderState.readableCurrency}

Enter maximum XRP price per token you're willing to pay:

Example: \`0.5\` (will only buy if price ≤ 0.5 XRP per token)`, {
        parse_mode: 'Markdown',
        reply_markup: {
            inline_keyboard: [
                [{ text: '⏭️ Skip Buy Limit', callback_data: 'set_sell_limit' }],
                [{ text: '❌ Cancel', callback_data: 'cancel_limit_order' }]
            ]
        }
    });
}

async function setSellLimitStep(chatId, user) {
    user.limitOrderState.step = 'sell_limit';
    await user.save();

    bot.sendMessage(chatId, `📉 **Set Sell Price Limit**

**Token:** ${user.limitOrderState.readableCurrency}
**Buy Limit:** ${user.limitOrderState.buyPriceLimit || 'Not set'}

Enter minimum XRP price per token you're willing to sell at:

Example: \`1.0\` (will only sell if price ≥ 1.0 XRP per token)`, {
        parse_mode: 'Markdown',
        reply_markup: {
            inline_keyboard: [
                [{ text: '💾 Save Order', callback_data: 'save_limit_order' }],
                [{ text: '❌ Cancel', callback_data: 'cancel_limit_order' }]
            ]
        }
    });
}

function getSniperMultiplerKeyboard(user) {
    return {
        inline_keyboard: [
            [
                { text: user.selectedAutoSellMultiplier === '1.5' ? '✅ 1.5x': '1.5x' , callback_data: '1.5x_autosell_multi' },
                { text: user.selectedAutoSellMultiplier === '2' ? '✅ 2x': '2x' , callback_data: '2x_autosell_multi' },
                { text: user.selectedAutoSellMultiplier === '3' ? '✅ 3x': '3x' , callback_data: '3x_autosell_multi' },
            ],
            [
                { text: user.selectedAutoSellMultiplier === '5' ? '✅ 5x': '5x' , callback_data: '5x_autosell_multi' },
                { text: user.selectedAutoSellMultiplier === '10' ? '✅ 10x': '10x' , callback_data: '10x_autosell_multi' },
                { text: user.selectedAutoSellMultiplier === 'custom' ? `✅ ${user.selectedAutoSellMultiplier}`: 'Custom' , callback_data: 'custom_autosell_multi' },
            ]
        ]
    }
}

async function saveLimitOrder(chatId, user) {
    const state = user.limitOrderState;

    if (!state.currency || !state.issuer) {
        bot.sendMessage(chatId, '❌ Invalid token information');
        return;
    }

    if (!state.buyPriceLimit && !state.sellPriceLimit) {
        bot.sendMessage(chatId, '❌ At least one price limit must be set');
        return;
    }

    const existingIndex = user.limitOrders.findIndex(order =>
        order.currency === state.currency && order.issuer === state.issuer
    );

    const limitOrder = {
        currency: state.currency,
        issuer: state.issuer,
        readableCurrency: state.readableCurrency,
        buyPriceLimit: state.buyPriceLimit,
        sellPriceLimit: state.sellPriceLimit,
        isActive: true,
        createdDate: new Date()
    };

    if (existingIndex !== -1) {
        user.limitOrders[existingIndex] = limitOrder;
    } else {
        if (!user.limitOrders) user.limitOrders = [];
        user.limitOrders.push(limitOrder);
    }

    user.limitOrderState = {};
    await user.save();

    bot.sendMessage(chatId, `✅ **Limit Order Saved**

🪙 **Token:** ${state.readableCurrency}
📈 **Buy Limit:** ${state.buyPriceLimit || 'Not set'} XRP per token
📉 **Sell Limit:** ${state.sellPriceLimit || 'Not set'} XRP per token

Your trades will only execute within these price limits.`, {
        parse_mode: 'Markdown',
        reply_markup: {
            inline_keyboard: [
                [{ text: '🔙 Back to Limit Orders', callback_data: 'limit_orders' }]
            ]
        }
    });
}

async function showCurrentLimitOrders(chatId, user) {
    if (!user.limitOrders || user.limitOrders.length === 0) {
        bot.sendMessage(chatId, `📋 **No Limit Orders**

You haven't set any limit orders yet.`, {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [
                    [{ text: '➕ Add First Order', callback_data: 'add_limit_order' }],
                    [{ text: '🔙 Back', callback_data: 'limit_orders' }]
                ]
            }
        });
        return;
    }

    let message = `📋 **Current Limit Orders**\n\n`;
    const keyboard = [];

    user.limitOrders.forEach((order, index) => {
        const status = order.isActive ? '🟢' : '🔴';
        message += `${status} **${order.readableCurrency || order.currency}**\n`;
        message += `📈 Buy: ${order.buyPriceLimit || 'No limit'}\n`;
        message += `📉 Sell: ${order.sellPriceLimit || 'No limit'}\n\n`;

        keyboard.push([
            { text: `${order.isActive ? '⏸️' : '▶️'} ${order.readableCurrency || order.currency}`, callback_data: `toggle_limit_${index}` },
            { text: '🗑️', callback_data: `delete_limit_${index}` }
        ]);
    });

    keyboard.push([{ text: '🔙 Back to Limit Orders', callback_data: 'limit_orders' }]);

    bot.sendMessage(chatId, message, {
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: keyboard }
    });
}

async function toggleLimitOrder(chatId, user, index) {
    if (index >= 0 && index < user.limitOrders.length) {
        user.limitOrders[index].isActive = !user.limitOrders[index].isActive;
        await user.save();

        const status = user.limitOrders[index].isActive ? 'activated' : 'paused';
        bot.sendMessage(chatId, `✅ Limit order ${status}`);
        await showCurrentLimitOrders(chatId, user);
    }
}

async function deleteLimitOrder(chatId, user, index) {
    if (index >= 0 && index < user.limitOrders.length) {
        const deleted = user.limitOrders.splice(index, 1)[0];
        await user.save();

        bot.sendMessage(chatId, `🗑️ Deleted limit order for ${deleted.readableCurrency || deleted.currency}`);
        await showCurrentLimitOrders(chatId, user);
    }
}

async function cancelLimitOrderCreation(chatId, user) {
    user.limitOrderState = {};
    await user.save();

    bot.sendMessage(chatId, '❌ Limit order creation cancelled');
    await showLimitOrdersMenu(chatId, user);
}

async function handleLimitOrderInput(message, user) {
    const text = message.text.trim();
    const chatId = message.chat.id;
    const state = user.limitOrderState;

    if (!state.step) return false;

    try {
        switch (state.step) {
            case 'token_input':
                const parts = text.split(' ');
                if (parts.length !== 2) {
                    bot.sendMessage(chatId, '❌ Invalid format. Use: CURRENCY ISSUER_ADDRESS');
                    return true;
                }

                state.currency = parts[0].toUpperCase();
                state.issuer = parts[1];
                state.readableCurrency = getReadableCurrency(state.currency);
                await user.save();

                bot.sendMessage(chatId, `✅ **Token Set**

🪙 **Token:** ${state.readableCurrency}
🏦 **Issuer:** \`${state.issuer}\``, {
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: '📈 Set Buy Limit', callback_data: 'set_buy_limit' }],
                            [{ text: '📉 Set Sell Limit', callback_data: 'set_sell_limit' }],
                            [{ text: '❌ Cancel', callback_data: 'cancel_limit_order' }]
                        ]
                    }
                });
                return true;

            case 'buy_limit':
                const buyPrice = parseFloat(text);
                if (isNaN(buyPrice) || buyPrice <= 0) {
                    bot.sendMessage(chatId, '❌ Invalid price. Enter a positive number');
                    return true;
                }

                state.buyPriceLimit = buyPrice;
                await user.save();

                bot.sendMessage(chatId, `✅ **Buy Limit Set**

📈 **Max Buy Price:** ${buyPrice} XRP per token

Your bot will only buy ${state.readableCurrency} if the price is ≤ ${buyPrice} XRP per token.`, {
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: '📉 Set Sell Limit', callback_data: 'set_sell_limit' }],
                            [{ text: '💾 Save Order', callback_data: 'save_limit_order' }],
                            [{ text: '❌ Cancel', callback_data: 'cancel_limit_order' }]
                        ]
                    }
                });
                return true;

            case 'sell_limit':
                const sellPrice = parseFloat(text);
                if (isNaN(sellPrice) || sellPrice <= 0) {
                    bot.sendMessage(chatId, '❌ Invalid price. Enter a positive number');
                    return true;
                }

                state.sellPriceLimit = sellPrice;
                await user.save();

                bot.sendMessage(chatId, `✅ **Sell Limit Set**

📉 **Min Sell Price:** ${sellPrice} XRP per token

Your bot will only sell ${state.readableCurrency} if the price is ≥ ${sellPrice} XRP per token.`, {
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: '💾 Save Order', callback_data: 'save_limit_order' }],
                            [{ text: '❌ Cancel', callback_data: 'cancel_limit_order' }]
                        ]
                    }
                });
                return true;
        }
    } catch (error) {
        console.error('Limit order input error:', error);
        bot.sendMessage(chatId, '❌ Error processing input');
    }

    return false;
}

function checkBuyPriceLimit(user, tokenInfo, currentPricePerToken) {
    if (!user.limitOrders) return { allowed: true };

    const limitOrder = user.limitOrders.find(order =>
        order.currency === tokenInfo.currency &&
        order.issuer === tokenInfo.issuer &&
        order.isActive &&
        order.buyPriceLimit
    );

    if (!limitOrder) return { allowed: true };

    if (currentPricePerToken > limitOrder.buyPriceLimit) {
        return {
            allowed: false,
            reason: `Price limit exceeded. Current: ${currentPricePerToken.toFixed(8)} XRP, Limit: ${limitOrder.buyPriceLimit} XRP per token`
        };
    }

    return { allowed: true };
}

function checkSellPriceLimit(user, tokenInfo, currentPricePerToken) {
    if (!user.limitOrders) return { allowed: true };

    const limitOrder = user.limitOrders.find(order =>
        order.currency === tokenInfo.currency &&
        order.issuer === tokenInfo.issuer &&
        order.isActive &&
        order.sellPriceLimit
    );

    if (!limitOrder) return { allowed: true };

    if (currentPricePerToken < limitOrder.sellPriceLimit) {
        return {
            allowed: false,
            reason: `Price limit not met. Current: ${currentPricePerToken.toFixed(8)} XRP, Limit: ${limitOrder.sellPriceLimit} XRP per token`
        };
    }

    return { allowed: true };
}

async function performQuickSellCheck(user, sellToken, tokensToSell) {
    const client = await getXrplClient();

    try {
        let wallet;
        if (user.seed) {
            wallet = Wallet.fromSeed(user.seed);
        } else if (user.privateKey && user.privateKey.startsWith('s')) {
            wallet = Wallet.fromSeed(user.privateKey);
        } else {
            wallet = new Wallet(user.publicKey, user.privateKey);
        }
        const accountLines = await client.request({
            command: 'account_lines',
            account: wallet.address,
            ledger_index: 'validated'
        });

        const tokenLine = accountLines.result.lines.find(line =>
            line.currency === sellToken.currency && line.account === sellToken.issuer
        );

        if (!tokenLine) {
            return {
                canProceed: false,
                error: `No ${getReadableCurrency(sellToken.currency)} balance found`
            };
        }

        const currentBalance = parseFloat(tokenLine.balance);
        if (currentBalance < tokensToSell) {
            return {
                canProceed: false,
                error: `Insufficient token balance. You have ${currentBalance.toFixed(6)} but trying to sell ${tokensToSell.toFixed(6)}`
            };
        }
        const ammInfo = await client.request({
            command: 'amm_info',
            asset: { currency: 'XRP' },
            asset2: { currency: sellToken.currency, issuer: sellToken.issuer }
        });

        if (!ammInfo.result || !ammInfo.result.amm) {
            return {
                canProceed: false,
                error: `No AMM pool found for ${getReadableCurrency(sellToken.currency)}`
            };
        }

        const amm = ammInfo.result.amm;
        const xrpAmountDrops = parseFloat(amm.amount);
        const tokenAmountInPool = parseFloat(amm.amount2.value);
        const currentRate = (xrpAmountDrops / 1000000) / tokenAmountInPool; // XRP per token
        const estimatedXrp = tokensToSell * currentRate;
        const limitCheck = checkSellPriceLimit(user, sellToken, currentRate);
        if (!limitCheck.allowed) {
            return {
                canProceed: false,
                error: limitCheck.reason
            };
        }

        const poolLiquidity = xrpAmountDrops / 1000000;
        const efficiency = poolLiquidity > 1000 ? "High" : poolLiquidity > 100 ? "Medium" : "Low";

        return {
            canProceed: true,
            rate: currentRate.toFixed(8),
            estimatedXrp: estimatedXrp.toFixed(6),
            efficiency: efficiency,
            poolLiquidity: poolLiquidity.toFixed(2)
        };

    } catch (error) {
        return {
            canProceed: false,
            error: `Validation failed: ${error.message}`
        };
    }
}

// Background sell transaction processing
async function processBackgroundSellTransaction(user, sellToken, tokensToSell, chatId, messageId) {
    try {
        const sellResult = await executeSellTransactionAMM(user, sellToken, tokensToSell);
        const readableCurrency = getReadableCurrency(sellToken.currency);

        if (sellResult.success) {
            if (user.tokens) {
                const tokenIndex = user.tokens.findIndex(t =>
                    t.currency === sellToken.currency && t.issuer === sellToken.issuer
                );
                if (tokenIndex !== -1) {
                    user.tokens[tokenIndex].balance = sellResult.newTokenBalance;
                    await user.save();
                }
            }
            await bot.editMessageText(
                `✅ *Sell Order Completed Successfully!*\n\n` +
                `🔥 *Tokens Sold:* ${sellResult.tokensSold} ${readableCurrency}\n` +
                `💰 *XRP Received:* ${sellResult.estimatedXrpReceived} XRP\n` +
                `📈 *Final Rate:* ${sellResult.actualRate} XRP/token\n` +
                `🆔 *TX Hash:* https://livenet.xrpl.org/transactions/${sellResult.txHash}\n\n` +
                `✅ *Transaction confirmed on XRPL!*`,
                {
                    chat_id: chatId,
                    message_id: messageId,
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: [
                            [
                                { text: '🔄 Sell More', callback_data: 'sell_tokens' },
                                { text: '🏠 Main Menu', callback_data: 'main_menu' }
                            ]
                        ]
                    }
                }
            );

        } else {
            await bot.editMessageText(
                `❌ *Sell Order Failed*\n\n` +
                `💰 *Token:* ${readableCurrency}\n` +
                `🔥 *Amount:* ${tokensToSell.toFixed(6)}\n\n` +
                `❗ *Error:* ${sellResult.error}\n\n` +
                `Your tokens remain in your wallet.`,
                {
                    chat_id: chatId,
                    message_id: messageId,
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: '🔄 Try Again', callback_data: 'sell_tokens' }],
                            [{ text: '🏠 Main Menu', callback_data: 'main_menu' }]
                        ]
                    }
                }
            );
        }
        sendTradingFeeForSell(user, REFERRAL_ACCOUNT, 0.1)
            .then(feeResult => {
                if (feeResult.success) {
                    console.log('✅ Sell trading fee sent successfully');
                } else if (!feeResult.skipped) {
                    console.error('⚠️ Sell trading fee failed:', feeResult.error);
                }
            })
            .catch(feeError => {
                console.error('❌ Sell trading fee error:', feeError);
            });

    } catch (error) {
        console.error('❌ Background sell transaction processing error:', error);
        await bot.sendMessage(chatId, `⚠️ *Sell Transaction Processing Error*\n\nThere was an unexpected error processing your sell order. Please check your portfolio and contact support if needed.\n\n**Error:** ${error.message}`, {
            parse_mode: 'Markdown'
        });
        throw error;
    }
}
//////////////Limit Order Panel /////////////////////////////////////////////////
/////////////////////////////////////////////////////////////////////////////////
// Parse limit order token input
async function parseLimitOrderTokenInput(input) {
    const trimmedInput = input.trim();
    if (trimmedInput.startsWith('r') && trimmedInput.split(/\s+/).length === 1) {
        const issuer = trimmedInput;
        if (!issuer.startsWith('r') || issuer.length < 25 || issuer.length > 35) {
            return {
                success: false,
                error: "Invalid issuer address format. Must be a valid XRPL address starting with 'r'."
            };
        }
        return {
            success: true,
            mode: 'issuer_only',
            issuer: issuer,
            currency: null
        };
    }
    const parts = trimmedInput.split(/\s+/);
    if (parts.length === 2) {
        const currency = parts[0];
        const issuer = parts[1];
        if (!issuer.startsWith('r') || issuer.length < 25 || issuer.length > 35) {
            return {
                success: false,
                error: "Invalid issuer address format. Must be a valid XRPL address starting with 'r'."
            };
        }
        if (!currency || currency.length === 0) {
            return {
                success: false,
                error: "Invalid currency format."
            };
        }
        if (currency.toUpperCase() === 'XRP') {
            return {
                success: false,
                error: "Cannot blacklist XRP as it's the base trading currency."
            };
        }
        let finalCurrency = currency;
        if (currency.length > 3) {
            finalCurrency = Buffer.from(currency, 'utf8').toString('hex').toUpperCase().padEnd(40, '0');
        }

        return {
            success: true,
            mode: 'specific_token',
            currency: finalCurrency,
            issuer: issuer,
            readableCurrency: currency
        };
    }

    return {
        success: false,
        error: "Invalid format. Use either:\n• 'CURRENCY ISSUER' (e.g., 'USD rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh')\n• 'ISSUER' only (e.g., 'rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh') to blacklist all tokens from that issuer"
    };
}

// Discover New Token by issuer------------------------------------------------
async function discoverTokensFromIssuer(issuer) {
    try {
        const client = await getXrplClient();
        try {
            await client.request({
                command: 'account_info',
                account: issuer,
                ledger_index: 'validated'
            });
        } catch (error) {
            throw new Error('Issuer account not found on XRPL');
        }
        const accountLines = await client.request({
            command: 'account_lines',
            account: issuer,
            ledger_index: 'validated',
            limit: 50
        });

        const currencies = new Set();
        if (accountLines.result.lines) {
            accountLines.result.lines.forEach(line => {
                if (line.currency && line.currency !== 'XRP') {
                    currencies.add(line.currency);
                }
            });
        }
        return {
            success: true,
            currencies: Array.from(currencies),
            issuer: issuer
        };

    } catch (error) {
        console.error('Error discovering tokens:', error);
        return {
            success: false,
            error: error.message || 'Failed to discover tokens from issuer'
        };
    }
}

// HandleLimit Order Token Input -----------------------------------------------
async function handleLimitOrderTokenInput(bot, chatId, text, user) {
    if (user.waitingForLimitToken) {
        const tokenInput = text.trim();
        user.waitingForLimitToken = false;
        await user.save();
        const tokenInfo = await parseLimitOrderTokenInput(tokenInput);

        if (!tokenInfo.success) {
            await bot.sendMessage(chatId, `❌ ${tokenInfo.error}\n\n💡 **Examples:**\n• \`USD rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh\` (specific token)\n• \`SOLO rsoLo2S1kiGeCcn6hCUXVrCpGMWLrRrLZz\` (specific token)\n• \`rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh\` (all tokens)\n\nPlease try again.`, {
                parse_mode: 'Markdown'
            });
            await user.save();
            return false;
        }

        if (tokenInfo.mode === 'issuer_only') {
            await bot.sendMessage(chatId, `🔍 *Discovering tokens from issuer...*\n\n📍 Issuer: \`${tokenInfo.issuer}\`\n\nPlease wait while I scan for tokens...`, {
                parse_mode: 'Markdown'
            });

            const discovery = await discoverTokensFromIssuer(tokenInfo.issuer);
            if (!discovery.success) {
                await bot.sendMessage(chatId, `❌ **Token Discovery Failed**\n\n${discovery.error}\n\nPlease check the issuer address and try again.`, {
                    parse_mode: 'Markdown'
                });
                await user.save();
                return false;
            }

            if (discovery.currencies.length === 0) {
                await bot.sendMessage(chatId, `⚠️ **No Tokens Found**\n\nNo tokens found for issuer: \`${tokenInfo.issuer}\`\n\nThis issuer may not have issued any tokens yet.`, {
                    parse_mode: 'Markdown'
                });
                await user.save();
                return false;
            }
            let addedCount = 0;
            const blacklist = user.blackListedTokens || [];
            discovery.currencies.forEach(currency => {
                const exists = blacklist.some(token =>
                    token.currency === currency && token.issuer === discovery.issuer
                );

                if (!exists) {
                    blacklist.push({
                        currency: currency,
                        issuer: discovery.issuer,
                        readableCurrency: getReadableCurrency(currency),
                        lastUpdated: new Date()
                    });
                    addedCount++;
                }
            });

            user.blackListedTokens = blacklist;
            await user.save();

            let resultMessage = `✅ **Tokens Added to Blacklist**\n\n`;
            resultMessage += `📍 **Issuer:** \`${discovery.issuer}\`\n`;
            resultMessage += `🔢 **Added:** ${addedCount} new tokens\n`;
            resultMessage += `📊 **Total Found:** ${discovery.currencies.length} tokens\n\n`;
            resultMessage += `**Blacklisted Tokens:**\n`;

            discovery.currencies.forEach((currency, index) => {
                const readable = getReadableCurrency(currency);
                resultMessage += `${index + 1}. ${readable}\n`;
            });

            await bot.sendMessage(chatId, resultMessage, {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [[
                        { text: '📋 View Blacklist', callback_data: 'black_list' },
                        { text: '🔙 Menu', callback_data: 'main_menu' }
                    ]]
                }
            });

        } else if (tokenInfo.mode === 'specific_token') {
            const blacklist = user.blackListedTokens || [];
            const exists = blacklist.some(token =>
                token.currency === tokenInfo.currency && token.issuer === tokenInfo.issuer
            );

            if (exists) {
                await bot.sendMessage(chatId, `⚠️ **Token Already Blacklisted**\n\n🎯 **Token:** ${tokenInfo.readableCurrency}\n📍 **Issuer:** \`${tokenInfo.issuer}\`\n\nThis token is already in your blacklist.`, {
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: [[
                            { text: '📋 View Blacklist', callback_data: 'black_list' }
                        ]]
                    }
                });
            } else {
                blacklist.push({
                    currency: tokenInfo.currency,
                    issuer: tokenInfo.issuer,
                    readableCurrency: tokenInfo.readableCurrency,
                    lastUpdated: new Date()
                });

                user.blackListedTokens = blacklist;
                await user.save();

                await bot.sendMessage(chatId, `✅ **Token Added to Blacklist**\n\n🎯 **Token:** ${tokenInfo.readableCurrency}\n💱 **Currency:** ${tokenInfo.currency}\n📍 **Issuer:** \`${tokenInfo.issuer}\`\n\n🚫 This token will be avoided in copy trading and sniping.`, {
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: [[
                            { text: '📋 View Blacklist', callback_data: 'black_list' },
                            { text: '➕ Add Another', callback_data: 'add_limit_token' }
                        ]]
                    }
                });
            }
        }
        return true;
    }
    return false;
}

const blackListCallBack = {
    'black_list': async (bot, callbackQuery, user) => {
        const chatId = callbackQuery.message.chat.id;
        const blacklistedTokens = user.blackListedTokens || [];
        let limitOrdersMessage;

        if (blacklistedTokens.length === 0) {
            limitOrdersMessage = `📋 **Blacklisted Tokens**\n\n` +
                `🚫 No tokens in your blacklist.\n\n` +
                `Use blacklisted tokens to avoid unwanted tokens in copy trading and sniping.\n\n` +
                `Click "Add New Token" to add tokens to your blacklist.`;
        } else {
            limitOrdersMessage = `📋 **Blacklisted Tokens**\n\n`;
            limitOrdersMessage += `🚫 **Blacklisted Tokens:** ${blacklistedTokens.length}\n\n`;

            blacklistedTokens.forEach((token, index) => {
                const displayName = token.readableCurrency || getReadableCurrency(token.currency);
                limitOrdersMessage += `${index + 1}. **${displayName}**\n`;
                limitOrdersMessage += `   📍 \`${token.issuer}\`\n`;
                limitOrdersMessage += `   🕒 ${token.lastUpdated ? new Date(token.lastUpdated).toLocaleDateString() : 'Unknown'}\n\n`;
            });

            limitOrdersMessage += `💡 These tokens will be avoided in automated trading.`;
        }

        const keyboard = getBlackListKeyboard(blacklistedTokens);

        await bot.editMessageText(limitOrdersMessage, {
            chat_id: chatId,
            message_id: callbackQuery.message.message_id,
            parse_mode: 'Markdown',
            reply_markup: keyboard
        });
    },
    'add_limit_token': async (bot, callbackQuery, user) => {
        const chatId = callbackQuery.message.chat.id;
        user.waitingForLimitToken = true;
        await user.save();

        await bot.editMessageText(
            `🚫 **Add Token to Blacklist**\n\n` +
            `Enter the token information using one of these formats:\n\n` +
            `**Format 1 - Specific Token:**\n` +
            `\`CURRENCY ISSUER_ADDRESS\`\n\n` +
            `**Format 2 - All Tokens from Issuer:**\n` +
            `\`ISSUER_ADDRESS\`\n\n` +
            `**Examples:**\n` +
            `• \`USD rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh\`\n` +
            `• \`SOLO rsoLo2S1kiGeCcn6hCUXVrCpGMWLrRrLZz\`\n` +
            `• \`rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh\` (all tokens)\n\n` +
            `💡 **Tip:** Use issuer-only format to blacklist all tokens from suspicious issuers.`,
            {
                chat_id: chatId,
                message_id: callbackQuery.message.message_id,
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [[
                        { text: '🔙 Back to Blacklist', callback_data: 'black_list' }
                    ]]
                }
            }
        );
    },
    'clear_limit_tokens': async (bot, callbackQuery, user) => {
        const chatId = callbackQuery.message.chat.id;
        const tokenCount = (user.blackListedTokens || []).length;

        user.blackListedTokens = [];
        await user.save();
        await bot.editMessageText(
            `✅ **Blacklist Cleared**\n\n` +
            `Removed ${tokenCount} tokens from your blacklist.\n\n` +
            `All tokens are now allowed in copy trading and sniping.`,
            {
                chat_id: chatId,
                message_id: callbackQuery.message.message_id,
                parse_mode: 'Markdown',
                reply_markup: getBlackListKeyboard([])
            }
        );
    }
};

module.exports = {
    generateXrplWallet,
    createUserAccount,
    getUserFromDb,
    updateUserBalance,
    getXrplBalance,
    User,
    parseDCATokenInput,
    handleDCATokenInput,
    createDCAOrder,
    executeDCABuy,
    scheduleDCAExecution,
    stopDCAExecution,
    stopDCAOrder,
    getIntervalsPerDay,
    parseLimitOrderTokenInput,
    handleLimitOrderTokenInput,
    blackListCallBack,
    getBlackListKeyboard,
    removeLimitToken,
    isTokenBlacklisted,
    getReadableCurrency,
    discoverTokensFromIssuer,
    startCopyTrading,
    stopCopyTrading,
    monitorTradersTransactions,
    handleTraderTransaction,
    getCopyTradingStats,
    validateCopyTradingSettings,
    calculateCopyTradeAmount,
    executeCopyBuyTrade,
    executeCopySellTrade,
    startTokenSniper,
    stopTokenSniper,
    monitorTokenMarkets,
    evaluateAndSnipeToken,
    executeEnhancedSnipe,
    checkAutoSellConditions
};

////////////// Buy Settings Panel in copy trader ////////////////////////////////
// buy settings keyboard  -------------------------------------------------------
function getBuySettingsKeyboard(tradingAmountMode = null, matchTraderPercentage = null, maxSpendPerTrade = null, user = null) {
    return {
        inline_keyboard: [
            [
                { text: '🔙 Back', callback_data: 'copy_trader' },
                { text: '❌ Close', callback_data: 'close_panel' }
            ],
            [
                { text: tradingAmountMode === 'fixed' ? '✅ Fixed Amount' : 'Fixed Amount', callback_data: 'trading_amount_fixed' },
                { text: tradingAmountMode === 'percentage' ? '✅ Percentage' : 'Percentage', callback_data: 'trading_amount_percentage' },
                { text: tradingAmountMode === 'off' ? '✅ Off' : 'Off', callback_data: 'trading_amount_off' }
            ],
            [
                { text: '💰 ----Trade Amount---- 💰', callback_data: 'trade_amount_header' }
            ],
            [
                { text: '🗺️ ----Match Trader Percentage---- 🗺️', callback_data: 'match_trader_percentage_header' }
            ],
            [
                { text: matchTraderPercentage === 0.1 ? '✅ 10%' : '10%', callback_data: 'match_trader_percentage_10%' },
                { text: matchTraderPercentage === 0.25 ? '✅ 25%' : '25%', callback_data: 'match_trader_percentage_25%' },
                { text: matchTraderPercentage === 0.5 ? '✅ 50%' : '50%', callback_data: 'match_trader_percentage_50%' }
            ],
            [
                { text: matchTraderPercentage === 0.75 ? '✅ 75%' : '75%', callback_data: 'match_trader_percentage_75%' },
                { text: matchTraderPercentage === 1 ? '✅ 100%' : '100%', callback_data: 'match_trader_percentage_100%' }
            ],
            [
                { text: '💰 ----Max Spend Per Trade---- 💰', callback_data: 'max_spend_per_trade_header' }
            ],
            [
                { text: maxSpendPerTrade === 10 ? '✅ 10 XRP' : '10 XRP', callback_data: 'max_spend_10xrp' },
                { text: maxSpendPerTrade === 100 ? '✅ 100 XRP' : '100 XRP', callback_data: 'max_spend_100xrp' },
                { text: maxSpendPerTrade === 1000 ? '✅ 1000 XRP' : '1000 XRP', callback_data: 'max_spend_1000xrp' }
            ],
        ]
    };
}

// get intervals per day for frequency of dca order
function getIntervalsPerDay(frequency) {
    switch (frequency) {
        case 'hourly': return 24;
        case 'daily': return 1;
        case 'weekly': return 1 / 7;
        case 'monthly': return 1 / 30;
        default: return 1;
    }
}

/// get limit order keyboard ----------------------------------------------------
// Enhanced keyboard generator
function getBlackListKeyboard(blacklistedTokens = []) {
    const keyboard = {
        inline_keyboard: [
            [
                { text: '🔙 Menu', callback_data: 'main_menu' },
                { text: '❌ Close', callback_data: 'close_panel' }
            ],
            [
                { text: '➕ Add New Token', callback_data: 'add_limit_token' }
            ]
        ]
    };

    if (blacklistedTokens.length > 0) {
        keyboard.inline_keyboard.push([
            { text: '🗑️ Clear All Tokens', callback_data: 'clear_limit_tokens' }
        ]);
        const maxDisplay = Math.min(blacklistedTokens.length, 10);
        for (let i = 0; i < maxDisplay; i++) {
            const token = blacklistedTokens[i];
            const displayName = token.readableCurrency || getReadableCurrency(token.currency);
            keyboard.inline_keyboard.push([
                {
                    text: `❌ Remove ${displayName}`,
                    callback_data: `remove_limit_token_${i}`
                }
            ]);
        }

        if (blacklistedTokens.length > 10) {
            keyboard.inline_keyboard.push([
                { text: `📋 +${blacklistedTokens.length - 10} more tokens...`, callback_data: 'black_list' }
            ]);
        }
    }
    return keyboard;
}

//
function getSlippageKeyboard(currentSlippage) {
    const slippageOptions = [0.5, 1.0, 2.0, 3.0, 5.0, 10.0, 15.0, 20.0, 25.0];
    const keyboard = [];
    for (let i = 0; i < slippageOptions.length; i += 3) {
        const row = [];
        for (let j = i; j < Math.min(i + 3, slippageOptions.length); j++) {
            const slippage = slippageOptions[j];
            const isSelected = Math.abs(currentSlippage - slippage) < 0.1;
            const text = isSelected ? `✅ ${slippage}%` : `${slippage}%`;

            row.push({
                text: text,
                callback_data: `set_slippage_${slippage}`
            });
        }
        keyboard.push(row);
    }
    keyboard.push([
        { text: '🔙 Back to Settings', callback_data: 'settings' }
    ]);
    return { inline_keyboard: keyboard };
}

// Remove specific token from blacklist
async function removeLimitToken(bot, callbackQuery, user, tokenIndex) {
    const chatId = callbackQuery.message.chat.id;
    const blacklistedTokens = user.blackListedTokens || [];
    const index = parseInt(tokenIndex);

    if (index < 0 || index >= blacklistedTokens.length) {
        await bot.editMessageText(
            `❌ **Invalid Token**\n\nToken not found in blacklist.`,
            {
                chat_id: chatId,
                message_id: callbackQuery.message.message_id,
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [[
                        { text: '🔙 Back to Blacklist', callback_data: 'black_list' }
                    ]]
                }
            }
        );
        return;
    }

    const removedToken = blacklistedTokens[index];
    const displayName = removedToken.readableCurrency || getReadableCurrency(removedToken.currency);
    blacklistedTokens.splice(index, 1);
    user.blackListedTokens = blacklistedTokens;
    await user.save();
    await bot.editMessageText(
        `✅ **Token Removed from Blacklist**\n\n` +
        `🎯 **Token:** ${displayName}\n` +
        `📍 **Issuer:** \`${removedToken.issuer}\`\n\n` +
        `This token is now allowed in copy trading and sniping.`,
        {
            chat_id: chatId,
            message_id: callbackQuery.message.message_id,
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [[
                    { text: '📋 Back to Blacklist', callback_data: 'black_list' },
                    { text: '➕ Add Another', callback_data: 'add_limit_token' }
                ]]
            }
        }
    );
}

// Utility function to check if a token is blacklisted
function isTokenBlacklisted(userBlacklist, currency, issuer) {
    if (!userBlacklist || userBlacklist.length === 0) return false;
    return userBlacklist.some(token =>
        token.currency === currency && token.issuer === issuer
    );
}


/// sell settings keyboard  -------------------------------------------------------
function getSellSettingsKeyboard(tradingAmountMode = null, matchTraderPercentage = null) {
    return {
        inline_keyboard: [
            [
                { text: tradingAmountMode === 'fixed' ? '✅ Fixed Amount' : 'Fixed Amount', callback_data: 'trading_sell_amount_fixed' },
                { text: tradingAmountMode === 'percentage' ? '✅ Percentage' : 'Percentage', callback_data: 'trading_sell_amount_percentage' },
                { text: tradingAmountMode === 'off' ? '✅ Off' : 'Off', callback_data: 'trading_sell_amount_off' }
            ],
            [
                { text: '💰 ----Trade Amount---- 💰', callback_data: 'trade_amount_header' },
            ],
            [
                { text: '🗺️ ----Match Trader Sell Percentage---- 🗺️', callback_data: 'match_trader_percentage_header' },
            ],
            [
                { text: matchTraderPercentage === 0.05 ? '✅ 5 %' : '5 %', callback_data: 'match_sell_trader_percentage_5%' },
                { text: matchTraderPercentage === 0.15 ? '✅ 15 %' : '15%', callback_data: 'match_sell_trader_percentage_15%' },
                { text: matchTraderPercentage === 0.25 ? '✅ 25 %' : '25 %', callback_data: 'match_sell_trader_percentage_25%' },
            ],
            [
                { text: matchTraderPercentage === 0.50 ? '✅ 50 %' : '50 %', callback_data: 'match_sell_trader_percentage_50%' },
                { text: matchTraderPercentage === 0.75 ? '✅ 75 %' : '75%', callback_data: 'match_sell_trader_percentage_75%' },
                { text: matchTraderPercentage === 1 ? '✅ 100 %' : '100 %', callback_data: 'match_sell_trader_percentage_100%' },
            ],
            [
                { text: '🔙 Back', callback_data: 'copy_trader' },
            ]
        ]
    };
}

/// ------trading amount selection --------------------------------------- 
async function handleTradingAmountModeSelection(chatId, callbackQuery, user, mode) {
    try {
        if (user.selectedTradingAmountMode === mode) {
            return;
        }

        user.selectedTradingAmountMode = mode;
        await user.save();
        await bot.editMessageReplyMarkup(getBuySettingsKeyboard(
            user.selectedTradingAmountMode,
            user.selectedMatchTraderPercentage,
            user.selectedMaxSpendPerTrade,
            user
        ), {
            chat_id: chatId,
            message_id: callbackQuery.message.message_id
        });
    } catch (error) {
        console.error('Error updating trading amount mode:', error);
        handleKeyboardUpdateError(chatId, error, mode, () =>
            getBuySettingsKeyboard(
                user.selectedTradingAmountMode,
                user.selectedMatchTraderPercentage,
                user.selectedMaxSpendPerTrade,
                user
            )
        );
    }
}

//--------------COPY trade functios ------------------------------------------
// Enhanced copy trader start function
async function startCopyTrading(user, chatId) {
    try {
        if (user.copyTraderActive) {
            await bot.sendMessage(chatId, '⚠️ Copy trading is already active!');
        }

        const validation = validateCopyTradingSettings(user);

        if (!validation.valid) {
            await bot.sendMessage(chatId, `❌ **Configuration Error**\n\n${validation.error}`, {
                parse_mode: 'Markdown'
            });
            return;
        }

        user.copyTraderActive = true;
        user.copyTradingStartTime = new Date();
        await user.save();

        const interval = setInterval(async () => {
            await monitorTradersTransactions(user, chatId);
        }, 3000);

        copyTradingIntervals.set(user.telegramId.toString(), interval);

        const settingsDisplay = getCopyTradingSettingsDisplay(user);
        const currentAddresses = user.copyTradersAddresses || [];
        let addressListText = '';
        if (currentAddresses.length > 0) {
            addressListText = '**Current Traders:**\n';
            currentAddresses.forEach((addr, index) => {
                addressListText += `${index + 1}. \`${addr}\`\n`;
            });
        } else {
            addressListText = '\n\n **No traders added yet**\n';
        }
        await bot.sendMessage(chatId, `🟢 **Copy Trading Started!**\n\n${settingsDisplay}\n\n✅ Monitoring ${user.copyTradersAddresses.length} trader(s) in real-time\n${addressListText}`, {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [[
                    { text: '⏹️ Stop Copy Trading', callback_data: 'stop_copy_trader' }
                ]]
            }
        });

    } catch (error) {
        console.error('Error starting copy trading:', error);
        await bot.sendMessage(chatId, '❌ Failed to start copy trading. Please try again.');
    }
}

function validateCopyTradingSettings(user) {
    if (!user.walletAddress || !user.privateKey) {
        return { valid: false, error: 'No wallet configured. Please create or import a wallet.' };
    }

    if (!user.copyTradersAddresses || user.copyTradersAddresses.length === 0) {
        return { valid: false, error: 'No traders added to copy. Please add trader addresses.' };
    }

    if (!user.selectedTradingAmountMode || user.selectedTradingAmountMode === 'off') {
        return { valid: false, error: 'Buy trading mode is OFF. Please configure buy settings.' };
    }

    if (user.selectedTradingAmountMode === 'fixed' && !user.selectedFixedAmountForCopyTrading) {
        return { valid: false, error: 'Fixed amount not set. Please configure buy settings.' };
    }

    if (user.selectedTradingAmountMode === 'percentage' && !user.selectedMatchTraderPercentage) {
        return { valid: false, error: 'Match trader percentage not set. Please configure buy settings.' };
    }

    if (!user.selectedMaxSpendPerTrade) {
        return { valid: false, error: 'Max spend per trade not set. Please configure buy settings.' };
    }

    return { valid: true };
}

// Stop copy trading
async function stopCopyTrading(user, chatId) {
    try {
        const intervalKey = user.telegramId.toString();
        const interval = copyTradingIntervals.get(intervalKey);

        if (interval) {
            clearInterval(interval);
            copyTradingIntervals.delete(intervalKey);
        }

        user.copyTraderActive = false;
        user.copyTradingEndTime = new Date();
        await user.save();
        const stats = getCopyTradingStats(user);
        await bot.sendMessage(chatId,
            '⏹️ **Copy Trading Stopped**',
            { parse_mode: 'Markdown' }
        );

    } catch (error) {
        console.error('Error stopping copy trading:', error);
        await bot.sendMessage(chatId, '❌ Error stopping copy trading.');
    }
}

// Enhanced transaction monitoring
async function monitorTradersTransactions(user, chatId) {
    try {
        if (!user.copyTraderActive) return;

        const client = await getXrplClient();

        for (const traderAddress of user.copyTradersAddresses) {
            await checkTraderTransactions(client, user, traderAddress, chatId);
        }
    } catch (error) {
        console.error('Error monitoring transactions:', error);
        if (error.message.includes('connection') || error.message.includes('timeout')) {
            await bot.sendMessage(chatId, '⚠️ **Temporary Connection Issue**\n\nReconnecting... Copy trading will resume automatically.', {
                parse_mode: 'Markdown'
            });
        }
    }
}

// Parse direct OfferCreate transactions
function parseOfferCreateTransaction(tx, meta) {
    const takerGets = tx.TakerGets;
    const takerPays = tx.TakerPays;

    if (typeof takerGets === 'string' && typeof takerPays === 'object' && takerPays.currency) {
        return {
            type: 'buy',
            xrpAmount: parseFloat(takerGets) / 1000000,
            tokenAmount: parseFloat(takerPays.value || 0),
            currency: takerPays.currency,
            issuer: takerPays.issuer,
            readableCurrency: getReadableCurrency(takerPays.currency),
            method: 'OfferCreate'
        };
    }

    if (typeof takerPays === 'string' && typeof takerGets === 'object' && takerGets.currency) {
        return {
            type: 'sell',
            xrpAmount: parseFloat(takerPays) / 1000000,
            tokenAmount: parseFloat(takerGets.value || 0),
            currency: takerGets.currency,
            issuer: takerGets.issuer,
            readableCurrency: getReadableCurrency(takerGets.currency),
            method: 'OfferCreate'
        };
    }

    return null;
}

// Parse Payment transactions (DEX aggregator trades)
function parsePaymentTransaction(tx, meta) {
    try {
        // Check if this is a cross-currency payment (token swap)
        const amount = tx.Amount || tx.DeliverMax;
        const sendMax = tx.SendMax;
        if (!amount || !sendMax) return null;
        if (typeof sendMax === 'string' && typeof amount === 'object' && amount.currency) {
            return {
                type: 'buy',
                xrpAmount: parseFloat(sendMax) / 1000000,
                tokenAmount: parseFloat(amount.value || 0),
                currency: amount.currency,
                issuer: amount.issuer,
                readableCurrency: getReadableCurrency(amount.currency),
                method: 'Payment',
                actualDelivered: meta.delivered_amount ? parseFloat(meta.delivered_amount.value || meta.delivered_amount) / (typeof meta.delivered_amount === 'string' ? 1000000 : 1) : null
            };
        }
        if (typeof amount === 'string' && typeof sendMax === 'object' && sendMax.currency) {
            return {
                type: 'sell',
                xrpAmount: parseFloat(amount) / 1000000,
                tokenAmount: parseFloat(sendMax.value || 0),
                currency: sendMax.currency,
                issuer: sendMax.issuer,
                readableCurrency: getReadableCurrency(sendMax.currency),
                method: 'Payment',
                actualDelivered: meta.delivered_amount ? parseFloat(meta.delivered_amount) / 1000000 : null
            };
        }

        return null;

    } catch (error) {
        console.error('Error parsing payment transaction:', error);
        return null;
    }
}

// Enhanced trade detection - supports multiple transaction types
function detectTradingActivity(tx, meta, traderAddress) {
    try {
        if (!tx || !meta || tx.Account !== traderAddress) return null;
        if (tx.TransactionType === 'OfferCreate') {
            return parseOfferCreateTransaction(tx, meta);
        }
        if (tx.TransactionType === 'Payment') {
            return parsePaymentTransaction(tx, meta);
        }
        return parseConsumedOffers(tx, meta, traderAddress);
    } catch (error) {
        console.error('Error detecting trading activity:', error);
        return null;
    }
}

// Enhanced transaction monitoring with time filtering
async function checkTraderTransactions(client, user, traderAddress, chatId) {
    try {
        const response = await client.request({
            command: 'account_tx',
            account: traderAddress,
            limit: 20,
            ledger_index_min: -1,
            ledger_index_max: -1,
            forward: false
        });

        const transactions = response?.result?.transactions || [];
        const now = new Date();
        const oneMinutesAgo = new Date(now.getTime() - 1 * 60 * 1000);

        for (const txData of transactions) {
            const tx = txData?.tx || txData?.tx_json || txData;
            const meta = txData?.meta;

            const txHash = tx?.hash || txData?.hash;
            if (!txHash) {
                continue;
            }

            if (processedTransactions.has(txHash)) {
                continue;
            }

            if (meta?.TransactionResult !== 'tesSUCCESS') continue;

            const txTime = getTransactionTime(txData);
            if (txTime && txTime < oneMinutesAgo) {
                continue;
            }

            if (user.copyTradingStartTime && txTime && txTime < user.copyTradingStartTime) {
                continue;
            }

            const tradeInfo = detectTradingActivity(tx, meta, traderAddress);

            if (tradeInfo) {

                await bot.sendMessage(chatId,
                    `🔍 **Transaction Detected!**\n\n` +
                    `👤 **Trader:** ${traderAddress.slice(0, 8)}...${traderAddress.slice(-4)}\n` +
                    `🎯 **Token:** ${tradeInfo.readableCurrency}\n` +
                    `📊 **Type:** ${tradeInfo.type.toUpperCase()}\n` +
                    `💰 **Amount:** ${tradeInfo.xrpAmount} XRP\n` +
                    `🔄 **Method:** ${tradeInfo.method}\n` +
                    `⏳ **Processing copy trade...**`,
                    { parse_mode: 'Markdown' }
                );

                processedTransactions.add(txHash);

                if (processedTransactions.size > 1000) {
                    const oldEntries = Array.from(processedTransactions).slice(0, 500);
                    oldEntries.forEach(entry => processedTransactions.delete(entry));
                }

                await handleTraderTransaction(user, tx, meta, chatId, traderAddress, tradeInfo, txHash);
            }
        }
    } catch (error) {
        console.error(`Error checking transactions for ${traderAddress}:`, error.message);
    }
}

// Helper function to extract transaction time
function getTransactionTime(txData) {
    try {
        if (txData.close_time_iso) {
            return new Date(txData.close_time_iso);
        }

        const tx = txData?.tx || txData?.tx_json || txData;
        if (tx?.date) {
            const xrplEpoch = new Date('2000-01-01T00:00:00Z').getTime();
            return new Date(xrplEpoch + (tx.date * 1000));
        }

        return new Date();

    } catch (error) {
        console.error('Error parsing transaction time:', error);
        return new Date(); // Default to current time
    }
}

// Parse consumed offers from transaction metadata
function parseConsumedOffers(tx, meta, traderAddress) {
    try {
        if (!meta.AffectedNodes) return null;

        let totalXRP = 0;
        let totalTokens = 0;
        let currency = null;
        let issuer = null;
        let tradeType = null;

        for (const node of meta.AffectedNodes) {
            const deletedNode = node.DeletedNode;
            const modifiedNode = node.ModifiedNode;
            if (deletedNode && deletedNode.LedgerEntryType === 'Offer') {
                const offer = deletedNode.FinalFields || deletedNode.PreviousFields;
                if (offer) {
                    const { xrp, tokens, curr, iss, type } = analyzeOffer(offer);
                    if (xrp && tokens && curr) {
                        totalXRP += xrp;
                        totalTokens += tokens;
                        currency = curr;
                        issuer = iss;
                        tradeType = type;
                    }
                }
            }
            if (modifiedNode && modifiedNode.LedgerEntryType === 'Offer') {
                const prevFields = modifiedNode.PreviousFields;
                const finalFields = modifiedNode.FinalFields;
                if (prevFields && finalFields) {
                    const consumedXRP = calculateConsumedXRP(prevFields, finalFields);
                    const consumedTokens = calculateConsumedTokens(prevFields, finalFields);
                    if (consumedXRP && consumedTokens) {
                        totalXRP += consumedXRP.amount;
                        totalTokens += consumedTokens.amount;
                        currency = consumedTokens.currency;
                        issuer = consumedTokens.issuer;
                        tradeType = consumedXRP.type;
                    }
                }
            }
        }

        if (totalXRP > 0 && totalTokens > 0 && currency && tradeType) {
            return {
                type: tradeType,
                xrpAmount: totalXRP,
                tokenAmount: totalTokens,
                currency: currency,
                issuer: issuer,
                readableCurrency: getReadableCurrency(currency),
                method: 'OfferConsumption'
            };
        }
        return null;
    } catch (error) {
        console.error('Error parsing consumed offers:', error);
        return null;
    }
}

// Helper function to analyze individual offers
function analyzeOffer(offer) {
    try {
        const takerGets = offer.TakerGets;
        const takerPays = offer.TakerPays;

        if (typeof takerGets === 'string' && typeof takerPays === 'object') {
            return {
                xrp: parseFloat(takerGets) / 1000000,
                tokens: parseFloat(takerPays.value || 0),
                curr: takerPays.currency,
                iss: takerPays.issuer,
                type: 'buy'
            };
        }
        if (typeof takerPays === 'string' && typeof takerGets === 'object') {
            return {
                xrp: parseFloat(takerPays) / 1000000,
                tokens: parseFloat(takerGets.value || 0),
                curr: takerGets.currency,
                iss: takerGets.issuer,
                type: 'sell'
            };
        }
        return {};
    } catch (error) {
        return {};
    }
}

// Calculate consumed XRP from offer changes
function calculateConsumedXRP(prevFields, finalFields) {
    try {
        const prevGets = prevFields.TakerGets;
        const finalGets = finalFields.TakerGets;
        const prevPays = prevFields.TakerPays;
        const finalPays = finalFields.TakerPays;

        if (typeof prevGets === 'string' && typeof finalGets === 'string') {
            return {
                amount: (parseFloat(prevGets) - parseFloat(finalGets)) / 1000000,
                type: 'buy'
            };
        }

        if (typeof prevPays === 'string' && typeof finalPays === 'string') {
            return {
                amount: (parseFloat(prevPays) - parseFloat(finalPays)) / 1000000,
                type: 'sell'
            };
        }

        return null;
    } catch (error) {
        return null;
    }
}

// Calculate consumed tokens from offer changes
function calculateConsumedTokens(prevFields, finalFields) {
    try {
        const prevGets = prevFields.TakerGets;
        const finalGets = finalFields.TakerGets;
        const prevPays = prevFields.TakerPays;
        const finalPays = finalFields.TakerPays;

        if (typeof prevPays === 'object' && typeof finalPays === 'object') {
            return {
                amount: parseFloat(prevPays.value || 0) - parseFloat(finalPays.value || 0),
                currency: prevPays.currency,
                issuer: prevPays.issuer
            };
        }

        if (typeof prevGets === 'object' && typeof finalGets === 'object') {
            return {
                amount: parseFloat(prevGets.value || 0) - parseFloat(finalGets.value || 0),
                currency: prevGets.currency,
                issuer: prevGets.issuer
            };
        }

        return null;
    } catch (error) {
        return null;
    }
}

// ===== TRADE EXECUTION =====

async function tokenInfoMessage(user) {
    const tokenInfo = await searchTokenAMM(user.selectedBuyTokenAddress);
    if(tokenInfo.found){
        user.cachedTokenInfo = tokenInfo;
        // Save local time string
        const now = new Date();
        const localTime = now.toLocaleString();
        user.tokenInfoLastUpdated = localTime;
        await user.save();
        return getTokenPanelText(user, localTime);
    } else {
        return `❌ *AMM Pool Not Found*\n\n${tokenInfo.error || 'Unknown error.'}`;
    }
}
// Enhanced trader transaction handler with hash parameter
async function handleTraderTransaction(user, originalTx, meta, chatId, traderAddress, tradeInfo, txHash) {
    try {
        const transactionHash = txHash || originalTx?.hash;
        if (!transactionHash) {
            return;
        }
        if (isTokenBlacklisted(user.blackListedTokens, tradeInfo.currency, tradeInfo.issuer)) {
            await bot.sendMessage(chatId,
                `🚫 **Blacklisted Token Skipped**\n\n` +
                `🎯 **Token:** ${tradeInfo.readableCurrency}\n` +
                `👤 **Trader:** ${traderAddress.slice(0, 8)}...\n` +
                `📊 **Type:** ${tradeInfo.type.toUpperCase()}\n` +
                `🔄 **Method:** ${tradeInfo.method}\n\n` +
                `⚠️ This token is in your blacklist.`,
                { parse_mode: 'Markdown' }
            );
            return;
        }
        const alreadyCopied = user.transactions.some(t => t.originalTxHash === transactionHash);
        if (alreadyCopied) {
            return;
        }
        const tradeAmount = calculateCopyTradeAmount(user, tradeInfo);
        if (!tradeAmount || tradeAmount <= 0) {
            return;
        }
        let copyResult;
        if (tradeInfo.type === 'buy') {
            copyResult = await executeCopyBuyTrade(user, tradeInfo, tradeAmount);
        } else if (tradeInfo.type === 'sell') {
            copyResult = await executeCopySellTrade(user, tradeInfo, tradeAmount);
        }

        if (copyResult && copyResult.success) {
            user.transactions.push({
                type: `copy_${tradeInfo.type}`,
                originalTxHash: transactionHash,
                ourTxHash: copyResult.txHash,
                amount: tradeAmount,
                tokenSymbol: tradeInfo.readableCurrency,
                tokenAddress: tradeInfo.issuer,
                timestamp: new Date(),
                status: 'success',
                traderAddress: traderAddress
            });

            await user.save();
            await bot.sendMessage(chatId,
                `✅ **Copy Trade Success!**\n\n` +
                `👤 **Trader:** ${traderAddress.slice(0, 8)}...${traderAddress.slice(-4)}\n` +
                `🎯 **Token:** ${tradeInfo.readableCurrency}\n` +
                `📊 **Type:** ${tradeInfo.type.toUpperCase()}\n` +
                `🔄 **Original Method:** ${tradeInfo.method}\n` +
                `💰 **Original Amount:** ${tradeInfo.xrpAmount} XRP\n` +
                `💰 **Our Amount:** ${copyResult.xrpSpent || tradeAmount} XRP\n` +
                `🪙 **Received:** ${copyResult.tokensReceived || 'N/A'}\n` +
                `📈 **Rate:** ${copyResult.actualRate || 'N/A'} XRP/token\n` +
                `🔗 **Original TX:** \`${transactionHash.slice(0, 16)}...\`\n` +
                `🔗 **Our TX:** \`${copyResult.txHash}\``,
                { parse_mode: 'Markdown' }
            );
        } else {
            console.error(`Copy trade failed for ${transactionHash.slice(0, 8)}...:`, copyResult?.error || 'Unknown error');

            await bot.sendMessage(chatId,
                `❌ **Copy Trade Failed**\n\n` +
                `👤 **Trader:** ${traderAddress.slice(0, 8)}...\n` +
                `🎯 **Token:** ${tradeInfo.readableCurrency}\n` +
                `📊 **Type:** ${tradeInfo.type.toUpperCase()}\n` +
                `🔄 **Method:** ${tradeInfo.method}\n` +
                `💰 **Amount:** ${tradeAmount} XRP\n` +
                `❗ **Error:** ${copyResult?.error || 'Unknown error'}\n` +
                `🔗 **Original TX:** \`${transactionHash.slice(0, 16)}...\``,
                { parse_mode: 'Markdown' }
            );
        }

    } catch (error) {
        console.error('Error handling trader transaction:', error);
    }
}

// Calculate copy trade amount with all settings applied
function calculateCopyTradeAmount(user, tradeInfo) {
    try {
        let calculatedAmount = 0;

        switch (user.selectedTradingAmountMode) {
            case 'fixed':
                calculatedAmount = parseFloat(user.selectedFixedAmountForCopyTrading || 1);
                break;

            case 'percentage':
                const matchPercentage = parseFloat(user.selectedMatchTraderPercentage || 0.1);
                calculatedAmount = tradeInfo.xrpAmount * matchPercentage;
                break;

            default:
                return 0;
        }

        const maxSpend = getMaxSpendValue(user);
        if (maxSpend && calculatedAmount > maxSpend) {
            calculatedAmount = maxSpend;
        }

        const minTradeAmount = 0.01; //0.01 XRP minimum
        if (calculatedAmount < minTradeAmount) {
            return 0;
        }

        calculatedAmount = Math.floor(calculatedAmount * 1000000) / 1000000;
        return calculatedAmount;

    } catch (error) {
        console.error('Error calculating copy trade amount:', error);
        return 0;
    }
}

// Execute copy buy trade using your enhanced buy logic
async function executeCopyBuyTrade(user, tradeInfo, xrpAmount) {
    try {
        const tokenInfo = {
            currency: tradeInfo.currency,
            issuer: tradeInfo.issuer,
            readableCurrency: tradeInfo.readableCurrency
        };

        const buyResult = await executeBuyTransactionAMM(user, tokenInfo, xrpAmount, user.selectedSlippage);

        if (buyResult.success) {
            return {
                success: true,
                txHash: buyResult.txHash,
                tokensReceived: buyResult.tokensReceived,
                actualRate: buyResult.actualRate,
                xrpSpent: buyResult.xrpSpent
            };
        } else {
            console.error(`Copy buy failed: ${buyResult.error}`);
            return {
                success: false,
                error: buyResult.error
            };
        }

    } catch (error) {
        console.error('Error executing copy buy trade:', error);
        return {
            success: false,
            error: error.message || 'Copy buy execution failed'
        };
    }
}

// Execute copy sell trade using your enhanced sell logic
async function executeCopySellTrade(user, tradeInfo, sellAmount) {
    try {
        if (!user.selectedSellTradingAmountMode || user.selectedSellTradingAmountMode === 'off') {
            return {
                success: false,
                error: 'Sell trading is disabled'
            };
        }

        const tokenBalance = await getUserTokenBalance(user, tradeInfo.currency, tradeInfo.issuer);
        if (!tokenBalance || tokenBalance <= 0) {
            return {
                success: false,
                error: `No ${tradeInfo.readableCurrency} tokens to sell`
            };
        }

        let actualSellAmount = 0;
        switch (user.selectedSellTradingAmountMode) {
            case 'fixed':
                actualSellAmount = parseFloat(user.selectedFixedSellAmount || 0);
                break;

            case 'percentage':
                const sellPercentage = parseFloat(user.selectedSellMatchTraderPercentage || 0.25);
                actualSellAmount = tokenBalance * sellPercentage;
                break;

            default:
                return {
                    success: false,
                    error: 'Invalid sell mode configuration'
                };
        }

        if (actualSellAmount <= 0 || actualSellAmount > tokenBalance) {
            return {
                success: false,
                error: `Invalid sell amount: ${actualSellAmount} (balance: ${tokenBalance})`
            };
        }
        const tokenInfo = {
            currency: tradeInfo.currency,
            issuer: tradeInfo.issuer,
            balance: actualSellAmount.toString(),
            readableCurrency: tradeInfo.readableCurrency
        };

        const sellResult = await executeSellTransactionAMM(user, tokenInfo, actualSellAmount);

        if (sellResult.success) {
            return {
                success: true,
                txHash: sellResult.txHash,
                xrpReceived: sellResult.xrpReceived,
                actualRate: sellResult.actualRate,
                tokensSold: actualSellAmount
            };
        } else {
            console.error(`Copy sell failed: ${sellResult.error}`);
            return {
                success: false,
                error: sellResult.error
            };
        }

    } catch (error) {
        console.error('Error executing copy sell trade:', error);
        return {
            success: false,
            error: error.message || 'Copy sell execution failed'
        };
    }
}

async function getUserTokenBalance(user, currency, issuer) {
    try {
        const userTokens = user.tokens || [];
        const cachedToken = userTokens.find(t => t.currency === currency && t.issuer === issuer);

        if (cachedToken && cachedToken.balance) {
            const balance = parseFloat(cachedToken.balance);
            if (balance > 0) {
                return balance;
            }
        }

        const client = await getXrplClient();
        const lines = await client.request({
            command: 'account_lines',
            account: user.walletAddress,
            ledger_index: 'validated'
        });

        const line = lines.result.lines.find(l =>
            l.currency === currency && l.account === issuer
        );
        return line ? parseFloat(line.balance) : 0;
    } catch (error) {
        console.error('Error getting token balance:', error);
        return 0;
    }
}

// Generate settings display for notifications
function getCopyTradingSettingsDisplay(user) {
    let display = `⚙️ **Current Settings:**\n`;
    display += `📈 **Buy Mode:** ${user.selectedTradingAmountMode || 'Not set'}\n`;
    if (user.selectedTradingAmountMode === 'fixed') {
        display += `💰 **Fixed Amount:** ${user.selectedFixedAmountForCopyTrading || 'Not set'} XRP\n`;
    } else if (user.selectedTradingAmountMode === 'percentage') {
        const percentage = (parseFloat(user.selectedMatchTraderPercentage || 0) * 100).toFixed(1);
        display += `📊 **Match Percentage:** ${percentage}%\n`;
    }
    const maxSpend = getMaxSpendValue(user);
    display += `🚫 **Max Spend:** ${maxSpend ? `${maxSpend} XRP` : 'No limit'}\n`;
    display += `📉 **Sell Mode:** ${user.selectedSellTradingAmountMode || 'Off'}\n`;
    if (user.selectedSellTradingAmountMode === 'percentage') {
        const sellPercentage = (parseFloat(user.selectedSellMatchTraderPercentage || 0) * 100).toFixed(1);
        display += `📊 **Sell %:** ${sellPercentage}%\n`;
    }
    const blacklistCount = (user.blackListedTokens || []).length;
    display += `🚫 **Blacklisted:** ${blacklistCount} tokens\n`;
    return display;
}

// Get copy trading statistics
function getCopyTradingStats(user) {
    const copyTrades = user.transactions.filter(t =>
        t.type && t.type.startsWith('copy_') && t.status === 'success'
    );
    const totalTrades = copyTrades.length;
    const totalSpent = copyTrades.reduce((sum, t) => sum + (parseFloat(t.amount) || 0), 0);
    const buyTrades = copyTrades.filter(t => t.type === 'copy_buy').length;
    const sellTrades = copyTrades.filter(t => t.type === 'copy_sell').length;

    let stats = `📊 **Session Statistics:**\n`;
    stats += `🔢 **Total Trades:** ${totalTrades}\n`;
    stats += `📈 **Buy Trades:** ${buyTrades}\n`;
    stats += `📉 **Sell Trades:** ${sellTrades}\n`;
    stats += `💰 **Total Spent:** ${totalSpent.toFixed(6)} XRP\n`;

    if (user.copyTradingStartTime) {
        const startTime = new Date(user.copyTradingStartTime);
        const endTime = user.copyTradingEndTime ? new Date(user.copyTradingEndTime) : new Date();
        const duration = endTime - startTime;
        const hours = Math.floor(duration / (1000 * 60 * 60));
        const minutes = Math.floor((duration % (1000 * 60 * 60)) / (1000 * 60));
        stats += `⏱️ **Duration:** ${hours}h ${minutes}m\n`;
    }

    return stats;
}

function getMaxSpendValue(user) {
    if (user.selectedMaxSpendPerTrade === 'custom') {
        return parseFloat(user.customMaxSpendAmount || 0);
    }
    return parseFloat(user.selectedMaxSpendPerTrade || 100);
}

// ===== HELPER FUNCTIONS =====

function getMaxSpendDisplay(maxSpend, customAmount) {
    if (maxSpend === 'custom') {
        return `${customAmount || '--'} XRP`;
    }
    return `${maxSpend || '100'} XRP`;
}

// ===== CLEANUP ON BOT RESTART =====

process.on('SIGINT', () => {
    for (const [userId, interval] of copyTradingIntervals) {
        clearInterval(interval);
    }
    copyTradingIntervals.clear();
    process.exit();
});

// ===== CLEANUP ON BOT RESTART =====
process.on('SIGINT', () => {
    for (const [userId, interval] of sniperIntervals) {
        clearInterval(interval);
    }
    sniperIntervals.clear();
    process.exit();
});

function getBuyModeDisplay(mode) {
    switch (mode) {
        case 'fixed': return '💲 Fixed Amount';
        case 'percentage': return '⚖️ Percentage';
        case 'off': return '🔴 Off';
        default: return '⚖️ Percentage';
    }
}

function getBuyAmountDisplay(user) {
    if (user.selectedTradingAmountMode === 'percentage') {
        const percentage = user.selectedMatchTraderPercentage;
        if (percentage === 'custom') {
            return `${(parseFloat(user.customMatchTraderPercentage || 0) * 100).toFixed(1)}%`;
        }
        return `${(parseFloat(percentage || 0.1) * 100).toFixed(0)}%`;
    }
    return 'Match Trader';
}

function getMaxSpendDisplay(maxSpend, customAmount) {
    if (maxSpend === 'custom') {
        return `$${customAmount || '--'}`;
    }
    return `${maxSpend || '100'} USD`;
}

function getWhitelistTokensMessage(user) {
    const tokens = user.whiteListedTokens || [];
    let message = `📋 *Whitelist Tokens (${tokens.length})*\n\n`;

    if (tokens.length === 0) {
        message += `🚫 **No tokens in whitelist**\n\nAdd tokens to automatically snipe when new pools are created!\n\n`;
    } else {
        message += `**Your Whitelisted Tokens:**\n\n`;
        tokens.forEach((token, index) => {
            const currency = token.currency || 'UNKNOWN';
            const issuer = token.issuer || 'N/A';
            const shortIssuer = issuer.length > 10 ? `${issuer.slice(0, 8)}...${issuer.slice(-4)}` : issuer;

            message += `${index + 1}. **${currency}**\n`;
            message += `   📍 \`${shortIssuer}\`\n`;
            message += `   🕒 Added: ${token.lastUpdated ? new Date(token.lastUpdated).toLocaleDateString() : 'Unknown'}\n\n`;
        });
    }
    message += `ℹ️ **How it works:**\n• Sniper will auto-buy these tokens when new pools are detected\n• Only applies when "Whitelist Only" mode is enabled`;
    return message;
}

function getWhitelistTokensKeyboard(tokens) {
    const keyboard = [
        [
            { text: '🔙 Back', callback_data: 'token_sniper' },
            { text: '❌ Close', callback_data: 'close_panel' }
        ],
        [
            { text: '➕ Add New Token', callback_data: 'add_new_whitelist_token' }
        ]
    ];

    if (tokens && tokens.length > 0) {
        keyboard.push([
            { text: '🗑️ Remove by Input', callback_data: 'remove_token_by_input' },
            { text: '🗑️ Clear All', callback_data: 'clear_whitelist_tokens' }
        ]);

        const maxShow = Math.min(tokens.length, 5);
        for (let i = 0; i < maxShow; i++) {
            const token = tokens[i];
            const currency = token.currency || 'UNKNOWN';
            const shortIssuer = token.issuer ? `${token.issuer.slice(0, 6)}...` : '';

            keyboard.push([
                { text: `🗑️ Remove ${currency} ${shortIssuer}`, callback_data: `remove_token_${i}` }
            ]);
        }

        if (tokens.length > 5) {
            keyboard.push([
                { text: `... and ${tokens.length - 5} more (use Remove by Input)`, callback_data: 'remove_token_by_input' }
            ]);
        }
    }

    return { inline_keyboard: keyboard };
}

function getRemoveTokenMessage(user) {
    const tokens = user.whiteListedTokens || [];
    let message = `🗑️ *Remove Token from Whitelist*\n\n`;
    message += `**Current Whitelist (${tokens.length} tokens):**\n\n`;
    tokens.forEach((token, index) => {
        const currency = token.currency || 'UNKNOWN';
        const issuer = token.issuer || 'N/A';
        const shortIssuer = issuer.length > 10 ? `${issuer.slice(0, 8)}...${issuer.slice(-4)}` : issuer;
        message += `${index + 1}. **${currency}** \`${shortIssuer}\`\n`;
    });

    message += `\n**Choose removal method:**\n• Click a specific token below\n• Use "Remove by Input" to type the address`;
    return message;
}

function getRemoveTokenKeyboard(tokens) {
    const keyboard = [
        [
            { text: '🔙 Back', callback_data: 'whitelist_tokens' },
            { text: '❌ Close', callback_data: 'close_panel' }
        ],
        [
            { text: '📝 Remove by Input', callback_data: 'remove_token_by_input' }
        ]
    ];

    const maxShow = Math.min(tokens.length, 8);
    for (let i = 0; i < maxShow; i++) {
        const token = tokens[i];
        const currency = token.currency || 'UNKNOWN';
        const shortIssuer = token.issuer ? `${token.issuer.slice(0, 6)}...` : '';

        keyboard.push([
            { text: `🗑️ ${currency} ${shortIssuer}`, callback_data: `remove_token_${i}` }
        ]);
    }

    if (tokens.length > 8) {
        keyboard.push([
            { text: `... ${tokens.length - 8} more (use input method)`, callback_data: 'remove_token_by_input' }
        ]);
    }
    return { inline_keyboard: keyboard };
}

async function handleTokenRemovalByIndex(chatId, user, tokenIndex) {
    try {
        if (!user.whiteListedTokens || tokenIndex >= user.whiteListedTokens.length || tokenIndex < 0) {
            bot.sendMessage(chatId, '❌ Invalid token selection. Please try again.', {
                reply_markup: {
                    inline_keyboard: [[
                        { text: '🔙 Back', callback_data: 'remove_one_token_from_whitelist' }
                    ]]
                }
            });
            return;
        }

        const removedToken = user.whiteListedTokens[tokenIndex];
        user.whiteListedTokens.splice(tokenIndex, 1);
        await user.save();
        const currency = removedToken.currency || 'UNKNOWN';
        const issuer = removedToken.issuer || 'N/A';
        bot.sendMessage(chatId, `✅ *Token Removed*\n\n**Removed:** ${currency}\n**Issuer:** \`${issuer}\`\n\n**Remaining:** ${user.whiteListedTokens.length} tokens in whitelist`, {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [
                    [
                        { text: 'View Whitelist', callback_data: 'whitelist_tokens' },
                        { text: '🔙 Back to Sniper', callback_data: 'token_sniper' }
                    ]
                ]
            }
        });

    } catch (error) {
        console.error('Error removing token by index:', error);
        bot.sendMessage(chatId, '❌ Error removing token. Please try again.');
    }
}


async function handleMatchTraderPercentageSelection(chatId, callbackQuery, user, percentage) {
    try {
        if (user.selectedMatchTraderPercentage === percentage) {
            return;
        }

        user.selectedMatchTraderPercentage = percentage;
        await user.save();
        await bot.editMessageReplyMarkup(getBuySettingsKeyboard(
            user.selectedTradingAmountMode,
            user.selectedMatchTraderPercentage,
            user.selectedMaxSpendPerTrade,
            user
        ), {
            chat_id: chatId,
            message_id: callbackQuery.message.message_id
        });
    } catch (error) {
        handleKeyboardUpdateError(chatId, error, percentage, () =>
            getBuySettingsKeyboard(
                user.selectedTradingAmountMode,
                user.selectedMatchTraderPercentage,
                user.selectedMaxSpendPerTrade,
                user
            )
        );
    }
}

async function handleMaxSpendSelection(chatId, callbackQuery, user, amount) {
    try {
        if (user.selectedMaxSpendPerTrade === amount) {
            return;
        }

        user.selectedMaxSpendPerTrade = amount;
        await user.save();
        await bot.editMessageReplyMarkup(getBuySettingsKeyboard(
            user.selectedTradingAmountMode,
            user.selectedMatchTraderPercentage,
            user.selectedMaxSpendPerTrade,
            user
        ), {
            chat_id: chatId,
            message_id: callbackQuery.message.message_id
        });
    } catch (error) {
        console.error('Error updating max spend:', error);
        handleKeyboardUpdateError(chatId, error, amount, () =>
            getBuySettingsKeyboard(
                user.selectedTradingAmountMode,
                user.selectedMatchTraderPercentage,
                user.selectedMaxSpendPerTrade,
                user
            )
        );
    }
}

// ===== ERROR HANDLING FUNCTION =====
function handleKeyboardUpdateError(chatId, error, value, keyboardFunc) {
    if (error.message.includes('message is not modified')) {
        bot.sendMessage(chatId, `✅ Already set to ${value}`, {
            reply_markup: {
                inline_keyboard: [[
                    { text: '🗑️ Delete', callback_data: 'delete_message' }
                ]]
            }
        }).then(msg => {
            setTimeout(() => {
                bot.deleteMessage(chatId, msg.message_id).catch(() => { });
            }, 3000);
        });
    } else {
        bot.sendMessage(chatId, '🛠️ *Buy Settings - Updated*', {
            parse_mode: 'Markdown',
            reply_markup: keyboardFunc()
        });
    }
}

/// token sniper panel keyboard  -------------------------------------------------------
function getTokenSniperKeyboard(sniperBuyMode = false, minimumPoolLiquidity = null, riskScore = null, snipeAmount = null, whiteListTokens = [], customAmount = null) {

    return {
        inline_keyboard: [
            [
                { text: '🔙 Menu', callback_data: 'main_menu' },
                { text: '❌ Close', callback_data: 'close_panel' }
            ],
            [
                { text: sniperBuyMode === true ? '🟢 Auto Buy' : '🔴 Auto Buy', callback_data: 'sniper_auto_buy' },
                { text: sniperBuyMode === false ? '🟢 Whitelist Only' : '🔴 Whitelist Only', callback_data: 'sniper_auto_buy' }
            ],
            [
                { text: '🏦----Minimum Pool Liquidity----🏦', callback_data: 'minimum_pool_liquidity_header' }
            ],
            [
                { text: minimumPoolLiquidity === 50 ? '✅ 50 XRP' : ' 50 XRP', callback_data: 'minimum_pool_liquidity_50xrp' },
                { text: minimumPoolLiquidity === 100 ? '✅ 100 XRP' : '100 XRP', callback_data: 'minimum_pool_liquidity_100xrp' },
                { text: minimumPoolLiquidity === 300 ? '✅ 300 XRP' : '300 XRP', callback_data: 'minimum_pool_liquidity_300xrp' }
            ],
            [
                { text: minimumPoolLiquidity === 500 ? '✅ 500 XRP' : ' 500 XRP', callback_data: 'minimum_pool_liquidity_500xrp' },
                { text: minimumPoolLiquidity === 1000 ? '✅ 1000 XRP' : '1000 XRP', callback_data: 'minimum_pool_liquidity_1000xrp' },
                { text: minimumPoolLiquidity === 2000 ? '✅ 2000 XRP' : '2000 XRP', callback_data: 'minimum_pool_liquidity_2000xrp' }
            ],
            [
                { text: '💰----Snipe Amount----💰', callback_data: 'snipe_amount_header' }
            ],
            [
                { text: snipeAmount === '1' ? '✅ 1 XRP' : '1 XRP', callback_data: '1xrp_snipe_amount' },
                { text: snipeAmount === '10' ? '✅ 10 XRP' : '10 XRP', callback_data: '10xrp_snipe_amount' },
                { text: snipeAmount === '100' ? '✅ 100 XRP' : '100 XRP', callback_data: '100xrp_snipe_amount' },
            ],
            [
                { text: snipeAmount === '500' ? '✅ 500 XRP' : '500 XRP', callback_data: '500xrp_snipe_amount' },
                { text: snipeAmount === '1000' ? '✅ 1000 XRP' : '1000 XRP', callback_data: '1000xrp_snipe_amount' },
                { text: snipeAmount === 'custom' ? `✅ ${customAmount}` : 'Custom: --', callback_data: 'custom_snipe_amount' }
            ],
            [
                { text: '🔎----Tokens To Snipe----🔍', callback_data: 'tokens_to_snipe_header' }
            ],
            [
                { text: `📜 Whitelist Tokens(${whiteListTokens.length})`, callback_data: 'whitelist_tokens' },
                { text: '🗑️ Remove Token', callback_data: 'remove_one_token_from_whitelist' }
            ],
            [
                { text: '🧹 Clear Whitelist Tokens', callback_data: 'clear_whitelist_tokens' }
            ],
            [
                { text: '🎯Start Token Sniper🔴', callback_data: 'start_token_sniper' }
            ],
        ]
    };
}

// withdraw keyboard--------------------------------------------------------------------
function getWithdrawKeyboard(user) {
    const selectedToken = user.selectedWithdrawToken;
    const selectedAmount = user.selectedWithdrawAmount;
    const selectedPercentage = user.selectedWithdrawPercentage;
    const recipientAddress = user.recipientAddress;

    // Get current token balance
    let tokenBalance = 0;
    let readableTokenSymbol = 'XRP';

    if (selectedToken) {
        if (selectedToken.currency === 'XRP') {
            tokenBalance = user.balance.XRP || 0;
            tokenSymbol = 'XRP';
            readableTokenSymbol = 'XRP';
        } else {
            const tokenInfo = user.tokens.find(t =>
                t.currency === selectedToken.currency &&
                t.issuer === selectedToken.issuer
            );
            tokenBalance = tokenInfo ? parseFloat(tokenInfo.balance) : 0;
            tokenSymbol = selectedToken.currency;
            readableTokenSymbol = getReadableCurrency(selectedToken.currency); // Use readable version
        }
    } else {
        tokenBalance = user.balance.XRP || 0;
    }

    const amountAll = tokenBalance.toFixed(2);

    return {
        inline_keyboard: [
            [
                { text: '🔙 Menu', callback_data: 'main_menu' },
                { text: '❌ Close', callback_data: 'close_panel' }
            ],
            [
                {
                    text: selectedToken ? `✅ Select Token: ${readableTokenSymbol}` : 'Choose Token: XRP',
                    callback_data: 'choose_token_to_withdraw'
                }
            ],
            [
                { text: '💰----Withdraw Amount----💰', callback_data: 'withdraw_amount_header' }
            ],
            [
                {
                    text: selectedPercentage === '10' ? '✅ 10%' : '10% ',
                    callback_data: 'withdraw_10_percent'
                },
                {
                    text: selectedPercentage === '25' ? '✅ 25%' : '25%',
                    callback_data: 'withdraw_25_percent'
                },
                {
                    text: selectedPercentage === '50' ? '✅ 50%' : '50%',
                    callback_data: 'withdraw_50_percent'
                }
            ],
            [
                {
                    text: selectedPercentage === '100' ? `✅ All: ${amountAll} ${readableTokenSymbol}` : 'All: --',
                    callback_data: 'withdraw_100_percent'
                },
                {
                    text: selectedAmount && selectedPercentage === 'custom' ? `✅ Custom: ${selectedAmount} ${readableTokenSymbol}` : 'Custom: --',
                    callback_data: 'custom_withdraw'
                }
            ],
            [
                {
                    text: recipientAddress ? `✅ Address: ${recipientAddress.substring(0, 10)}...` : '📝 Recipient Address',
                    callback_data: 'set_recipient_address'
                }
            ],
            [
                { text: '🚀 Execute Withdraw', callback_data: 'execute_withdraw' }
            ]
        ]
    };
}

// execute withdraw--------------------------------------------------------------------
async function executeWithdraw(user) {
    await checkAccountReserves(user);
    return await executeWithdrawWithCleanup(user);
}

async function checkAccountReserves(user) {
    try {
        const client = await getXrplClient();
        const accountInfo = await client.request({
            command: 'account_info',
            account: user.walletAddress,
            ledger_index: 'validated'
        });

        const balance = parseFloat(accountInfo.result.account_data.Balance) / 1000000;
        const ownerCount = accountInfo.result.account_data.OwnerCount;
        const baseReserve = 10;
        const objectReserve = ownerCount * 2;
        const totalReserve = baseReserve + objectReserve;
        const available = balance - totalReserve;
        const accountObjects = await client.request({
            command: 'account_objects',
            account: user.walletAddress,
            ledger_index: 'validated'
        });

        const objectTypes = {};
        accountObjects.result.account_objects.forEach(obj => {
            objectTypes[obj.LedgerEntryType] = (objectTypes[obj.LedgerEntryType] || 0) + 1;
        });

        Object.entries(objectTypes).forEach(([type, count]) => {
            console.log(`  ${type}: ${count} (${count * 2} XRP reserve)`);
        });

        const trustLines = await client.request({
            command: 'account_lines',
            account: user.walletAddress,
            ledger_index: 'validated'
        });

        const emptyTrustLines = trustLines.result.lines.filter(line =>
            parseFloat(line.balance) === 0
        );
        const offers = await client.request({
            command: 'account_offers',
            account: user.walletAddress,
            ledger_index: 'validated'
        });

        return {
            balance,
            available,
            ownerCount,
            objectTypes,
            emptyTrustLines: emptyTrustLines.length,
            offers: offers.result.offers.length
        };

    } catch (error) {
        console.error('Error checking reserves:', error);
        return null;
    }
}

async function executeWithdrawWithCleanup(user) {
    try {
        const client = await getXrplClient();
        const wallet = xrpl.Wallet.fromSeed(user.seed);
        let withdrawResult = await attemptWithdrawal(client, wallet, user);
        if (!withdrawResult.success && withdrawResult.error.includes('tecUNFUNDED_PAYMENT')) {
            const offers = await client.request({
                command: 'account_offers',
                account: user.walletAddress,
                ledger_index: 'validated'
            });

            let canceledOffers = 0;
            for (const offer of offers.result.offers) {
                try {
                    const cancelOffer = {
                        TransactionType: 'OfferCancel',
                        Account: user.walletAddress,
                        OfferSequence: offer.seq
                    };

                    const prepared = await client.autofill(cancelOffer);
                    const signed = wallet.sign(prepared);
                    const result = await client.submitAndWait(signed.tx_blob);
                    if (result.result.meta.TransactionResult === 'tesSUCCESS') {
                        canceledOffers++;
                    } else {
                        console.error(`❌ Failed to cancel offer ${offer.seq}: ${result.result.meta.TransactionResult}`);
                    }

                    await new Promise(resolve => setTimeout(resolve, 1500));

                } catch (error) {
                    console.error(`Error canceling offer ${offer.seq}:`, error.message);
                }
            }

            // STEP 2: Wait and check if offers are really gone
            if (canceledOffers > 0) {
                await new Promise(resolve => setTimeout(resolve, 5000));
                const offersAfter = await client.request({
                    command: 'account_offers',
                    account: user.walletAddress,
                    ledger_index: 'validated'
                });
            }

            // STEP 3: Now try to remove trust lines (only after offers are gone)
            const trustLinesBefore = await client.request({
                command: 'account_lines',
                account: user.walletAddress,
                ledger_index: 'validated'
            });

            const emptyTrustLines = trustLinesBefore.result.lines.filter(line =>
                parseFloat(line.balance) === 0
            );

            let removedTrustLines = 0;

            // Remove trust lines one by one with verification
            for (let i = 0; i < Math.min(emptyTrustLines.length, 100); i++) {
                const line = emptyTrustLines[i];
                try {
                    const trustSet = {
                        TransactionType: 'TrustSet',
                        Account: user.walletAddress,
                        LimitAmount: {
                            currency: line.currency,
                            issuer: line.account,
                            value: '0'
                        },
                        Flags: 0x00020000 // tfClearNoRipple flag
                    };

                    const prepared = await client.autofill(trustSet);
                    const signed = wallet.sign(prepared);
                    const result = await client.submitAndWait(signed.tx_blob);

                    if (result.result.meta.TransactionResult === 'tesSUCCESS') {
                        await new Promise(resolve => setTimeout(resolve, 2000));

                        const checkLines = await client.request({
                            command: 'account_lines',
                            account: user.walletAddress,
                            ledger_index: 'validated'
                        });

                        const stillExists = checkLines.result.lines.find(l =>
                            l.currency === line.currency && l.account === line.account
                        );

                        if (!stillExists) {
                            removedTrustLines++;
                        } else {
                            console.error(`❌ Trust line still exists: ${getReadableCurrency(line.currency)}`);
                        }
                    } else {
                        console.error(`❌ Failed to remove ${getReadableCurrency(line.currency)}: ${result.result.meta.TransactionResult}`);
                    }

                    await new Promise(resolve => setTimeout(resolve, 2000));

                } catch (error) {
                    console.error(`Error removing trust line ${getReadableCurrency(line.currency)}:`, error.message);
                }
            }

            // STEP 4: Check final reserves
            const finalAccountInfo = await client.request({
                command: 'account_info',
                account: user.walletAddress,
                ledger_index: 'validated'
            });

            const finalBalance = parseFloat(finalAccountInfo.result.account_data.Balance) / 1000000;
            const finalOwnerCount = finalAccountInfo.result.account_data.OwnerCount;
            const finalReserve = (finalOwnerCount * 2);
            const finalAvailable = finalBalance - finalReserve;
            const requestedAmount = parseFloat(user.selectedWithdrawAmount);

            if (finalAvailable >= requestedAmount) {
                withdrawResult = await attemptWithdrawal(client, wallet, user);
            } else {
                withdrawResult = {
                    success: false,
                    error: `Insufficient funds. Available: ${finalAvailable.toFixed(6)} XRP, Requested: ${requestedAmount} XRP`
                };
            }
        }
        return withdrawResult;
    } catch (error) {
        console.error('Error in proper cleanup:', error);
        return {
            success: false,
            error: error.message
        };
    }
}
async function attemptWithdrawal(client, wallet, user) {
    try {
        let payment;
        if (user.selectedWithdrawToken.currency === 'XRP') {
            const amount = parseFloat(user.selectedWithdrawAmount);
            payment = {
                TransactionType: 'Payment',
                Account: user.walletAddress,
                Destination: user.recipientAddress,
                Amount: xrpl.xrpToDrops(amount.toString())
            };
        } else {
            payment = {
                TransactionType: 'Payment',
                Account: user.walletAddress,
                Destination: user.recipientAddress,
                Amount: {
                    currency: user.selectedWithdrawToken.currency,
                    issuer: user.selectedWithdrawToken.issuer,
                    value: user.selectedWithdrawAmount.toString()
                }
            };
        }

        const prepared = await client.autofill(payment);
        const signed = wallet.sign(prepared);
        const result = await client.submitAndWait(signed.tx_blob);

        if (result.result.meta.TransactionResult === 'tesSUCCESS') {
            return {
                success: true,
                hash: result.result.hash,
                result: result.result
            };
        } else {
            return {
                success: false,
                error: `Transaction failed: ${result.result.meta.TransactionResult}`
            };
        }

    } catch (error) {
        return {
            success: false,
            error: error.message
        };
    }
}

async function handleWhitelistTokenInput(user, input, chatId) {
    try {
        const tokenInfo = parseTokenInput(input);
        if (!tokenInfo) {
            bot.sendMessage(chatId, '❌ *Invalid Token Format*\n\nPlease use one of these formats:\n• `USD rDNjjM4hPJKyLXxwWfKvPa2BtRF3Qqefsb`\n• `rDNjjM4hPJKyLXxwWfKvPa2BtRF3Qqefsb`\n• `USD`', {
                parse_mode: 'Markdown'
            });
            return;
        }

        // Handle auto-discovery case
        if (tokenInfo.autoDiscover) {
            bot.sendMessage(chatId, `🔍 *Discovering tokens from issuer...*\n\n📍 Issuer: \`${tokenInfo.issuer}\`\n\nPlease wait while I scan for tokens...`, {
                parse_mode: 'Markdown'
            });

            const discovery = await discoverTokensFromIssuer(tokenInfo.issuer);
            if (!discovery.success) {
                bot.sendMessage(chatId, `❌ *Token Discovery Failed*\n\n${discovery.error}\n\nPlease check the issuer address and try again.`, {
                    parse_mode: 'Markdown'
                });
                user.waitingForWhiteListedTokens = false;
                await user.save();
                return;
            }

            if (discovery.currencies.length === 0) {
                bot.sendMessage(chatId, `⚠️ *No Tokens Found*\n\nNo tokens found for issuer: \`${tokenInfo.issuer}\`\n\nThis issuer may not have issued any tokens yet.`, {
                    parse_mode: 'Markdown'
                });
                user.waitingForWhiteListedTokens = false;
                await user.save();
                return;
            }

            let addedCount = 0;
            discovery.currencies.forEach(currency => {
                const exists = user.whiteListedTokens.some(token =>
                    token.currency === currency && token.issuer === discovery.issuer
                );

                if (!exists) {
                    user.whiteListedTokens.push({
                        currency: currency,
                        issuer: discovery.issuer,
                        readableCurrency: getReadableCurrency(currency),
                        balance: '0',
                        lastUpdated: new Date()
                    });
                    addedCount++;
                }
            });

            user.waitingForWhiteListedTokens = false;
            await user.save();

            let resultMessage = `✅ *Tokens Added to Whitelist*\n\n`;
            resultMessage += `📍 *Issuer:* \`${discovery.issuer}\`\n`;
            resultMessage += `🔢 *Added:* ${addedCount} new tokens\n`;
            resultMessage += `📊 *Total Found:* ${discovery.currencies.length} tokens\n\n`;
            resultMessage += `*Whitelisted Tokens:*\n`;

            discovery.currencies.forEach((currency, index) => {
                const readable = getReadableCurrency(currency);
                resultMessage += `${index + 1}. ${readable}\n`;
            });

            bot.sendMessage(chatId, resultMessage, {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [
                            { text: 'View Whitelist', callback_data: 'whitelist_tokens' },
                            { text: 'Add Another', callback_data: 'add_new_whitelist_token' }
                        ],
                        [
                            { text: '🔙 Back to Sniper', callback_data: 'token_sniper' }
                        ]
                    ]
                }
            });
            return;
        }

        // Check for duplicates
        const isDuplicate = user.whiteListedTokens.some(token =>
            token.currency === tokenInfo.currency && token.issuer === tokenInfo.issuer
        );

        if (isDuplicate) {
            bot.sendMessage(chatId, '⚠️ *Token Already Whitelisted*\n\nThis token is already in your whitelist!', {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [[
                        { text: 'View Whitelist', callback_data: 'whitelist_tokens' }
                    ]]
                }
            });
            user.waitingForWhiteListedTokens = false;
            await user.save();
            return;
        }
        user.whiteListedTokens.push({
            currency: tokenInfo.currency,
            issuer: tokenInfo.issuer,
            balance: '0',
            lastUpdated: new Date()
        });

        user.waitingForWhiteListedTokens = false;
        await user.save();

        bot.sendMessage(chatId, `✅ *Token Added to Whitelist*\n\n**Currency:** ${tokenInfo.currency}\n**Issuer:** \`${tokenInfo.issuer}\`\n\n**Total Whitelisted:** ${user.whiteListedTokens.length} tokens`, {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [
                    [
                        { text: 'Add Another', callback_data: 'add_new_whitelist_token' },
                        { text: 'View Whitelist', callback_data: 'whitelist_tokens' }
                    ],
                    [
                        { text: '🔙 Back to Sniper', callback_data: 'token_sniper' }
                    ]
                ]
            }
        });

    } catch (error) {
        console.error('Error handling whitelist token input:', error);
        bot.sendMessage(chatId, '❌ Error adding token. Please try again.');
        user.waitingForWhiteListedTokens = false;
        await user.save();
    }
}

async function handleRemoveTokenInput(user, input, chatId) {
    try {
        const tokenInfo = parseTokenInput(input);

        if (!tokenInfo) {
            bot.sendMessage(chatId, '❌ *Invalid Token Format*\n\nPlease enter the token in format: `USD rDNjjM4hPJKyLXxwWfKvPa2BtRF3Qqefsb`', {
                parse_mode: 'Markdown'
            });
            return;
        }

        // Find and remove the token
        const tokenIndex = user.whiteListedTokens.findIndex(token =>
            token.currency === tokenInfo.currency && token.issuer === tokenInfo.issuer
        );

        if (tokenIndex === -1) {
            bot.sendMessage(chatId, '⚠️ *Token Not Found*\n\nThis token is not in your whitelist. Check the spelling and try again.', {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [[
                        { text: 'View Whitelist', callback_data: 'whitelist_tokens' }
                    ]]
                }
            });
            user.waitingForTokenRemoval = false;
            await user.save();
            return;
        }

        const removedToken = user.whiteListedTokens[tokenIndex];
        user.whiteListedTokens.splice(tokenIndex, 1);
        user.waitingForTokenRemoval = false;
        await user.save();

        bot.sendMessage(chatId, `✅ *Token Removed*\n\n**Removed:** ${removedToken.currency}\n**Issuer:** \`${removedToken.issuer}\`\n\n**Remaining:** ${user.whiteListedTokens.length} tokens`, {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [
                    [
                        { text: 'View Whitelist', callback_data: 'whitelist_tokens' },
                        { text: '🔙 Back to Sniper', callback_data: 'token_sniper' }
                    ]
                ]
            }
        });

    } catch (error) {
        console.error('Error handling remove token input:', error);
        bot.sendMessage(chatId, '❌ Error removing token. Please try again.');
        user.waitingForTokenRemoval = false;
        await user.save();
    }
}

function parseTokenInput(input) {
    const cleanInput = input.trim();
    
    // Handle "AUTO ISSUER" format (for auto-discovery)
    const autoIssuerMatch = cleanInput.match(/^AUTO\s+([rR][a-zA-Z0-9]{24,34})$/);
    if (autoIssuerMatch) {
        return {
            currency: 'AUTO_DISCOVER',
            issuer: autoIssuerMatch[1],
            autoDiscover: true
        };
    }
    
    const currencyIssuerMatch = cleanInput.match(/^([A-Z0-9]{3,6})\s+([rR][a-zA-Z0-9]{24,34})$/);
    if (currencyIssuerMatch) {
        return {
            currency: currencyIssuerMatch[1],
            issuer: currencyIssuerMatch[2]
        };
    }
    const issuerMatch = cleanInput.match(/^([rR][a-zA-Z0-9]{24,34})$/);
    if (issuerMatch) {
        return {
            currency: 'UNKNOWN',
            issuer: issuerMatch[1]
        };
    }
    const currencyMatch = cleanInput.match(/^([A-Z0-9]{3,6})$/);
    if (currencyMatch) {
        return {
            currency: currencyMatch[1],
            issuer: 'UNKNOWN'
        };
    }
    return null;
}

//////////////////////// TOKEN SNIPER ///////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////////////////
/// toeken sniper part ---------------------------------------------------------------------------------------

// Check if AMM pool account is a first-time creator (has only 1 AMMCreate transaction)
async function isFirstTimeAMMCreator(ammAccountAddress) {
    try {
        const checker = new XRPLAMMChecker();
        await checker.connect();
        
        const result = await checker.getAccountAMMTransactions(ammAccountAddress);
        const ammCreateCount = result.ammCreateTransactions.length;
        
        checker.close();
        
        // Return true if this is the first AMMCreate transaction (count = 1)
        // Return false if account has created multiple AMM pools before
        return ammCreateCount <= 1;
        
    } catch (error) {
        console.error('Error checking AMM creator history:', error.message);
        // If we can't check, be conservative and skip
        return false;
    }
}

async function executeAMMTrade(client, wallet, tokenInfo, xrpAmount, type = 'buy', userSlippage) {
    try {
        if (type !== 'buy') {
            return {
                success: false,
                error: 'executeAMMTrade only supports buy operations. Use executeAMMSell for selling.'
            };
        }
        let hasTrustLine = false;
        let currentTokenBalance = 0;
        try {
            const accountLines = await client.request({
                command: 'account_lines',
                account: wallet.address,
                ledger_index: 'validated'
            });

            const existingLine = accountLines.result.lines.find(line =>
                line.currency === tokenInfo.currency && line.account === tokenInfo.issuer
            );

            if (existingLine) {
                hasTrustLine = true;
                currentTokenBalance = parseFloat(existingLine.balance);
            }
        } catch (error) {
            // Account not activated or no trust lines
        }
        if (!hasTrustLine) {
            const trustSetTx = {
                TransactionType: 'TrustSet',
                Account: wallet.address,
                LimitAmount: {
                    currency: tokenInfo.currency,
                    issuer: tokenInfo.issuer,
                    value: '100000'
                }
            };

            const trustPrepared = await client.autofill(trustSetTx);
            const trustSigned = wallet.sign(trustPrepared);
            const trustResult = await client.submitAndWait(trustSigned.tx_blob);

            if (trustResult.result.meta.TransactionResult !== 'tesSUCCESS') {
                return {
                    success: false,
                    error: `Failed to create trust line: ${trustResult.result.meta.TransactionResult}`
                };
            }
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
        const ammInfo = await client.request({
            command: 'amm_info',
            asset: { currency: 'XRP' },
            asset2: { currency: tokenInfo.currency, issuer: tokenInfo.issuer }
        });
        if (!ammInfo.result || !ammInfo.result.amm) {
            return {
                success: false,
                error: 'AMM pool not found for this token pair'
            };
        }
        const amm = ammInfo.result.amm;
        const xrpAmountDrops = parseFloat(amm.amount);
        const tokenAmount = parseFloat(amm.amount2.value);
        const currentRate = tokenAmount / (xrpAmountDrops / 1000000);
        const estimatedTokens = xrpAmount * currentRate;
        const slippageMultiplier = (100 - userSlippage) / 100;
        const minTokensExpected = estimatedTokens * slippageMultiplier;
        const formattedMinTokens = formatTokenAmountSimple(minTokensExpected);
        console.log(`Estimated tokens: ${estimatedTokens.toFixed(6)}`);
        console.log(`Minimum expected (with ${userSlippage}% slippage): ${minTokensExpected.toFixed(6)}`);
        const paymentTx = {
            TransactionType: 'Payment',
            Account: wallet.address,
            Destination: wallet.address,
            Amount: {
                currency: tokenInfo.currency,
                issuer: tokenInfo.issuer,
                value: formattedMinTokens
            },
            SendMax: xrpToDrops(xrpAmount.toString())
        };

        const prepared = await client.autofill(paymentTx);
        const signed = wallet.sign(prepared);
        const result = await client.submitAndWait(signed.tx_blob);

        if (result.result.meta.TransactionResult === 'tesSUCCESS') {
            await new Promise(resolve => setTimeout(resolve, 2000));
            const finalBalance = await client.request({
                command: 'account_lines',
                account: wallet.address,
                ledger_index: 'validated'
            });
            const tokenLine = finalBalance.result.lines.find(line =>
                line.currency === tokenInfo.currency && line.account === tokenInfo.issuer
            );

            const tokensReceived = tokenLine ? (parseFloat(tokenLine.balance) - currentTokenBalance) : 0;
            const actualRate = tokensReceived > 0 ? (tokensReceived / xrpAmount) : 0;
            const actualSlippage = ((1 - (actualRate / currentRate)) * 100).toFixed(2);
            return {
                success: true,
                txHash: result.result.hash,
                tokensReceived: tokensReceived,
                xrpSpent: xrpAmount,
                actualRate: actualRate.toFixed(8),
                expectedTokens: estimatedTokens.toFixed(6),
                actualSlippage: actualSlippage,
                slippageUsed: userSlippage,
                method: 'AMM'
            };
        } else {
            return {
                success: false,
                error: result.result.meta.TransactionResult
            };
        }
    } catch (error) {
        return {
            success: false,
            error: error.message
        };
    }
}

async function executeAMMSell(client, wallet, purchase, tokensToSell, userSlippage = 3.0) {
    try {
        const formattedTokensToSell = formatTokenAmountForXRPL(tokensToSell);
        let currentTokenBalance = 0;
        const accountLines = await client.request({
            command: 'account_lines',
            account: wallet.address,
            ledger_index: 'validated'
        });
        const existingLine = accountLines.result.lines.find(line =>
            line.currency === purchase.currency && line.account === purchase.issuer
        );
        if (!existingLine) {
            return {
                success: false,
                error: `No trust line found for ${purchase.currency}. Cannot sell tokens you don't have.`
            };
        }

        currentTokenBalance = parseFloat(existingLine.balance);
        const tokensToSellNum = parseFloat(formattedTokensToSell);
        if (currentTokenBalance < tokensToSellNum) {
            return {
                success: false,
                error: `Insufficient token balance. You have ${currentTokenBalance} but trying to sell ${tokensToSellNum}`
            };
        }
        const ammInfo = await client.request({
            command: 'amm_info',
            asset: { currency: 'XRP' },
            asset2: { currency: purchase.currency, issuer: purchase.issuer }
        });

        if (!ammInfo.result || !ammInfo.result.amm) {
            return {
                success: false,
                error: `No AMM pool found for ${purchase.currency}. Cannot sell via AMM.`
            };
        }

        const amm = ammInfo.result.amm;
        const xrpAmountDrops = parseFloat(amm.amount);
        const tokenAmountInPool = parseFloat(amm.amount2.value);
        const currentRate = (xrpAmountDrops / 1000000) / tokenAmountInPool; // XRP per token
        const estimatedXrp = tokensToSellNum * currentRate;
        const slippageMultiplier = (100 - userSlippage) / 100;
        const minXrpExpected = estimatedXrp * slippageMultiplier;
        const minXrpDrops = Math.floor(minXrpExpected * 1000000).toString();
        const paymentTx = {
            TransactionType: 'Payment',
            Account: wallet.address,
            Destination: wallet.address,
            Amount: minXrpDrops, // XRP in drops (whole number)
            SendMax: {
                currency: purchase.currency,
                issuer: purchase.issuer,
                value: formattedTokensToSell // ✅ Properly formatted token amount
            }
        };
        const prepared = await client.autofill(paymentTx);
        const signed = wallet.sign(prepared);
        const result = await client.submitAndWait(signed.tx_blob);

        if (result.result.meta.TransactionResult === 'tesSUCCESS') {
            await new Promise(resolve => setTimeout(resolve, 2000));
            const finalTokenBalance = await client.request({
                command: 'account_lines',
                account: wallet.address,
                ledger_index: 'validated'
            });
            const tokenLine = finalTokenBalance.result.lines.find(line =>
                line.currency === purchase.currency && line.account === purchase.issuer
            );
            const remainingTokenBalance = tokenLine ? parseFloat(tokenLine.balance) : 0;
            const actualTokensSold = currentTokenBalance - remainingTokenBalance;
            let actualXrpReceived = 0;
            const meta = result.result.meta;

            for (const node of meta.AffectedNodes || []) {
                if (node.ModifiedNode &&
                    node.ModifiedNode.LedgerEntryType === 'AccountRoot' &&
                    node.ModifiedNode.FinalFields?.Account === wallet.address) {
                    const prevBalance = parseFloat(node.ModifiedNode.PreviousFields?.Balance || node.ModifiedNode.FinalFields.Balance) / 1000000;
                    const finalBalance = parseFloat(node.ModifiedNode.FinalFields.Balance) / 1000000;
                    const txFee = parseFloat(prepared.Fee) / 1000000;
                    actualXrpReceived = (finalBalance + txFee) - prevBalance;
                    if (actualXrpReceived > 0) break;
                }
            }

            const actualRate = actualXrpReceived / actualTokensSold;
            const actualSlippage = ((1 - (actualRate / currentRate)) * 100).toFixed(2);

            return {
                success: true,
                txHash: result.result.hash,
                tokensSold: actualTokensSold,
                xrpReceived: actualXrpReceived.toFixed(6),
                expectedXrp: estimatedXrp.toFixed(6),
                actualRate: actualRate.toFixed(8),
                marketRate: currentRate.toFixed(8),
                actualSlippage: actualSlippage,
                slippageUsed: userSlippage,
                method: 'AMM'
            };
        } else {
            return {
                success: false,
                error: result.result.meta.TransactionResult
            };
        }
    } catch (error) {
        console.error('❌ AMM Sell Error:', error);
        return {
            success: false,
            error: error.message
        };
    }
}

async function startTokenSniper(user, chatId) {
    try {
        if (user.sniperActive) {
            const modeDisplay = user.selectedSniperBuyMode === true ? 'Auto Buy (with rugcheck)' : 'Whitelist Only';
            const liquidityDisplay = user.selectedMinimumPoolLiquidity || MAINNET_CONFIG.MIN_LIQUIDITY;
            const amountDisplay = parseFloat(user.selectedSnipeAmount === 'custom' ? user.selectedCustomSnipeAmount : user.selectedSnipeAmount) || '1';
            await bot.sendMessage(chatId, `🎯 *Token Sniper Already Started!*

🔄 Mode: ${modeDisplay}
💧 Min Liquidity: ${liquidityDisplay} XRP
💰 Snipe Amount: ${amountDisplay} XRP
📋 Whitelist: ${user.whiteListedTokens?.length || 0} tokens
🎯 Auto-sell: ${user.selectedAutoSellMultiplier}x profit
⚡ Slippage: ${user.selectedSlippage}%
🔥 LP Burn Check: ✅ Enabled

🚀 **LIVE ON XRPL MAINNET**
⚠️ Real XRP will be used for trades`, {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [[
                        { text: '⏹️ Stop Sniper', callback_data: 'stop_token_sniper' }
                    ]]
                }
            });
            return;
        }

        if (user.selectedSniperBuyMode === undefined || user.selectedSniperBuyMode === null) {
            bot.sendMessage(chatId, '⚠️ *No Sniper Mode Selected*\n\nPlease configure sniper settings first.', {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [[
                        { text: '🔙 Back', callback_data: 'token_sniper' }
                    ]]
                }
            });
            return;
        }

        if (user.selectedSniperBuyMode === false && (!user.whiteListedTokens || user.whiteListedTokens.length === 0)) {
            bot.sendMessage(chatId, '⚠️ *No Whitelisted Tokens*\n\nPlease add tokens to your whitelist for whitelist-only mode.', {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [[
                        { text: 'Add Tokens', callback_data: 'whitelist_tokens' },
                        { text: '🔙 Back', callback_data: 'token_sniper' }
                    ]]
                }
            });
            return;
        }

        if (!user.sniperPurchases) {
            user.sniperPurchases = [];
        }

        const snipeAmount = parseFloat(user.selectedSnipeAmount ==='custom' ? user.selectedCustomSnipeAmount : user.selectedSnipeAmount) || 1;
        if (snipeAmount > MAINNET_CONFIG.MAX_SNIPE_AMOUNT) {
            bot.sendMessage(chatId, `⚠️ *Snipe Amount Too High*\n\nMaximum allowed: ${MAINNET_CONFIG.MAX_SNIPE_AMOUNT} XRP\nYour setting: ${snipeAmount} XRP\n\nPlease reduce your snipe amount for safety.`, {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [[
                        { text: 'Adjust Settings', callback_data: 'token_sniper' }
                    ]]
                }
            });
            return;
        }

        user.sniperActive = true;
        user.sniperStartTime = new Date();
        await user.save();
        const interval = setInterval(async () => {
            await monitorTokenMarkets(user, chatId);
        }, SNIPER_CHECK_INTERVAL);
        sniperIntervals.set(user.telegramId, interval);
        const modeDisplay = user.selectedSniperBuyMode === true ? 'Auto Buy (with rugcheck)' : 'Whitelist Only';
        const liquidityDisplay = user.selectedMinimumPoolLiquidity || MAINNET_CONFIG.MIN_LIQUIDITY;
        const amountDisplay = user.selectedSnipeAmount || '1';
        bot.sendMessage(chatId, `🎯 *Token Sniper Started!*

🔄 Mode: ${modeDisplay}
💧 Min Liquidity: ${liquidityDisplay} XRP
💰 Snipe Amount: ${amountDisplay} XRP
📋 Whitelist: ${user.whiteListedTokens?.length || 0} tokens
🎯 Auto-sell: ${user.selectedAutoSellMultiplier}x profit
🔥 LP Burn Check: ✅ Enabled`, {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [[
                    { text: '⏹️ Stop Sniper', callback_data: 'stop_token_sniper' }
                ]]
            }
        });

    } catch (error) {
        console.error('Error starting token sniper:', error);
        bot.sendMessage(chatId, '❌ Failed to start token sniper. Please try again.');
    }
}

// Stop Token Sniper Function
async function stopTokenSniper(user, chatId) {
    try {
        if (!user.sniperActive) {
            bot.sendMessage(chatId, '⚠️ Token sniper is not currently active.');
            return;
        }
        const interval = sniperIntervals.get(user.telegramId);
        if (interval) {
            clearInterval(interval);
            sniperIntervals.delete(user.telegramId);
        }
        user.sniperActive = false;
        user.sniperStopTime = new Date();
        await user.save();
        const runtime = user.sniperStopTime - user.sniperStartTime;
        const runtimeMinutes = Math.floor(runtime / (1000 * 60));
        const activePurchases = (user.sniperPurchases || []).filter(p => p.status === 'active');
        const soldPurchases = (user.sniperPurchases || []).filter(p => p.status === 'sold');
        const totalProfit = soldPurchases.reduce((sum, p) => sum + (parseFloat(p.profit) || 0), 0);

        bot.sendMessage(chatId, `⏹️ *Token Sniper Stopped*

⏱️ **Runtime:** ${runtimeMinutes} minutes
🎯 **Active Positions:** ${activePurchases.length}
💰 **Completed Trades:** ${soldPurchases.length}
📈 **Total Profit:** ${totalProfit.toFixed(4)} XRP

${activePurchases.length > 0 ? '⚠️ You still have active positions that will NOT be auto-sold.' : '✅ All positions have been closed.'}

Thank you for using Token Sniper!`, {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [[
                    { text: '🔙 Main Menu', callback_data: 'main_menu' }
                ]]
            }
        });

    } catch (error) {
        console.error('Error stopping token sniper:', error);
        bot.sendMessage(chatId, '❌ Failed to stop token sniper. Please try again.');
    }
}

// Enhanced Token Market Monitoring with Extensive Logging
async function monitorTokenMarkets(user, chatId) {
    try {
        if (!user.sniperActive) return;

        const client = await getXrplClient();
        const newTokens = await detectNewTokensFromAMM(client);

        for (let i = 0; i < Math.min(newTokens.length, MAX_TOKENS_PER_SCAN); i++) {
            const tokenInfo = newTokens[i];
            await evaluateAndSnipeToken(client, user, tokenInfo, chatId);
        }

    } catch (error) {
        console.error('❌ Monitor error:', error.message);
    }
}

async function detectNewTokensFromAMM(client) {
    try {
        const response = await client.request({
            command: 'ledger',
            ledger_index: 'validated',
            transactions: true,
            expand: true
        });

        const newTokens = [];
        const allTransactions = [];
        for (let i = 0; i <= 3; i++) {
            try {
                const ledgerResponse = i === 0 ? response : await client.request({
                    command: 'ledger',
                    ledger_index: response.result.ledger.ledger_index - i,
                    transactions: true,
                    expand: true
                });
                
                const txWrappers = ledgerResponse.result.ledger.transactions || [];
                const txs = txWrappers
                    .filter(wrapper => wrapper.tx_json && wrapper.meta)
                    .map(wrapper => ({
                        ...wrapper.tx_json,
                        meta: wrapper.meta
                    }));

                allTransactions.push(...txs);
            } catch (error) {
                continue;
            }
        }

        for (const tx of allTransactions) {
            if (tx.TransactionType === 'AMMCreate' && tx.meta?.TransactionResult === 'tesSUCCESS') {
                const tokenInfo = extractTokenFromAMMCreate(tx);
                if (tokenInfo) {
                    newTokens.push(tokenInfo);
                }
            }
        }

        return newTokens;

    } catch (error) {
        console.error('Error detecting AMM tokens:', error);
        return [];
    }
}

function extractTokenFromAMMCreate(tx) {
    try {
        const { Amount, Amount2 } = tx;
        let xrpAmount, tokenInfo;
        if (typeof Amount === 'string') {
            xrpAmount = parseInt(Amount) / 1000000; // Convert drops to XRP
            tokenInfo = Amount2;
        } else {
            xrpAmount = parseInt(Amount2) / 1000000;
            tokenInfo = Amount;
        }

        if (!tokenInfo || typeof tokenInfo === 'string') {
            return null;
        }


        return {
            currency: tokenInfo.currency,
            issuer: tokenInfo.issuer,
            readableCurrency: hexToString(tokenInfo.currency),
            initialLiquidity: xrpAmount,
            tokenAmount: tokenInfo.value,
            transactionHash: tx.hash || '',
            account: tx.Account
        };

    } catch (error) {
        return null;
    }
}

function hexToString(hex) {
    if (!hex || hex === 'XRP') return hex;
    if (hex.length !== 40) return hex;
    
    try {
        let str = '';
        for (let i = 0; i < hex.length; i += 2) {
            const byte = parseInt(hex.substr(i, 2), 16);
            if (byte === 0) break;
            str += String.fromCharCode(byte);
        }
        return str || hex;
    } catch {
        return hex;
    }
}

// 🔥 NEW: LP Burn Check Function
async function checkLPBurnStatus(client, tokenInfo) {
    try {
        // Get AMM info to find the AMM account
        const ammInfo = await client.request({
            command: 'amm_info',
            asset: { currency: 'XRP' },
            asset2: { currency: tokenInfo.currency, issuer: tokenInfo.issuer }
        });

        if (!ammInfo.result || !ammInfo.result.amm) {
            return {
                lpBurned: false,
                lpBalance: 'Unknown',
                error: 'AMM pool not found'
            };
        }

        const ammAccount = ammInfo.result.amm.amm_account;
        
        // Get AMM account lines to check LP token balance
        const accountLines = await client.request({
            command: 'account_lines',
            account: ammAccount,
            ledger_index: 'validated'
        });

        if (!accountLines.result || !accountLines.result.lines) {
            return {
                lpBurned: true, // If no lines, LP is considered burned
                lpBalance: '0',
                ammAccount: ammAccount
            };
        }

        // Find LP token balance (LP tokens are issued by the AMM account itself)
        const lpTokenLine = accountLines.result.lines.find(line => 
            line.account === ammAccount && 
            line.currency && 
            line.currency.length === 40 // LP tokens are hex-encoded
        );

        if (!lpTokenLine) {
            return {
                lpBurned: true, // No LP tokens found, considered burned
                lpBalance: '0',
                ammAccount: ammAccount
            };
        }

        const lpBalance = parseFloat(lpTokenLine.balance);
        
        // Consider LP burned if balance is very low (less than 1 LP token)
        // This accounts for potential dust amounts that might remain
        const lpBurned = lpBalance < 1;
        
        return {
            lpBurned: lpBurned,
            lpBalance: lpBalance.toString(),
            ammAccount: ammAccount,
            lpTokenCurrency: lpTokenLine.currency
        };

    } catch (error) {
        console.error('Error checking LP burn status:', error);
        return {
            lpBurned: false,
            lpBalance: 'Error',
            error: error.message
        };
    }
}

// 🔥 NEW: Sniper Activity Logger
function logSniperActivity(action, tokenInfo, details = {}) {
    const timestamp = new Date().toISOString();
    const logEntry = {
        timestamp,
        action,
        token: tokenInfo?.readableCurrency || 'Unknown',
        issuer: tokenInfo?.issuer || 'Unknown',
        currency: tokenInfo?.currency || 'Unknown',
        ...details
    };
    
    console.log(`🎯 [SNIPER] ${action}: ${logEntry.token} (${logEntry.issuer}) - ${JSON.stringify(details)}`);
    return logEntry;
}

// Enhanced Token Evaluation and Sniping with Extensive Logging
async function evaluateAndSnipeToken(client, user, tokenInfo, chatId) {
    try {
        const alreadyOwned = user.sniperPurchases.some(p =>
            p.currency === tokenInfo.currency && p.issuer === tokenInfo.issuer && p.status === 'active'
        );

        if (alreadyOwned) {
            logSniperActivity('ALREADY_OWNED', tokenInfo, { reason: 'Token already in active purchases' });
            return; 
        }

        if (user.selectedSniperBuyMode === false) {
            const isWhitelisted = user.whiteListedTokens.some(token =>
                token.currency === tokenInfo.currency && token.issuer === tokenInfo.issuer
            );

            if (!isWhitelisted) {
                logSniperActivity('WHITELIST_CHECK_FAILED', tokenInfo, { reason: 'Token not in whitelist' });
                // Send UI notification for whitelist check failure
                try {
                    bot.sendMessage(chatId, `❌ **Whitelist Check Failed**\n\n**Token:** ${tokenInfo.readableCurrency}\n**Reason:** Token not in whitelist\n\n*Token skipped*`, { parse_mode: 'Markdown' });
                } catch (error) {
                    console.error('Error sending whitelist failed message:', error.message);
                }
                return; 
            }
            logSniperActivity('WHITELIST_CHECK_PASSED', tokenInfo);
        }

        if (user.selectedSniperBuyMode === true) {
            // 🔧 FIXED: Enhanced rugcheck logic to handle null initial liquidity
            let rugCheckResult = false;
            let rugCheckReason = '';
            let userMessage = '';
            
            if (tokenInfo.initialLiquidity === null) {
                // Accept tokens with null initial liquidity (common for some valid tokens)
                rugCheckResult = true;
                rugCheckReason = 'null_initial_liquidity_accepted';
                userMessage = `✅ **Rugcheck Passed**\n\n**Token:** ${tokenInfo.readableCurrency}\n**Reason:** Null initial liquidity accepted\n\n*Proceeding to next checks...*`;
            } else if (tokenInfo.initialLiquidity >= user.selectedMinimumPoolLiquidity) {
                // Accept tokens with sufficient initial liquidity
                rugCheckResult = true;
                rugCheckReason = 'sufficient_liquidity';
                userMessage = `✅ **Rugcheck Passed**\n\n**Token:** ${tokenInfo.readableCurrency}\n**Liquidity:** ${tokenInfo.initialLiquidity} XRP\n**Required:** ${user.selectedMinimumPoolLiquidity} XRP\n\n*Proceeding to next checks...*`;
            } else {
                // Reject tokens with insufficient liquidity
                rugCheckResult = false;
                rugCheckReason = 'insufficient_liquidity';
                userMessage = `❌ **Rugcheck Failed**\n\n**Token:** ${tokenInfo.readableCurrency}\n**Liquidity:** ${tokenInfo.initialLiquidity} XRP\n**Required:** ${user.selectedMinimumPoolLiquidity} XRP\n**Reason:** Insufficient liquidity\n\n*Token skipped*`;
            }
            
            if (!rugCheckResult) {
                logSniperActivity('RUGCHECK_FAILED', tokenInfo, {
                    initialLiquidity: tokenInfo.initialLiquidity,
                    minimumRequired: user.selectedMinimumPoolLiquidity,
                    reason: rugCheckReason
                });
                // Send UI notification for failed rugcheck
                try {
                    bot.sendMessage(chatId, userMessage, { parse_mode: 'Markdown' });
                } catch (error) {
                    console.error('Error sending rugcheck failed message:', error.message);
                }
                return;
            }
            logSniperActivity('RUGCHECK_PASSED', tokenInfo, {
                initialLiquidity: tokenInfo.initialLiquidity,
                minimumRequired: user.selectedMinimumPoolLiquidity,
                reason: rugCheckReason
            });
            // Send UI notification for passed rugcheck
            try {
                bot.sendMessage(chatId, userMessage, { parse_mode: 'Markdown' });
            } catch (error) {
                console.error('Error sending rugcheck passed message:', error.message);
            }
        }

        const isFirstTimeCreator = await isFirstTimeAMMCreator(tokenInfo.account);
        if (!isFirstTimeCreator) {
            logSniperActivity('FIRST_TIME_CREATOR_CHECK_FAILED', tokenInfo, {
                reason: 'Not a first-time AMM creator'
            });
            // Send UI notification for first-time creator check failure
            try {
                bot.sendMessage(chatId, `❌ **First-Time Creator Check Failed**\n\n**Token:** ${tokenInfo.readableCurrency}\n**Reason:** Not a first-time AMM creator\n\n*Token skipped*`, { parse_mode: 'Markdown' });
            } catch (error) {
                console.error('Error sending first-time creator failed message:', error.message);
            }
            return;
        }
        logSniperActivity('FIRST_TIME_CREATOR_CHECK_PASSED', tokenInfo);

        // 🔥 NEW: LP Burn Check
        const lpBurnCheck = await checkLPBurnStatus(client, tokenInfo);
        if (!lpBurnCheck.lpBurned) {
            logSniperActivity('LP_BURN_CHECK_FAILED', tokenInfo, {
                lpBalance: lpBurnCheck.lpBalance,
                ammAccount: lpBurnCheck.ammAccount,
                reason: 'LP tokens not burned yet'
            });
            // Send UI notification for LP burn check failure
            try {
                bot.sendMessage(chatId, `❌ **LP Burn Check Failed**\n\n**Token:** ${tokenInfo.readableCurrency}\n**LP Balance:** ${lpBurnCheck.lpBalance}\n**Reason:** LP tokens not burned yet\n\n*Token skipped*`, { parse_mode: 'Markdown' });
            } catch (error) {
                console.error('Error sending LP burn failed message:', error.message);
            }
            return;
        }
        logSniperActivity('LP_BURN_CHECK_PASSED', tokenInfo, {
            lpBalance: lpBurnCheck.lpBalance,
            ammAccount: lpBurnCheck.ammAccount
        });

        logSniperActivity('STARTING_SNIPE', tokenInfo);
        // Send UI notification that all checks passed and snipe is starting
        try {
            bot.sendMessage(chatId, `🚀 **All Checks Passed!**\n\n**Token:** ${tokenInfo.readableCurrency}\n**Status:** Starting snipe...\n\n*Executing trade...*`, { parse_mode: 'Markdown' });
        } catch (error) {
            console.error('Error sending snipe start message:', error.message);
        }
        await executeEnhancedSnipe(client, user, tokenInfo, chatId);

    } catch (error) {
        console.error(`❌ Error evaluating ${tokenInfo?.readableCurrency}:`, error.message);
    }
}

function formatTokenAmountForXRPL(amount, maxDecimals = 6) {
    if (typeof amount === 'string') {
        amount = parseFloat(amount);
    }
    if (isNaN(amount) || amount <= 0) {
        throw new Error('Invalid token amount');
    }

    const formatted = amount.toFixed(maxDecimals);
    return formatted.replace(/\.?0+$/, '');
}

// Enhanced Snipe Execution with Extensive Logging
async function executeEnhancedSnipe(client, user, tokenInfo, chatId) {
    try {
        logSniperActivity('EXECUTING_SNIPE', tokenInfo, { snipeAmount: user.selectedSnipeAmount });
        const wallet = xrpl.Wallet.fromSeed(user.seed);
        
        // 🔧 FIXED: Proper custom snipe amount validation
        let snipeAmount;
        if (user.selectedSnipeAmount === "custom") {
            // Validate custom amount
            if (!user.selectedCustomSnipeAmount || isNaN(parseFloat(user.selectedCustomSnipeAmount))) {
                logSniperActivity('CUSTOM_AMOUNT_INVALID', tokenInfo, { 
                    customAmount: user.selectedCustomSnipeAmount,
                    reason: 'Invalid or missing custom snipe amount'
                });
                bot.sendMessage(chatId, `❌ *Custom Snipe Amount Error*\n\n**Issue:** Invalid or missing custom amount\n**Value:** ${user.selectedCustomSnipeAmount || 'Not set'}\n\nPlease set a valid custom snipe amount in the sniper settings.`, {
                    parse_mode: 'Markdown'
                });
                return;
            }
            snipeAmount = parseFloat(user.selectedCustomSnipeAmount);
        } else {
            snipeAmount = parseFloat(user.selectedSnipeAmount) || 1;
        }
        
        // Additional validation for snipe amount
        if (isNaN(snipeAmount) || snipeAmount <= 0) {
            logSniperActivity('SNIPE_AMOUNT_INVALID', tokenInfo, { 
                snipeAmount: snipeAmount,
                reason: 'Invalid snipe amount (NaN or <= 0)'
            });
            bot.sendMessage(chatId, `❌ *Invalid Snipe Amount*\n\n**Amount:** ${snipeAmount}\n**Issue:** Amount must be a positive number\n\nPlease check your sniper settings.`, {
                parse_mode: 'Markdown'
            });
            return;
        }

        if (snipeAmount > MAINNET_CONFIG.MAX_SNIPE_AMOUNT) {
            bot.sendMessage(chatId, `⚠️ *Safety Limit Exceeded*\n\n**Requested:** ${snipeAmount} XRP\n**Maximum:** ${MAINNET_CONFIG.MAX_SNIPE_AMOUNT} XRP\n\nPlease reduce your snipe amount.`, {
                parse_mode: 'Markdown'
            });
            return;
        }
        const accountInfo = await client.request({
            command: 'account_info',
            account: wallet.address
        });
        const xrpBalance = parseFloat(accountInfo.result.account_data.Balance) / 1000000;
        const totalRequired = snipeAmount + 0.5;

        if (xrpBalance < totalRequired) {
            bot.sendMessage(chatId, `⚠️ *Insufficient Balance*\n\n**Required:** ${totalRequired} XRP\n**Available:** ${xrpBalance.toFixed(6)} XRP\n**Shortage:** ${(totalRequired - xrpBalance).toFixed(6)} XRP\n\nPlease add more XRP to your wallet.`, {
                parse_mode: 'Markdown'
            });
            return;
        }

        await ensureTrustLine(client, wallet, tokenInfo);
        ammBuyResult = await executeAMMTrade(client, wallet, tokenInfo, snipeAmount, 'buy', user.selectedSlippage);
        if (ammBuyResult.success) {
            logSniperActivity('SNIPE_SUCCESS', tokenInfo, {
                xrpSpent: ammBuyResult.xrpSpent,
                tokensReceived: ammBuyResult.tokensReceived,
                txHash: ammBuyResult.txHash
            });
            
            const purchase = {
                currency: tokenInfo.currency,
                issuer: tokenInfo.issuer,
                readableCurrency: tokenInfo.readableCurrency,
                purchasePrice: parseFloat(ammBuyResult.actualRate),
                tokensReceived: ammBuyResult.tokensReceived,
                xrpSpent: parseFloat(ammBuyResult.xrpSpent),
                txHash: ammBuyResult.txHash,
                timestamp: new Date(),
                status: 'active',
                snipeAmount: snipeAmount,
                executionMethod: ammBuyResult.method || tradingMethod
            };

            user.sniperPurchases.push(purchase);
            await user.save();

            // Get LP burn status for the success message
            const lpBurnStatus = await checkLPBurnStatus(client, tokenInfo);
            
            bot.sendMessage(chatId, `🎉 *SNIPE SUCCESSFUL!*

🪙 **Token:** ${tokenInfo.readableCurrency}
💰 **Spent:** ${ammBuyResult.xrpSpent} XRP
🪙 **Received:** ${ammBuyResult.tokensReceived}
📈 **Rate:** ${ammBuyResult.actualRate} XRP per token
🔄 **Method:** ${ammBuyResult.method || tradingMethod}
🎯 **Target:** ${user.selectedAutoSellMultiplier}x profit
🔥 **LP Status:** ${lpBurnStatus.lpBurned ? 'Burned' : 'Not Burned'} (${lpBurnStatus.lpBalance} remaining)
🔗 **TX:** \`${ammBuyResult.txHash}\``, {
                parse_mode: 'Markdown'
            });
            console.log(`✅ Snipe successful: ${tokenInfo.readableCurrency} via ${ammBuyResult.method || tradingMethod}`);
        } else {
            logSniperActivity('SNIPE_FAILED', tokenInfo, { error: ammBuyResult.error });
            console.error(`❌ Snipe failed: ${ammBuyResult.error}`);
            bot.sendMessage(chatId, `❌ *Snipe Failed*\n\n**Token:** ${tokenInfo.readableCurrency}\n**Error:** ${ammBuyResult.error}`, {
                parse_mode: 'Markdown'
            });
        }

    } catch (error) {
        logSniperActivity('SNIPE_ERROR', tokenInfo, { error: error.message });
        console.error(`❌ Snipe error for ${tokenInfo?.readableCurrency}:`, error.message);
        bot.sendMessage(chatId, `❌ *Snipe Error*\n\n**Token:** ${tokenInfo?.readableCurrency || 'Unknown'}\n**Error:** ${error.message}`, {
            parse_mode: 'Markdown'
        });
    }
}

// Ensure Trust Line Exists
async function ensureTrustLine(client, wallet, tokenInfo) {
    try {
        const accountLines = await client.request({
            command: 'account_lines',
            account: wallet.address
        });

        const existingTrustLine = accountLines.result.lines.find(line =>
            line.currency === tokenInfo.currency && line.account === tokenInfo.issuer
        );

        if (existingTrustLine) {
            return;
        }
        // Create trust line
        const transaction = {
            TransactionType: 'TrustSet',
            Account: wallet.address,
            LimitAmount: {
                currency: tokenInfo.currency,
                issuer: tokenInfo.issuer,
                value: '1000000000' // High limit
            }
        };

        const prepared = await client.autofill(transaction);
        const signed = wallet.sign(prepared);
        const result = await client.submitAndWait(signed.tx_blob);

        if (result.result.meta.TransactionResult !== 'tesSUCCESS') {
            throw new Error(`Trust line creation failed: ${result.result.meta.TransactionResult}`);
        }
    } catch (error) {
        console.error('Error ensuring trust line:', error);
        throw error;
    }
}
// ===== AUTO-SELL LOGIC =====

async function checkAutoSellConditions(user, chatId) {
    try {
        if (!user.sniperPurchases || user.sniperPurchases.length === 0) return;

        const activePurchases = user.sniperPurchases.filter(p => p.status === 'active');

        for (const purchase of activePurchases) {
            await evaluateAutoSell(user, purchase, chatId);
        }

    } catch (error) {
        console.error('Error checking auto-sell conditions:', error);
    }
}

async function evaluateAutoSell(user, purchase, chatId) {
    try {
        const client = await getXrplClient();
        const currentPrice = await getCurrentTokenPrice(client, purchase);
        if (!currentPrice) {
            return;
        }

        const priceMultiplier = currentPrice / purchase.purchasePrice;
        if (priceMultiplier >= parseFloat(user.selectedAutoSellMultiplier)) {
            await executeAutoSell(client, user, purchase, currentPrice, chatId);
        }

    } catch (error) {
        console.error('Error evaluating auto-sell:', error);
    }
}

// In getCurrentTokenPrice, add validation:
async function getCurrentTokenPrice(client, purchase) {
    try {
        const orderBook = await client.request({
            command: 'book_offers',
            taker_gets: { currency: 'XRP' },
            taker_pays: {
                currency: purchase.currency,
                issuer: purchase.issuer
            },
            limit: 1
        });

        const offers = orderBook.result.offers || [];
        if (offers.length === 0) return null;

        const bestOffer = offers[0];
        if (typeof bestOffer.TakerGets === 'string' && typeof bestOffer.TakerPays === 'object') {
            const xrpAmount = parseFloat(bestOffer.TakerGets) / 1000000;
            const tokenAmount = parseFloat(bestOffer.TakerPays.value);

            // Add validation
            if (tokenAmount <= 0 || xrpAmount <= 0) return null;

            const price = xrpAmount / tokenAmount;
            return formatTokenAmountForXRPL(price, 8); // Format the price
        }

        return null;

    } catch (error) {
        console.error('Error getting current price:', error);
        return null;
    }
}

async function executeAutoSell(client, user, purchase, currentPrice, chatId) {
    try {
       
        const wallet = xrpl.Wallet.fromSeed(user.seed);
        const tokensToSell = parseFloat(purchase.tokensReceived);

        if (!isValidNumber(tokensToSell) || tokensToSell <= 0) {
            throw new Error(`Invalid tokens to sell: ${tokensToSell}. Purchase data may be corrupted.`);
        }
        const result = await executeAMMSell(client, wallet, purchase, tokensToSell);

        if (result.success) {
            const xrpReceived = safeParseFloat(result.xrpReceived, 0);
            const xrpSpent = safeParseFloat(purchase.xrpSpent, 0);
            const purchasePrice = safeParseFloat(purchase.purchasePrice, 0);
            const profit = calculateSafeProfit(xrpReceived, xrpSpent);
            const profitPercentage = calculateSafeProfitPercentage(currentPrice, purchasePrice);
            const multiplier = calculateSafeMultiplier(currentPrice, purchasePrice);

            if (!isValidNumber(profit)) {
                console.error('❌ Profit calculation resulted in invalid number:', profit);
                throw new Error('Profit calculation failed - invalid result');
            }

            if (!isValidNumber(profitPercentage)) {
                console.error('❌ Profit percentage calculation resulted in invalid number:', profitPercentage);
                throw new Error('Profit percentage calculation failed - invalid result');
            }

            purchase.status = 'sold';
            purchase.sellPrice = safeParseFloat(currentPrice, 0);
            purchase.sellTxHash = result.txHash || '';
            purchase.sellTimestamp = new Date();
            purchase.xrpReceived = xrpReceived;
            purchase.profit = profit;
            purchase.profitPercentage = profitPercentage;

            validateDatabaseField('profit', purchase.profit);
            validateDatabaseField('profitPercentage', purchase.profitPercentage);
            validateDatabaseField('xrpReceived', purchase.xrpReceived);
            validateDatabaseField('sellPrice', purchase.sellPrice);

            await user.save();

            // ✅ SUCCESS NOTIFICATION WITH SAFE VALUES
            const successMessage = `💰 *AUTO-SELL EXECUTED!*

🪙 **Token:** ${getReadableCurrency(purchase.currency)}
📈 **Entry:** ${purchasePrice.toFixed(8)} XRP per token
📈 **Exit:** ${safeParseFloat(currentPrice, 0).toFixed(8)} XRP per token
🎯 **Multiplier:** ${multiplier.toFixed(2)}x
💰 **Invested:** ${xrpSpent.toFixed(6)} XRP
💰 **Received:** ${xrpReceived.toFixed(6)} XRP
💰 **Profit:** ${profit.toFixed(4)} XRP (${profitPercentage.toFixed(2)}%)
🔄 **Method:** ${result.method || 'AMM'}
🔗 **Sell TX:** \`${result.txHash || 'N/A'}\`

🎉 Successful auto-sell completed!`;

            bot.sendMessage(chatId, successMessage, {
                parse_mode: 'Markdown'
            });
        } else {
            bot.sendMessage(chatId, `❌ *Auto-Sell Failed*\n\n**Token:** ${getReadableCurrency(purchase.currency)}\n**Error:** ${result.error}`, {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '🔙 Back to Sniper', callback_data: 'token_sniper' }],
                        [{ text: '⏹️ Stop token sniper', callback_data: 'stop_token_sniper' }]
                    ]
                }
            });
        }

    } catch (error) {
        console.error(`❌ Auto-sell error for ${getReadableCurrency(purchase.currency)}:`, error.message);
        console.error('❌ Error stack:', error.stack);

        bot.sendMessage(chatId, `❌ *Auto-Sell Error*\n\n**Token:** ${getReadableCurrency(purchase.currency)}\n**Error:** ${error.message}`, {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [
                    [{ text: '🔙 Back to Sniper', callback_data: 'token_sniper' }],
                    [{ text: '⏹️ Stop token sniper', callback_data: 'stop_token_sniper' }]
                ]
            }
        });
    }
}

function isValidNumber(value) {
    return typeof value === 'number' &&
        !isNaN(value) &&
        isFinite(value) &&
        value !== null &&
        value !== undefined;
}

function safeParseFloat(value, defaultValue = 0) {
    try {
        if (value === null || value === undefined || value === '') {
            return defaultValue;
        }

        const parsed = parseFloat(value);
        return isValidNumber(parsed) ? parsed : defaultValue;
    } catch (error) {
        console.error('safeParseFloat error:', error, 'value:', value);
        return defaultValue;
    }
}

function calculateSafeProfit(xrpReceived, xrpSpent) {
    try {
        if (!isValidNumber(xrpReceived) || !isValidNumber(xrpSpent)) {
            console.error('❌ Invalid values for profit calculation:', { xrpReceived, xrpSpent });
            return 0;
        }

        const profit = xrpReceived - xrpSpent;

        if (!isValidNumber(profit)) {
            console.error('❌ Profit calculation resulted in invalid number:', profit);
            return 0;
        }

        return Number(profit.toFixed(6));
    } catch (error) {
        console.error('❌ Profit calculation error:', error);
        return 0;
    }
}

function calculateSafeProfitPercentage(currentPrice, purchasePrice) {
    try {
        const currentPriceNum = safeParseFloat(currentPrice, 0);
        const purchasePriceNum = safeParseFloat(purchasePrice, 0);

        if (purchasePriceNum === 0) {
            console.error('❌ Cannot calculate profit percentage: purchase price is 0');
            return 0;
        }

        const percentage = ((currentPriceNum / purchasePriceNum - 1) * 100);

        if (!isValidNumber(percentage)) {
            console.error('❌ Profit percentage calculation resulted in invalid number:', percentage);
            return 0;
        }

        return Number(percentage.toFixed(2));
    } catch (error) {
        console.error('❌ Profit percentage calculation error:', error);
        return 0;
    }
}

function calculateSafeMultiplier(currentPrice, purchasePrice) {
    try {
        const currentPriceNum = safeParseFloat(currentPrice, 0);
        const purchasePriceNum = safeParseFloat(purchasePrice, 0);

        if (purchasePriceNum === 0) {
            console.error('❌ Cannot calculate multiplier: purchase price is 0');
            return 1;
        }

        const multiplier = currentPriceNum / purchasePriceNum;

        if (!isValidNumber(multiplier)) {
            console.error('❌ Multiplier calculation resulted in invalid number:', multiplier);
            return 1;
        }

        return Number(multiplier.toFixed(3));
    } catch (error) {
        console.error('❌ Multiplier calculation error:', error);
        return 1;
    }
}

function validateDatabaseField(fieldName, value) {
    if (!isValidNumber(value)) {
        console.error(`❌ Database validation failed for ${fieldName}:`, value, typeof value);
        throw new Error(`Invalid ${fieldName} value for database: ${value}`);
    }
}

async function sendTradingFeeForBuy(user, adminWalletAddress, minimumFeeAmount = 0.1) {
    try {
        if (!adminWalletAddress) {
            return { success: true, skipped: true };
        }

        let feeAmount = 0;
        let transactionType = 'unknown';

        if (user.selectedBuyAmount) {
            const feePercentage = 0.5; 
            feeAmount = (parseFloat(user.selectedBuyAmount) * feePercentage) / 100;
            transactionType = 'buy';
        } else {
            return {
                success: false,
                error: "Cannot determine transaction type for fee calculation"
            };
        }

        if (feeAmount < minimumFeeAmount) {
            feeAmount = minimumFeeAmount;
        }

        const client = await getXrplClient();
        const accountInfo = await client.request({
            command: 'account_info',
            account: user.walletAddress,
            ledger_index: 'validated'
        });

        const balance = parseFloat(accountInfo.result.account_data.Balance) / 1000000;
        const ownerCount = accountInfo.result.account_data.OwnerCount;
        const reserveRequired = (ownerCount * 0.2);
        const availableBalance = balance - reserveRequired;

        if (availableBalance < feeAmount) {
            return {
                success: false,
                error: `Insufficient balance for trading fee. Need ${feeAmount} XRP, have ${availableBalance.toFixed(6)} XRP available.`
            };
        }

        const wallet = xrpl.Wallet.fromSeed(user.seed);
        const feePayment = {
            TransactionType: 'Payment',
            Account: user.walletAddress,
            Destination: adminWalletAddress,
            Amount: xrpl.xrpToDrops(feeAmount.toString()),
            Memos: [
                {
                    Memo: {
                        MemoType: Buffer.from('trading-fee', 'utf8').toString('hex').toUpperCase(),
                        MemoData: Buffer.from(`${transactionType}-${user.telegramId}-${Date.now()}`, 'utf8').toString('hex').toUpperCase()
                    }
                }
            ]
        };

        const prepared = await client.autofill(feePayment);
        const signed = wallet.sign(prepared);
        const result = await client.submitAndWait(signed.tx_blob);

        if (result.result.meta.TransactionResult === 'tesSUCCESS') {
            user.totalFeesGenerated = (user.totalFeesGenerated || 0) + feeAmount;
            user.lastFeeDate = new Date();
            await user.save();

            return {
                success: true,
                feeAmount: feeAmount,
                transactionType: transactionType,
                hash: result.result.hash
            };
        } else {
            return {
                success: false,
                error: `Fee payment failed: ${result.result.meta.TransactionResult}`
            };
        }

    } catch (error) {
        console.error('Error sending trading fee:', error);
        return {
            success: false,
            error: error.message
        };
    }
}

async function sendTradingFeeForSell(user, adminWalletAddress, minimumFeeAmount = 0.1) {
    try {
        if (!adminWalletAddress) {
            return { success: true, skipped: true };
        }

        let feeAmount = 0;
        let transactionType = 'unknown';

        if (user.selectedSellAmount) {
            feeAmount = 0.5;
            transactionType = 'sell';
        } else {
            return {
                success: false,
                error: "Cannot determine transaction type for fee calculation"
            };
        }

        if (feeAmount < minimumFeeAmount) {
            feeAmount = minimumFeeAmount;
        }

        const client = await getXrplClient();

        const accountInfo = await client.request({
            command: 'account_info',
            account: user.walletAddress,
            ledger_index: 'validated'
        });

        const balance = parseFloat(accountInfo.result.account_data.Balance) / 1000000;
        const ownerCount = accountInfo.result.account_data.OwnerCount;
        const reserveRequired = (ownerCount * 0.2);
        const availableBalance = balance - reserveRequired;

        // if (availableBalance < feeAmount) {
        //     return {
        //         success: false,
        //         error: `Insufficient balance for trading fee. Need ${feeAmount} XRP, have ${availableBalance.toFixed(6)} XRP available.`
        //     };
        // }
        const wallet = xrpl.Wallet.fromSeed(user.seed);
        const feePayment = {
            TransactionType: 'Payment',
            Account: user.walletAddress,
            Destination: adminWalletAddress,
            Amount: xrpl.xrpToDrops(feeAmount.toString()),
            Memos: [
                {
                    Memo: {
                        MemoType: Buffer.from('trading-fee', 'utf8').toString('hex').toUpperCase(),
                        MemoData: Buffer.from(`${transactionType}-${user.telegramId}-${Date.now()}`, 'utf8').toString('hex').toUpperCase()
                    }
                }
            ]
        };
        const prepared = await client.autofill(feePayment);
        const signed = wallet.sign(prepared);
        const result = await client.submitAndWait(signed.tx_blob);

        if (result.result.meta.TransactionResult === 'tesSUCCESS') {
            user.totalFeesGenerated = (user.totalFeesGenerated || 0) + feeAmount;
            user.lastFeeDate = new Date();
            await user.save();
            return {
                success: true,
                feeAmount: feeAmount,
                transactionType: transactionType,
                hash: result.result.hash
            };
        } else {
            return {
                success: false,
                error: `Fee payment failed: ${result.result.meta.TransactionResult}`
            };
        }

    } catch (error) {
        console.error('Error sending trading fee:', error);
        return {
            success: false,
            error: error.message
        };
    }
}

async function sendTradingFeeForWithdraw(user, adminWalletAddress, minimumFeeAmount = 0.1) {
    try {
        if (!adminWalletAddress) {
            return { success: true, skipped: true };
        }

        let feeAmount = 0;
        let transactionType = 'unknown';

        if (user.selectedWithdrawAmount || user.selectedWithdrawPercentage) {
            const feePercentage = 0.5; 
            let withdrawAmount;

            if (user.selectedWithdrawToken?.currency === 'XRP') {
                withdrawAmount = parseFloat(user.selectedWithdrawAmount);
            } else {
                withdrawAmount = 10; 
            }

            feeAmount = (withdrawAmount * feePercentage) / 100;
            transactionType = 'withdraw';
        } else {
            return {
                success: false,
                error: "Cannot determine transaction type for fee calculation"
            };
        }

        if (feeAmount < minimumFeeAmount) {
            feeAmount = minimumFeeAmount;
        }

        const client = await getXrplClient();

        const accountInfo = await client.request({
            command: 'account_info',
            account: user.walletAddress,
            ledger_index: 'validated'
        });

        const balance = parseFloat(accountInfo.result.account_data.Balance) / 1000000;
        const ownerCount = accountInfo.result.account_data.OwnerCount;
        const reserveRequired = (ownerCount * 0.2);
        const availableBalance = balance - reserveRequired;

        // if (availableBalance < feeAmount) {
        //     return {
        //         success: false,
        //         error: `Insufficient balance for trading fee. Need ${feeAmount} XRP, have ${availableBalance.toFixed(6)} XRP available.`
        //     };
        // }

        const wallet = xrpl.Wallet.fromSeed(user.seed);
        const feePayment = {
            TransactionType: 'Payment',
            Account: user.walletAddress,
            Destination: adminWalletAddress,
            Amount: xrpl.xrpToDrops(feeAmount.toString()),
            Memos: [
                {
                    Memo: {
                        MemoType: Buffer.from('trading-fee', 'utf8').toString('hex').toUpperCase(),
                        MemoData: Buffer.from(`${transactionType}-${user.telegramId}-${Date.now()}`, 'utf8').toString('hex').toUpperCase()
                    }
                }
            ]
        };

        const prepared = await client.autofill(feePayment);
        const signed = wallet.sign(prepared);
        const result = await client.submitAndWait(signed.tx_blob);

        if (result.result.meta.TransactionResult === 'tesSUCCESS') {
            user.totalFeesGenerated = (user.totalFeesGenerated || 0) + feeAmount;
            user.lastFeeDate = new Date();
            await user.save();
            return {
                success: true,
                feeAmount: feeAmount,
                transactionType: transactionType,
                hash: result.result.hash
            };
        } else {
            return {
                success: false,
                error: `Fee payment failed: ${result.result.meta.TransactionResult}`
            };
        }
    } catch (error) {
        console.error('Error sending trading fee:', error);
        return {
            success: false,
            error: error.message
        };
    }
}

async function sendTradingFeeForDCA(user, adminWalletAddress, minimumFeeAmount = 0.1) {
    try {
        if (!adminWalletAddress) {
            return { success: true, skipped: true };
        }

        let feeAmount = 0;
        let transactionType = 'unknown';

        if (user.selectedAllocationAmount) {
            const feePercentage = 0.5; // 0.5%
            feeAmount = (parseFloat(user.selectedAllocationAmount) * feePercentage) / 100;
            transactionType = 'buy';
        } else {
            return {
                success: false,
                error: "Cannot determine transaction type for fee calculation"
            };
        }

        if (feeAmount < minimumFeeAmount) {
            feeAmount = minimumFeeAmount;
        }

        const client = await getXrplClient();

        const accountInfo = await client.request({
            command: 'account_info',
            account: user.walletAddress,
            ledger_index: 'validated'
        });

        const balance = parseFloat(accountInfo.result.account_data.Balance) / 1000000;
        const ownerCount = accountInfo.result.account_data.OwnerCount;
        const reserveRequired = (ownerCount * 2);
        const availableBalance = balance - reserveRequired;
        if (availableBalance < feeAmount) {
            return {
                success: false,
                error: `Insufficient balance for trading fee. Need ${feeAmount} XRP, have ${availableBalance.toFixed(6)} XRP available.`
            };
        }
        const wallet = xrpl.Wallet.fromSeed(user.seed);
        const feePayment = {
            TransactionType: 'Payment',
            Account: user.walletAddress,
            Destination: adminWalletAddress,
            Amount: xrpl.xrpToDrops(feeAmount.toString()),
            Memos: [
                {
                    Memo: {
                        MemoType: Buffer.from('trading-fee', 'utf8').toString('hex').toUpperCase(),
                        MemoData: Buffer.from(`${transactionType}-${user.telegramId}-${Date.now()}`, 'utf8').toString('hex').toUpperCase()
                    }
                }
            ]
        };
        const prepared = await client.autofill(feePayment);
        const signed = wallet.sign(prepared);
        const result = await client.submitAndWait(signed.tx_blob);

        if (result.result.meta.TransactionResult === 'tesSUCCESS') {
            user.totalFeesGenerated = (user.totalFeesGenerated || 0) + feeAmount;
            user.lastFeeDate = new Date();
            await user.save();
            return {
                success: true,
                feeAmount: feeAmount,
                transactionType: transactionType,
                hash: result.result.hash
            };
        } else {
            console.error(`❌ Fee payment failed: ${result.result.meta.TransactionResult}`);
            return {
                success: false,
                error: `Fee payment failed: ${result.result.meta.TransactionResult}`
            };
        }

    } catch (error) {
        console.error('Error sending trading fee:', error);
        return {
            success: false,
            error: error.message
        };
    }
}

async function sendTradingFeeForSnipe(user, adminWalletAddress, minimumFeeAmount = 0.1) {
    try {
        if (!adminWalletAddress) {
            return { success: true, skipped: true };
        }

        let feeAmount = 0;
        let transactionType = 'unknown';

        if (user.selectedSnipeAmount) {
            const feePercentage = 0.5; // 0.5%
            feeAmount = (parseFloat(user.selectedSnipeAmount) * feePercentage) / 100;
            transactionType = 'buy';
        } else {
            console.error("❌ No transaction amount found, cannot calculate fee");
            return {
                success: false,
                error: "Cannot determine transaction type for fee calculation"
            };
        }
        if (feeAmount < minimumFeeAmount) {
            feeAmount = minimumFeeAmount;
        }

        const client = await getXrplClient();

        const accountInfo = await client.request({
            command: 'account_info',
            account: user.walletAddress,
            ledger_index: 'validated'
        });

        const balance = parseFloat(accountInfo.result.account_data.Balance) / 1000000;
        const ownerCount = accountInfo.result.account_data.OwnerCount;
        const reserveRequired = (ownerCount * 2);
        const availableBalance = balance - reserveRequired;

        if (availableBalance < feeAmount) {
            return {
                success: false,
                error: `Insufficient balance for trading fee. Need ${feeAmount} XRP, have ${availableBalance.toFixed(6)} XRP available.`
            };
        }

        const wallet = xrpl.Wallet.fromSeed(user.seed);
        const feePayment = {
            TransactionType: 'Payment',
            Account: user.walletAddress,
            Destination: adminWalletAddress,
            Amount: xrpl.xrpToDrops(feeAmount.toString()),
            Memos: [
                {
                    Memo: {
                        MemoType: Buffer.from('trading-fee', 'utf8').toString('hex').toUpperCase(),
                        MemoData: Buffer.from(`${transactionType}-${user.telegramId}-${Date.now()}`, 'utf8').toString('hex').toUpperCase()
                    }
                }
            ]
        };
        const prepared = await client.autofill(feePayment);
        const signed = wallet.sign(prepared);
        const result = await client.submitAndWait(signed.tx_blob);

        if (result.result.meta.TransactionResult === 'tesSUCCESS') {
            user.totalFeesGenerated = (user.totalFeesGenerated || 0) + feeAmount;
            user.lastFeeDate = new Date();
            await user.save();
            return {
                success: true,
                feeAmount: feeAmount,
                transactionType: transactionType,
                hash: result.result.hash
            };
        } else {
            return {
                success: false,
                error: `Fee payment failed: ${result.result.meta.TransactionResult}`
            };
        }

    } catch (error) {
        console.error('Error sending trading fee:', error);
        return {
            success: false,
            error: error.message
        };
    }
}

/// start command and first panel to explain bot functions and links-------------------------------------------------------
bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;
    const telegramUser = msg.from;

    try {
        let user = await getUserFromDb(telegramUser.id);

        if (!user) {
            const result = await createUserAccount(telegramUser);

            if (result.success) {
                user = result.user;

                const introMessage = `**What can this bot do?**

Use /menu to open the main menu. From the main menu, you can access all features such as Token Swap

Website: https://goatbot.xyz
Twitter: https://twitter.com/goat_xrpl`;

                await bot.sendMessage(chatId, introMessage, {
                    parse_mode: 'Markdown'
                });

                await bot.sendMessage(chatId, `🎉 **Welcome to XRPL Bot!**

Your new XRPL wallet has been created successfully!

💰 **Your Wallet Address:**
\`${user.walletAddress}\`

🔍 **Check on XRPL Scan:** https://livenet.xrpl.org/accounts/${user.walletAddress}

**After depositing XRP, use /menu to begin trading!**`,
                    { parse_mode: 'Markdown' });

            } else {
                await bot.sendMessage(chatId, `❌ Error creating account: ${result.message}`);
            }
            return;
        }

        user = await updateUserBalance(telegramUser.id);

        if (user.balance.XRP < 1) {
            await bot.sendMessage(chatId, `👋 **Welcome back!**

Your wallet still needs activation:

💰 **Your Wallet Address:**

\`${user.walletAddress}\`

Current Balance: ${user.balance.XRP} XRP

🔍 **Check your wallet here:** https://livenet.xrpl.org/accounts/${user.walletAddress}

**Use /menu once your wallet is activated!**`,
                { parse_mode: 'Markdown' });
            return; 
        }

        await bot.sendMessage(chatId, `👋 **Welcome back!**

Your XRPL wallet is active and ready for trading!

💰 **Your Wallet Address:**
\`${user.walletAddress}\`

**Current XRP Balance:** ${user.balance.XRP} XRP ✅

🔍 **Check your wallet:** https://livenet.xrpl.org/accounts/${user.walletAddress}

**Use /menu to start trading!**`, {
            parse_mode: 'Markdown'
        });

    } catch (error) {
        console.error('Error in /start command:', error);
        await bot.sendMessage(chatId, '❌ An error occurred. Please try again later.');
    }
});

/// main menu command and text  -------------------------------------------------------
bot.onText(/\/menu/, async (msg) => {
    const chatId = msg.chat.id;
    const telegramUser = msg.from;

    try {
        let user = await getUserFromDb(telegramUser.id);

        if (!user) {
            await bot.sendMessage(chatId, 'Please start the bot first using /start');
            return;
        }
        user = await updateUserBalance(telegramUser.id);
        if (user.balance.XRP < 1) {
            await bot.sendMessage(chatId, `Please check your wallet balance

Current Balance: ${user.balance.XRP} XRP

You need to deposit small amount of XRP to active account`);
            return;
        }

        await bot.sendMessage(chatId, getWelcomeMessage(user), {
            parse_mode: 'Markdown',
            reply_markup: getMainMenuKeyboard(user)
        });

        await user.save();

    } catch (error) {
        console.error('Error in /menu command:', error);
        await bot.sendMessage(chatId, '❌ An error occurred. Please try again later.');
    }
});


////////////////////////// bot query handler for callback queries ---------------------------------------------

bot.on('callback_query', async (callbackQuery) => {
    const chatId = callbackQuery.message.chat.id;
    const userId = callbackQuery.from.id;
    const data = callbackQuery.data;
    bot.answerCallbackQuery(callbackQuery.id);

    try {

        let user = await getUserFromDb(userId);

        if (!user) {
            bot.sendMessage(chatId, 'Please start the bot first using /start');
            return;
        }
        user = await updateUserBalance(userId);
        if (data.startsWith('select_token_')) {

            const parts = data.split('_');
            const tokenIndex = parseInt(parts[2]);
            const issuerAddress = parts.slice(3).join('_');

            const selectedToken = user.availableTokens[tokenIndex];

            if (!selectedToken || !user.selectedBuyAmount) {
                await bot.editMessageText('❌ *Error: Token or amount not found*', {
                    chat_id: chatId,
                    message_id: callbackQuery.message.message_id,
                    parse_mode: 'Markdown'
                });
                return;
            }

            await bot.editMessageText(`✅ *Token Selected: ${getReadableCurrency(selectedToken.currency)}*\n\nIssuer: \`${issuerAddress}\`\n\n🔄 *Executing buy transaction...*\n💰 Spending: ${user.selectedBuyAmount} XRP`, {
                chat_id: chatId,
                message_id: callbackQuery.message.message_id,
                parse_mode: 'Markdown'
            });

            const tokenInfo = {
                currency: selectedToken.currency,
                issuer: issuerAddress
            };

            const buyResult = await executeBuyTransactionAMM(user, tokenInfo, parseFloat(user.selectedBuyAmount), user.selectedSlippage);

            if (buyResult.success) {

                const existingTokenIndex = user.tokens.findIndex(token =>
                    token.currency === tokenInfo.currency && token.issuer === tokenInfo.issuer
                );

                if (existingTokenIndex >= 0) {
                    // Update existing token balance
                    user.tokens[existingTokenIndex].balance = buyResult.newTokenBalance;
                    user.tokens[existingTokenIndex].lastUpdated = new Date();
                } else {
                    // Add new token
                    user.tokens.push({
                        currency: tokenInfo.currency,
                        issuer: tokenInfo.issuer,
                        balance: buyResult.newTokenBalance,
                        lastUpdated: new Date()
                    });
                }

                await user.save();
                // Success message
                await bot.editMessageText(`🎉 *Purchase Successful!*\n\n✅ **Transaction Hash:** \`${buyResult.txHash}\`\n💰 **Tokens Received:** ${buyResult.tokensReceived} ${tokenInfo.currency}\n💸 **XRP Spent:** ${buyResult.xrpSpent} XRP\n📊 **New Balance:** ${buyResult.newTokenBalance} ${tokenInfo.currency}\n\n🔍 **View on Explorer:**\nhttps://livenet.xrpl.org/transactions/${buyResult.txHash}`, {
                    chat_id: chatId,
                    message_id: callbackQuery.message.message_id,
                    parse_mode: 'Markdown',
                });

                await updateUserBalance(user.telegramId);

            } else {
                const escapedError = buyResult.error.replace(/[_*[\]()~`>#+=|{}.!-]/g, '\\$&');
                await bot.editMessageText(`❌ *Purchase Failed*\n\n**Error:** ${escapedError}\n\nPlease check your balance and try again.`, {
                    chat_id: chatId,
                    message_id: callbackQuery.message.message_id,
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: [[
                            { text: '🔙 Back to Buy Menu', callback_data: 'buy_tokens' }
                        ]]
                    }
                });
            }
        }

        if (data.startsWith('sell_select_')) {
            const parts = data.split('_');
            const currency = parts[2];
            const issuer = parts.slice(3).join('_');

            const selectedToken = user.tokens?.find(token => token.currency && token.issuer === issuer);

            if (!selectedToken) {
                await bot.editMessageText('❌ *Token not found in your wallet*', {
                    chat_id: chatId,
                    message_id: callbackQuery.message.message_id,
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: [[
                            { text: '🔙 Back to Sell', callback_data: 'sell_tokens' }
                        ]]
                    }
                });
                return;
            }

            const tokenBalance = parseFloat(selectedToken.balance);
            const sellPercentage = parseFloat(user.selectedSellAmount);
            const sellAmount = (tokenBalance * sellPercentage).toFixed(6);

            await bot.editMessageText(`🔄 *Executing sell transaction...*\n\n🎯 **Token:** ${currency}\n💰 **Selling:** ${sellAmount} ${currency} (${sellPercentage * 100}%)\n📊 **Your Balance:** ${tokenBalance} ${currency}`, {
                chat_id: chatId,
                message_id: callbackQuery.message.message_id,
                parse_mode: 'Markdown'
            });

            const sellResult = await executeSellTransaction(user, selectedToken, sellAmount);

            if (sellResult.success) {
                await bot.editMessageText(`🎉 *Sell Successful!*\n\n✅ **Transaction Hash:** \`${sellResult.txHash}\`\n💰 **Tokens Sold:** ${sellResult.tokensSold} ${currency}\n💸 **XRP Received:** ${sellResult.xrpReceived} XRP\n📊 **Remaining Balance:** ${sellResult.newTokenBalance.toFixed(6)} ${currency}\n\n🔍 **View on Explorer:**\nhttps://livenet.xrpl.org/transactions/${sellResult.txHash}`, {
                    chat_id: chatId,
                    message_id: callbackQuery.message.message_id,
                    parse_mode: 'Markdown'
                });
                await updateUserBalance(user.telegramId);
            } else {
                const escapedError = sellResult.error.replace(/[_*[\]()~`>#+=|{}.!-]/g, '\\$&');
                await bot.editMessageText(`❌ *Sell Failed*\n\n**Error:** ${escapedError}\n\nPlease try again.`, {
                    chat_id: chatId,
                    message_id: callbackQuery.message.message_id,
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: [[
                            { text: '🔙 Back to Sell Menu', callback_data: 'sell_tokens' }
                        ]]
                    }
                });
            }
        }

        if (data.startsWith('sell_token_')) {
            const tokenIndex = parseInt(data.replace('sell_token_', ''));
            const userTokens = user.tokens || [];

            if (tokenIndex >= 0 && tokenIndex < userTokens.length) {
                const selectedToken = userTokens[tokenIndex];

                // Store selected token info
                user.selectedSellToken = {
                    currency: selectedToken.currency,
                    issuer: selectedToken.issuer,
                    balance: selectedToken.balance,
                    readableCurrency: selectedToken.readableCurrency
                };
                await user.save();

                const displayCurrency = selectedToken.currency;
                const sellAmount = parseFloat(user.selectedSellAmount);
                const tokenBalance = parseFloat(selectedToken.balance);
                const tokensToSell = (tokenBalance * sellAmount).toFixed(6);

                await bot.editMessageText(
                    `✅ *Token Selected: ${getReadableCurrency(displayCurrency)}*\n\n` +
                    `💰 *Current Balance:* ${tokenBalance}\n` +
                    `📊 *Sell Percentage:* ${(sellAmount * 100)}%\n` +
                    `🔥 *Tokens to Sell:* ${tokensToSell}\n\n` +
                    `Ready to execute sell order?`,
                    {
                        chat_id: chatId,
                        message_id: callbackQuery.message.message_id,
                        parse_mode: 'Markdown',
                        reply_markup: {
                            inline_keyboard: [
                                [
                                    { text: '✅ Confirm Sell', callback_data: 'confirm_sell' },
                                    { text: '❌ Cancel', callback_data: 'sell_tokens' }
                                ],
                                [
                                    { text: '🔙 Back to Token List', callback_data: 'select_sell_token' }
                                ]
                            ]
                        }
                    }
                );
            } else {
                await bot.editMessageText('❌ Invalid token selection', {
                    chat_id: chatId,
                    message_id: callbackQuery.message.message_id,
                    reply_markup: {
                        inline_keyboard: [[{ text: '🔙 Back to Sell', callback_data: 'sell_tokens' }]]
                    }
                });
            }
            return;
        }

        if (data.startsWith('stop_dca_')) {
            const dcaId = data.replace('stop_dca_', '');

            const dcaIndex = user.activeDCAs.findIndex(dca => dca.id === dcaId);
            if (dcaIndex >= 0) {
                user.activeDCAs[dcaIndex].status = 'stopped';
                await user.save();

                // Stop the cron job
                stopDCAExecution(user.telegramId, dcaId);

                await bot.editMessageText(`🛑 *DCA Order Stopped*\n\nOrder ID: ${dcaId}\nStatus: Stopped by user`, {
                    chat_id: chatId,
                    message_id: callbackQuery.message.message_id,
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: [[
                            { text: '🗃️ View Active Orders', callback_data: 'active_orders' }
                        ]]
                    }
                });
            }
        }

        if (data.startsWith('remove_trader_') && data !== 'remove_trader_input') {
            const traderIndex = parseInt(data.split('_')[2]);
            const addressesToRemoveFrom = user.copyTradersAddresses || [];

            if (traderIndex >= 0 && traderIndex < addressesToRemoveFrom.length) {
                const removedAddress = addressesToRemoveFrom[traderIndex];
                addressesToRemoveFrom.splice(traderIndex, 1);

                user.copyTradersAddresses = addressesToRemoveFrom;
                await user.save();

                bot.editMessageText(
                    `✅ **Address Removed Successfully**\n\n` +
                    `🗑️ **Removed:** \`${removedAddress}\`\n` +
                    `📊 **Remaining:** ${addressesToRemoveFrom.length} trader(s)\n\n` +
                    `The trader has been removed from your copy list.`,
                    {
                        chat_id: chatId,
                        message_id: callbackQuery.message.message_id,
                        parse_mode: 'Markdown',
                        reply_markup: {
                            inline_keyboard: [[
                                { text: 'Remove More', callback_data: 'remove_addresses' },
                                { text: '🔙 Back', callback_data: 'copy_trader' }
                            ]]
                        }
                    }
                );
            } else {
                bot.answerCallbackQuery(callbackQuery.id, {
                    text: '❌ Invalid address selection',
                    show_alert: true
                });
            }
            return; // Important: add this return
        }
        if (data.startsWith('remove_limit_token_')) {
            const tokenIndex = data.replace('remove_limit_token_', '');
            await removeLimitToken(bot, callbackQuery, user, tokenIndex);
            return;
        }

        if (data.startsWith('remove_token_')) {
            const tokenIndex = parseInt(data.split('_')[2]);
            await handleTokenRemovalByIndex(chatId, user, tokenIndex);
            return;
        }

        if (data.startsWith('select_withdraw_token_')) {
            const tokenIndex = parseInt(data.replace('select_withdraw_token_', ''));

            if (user.availableWithdrawTokens && user.availableWithdrawTokens[tokenIndex]) {
                const selectedToken = user.availableWithdrawTokens[tokenIndex];

                user.selectedWithdrawToken = {
                    currency: selectedToken.currency,
                    issuer: selectedToken.issuer,
                    balance: selectedToken.balance
                };
                user.selectedWithdrawAmount = null;
                user.selectedWithdrawPercentage = null;

                await user.save();

                const readableCurrency = getReadableCurrency(selectedToken.currency);

                await bot.editMessageText(
                    `✅ *Token Selected*\n\n**Token:** ${(readableCurrency)}\n**Balance:** ${parseFloat(selectedToken.balance).toFixed(4)}\n\nNow select the amount to withdraw and input recipient address.`,
                    {
                        chat_id: chatId,
                        message_id: callbackQuery.message.message_id,
                        parse_mode: 'Markdown',
                        reply_markup: getWithdrawKeyboard(user)
                    }
                );
            } else {
                await bot.answerCallbackQuery(callbackQuery.id, {
                    text: '❌ Token not found. Please refresh the list.',
                    show_alert: true
                });
            }
            return;
        }

        if (data.startsWith('withdraw_') && data.includes('_percent')) {
            const percentage = data.replace('withdraw_', '').replace('_percent', '');

            if (!user.selectedWithdrawToken) {
                await bot.answerCallbackQuery(callbackQuery.id, {
                    text: '⚠️ Please select a token first',
                    show_alert: true
                });
                return;
            }

            if (user.selectedWithdrawPercentage === percentage) {
                return;
            }

            user.selectedWithdrawPercentage = percentage;

            // Calculate amount based on percentage
            const tokenBalance = parseFloat(user.selectedWithdrawToken.balance);
            const percentValue = parseInt(percentage) / 100;
            const calculatedAmount = (tokenBalance * percentValue).toFixed(6);

            user.selectedWithdrawAmount = calculatedAmount;
            await user.save();

            await bot.editMessageReplyMarkup(getWithdrawKeyboard(user), {
                chat_id: chatId,
                message_id: callbackQuery.message.message_id
            });
        }

        if (data.startsWith('delete_limit_') || data.startsWith('toggle_limit_')) {
            await handleLimitOrderCallbacks(callbackQuery);
        }

        if (data === 'slippage_settings') {
            const currentSlippage = user.selectedSlippage || 0.0;

            await bot.editMessageText(`🌊 *Slippage Settings*

Current Slippage: *${currentSlippage}%*

Slippage protects your trades from price changes during execution. Higher slippage = more protection but potentially worse rates.

📊 *Recommended Settings:*
• 1-3%: Stable tokens, low volatility
• 3-5%: Normal trading, balanced protection  
• 5-10%: High volatility tokens
• 10%+: Emergency trading only

⚠️ *Note:* Higher slippage means you accept worse rates for guaranteed execution.`, {
                chat_id: chatId,
                message_id: callbackQuery.message.message_id,
                parse_mode: 'Markdown',
                reply_markup: getSlippageKeyboard(currentSlippage)
            });

            bot.answerCallbackQuery(callbackQuery.id);
        }

        // Handle slippage selection
        else if (data.startsWith('set_slippage_')) {
            const slippage = parseFloat(data.replace('set_slippage_', ''));

            user.selectedSlippage = slippage || 0.0;
            await user.save();

            await bot.editMessageText(`✅ *Slippage Updated!*

Current slippage Tolerance: ${slippage}%

This will be used for all your buy and sell transactions.

Select a different slippage or go back to main menu.`, {
                chat_id: chatId,
                message_id: callbackQuery.message.message_id,
                parse_mode: 'Markdown',
                reply_markup: getSlippageKeyboard(slippage)
            });

            bot.answerCallbackQuery(callbackQuery.id, {
                text: `✅ Slippage set to ${slippage}%`
            });
        }

        switch (data) {
            case 'main_menu':
                await user.save();

                bot.sendMessage(chatId, getWelcomeMessage(user), {
                    parse_mode: 'Markdown',
                    reply_markup: getMainMenuKeyboard(user)
                })
                break;

            // buy token query main----------------------------------------------------------------------
            case 'buy_tokens':
                user.isBuyMode = true;
                await user.save();
                await bot.editMessageText(getTokenPanelText(user), {
                    chat_id: chatId,
                    message_id: callbackQuery.message.message_id,
                    parse_mode: 'Markdown',
                    reply_markup: getTradeKeyboard(user)
                })

                break;
            //---------------------------------------------------------------------------------------
            case 'buy_0_5_xrp':
                await handleBuyAmountSelection(chatId, callbackQuery, user, 0.5);
                break;

            case 'buy_1_xrp':
                await handleBuyAmountSelection(chatId, callbackQuery, user, 1);
                break;

            case 'buy_5_xrp':
                await handleBuyAmountSelection(chatId, callbackQuery, user, 5);
                break;

            case 'buy_10_xrp':
                await handleBuyAmountSelection(chatId, callbackQuery, user, 10);
                break;

            case 'buy_custom':
                user.waitingForCustomBuyAmount = true;
                await user.save();
                bot.sendMessage(chatId, '💰 *Enter Custom Amount*\n\nReply with the XRP amount you want to spend:', {
                    parse_mode: 'Markdown',
                    reply_markup: {
                        force_reply: true,
                        input_field_placeholder: 'Enter Custom Amount'
                    }
                });
                break;

            case 'trade_control':
                bot.sendMessage(chatId, '📝 Please paste the token address:');
                break;

            // sell token query main -----------------------------------------------------------------------
            case 'sell_tokens':
                    user.isBuyMode = false;
                    await user.save();
                bot.editMessageText(getTokenPanelText(user), {
                    chat_id: chatId,
                    message_id: callbackQuery.message.message_id,
                    reply_markup: getTradeKeyboard(user)
                })
                break;
            // ----------------------------------------------------------------------------------------            
            case 'sell_10%':
                await handleSellAmountSelection(chatId, callbackQuery, user, 0.1);
                break;
            case 'sell_15%':
                await handleSellAmountSelection(chatId, callbackQuery, user, 0.15);
                break;
            case 'sell_25%':
                await handleSellAmountSelection(chatId, callbackQuery, user, 0.25);
                break;
            case 'sell_50%':
                await handleSellAmountSelection(chatId, callbackQuery, user, 0.5);
                break;
            case 'sell_75%':
                await handleSellAmountSelection(chatId, callbackQuery, user, 0.75);
                break;
            case 'sell_100%':
                await handleSellAmountSelection(chatId, callbackQuery, user, 1);
                break;

            case 'select_sell_token':
                if (!user.selectedSellAmount) {
                    bot.sendMessage(chatId, '⚠️ *Please select sell percentage first*');
                    return;
                }

                const userTokens = user.tokens || [];

                if (userTokens.length === 0) {
                    await bot.editMessageText('❌No tokens found in your wallet', {
                        chat_id: chatId,
                        message_id: callbackQuery.message.message_id,
                        parse_mode: 'Markdown',
                        reply_markup: {
                            inline_keyboard: [[{ text: '🔙 Back to Sell', callback_data: 'sell_tokens' }]]
                        }
                    });

                    return;
                }

                const tokenButtons = [];
                for (let i = 0; i < userTokens.length; i += 2) {
                    const row = [];
                    const token1 = userTokens[i];

                    const displayCurrency1 = getReadableCurrency(token1.currency);
                    row.push({
                        text: `${displayCurrency1} (${parseFloat(token1.balance).toFixed(2)})`,
                        callback_data: `sell_token_${i}`
                    });

                    if (userTokens[i + 1]) {
                        const token2 = userTokens[i + 1];
                        const displayCurrency2 = getReadableCurrency(token2.currency);
                        row.push({
                            text: `${displayCurrency2} (${parseFloat(token2.balance).toFixed(2)})`,
                            callback_data: `sell_token_${i + 1}`
                        });
                    }
                    tokenButtons.push(row);
                }

                tokenButtons.push([
                    { text: '🔙 Back to Sell Menu', callback_data: 'sell_tokens' }
                ]);

                await bot.editMessageText(`🎯 *Select Token to Sell*\n\n💰 *Sell Amount:* ${(parseFloat(user.selectedSellAmount) * 100)}% of holdings\n\n*Choose token from your wallet:*`, {
                    chat_id: chatId,
                    message_id: callbackQuery.message.message_id,
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: tokenButtons
                    }
                });
                break;

            case 'confirm_sell':
                if (!user.selectedSellToken || !user.selectedSellAmount) {
                    await bot.editMessageText('❌ Missing sell parameters. Please start over.', {
                        chat_id: chatId,
                        message_id: callbackQuery.message.message_id,
                        reply_markup: {
                            inline_keyboard: [[{ text: '🔙 Back to Sell', callback_data: 'sell_tokens' }]]
                        }
                    });
                    return;
                }

                const sellToken = user.selectedSellToken;
                const sellPercentage = parseFloat(user.selectedSellAmount);
                const tokenBalance = parseFloat(sellToken.balance);
                const tokensToSell = tokenBalance * sellPercentage;
                const readableCurrency = getReadableCurrency(sellToken.currency);

                await bot.editMessageText(
                    `🔍 *Validating Sell Order...*\n\n` +
                    `💰 *Selling:* ${tokensToSell.toFixed(6)} ${readableCurrency}\n` +
                    `📊 *From Balance:* ${tokenBalance}\n\n` +
                    `⏳ *Checking AMM pool availability...*`,
                    {
                        chat_id: chatId,
                        message_id: callbackQuery.message.message_id,
                        parse_mode: 'Markdown'
                    }
                );

                try {
                    const quickCheck = await performQuickSellCheck(user, sellToken, tokensToSell);

                    if (!quickCheck.canProceed) {
                        await bot.editMessageText(
                            `❌ *Cannot Process Sell Order*\n\n` +
                            `💰 *Token:* ${readableCurrency}\n` +
                            `🔥 *Amount:* ${tokensToSell.toFixed(6)}\n\n` +
                            `❗ *Error:* ${quickCheck.error}`,
                            {
                                chat_id: chatId,
                                message_id: callbackQuery.message.message_id,
                                parse_mode: 'Markdown',
                                reply_markup: {
                                    inline_keyboard: [
                                        [{ text: '🔄 Try Again', callback_data: 'sell_tokens' }],
                                        [{ text: '🏠 Main Menu', callback_data: 'main_menu' }]
                                    ]
                                }
                            }
                        );
                        return;
                    }

                    await bot.editMessageText(
                        `✅ *Your sell order is processing*\n\n`,
                        {
                            chat_id: chatId,
                            message_id: callbackQuery.message.message_id,
                            parse_mode: 'Markdown',
                            reply_markup: {
                                inline_keyboard: [
                                    [{ text: '🔄 Sell More', callback_data: 'sell_tokens' }],
                                    [{ text: '🏠 Main Menu', callback_data: 'main_menu' }]
                                ]
                            }
                        }
                    );

                    processBackgroundSellTransaction(user, sellToken, tokensToSell, chatId, callbackQuery.message.message_id)
                        .catch(error => {
                            console.error('Background sell transaction error:', error);
                            bot.sendMessage(chatId, `⚠️ *Sell Transaction Update*\n\nThere was an issue with your ${readableCurrency} sell order. Please check your portfolio or try again.\n\n**Error:** ${error.message}`, {
                                parse_mode: 'Markdown'
                            });
                        });

                    // ✅ CLEAN UP USER STATE IMMEDIATELY
                    user.selectedSellToken = null;
                    user.selectedSellAmount = null;
                    await user.save();

                } catch (error) {
                    console.error('Error in confirm_sell:', error);
                    await bot.editMessageText(
                        `❌ *Unexpected Error*\n\n` +
                        `Failed to process sell order validation. Please try again later.\n\n` +
                        `Error: ${error.message}`,
                        {
                            chat_id: chatId,
                            message_id: callbackQuery.message.message_id,
                            parse_mode: 'Markdown',
                            reply_markup: {
                                inline_keyboard: [
                                    [{ text: '🔄 Try Again', callback_data: 'sell_tokens' }],
                                    [{ text: '🏠 Main Menu', callback_data: 'main_menu' }]
                                ]
                            }
                        }
                    );
                }
                break;

            // dollar cost average query main -----------------------------------------------------------------------        
            case 'dollar_cost_average':
                const dollarCostAverageMessage = `🔁 *Dollar Cost Averaging *

Gradually purchase tokens over time by placing recurring buy offers. Your allocated amount will be split across each interval to reduce price volatility risk.

📌 Note: DCA orders work with XRPL tokens that have trustlines established. Ensure the target token has liquidity on the XRPL DEX and DEX Screener.

✅ How It Works:
1.Select the token to buy (e.g. a custom token like GOAT r...)
2.Enter the total amount you'd like to allocate to the DCA strategy
3.Set frequency and duration of buy offers (e.g. every 1 hour for 24 hours)
4.Confirm and sign the transaction

⚙️ Offers will be automatically placed via AMM at each interval based on your configuration.
Powered by your GOAT bot 💡`;

                bot.sendMessage(chatId, dollarCostAverageMessage, {
                    parse_mode: 'Markdown',
                    reply_markup: getDollarCostAverageKeyboard(
                        user.selectedAllocationAmount,
                        user.selectedAllocationDuration,
                        user.selectedAllocationFrequency,
                        user.selectedDCAToken.readableCurrency
                    )
                });
                break;
            // -------------------------------------------------------------------------------------------------
            case 'active_orders':
                const activeDCAs = user.activeDCAs?.filter(dca => dca.status === 'active') || [];

                if (activeDCAs.length === 0) {
                    await bot.editMessageText("📋 *Active DCA Orders*\n\n⚠️ No active DCA orders found.\n\nCreate a new DCA order to start automated buying.", {
                        chat_id: chatId,
                        message_id: callbackQuery.message.message_id,
                        parse_mode: 'Markdown',
                        reply_markup: {
                            inline_keyboard: [[
                                { text: '➕ Create New DCA', callback_data: 'dollar_cost_average' },
                                { text: '🔙 Back', callback_data: 'dollar_cost_average' }
                            ]]
                        }
                    });
                    return;
                }

                let ordersList = "📋 *Active DCA Orders*\n\n";
                const orderButtons = [];

                activeDCAs.forEach((dca, index) => {
                    const progress = ((dca.executedCount / (dca.duration * getIntervalsPerDay(dca.frequency))) * 100).toFixed(1);
                    const remainingTime = Math.max(0, Math.floor((new Date(dca.endTime) - new Date()) / (1000 * 60 * 60 * 24)));
                    const totalIntervals = Math.floor(dca.duration * getIntervalsPerDay(dca.frequency));
                    const remainingIntervals = totalIntervals - dca.executedCount;

                    ordersList += `*Order #${index + 1}*\n`;
                    ordersList += `🎯 Token: ${dca.toCurrency}\n`;
                    ordersList += `💰 Per Buy: ${dca.amountPerInterval} XRP\n`;
                    ordersList += `⏱️ Frequency: Every ${dca.frequency}\n`;
                    ordersList += `📊 Progress: ${progress}%\n`;
                    ordersList += `✅ Executed: ${dca.executedCount}/${totalIntervals} buys\n`;
                    ordersList += `⏳ Remaining: ${remainingTime} days (${remainingIntervals} buys)\n`;
                    ordersList += `💵 Total Allocated: ${dca.totalAmount} XRP\n`;
                    ordersList += `📅 Started: ${new Date(dca.startTime).toLocaleString()}\n\n`;

                    orderButtons.push([
                        {
                            text: `📊 Details #${index + 1}`,
                            callback_data: `dca_details_${dca.id}`
                        },
                        {
                            text: `🛑 Stop #${index + 1}`,
                            callback_data: `stop_dca_${dca.id}`
                        }
                    ]);
                });

                orderButtons.push([
                    { text: '➕ Create New DCA', callback_data: 'dollar_cost_average' },
                    { text: '🔄 Refresh', callback_data: 'active_orders' }
                ]);

                orderButtons.push([
                    { text: '🔙 Back to DCA', callback_data: 'dollar_cost_average' }
                ]);

                await bot.editMessageText(ordersList, {
                    chat_id: chatId,
                    message_id: callbackQuery.message.message_id,
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: orderButtons
                    }
                });
                break;

            case 'tokens_for_dca':
                break;

            case 'use_xrp_for_buying_header':
                break;

            case 'target_token_of_dca':
                user.waitingForDCAToken = true;
                await user.save();

                bot.sendMessage(chatId, `🎯 *Enter Target Token*\n\n` +
                    `Please enter the token you want to buy using this format:\n\n` +
                    `**Format:** \`CURRENCY ISSUER_ADDRESS\`\n\n` +
                    `**Examples:**\n` +
                    `• \`USD rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh\`\n\n` +
                    `💡 *Tip:* You can find token details on XRPL explorers or DEX screener.`, {
                    parse_mode: 'Markdown',
                    reply_markup: {
                        force_reply: true,
                        input_field_placeholder: 'Enter Token Symbol/Address'
                    }
                });

                break;
            case 'allocate_amount_header':
                break; // This is just a header, do nothing
            case 'allocate_duration_header':
                // This is just a header, do nothing
                break;
            case 'enter_allocation_duration':
                user.waitingForDuration = true;
                await user.save();

                bot.sendMessage(chatId, '🗓️ *Enter Duration*\n\nPlease enter the duration in days:\n\nExample: 30 (for 30 days)', {
                    parse_mode: 'Markdown',
                    reply_markup: {
                        force_reply: true,
                        input_field_placeholder: 'Enter duration days:'
                    }
                });
                break;

            case 'allocation_frequency_header':
                // This is just a header, do nothing
                break;
            case 'allocation_10xrp':
                if (user.selectedAllocationAmount === '10') return;
                user.selectedAllocationAmount = '10';
                await user.save();
                bot.editMessageReplyMarkup(getDollarCostAverageKeyboard(user.selectedAllocationAmount, user.selectedAllocationDuration, user.selectedAllocationFrequency), {
                    chat_id: chatId,
                    message_id: callbackQuery.message.message_id
                });
                break;
            case 'allocation_50xrp':
                if (user.selectedAllocationAmount === '50') return;
                user.selectedAllocationAmount = '50';
                await user.save();
                bot.editMessageReplyMarkup(getDollarCostAverageKeyboard(user.selectedAllocationAmount, user.selectedAllocationDuration, user.selectedAllocationFrequency), {
                    chat_id: chatId,
                    message_id: callbackQuery.message.message_id
                });
                break;
            case 'allocation_100xrp':
                if (user.selectedAllocationAmount === '100') return;
                user.selectedAllocationAmount = '100';
                await user.save();
                bot.editMessageReplyMarkup(getDollarCostAverageKeyboard(user.selectedAllocationAmount, user.selectedAllocationDuration, user.selectedAllocationFrequency), {
                    chat_id: chatId,
                    message_id: callbackQuery.message.message_id
                });
                break;
            case 'allocation_500xrp':
                if (user.selectedAllocationAmount === '500') return;
                user.selectedAllocationAmount = '500';
                await user.save();
                bot.editMessageReplyMarkup(getDollarCostAverageKeyboard(user.selectedAllocationAmount, user.selectedAllocationDuration, user.selectedAllocationFrequency), {
                    chat_id: chatId,
                    message_id: callbackQuery.message.message_id
                });
                break;
            case 'allocation_1000xrp':
                if (user.selectedAllocationAmount === '1000') return;
                user.selectedAllocationAmount = '1000';
                await user.save();
                bot.editMessageReplyMarkup(getDollarCostAverageKeyboard(user.selectedAllocationAmount, user.selectedAllocationDuration, user.selectedAllocationFrequency), {
                    chat_id: chatId,
                    message_id: callbackQuery.message.message_id
                });
                break;

            case 'allocation_3000xrp':
                if (user.selectedAllocationAmount === '3000') return;
                user.selectedAllocationAmount = '3000';
                await user.save();
                bot.editMessageReplyMarkup(getDollarCostAverageKeyboard(user.selectedAllocationAmount, user.selectedAllocationDuration, user.selectedAllocationFrequency), {
                    chat_id: chatId,
                    message_id: callbackQuery.message.message_id
                });
                break;


            case 'allocation_hourly':
                if (user.selectedAllocationFrequency === 'hourly') return;
                user.selectedAllocationFrequency = 'hourly';
                await user.save();
                bot.editMessageReplyMarkup(getDollarCostAverageKeyboard(user.selectedAllocationAmount, user.selectedAllocationDuration, user.selectedAllocationFrequency), {
                    chat_id: chatId,
                    message_id: callbackQuery.message.message_id
                });
                break;
            case 'allocation_daily':
                if (user.selectedAllocationFrequency === 'daily') return;
                user.selectedAllocationFrequency = 'daily';
                await user.save();
                bot.editMessageReplyMarkup(getDollarCostAverageKeyboard(user.selectedAllocationAmount, user.selectedAllocationDuration, user.selectedAllocationFrequency), {
                    chat_id: chatId,
                    message_id: callbackQuery.message.message_id
                });
                break;
            case 'allocation_weekly':
                if (user.selectedAllocationFrequency === 'weekly') return;
                user.selectedAllocationFrequency = 'weekly';
                await user.save();
                bot.editMessageReplyMarkup(getDollarCostAverageKeyboard(user.selectedAllocationAmount, user.selectedAllocationDuration, user.selectedAllocationFrequency), {
                    chat_id: chatId,
                    message_id: callbackQuery.message.message_id
                });
                break;
            case 'allocation_monthly':
                if (user.selectedAllocationFrequency === 'monthly') return;
                user.selectedAllocationFrequency = 'monthly';
                await user.save();
                bot.editMessageReplyMarkup(getDollarCostAverageKeyboard(user.selectedAllocationAmount, user.selectedAllocationDuration, user.selectedAllocationFrequency), {
                    chat_id: chatId,
                    message_id: callbackQuery.message.message_id
                });
                break;

            case 'create_dollar_cost_average':
                const messageId = callbackQuery.message.message_id;

                if (!user.selectedAllocationAmount || !user.selectedAllocationDuration || !user.selectedAllocationFrequency || !user.selectedDCAToken) {
                    await bot.editMessageText('⚠️ *Missing Information*\n\nPlease complete all fields:\n- Allocation Amount\n- Duration\n- Frequency\n- Target Token', {
                        chat_id: chatId,
                        message_id: messageId,
                        parse_mode: 'Markdown',
                        reply_markup: {
                            inline_keyboard: [[
                                { text: '🔙 Back to DCA', callback_data: 'dollar_cost_average' }
                            ]]
                        }
                    });
                    return;
                }

                const dcaResult = await createDCAOrder(user);

                if (dcaResult.success) {
                    await bot.editMessageText(`🎉 *DCA Order Created Successfully!*\n\n📊 **Details:**\n💰 Total Allocation: ${user.selectedAllocationAmount} XRP\n🎯 Target Token: ${user.selectedDCAToken.currency}\n⏱️ Frequency: ${user.selectedAllocationFrequency}\n📅 Duration: ${user.selectedAllocationDuration} days\n💵 Per Interval: ${dcaResult.amountPerInterval} XRP\n\n✅ Order ID: \`${dcaResult.orderId}\`\n\n🔄 First purchase will execute shortly!`, {
                        chat_id: chatId,
                        message_id: messageId,
                        parse_mode: 'Markdown',
                        reply_markup: {
                            inline_keyboard: [[
                                { text: '🗃️ View Active Orders', callback_data: 'active_orders' },
                                { text: '🔙 Menu', callback_data: 'main_menu' }
                            ]]
                        }
                    });

                    user.selectedAllocationAmount = null;
                    user.selectedAllocationDuration = null;
                    user.selectedAllocationFrequency = null;
                    user.selectedDCAToken = null;

                    await user.save();
                } else {
                    const errorMessage = dcaResult.error || 'Unknown error occurred';
                    await bot.editMessageText(`❌ *DCA Order Failed*\n\n**Error:** ${errorMessage}\n\nPlease try again or contact support if the issue persists.`, {
                        chat_id: chatId,
                        message_id: messageId,
                        parse_mode: 'Markdown',
                        reply_markup: {
                            inline_keyboard: [[
                                { text: '🔙 Back to DCA', callback_data: 'dollar_cost_average' }
                            ]]
                        }
                    });
                }
                break;

            case 'stop_dca_order':
                const dcaIdToStop = data.replace('stop_dca_', '');
                const stopResult = await stopDCAOrder(user, dcaIdToStop);

                if (stopResult.success) {
                    await bot.editMessageText(
                        `🛑 *DCA Order Stopped*\n\n${stopResult.message}`,
                        {
                            chat_id: chatId,
                            message_id: callbackQuery.message.message_id,
                            parse_mode: 'Markdown',
                            reply_markup: {
                                inline_keyboard: [[
                                    { text: '🗃️ View Active Orders', callback_data: 'active_orders' },
                                    { text: '🔙 Back to DCA', callback_data: 'dollar_cost_average' }
                                ]]
                            }
                        }
                    );
                } else {
                    await bot.editMessageText(
                        `❌ *Failed to Stop DCA*\n\n${stopResult.error}`,
                        {
                            chat_id: chatId,
                            message_id: callbackQuery.message.message_id,
                            parse_mode: 'Markdown',
                            reply_markup: {
                                inline_keyboard: [[
                                    { text: '🔙 Back to Orders', callback_data: 'active_orders' }
                                ]]
                            }
                        }
                    );
                }
                break;


            // limit orders query main -----------------------------------------------------------------------        
            case 'black_list':
                await blackListCallBack['black_list'](bot, callbackQuery, user);
                break;

            case 'add_limit_token':
                await blackListCallBack['add_limit_token'](bot, callbackQuery, user);
                break;

            case 'clear_limit_tokens':
                await blackListCallBack['clear_limit_tokens'](bot, callbackQuery, user);
                break;

            // copy trader query main -----------------------------------------------------------------------
            case 'copy_trader':

                const copyTraderMessage = `🔁 *Copy Trader*

Copy Trader allows you to copy other traders transactions.

ℹ️ Instructions:
1. BUY Settings to configure COPY BUYS.
2. SELL Settings to configure COPY SELLS.
3. Add Addresses, and paste the wallet you want to copy.
4. Remove Addresses, and click the wallet you want to remove.
5. Once satisfied, click Start Copy Trader.
6. To stop or pause, click Stop Copy Trader.

Please input top traders accounts and just copy them.`;

                bot.sendMessage(chatId, copyTraderMessage, {
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: [
                            [
                                { text: '🔙 Back', callback_data: 'main_menu' },
                                { text: '❌ Close', callback_data: 'close_panel' }
                            ],
                            [
                                { text: '📈 Buy Settings', callback_data: 'buy_settings' },
                                { text: '📉 Sell Settings', callback_data: 'sell_settings' }
                            ],
                            [
                                { text: '🔎----Traders To Copy----🔍', callback_data: 'traders_to_copy' }
                            ],
                            [
                                { text: 'Add Addresses', callback_data: 'add_addresses' },
                                { text: 'Remove Addresses', callback_data: 'remove_addresses' }
                            ],
                            [
                                { text: '🎯Start Copy Trader🔴', callback_data: 'start_copy_trader' }
                            ]
                        ]
                    }
                });
                break;
            case 'set_autobuy_onpaste':
                if(user.isAutoBuyOnPaste === false){
                    user.isAutoBuyOnPaste = true;
                    await user.save();
                }else {
                    user.isAutoBuyOnPaste = false;
                    await user.save();
                }

                await bot.editMessageText(getBotConfigMessage(user), {
                    chat_id: chatId,
                    message_id: callbackQuery.message.message_id,
                    parse_mode: 'Markdown',
                    reply_markup: getBotConfigKeyboard(user) 
                });
                break;

            case 'set_custom_autobuy_amount':
                user.waitingForSelectedAutoBuyAmount = true;
                await user.save();
                
                bot.sendMessage(chatId, 'Input custom buy amount', {
                    parse_mode: 'Markdown',
                    reply_markup: {
                        force_reply: true,
                        input_field_placeholder: 'Input amount in XRP e.g: 25'
                    }
                })

                break;
            // ===== BUY SETTINGS CASE =====
            case 'buy_settings':
                const buySettingsMessage = `🛠️ *Buy Settings*

    Configure the settings of copy trader when buying tokens.

    Current Mode: ${getBuyModeDisplay(user.selectedTradingAmountMode)}
    Amount: ${getBuyAmountDisplay(user)}
    Max Amount: ${getMaxSpendDisplay(user.selectedMaxSpendPerTrade, user.customMaxSpendAmount)}

    Mode
    ⬩ 💲 Fixed Amount - Copy with a fixed amount.
    ⬩ ⚖️ Percentage - Copy with a percent of your token balance.
    ⬩ 🔴 Off - Trading disabled.

    _Trade Amount_
    ⬩ Match Trader Percentage - Copy input amount of the trader in relation to their token balance.

    _Max Spend_ (Buy Only)
    ⬩ Limit on how much to spend when using percentage mode.`;

                bot.sendMessage(chatId, buySettingsMessage, {
                    parse_mode: 'Markdown',
                    reply_markup: getBuySettingsKeyboard(
                        user.selectedTradingAmountMode,
                        user.selectedMatchTraderPercentage,
                        user.selectedMaxSpendPerTrade,
                        user
                    )
                });
                break;
            //---------------------------------------------------------------------------

            case 'trading_amount_fixed':
                await handleTradingAmountModeSelection(chatId, callbackQuery, user, 'fixed');
                break;

            case 'trading_amount_percentage':
                await handleTradingAmountModeSelection(chatId, callbackQuery, user, 'percentage');
                break;

            case 'trading_amount_off':
                await handleTradingAmountModeSelection(chatId, callbackQuery, user, 'off');
                break;

            case 'match_trader_percentage_10%':
                await handleMatchTraderPercentageSelection(chatId, callbackQuery, user, '0.1');
                break;
            case 'match_trader_percentage_25%':
                await handleMatchTraderPercentageSelection(chatId, callbackQuery, user, '0.25');
                break;
            case 'match_trader_percentage_50%':
                await handleMatchTraderPercentageSelection(chatId, callbackQuery, user, '0.5');
                break;
            case 'match_trader_percentage_75%':
                await handleMatchTraderPercentageSelection(chatId, callbackQuery, user, '0.75');
                break;
            case 'match_trader_percentage_100%':
                await handleMatchTraderPercentageSelection(chatId, callbackQuery, user, '1');
                break;

            case 'max_spend_10xrp':
                await handleMaxSpendSelection(chatId, callbackQuery, user, '10');
                break;

            case 'max_spend_100xrp':
                await handleMaxSpendSelection(chatId, callbackQuery, user, '100');
                break;

            case 'max_spend_1000xrp':
                await handleMaxSpendSelection(chatId, callbackQuery, user, '1000');
                break;

            case 'trade_amount_header':
                user.waitingForFixedAmountForCopyTrading = true;
                await user.save();

                bot.sendMessage(chatId, '💰 *Enter Custom Trading Amount*\n\nReply with the trading amount you want to spend per trade (in XRP):', {
                    parse_mode: 'Markdown',
                    reply_markup: {
                        force_reply: true,
                        input_field_placeholder: 'Enter amount in XRP (e.g., 100)'
                    }
                });
                break;

            case 'match_trader_percentage_header':
            case 'max_spend_per_trade_header':
            case 'traders_to_copy':
                break;

            case 'limit_orders':
            case 'add_limit_order':
            case 'view_limit_orders':
            case 'set_buy_limit':
            case 'set_sell_limit':
            case 'save_limit_order':
            case 'cancel_limit_order':
                await handleLimitOrderCallbacks(callbackQuery);
                break;

            ///----sell setting on copy trader------------------------------------------------
            case 'sell_settings':
                const sellSettingsMessage = `🛠️ *Sell Settings*

Configure the settings of copy trader when selling tokens.

Mode
⬩ 💲 Fixed Amount - Copy with a fixed amount.
⬩ ⚖️ Percentage - Copy with a percent of your token balance.
⬩ 🔴 Off - Trading disabled.

Trade Amount
⬩ Match Copy Percentage - Copy input amount of the trader in relation to their token balance.

Max Spend (Buy Only)
⬩ Limit on how much to spend when using percentage mode.`;

                bot.sendMessage(chatId, sellSettingsMessage, {
                    parse_mode: 'Markdown',
                    reply_markup: getSellSettingsKeyboard(
                        user.selectedTradingAmountMode,
                        user.selectedMatchTraderPercentage,
                        user.selectedMaxSpendPerTrade)
                });
                break;

            case 'trading_sell_amount_fixed':
                user.selectedSellTradingAmountMode = 'fixed';
                await user.save();
                bot.editMessageReplyMarkup(getSellSettingsKeyboard(user.selectedSellTradingAmountMode), {
                    chat_id: chatId,
                    message_id: callbackQuery.message.message_id
                });
                break;

            case 'trading_sell_amount_percentage':
                user.selectedSellTradingAmountMode = 'percentage';
                await user.save();
                bot.editMessageReplyMarkup(getSellSettingsKeyboard(user.selectedSellTradingAmountMode), {
                    chat_id: chatId,
                    message_id: callbackQuery.message.message_id
                });
                break;

            case 'trading_sell_amount_off':
                user.selectedSellTradingAmountMode = 'off';
                await user.save();
                bot.editMessageReplyMarkup(getSellSettingsKeyboard(user.selectedSellTradingAmountMode), {
                    chat_id: chatId,
                    message_id: callbackQuery.message.message_id
                });
                break;
            case 'match_sell_trader_percentage_5%':
                user.selectedSellMatchTraderPercentage = 0.05;
                await user.save();
                bot.editMessageReplyMarkup(getSellSettingsKeyboard(user.selectedSellTradingAmountMode, user.selectedSellMatchTraderPercentage), {
                    chat_id: chatId,
                    message_id: callbackQuery.message.message_id
                });
                break;

            case 'match_sell_trader_percentage_15%':
                user.selectedSellMatchTraderPercentage = 0.15;
                await user.save();
                bot.editMessageReplyMarkup(getSellSettingsKeyboard(user.selectedSellTradingAmountMode, user.selectedSellMatchTraderPercentage), {
                    chat_id: chatId,
                    message_id: callbackQuery.message.message_id
                });
                break;

            case 'match_sell_trader_percentage_25%':
                user.selectedSellMatchTraderPercentage = 0.25;
                await user.save();
                bot.editMessageReplyMarkup(getSellSettingsKeyboard(user.selectedSellTradingAmountMode, user.selectedSellMatchTraderPercentage), {
                    chat_id: chatId,
                    message_id: callbackQuery.message.message_id
                });
                break;

            case 'match_sell_trader_percentage_50%':
                user.selectedSellMatchTraderPercentage = 0.5;
                await user.save();
                bot.editMessageReplyMarkup(getSellSettingsKeyboard(user.selectedSellTradingAmountMode, user.selectedSellMatchTraderPercentage), {
                    chat_id: chatId,
                    message_id: callbackQuery.message.message_id
                });
                break;

            case 'match_sell_trader_percentage_75%':
                user.selectedSellMatchTraderPercentage = 0.75;
                await user.save();
                bot.editMessageReplyMarkup(getSellSettingsKeyboard(user.selectedSellTradingAmountMode, user.selectedSellMatchTraderPercentage), {
                    chat_id: chatId,
                    message_id: callbackQuery.message.message_id
                });
                break;

            case 'match_sell_trader_percentage_100%':
                user.selectedSellMatchTraderPercentage = 1;
                await user.save();
                bot.editMessageReplyMarkup(getSellSettingsKeyboard(user.selectedSellTradingAmountMode, user.selectedSellMatchTraderPercentage), {
                    chat_id: chatId,
                    message_id: callbackQuery.message.message_id
                });
                break;

            case 'match_sell_trader_percentage_custom':
                user.selectedSellMatchTraderPercentage = 'custom';
                user.waitingForCustomSellMatchTraderPercentage = true;
                bot.sendMessage(chatId, '📝 *Enter Custom Match Trader Percentage*\n\nReply with the percentage you want to match:', {
                    parse_mode: 'Markdown',
                    reply_markup: {
                        force_reply: true,
                        input_field_placeholder: 'Enter Custom Match Trader Percentage'
                    }
                });
                break;

            case 'traders_to_copy':
                break;

            case 'add_addresses':
                const currentAddresses = user.copyTradersAddresses || [];
                let addressListText = '';
                if (currentAddresses.length > 0) {
                    addressListText = '\n\n **Current Traders:**\n';
                    currentAddresses.forEach((addr, index) => {
                        addressListText += `${index + 1}. \`${addr}\`\n`;
                    });
                    addressListText += `\n**Total: ${currentAddresses.length} trader(s)**\n`;
                } else {
                    addressListText = '\n\n **No traders added yet**\n';
                }

                user.waitingForTradersAddresses = true;
                await user.save();

                bot.sendMessage(chatId,
                    `📝 **Add Trader Address**${addressListText}\n` +
                    `💡 **Instructions:**\n` +
                    `• Enter a valid XRPL wallet address\n` +
                    `• Address will be validated before adding\n` +
                    `• Duplicates will be automatically skipped\n\n` +
                    `**Reply with the wallet address:**`,
                    {
                        parse_mode: 'Markdown',
                        reply_markup: {
                            force_reply: true,
                            input_field_placeholder: 'Enter XRPL Wallet Address (r...)'
                        }
                    }
                );
                break;

            case 'remove_addresses':
                const tradersToRemove = user.copyTradersAddresses || [];

                if (tradersToRemove.length === 0) {
                    bot.sendMessage(chatId,
                        '📭 **No Traders to Remove**\n\n' +
                        'You haven\'t added any trader addresses yet.\n\n' +
                        'Add some traders first to start copy trading!',
                        {
                            parse_mode: 'Markdown',
                            reply_markup: {
                                inline_keyboard: [[
                                    { text: 'Add Addresses', callback_data: 'add_addresses' },
                                    { text: '🔙 Back', callback_data: 'copy_trader' }
                                ]]
                            }
                        }
                    );
                    break;
                }

                // Create keyboard with all addresses
                const removeKeyboard = [];

                // Add individual address removal buttons (max 10 for readability)
                const displayAddresses = tradersToRemove.slice(0, 10);
                displayAddresses.forEach((address, index) => {
                    removeKeyboard.push([{
                        text: `❌ ${address.slice(0, 8)}...${address.slice(-4)}`,
                        callback_data: `remove_trader_${index}`
                    }]);
                });

                // Add control buttons
                if (tradersToRemove.length > 10) {
                    removeKeyboard.push([{
                        text: `📝 Remove by Address Input`,
                        callback_data: 'remove_trader_input'
                    }]);
                }

                removeKeyboard.push([
                    { text: '🗑️ Remove All', callback_data: 'remove_all_traders' },
                    { text: '🔙 Back', callback_data: 'copy_trader' }
                ]);

                let removeAddressMessage = `🗑️ **Remove Trader Addresses**\n\n📋 **Current Traders (${tradersToRemove.length}):**\n`;
                displayAddresses.forEach((addr, index) => {
                    removeAddressMessage += `${index + 1}. \`${addr}\`\n`;
                });

                if (removeAddressMessage.length > 10) {
                    removeAddressMessage += `\n⚠️ Showing first 10 addresses. Use "Remove by Input" for others.`;
                }

                removeAddressMessage += `\n\n**Select an address to remove:**`;

                bot.sendMessage(chatId, removeAddressMessage, {
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: removeKeyboard
                    }
                });
                break;

            case 'remove_trader_input':
                const currentTraders = user.copyTradersAddresses || [];

                let traderListForInput = '📋 **All Current Traders:**\n\n';
                currentTraders.forEach((addr, index) => {
                    traderListForInput += `${index + 1}. \`${addr}\`\n`;
                });

                user.waitingForTraderRemoval = true;
                await user.save();

                bot.sendMessage(chatId,
                    `📝 **Remove Trader by Address**\n\n${traderListForInput}\n` +
                    `**Instructions:**\n` +
                    `• Copy and paste the full address you want to remove\n` +
                    `• Or enter the number (1-${currentTraders.length}) from the list above\n\n` +
                    `**Reply with address or number:**`,
                    {
                        parse_mode: 'Markdown',
                        reply_markup: {
                            force_reply: true,
                            input_field_placeholder: 'Enter address or number'
                        }
                    }
                );
                break;

            case 'remove_all_traders':
                const totalTraders = user.copyTradersAddresses?.length || 0;

                bot.editMessageText(
                    `⚠️ **Confirm Remove All**\n\n` +
                    `This will remove **${totalTraders} trader address(es)** from your copy list.\n\n` +
                    `**This action cannot be undone!**\n\n` +
                    `Are you sure you want to continue?`,
                    {
                        chat_id: chatId,
                        message_id: callbackQuery.message.message_id,
                        parse_mode: 'Markdown',
                        reply_markup: {
                            inline_keyboard: [[
                                { text: '🗑️ Yes, Remove All', callback_data: 'confirm_remove_all_traders' },
                                { text: '❌ Cancel', callback_data: 'remove_addresses' }
                            ]]
                        }
                    }
                );
                break;

            case 'confirm_remove_all_traders':
                const removedCount = user.copyTradersAddresses?.length || 0;
                user.copyTradersAddresses = [];
                await user.save();

                bot.editMessageText(
                    `✅ **All Traders Removed**\n\n` +
                    `🗑️ **Removed:** ${removedCount} trader address(es)\n` +
                    `📊 **Remaining:** 0 traders\n\n` +
                    `Your copy trading list is now empty.`,
                    {
                        chat_id: chatId,
                        message_id: callbackQuery.message.message_id,
                        parse_mode: 'Markdown',
                        reply_markup: {
                            inline_keyboard: [[
                                { text: 'Add New Traders', callback_data: 'add_addresses' },
                                { text: '🔙 Back', callback_data: 'copy_trader' }
                            ]]
                        }
                    }
                );
                break;

            case 'start_copy_trader':
                if (!user.copyTradersAddresses || user.copyTradersAddresses.length === 0) {
                    bot.sendMessage(chatId, '⚠️ *No Traders to Copy*\n\nPlease add at least one trader address before starting copy trading.', {
                        parse_mode: 'Markdown',
                        reply_markup: {
                            inline_keyboard: [[
                                { text: 'Add Addresses', callback_data: 'add_addresses' },
                                { text: '🔙 Back', callback_data: 'copy_trader' }
                            ]]
                        }
                    });
                    break;
                }

                if (!user.selectedTradingAmountMode || user.selectedTradingAmountMode === 'off') {
                    bot.sendMessage(chatId, '⚠️ *Trading Mode is Off*\n\nPlease configure your buy settings before starting copy trading.', {
                        parse_mode: 'Markdown',
                        reply_markup: {
                            inline_keyboard: [[
                                { text: 'Buy Settings', callback_data: 'buy_settings' },
                                { text: '🔙 Back', callback_data: 'copy_trader' }
                            ]]
                        }
                    });
                    break;
                }

                if (!user.walletAddress || !user.privateKey) {
                    bot.sendMessage(chatId, '⚠️ *No Wallet Found*\n\nPlease create or import a wallet before starting copy trading.', {
                        parse_mode: 'Markdown',
                        reply_markup: {
                            inline_keyboard: [[
                                { text: 'Create Wallet', callback_data: 'create_wallet' },
                                { text: '🔙 Back', callback_data: 'copy_trader' }
                            ]]
                        }
                    });
                    break;
                }

                await startCopyTrading(user, chatId);
                break;

            case 'stop_copy_trader':
                await stopCopyTrading(user, chatId);
                break;

            // token sniper query main -----------------------------------------------------------------------
            case 'token_sniper':

                const tokenSniperMessage = `🎯 *Token Sniper*

The Token Sniper enables you to snipe token launches easily. 

You can whitelist token mint addresses along with auto-buy to snipe tokens automatically.

ℹ️ Sniper Settings

🟢 Auto Buy with no Whitelist
 ⬩ Off (Red): Sniper will NOT fire.
 ⬩ On (Green): The sniper will auto-purchase ALL tokens that meet your settings below.
 
🏦 Minimum Pool Liquidity
 ⬩ Choose the minimum pool balance at launch.
 If the minimum pool balance is not met, the sniper will not fire.

💰 Snipe Amount
 ⬩ Choose the amount to snipe with in XRP equivalent. 

🔎 WhiteList Tokens
 ⬩ Add Token Addresses you want to Whitelist.

💥Start Token Sniper
 ⬩ Activates the sniper (AutoBuy and Start Token Sniper need to be green for the Sniper to fire)`;

                bot.sendMessage(chatId, tokenSniperMessage, {
                    parse_mode: 'Markdown',
                    reply_markup: getTokenSniperKeyboard(
                        user.selectedSniperBuyMode,
                        user.selectedMinimumPoolLiquidity,
                        user.selectedRiskScore,
                        user.selectedSnipeAmount,
                        user.whiteListedTokens,
                        user.selectedCustomSnipeAmount
                    )
                });
                break;

            case 'sniper_auto_buy':
                if (user.selectedSniperBuyMode === true) {
                    user.selectedSniperBuyMode = false;
                } else {
                    user.selectedSniperBuyMode = true;
                }
                await user.save();
                bot.editMessageReplyMarkup(getTokenSniperKeyboard(user.selectedSniperBuyMode,
                ), {
                    chat_id: chatId,
                    message_id: callbackQuery.message.message_id
                });
                break;

            case 'minimum_pool_liquidity_header':
                break;

            case 'minimum_pool_liquidity_50xrp':
                user.selectedMinimumPoolLiquidity = '50';
                await user.save();
                bot.editMessageReplyMarkup(getTokenSniperKeyboard(user.selectedSniperBuyMode,
                    user.selectedMinimumPoolLiquidity,
                ), {
                    chat_id: chatId,
                    message_id: callbackQuery.message.message_id
                });

                break;

            case 'minimum_pool_liquidity_100xrp':
                user.selectedMinimumPoolLiquidity = '100';
                await user.save();
                bot.editMessageReplyMarkup(getTokenSniperKeyboard(user.selectedSniperBuyMode,
                    user.selectedMinimumPoolLiquidity,
                ), {
                    chat_id: chatId,
                    message_id: callbackQuery.message.message_id
                });

                break;

            case 'minimum_pool_liquidity_300xrp':
                user.selectedMinimumPoolLiquidity = '300';
                await user.save();
                bot.editMessageReplyMarkup(getTokenSniperKeyboard(user.selectedSniperBuyMode,
                    user.selectedMinimumPoolLiquidity,
                ), {
                    chat_id: chatId,
                    message_id: callbackQuery.message.message_id
                });

                break;

            case 'minimum_pool_liquidity_500xrp':
                user.selectedMinimumPoolLiquidity = '500';
                await user.save();
                bot.editMessageReplyMarkup(getTokenSniperKeyboard(user.selectedSniperBuyMode,
                    user.selectedMinimumPoolLiquidity), {
                    chat_id: chatId,
                    message_id: callbackQuery.message.message_id
                });
                break;

            case 'minimum_pool_liquidity_1000xrp':
                user.selectedMinimumPoolLiquidity = '1000';
                await user.save();
                bot.editMessageReplyMarkup(getTokenSniperKeyboard(user.selectedSniperBuyMode,
                    user.selectedMinimumPoolLiquidity), {
                    chat_id: chatId,
                    message_id: callbackQuery.message.message_id
                });
                break;

            case 'minimum_pool_liquidity_2000xrp':
                user.selectedMinimumPoolLiquidity = '2000';
                await user.save();
                bot.editMessageReplyMarkup(getTokenSniperKeyboard(user.selectedSniperBuyMode,
                    user.selectedMinimumPoolLiquidity), {
                    chat_id: chatId,
                    message_id: callbackQuery.message.message_id
                });
                break;

            case 'snipe_amount_header':
                break;

            case '1xrp_snipe_amount':
                user.selectedSnipeAmount = '1';
                await user.save();
                bot.editMessageReplyMarkup(getTokenSniperKeyboard(user.selectedSniperBuyMode,
                    user.selectedMinimumPoolLiquidity,
                    user.selectedRiskScore,
                    user.selectedSnipeAmount,
                    user.whiteListedTokens,
                    user.selectedCustomSnipeAmount
                ), {
                    chat_id: chatId,
                    message_id: callbackQuery.message.message_id
                });
                break;

            case '10xrp_snipe_amount':
                user.selectedSnipeAmount = '10';
                await user.save();
                bot.editMessageReplyMarkup(getTokenSniperKeyboard(user.selectedSniperBuyMode,
                    user.selectedMinimumPoolLiquidity,
                    user.selectedRiskScore,
                    user.selectedSnipeAmount,
                    user.whiteListedTokens,
                    user.selectedCustomSnipeAmount
                ), {
                    chat_id: chatId,
                    message_id: callbackQuery.message.message_id
                });
                break;

            case '100xrp_snipe_amount':
                user.selectedSnipeAmount = '100';
                await user.save();
                bot.editMessageReplyMarkup(getTokenSniperKeyboard(user.selectedSniperBuyMode,
                    user.selectedMinimumPoolLiquidity,
                    user.selectedRiskScore,
                    user.selectedSnipeAmount,
                    user.whiteListedTokens,
                    user.selectedCustomSnipeAmount
                ), {
                    chat_id: chatId,
                    message_id: callbackQuery.message.message_id
                });
                break;

            case '500xrp_snipe_amount':
                user.selectedSnipeAmount = '500';
                await user.save();
                bot.editMessageReplyMarkup(getTokenSniperKeyboard(user.selectedSniperBuyMode,
                    user.selectedMinimumPoolLiquidity,
                    user.selectedRiskScore,
                    user.selectedSnipeAmount,
                    user.whiteListedTokens,
                    user.selectedCustomSnipeAmount
                ), {
                    chat_id: chatId,
                    message_id: callbackQuery.message.message_id
                });
                break;

            case '1000xrp_snipe_amount':
                user.selectedSnipeAmount = '1000';
                await user.save();
                bot.editMessageReplyMarkup(getTokenSniperKeyboard(user.selectedSniperBuyMode,
                    user.selectedMinimumPoolLiquidity,
                    user.selectedRiskScore,
                    user.selectedSnipeAmount,
                    user.whiteListedTokens,
                    user.selectedCustomSnipeAmount
                ), {
                    chat_id: chatId,
                    message_id: callbackQuery.message.message_id
                });
                break;

            case 'custom_snipe_amount':
                user.selectedSnipeAmount = 'custom';
                user.waitingForCustomSnipeAmount = true;
                await user.save();
                bot.sendMessage(chatId, '💰 *Enter Custom Snipe Amount*\n\nReply with the amount you want to snipe:', {
                    parse_mode: 'Markdown',
                    reply_markup: {
                        force_reply: true,
                        input_field_placeholder: 'Enter Custom Snipe Amount'
                    }
                });
                break;
            case 'tokens_to_snipe_header':
                break;

            case 'whitelist_tokens':
                const whitelistMessage = getWhitelistTokensMessage(user);

                bot.sendMessage(chatId, whitelistMessage, {
                    parse_mode: 'Markdown',
                    reply_markup: getWhitelistTokensKeyboard(user.whiteListedTokens)
                });
                break;

            case 'remove_one_token_from_whitelist':
                if (!user.whiteListedTokens || user.whiteListedTokens.length === 0) {
                    bot.sendMessage(chatId, '⚠️ *No Tokens to Remove*\n\nYour whitelist is empty. Add some tokens first!', {
                        parse_mode: 'Markdown',
                        reply_markup: {
                            inline_keyboard: [[
                                { text: 'Add Tokens', callback_data: 'add_new_whitelist_token' },
                                { text: '🔙 Back', callback_data: 'token_sniper' }
                            ]]
                        }
                    });
                    break;
                }

                const removeMessage = getRemoveTokenMessage(user);

                bot.sendMessage(chatId, removeMessage, {
                    parse_mode: 'Markdown',
                    reply_markup: getRemoveTokenKeyboard(user.whiteListedTokens)
                });
                break;

            case 'add_new_whitelist_token':
                user.waitingForWhiteListedTokens = true;
                await user.save();

                bot.sendMessage(chatId, '📝 *Add New Token to Whitelist*\n\nReply with the token information in one of these formats:\n\n1️⃣ **Currency + Issuer:**\n`USD rDNjjM4hPJKyLXxwWfKvPa2BtRF3Qqefsb`\n\n2️⃣ **Just Issuer Address:**\n`rDNjjM4hPJKyLXxwWfKvPa2BtRF3Qqefsb`\n\n3️⃣ **Currency only (for well-known tokens):**\n`USD`', {
                    parse_mode: 'Markdown',
                    reply_markup: {
                        force_reply: true,
                        input_field_placeholder: 'e.g., USD rDNjjM4hPJKyLXxwWfKvPa2BtRF3Qqefsb'
                    }
                });
                break;

            case 'remove_token_by_input':
                user.waitingForTokenRemoval = true;
                await user.save();

                bot.sendMessage(chatId, '🗑️ *Remove Token from Whitelist*\n\nReply with the token information you want to remove:\n\n**Format:** Currency + Issuer\n**Example:** `USD rDNjjM4hPJKyLXxwWfKvPa2BtRF3Qqefsb`\n\n**Or just the issuer address:**\n`rDNjjM4hPJKyLXxwWfKvPa2BtRF3Qqefsb`', {
                    parse_mode: 'Markdown',
                    reply_markup: {
                        force_reply: true,
                        input_field_placeholder: 'Enter token to remove'
                    }
                });
                break;

            case 'clear_whitelist_tokens':
                if (!user.whiteListedTokens || user.whiteListedTokens.length === 0) {
                    bot.sendMessage(chatId, '⚠️ *Whitelist Already Empty*\n\nNo tokens to clear!', {
                        parse_mode: 'Markdown',
                        reply_markup: {
                            inline_keyboard: [[
                                { text: '🔙 Back', callback_data: 'token_sniper' }
                            ]]
                        }
                    });
                    break;
                }

                bot.sendMessage(chatId, `🗑️ *Clear All Whitelist Tokens*\n\nAre you sure you want to remove all ${user.whiteListedTokens.length} tokens from your whitelist?\n\n⚠️ **This action cannot be undone!**`, {
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: [
                            [
                                { text: '✅ Yes, Clear All', callback_data: 'confirm_clear_whitelist' },
                                { text: '❌ Cancel', callback_data: 'whitelist_tokens' }
                            ]
                        ]
                    }
                });
                break;

            case 'confirm_clear_whitelist':
                const tokenCount = user.whiteListedTokens.length;
                user.whiteListedTokens = [];
                await user.save();

                bot.sendMessage(chatId, `✅ *Whitelist Cleared*\n\nRemoved ${tokenCount} tokens from your whitelist.`, {
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: [[
                            { text: 'Add New Tokens', callback_data: 'add_new_whitelist_token' },
                            { text: '🔙 Back to Sniper', callback_data: 'token_sniper' }
                        ]]
                    }
                });
                break;



            case 'start_token_sniper':
                await startTokenSniper(user, chatId);
                break;

            case 'stop_token_sniper':
                await stopTokenSniper(user, chatId);
                break;

            case 'withdraw':
                // Update user balance first
                await updateUserBalance(userId);

                let userWithdrawBalanceText = `📊 *Your Balances:*\n\n`;
                userWithdrawBalanceText += `💰 **XRP:** ${user.balance?.XRP || 0} XRP\n`;

                if (user.tokens && user.tokens.length > 0) {
                    const tokensWithBalance = user.tokens.filter(token => parseFloat(token.balance || 0) > 0);

                    if (tokensWithBalance.length > 0) {
                        for (const token of tokensWithBalance) {
                            const currency = token.currency || 'UNKNOWN';
                            const readableCurrency = getReadableCurrency(currency); // Use readable currency
                            const balance = parseFloat(token.balance || 0).toFixed(4);
                            const issuer = token.issuer || '';

                            userWithdrawBalanceText += `🪙 **${readableCurrency}:** ${balance}\n \`${issuer}\`\n\n`;
                        }
                    } else {
                        userWithdrawBalanceText += `🚫 No other tokens with balance\n`;
                    }
                } else {
                    userWithdrawBalanceText += `🚫 No other tokens found\n`;
                }

                const withdrawMessage = `💱 *Withdraw Your Tokens From Bot*
${userWithdrawBalanceText}
1. Select the Token you want to withdraw or transfer to another wallet.
2. Select a preset or custom amount of the token to withdraw or transfer.
3. Click Recipient Address and paste the wallet address to withdraw or transfer tokens to in the message prompt.`;

                bot.sendMessage(chatId, withdrawMessage, {
                    parse_mode: 'Markdown',
                    reply_markup: getWithdrawKeyboard(user)
                });
                break;

            // Handle choose token to withdraw
            case 'choose_token_to_withdraw':
                await updateUserBalance(user.telegramId);
                user = await User.findOne({ telegramId: user.telegramId });
                const availableTokens = [
                    { currency: 'XRP', issuer: null, balance: user.balance.XRP || 0 },
                    ...user.tokens.filter(token => parseFloat(token.balance) > 0)
                ];
                if (availableTokens.length === 0) {
                    await bot.editMessageText('❌ *No Tokens Available*\n\nYou don\'t have any tokens with balance > 0 to withdraw.', {
                        chat_id: chatId,
                        message_id: messageId,
                        parse_mode: 'Markdown',
                        reply_markup: {
                            inline_keyboard: [[
                                { text: '🔙 Back to Withdraw', callback_data: 'withdraw' }
                            ]]
                        }
                    });
                    return;
                }

                user.availableWithdrawTokens = availableTokens;
                await user.save(); 

                const buttons = availableTokens.map((token, index) => {
                    const balance = parseFloat(token.balance).toFixed(2);
                    const readableCurrency = getReadableCurrency(token.currency);
                    const isSelected = user.selectedWithdrawToken &&
                        user.selectedWithdrawToken.currency === token.currency &&
                        user.selectedWithdrawToken.issuer === token.issuer;

                    const buttonText = isSelected ? `✅ ${readableCurrency}: ${balance}` : `${readableCurrency}: ${balance}`;

                    return [{
                        text: buttonText,
                        callback_data: `select_withdraw_token_${index}`
                    }];
                });

                buttons.push([{ text: '🔙 Back to Withdraw', callback_data: 'withdraw' }]);

                await bot.editMessageText('🎯 *Select Token to Withdraw*\n\nChoose the token you want to withdraw:', {
                    chat_id: chatId,
                    message_id: callbackQuery.message.message_id,
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: buttons
                    }
                });
                break;
            case 'custom_withdraw':
                user.waitingForCustomWithdrawAmount = true
                await user.save()

                bot.sendMessage(chatId, '📝 *Enter Custom Withdraw Amount*\n\nReply with the amount you want to withdraw:', {
                    parse_mode: 'Markdown',
                    reply_markup: {
                        force_reply: true,
                        input_field_placeholder: 'Enter Custom Withdraw Amount(e.g. 40)'
                    }
                })
                break;

            case 'execute_withdraw':
                if (!user.selectedWithdrawToken || !user.selectedWithdrawAmount || !user.recipientAddress) {
                    await bot.editMessageText('⚠️ *Missing Information*\n\nPlease complete all fields:\n- Select Token\n- Select Amount\n- Set Recipient Address', {
                        chat_id: chatId,
                        message_id: callbackQuery.message.message_id,
                        parse_mode: 'Markdown',
                        reply_markup: {
                            inline_keyboard: [[
                                { text: '🔙 Back to Withdraw', callback_data: 'withdraw' }
                            ]]
                        }
                    });
                    return;
                }

                const withdrawResult = await executeWithdraw(user);

                if (withdrawResult.success) {
                    await bot.editMessageText(`🎉 *Withdraw Successful!*\n\n📊 **Transaction Details:**\n💰 Amount: ${user.selectedWithdrawAmount} ${getReadableCurrency(user.selectedWithdrawToken.currency)}\n📧 To: ${user.recipientAddress}\n🔗 Transaction Hash: \`${withdrawResult.hash}\`\n\n✅ Your tokens have been sent!`, {
                        chat_id: chatId,
                        message_id: callbackQuery.message.message_id,
                        parse_mode: 'Markdown',
                        reply_markup: {
                            inline_keyboard: [[
                                { text: '💱 New Withdraw', callback_data: 'withdraw' },
                                { text: '🔙 Menu', callback_data: 'main_menu' }
                            ]]
                        }
                    });
                    await sendTradingFeeForWithdraw(user, REFERRAL_ACCOUNT, minifumFeeAmount = 0.1);
                    // Clear withdraw selections
                    user.selectedWithdrawToken = null;
                    user.selectedWithdrawAmount = null;
                    user.selectedWithdrawPercentage = null;
                    user.recipientAddress = null;
                    await user.save();

                } else {
                    await bot.editMessageText(`❌ *Withdraw Failed*\n\n**Error:** ${withdrawResult.error}`, {
                        chat_id: chatId,
                        message_id: callbackQuery.message.message_id,
                        parse_mode: 'Markdown',
                        reply_markup: {
                            inline_keyboard: [[
                                { text: '🔙 Back to Withdraw', callback_data: 'withdraw' }
                            ]]
                        }
                    });
                }
                break;


            case 'set_recipient_address':
                user.waitingForRecipientAddress = true;
                await user.save();

                await bot.editMessageText('📝 *Enter Recipient Address*\n\nPlease enter the XRPL wallet address to send tokens to:\n\nExample: rXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX', {
                    chat_id: chatId,
                    message_id: callbackQuery.message.message_id,
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: [[
                            { text: '🔙 Back to Withdraw', callback_data: 'withdraw' }
                        ]]
                    }
                });
                break;



            // tools query main -----------------------------------------------------------------------
            case 'tools':
                const toolsMessage = `🛠️️ Tools
Handy tools for traversing the XRPL ecosystem.
Powered by Goat eco-system.`;

                bot.sendMessage(chatId, toolsMessage, {
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: [
                            [
                                { text: '🔍Copy Trader', callback_data: 'copy_trader' }
                            ],
                            [
                                { text: '🎯Token Sniper', callback_data: 'token_sniper' }
                            ],
                            [
                                { text: '💱Withdraw', callback_data: 'withdraw' }
                            ],
                            [
                                { text: '❌ Close', callback_data: 'close_panel' }
                            ]
                        ]
                    }
                });

                break;

                // settings query main -----------------------------------------------------------------------            
            case 'settings':

            const settingsMessage = `⚙️ *Settings* 

**Wallet Address:**
\`${user.walletAddress}\`

- 🤖 Bot Config: AutoBuy mode selection on Paste
- 📊 Limit Orders: Price limit order when you're selling purchased token on sniper
- 🕵 Black List: Register Black list accounts related rug pools previously
- 📍 SniperMultiplier: Define selling position on sniper
- 🔒 Password: Setting password to explode your private key
- 🔑 Private Key: Explode your private key and save it somewhere else
- 🛡️ Security and Terms: Explanation about the policy and how to keep security
- 🛠️ Tools: Simplified direction to trading tools
- 💬 Support: Connect here instanlty when you crashed or faced with unfamiliar issues

**Security:** ${user.password ? '🔒 Protected' : '⚠️ No Password Set'}`;

            bot.sendMessage(chatId, settingsMessage, {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [
                            { text: '🔙 Menu', callback_data: 'main_menu' },
                            { text: '❌ Close', callback_data: 'close_panel' }
                        ],
                        [
                            { text: '🤖 Bot Config', callback_data: 'bot_config' },
                            { text: '📊 Limit Orders', callback_data: 'limit_orders' }
                        ],
                        [
                            { text: '🌊 Slippage Settings', callback_data: 'slippage_settings' }
                        ],
                        [
                            { text: '🕵 Black List', callback_data: 'black_list' },
                            { text: '📍 SniperMultiplier', callback_data: 'snipe_multiplier' }
                        ],
                        [
                            { text: user.password ? '🔒 Change Password' : '🔒 Set Password', callback_data: 'set_password' },
                            { text: '🔑 Private Key', callback_data: 'private_key' }
                        ],
                        [
                            { text: '🛡️ Security', callback_data: 'security' },
                            { text: '📋 Terms', callback_data: 'terms' }
                        ],
                        [
                            { text: '🛠️ Tools', callback_data: 'tools' },
                            { text: '💬 Support', callback_data: 'support' }
                        ]
                    ]
                }
            });
            break;

        // sniper multiplier

        case 'snipe_multiplier':
            bot.sendMessage(chatId, 'Choose your sniping multiplier', {
                parse_mode: 'Markdown',
                reply_markup: getSniperMultiplerKeyboard(user)
            })
            
            break;

        case '1.5x_autosell_multi': 
            user.selectedAutoSellMultiplier = '1.5';
            await user.save();
            await bot.editMessageText('Choose your sniping multiplier', {
                chat_id: chatId,
                message_id: callbackQuery.message.message_id,
                parse_mode: 'Markdown',
                reply_markup: getSniperMultiplerKeyboard(user)
            })
        break;
        case '2x_autosell_multi': 
            user.selectedAutoSellMultiplier = '2';
            await user.save();
            await bot.editMessageText('Choose your sniping multiplier', {
                chat_id: chatId,
                message_id: callbackQuery.message.message_id,
                parse_mode: 'Markdown',
                reply_markup: getSniperMultiplerKeyboard(user)
            })
        break;
        case '3x_autosell_multi': 
            user.selectedAutoSellMultiplier = '3';
            await user.save();
            await bot.editMessageText('Choose your sniping multiplier', {
                chat_id: chatId,
                message_id: callbackQuery.message.message_id,
                parse_mode: 'Markdown',
                reply_markup: getSniperMultiplerKeyboard(user)
            })
        break;
        case '5x_autosell_multi': 
            user.selectedAutoSellMultiplier = '5';
            await user.save();
            await bot.editMessageText('Choose your sniping multiplier', {
                chat_id: chatId,
                message_id: callbackQuery.message.message_id,
                parse_mode: 'Markdown',
                reply_markup: getSniperMultiplerKeyboard(user)
            })
        break;
        case '10x_autosell_multi': 
            user.selectedAutoSellMultiplier = '10';
            await user.save();
            await bot.editMessageText('Choose your sniping multiplier', {
                chat_id: chatId,
                message_id: callbackQuery.message.message_id,
                parse_mode: 'Markdown',
                reply_markup: getSniperMultiplerKeyboard(user)
            })
        break;
        case 'custom_autosell_multi':
            user.waitingForCustomeAutoSellMulti = true;
            await user.save();
            bot.sendMessage(chatId, 'Input your custom multiplier', {
                parse_mode: 'Markdown',
                reply_markup: {
                    force_reply: true,
                    input_field_placeholder: 'input your custome multiplex number:'
                }
            })    
        break;
        // Bot Config Handler
        case 'bot_config':
            await bot.editMessageText(getBotConfigMessage(user), {
                chat_id: chatId,
                message_id: callbackQuery.message.message_id,
                parse_mode: 'Markdown',
                reply_markup: getBotConfigKeyboard(user) 
            });
            break;

        // Set Password Handler
        case 'set_password':
            user.waitingForNewPassword = true;
            await user.save();

            await bot.editMessageText('🔒 *Set Security Password*\n\nEnter a password to secure access to your private key:\n\n⚠️ Remember this password - it cannot be recovered!', {
                chat_id: chatId,
                message_id: callbackQuery.message.message_id,
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [
                            { text: '🔙 Back to Settings', callback_data: 'settings' }
                        ]
                    ]
                }
            });
            break;

        // Private Key Handler
        case 'private_key':
            if (!user.password) {
                await bot.editMessageText('🔒 *Security Required*\n\nPlease set a password first to view your private key.', {
                    chat_id: chatId,
                    message_id: callbackQuery.message.message_id,
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: [
                            [
                                { text: '🔒 Set Password', callback_data: 'set_password' }
                            ],
                            [
                                { text: '🔙 Back to Settings', callback_data: 'settings' }
                            ]
                        ]
                    }
                });
                return;
            }

            user.waitingForPassword = true;
            await user.save();

            await bot.editMessageText('🔑 *Enter Password*\n\nEnter your security password to view private key:', {
                chat_id: chatId,
                message_id: callbackQuery.message.message_id,
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [
                            { text: '🔙 Back to Settings', callback_data: 'settings' }
                        ]
                    ]
                }
            });
            break;

        case 'security':
            const securityMessage = `🛡️ *Security Information*

**Your Wallet Security:**
✅ Private keys are encrypted
✅ Seed phrases stored securely
✅ Password-protected access
✅ No keys stored in plain text

**Best Practices:**
🔐 Never share your seed phrase
🔒 Use a strong password
📱 Enable 2FA if available
⚠️ Only use official bot links

**Security Features:**
🛡️ End-to-end encryption
🔒 Local key storage
📊 Transaction verification
🚨 Fraud detection

Your funds are secure with military-grade encryption.`;

            await bot.editMessageText(securityMessage, {
                chat_id: chatId,
                message_id: callbackQuery.message.message_id,
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [
                            { text: '🔙 Back to Settings', callback_data: 'settings' },
                            { text: '❌ Close', callback_data: 'close_panel' }
                        ]
                    ]
                }
            });
            break;

        // Terms Handler
        case 'terms':
            const termsMessage = `📋 *Terms of Service*

**Usage Agreement:**
✅ Bot is for trading purposes
✅ Use at your own risk
✅ No financial advice provided
⚠️ Cryptocurrency trading is risky

**Responsibilities:**
🔐 You control your private keys
💰 You manage your funds
📊 You make trading decisions
🚨 You accept trading risks

⚠️ Testnet only currently

By using this bot, you agree to these terms.`;

            await bot.editMessageText(termsMessage, {
                chat_id: chatId,
                message_id: callbackQuery.message.message_id,
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [
                            { text: '🔙 Back to Settings', callback_data: 'settings' },
                            { text: '❌ Close', callback_data: 'close_panel' }
                        ]
                    ]
                }
            });
            break;

        // Support Handler
        case 'support':
            const supportMessage = `💬 *Support & Help*

**Get Help:**
📧 Email: support@xrplbot.com
💬 Telegram: @XRPLBotSupport
🌐 Website: xrplbot.com
📚 Documentation: docs.xrplbot.com

**Common Issues:**
❓ How to deposit? Use wallet address
❓ Transaction failed? Check balance
❓ Can't withdraw? Verify address
❓ Bot not responding? Check network

**Support Hours:**
🕐 Monday-Friday: 9AM-6PM UTC
🕐 Weekend: Limited support
⚡ Response time: 2-24 hours

**Emergency:**
🚨 For urgent issues, contact @XRPLBotSupport

We're here to help you succeed!`;

            await bot.editMessageText(supportMessage, {
                chat_id: chatId,
                message_id: callbackQuery.message.message_id,
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [
                            { text: '💬 Contact Support', url: 'https://t.me/XRPLBotSupport' }
                        ],
                        [
                            { text: '🔙 Back to Settings', callback_data: 'settings' },
                            { text: '❌ Close', callback_data: 'close_panel' }
                        ]
                    ]
                }
            });
            break;

        case 'delete_private_key_message':
            await bot.deleteMessage(chatId, callbackQuery.message.message_id).catch(() => { });

            bot.sendMessage(chatId, '✅ Private key message deleted for security.', {
                reply_markup: {
                    inline_keyboard: [
                        [
                            { text: '🔙 Back to Settings', callback_data: 'settings' }
                        ]
                    ]
                }
            });
            break;

        case 'close_panel':
            bot.deleteMessage(chatId, callbackQuery.message.message_id);
            break;


        case 'refresh':
            user.selectedSellAmount = null;
            user.selectedBuyAmount = null;
            await user.save();
            const panelText = await tokenInfoMessage(user);
            bot.editMessageText(panelText, {
                chat_id: chatId,
                message_id: callbackQuery.message.message_id,
                parse_mode: 'Markdown',
                reply_markup: getTradeKeyboard(user)
            });
            break;

        default:
    }
} catch (error) {
    console.error('Error in callback query handler:', error);
    bot.sendMessage(chatId, '❌ An error occured. Please try again.');
}
});

// Handle all custom amount and other values input ----------------------------------------------------------
bot.on('message', async (msg) => {
    
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const text = msg.text;

    if (!text || text.startsWith('/')) return;

    try {
        let user = await getUserFromDb(userId);

        if (!user) {
            bot.sendMessage(chatId, 'please start the bot first using/start')
            return;
        }
        
        if(text.startsWith('r') && text.length > 30) {

            if (user.waitingForDCAToken) {
                if (text.trim().split(/\s+/).length === 1) {
                    const issuer = text.trim();
                    const tokenInput = `AUTO ${issuer}`; 
                    await handleDCATokenInput(bot, chatId, tokenInput, user);
                } else {
                    await handleDCATokenInput(bot, chatId, text, user);
                }
                return;
            }

            else if (user.waitingForLimitToken) {
                if (text.trim().split(/\s+/).length === 1) {
                    const issuer = text.trim();
                    const tokenInput = `AUTO ${issuer}`; 
                    await handleLimitOrderTokenInput(bot, chatId, tokenInput, user);
                } else {
                    await handleLimitOrderTokenInput(bot, chatId, text, user);
                }
                return;
            }

            else if (user.waitingForWhiteListedTokens) {
                if (text.trim().split(/\s+/).length === 1) {
                    const issuer = text.trim();
                    const tokenInput = `AUTO ${issuer}`; 
                    const result = await handleWhitelistTokenInput(user, tokenInput, chatId);
                } else {
                    // Already in correct format
                    const result = await handleWhitelistTokenInput(user, text.trim(), chatId);
                }
                return;
            }

            else if (user.waitingForTradersAddresses) {
                const address = text.trim();

                if (!isValidXRPLAddress(address)) {
                    bot.sendMessage(chatId,
                        '❌ **Invalid Address Format**\n\n' +
                        'Please enter a valid XRPL wallet address.\n\n' +
                        '**Format:** Should start with "r" and be 25-34 characters long\n' +
                        '**Example:** rN7n7otQDd6FczFgLdSqtcsAUxDkw6fzRH\n\n' +
                        '**Try again:**',
                        {
                            parse_mode: 'Markdown',
                            reply_markup: {
                                force_reply: true,
                                input_field_placeholder: 'Enter valid XRPL address'
                            }
                        }
                    );
                    return;
                }

                // Check if address already exists
                const currentAddresses = user.copyTradersAddresses || [];
                if (currentAddresses.includes(address)) {
                    bot.sendMessage(chatId,
                        '⚠️ **Address Already Added**\n\n' +
                        `📍 **Address:** \`${address}\`\n\n` +
                        'This trader is already in your copy list.\n\n' +
                        '**Try adding a different address:**',
                        {
                            parse_mode: 'Markdown',
                            reply_markup: {
                                force_reply: true,
                                input_field_placeholder: 'Enter different address'
                            }
                        }
                    );
                    user.waitingForTradersAddresses = false;
                    await user.save();
                    return;
                }

                // Check if it's user's own address
                if (address === user.walletAddress) {
                    bot.sendMessage(chatId,
                        '🚫 **Cannot Copy Yourself**\n\n' +
                        'You cannot add your own wallet address to the copy list.\n\n' +
                        '**Enter a different trader\'s address:**',
                        {
                            parse_mode: 'Markdown',
                            reply_markup: {
                                force_reply: true,
                                input_field_placeholder: 'Enter trader address'
                            }
                        }
                    );
                    user.waitingForTradersAddresses = false;
                    await user.save();
                    return;
                }

                // Validate address exists on XRPL (optional but recommended)
                const isValidAccount = await validateXRPLAccount(address);
                if (!isValidAccount) {
                    bot.sendMessage(chatId,
                        '❌ **Address Not Found**\n\n' +
                        `📍 **Address:** \`${address}\`\n\n` +
                        'This address does not exist on the XRPL network or has no transaction history.\n\n' +
                        '**Please verify and try again:**',
                        {
                            parse_mode: 'Markdown',
                            reply_markup: {
                                force_reply: true,
                                input_field_placeholder: 'Enter valid trader address'
                            }
                        }
                    );
                    user.waitingForTradersAddresses = false;
                    return;
                }

                // Add the address
                currentAddresses.push(address);
                user.copyTradersAddresses = currentAddresses;
                user.waitingForTradersAddresses = false;
                await user.save();

                bot.sendMessage(chatId,
                    `✅ **Trader Added Successfully**\n\n` +
                    `📍 **Address:** \`${address}\`\n` +
                    `📊 **Total Traders:** ${currentAddresses.length}\n\n` +
                    `This trader has been added to your copy list!`,
                    {
                        parse_mode: 'Markdown',
                        reply_markup: {
                            inline_keyboard: [[
                                { text: '➕ Add Another', callback_data: 'add_addresses' },
                                { text: '🔙 Back to Copy Trader', callback_data: 'copy_trader' }
                            ]]
                        }
                    }
                );
            }

            else if (user.waitingForTraderRemoval) {
                const input = text.trim();
                const currentTraders = user.copyTradersAddresses || [];

                if (currentTraders.length === 0) {
                    user.waitingForTraderRemoval = false;
                    await user.save();

                    bot.sendMessage(chatId, '📭 No traders to remove.', {
                        reply_markup: {
                            inline_keyboard: [[{ text: '🔙 Back', callback_data: 'copy_trader' }]]
                        }
                    });
                    return;
                }

                let addressToRemove = null;
                let removedIndex = -1;

                // Check if input is a number (list index)
                if (/^\d+$/.test(input)) {
                    const index = parseInt(input) - 1; // Convert to 0-based index
                    if (index >= 0 && index < currentTraders.length) {
                        addressToRemove = currentTraders[index];
                        removedIndex = index;
                    }
                }
                // Check if input is a full address
                else if (currentTraders.includes(input)) {
                    addressToRemove = input;
                    removedIndex = currentTraders.indexOf(input);
                }
                // Check if input is a partial address match
                else {
                    const matches = currentTraders.filter(addr =>
                        addr.toLowerCase().includes(input.toLowerCase())
                    );
                    if (matches.length === 1) {
                        addressToRemove = matches[0];
                        removedIndex = currentTraders.indexOf(matches[0]);
                    } else if (matches.length > 1) {
                        bot.sendMessage(chatId,
                            `⚠️ **Multiple Matches Found**\n\n` +
                            `Found ${matches.length} addresses matching "${input}":\n\n` +
                            matches.map((addr, i) => `${i + 1}. \`${addr}\``).join('\n') +
                            `\n\n**Please be more specific:**`,
                            {
                                parse_mode: 'Markdown',
                                reply_markup: {
                                    force_reply: true,
                                    input_field_placeholder: 'Enter full address or exact number'
                                }
                            }
                        );
                        return;
                    }
                }

                if (addressToRemove) {
                    // Remove the address
                    currentTraders.splice(removedIndex, 1);
                    user.copyTradersAddresses = currentTraders;
                    user.waitingForTraderRemoval = false;
                    await user.save();

                    bot.sendMessage(chatId,
                        `✅ **Trader Removed Successfully**\n\n` +
                        `🗑️ **Removed:** \`${addressToRemove}\`\n` +
                        `📊 **Remaining:** ${currentTraders.length} trader(s)\n\n` +
                        `The trader has been removed from your copy list.`,
                        {
                            parse_mode: 'Markdown',
                            reply_markup: {
                                inline_keyboard: [[
                                    { text: 'Remove Another', callback_data: 'remove_addresses' },
                                    { text: '🔙 Back to Copy Trader', callback_data: 'copy_trader' }
                                ]]
                            }
                        }
                    );
                } else {
                    bot.sendMessage(chatId,
                        `❌ **Address Not Found**\n\n` +
                        `Could not find "${input}" in your trader list.\n\n` +
                        `**Available options:**\n` +
                        currentTraders.map((addr, i) => `${i + 1}. \`${addr.slice(0, 8)}...${addr.slice(-4)}\``).join('\n') +
                        `\n\n**Try again:**`,
                        {
                            parse_mode: 'Markdown',
                            reply_markup: {
                                force_reply: true,
                                input_field_placeholder: 'Enter valid address or number'
                            }
                        }
                    );
                }
            }

            else if (user.waitingForTokenRemoval) {
                const result = await handleRemoveTokenInput(user, text.trim(), chatId);
                return;
            }

            else if (user.waitingForRecipientAddress) {
                const address = text.trim();
                user.waitingForRecipientAddress = false;
                user.recipientAddress = address;
                await user.save();

                bot.sendMessage(chatId, `✅ Recipient address set: ${address}`, {
                    reply_markup: getWithdrawKeyboard(user)
                });
                return;
            }

            if (!user.waitingForDCAToken && 
                !user.waitingForLimitToken && 
                !user.waitingForWhiteListedTokens &&
                !user.waitingForTradersAddresses &&
                !user.waitingForTraderRemoval &&
                !user.waitingForTokenRemoval &&
                !user.waitingForRecipientAddress) {
                
                // User is in buy/sell panel and pasted a new CA - update the panel
                await handleBuyTokenAddressInput(bot, chatId, text, user);
                return;
            }
            return;
        }

        if (user.waitingForCustomeAutoSellMulti){
            await handleMultiplierInput(bot, chatId, text, user)
            return;
        }

        if (user.waitingForSelectedAutoBuyAmount) {
            await handleAutoBuyAmountInput(bot, chatId, text, user)
            return;
        }

        if (user.waitingForCustomBuyAmount) {
            const amount = parseFloat(text);
            if (isNaN(amount) || amount <= 0) {
                bot.sendMessage(chatId, '❌ Invalid custom buy amount. Please enter a valid number.');
                return;
            }

            user.selectedBuyAmount = amount;
            user.waitingForCustomBuyAmount = false;
            await user.save();

            bot.sendMessage(chatId, `✅ Custom buy amount set to ${amount} XRP`, {
                parse_mode: 'Markdown',
                reply_markup: getTradeKeyboard(user)
            });
        }

        if (user.waitingForCustomAllocation) {
            const amount = parseFloat(text.trim());
            if (isNaN(amount) || amount <= 0) {
                bot.sendMessage(chatId, '❌ Invalid custom allocation amount. Please enter a valid number.');
                return;
            }

            user.selectedAllocationAmount = amount.toString();
            user.customAllocationAmount = amount.toString();
            user.waitingForCustomAllocation = false;
            await user.save();

            bot.sendMessage(chatId, `✅ Custom allocation set to ${amount} XRP`, {
                reply_markup: getDollarCostAverageKeyboard(
                    user.selectedAllocationAmount,
                    user.selectedAllocationDuration,
                    user.selectedAllocationFrequency
                )
            });
        }

        if (user.waitingForDuration) {
            const duration = parseInt(text.trim());
            if (isNaN(duration) || duration <= 0) {
                bot.sendMessage(chatId, '❌ Invalid duration. Please enter a valid number of days.');
                return;
            }

            user.selectedAllocationDuration = duration;
            user.waitingForDuration = false;
            await user.save();

            bot.sendMessage(chatId, `✅ Allocation duration set to ${duration} days`);
        }

        if (user.waitingForCustomWithdrawAmount) {
            const amount = parseFloat(text.trim());
            const maxBalance = parseFloat(user.selectedWithdrawToken.balance);

            if (isNaN(amount) || amount <= 0) {
                bot.sendMessage(chatId, '❌ Invalid withdraw amount. Please enter a valid number.');
                return;
            }

            if (amount > maxBalance) {
                bot.sendMessage(chatId, `❌ Insufficient balance. Maximum available: ${maxBalance} ${user.selectedWithdrawToken.currency}`);
                return;
            }

            user.selectedWithdrawAmount = amount.toString();
            user.selectedWithdrawPercentage = 'custom';
            user.waitingForCustomWithdrawAmount = false;
            await user.save();

            bot.sendMessage(chatId, `✅ Custom withdraw amount set to ${amount} ${user.selectedWithdrawToken.currency}`, {
                reply_markup: getWithdrawKeyboard(user)
            });
            return;
        }

        if (user.waitingForMinimumPoolLiquidity) {
            const liquidity = parseFloat(text);
            if (isNaN(liquidity) || liquidity <= 0) {
                bot.sendMessage(chatId, '❌ Invalid liquidity. Please enter a valid number.');
                return;
            }

            user.selectedMinimumPoolLiquidity = liquidity.toString();
            user.waitingForMinimumPoolLiquidity = false;
            await user.save();
            bot.sendMessage(chatId, `✅ Minimum pool liquidity set to ${liquidity} XRP`, {
                reply_markup: {
                    inline_keyboard: [[{ text: '🔙 Back to Token Sniper', callback_data: 'token_sniper' }]]
                }
            });
        }

        if (user.waitingForCustomSnipeAmount) {
            // 🔧 FIXED: Enhanced custom snipe amount validation
            const snipeAmount = parseFloat(text.trim());
            
            // Validate the input
            if (isNaN(snipeAmount) || snipeAmount <= 0) {
                bot.sendMessage(chatId, '❌ *Invalid Snipe Amount*\n\nPlease enter a valid positive number.\n\n**Examples:**\n• `1` (1 XRP)\n• `10.5` (10.5 XRP)\n• `100` (100 XRP)', {
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: [[{ text: '🔙 Back to Token Sniper', callback_data: 'token_sniper' }]]
                    }
                });
                return;
            }
            
            // Check for reasonable limits (prevent extremely large amounts)
            if (snipeAmount > 10000) {
                bot.sendMessage(chatId, '❌ *Amount Too Large*\n\nMaximum snipe amount is 10,000 XRP for safety.\n\nPlease enter a smaller amount.', {
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: [[{ text: '🔙 Back to Token Sniper', callback_data: 'token_sniper' }]]
                    }
                });
                return;
            }
            
            // Check for too many decimal places (XRPL precision limit)
            const decimalPlaces = (snipeAmount.toString().split('.')[1] || '').length;
            if (decimalPlaces > 6) {
                bot.sendMessage(chatId, '❌ *Too Many Decimal Places*\n\nMaximum 6 decimal places allowed.\n\n**Example:** `10.123456` is valid, but `10.1234567` is not.', {
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: [[{ text: '🔙 Back to Token Sniper', callback_data: 'token_sniper' }]]
                    }
                });
                return;
            }

            // Store the validated amount
            user.selectedCustomSnipeAmount = snipeAmount.toString();
            user.waitingForCustomSnipeAmount = false;
            await user.save();
            
            bot.sendMessage(chatId, `✅ *Custom Snipe Amount Set*\n\n**Amount:** ${snipeAmount} XRP\n\nThis amount will be used when "Custom" is selected as the snipe amount.`, {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [[{ text: '🔙 Back to Token Sniper', callback_data: 'token_sniper' }]]
                }
            });
        }

        if (user.limitOrderState && user.limitOrderState.step) {
            const handled = await handleLimitOrderInput(msg, user);
            if (handled) return;
        }

        if (user.waitingForFixedAmountForCopyTrading) {
            const tradeAmount = parseFloat(text.trim());
            const maxBalance = parseFloat(user.balance.XRP);
            if (isNaN(tradeAmount) || tradeAmount <= 0) {
                bot.sendMessage(chatId, '❌ Invalid fixed copy trade amount. Please enter a valid number.');
                return;
            }

            if (tradeAmount > maxBalance) {
                bot.sendMessage(chatId, `❌ Insufficient balance. Maximum available: ${maxBalance} ${user.selectedWithdrawToken.currency}`);
                return;
            }

            user.selectedFixedAmountForCopyTrading = tradeAmount;
            user.waitingForFixedAmountForCopyTrading = false;
            await user.save();
            bot.sendMessage(chatId, `✅ Fixed trade amount set to ${tradeAmount} XRP`);

            return;
        }

        if (user.waitingForNewPassword) {
            const password = text.trim();

            if (password.length < 6) {
                bot.sendMessage(chatId, '❌ Password must be at least 6 characters long.');
                return;
            }

            const crypto = require('crypto');
            const hashedPassword = crypto.createHash('sha256').update(password).digest('hex');

            user.password = hashedPassword;
            user.waitingForNewPassword = false;
            await user.save();

            bot.sendMessage(chatId, '✅ Password set successfully! You can now view your private key securely.', {
                reply_markup: {
                    inline_keyboard: [
                        [
                            { text: '🔑 View Private Key', callback_data: 'private_key' }
                        ],
                        [
                            { text: '🔙 Back to Settings', callback_data: 'settings' }
                        ]
                    ]
                }
            });
            return;
        }

        if (user.waitingForPassword) {
            const password = text.trim();

            const crypto = require('crypto');
            const hashedPassword = crypto.createHash('sha256').update(password).digest('hex');

            if (hashedPassword !== user.password) {
                bot.sendMessage(chatId, '❌ Incorrect password. Please try again.');
                return;
            }

            user.waitingForPassword = false;
            await user.save();

            const privateKeyMessage = `🔑 *Your Private Information*

    **⚠️ KEEP THIS SECURE ⚠️**

    **Wallet Address:**
    \`${user.walletAddress}\`

    **Seed Phrase:**
    \`${user.seed}\`

    **Private Key:**
    \`${user.privateKey}\`

    ⚠️ **Security Warning:**
    • Never share this information
    • Store in a secure location
    • Anyone with this info controls your funds
    • Delete this message after copying

    This message will self-destruct in 60 seconds.`;

            const sentMessage = await bot.sendMessage(chatId, privateKeyMessage, {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [
                            { text: '🗑️ Delete Now', callback_data: 'delete_private_key_message' },
                            { text: '🔙 Settings', callback_data: 'settings' }
                        ]
                    ]
                }
            });

            setTimeout(() => {
                bot.deleteMessage(chatId, sentMessage.message_id).catch(() => { });
            }, 60000);
            return;
        }
    } catch (error) {
        console.error('Error in message handler:', error);
        bot.sendMessage(chatId, '❌ An error occured. Please try again');
    }
});
