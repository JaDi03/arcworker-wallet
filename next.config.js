/** @type {import('next').NextConfig} */
const nextConfig = {
    reactStrictMode: true,
    async headers() {
        return [
            {
                source: '/(.*)',
                headers: [
                    {
                        key: 'Content-Security-Policy',
                        value: "default-src 'self'; script-src 'self' 'unsafe-eval' 'unsafe-inline' https://telegram.org https://oauth.telegram.org; style-src 'self' 'unsafe-inline'; img-src 'self' data: https: blob:; font-src 'self' data:; connect-src 'self' https: wss:; object-src 'none'; frame-src https://oauth.telegram.org;"
                    },
                    {
                        key: 'X-Frame-Options',
                        value: 'ALLOW-FROM https://web.telegram.org' // Start relaxed for TMA
                    }
                ],
            },
        ]
    },
}

module.exports = nextConfig
