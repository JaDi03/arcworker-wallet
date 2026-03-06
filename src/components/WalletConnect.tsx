"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, CheckCircle2, Wallet } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface WalletConnectProps {
    onConnect?: (session: any) => void;
    userId: string;
}

export default function WalletConnect({ onConnect, userId }: WalletConnectProps) {
    const [loading, setLoading] = useState(true);
    const [walletInfo, setWalletInfo] = useState<{ address: string; walletId: string } | null>(null);
    const { toast } = useToast();

    useEffect(() => {
        // Auto-connect to autonomous wallet on mount
        const connectAutonomousWallet = async () => {
            try {
                setLoading(true);

                // Call the server wallet API to get/create autonomous wallet
                const response = await fetch('/api/wallet', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: 'getOrCreateWallet', userId: userId }),
                });

                const data = await response.json();

                if (data.success || data.walletId) {
                    const info = {
                        address: data.address,
                        walletId: data.walletId,
                    };
                    setWalletInfo(info);

                    // Create a minimal session object for compatibility
                    const session = {
                        address: data.address,
                        smartAccount: null,
                        bundlerClient: null,
                    };

                    if (onConnect) {
                        onConnect(session);
                    }

                    toast({
                        title: "Wallet Connected",
                        description: `Address: ${data.address.slice(0, 6)}...${data.address.slice(-4)}`,
                    });
                } else {
                    throw new Error(data.error || 'Failed to connect wallet');
                }
            } catch (error: any) {
                console.error("Error connecting autonomous wallet:", error);
                toast({
                    title: "Connection Error",
                    description: error.message || "Could not connect to autonomous wallet",
                    variant: "destructive",
                });
            } finally {
                setLoading(false);
            }
        };

        connectAutonomousWallet();
    }, [onConnect, toast]);

    if (loading) {
        return (
            <Card className="w-full max-w-md mx-auto">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Loader2 className="h-5 w-5 animate-spin" />
                        Connecting to Autonomous Wallet
                    </CardTitle>
                    <CardDescription>
                        Loading agent wallet...
                    </CardDescription>
                </CardHeader>
            </Card>
        );
    }

    if (!walletInfo) {
        return (
            <Card className="w-full max-w-md mx-auto">
                <CardHeader>
                    <CardTitle className="text-destructive">Connection Error</CardTitle>
                    <CardDescription>
                        Could not load autonomous wallet
                    </CardDescription>
                </CardHeader>
            </Card>
        );
    }

    return (
        <Card className="w-full max-w-md mx-auto">
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <CheckCircle2 className="h-5 w-5 text-green-500" />
                    Autonomous Wallet Connected
                </CardTitle>
                <CardDescription>
                    Agent wallet (Developer-Controlled)
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="space-y-2">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Wallet className="h-4 w-4" />
                        <span>Address</span>
                    </div>
                    <div className="font-mono text-sm bg-muted p-3 rounded-md break-all">
                        {walletInfo.address}
                    </div>
                </div>
                <div className="space-y-2">
                    <div className="text-sm text-muted-foreground">Wallet ID</div>
                    <div className="font-mono text-xs bg-muted p-2 rounded-md break-all text-muted-foreground">
                        {walletInfo.walletId}
                    </div>
                </div>
                <div className="pt-4 border-t">
                    <p className="text-xs text-muted-foreground">
                        ✅ This wallet is controlled by the agent
                        <br />
                        🤖 No signature required for transactions
                    </p>
                </div>
            </CardContent>
        </Card>
    );
}
