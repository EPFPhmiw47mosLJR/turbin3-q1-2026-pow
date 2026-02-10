import { randomBytes } from "node:crypto";
import type { Program } from "@coral-xyz/anchor";
import * as anchor from "@coral-xyz/anchor";
import {
	Ed25519Program,
	Keypair,
	LAMPORTS_PER_SOL,
	PublicKey,
	SYSVAR_INSTRUCTIONS_PUBKEY,
	SystemProgram,
	sendAndConfirmTransaction,
	Transaction,
} from "@solana/web3.js";
import { BN } from "bn.js";
import { expect } from "chai";
import type { AnchorDiceGameQ425 } from "../target/types/anchor_dice_game_q4_25";

describe("anchor-dice-game-q4-25", () => {
	// Configure the client to use the local cluster.
	const provider = anchor.AnchorProvider.env();
	anchor.setProvider(provider);

	const program = anchor.workspace
		.anchorDiceGameQ425 as Program<AnchorDiceGameQ425>;

	const initializer = provider.wallet;

	const house = new Keypair();
	const player = new Keypair();
	const seed1 = new BN(randomBytes(16), "le");
	const seed2 = new BN(randomBytes(16), "le");
	const vaultDeposit = new BN(10).mul(new BN(anchor.web3.LAMPORTS_PER_SOL));

	const vaultPDA = PublicKey.findProgramAddressSync(
		[Buffer.from("vault"), house.publicKey.toBuffer()],
		program.programId,
	)[0];
	const betPDA = PublicKey.findProgramAddressSync(
		[
			Buffer.from("bet"),
			vaultPDA.toBuffer(),
			seed1.toArrayLike(Buffer, "le", 16),
		],
		program.programId,
	)[0];

	before("Fund", async () => {
		await Promise.all(
			[
				initializer.publicKey,
				house.publicKey,
				player.publicKey,
				vaultPDA,
				betPDA,
			].map(async (pk) => {
				return provider.connection.requestAirdrop(
					pk,
					10_000 * anchor.web3.LAMPORTS_PER_SOL,
				);
			}),
		);
	});

	it("Initialize", async () => {
		try {
			await program.methods
				.initialize(vaultDeposit)
				.accountsStrict({
					house: house.publicKey,
					vault: vaultPDA,
					systemProgram: SystemProgram.programId,
				})
				.signers([house])
				.rpc();
		} catch (e) {
			console.error("Transaction error:", e);
			if (e.logs) {
				console.log("Program logs:", e.logs);
			}
			expect.fail("Should not have errored");
		}
	});

	it("Place bet", async () => {
		try {
			await program.methods
				.placeBet(seed1, 50, new BN(LAMPORTS_PER_SOL / 100))
				.accountsStrict({
					player: player.publicKey,
					house: house.publicKey,
					vault: vaultPDA,
					bet: betPDA,
					systemProgram: SystemProgram.programId,
				})
				.signers([player])
				.rpc();
		} catch (e) {
			console.error("Transaction error:", e);
			if (e.logs) {
				console.log("Program logs:", e.logs);
			}
			expect.fail("Should not have errored");
		}
	});

	it("Resolve bet", async () => {
		const account = await provider.connection.getAccountInfo(
			betPDA,
			"confirmed",
		);
		const message = account.data.subarray(8);

		const sig_ix = Ed25519Program.createInstructionWithPrivateKey({
			privateKey: house.secretKey,
			message: message,
		});

		// Take just the data
		// 0-16: Header
		// 16-48: Pubkey (32)
		// 48-112: Signature (64)
		// 112-*: Message
		const sigOffset = sig_ix.data.readUInt16LE(2);
		const signature = sig_ix.data.subarray(sigOffset, sigOffset + 64);
		// const signature = sig_ix.data.subarray(16 + 32, 16 + 32 + 64);

		const resolve_ix = await program.methods
			.resolveBet(Buffer.from(signature))
			.accountsStrict({
				player: player.publicKey,
				house: house.publicKey,
				vault: vaultPDA,
				bet: betPDA,
				instructionSysvar: SYSVAR_INSTRUCTIONS_PUBKEY,
				systemProgram: SystemProgram.programId,
			})
			.signers([house])
			.instruction();

		const tx = new Transaction().add(sig_ix).add(resolve_ix);
		try {
			await provider.sendAndConfirm(tx, [house]);
		} catch (e) {
			console.error("Transaction error:", e);
			if (e.logs) {
				console.log("Program logs:", e.logs);
			}
			expect.fail("Should not have errored");
		}
	});

	it("Refund bet", async () => {
		try {
			await program.methods
				.refundBet()
				.accountsStrict({
					player: player.publicKey,
					house: house.publicKey,
					vault: vaultPDA,
					bet: betPDA,
					systemProgram: SystemProgram.programId,
				})
				.signers([player])
				.rpc();
		} catch (e) {
			console.error("Transaction error:", e);
			if (e.logs) {
				console.log("Program logs:", e.logs);
			}
			expect.fail("Should not have errored");
		}
	});
});
