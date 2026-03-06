"use client";

import { useState, useEffect } from "react";
import { TelegramProvider, useTelegram } from "@/components/providers/TelegramProvider";
import WalletConnect from "@/components/WalletConnect";
import WalletView, { Message } from "@/components/WalletView";
import DashboardHome from "@/components/DashboardHome";
import { Toaster } from "@/components/ui/toaster";
import { WalletSession } from "@/lib/wallet-sdk";

function AppContent() {
    const { webApp, user, isReady } = useTelegram();
    const [session, setSession] = useState<WalletSession | null>(null);
    const [view, setView] = useState<"dashboard" | "agent">("dashboard");
    const [userId, setUserId] = useState<string | null>(null);

    // Chat Persistence
    const [messages, setMessages] = useState<Message[]>([
        {
            id: "1",
            text: "Welcome to ArcWorker Wallet",
            sender: "agent",
            type: "text",
        },
        {
            id: "2",
            text: "I can help you manage your assets across chains. How can I assist you today?",
            sender: "agent",
            type: "text",
        },
    ]);

    const handleLoginSuccess = (sess: WalletSession) => {
        setSession(sess);
        setView("dashboard");
    };

    // === STEP 1: Derive userId AFTER component mounts ===
    // Read Telegram SDK directly from window (it's synchronous) instead of
    // relying on the TelegramProvider's useEffect which hasn't fired yet
    useEffect(() => {
        if (typeof window === 'undefined') return;

        const tg = (window as any).Telegram?.WebApp;
        const tgUser = tg?.initDataUnsafe?.user;

        if (tgUser?.id) {
            const tgId = `tg_${tgUser.id}`;
            console.log(`[Identity] Telegram user detected: ${tgId}`);
            setUserId(tgId);
        } else {
            // Browser fallback (local dev or direct URL access)
            let browserId = localStorage.getItem('wallet_user_id');
            if (!browserId) {
                browserId = `browser_${Math.random().toString(36).substring(2, 12)}`;
                localStorage.setItem('wallet_user_id', browserId);
            }
            console.log(`[Identity] Browser fallback: ${browserId}`);
            setUserId(browserId);
        }
    }, []);

    // === STEP 2: Auto-login AFTER userId is finalized ===
    useEffect(() => {
        if (!userId || session) return;

        let isMounted = true;

        const autoLogin = async () => {
            try {
                const response = await fetch('/api/wallet', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: 'getOrCreateWallet', userId }),
                });
                const data = await response.json();

                if (isMounted && (data.success || data.walletId)) {
                    const sess: WalletSession = {
                        address: data.address,
                        smartAccount: null,
                        bundlerClient: null,
                        credential: null
                    };
                    handleLoginSuccess(sess);
                }
            } catch (e) {
                if (isMounted) {
                    console.error("Auto-login failed:", e);
                }
            }
        };

        autoLogin();

        return () => {
            isMounted = false;
        };
    }, [userId, session]);

    const handleLogout = () => {
        setSession(null);
        setView("dashboard");
        setMessages([]); // Clear chat on logout
    };

    // === LOADING: Wait for userId to resolve before rendering anything ===
    if (!userId) {
        return (
            <main className="flex min-h-screen flex-col items-center justify-center bg-slate-50 dark:bg-slate-950">
                <div className="animate-pulse text-slate-500 dark:text-slate-400">Loading wallet...</div>
            </main>
        );
    }

    if (session) {
        if (view === "agent") {
            return (
                <WalletView
                    address={session.address}
                    session={session}
                    userId={userId}
                    onLogout={handleLogout}
                    onBack={() => setView("dashboard")}
                    messages={messages}
                    setMessages={setMessages}
                />
            );
        }
        return (
            <DashboardHome
                address={session.address}
                userId={userId}
                onNavigateToAgent={() => setView("agent")}
                onLogout={handleLogout}
            />
        );
    }

    return (
        <main className="flex min-h-screen flex-col items-center justify-start p-6 bg-slate-50 dark:bg-slate-950">
            <div className="z-10 w-full max-w-5xl items-center justify-between font-mono text-sm lg:flex mb-8">
                <div className="fixed left-0 top-0 flex w-full justify-center border-b border-slate-200 bg-white/80 pb-6 pt-8 backdrop-blur-2xl dark:border-slate-800 dark:bg-slate-950/80 lg:static lg:w-auto lg:rounded-xl lg:border lg:p-4">
                    <div className="flex items-center gap-3">
                        <img
                            src="/logo.png"
                            alt="ArcWorker Logo"
                            className="h-8 w-auto object-contain"
                            onError={(e) => {
                                e.currentTarget.style.display = 'none';
                                e.currentTarget.nextElementSibling?.classList.remove('hidden');
                            }}
                        />
                        <span className="hidden text-xl font-bold bg-gradient-to-r from-[#00E599] to-[#0052FF] bg-clip-text text-transparent">
                            ArcWorker Wallet
                        </span>
                    </div>
                </div>
            </div>
            <WalletConnect onConnect={handleLoginSuccess} userId={userId} />
        </main>
    );
}

export default function Home() {
    return (
        <TelegramProvider>
            <AppContent />
            <Toaster />
        </TelegramProvider>
    );
}
