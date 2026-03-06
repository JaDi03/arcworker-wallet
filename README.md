# ArcWorker Agent Wallet

A Telegram Mini App with an autonomous AI agent for cross-chain DeFi operations using Circle's infrastructure.

## 🎯 Features

- **Autonomous AI Agent**: Understands natural language and executes complex blockchain operations.
- **Multi-LLM Support**: Works with any OpenAI-compatible API (Google Gemini, ChatGPT, DeepSeek, Kimi, etc.) — just configure your API key in `.env`.
- **Cross-Chain Bridge**: USDC transfers via CCTP between Arc Testnet, Base Sepolia, and Ethereum Sepolia.
- **Smart Wallets**: Circle Developer-Controlled Wallets (SCA) with gas sponsoring.
- **Multi-Chain**: Supports multiple networks from a single interface.
- **Telegram Native**: Full integration with Telegram Mini Apps (TMA).

## 🏗️ Architecture

```
src/
├── agent/
│   ├── llm/            # Dynamic LLM adapters (Gemini, OpenAI, custom)
│   │   ├── factory.ts  # Auto-detects provider from .env
│   │   ├── geminiAdapter.ts
│   │   └── openaiAdapter.ts
│   ├── skills/         # Modular skill system
│   │   ├── core/       # Wallet operations
│   │   ├── cross-chain/# CCTP bridge
│   │   └── defi/       # DeFi integrations
│   └── prompts.ts      # Agent persona & instructions
├── app/                # Next.js app router
├── components/         # React UI components
└── lib/                # SDK wrappers (Circle, serverWallet)
```

## ✅ Implemented

- Autonomous AI agent with dynamic LLM provider support
- CCTP Bridge (Arc ↔ Base ↔ Ethereum)
- Circle Developer-Controlled Wallet creation (SCA)
- USDC token transfers
- Cross-chain balance queries
- Testnet faucet integration
- Natural language intent parsing

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 14, React, TypeScript, Tailwind CSS |
| AI | Google Gemini / OpenAI / Any OpenAI-compatible API |
| Wallets | Circle Programmable Wallets SDK (SCA) |
| Bridge | Circle CCTP |
| Deployment | Vercel / Local |

## 📦 Installation

```bash
git clone https://github.com/your-user/modular_wallet.git
cd modular_wallet
npm install
```

## 🔧 Configuration

Copy `.env.example` to `.env.local` and fill in your credentials:

```bash
cp .env.example .env.local
```

### Minimum required configuration:

```env
# --- LLM Provider (pick one) ---

# Option A: Google Gemini (free tier available)
GOOGLE_GENERATIVE_AI_API_KEY=your_gemini_api_key

# Option B: OpenAI
# OPENAI_API_KEY=your_openai_api_key

# Option C: DeepSeek / Kimi / other OpenAI-compatible APIs
# OPENAI_API_KEY=your_api_key
# OPENAI_BASE_URL=https://api.deepseek.com/v1
# OPENAI_MODEL=deepseek-chat

# --- Circle (required) ---
CIRCLE_API_KEY=your_circle_api_key
CIRCLE_ENTITY_SECRET=your_32_byte_entity_secret
NEXT_PUBLIC_CLIENT_KEY=your_circle_client_key
NEXT_PUBLIC_CLIENT_URL=https://modular-sdk.circle.com/v1/rpc/w3s/buidl

# --- App ---
NEXT_PUBLIC_URL=http://localhost:3000
```

> The system will **automatically detect** which LLM provider to use based on which API key is configured. No code changes needed.

## 🏃 Running Locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## 🤝 Contributing

This project is under active development. Contributions are welcome.

## 📄 License

MIT

---

> **Note**: This project is in active development and intended for testnet use. Do not use with real funds in production.
