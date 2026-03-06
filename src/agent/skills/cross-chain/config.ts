
// ==========================================
// CCTP V2 CONFIGURATION - CIRCLE MODULAR WALLETS
// Supports multiple testnets with Bridge/Native distinction
// ===================================

import { arcTestnet } from '@/lib/wallet-sdk';

export const CCTP_DOMAINS = {
    ARC_TESTNET: 26, // DEFINITIVE: Confirmed from @circle-fin/provider-cctp-v2
    ETH_SEPOLIA: 0,
    BASE_SEPOLIA: 6,
    ARBITRUM_SEPOLIA: 3,
    OPTIMISM_SEPOLIA: 2,
    AVALANCHE_FUJI: 1,
    POLYGON_AMOY: 7,
};

export const CCTP_CONFIG = {
    arcTestnet: {
        domain: 26,
        chainId: 5042002,
        name: "Arc Testnet",
        chain: arcTestnet,
        usdc: "0x3600000000000000000000000000000000000000",

        // Contracts V2 (Canonical as per Circle SDK)
        tokenMessenger: "0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA",
        messageTransmitter: "0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275",

        rpc: "https://rpc.testnet.arc.network",
        explorer: "https://testnet.arcscan.app",
        supportsModular: true,
        transportSuffix: "arcTestnet"
    },

    ethereumSepolia: {
        domain: 0,
        chainId: 11155111,
        name: "Ethereum Sepolia",
        tokenMessenger: "0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA",
        messageTransmitter: "0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275",
        usdc: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238",
        rpc: "https://sepolia.drpc.org",
        explorer: "https://sepolia.etherscan.io",
        supportsModular: true,
        transportSuffix: "ethereumSepolia"
    },

    baseSepolia: {
        domain: 6,
        chainId: 84532,
        name: "Base Sepolia",
        tokenMessenger: "0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA",
        messageTransmitter: "0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275",
        usdc: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
        rpc: "https://sepolia.base.org",
        explorer: "https://sepolia.basescan.org",
        supportsModular: true,
        transportSuffix: "baseSepolia"
    },

    arbitrumSepolia: {
        domain: 3,
        chainId: 421614,
        name: "Arbitrum Sepolia",
        tokenMessenger: "0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA",
        messageTransmitter: "0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275",
        usdc: "0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d",
        rpc: "https://sepolia-rollup.arbitrum.io/rpc",
        explorer: "https://sepolia.arbiscan.io",
        supportsModular: true,
        transportSuffix: "arbitrumSepolia"
    },

    optimismSepolia: {
        domain: 2,
        chainId: 11155420,
        name: "Optimism Sepolia",
        tokenMessenger: "0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA",
        messageTransmitter: "0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275",
        usdc: "0x5fd84259d66Cd46123540766Be93DFE6D43130D7",
        rpc: "https://sepolia.optimism.io",
        explorer: "https://sepolia-optimism.etherscan.io",
        supportsModular: true,
        transportSuffix: "optimismSepolia"
    },

    avalancheFuji: {
        domain: 1,
        chainId: 43113,
        name: "Avalanche Fuji",
        tokenMessenger: "0xeb08f243E5758508393d721db6EBbaD796440263", // Avalanche actually uses a different one sometimes in sandbox? Let's keep research or use 0x8FE6B
        messageTransmitter: "0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275",
        usdc: "0x5425890298aed601595a70AB815c96711a31Bc65",
        rpc: "https://api.avax-test.network/ext/bc/C/rpc",
        explorer: "https://testnet.snowtrace.io",
        supportsModular: true,
        transportSuffix: "avalancheFuji"
    },

    polygonAmoy: {
        domain: 7,
        chainId: 80002,
        name: "Polygon Amoy",
        tokenMessenger: "0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA",
        messageTransmitter: "0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275",
        usdc: "0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582",
        rpc: "https://rpc-amoy.polygon.technology",
        explorer: "https://amoy.polygonscan.com",
        supportsModular: true,
        transportSuffix: "polygonAmoy"
    }
} as const;

export const chainsToActivate = ["arcTestnet", "baseSepolia", "ethereumSepolia"];

export type SupportedChain = "arcTestnet" | "ethereumSepolia" | "baseSepolia" | "arbitrumSepolia" | "optimismSepolia" | "avalancheFuji" | "polygonAmoy";

// ABIs
export const TOKEN_MESSENGER_ABI = [
    {
        name: "depositForBurn",
        type: "function",
        stateMutability: "nonpayable",
        inputs: [
            { name: "amount", type: "uint256" },
            { name: "destinationDomain", type: "uint32" },
            { name: "mintRecipient", type: "bytes32" },
            { name: "burnToken", type: "address" },
            { name: "destinationCaller", type: "bytes32" },
            { name: "maxFee", type: "uint256" },
            { name: "minFinalityThreshold", type: "uint32" }
        ],
        outputs: [{ name: "nonce", type: "uint64" }]
    }
] as const;

export const MESSAGE_TRANSMITTER_ABI = [
    {
        name: "receiveMessage",
        type: "function",
        stateMutability: "nonpayable",
        inputs: [
            { name: "message", type: "bytes" },
            { name: "attestation", type: "bytes" }
        ],
        outputs: [{ name: "", type: "bool" }]
    },
    {
        name: "localDomain",
        type: "function",
        stateMutability: "view",
        inputs: [],
        outputs: [{ name: "", type: "uint32" }]
    }
] as const;

export const USDC_ABI = [
    {
        name: "approve",
        type: "function",
        stateMutability: "nonpayable",
        inputs: [{ name: "spender", type: "address" }, { name: "amount", type: "uint256" }],
        outputs: [{ name: "", type: "bool" }]
    },
    {
        name: "balanceOf",
        type: "function",
        stateMutability: "view",
        inputs: [{ name: "account", type: "address" }],
        outputs: [{ name: "", type: "uint256" }]
    },
    {
        name: "allowance",
        type: "function",
        stateMutability: "view",
        inputs: [{ name: "owner", type: "address" }, { name: "spender", type: "address" }],
        outputs: [{ name: "", type: "uint256" }]
    },
    {
        name: "transfer",
        type: "function",
        stateMutability: "nonpayable",
        inputs: [{ name: "to", type: "address" }, { name: "amount", type: "uint256" }],
        outputs: [{ name: "", type: "bool" }]
    }
] as const;
