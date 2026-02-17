import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import { TitanV2CpiExample } from "../target/types/titan_v2_cpi_example";
import {
  createMint,
  getOrCreateAssociatedTokenAccount,
  mintTo,
} from "@solana/spl-token";
import { PublicKey } from "@solana/web3.js";
import { expect } from "chai";

const TITAN_PROGRAM_ID = new PublicKey(
  "T1TANpTeScyeqVzzgNViGDNrkQ6qHz9KrSBS4aNXvGT"
);
const SWAP_ROUTE_V2_DISCRIMINATOR = Buffer.from([
  249, 91, 84, 33, 69, 22, 0, 135,
]);

describe("titan-v2-cpi-example", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace
    .titanV2CpiExample as Program<TitanV2CpiExample>;
  const payer = (provider.wallet as anchor.Wallet).payer;

  let inputMint: PublicKey;
  let outputMint: PublicKey;
  let protocolAuthority: PublicKey;
  let inputVault: PublicKey;
  let atlas: PublicKey;

  // Build a minimal Titan swap_route_v2 instruction data buffer
  function buildSwapData(
    amount: BN,
    minimumAmountOut: BN,
    discriminator: Buffer = SWAP_ROUTE_V2_DISCRIMINATOR
  ): Buffer {
    // Layout: [8 discriminator][8 amount][8 min_out][1 mints][2 provider_fee][2 service_fee][4 swaps_len]
    const data = Buffer.alloc(8 + 8 + 8 + 1 + 2 + 2 + 4);
    discriminator.copy(data, 0);
    data.writeBigUInt64LE(BigInt(amount.toString()), 8);
    data.writeBigUInt64LE(BigInt(minimumAmountOut.toString()), 16);
    data.writeUInt8(2, 24);
    data.writeUInt16LE(0, 25);
    data.writeUInt16LE(0, 27);
    data.writeUInt32LE(0, 29);
    return data;
  }

  before(async () => {
    [protocolAuthority] = PublicKey.findProgramAddressSync(
      [Buffer.from("protocol_authority")],
      program.programId
    );

    [atlas] = PublicKey.findProgramAddressSync(
      [Buffer.from("atlas")],
      TITAN_PROGRAM_ID
    );

    inputMint = await createMint(
      provider.connection,
      payer,
      payer.publicKey,
      null,
      6
    );

    outputMint = await createMint(
      provider.connection,
      payer,
      payer.publicKey,
      null,
      6
    );

    // Create input vault ATA for protocol authority and fund it
    const inputVaultAccount = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      payer,
      inputMint,
      protocolAuthority,
      true // allowOwnerOffCurve for PDA
    );
    inputVault = inputVaultAccount.address;

    await mintTo(
      provider.connection,
      payer,
      inputMint,
      inputVault,
      payer,
      1_000_000_000
    );
  });

  it("rejects swap data with wrong discriminator", async () => {
    const amount = new BN(1_000_000);
    const minimumAmountOut = new BN(900_000);
    const badDiscriminator = Buffer.from([0, 0, 0, 0, 0, 0, 0, 0]);
    const swapData = buildSwapData(amount, minimumAmountOut, badDiscriminator);

    try {
      await program.methods
        .swap(swapData, amount, minimumAmountOut)
        .accounts({
          payer: payer.publicKey,
          inputMint,
          outputMint,
          atlas,
        })
        .rpc();
      expect.fail("Should have thrown an error");
    } catch (err) {
      expect(err.toString()).to.include("InvalidInstructionData");
    }
  });

  it("rejects swap data with mismatched amount", async () => {
    const amount = new BN(1_000_000);
    const minimumAmountOut = new BN(900_000);
    const swapData = buildSwapData(amount, minimumAmountOut);
    const wrongAmount = new BN(2_000_000);

    try {
      await program.methods
        .swap(swapData, wrongAmount, minimumAmountOut)
        .accounts({
          payer: payer.publicKey,
          inputMint,
          outputMint,
          atlas,
        })
        .rpc();
      expect.fail("Should have thrown an error");
    } catch (err) {
      // require_eq! produces an AnchorError with code 2003
      expect(err.error.errorCode.number).to.equal(2501);
    }
  });

  it("rejects swap data with mismatched minimum_amount_out", async () => {
    const amount = new BN(1_000_000);
    const minimumAmountOut = new BN(900_000);
    const swapData = buildSwapData(amount, minimumAmountOut);
    const wrongMinOut = new BN(800_000);

    try {
      await program.methods
        .swap(swapData, amount, wrongMinOut)
        .accounts({
          payer: payer.publicKey,
          inputMint,
          outputMint,
          atlas,
        })
        .rpc();
      expect.fail("Should have thrown an error");
    } catch (err) {
      expect(err.error.errorCode.number).to.equal(2501);
    }
  });

  it("passes validation with correct data (fails at CPI since Titan is not on localnet)", async () => {
    const amount = new BN(1_000_000);
    const minimumAmountOut = new BN(900_000);
    const swapData = buildSwapData(amount, minimumAmountOut);

    try {
      await program.methods
        .swap(swapData, amount, minimumAmountOut)
        .accounts({
          payer: payer.publicKey,
          inputMint,
          outputMint,
          atlas,
        })
        .rpc();
      expect.fail("Should have thrown (Titan not on localnet)");
    } catch (err) {
      const errStr = err.toString();
      // Validation passed — error should NOT be about invalid data or constraint violations
      expect(errStr).to.not.include("InvalidInstructionData");
      expect(errStr).to.not.include("ConstraintRaw");
    }
  });
});
