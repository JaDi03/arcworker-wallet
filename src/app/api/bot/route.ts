import { NextResponse } from 'next/server';
import { getOrCreateWallet } from '@/lib/serverWallet';

// Vercel Edge/Serverless config - Allow up to 60s for wallet creation if needed
export const maxDuration = 60;

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const NEXT_PUBLIC_URL = process.env.NEXT_PUBLIC_URL || 'https://arcworker-wallet.vercel.app'; // Fallback to production URL

/**
 * Handle incoming Telegram Webhook updates
 * telegram api docs: https://core.telegram.org/bots/api#update
 */
export async function POST(req: Request) {
    if (!TELEGRAM_BOT_TOKEN) {
        console.error('[Telegram Webhook] Error: TELEGRAM_BOT_TOKEN is not defined');
        return NextResponse.json({ error: 'Bot token not configured' }, { status: 500 });
    }

    try {
        const body = await req.json();
        const message = body.message;

        // Only handle text messages (like /start)
        if (!message || !message.text) {
            return NextResponse.json({ success: true, message: 'Not a text message, ignoring.' });
        }

        const text = message.text.trim();
        const chatId = message.chat.id;
        // Telegram user IDs are numeric. We prefix them to create a unique standard user ID for our platform.
        const userId = `tg_${message.from.id}`;
        const username = message.from.username || message.from.first_name || 'User';

        console.log(`[Telegram Webhook] Received message "${text}" from ${username} (${userId})`);

        if (text.startsWith('/start')) {
            // 1. Send an initial "typing" action or immediate "Creating wallet..." message to acknowledge
            const welcomeMsg = `🤖 <b>Welcome to ArcWorker Wallet!</b>\nThe fastest infrastructure for Web3 operations.\n\n⏳ <i>Provisioning your Smart Wallet on Arc Testnet...</i>`;
            await sendTelegramMessage(chatId, welcomeMsg);

            // 2. Safely create or fetch the Circle developer-controlled wallet
            try {
                // Ensure the wallet exists before they even open the app
                const wallet = await getOrCreateWallet(userId, 'arcTestnet');
                console.log(`[Telegram Webhook] Wallet ensured for ${userId}: ${wallet.address}`);

                // 3. Send the final message with the Web App button
                const successMsg = `✅ <b>Smart Wallet Activated</b>\n\n👤 <b>User:</b> @${username}\n💳 <b>Address:</b> <code>${wallet.address}</code>\n⚡ <b>Network:</b> ARC Testnet\n\n👇 Click below to open and manage your assets:`;

                await sendTelegramMessageWithWebApp(
                    chatId,
                    successMsg,
                    NEXT_PUBLIC_URL
                );

            } catch (error: any) {
                console.error(`[Telegram Webhook] Failed to create wallet for ${userId}:`, error);
                await sendTelegramMessage(chatId, `⚠️ <b>Creation Error</b>\n\nSorry, we encountered a technical issue while provisioning your wallet. Please try again later.\n\n<i>Details: ${error.message}</i>`);
            }
        } else {
            // Unrecognized command
            await sendTelegramMessageWithWebApp(
                chatId,
                `🤖 <b>ArcWorker Bot</b>\n\nUse the /start command to view your profile, or directly open your wallet using the button below.👇`,
                NEXT_PUBLIC_URL
            );
        }

        return NextResponse.json({ success: true });

    } catch (error: any) {
        console.error('[Telegram Webhook] Internal Error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

/**
 * Helper function to send a standard text message back to the Telegram Chat
 */
async function sendTelegramMessage(chatId: number, text: string) {
    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: chatId,
                text: text,
                parse_mode: 'HTML'
            })
        });

        const data = await response.json();
        if (!data.ok) {
            console.error('[Telegram API Error]', data.description);
        }
    } catch (e) {
        console.error('[Telegram Fetch Error]', e);
    }
}

/**
 * Helper function to send a text message with an Inline Keyboard Button that opens a Telegram Web App
 */
async function sendTelegramMessageWithWebApp(chatId: number, text: string, webAppUrl: string) {
    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: chatId,
                text: text,
                parse_mode: 'HTML',
                reply_markup: {
                    inline_keyboard: [
                        [
                            {
                                text: "📱 Open ArcWallet",
                                web_app: {
                                    url: webAppUrl
                                }
                            }
                        ]
                    ]
                }
            })
        });

        const data = await response.json();
        if (!data.ok) {
            console.error('[Telegram API Error]', data.description);
        }
    } catch (e) {
        console.error('[Telegram Fetch Error]', e);
    }
}
