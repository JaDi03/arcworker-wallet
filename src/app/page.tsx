"use client";

import { useState, useEffect } from "react";
import { TelegramProvider, useTelegram } from "@/components/providers/TelegramProvider";
import WalletConnect from "@/components/WalletConnect";
import WalletView, { Message } from "@/components/WalletView";
import DashboardHome from "@/components/DashboardHome";
import { Toaster } from "@/components/ui/toaster";
import { WalletSession } from "@/lib/wallet-sdk";

function AppContent() {
    const { webApp, user } = useTelegram();
    const [session, setSession] = useState<WalletSession | null>(null);
    const [view, setView] = useState<"dashboard" | "agent">("dashboard");

    // Browser-only mode - always use persistent browser userId
    // Need to check for window because this runs during SSR
    let finalUserId: string | null = null;
    
    if (typeof window !== 'undefined') {
        finalUserId = localStorage.getItem('wallet_user_id');
        
        if (!finalUserId) {
            finalUserId = `browser_${Math.random().toString(36).substring(2, 12)}`;
            localStorage.setItem('wallet_user_id', finalUserId);
        }
    } else {
        finalUserId = `server_${Date.now()}`;
    }

    const userId = finalUserId;

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

    // Check for session persistence
    useEffect(() => {
        // In a real app, you might check localStorage or a cookie here
        // But for Passkeys, usually you need to re-authenticate or keep token in memory
    }, []);

    const handleLoginSuccess = (sess: WalletSession) => {
        setSession(sess);
        setView("dashboard");
    };

    // Auto-Login for Demo (Bypass WalletConnect UI)
    useEffect(() => {
        if (!userId) return;
        
        let isMounted = true;
        
        const autoLogin = async () => {
            try {
                // Fetch autonomous wallet
                const response = await fetch('/api/wallet', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: 'getOrCreateWallet', userId }),
                });
                const data = await response.json();

                // Only update state if component is still mounted
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

        if (!session) {
            autoLogin();
        }
        
        return () => {
            isMounted = false;
        };
    }, [userId, session]);

    const handleLogout = () => {
        setSession(null);
        setView("dashboard");
        setMessages([]); // Clear chat on logout
    };

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
                        {/* Fallback Text if Image fails (and JS handles toggling) or just always show text next to logo? User asked for branding. */}
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
