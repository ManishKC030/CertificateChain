# CertiChain — Immutable Academic Proof

A full-stack decentralized application for issuing, verifying, and managing academic certificates on the **Ethereum blockchain** (Sepolia testnet) with **IPFS** (via Pinata) for decentralized document storage. Certificates are backed by **soulbound ERC-721 NFTs** that are permanently locked to the student's wallet.

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Smart Contracts](#smart-contracts)
3. [Frontend Application](#frontend-application)
4. [Complete Data Flow](#complete-data-flow)
5. [Deployed Addresses](#deployed-addresses)
6. [Tech Stack](#tech-stack)
7. [Project Structure](#project-structure)
8. [Setup & Installation](#setup--installation)
9. [Usage Guide](#usage-guide)
10. [Testing](#testing)
11. [Deployment](#deployment)
12. [Security Model](#security-model)

---

## Architecture Overview

CertiChain uses a **hybrid decentralized architecture**:

```
┌─────────────────────────────────────────────────────────┐
│                    Presentation Layer                     │
│              React + Vite + Tailwind CSS                  │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────────┐  │
│  │ Admin Panel │  │ Verification │  │ My Credentials │  │
│  │  (Issue)    │  │   Portal     │  │   (Badges)     │  │
│  └──────┬──────┘  └──────┬───────┘  └───────┬────────┘  │
│         │                │                  │           │
│         │    SHA-256     │                  │           │
│         │    CryptoJS    │                  │           │
│         └────────┬───────┘                  │           │
│                  │                          │           │
├──────────────────┼──────────────────────────┼───────────┤
│           Storage Layer (IPFS)              │           │
│         ┌──────────────────────┐            │           │
│         │   Pinata Cloud API   │            │           │
│         │  (File Pinning)      │            │           │
│         └──────────┬───────────┘            │           │
│                    │ CID                    │           │
├────────────────────┼────────────────────────┼───────────┤
│              Blockchain Layer (Ethereum)     │           │
│  ┌─────────────────────────┐                │           │
│  │ CertificateRegistry.sol │ ◄────hash──────┘           │
│  │   (On-chain Ledger)     │                            │
│  └────────────┬────────────┘                            │
│               │ verifyCertificate()                      │
│  ┌────────────▼────────────┐                            │
│  │     Sameer.sol          │                            │
│  │  (Soulbound ERC-721)    │                            │
│  └─────────────────────────┘                            │
└─────────────────────────────────────────────────────────┘
```

### Three Layers

1. **Presentation Layer** (React/Vite): Handles file hashing client-side via CryptoJS, role detection (admin vs public), and all UI interactions.

2. **Storage Layer** (IPFS/Pinata): Certificate documents (PDFs, images) are uploaded to IPFS via Pinata's API. The returned Content Identifier (CID) is stored on-chain as a pointer to the file.

3. **Blockchain Layer** (Solidity/Foundry): Two smart contracts form the backbone:
   - **CertificateRegistry** — The authoritative on-chain database of certificate metadata
   - **Sameer** — A soulbound NFT badge minted to the student after certificate issuance

---

## Smart Contracts

### CertificateRegistry.sol

The core data store. Located at `contract/src/CertificateRegistry.sol`.

**State:**
- `owner` — deployer, can manage admins and pause the contract
- `admins` — mapping of authorized issuer addresses
- `certificates` — mapping of `SHA256_hash → Certificate struct`
- `totalCertificates`, `totalAdmins`, `totalRevokedCertificates` — counters

**Certificate struct:**
```solidity
struct Certificate {
    string studentName;
    string registrationNumber;
    string course;
    string grade;
    string certificateHash;   // SHA-256 of the file
    string ipfsHash;          // IPFS CID from Pinata
    uint256 issuedAt;         // block.timestamp
    address issuer;           // admin who issued it
    bool revoked;             // soft-delete flag
}
```

**Key Functions:**

| Function | Access | Description |
|---|---|---|
| `issueCertificate(...)` | onlyAdmin, notPaused | Register a new certificate on-chain |
| `verifyCertificate(hash)` | public view | Check if a hash exists and is not revoked |
| `getCertificate(hash)` | public view | Return full certificate metadata |
| `revokeCertificate(hash)` | onlyAdmin | Mark a certificate as revoked |
| `addAdmin(addr)` / `removeAdmin(addr)` | onlyOwner | Manage authorized issuers |
| `pauseContract()` / `unpauseContract()` | onlyOwner | Emergency circuit breaker |

### Sameer.sol (Soulbound NFT)

An ERC-721 token called **"Certificate Badge" (CBADGE)**. Located at `contract/src/Sameer.sol`.

Key characteristics:
- **Soulbound**: The `_update()` function is overridden to revert on any transfer attempt after the initial mint. Once a badge is minted to a student, it can never be transferred, sold, or traded.
- **Registry-aware**: `mintCertificateNFT()` calls `ICertificateRegistry(registryAddress).verifyCertificate(certHash)` to ensure the certificate exists on-chain before minting.
- **Anti-double-mint**: A `minted` mapping prevents the same certificate hash from getting multiple NFTs.
- **Only owner** (same as the registry owner) can mint.

```solidity
function _update(address to, uint256 tokenId, address auth)
    internal override returns (address)
{
    address from = _ownerOf(tokenId);
    require(from == address(0), "Soulbound NFT: non-transferable");
    return super._update(to, tokenId, auth);
}
```

### Counter.sol

Default Foundry boilerplate (`contract/src/Counter.sol`). Not part of the core CertiChain functionality.

---

## Frontend Application

Located in `frontend/`. Built with React 19 + Vite 8 + Tailwind CSS 4 + Ethers.js 6.

### App.jsx (`frontend/src/App.jsx`)

The entire UI is a single-page application with these sections:

**Navbar:**
- Brand logo ("CertiChain")
- Role badge ("Admin" or "Public User") detected automatically from the connected wallet
- Tab navigation: **Verify** / **My Credentials** (with badge count)
- Theme toggle (light/dark)
- Wallet connect button (MetaMask via ethers `BrowserProvider`)

**Issuer Console** (visible only when the connected wallet is an admin):
- Form fields: Student Name, Registration ID, Course Title, Grade, Student Wallet Address
- File upload for the certificate document
- Auto-generates SHA-256 hash on file selection via `generateFileHash()`
- **"Issue & Mint NFT"** button that:
  1. Uploads the file to IPFS via Pinata → gets CID
  2. Calls `registry.issueCertificate(...)` — records metadata on-chain
  3. Calls `sameer.mintCertificateNFT(student, hash)` — mints soulbound NFT
- Shows result: hash, IPFS gateway link, and whether NFT minting succeeded

**Verification Portal** (right column, always visible):
- **Option 1**: Upload the original certificate file → auto-hashes it → queries blockchain
- **Option 2**: Paste a SHA-256 hash manually
- **"Verify Authenticity"** button → calls `verifyCertificate()` → displays metadata
- Results show: student name, reg no, course, grade, full SHA-256 hash, soulbound NFT status (minted/not minted), and a link to download the original from IPFS
- Works for **anyone** without wallet connection — use the "Verify" tab

**My Credentials** (visible when wallet is connected, replaces the left column for non-admins):
- Scans all `Transfer` events to the connected wallet's address
- For each token, fetches the associated certificate hash from the NFT contract, then fetches full metadata from the Registry
- Displays a list of earned badges with course name, student details, token ID, issue date, and links to Etherscan + IPFS

### Utility Modules (`frontend/src/utils/`)

**`hash.js`** — Two hashing functions:
- `generateFileHash(file)` — Reads file as ArrayBuffer, converts to CryptoJS WordArray, computes SHA-256
- `generateCertificateHash(jsonData)` — SHA-256 of JSON string

**`pinata.js`** — Two upload functions:
- `uploadFileToPinata(file, metadata)` — Uploads raw files to IPFS (POST /pinning/pinFileToIPFS)
- `uploadCertificateToPinata(data)` — Uploads JSON data to IPFS (POST /pinning/pinJSONToIPFS)
- Uses `VITE_PINATA_API_KEY` and `VITE_PINATA_API_SECRET` from `.env`

**`fetchCertificate.js`** — `fetchCertificateFromIPFS(cid)` — Simple GET request to `https://gateway.pinata.cloud/ipfs/{cid}`

### Styling (`frontend/src/index.css`)
- Tailwind CSS v4 with custom theme (`@theme` directive)
- High-contrast design with indigo primary, emerald accent
- Glassmorphism card styles
- Full light/dark mode support via CSS variables
- Custom utility classes: `.btn-primary`, `.btn-secondary`, `.input-field`, `.label-text`, `.glass-card`, `.role-badge`

---

## Complete Data Flow

### Issuance Flow (Admin → Student)

```
┌──────────┐     ┌──────────┐     ┌───────────┐     ┌──────────┐
│  Admin   │────►│  React   │────►│  Pinata   │────►│   IPFS   │
│  Wallet  │     │   App    │     │   API     │     │ Network  │
└────┬─────┘     └────┬─────┘     └───────────┘     └────┬─────┘
     │                 │                                  │
     │ 1. Connect      │ 2. Hash file (SHA-256)           │
     │                 │ 3. Upload to Pinata              │
     │                 │ 4. Get IPFS CID ◄────────────────┘
     │                 │
     │                 │ 5. issueCertificate(hash, CID, metadata...)
     │◄────────────────┤ 6. Transaction signed & sent
     │                 │
     │ 7. Confirm      │ 8. mintCertificateNFT(student, hash)
     │◄────────────────┤ 9. Confirm NFT mint
     │                 │
     ▼                 ▼
   Student now has:
   • On-chain record in Registry
   • Soulbound NFT badge in wallet
   • Original file on IPFS
```

### Verification Flow (Public Verifier)

```
┌──────────┐     ┌──────────┐     ┌───────────┐     ┌──────────┐
│ Verifier │────►│  React   │────►│  Chain    │────►│   IPFS   │
│          │     │   App    │     │ (Contract)│     │ Gateway  │
└────┬─────┘     └────┬─────┘     └───────────┘     └────┬─────┘
     │                 │                                  │
     │ Upload file OR  │ 1. Hash file (SHA-256)           │
     │ paste hash      │ 2. verifyCertificate(hash) ──────┤
     │                 │ 3. Returns true/false ◄──────────┘
     │                 │ 4. getCertificate(hash) ◄─────────┤
     │◄────────────────┤ 5. Returns full metadata ────────┘
     │                 │
     │                 │ 6. "Download Source" link
     │                 │    ───────────────────────────────►
     │◄────────────────┤ 7. Original file displayed ◄──────┘
     ▼
   Result: VALID or NOT FOUND
   Metadata: Student, Course, Grade, etc.
   Source: Original file from IPFS
```

---

## Deployed Addresses

| Contract | Address | Network |
|---|---|---|
| CertificateRegistry | `0x871086DA3fA39378DDaaae6c2CA79ec1bac5a92C` | Sepolia Testnet |
| Sameer (NFT) | `0x3ff7bF2CC03fa79eFd17F19FeeE03Dc0E0973dcA` | Sepolia Testnet |
| Deployer | `0xDB7cFC42D8c4B0cD425AB0A757d37A9b2549c7da` | Sepolia Testnet |

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend Framework | React 19, Vite 8 |
| Styling | Tailwind CSS 4 |
| Web3 Library | Ethers.js v6 |
| Smart Contracts | Solidity 0.8.27 |
| Contract Dev | Foundry (Forge + Cast + Anvil) |
| Decentralized Storage | IPFS via Pinata API |
| Wallet | MetaMask (BrowserProvider) |
| Hashing | CryptoJS (SHA-256) |

---

## Project Structure

```
CertificateChain/
├── frontend/                        # React frontend application
│   ├── public/
│   │   ├── favicon.svg
│   │   └── icons.svg
│   ├── src/
│   │   ├── abi/
│   │   │   ├── CertificateRegistry.json   # Contract ABI
│   │   │   └── Sameer.json                # NFT Contract ABI
│   │   ├── utils/
│   │   │   ├── hash.js                    # SHA-256 file hashing
│   │   │   ├── pinata.js                  # IPFS upload via Pinata
│   │   │   └── fetchCertificate.js        # IPFS gateway fetcher
│   │   ├── assets/                        # Images
│   │   ├── App.jsx                        # Main application
│   │   ├── contract.js                    # Contract config fallback
│   │   ├── index.css                      # Tailwind + theme
│   │   └── main.jsx                       # Entry point
│   ├── index.html
│   ├── vite.config.js
│   ├── eslint.config.js
│   ├── package.json
│   └── .env                               # Pinata API keys (ignored in git)
│
├── contract/                         # Foundry smart contract project
│   ├── src/
│   │   ├── CertificateRegistry.sol   # Core certificate registry
│   │   ├── Sameer.sol                # Soulbound ERC-721 NFT
│   │   └── Counter.sol               # Boilerplate (unused)
│   ├── test/
│   │   ├── CertificateRegistry.t.sol # Registry unit tests
│   │   └── Sameer.t.sol              # NFT unit tests
│   ├── script/
│   │   ├── DeploySameer.s.sol        # NFT deployment script
│   │   └── Counter.s.sol             # Boilerplate
│   ├── broadcast/
│   │   └── DeploySameer.s.sol/
│   │       └── 11155111/             # Sepolia deployment receipts
│   ├── lib/forge-std/                # Foundry standard library
│   ├── foundry.toml                  # Foundry config
│   └── foundry.lock
│
├── README.md                         # Original README (outdated)
├── README-DETAILED.md                # This file
└── .gitignore
```

---

## Setup & Installation

### Prerequisites

- Node.js v18+
- Foundry (for contract development) — `curl -L https://foundry.paradigm.xyz | bash && foundryup`
- MetaMask browser extension
- Pinata account (free tier) — https://pinata.cloud

### Environment

Create `frontend/.env`:

```env
VITE_PINATA_API_KEY=your_pinata_api_key
VITE_PINATA_API_SECRET=your_pinata_api_secret
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Opens at `http://localhost:5173`.

### Smart Contracts

```bash
cd contract
forge build       # Compile contracts
forge test        # Run tests
```

---

## Usage Guide

### For Administrators (Issuers)

1. **Connect your wallet** via MetaMask (must be an authorized admin address)
2. The **Issuer Console** appears automatically on the left
3. Fill in: Student Name, Registration ID, Course, Grade, Student's Wallet Address
4. Upload the certificate document (PDF, image, etc.)
5. Click **"Issue & Mint NFT"**
6. Confirm two MetaMask transactions (one for Registry, one for NFT)
7. The student's certificate is now:
   - Recorded immutably on Ethereum
   - Backed by a soulbound NFT in their wallet
   - Stored permanently on IPFS

### For Students (Credential Holders)

1. Connect your wallet
2. Click the **"My Credentials"** tab
3. All your issued badges appear with full details
4. Click **"Explorer"** to view the NFT on Etherscan
5. Click **"IPFS"** to view/download the original certificate

### For Verifiers (Anyone, No Wallet Needed)

1. Click the **"Verify"** tab (default)
2. Choose one:
   - **Upload the original file** — the app computes its SHA-256 hash automatically
   - **Paste the SHA-256 hash** — if you already have it
3. Click **"Verify Authenticity"**
4. If valid, you'll see:
   - ✅ **VALID CERTIFICATE** badge
   - Student name, registration number, course, grade
   - The on-chain SHA-256 fingerprint
   - Soulbound NFT minting status
   - **"Download Source Document"** link to view the original on IPFS

---

## Testing

```bash
cd contract
forge test -vvv
```

### CertificateRegistry.t.sol Tests

| Test | Description |
|---|---|
| `test_IssueCertificate` | Issuing stores correct metadata on-chain |
| `test_VerifyCertificate` | A valid hash passes verification |
| `test_Revert_VerifyNonExistent` | Non-existent hash reverts with "Not found" |
| `test_RevokeCertificate` | Admin can revoke, making the cert invalid |
| `test_Revert_IssueDuplicate` | Same hash cannot be issued twice |

### Sameer.t.sol Tests

| Test | Description |
|---|---|
| `testMintNFT` | Minting assigns NFT to the correct student |
| `test_RevertInvalidHash` | Minting with an unregistered hash reverts |

---

## Deployment

### Deploy the Registry

```solidity
// forge script script/DeployRegistry.s.sol --rpc-url sepolia --private-key $PRIVATE_KEY
```

### Deploy the NFT Contract

```bash
cd contract
export PRIVATE_KEY=your_private_key
export REGISTRY_ADDRESS=0x871086DA3fA39378DDaaae6c2CA79ec1bac5a92C

forge script script/DeploySameer.s.sol \
    --rpc-url sepolia \
    --private-key $PRIVATE_KEY \
    --broadcast
```

The `DeploySameer.s.sol` script takes two constructor args:
- `initialOwner` — derived from `PRIVATE_KEY` via `vm.addr()`
- `_registry` — from `REGISTRY_ADDRESS` env var

After deployment, update the `SAMEER_ADDRESS` constant in `frontend/src/App.jsx`.

---

## Security Model

### Collision Resistance
SHA-256 is used at the binary level. Any modification to the certificate — even a single pixel or comma — produces a completely different hash, causing verification to fail.

### Immutability
Once a certificate hash is recorded on-chain, it cannot be altered or deleted. The `revokeCertificate()` function only flips a boolean flag — the original record remains permanently visible (with a "revoked" marker).

### Integrity Verification
Verification works by:
1. Re-hashing the presented document
2. Looking up the hash on-chain
3. If found and not revoked → authentic

This means the verifier never needs to trust the issuer — they only need to trust the Ethereum blockchain.

### Access Control
- **Owner**: Full control (manage admins, pause contract)
- **Admins**: Can issue and revoke certificates
- **Public**: Read-only — can verify and fetch certificate data
- **Soulbound restriction**: NFTs cannot be transferred, preventing badge trading/fraud

### Circuit Breaker
The admin can `pauseContract()` in case of emergency, halting all certificate issuance until it's unpaused.
