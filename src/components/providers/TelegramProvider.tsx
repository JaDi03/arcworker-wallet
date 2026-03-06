"use client";

import React, { createContext, useContext, useEffect, useState } from "react";

interface TelegramUser {
    id: number;
    first_name: string;
    last_name?: string;
    username?: string;
    photo_url?: string;
}

interface TelegramContextType {
    webApp: any;
    user: TelegramUser | null;
    userId: string | null;
    isReady: boolean;
    theme: 'light' | 'dark';
    toggleTheme: () => void;
}

const TelegramContext = createContext<TelegramContextType>({
    webApp: null,
    user: null,
    userId: null,
    isReady: false,
    theme: 'light',
    toggleTheme: () => { },
});

export const TelegramProvider = ({ children }: { children: React.ReactNode }) => {
    const [webApp, setWebApp] = useState<any | null>(null);
    const [user, setUser] = useState<TelegramUser | null>(null);
    const [userId, setUserId] = useState<string | null>(null);
    const [isReady, setIsReady] = useState(false);
    const [theme, setTheme] = useState<'light' | 'dark'>('light');

    const toggleTheme = () => {
        const newTheme = theme === 'light' ? 'dark' : 'light';
        setTheme(newTheme);
        localStorage.setItem('wallet_theme', newTheme);
        if (newTheme === 'dark') {
            document.documentElement.classList.add('dark');
        } else {
            document.documentElement.classList.remove('dark');
        }
    };

    useEffect(() => {
        // Initial Theme Detection
        const savedTheme = localStorage.getItem('wallet_theme') as 'light' | 'dark' | null;

        // Ensure we explicitly wait until the window exists to extract the ID safely
        if (typeof window !== "undefined") {
            try {
                // If Telegram script loaded successfully from layout.tsx
                if ((window as any).Telegram?.WebApp) {
                    const tg = (window as any).Telegram.WebApp;
                    tg.ready();
                    setWebApp(tg);

                    const tgUser = tg.initDataUnsafe?.user;
                    setUser(tgUser || null);

                    if (tgUser?.id) {
                        setUserId(`tg_${tgUser.id}`);
                        console.log(`[TelegramProvider] Identified via Telegram: tg_${tgUser.id}`);
                    } else {
                        // Very edge case where SDK loads but user ID is stripped
                        let browserId = localStorage.getItem('wallet_user_id');
                        if (!browserId) {
                            browserId = `browser_${Math.random().toString(36).substring(2, 12)}`;
                            localStorage.setItem('wallet_user_id', browserId);
                        }
                        setUserId(browserId);
                        console.log(`[TelegramProvider] Identified via WebApp Fallback: ${browserId}`);
                    }

                    setIsReady(true);

                    // Theme Synchronization Logic
                    const updateTheme = () => {
                        // If user hasn't manually set a theme in this browser, follow TG
                        if (!savedTheme) {
                            const colorScheme = tg.colorScheme; // 'light' or 'dark'
                            setTheme(colorScheme);
                            if (colorScheme === 'dark') {
                                document.documentElement.classList.add('dark');
                            } else {
                                document.documentElement.classList.remove('dark');
                            }
                        } else {
                            setTheme(savedTheme);
                            if (savedTheme === 'dark') document.documentElement.classList.add('dark');
                        }
                    };

                    updateTheme();
                    tg.onEvent('themeChanged', updateTheme);
                    return () => tg.offEvent('themeChanged', updateTheme);

                } else {
                    // Script completely missing (local dev outside generic browser)
                    let browserId = localStorage.getItem('wallet_user_id');
                    if (!browserId) {
                        browserId = `browser_${Math.random().toString(36).substring(2, 12)}`;
                        localStorage.setItem('wallet_user_id', browserId);
                    }
                    setUserId(browserId);
                    setIsReady(true);
                    console.log(`[TelegramProvider] Identified via Local Dev: ${browserId}`);
                }
            } catch (error) {
                console.error("[TelegramProvider] Error initializing SDK:", error);
                // Last resort fallback
                let browserId = localStorage.getItem('wallet_user_id');
                if (!browserId) {
                    browserId = `browser_${Math.random().toString(36).substring(2, 12)}`;
                    localStorage.setItem('wallet_user_id', browserId);
                }
                setUserId(browserId);
                setIsReady(true);
            }
        }

        // Theme recovery for non-TG environments
        if (typeof window !== "undefined" && !(window as any).Telegram?.WebApp) {
            if (savedTheme) {
                setTheme(savedTheme);
                if (savedTheme === 'dark') document.documentElement.classList.add('dark');
            } else {
                const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
                if (mediaQuery.matches) {
                    setTheme('dark');
                    document.documentElement.classList.add('dark');
                }
            }
        }
    }, []);

    return (
        <TelegramContext.Provider value={{ webApp, user, userId, isReady, theme, toggleTheme }}>
            {children}
        </TelegramContext.Provider>
    );
};

export const useTelegram = () => useContext(TelegramContext);
