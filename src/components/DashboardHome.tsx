import React, { useState, useEffect } from "react";
import { Skeleton } from "@/components/ui/skeleton"; // Import Skeleton if available or create inline
import { useTelegram } from "@/components/providers/TelegramProvider";
import {
    Loader2, Send, ArrowDownLeft, RefreshCw, Wallet,
    Scan, Plus, ArrowUpRight, ArrowRightLeft, ArrowUpDown,
    ChevronDown, TrendingUp, History, Coins,
    Settings, ShieldCheck, Sparkles, MessageSquare, Sun, Moon
} from 'lucide-react';
import { AreaChart, Area, ResponsiveContainer, Tooltip } from 'recharts';
import { Button } from "@/components/ui/button";
import SendModal from "./SendModal";
import ReceiveModal from "./ReceiveModal";
import HistoryModal from "./HistoryModal";
import { getTokenColor, getTokenIcon } from "@/lib/tokenUI";

// -- Mock Data for Chart --
const CHART_DATA = [
    { name: 'Mon', value: 4000 },
    { name: 'Tue', value: 3000 },
    { name: 'Wed', value: 2000 },
    { name: 'Thu', value: 2780 },
    { name: 'Fri', value: 1890 },
    { name: 'Sat', value: 2390 },
    { name: 'Sun', value: 3490 },
];

interface DashboardHomeProps {
    address: string;
    userId: string;
    onNavigateToAgent: () => void;
    onLogout: () => void;
}

export default function DashboardHome({ address, userId, onNavigateToAgent, onLogout }: DashboardHomeProps) {
    const { user, theme, toggleTheme } = useTelegram();
    const [balance, setBalance] = useState<string>("0.00");
    const [arcBalance, setArcBalance] = useState<string>("0.00");
    const [tokens, setTokens] = useState<Array<{ symbol: string, name: string, balance: string, chain: string, address: string }>>([]);
    const [loading, setLoading] = useState(false);

    // Modal States
    const [isSendOpen, setIsSendOpen] = useState(false);
    const [isReceiveOpen, setIsReceiveOpen] = useState(false);
    const [isHistoryOpen, setIsHistoryOpen] = useState(false);

    // Real Balance Fetch from Autonomous Wallet
    const fetchBalance = async () => {
        setLoading(true);
        try {
            // Get wallet address first
            const walletResp = await fetch('/api/wallet', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'getOrCreateWallet',
                    userId: userId,
                    blockchain: 'arcTestnet'
                }),
            });
            const { address: walletAddress } = await walletResp.json();

            // Fetch all token balances across all supported chains via server API
            const response = await fetch('/api/wallet', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'getAllBalances',
                    userId: userId,
                    chains: ['arcTestnet', 'ethereumSepolia', 'baseSepolia']
                }),
            });
            const data = await response.json();
            const tokenBalances = data.balances || [];

            setTokens(tokenBalances);

            // Calculate total balance across all tokens
            const totalBalance = tokenBalances.reduce((acc: number, token: any) => {
                const val = parseFloat(token.balance);
                return acc + (isNaN(val) ? 0 : val);
            }, 0);

            // Find specific ARC Testnet balance
            const arcToken = tokenBalances.find((t: any) => t.chain.toLowerCase().includes('arc'));
            const specificArcBalance = arcToken ? parseFloat(arcToken.balance).toFixed(4) : "0.00";

            setBalance(totalBalance.toFixed(2));
            setArcBalance(specificArcBalance);
        } catch (error) {
            console.error("Balance fetch error:", error);
            setBalance("0.00");
            setArcBalance("0.00");
            setTokens([]);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchBalance();
    }, [address]);

    return (
        <div className="flex flex-col min-h-screen bg-background text-foreground font-sans overflow-hidden">
            {/* Modals */}
            <SendModal
                isOpen={isSendOpen}
                onClose={() => setIsSendOpen(false)}
                tokens={tokens}
                userId={userId}
                onSuccess={fetchBalance}
            />
            <ReceiveModal
                isOpen={isReceiveOpen}
                onClose={() => setIsReceiveOpen(false)}
                address={address}
            />
            <HistoryModal
                isOpen={isHistoryOpen}
                onClose={() => setIsHistoryOpen(false)}
                userId={userId}
            />

            {/* --- Top Header --- */}
            <header className="px-4 py-3 flex items-center justify-between sticky top-0 bg-background/80 backdrop-blur-xl z-20 border-b border-border">
                <div className="flex items-center gap-3">
                    {/* User Avatar */}
                    <div className="w-9 h-9 rounded-full overflow-hidden bg-muted ring-2 ring-primary/20 flex items-center justify-center shrink-0">
                        {user?.photo_url ? (
                            <img src={user.photo_url} alt="Profile" className="w-full h-full object-cover" />
                        ) : (
                            <span className="font-extrabold text-sm text-muted-foreground">{user?.first_name?.[0] || 'U'}</span>
                        )}
                    </div>

                    {/* Brand / Logo Area - Vertical Stack */}
                    <div className="flex flex-col items-start gap-1 -ml-1">
                        <img
                            src="/logo.png"
                            alt="ArcWorker"
                            width={64}
                            height={64}
                            className="h-16 w-auto object-contain block"
                            loading="eager"
                            onError={(e) => {
                                e.currentTarget.style.display = 'none';
                                e.currentTarget.nextElementSibling?.classList.remove('hidden');
                            }}
                        />
                        <span className="hidden text-xl font-black tracking-wide bg-gradient-to-r from-[#00E599] to-[#0052FF] bg-clip-text text-transparent">ArcWorker Wallet</span>

                        {/* Copy Address Button - Below Logo */}
                        <button
                            onClick={() => {
                                if (navigator.clipboard && address) {
                                    navigator.clipboard.writeText(address);
                                    const el = document.getElementById('copy-toast');
                                    if (el) { el.classList.remove('hidden'); setTimeout(() => el.classList.add('hidden'), 2000); }
                                }
                            }}
                            className="flex items-center gap-2 px-1 py-0.5 rounded-full hover:bg-muted/50 transition-all active:scale-95 group ml-1"
                            title="Copy Address"
                        >
                            <span className="text-[10px] text-muted-foreground font-mono group-hover:text-primary transition-colors">
                                {address.slice(0, 6)}...{address.slice(-4)}
                            </span>
                            <div className="text-muted-foreground group-hover:text-primary">
                                {/* Copy Icon (Two overlapped squares) */}
                                <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2" /><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" /></svg>
                            </div>
                        </button>
                    </div>
                </div>

                <div className="flex items-center gap-4">
                    <button
                        onClick={toggleTheme}
                        className="p-2 bg-muted/50 rounded-full hover:bg-muted transition-colors active:scale-90"
                        title="Toggle Theme"
                    >
                        {theme === 'dark' ? <Sun className="w-4 h-4 text-primary" /> : <Moon className="w-4 h-4 text-slate-500" />}
                    </button>
                    <div className="flex items-center bg-card rounded-full px-1 p-0.5 border border-border shadow-sm">
                        <span className="px-3 py-1 text-xs font-medium text-muted-foreground">Network</span>
                        <span className="px-3 py-1 text-xs font-bold bg-gradient-to-r from-[#00E599] to-[#0052FF] rounded-full text-white shadow-sm flex items-center gap-1">
                            ARC
                            <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse"></span>
                        </span>
                    </div>
                </div>
            </header>

            <main className="flex-1 overflow-y-auto pb-24 scrollbar-hide">
                {/* --- Chart Area (Modernized) --- */}
                {/* --- Total Balance Only (Clean) --- */}
                <div className="mt-8 flex flex-col items-center justify-center py-6">
                    <span className="text-muted-foreground text-xs font-medium uppercase tracking-widest mb-2">Total Balance</span>
                    <div className="flex items-center gap-3">
                        <h2 className="text-6xl font-black text-foreground tracking-tighter">
                            ${balance}
                        </h2>
                        <button onClick={fetchBalance} className="p-2 bg-muted/50 rounded-full hover:bg-muted transition-colors active:scale-90">
                            <RefreshCw className={`w-4 h-4 text-muted-foreground ${loading ? 'animate-spin' : ''}`} />
                        </button>
                    </div>
                    <span className="text-primary text-xs font-bold bg-primary/10 px-3 py-1 rounded-full mt-3 flex items-center gap-1">
                        USDC
                    </span>
                </div>

                {/* Quick Actions */}
                <div className="px-4 mb-8">
                    <div className="grid grid-cols-3 gap-3">
                        <button onClick={() => setIsSendOpen(true)} className="flex flex-col items-center justify-center gap-2 p-4 bg-card rounded-2xl border border-border hover:border-primary/50 transition-colors group shadow-sm">
                            <div className="w-12 h-12 rounded-full flex items-center justify-center bg-blue-500/10 text-blue-500 group-hover:scale-110 transition-transform">
                                <Send size={20} />
                            </div>
                            <span className="text-xs font-bold text-foreground">Send</span>
                        </button>

                        <button onClick={() => setIsReceiveOpen(true)} className="flex flex-col items-center justify-center gap-2 p-4 bg-card rounded-2xl border border-border hover:border-primary/50 transition-colors group shadow-sm">
                            <div className="w-12 h-12 rounded-full flex items-center justify-center bg-green-500/10 text-green-500 group-hover:scale-110 transition-transform">
                                <ArrowDownLeft size={20} />
                            </div>
                            <span className="text-xs font-bold text-foreground">Receive</span>
                        </button>

                        <button onClick={() => setIsHistoryOpen(true)} className="flex flex-col items-center justify-center gap-2 p-4 bg-card rounded-2xl border border-border hover:border-primary/50 transition-colors group shadow-sm relative overflow-hidden text-center">
                            <div className="w-12 h-12 rounded-full flex items-center justify-center bg-purple-500/10 text-purple-500 group-hover:scale-110 transition-transform">
                                <History size={20} />
                            </div>
                            <span className="text-xs font-bold text-foreground">History</span>
                        </button>
                    </div>
                </div>

                {/* --- AGENT CTA (Gradient Brand) --- */}
                <div className="px-6 mt-8">
                    <div className="relative group">
                        <div className="absolute -inset-0.5 bg-gradient-to-r from-[#00E599] to-[#0052FF] rounded-xl opacity-75 group-hover:opacity-100 transition duration-200 blur-[2px]"></div>
                        <Button
                            onClick={onNavigateToAgent}
                            className="relative w-full h-16 bg-card hover:bg-card/95 text-foreground rounded-xl flex items-center justify-between px-6 transition-all active:scale-[0.98] border border-transparent"
                        >
                            <div className="flex items-center gap-4">
                                <div className="p-2.5 bg-gradient-to-br from-[#00E599] to-[#0052FF] rounded-xl shadow-lg shadow-primary/20">
                                    <MessageSquare className="w-5 h-5 text-white" />
                                </div>
                                <div className="flex flex-col items-start gap-0.5">
                                    <span className="text-sm font-bold">Ask your Agent</span>
                                    <span className="text-[10px] text-muted-foreground">Transfers, Bridges, Yield & more</span>
                                </div>
                            </div>
                            <div className="p-1.5 bg-muted rounded-full">
                                <ArrowRightLeft className="w-4 h-4 text-muted-foreground" />
                            </div>
                        </Button>
                    </div>
                </div>

                {/* --- Asset List (Clean) --- */}
                <div className="mt-8 px-4">
                    <div className="flex items-center justify-between mb-4 px-2">
                        <span className="text-sm font-bold text-foreground">Your Assets</span>
                        <Settings className="w-4 h-4 text-muted-foreground" />
                    </div>

                    <div className="space-y-3">
                        {loading ? (
                            // Skeleton Loading State
                            Array(1).fill(0).map((_, i) => (
                                <div key={i} className="px-4 py-4 bg-card rounded-2xl flex items-center justify-between border border-border/30">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-full bg-muted animate-pulse" />
                                        <div className="space-y-2">
                                            <div className="h-4 w-12 bg-muted rounded animate-pulse" />
                                            <div className="h-3 w-20 bg-muted rounded animate-pulse" />
                                        </div>
                                    </div>
                                    <div className="space-y-2 items-end flex flex-col">
                                        <div className="h-4 w-16 bg-muted rounded animate-pulse" />
                                        <div className="h-3 w-8 bg-muted rounded animate-pulse" />
                                    </div>
                                </div>
                            ))
                        ) : tokens.length > 0 ? (
                            tokens.map((token) => {
                                const colorClass = getTokenColor(token.symbol);
                                const icon = getTokenIcon(token.symbol);

                                return (
                                    <div key={`${token.address}-${token.chain}`} className="px-4 py-4 bg-card rounded-2xl flex items-center justify-between hover:bg-muted/50 transition-colors border border-border/50 cursor-pointer shadow-sm">
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm bg-gradient-to-br from-slate-700 to-slate-900 shadow-inner">
                                                {icon}
                                            </div>
                                            <div>
                                                <h3 className="font-bold text-foreground text-sm">{token.symbol}</h3>
                                                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                                    <span>{token.name}</span>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <h3 className="font-bold text-foreground text-sm">{parseFloat(token.balance).toFixed(4)}</h3>
                                            <p className="text-xs text-muted-foreground">{token.chain}</p>
                                        </div>
                                    </div>
                                );
                            })
                        ) : (
                            <div className="px-4 py-8 text-center text-muted-foreground text-sm bg-muted/20 rounded-xl border border-dashed border-border">
                                No tokens found. Use the faucet to get USDC.
                            </div>
                        )}
                    </div>
                </div>
                <div id="copy-toast" className="hidden fixed bottom-24 left-1/2 transform -translate-x-1/2 bg-slate-800 text-white px-4 py-2 rounded-full text-xs font-bold shadow-lg z-50 animate-fade-in-up">
                    Address Copied!
                </div>
            </main>

            <div className="flex justify-center pb-8 pt-4">
                <button onClick={onLogout} className="text-xs text-muted-foreground hover:text-destructive transition-colors font-medium">Log Out</button>
            </div>
        </div>
    );
}
