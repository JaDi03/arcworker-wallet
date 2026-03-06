
"use client";

import React, { useState } from "react";
import { X, Send, Loader2, CheckCircle2, AlertCircle, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { motion, AnimatePresence } from "framer-motion";

interface TokenInfo {
    symbol: string;
    name: string;
    balance: string;
    chain: string;
    address: string;
}

interface SendModalProps {
    isOpen: boolean;
    onClose: () => void;
    tokens: TokenInfo[];
    userId: string;
    onSuccess?: () => void;
}

export default function SendModal({ isOpen, onClose, tokens, userId, onSuccess }: SendModalProps) {
    const [address, setAddress] = useState("");
    const [amount, setAmount] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
    const [txHash, setTxHash] = useState("");
    const [errorMsg, setErrorMsg] = useState("");

    // Default to the first token if available
    const [selectedTokenIndex, setSelectedTokenIndex] = useState(0);

    const activeToken = tokens[selectedTokenIndex] || null;
    const balance = activeToken ? activeToken.balance : "0.00";

    const handleClose = () => {
        // Reset state when closing so it's fresh next time
        setTimeout(() => {
            setAddress("");
            setAmount("");
            setStatus("idle");
            setTxHash("");
            setErrorMsg("");
        }, 300); // Wait for exit animation
        onClose();
    };

    const handleSend = async () => {
        if (!address || !amount || !activeToken) return;
        setIsLoading(true);
        setStatus("loading");

        try {
            // Map the token chain to the expected internal network ID for the API
            const chainMap: Record<string, string> = {
                'Arc Testnet': 'arcTestnet',
                'ARC-TESTNET': 'arcTestnet',
                'Base Sepolia': 'baseSepolia',
                'BASE-SEPOLIA': 'baseSepolia',
                'Ethereum Sepolia': 'ethereumSepolia',
                'ETH-SEPOLIA': 'ethereumSepolia'
            };

            const internalChainId = chainMap[activeToken.chain] || activeToken.chain;

            // Get internal wallet first (using dynamic userId and the SELECTED blockchain)
            const walletResp = await fetch('/api/wallet', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'getOrCreateWallet', userId: userId, blockchain: internalChainId }),
            });
            const { walletId } = await walletResp.json();

            // Execute Transaction on the selected network
            const response = await fetch('/api/wallet', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'executeTransaction',
                    userId,
                    toAddress: address,
                    // Circle SDK expects human-readable decimal strings
                    amount: parseFloat(amount).toString(),
                    // Pass the specific token address for this chain from our balances array
                    // If it's a native token transfer, the address might be missing/'native', so we pass undefined
                    tokenAddress: activeToken.address !== 'native' && activeToken.address ? activeToken.address : undefined,
                    blockchain: internalChainId
                }),
            });

            const data = await response.json();

            if (data.success) {
                setStatus("success");
                setTxHash(data.txHash || "");
                if (onSuccess) onSuccess();
            } else {
                throw new Error(data.error || "Transaction failed");
            }
        } catch (error: any) {
            console.error("Manual Transfer Error:", error);
            setStatus("error");
            setErrorMsg(error.message || "Something went wrong");
        } finally {
            setIsLoading(false);
        }
    };

    if (!isOpen) return null;

    return (
        <AnimatePresence>
            <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-md">
                <motion.div
                    initial={{ y: "100%" }}
                    animate={{ y: 0 }}
                    exit={{ y: "100%" }}
                    className="w-full max-w-md bg-background dark:bg-card border-t sm:border border-border dark:border-border rounded-t-[32px] sm:rounded-[32px] overflow-hidden shadow-2xl shadow-primary/10"
                >
                    <div className="p-6">
                        <div className="flex items-center justify-between mb-8">
                            <h2 className="text-xl font-black text-foreground">Send USDC</h2>
                            <button onClick={handleClose} className="p-2 bg-muted/50 rounded-full hover:bg-muted text-muted-foreground transition-colors">
                                <X size={20} />
                            </button>
                        </div>

                        {status === "idle" || status === "loading" ? (
                            <div className="space-y-6">
                                {/* Network/Token Selector */}
                                <div>
                                    <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-2 block">Asset & Network</label>
                                    <div className="relative">
                                        <select
                                            value={selectedTokenIndex}
                                            onChange={(e) => setSelectedTokenIndex(Number(e.target.value))}
                                            className="w-full bg-muted/30 border border-border rounded-2xl p-4 text-foreground text-sm font-bold outline-none focus:border-primary transition-colors appearance-none cursor-pointer"
                                        >
                                            {tokens.length === 0 && <option value={0}>No assets available</option>}
                                            {tokens.map((t, idx) => (
                                                <option key={`${t.chain}-${t.symbol}-${idx}`} value={idx}>
                                                    {t.symbol} on {t.chain} ({parseFloat(t.balance).toFixed(4)})
                                                </option>
                                            ))}
                                        </select>
                                        <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-muted-foreground">
                                            <ChevronDown size={16} />
                                        </div>
                                    </div>
                                </div>

                                <div>
                                    <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-2 block">Recipient Address</label>
                                    <input
                                        type="text"
                                        placeholder="0x..."
                                        value={address}
                                        onChange={(e) => setAddress(e.target.value)}
                                        className="w-full bg-muted/30 border border-border rounded-2xl p-4 text-foreground text-sm outline-none focus:border-primary transition-colors font-mono"
                                    />
                                </div>

                                <div>
                                    <div className="flex justify-between items-end mb-2">
                                        <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest block">Amount</label>
                                        <span className="text-[10px] text-primary font-bold">Balance: {balance} {activeToken?.symbol || 'USDC'}</span>
                                    </div>
                                    <div className="relative">
                                        <input
                                            type="number"
                                            placeholder="0.00"
                                            value={amount}
                                            onChange={(e) => setAmount(e.target.value)}
                                            className="w-full bg-muted/30 border border-border rounded-2xl p-4 text-foreground text-2xl font-black outline-none focus:border-primary transition-colors"
                                        />
                                        <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center gap-2">
                                            <span className="text-xs font-bold text-slate-500 dark:text-gray-500">{activeToken?.symbol || 'USDC'}</span>
                                            <button
                                                onClick={() => setAmount(balance)}
                                                className="bg-blue-500/10 text-blue-600 dark:text-blue-400 text-[10px] font-black px-2 py-1 rounded-md hover:bg-blue-500/20 transition-colors"
                                            >
                                                MAX
                                            </button>
                                        </div>
                                    </div>
                                </div>

                                <Button
                                    onClick={handleSend}
                                    disabled={isLoading || !address || !amount}
                                    className="w-full h-14 bg-blue-600 hover:bg-blue-500 rounded-2xl text-white font-bold flex items-center justify-center gap-2 shadow-lg shadow-blue-500/20 active:scale-[0.98] transition-all disabled:opacity-50"
                                >
                                    {isLoading ? (
                                        <>
                                            <Loader2 size={18} className="animate-spin" />
                                            Sending...
                                        </>
                                    ) : (
                                        <>
                                            <Send size={18} />
                                            Send Now
                                        </>
                                    )}
                                </Button>
                            </div>
                        ) : status === "success" ? (
                            <div className="py-8 flex flex-col items-center text-center">
                                <div className="w-16 h-16 bg-green-500/20 rounded-full flex items-center justify-center text-green-500 mb-4 animate-bounce">
                                    <CheckCircle2 size={32} />
                                </div>
                                <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2">Transaction Sent!</h3>
                                <p className="text-slate-500 dark:text-gray-400 text-sm mb-6">Your tokens are on their way.</p>

                                {txHash && (
                                    <a
                                        href={`https://testnet.arcscan.app/tx/${txHash}`}
                                        target="_blank"
                                        className="text-blue-600 dark:text-blue-400 text-xs font-mono break-all mb-8 block hover:underline"
                                    >
                                        View: {txHash.slice(0, 20)}...
                                    </a>
                                )}

                                <Button onClick={handleClose} className="w-full bg-muted hover:bg-muted/80 text-foreground rounded-2xl h-12">
                                    Done
                                </Button>
                            </div>
                        ) : (
                            <div className="py-8 flex flex-col items-center text-center">
                                <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center text-red-500 mb-4">
                                    <AlertCircle size={32} />
                                </div>
                                <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2">Transfer Failed</h3>
                                <p className="text-slate-500 dark:text-gray-400 text-sm mb-6">{errorMsg}</p>

                                <Button onClick={() => setStatus("idle")} className="w-full bg-blue-600 hover:bg-blue-500 text-white rounded-2xl h-12">
                                    Try Again
                                </Button>
                            </div>
                        )}
                    </div>
                </motion.div>
            </div>
        </AnimatePresence>
    );
}
