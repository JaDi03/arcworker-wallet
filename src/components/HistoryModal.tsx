"use client";

import React, { useState, useEffect } from "react";
import { X, History, ExternalLink, ArrowUpRight, ArrowDownLeft, Loader2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface HistoryModalProps {
    isOpen: boolean;
    onClose: () => void;
    userId: string;
}

export default function HistoryModal({ isOpen, onClose, userId }: HistoryModalProps) {
    const [transactions, setTransactions] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [walletAddress, setWalletAddress] = useState<string>("");

    useEffect(() => {
        if (!isOpen) return;

        const fetchHistory = async () => {
            setIsLoading(true);
            setError(null);
            try {
                // Fetch history for Arc Testnet
                const res = await fetch('/api/wallet', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: 'getHistory', userId, blockchain: 'arcTestnet' })
                });
                const data = await res.json();
                if (data.success && data.history) {
                    setTransactions(data.history);
                    setWalletAddress(data.address?.toLowerCase() || "");
                } else {
                    setError("Could not load history");
                }
            } catch (err: any) {
                console.error("History fetch error:", err);
                setError(err.message || "Failed to load history");
            } finally {
                setIsLoading(false);
            }
        };

        fetchHistory();
    }, [isOpen, userId]);

    if (!isOpen) return null;

    const formatDate = (dateString: string) => {
        const d = new Date(dateString);
        return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    };

    return (
        <AnimatePresence>
            <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-md">
                <motion.div
                    initial={{ y: "100%" }}
                    animate={{ y: 0 }}
                    exit={{ y: "100%" }}
                    className="w-full max-w-md bg-background border-t sm:border border-border rounded-t-[32px] sm:rounded-[32px] overflow-hidden shadow-2xl h-[80vh] flex flex-col"
                >
                    <div className="p-6 pb-4 border-b border-border flex items-center justify-between shrink-0">
                        <div className="flex items-center gap-2 text-foreground">
                            <History size={20} className="text-primary" />
                            <h2 className="text-xl font-black">Activity</h2>
                        </div>
                        <button onClick={onClose} className="p-2 bg-muted/50 rounded-full hover:bg-muted text-muted-foreground transition-colors">
                            <X size={20} />
                        </button>
                    </div>

                    <div className="flex-1 overflow-y-auto p-4 space-y-3">
                        {isLoading ? (
                            <div className="flex flex-col items-center justify-center h-full text-muted-foreground space-y-3">
                                <Loader2 size={32} className="animate-spin text-primary" />
                                <p className="text-sm font-medium">Loading history...</p>
                            </div>
                        ) : error ? (
                            <div className="flex flex-col items-center justify-center h-full text-red-500">
                                <p className="text-sm font-bold">{error}</p>
                            </div>
                        ) : transactions.length === 0 ? (
                            <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                                <History size={48} className="mb-4 opacity-20" />
                                <p className="text-sm font-medium">No transactions found</p>
                            </div>
                        ) : (
                            transactions.map((tx: any) => {
                                // Default amount
                                let amountStr = "0.00";
                                if (tx.amounts && tx.amounts.length > 0) amountStr = tx.amounts[0];

                                const isContractExecution = tx.transactionType === 'CONTRACT_EXECUTION';

                                // Determine direction
                                const isSender = tx.sourceAddress?.toLowerCase() === walletAddress;
                                const isReceiver = tx.destinationAddress?.toLowerCase() === walletAddress;

                                // For basic transfers, skip if it's 0 amount without being a contract call
                                if (!isContractExecution && parseFloat(amountStr) === 0) return null;

                                let title = "Transfer";
                                let isOutbound = false;

                                if (isContractExecution) {
                                    title = "Smart Contract";
                                    isOutbound = true; // Typically you initiate it, so it's an outbound action
                                } else {
                                    if (isSender) {
                                        title = "Sent USDC";
                                        isOutbound = true;
                                    } else if (isReceiver) {
                                        title = "Received USDC";
                                        isOutbound = false;
                                    } else {
                                        // Related to wallet but unclear context
                                        title = tx.transactionType;
                                    }
                                }

                                return (
                                    <div key={tx.id} className="p-4 bg-card rounded-2xl border border-border flex items-center justify-between hover:border-primary/50 transition-colors group">
                                        <div className="flex items-center gap-3">
                                            <div className={`w-10 h-10 rounded-full flex items-center justify-center ${isContractExecution ? 'bg-purple-500/10 text-purple-500' : isOutbound ? 'bg-slate-500/10 text-slate-500' : 'bg-green-500/10 text-green-500'}`}>
                                                {isOutbound ? <ArrowUpRight size={18} /> : <ArrowDownLeft size={18} />}
                                            </div>
                                            <div>
                                                <p className="font-bold text-sm text-foreground capitalize">
                                                    {title}
                                                </p>
                                                <p className="text-xs text-muted-foreground font-mono">
                                                    {formatDate(tx.createDate)}
                                                </p>
                                                <div className="flex items-center gap-1 mt-1">
                                                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${tx.state === 'COMPLETE' ? 'bg-green-500/10 text-green-500' : tx.state === 'FAILED' ? 'bg-red-500/10 text-red-500' : 'bg-yellow-500/10 text-yellow-500'}`}>
                                                        {tx.state}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="flex flex-col items-end gap-2">
                                            {isContractExecution && parseFloat(amountStr) === 0 ? (
                                                <p className="font-black tracking-tight text-muted-foreground">Interact</p>
                                            ) : (
                                                <p className={`font-black tracking-tight ${isOutbound ? 'text-foreground' : 'text-green-500'}`}>
                                                    {isOutbound ? '-' : '+'}{amountStr} USDC
                                                </p>
                                            )}

                                            {tx.txHash && (
                                                <a
                                                    href={`https://testnet.arcscan.app/tx/${tx.txHash}`}
                                                    target="_blank"
                                                    className="p-1.5 bg-muted rounded-full text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                                                >
                                                    <ExternalLink size={14} />
                                                </a>
                                            )}
                                        </div>
                                    </div>
                                );
                            })
                        )}
                    </div>
                </motion.div>
            </div>
        </AnimatePresence>
    );
}
