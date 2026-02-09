import * as anchor from "@coral-xyz/anchor";
import {
	ASSOCIATED_TOKEN_PROGRAM_ID,
	getAssociatedTokenAddressSync,
	getOrCreateAssociatedTokenAccount,
	mintTo,
	TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import type { AnchorAmmQ425 } from "../target/types/anchor_amm_q4_25";

export interface Pool {
	config: anchor.web3.PublicKey;
	configBump: number;
	lpMint: anchor.web3.PublicKey;
	lpMintBump: number;
	vaultX: anchor.web3.PublicKey;
	vaultY: anchor.web3.PublicKey;
}

/**
 * Airdrop SOL to a wallet
 */
export async function helper_airdrop(
	provider: anchor.AnchorProvider,
	address: anchor.web3.PublicKey,
	amount: number,
): Promise<void> {
	// const signature =
	await provider.connection.requestAirdrop(
		address,
		amount * anchor.web3.LAMPORTS_PER_SOL,
	);
	// await provider.connection.confirmTransaction(signature);
}

/**
 * Convert UI amount to raw amount with decimals
 */
export function helper_uiAmountToRaw(
	uiAmount: number,
	decimals: number,
): bigint {
	return BigInt(uiAmount * 10 ** decimals);
}

/**
 * Get token balance from an ATA
 */
export async function helper_getAtaTokenBalance(
	connection: anchor.web3.Connection,
	ata: anchor.web3.PublicKey,
): Promise<bigint> {
	try {
		const account = await connection.getTokenAccountBalance(ata);
		return BigInt(account.value.amount);
	} catch {
		return 0n;
	}
}

/**
 * Create an ATA and mint tokens to it
 */
export async function helper_createAtaAndMint(params: {
	provider: anchor.AnchorProvider;
	mint: anchor.web3.PublicKey;
	owner: anchor.web3.PublicKey;
	amount: bigint;
	allowOwnerOffCurve: boolean;
}): Promise<anchor.web3.PublicKey> {
	const { provider, mint, owner, amount, allowOwnerOffCurve } = params;

	const ata = await getOrCreateAssociatedTokenAccount(
		provider.connection,
		provider.wallet.payer,
		mint,
		owner,
		allowOwnerOffCurve,
	);

	if (amount > 0n) {
		await mintTo(
			provider.connection,
			provider.wallet.payer,
			mint,
			ata.address,
			provider.wallet.publicKey,
			amount,
		);
	}

	return ata.address;
}

/**
 * Derive pool PDAs and addresses
 */
export function helper_derivePool(
	seed: anchor.BN,
	program: anchor.Program<AnchorAmmQ425>,
	mintX: anchor.web3.PublicKey,
	mintY: anchor.web3.PublicKey,
): Pool {
	const [config, configBump] = anchor.web3.PublicKey.findProgramAddressSync(
		[Buffer.from("config"), seed.toArrayLike(Buffer, "le", 8)],
		program.programId,
	);

	const [lpMint, lpMintBump] = anchor.web3.PublicKey.findProgramAddressSync(
		[Buffer.from("lp"), config.toBuffer()],
		program.programId,
	);

	const vaultX = getAssociatedTokenAddressSync(mintX, config, true);
	const vaultY = getAssociatedTokenAddressSync(mintY, config, true);

	return {
		config,
		configBump,
		lpMint,
		lpMintBump,
		vaultX,
		vaultY,
	};
}

/**
 * Generate a random pool with random seed
 */
export function helper_genRandomPool(
	program: anchor.Program<AnchorAmmQ425>,
	mintX: anchor.web3.PublicKey,
	mintY: anchor.web3.PublicKey,
): { seed: anchor.BN; pool: Pool } {
	const seed = new anchor.BN(Math.floor(Math.random() * 1_000_000));
	const pool = helper_derivePool(seed, program, mintX, mintY);
	return { seed, pool };
}

/**
 * Get accounts for initialize instruction
 */
export function helper_initializeAccounts(
	initializer: any,
	pool: Pool,
	mintX: anchor.web3.PublicKey,
	mintY: anchor.web3.PublicKey,
) {
	return {
		initializer: initializer.publicKey,
		mintX,
		mintY,
		config: pool.config,
		mintLp: pool.lpMint,
		vaultX: pool.vaultX,
		vaultY: pool.vaultY,
		tokenProgram: TOKEN_PROGRAM_ID,
		associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
		systemProgram: anchor.web3.SystemProgram.programId,
	};
}

/**
 * Setup pool with initial liquidity from a new LP
 */
export async function helper_setupPoolWithLiquidity(
	provider: anchor.AnchorProvider,
	program: anchor.Program<AnchorAmmQ425>,
	pool: Pool,
	tokenX: { mint: anchor.web3.PublicKey; amount: number },
	tokenY: { mint: anchor.web3.PublicKey; amount: number },
	decimals: number,
): Promise<{
	lp: anchor.web3.Keypair;
	lp_X_ata: anchor.web3.PublicKey;
	lp_Y_ata: anchor.web3.PublicKey;
	lp_LP_ata: anchor.web3.PublicKey;
}> {
	const lp = anchor.web3.Keypair.generate();
	await helper_airdrop(provider, lp.publicKey, 10);

	const amountX = helper_uiAmountToRaw(tokenX.amount, decimals);
	const amountY = helper_uiAmountToRaw(tokenY.amount, decimals);

	const lp_X_ata = await helper_createAtaAndMint({
		provider,
		mint: tokenX.mint,
		owner: lp.publicKey,
		amount: amountX,
		allowOwnerOffCurve: false,
	});

	const lp_Y_ata = await helper_createAtaAndMint({
		provider,
		mint: tokenY.mint,
		owner: lp.publicKey,
		amount: amountY,
		allowOwnerOffCurve: false,
	});

	const lp_LP_ata = getAssociatedTokenAddressSync(pool.lpMint, lp.publicKey);

	// Only deposit if amounts are greater than 0
	if (tokenX.amount > 0 && tokenY.amount > 0) {
		// Calculate expected LP tokens (sqrt(x * y) for first deposit)
		const expectedLP = BigInt(
			Math.floor(Math.sqrt(Number(amountX) * Number(amountY))),
		);

		await program.methods
			.deposit(
				new anchor.BN(expectedLP.toString()),
				new anchor.BN(amountX.toString()),
				new anchor.BN(amountY.toString()),
			)
			.accountsStrict({
				user: lp.publicKey,
				mintX: tokenX.mint,
				mintY: tokenY.mint,
				config: pool.config,
				mintLp: pool.lpMint,
				vaultX: pool.vaultX,
				vaultY: pool.vaultY,
				userX: lp_X_ata,
				userY: lp_Y_ata,
				userLp: lp_LP_ata,
				tokenProgram: TOKEN_PROGRAM_ID,
				systemProgram: anchor.web3.SystemProgram.programId,
				associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
			})
			.signers([lp])
			.rpc();
	}

	return { lp, lp_X_ata, lp_Y_ata, lp_LP_ata };
}

/**
 * Generate a swap user with token balances
 */
export async function helper_genSwapUser(
	provider: anchor.AnchorProvider,
	tokens: Array<{ mint: anchor.web3.PublicKey; amount: number }>,
	decimals: number,
): Promise<{
	user: anchor.web3.Keypair;
	atas: anchor.web3.PublicKey[];
}> {
	const user = anchor.web3.Keypair.generate();
	await helper_airdrop(provider, user.publicKey, 10);

	const atas: anchor.web3.PublicKey[] = [];

	for (const token of tokens) {
		const amount = helper_uiAmountToRaw(token.amount, decimals);
		const ata = await helper_createAtaAndMint({
			provider,
			mint: token.mint,
			owner: user.publicKey,
			amount,
			allowOwnerOffCurve: true,
		});
		atas.push(ata);
	}

	return { user, atas };
}
