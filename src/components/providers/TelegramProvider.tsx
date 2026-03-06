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
    isReady: boolean;
    theme: 'light' | 'dark';
    toggleTheme: () => void;
}

const TelegramContext = createContext<TelegramContextType>({
    webApp: null,
    user: null,
    isReady: false,
    theme: 'light',
    toggleTheme: () => { },
});

export const TelegramProvider = ({ children }: { children: React.ReactNode }) => {
    const [webApp, setWebApp] = useState<any | null>(null);
    const [user, setUser] = useState<TelegramUser | null>(null);
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

        if (typeof window !== "undefined" && (window as any).Telegram?.WebApp) {
            const tg = (window as any).Telegram.WebApp;
            tg.ready();
            setWebApp(tg);
            setUser(tg.initDataUnsafe?.user || null);
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
            // Fallback for Local Development
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
        <TelegramContext.Provider value={{ webApp, user, isReady, theme, toggleTheme }}>
            {children}
        </TelegramContext.Provider>
    );
};

export const useTelegram = () => useContext(TelegramContext);
