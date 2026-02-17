# Anchor Titan CPI Example

An example Anchor program demonstrating how to perform a CPI (Cross-Program Invocation) into Titan's `swap_route_v2` instruction.

> **Disclaimer:** This code is provided purely for illustration and educational purposes. It is not production-ready and should not be used as-is. Use at your own risk. See [LICENSE](LICENSE) for full terms.

## Overview

The program uses a `protocol_authority` PDA to custody tokens in associated token account vaults and route swaps through Titan on behalf of users.

### Flow

1. Caller provides raw `swap_route_v2` instruction data (obtained from Titan's API)
2. Program validates the discriminator, `amount`, and `minimum_amount_out` match the provided parameters
3. Program CPIs into Titan's `swap_route_v2` with the `protocol_authority` PDA as the signer/payer

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
