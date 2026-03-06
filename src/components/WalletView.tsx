"use client";

import React, { useState, useEffect, useRef } from "react";
import { Send, Wallet, RefreshCw, Zap, ArrowRightLeft, Droplets, Sun, Moon } from "lucide-react";
import { useTelegram } from "@/components/providers/TelegramProvider";
import { motion, AnimatePresence } from "framer-motion";
import { sendTransfer } from "@/lib/wallet-sdk";
import { useToast } from "@/hooks/use-toast";
import { processUserIntent } from "@/agent/engine";
import { getTokenColor, getTokenIcon } from "@/lib/tokenUI";

export interface Message {
    id: string;
    text: string;
    sender: "user" | "agent";
    type: "text" | "action_card";
}

interface WalletViewProps {
    address: string;
    session: any; // Using any for simplicity here to avoid circular dep issues or complex imports
    userId: string;
    onLogout: () => void;
    onBack: () => void;
    messages: Message[];
    setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
}

// Helper to render text with Markdown-style links [text](url) and raw URLs
const LinkRenderer = ({ text }: { text: string }) => {
    // Regex for [label](url)
    const mdLinkRegex = /\[([^\]]+)\]\((https?:\/\/[^\)]+)\)/g;
    // Regex for raw URLs (fallback)
    const rawUrlRegex = /(https?:\/\/[^\s]+)/g;

    const parts = [];
    let lastIndex = 0;

    // We basically need to parse MD links first, then raw URLs in the text between?
    // Simplified approach: Split by MD links first.
    let match;
    while ((match = mdLinkRegex.exec(text)) !== null) {
        // Text before the match
        if (match.index > lastIndex) {
            parts.push(text.substring(lastIndex, match.index));
        }
        // The Link
        parts.push(
            <a key={match.index} href={match[2]} target="_blank" rel="noopener noreferrer" className="text-blue-400 underline break-all font-bold">
                {match[1]}
            </a>
        );
        lastIndex = mdLinkRegex.lastIndex;
    }
    // Remaining text
    if (lastIndex < text.length) {
        parts.push(text.substring(lastIndex));
    }

    // Now, we could (optionally) scan the text parts for raw URLs, 
    // but for now let's just return the parts, simpler for the specific request.
    return (
        <span className="break-words whitespace-pre-wrap">
            {parts.length > 0 ? parts : text}
        </span>
    );
};

import SendModal from "./SendModal";
import ReceiveModal from "./ReceiveModal";

export default function WalletView({ address, session, userId, onLogout, onBack, messages, setMessages }: WalletViewProps) {
    const { user, webApp, theme, toggleTheme } = useTelegram();
    const [balance, setBalance] = useState<string>("0.00");
    const [arcBalance, setArcBalance] = useState<string>("0.00");
    const [tokens, setTokens] = useState<Array<{ symbol: string, name: string, balance: string, chain: string, address: string }>>([]);
    const [loading, setLoading] = useState(false);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [activeTab, setActiveTab] = useState<'tokens' | 'nfts' | 'activity'>('tokens');
    const { toast } = useToast();

    // Modal States
    const [isSendOpen, setIsSendOpen] = useState(false);
    const [isReceiveOpen, setIsReceiveOpen] = useState(false);

    // Filter states
    const [hideSmallBalances, setHideSmallBalances] = useState(false);

    // Chat State
    const [input, setInput] = useState("");
    const [isTyping, setIsTyping] = useState(false);
    const [processingAction, setProcessingAction] = useState<"bridging" | "sending" | "swapping" | "thinking">("thinking"); // Fixed: Re-added missing state
    const messagesEndRef = useRef<HTMLDivElement>(null);

    // Auto-scroll
    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };
    useEffect(() => {
        scrollToBottom();
    }, [messages, isTyping]);

    useEffect(() => {
        if (webApp) {
            webApp.expand();
            // Suppress BackButton warning for web demo
            try {
                // Only try to show if it exists and version allows, otherwise ignore
                if (webApp.BackButton && webApp.version && parseFloat(webApp.version) >= 6.1) {
                    webApp.BackButton.show();
                    webApp.BackButton.onClick(onBack);
                }
            } catch (e) {
                // Ignore telegram errors for local demo
            }
        }

        return () => {
            try {
                if (webApp?.BackButton) {
                    webApp.BackButton.hide();
                    webApp.BackButton.offClick(onBack);
                }
            } catch (e) { }
        }
    }, [webApp, onBack]);

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

            // Fetch balances
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

    const handleSend = async (manualText?: string) => {
        const textToSend = manualText || input;
        if (!textToSend.trim()) return;

        // Detect intent for UX feedback
        const lowerText = textToSend.toLowerCase();
        if (lowerText.includes("bridge") || lowerText.includes("puente") || lowerText.includes("cross-chain") || lowerText.includes("optimism") || lowerText.includes("arbitrum") || lowerText.includes("mover a")) {
            setProcessingAction("bridging");
        } else if (lowerText.includes("send") || lowerText.includes("transfer") || lowerText.includes("enviar") || lowerText.includes("mover") || lowerText.includes("pagar")) {
            setProcessingAction("sending");
        } else if (lowerText.includes("swap") || lowerText.includes("buy") || lowerText.includes("sell") || lowerText.includes("comprar") || lowerText.includes("vender") || lowerText.includes("cambiar") || lowerText.includes("exchange")) {
            setProcessingAction("swapping");
        } else {
            setProcessingAction("thinking");
        }

        // 1. User Message
        const userMsg: Message = {
            id: Date.now().toString(),
            text: textToSend,
            sender: "user",
            type: "text",
        };
        setMessages((prev) => [...prev, userMsg]);
        setInput("");
        setIsTyping(true);

        // 2. Agent Logic
        try {
            const response = await processUserIntent(textToSend, address, session, messages, userId);

            setIsTyping(false);

            // Main Agent Response
            setMessages(prev => [...prev, {
                id: (Date.now() + 1).toString(),
                text: response.text,
                sender: "agent",
                type: "text"
            }]);

        } catch (error) {
            console.error(error);
            setIsTyping(false);
            setMessages(prev => [...prev, {
                id: Date.now().toString(),
                text: "I encountered an error processing that request.",
                sender: "agent",
                type: "text"
            }]);
        }
    };

    return (
        <div className="flex flex-col h-full bg-background text-foreground font-sans">
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

            {/* --- Simple Chat Header --- */}
            <div className="bg-background/80 dark:bg-background/80 backdrop-blur-xl border-b border-border p-4 py-3 sticky top-0 shadow-sm z-30 flex items-center gap-3">
                <button onClick={onBack} className="md:hidden p-1 -ml-1 text-slate-500">
                    {/* Fallback back button if Telegram BackButton fails */}
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
                </button>
                <div className="flex-1">
                    {/* Replaced Text with Logo Image */}
                    <div className="flex items-center gap-3">
                        <img
                            src="/logo.png"
                            alt="ArcWorker Wallet"
                            width={64}
                            height={64}
                            className="h-16 w-auto object-contain block" // Increased to h-16
                            loading="eager" // Preload
                            onError={(e) => {
                                // Fallback to text if image missing
                                e.currentTarget.style.display = 'none';
                                e.currentTarget.nextElementSibling?.classList.remove('hidden');
                            }}
                        />
                        <h3 className="hidden font-black text-xl bg-gradient-to-r from-[#00E599] to-[#0052FF] bg-clip-text text-transparent">
                            ArcWorker Wallet
                        </h3>
                    </div>

                    <div className="flex items-center gap-2 mt-0.5">
                        {/* <p className="text-[10px] text-green-500 flex items-center gap-1 font-medium">
                            <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></span>
                            Online
                        </p>
                        <span className="text-[10px] text-slate-300">|</span> */}

                        {/* Interactive Balance/Address Area with Copy */}
                        <button
                            onClick={() => {
                                if (navigator.clipboard && address) {
                                    navigator.clipboard.writeText(address);
                                    // Simple toast using existing toast hook or custom element if toast hook not available in this context
                                    // For consistency with Dashboard, we'll try to use the hook if available or just alert/console
                                    // But wait, we have useToast imported!
                                    toast({ title: "Address Copied", description: `${address.slice(0, 6)}...${address.slice(-4)} copied to clipboard.` });
                                }
                            }}
                            className="flex items-center gap-1.5 px-2 py-0.5 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer group"
                            title="Copy Address"
                        >
                            <p className="text-[10px] text-slate-500 dark:text-slate-400 font-mono group-hover:text-primary transition-colors">
                                {balance} USDC
                            </p>
                            <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-slate-400 group-hover:text-primary"><rect width="14" height="14" x="8" y="8" rx="2" ry="2" /><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" /></svg>
                        </button>
                    </div>
                </div>

                {/* Manual Actions in Header */}
                <div className="flex items-center gap-2">
                    <button
                        onClick={toggleTheme}
                        className="p-2 bg-slate-50 dark:bg-slate-900 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-primary"
                        title="Toggle Theme"
                    >
                        {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
                    </button>
                    <button
                        onClick={() => setIsSendOpen(true)}
                        className="p-2 bg-slate-50 dark:bg-slate-900 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-primary"
                        title="Send"
                    >
                        <Send size={18} />
                    </button>
                    <button
                        onClick={() => setIsReceiveOpen(true)}
                        className="p-2 bg-slate-50 dark:bg-slate-900 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-primary"
                        title="Receive"
                    >
                        <Droplets size={18} />
                    </button>
                </div>
            </div>

            {/* --- CHAT AREA --- */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 pb-4 scroll-smooth bg-background">
                <AnimatePresence>
                    {messages.map((msg) => (
                        <motion.div
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            key={msg.id}
                            className={`flex ${msg.sender === "user" ? "justify-end" : "justify-start"
                                }`}
                        >
                            <div
                                className={`max-w-[85%] p-3 rounded-2xl text-sm leading-relaxed shadow-sm ${msg.sender === "user"
                                    ? "bg-primary text-primary-foreground rounded-br-none"
                                    : "bg-card text-card-foreground rounded-bl-none border border-border"
                                    }`}
                            >
                                <LinkRenderer text={msg.text} />
                            </div>
                        </motion.div>
                    ))}
                </AnimatePresence>

                {isTyping && (
                    <div className="flex justify-start">
                        <div className="bg-white dark:bg-slate-800 p-3 rounded-2xl rounded-bl-none shadow-sm flex gap-3 items-center border border-slate-100 dark:border-slate-700 animate-pulse">

                            {/* Icon based on Action */}
                            {processingAction === "bridging" && (
                                <div className="p-2 bg-indigo-100 dark:bg-indigo-900/30 rounded-full text-indigo-500">
                                    <ArrowRightLeft className="w-4 h-4 animate-spin-slow" />
                                </div>
                            )}
                            {processingAction === "sending" && (
                                <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-full text-green-500">
                                    <Send className="w-4 h-4 -rotate-45" />
                                </div>
                            )}
                            {processingAction === "swapping" && (
                                <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-full text-purple-500">
                                    <RefreshCw className="w-4 h-4 animate-spin" />
                                </div>
                            )}

                            {/* Text or Dots */}
                            <div className="flex flex-col">
                                {processingAction === "bridging" ? (
                                    <>
                                        <span className="text-xs font-bold text-slate-700 dark:text-slate-200">Bridging Assets...</span>
                                        <span className="text-[10px] text-slate-400">Cross-chain swaps take ~2-5 mins. I'll notify you when ready.</span>
                                    </>
                                ) : processingAction === "sending" ? (
                                    <>
                                        <span className="text-xs font-bold text-slate-700 dark:text-slate-200">Processing Transfer...</span>
                                        <span className="text-[10px] text-slate-400">Sending funds securely.</span>
                                    </>
                                ) : processingAction === "swapping" ? (
                                    <>
                                        <span className="text-xs font-bold text-slate-700 dark:text-slate-200">Swapping Tokens...</span>
                                        <span className="text-[10px] text-slate-400">Interacting with Uniswap Pool.</span>
                                    </>
                                ) : (
                                    <div className="flex gap-1">
                                        <div className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce" />
                                        <div className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce delay-100" />
                                        <div className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce delay-200" />
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}
                <div ref={messagesEndRef} />
            </div>

            {/* --- INPUT AREA --- */}
            <div className="bg-background/80 dark:bg-background/80 border-t border-border p-4 pb-6 backdrop-blur-xl sticky bottom-0 z-20">
                <div className="relative flex items-center bg-muted/30 rounded-full px-4 py-2 border border-border focus-within:border-primary hover:border-primary/50 transition-colors shadow-inner">
                    <input
                        type="text"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && handleSend()}
                        placeholder="Type a command..."
                        className="flex-1 bg-transparent border-none outline-none text-sm text-slate-900 dark:text-white placeholder:text-slate-500 font-medium"
                        enterKeyHint="send"
                    />
                    <button
                        onClick={() => handleSend()}
                        className={`ml-2 p-2 rounded-full transition-all duration-200 ${input.trim()
                            ? "bg-primary text-primary-foreground scale-100 shadow-lg shadow-primary/30"
                            : "bg-muted text-muted-foreground scale-90"
                            }`}
                    >
                        <Send size={16} />
                    </button>
                </div>
                <div className="flex justify-center mt-2">
                    <button onClick={onLogout} className="text-[10px] text-slate-400 hover:text-red-400 transition-colors uppercase font-bold tracking-widest">
                        Log Out
                    </button>
                </div>
            </div>
        </div>
    );
}

function ActionButton({
    icon,
    label,
    onClick,
}: {
    icon: any;
    label: string;
    onClick: () => void;
}) {
    return (
        <button
            onClick={onClick}
            className="flex flex-col items-center gap-2 group"
        >
            <div className="w-12 h-12 rounded-2xl bg-slate-800 border border-slate-700 flex items-center justify-center text-indigo-400 group-hover:bg-slate-700 group-hover:text-white transition-all shadow-lg group-hover:shadow-indigo-500/20 active:scale-95">
                {icon}
            </div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide group-hover:text-slate-200 transition-colors">
                {label}
            </span>
        </button>
    );
}
