import React from 'react';

/**
 * Token UI Helpers
 * Utility functions for token display that are safe for client-side rendering
 */

export function getTokenColor(symbol: string): string {
    const colors: Record<string, string> = {
        'USDC': 'bg-blue-500', // Kept for fallback/bg color hints
        'WETH': 'bg-purple-500',
        'ETH': 'bg-indigo-500',
        'DAI': 'bg-yellow-500',
        'USDT': 'bg-green-500',
    };
    return colors[symbol] || 'bg-gray-500';
}

export function getTokenIcon(symbol: string): React.ReactNode {
    const s = symbol.toUpperCase();
    if (s === 'USDC') {
        return <img src="/usdc.png" alt="USDC" className="w-full h-full object-contain rounded-full" onError={(e) => { e.currentTarget.style.display = 'none'; }} />;
    }
    if (s === 'ETH' || s === 'WETH') {
        return <img src="/eth.png" alt={s} className="w-full h-full object-contain rounded-full" onError={(e) => { e.currentTarget.style.display = 'none'; }} />;
    }
    return <span className="text-xs font-bold">{symbol.charAt(0)}</span>;
}
