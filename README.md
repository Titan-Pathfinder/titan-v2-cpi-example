# Anchor Titan CPI Example

An example Anchor program demonstrating how to perform a CPI (Cross-Program Invocation) into Titan's `swap_route_v2` instruction.

> **Disclaimer:** This code is provided purely for illustration and educational purposes. It is not production-ready and should not be used as-is. Use at your own risk. See [LICENSE](LICENSE) for full terms.

## Overview

The program uses a `protocol_authority` PDA to custody tokens in associated token account vaults and route swaps through Titan on behalf of users.

### Flow

1. Caller provides raw `swap_route_v2` instruction data (obtained from Titan's API)
2. Program validates the discriminator, `amount`, and `minimum_amount_out` match the provided parameters
3. Program CPIs into Titan's `swap_route_v2` with the `protocol_authority` PDA as the signer/payer

## Fetching Swap Data from the Titan API

To execute a swap via CPI, you need the serialized instruction data and the remaining accounts for the route. Both are obtained from the [Titan Swap API](https://titan-exchange.gitbook.io/titan/titan-developer-docs/apis/swap-api).

The Titan Swap API is also available through the following providers:

- [Triton](https://docs.triton.one/trading-apis/titan-swap-api)
- [QuickNode](https://marketplace.quicknode.com/add-on/titan-swap)

### 1. Connect and stream a quote

The Titan API uses WebSocket with MessagePack encoding. Install the SDK:

```sh
npm install @titanexchange/sdk-ts bs58
```

Connect and open a swap quote stream. Set `userPublicKey` to your `protocolAuthority` PDA since it will be the payer/signer for the Titan CPI.

```ts
import { V1Client } from "@titanexchange/sdk-ts";
import bs58 from "bs58";
import { PublicKey, VersionedTransaction } from "@solana/web3.js";

const TITAN_PROGRAM_ID = new PublicKey(
  "T1TANpTeScyeqVzzgNViGDNrkQ6qHz9KrSBS4aNXvGT"
);

const client = await V1Client.connect(
  `${process.env.WS_URL}?auth=${process.env.AUTH_TOKEN}`
);

const { stream } = await client.newSwapQuoteStream({
  swap: {
    inputMint: bs58.decode(inputMint.toBase58()),
    outputMint: bs58.decode(outputMint.toBase58()),
    amount: BigInt(amount),
    slippageBps: 50,
  },
  transaction: {
    userPublicKey: bs58.decode(protocolAuthority.toBase58()),
  },
  update: {
    intervalMs: 1000,
    numQuotes: 3,
  },
});
```

### 2. Pick the best route

Each stream update contains quotes keyed by provider. Pick the best one by `outAmount`:

```ts
for await (const update of stream) {
  const quotes = update.quotes;
  if (!Object.keys(quotes).length) continue;

  const bestRoute = Object.values(quotes).reduce((best, route) =>
    route.outAmount > best.outAmount ? route : best
  );

  // Use bestRoute (see next step)
  break;
}
```

### 3. Deserialize and pass to your program

Each `SwapRoute` includes a `transaction` (serialized `VersionedTransaction`). Deserialize it to extract the Titan instruction data and remaining accounts:

```ts
const tx = VersionedTransaction.deserialize(bestRoute.transaction);

// Find the Titan swap instruction
const titanIx = tx.message.compiledInstructions.find(
  (ix) =>
    tx.message.staticAccountKeys[ix.programIdIndex].equals(TITAN_PROGRAM_ID)
);

// The first 8 fixed accounts (payer, atlas, inputMint, inputTokenAccount,
// outputMint, outputTokenAccount, inputTokenProgram, outputTokenProgram)
// are provided as named accounts in the Swap struct.
// The rest are passed as remainingAccounts.
const accountKeys = tx.message.getAccountKeys();
const remainingAccounts = titanIx.accountKeyIndexes.slice(8).map((idx) => ({
  pubkey: accountKeys.get(idx),
  isSigner: false,
  isWritable: tx.message.isAccountWritable(idx),
}));

// Call your program
await program.methods
  .swap(
    Buffer.from(titanIx.data),
    new BN(bestRoute.inAmount.toString()),
    new BN(
      (bestRoute.outAmount * BigInt(10000 - bestRoute.slippageBps)) /
        BigInt(10000)
    )
  )
  .accounts({
    payer: payer.publicKey,
    inputMint,
    outputMint,
    atlas,
  })
  .remainingAccounts(remainingAccounts)
  .rpc();

await client.close();
```

For full API details, see the [Titan Swap API documentation](https://titan-exchange.gitbook.io/titan/titan-developer-docs/apis/swap-api). Also see the [TypeScript SDK](https://www.npmjs.com/package/@titanexchange/sdk-ts) and [Claude skill examples](https://github.com/Titan-Pathfinder/titan-api-claude-skills).

## Project Structure

```
programs/titan-v2-cpi-example/src/
  lib.rs        -- Program entrypoint, swap instruction handler
  constant.rs   -- Titan program ID, swap_route_v2 discriminator
  swap.rs       -- Swap accounts struct, validation, and CPI logic
tests/
  titan-v2-cpi-example.ts -- Validation tests
titan_swap.json            -- Titan aggregator IDL (reference)
```

## Accounts

| Account | Description |
|---------|-------------|
| `payer` | Signer, pays for output vault creation if needed |
| `protocolAuthority` | PDA (`seeds = ["protocol_authority"]`), owns the vaults, signs the Titan CPI |
| `inputMint` | SPL mint of the input token |
| `inputVault` | ATA of `protocolAuthority` for `inputMint` |
| `outputMint` | SPL mint of the output token |
| `outputVault` | ATA of `protocolAuthority` for `outputMint` (created via `init_if_needed`) |
| `atlas` | Titan's swap authority PDA |
| `titanProgram` | Titan aggregator program (`T1TANpTeScyeqVzzgNViGDNrkQ6qHz9KrSBS4aNXvGT`) |

Additional accounts required by the specific swap route are passed via `remainingAccounts`.

## Build

```sh
anchor build
```

## Test

```sh
anchor test
```

The tests verify on-chain validation logic (discriminator check, amount/slippage matching). The full CPI swap cannot be tested on localnet since the Titan program is only deployed on mainnet.

## Dependencies

- Anchor 0.32.1
- Solana / Rust 1.89.0
