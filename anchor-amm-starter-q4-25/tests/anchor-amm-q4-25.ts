import type { Program } from "@coral-xyz/anchor";
import * as anchor from "@coral-xyz/anchor";
import {
	ASSOCIATED_TOKEN_PROGRAM_ID,
	createMint,
	getAccount,
	getAssociatedTokenAddressSync,
	getMint,
	TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { expect } from "chai";
import { ConstantProduct } from "constant-product-curve-wasm";
import type { AnchorAmmQ425 } from "../target/types/anchor_amm_q4_25";
import {
	helper_airdrop,
	helper_createAtaAndMint,
	helper_derivePool,
	helper_genRandomPool,
	helper_genSwapUser,
	helper_getAtaTokenBalance,
	helper_initializeAccounts,
	helper_setupPoolWithLiquidity,
	helper_uiAmountToRaw,
	type Pool,
} from "./helpers";

// Naming order because I confused myself
// <role>_<pool>_<token>
// <owner>_<token>_ata

describe("anchor-amm-q4-25", () => {
	const provider = anchor.AnchorProvider.env();
	anchor.setProvider(provider);

	const program = anchor.workspace.anchorAmmQ425 as Program<AnchorAmmQ425>;

	// Accounts
	const initializer = provider.wallet;

	// Constants
	const MINT_DECIMALS = 6;
	const FEE_BP_0 = 0;
	const FEE_BP_5 = 500;
	const MAX_BP = 10_000;

	// Mints
	let mintX: anchor.web3.PublicKey;
	let mintY: anchor.web3.PublicKey;

	before(async () => {
		// Airdrop SOL
		await Promise.all([helper_airdrop(provider, initializer.publicKey, 10)]);

		// Create mints
		mintX = await createMint(
			provider.connection,
			provider.wallet.payer,
			initializer.publicKey,
			null,
			MINT_DECIMALS,
		);
		mintY = await createMint(
			provider.connection,
			provider.wallet.payer,
			initializer.publicKey,
			null,
			MINT_DECIMALS,
		);
	});

	describe("Initialize Config", () => {
		let poolA: Pool;

		const seedA = new anchor.BN(11);

		before(() => {
			poolA = helper_derivePool(seedA, program, mintX, mintY);
		});

		describe("Pool A", () => {
			it("initializes", async () => {
				await program.methods
					.initialize(seedA, FEE_BP_5, initializer.publicKey)
					.accountsStrict(
						helper_initializeAccounts(initializer, poolA, mintX, mintY),
					)
					.rpc();

				// Check config
				const configA = await program.account.config.fetch(poolA.config);
				expect(configA.seed.eq(seedA)).to.eq(true);
				expect(configA.authority.toBase58()).to.eq(
					initializer.publicKey.toBase58(),
				);
				expect(configA.mintX.toBase58()).to.eq(mintX.toBase58());
				expect(configA.mintY.toBase58()).to.eq(mintY.toBase58());
				expect(configA.fee).to.eq(FEE_BP_5);
				expect(configA.locked).to.eq(false);
				expect(configA.configBump).to.eq(poolA.configBump);
				expect(configA.lpBump).to.eq(poolA.lpMintBump);

				// Check vault X
				const expectedVaultX = getAssociatedTokenAddressSync(
					mintX,
					poolA.config,
					true,
				);
				expect(poolA.vaultX.toBase58()).to.eq(expectedVaultX.toBase58());

				const vaultX = await getAccount(provider.connection, poolA.vaultX);
				expect(vaultX.mint.toBase58()).to.eq(mintX.toBase58());
				expect(vaultX.owner.toBase58()).to.eq(poolA.config.toBase58());
				expect(vaultX.amount).to.eq(0n);

				// Check vault Y
				const expectedVaultY = getAssociatedTokenAddressSync(
					mintY,
					poolA.config,
					true,
				);
				expect(poolA.vaultY.toBase58()).to.eq(expectedVaultY.toBase58());
				const vaultY = await getAccount(provider.connection, poolA.vaultY);
				expect(vaultY.mint.toBase58()).to.eq(mintY.toBase58());
				expect(vaultY.owner.toBase58()).to.eq(poolA.config.toBase58());
				expect(vaultY.amount).to.eq(0n);

				// Check lp mint
				const lpMint = await getMint(provider.connection, poolA.lpMint);
				expect(lpMint.mintAuthority.toBase58()).to.eq(poolA.config.toBase58());
				expect(lpMint.freezeAuthority).to.be.null;
				expect(lpMint.decimals).to.eq(MINT_DECIMALS);
				expect(lpMint.supply).to.eq(0n);
			});

			it("fails to re-initialize", async () => {
				try {
					await program.methods
						.initialize(seedA, FEE_BP_5, initializer.publicKey)
						.accountsStrict(
							helper_initializeAccounts(initializer, poolA, mintX, mintY),
						)
						.rpc();
					expect.fail("should have failed");
				} catch (e) {
					expect(e.toString()).to.include("already in use");
				}
			});
		});

		it("fails if authority is None", async () => {
			const { seed, pool } = helper_genRandomPool(program, mintX, mintY);
			try {
				await program.methods
					.initialize(seed, FEE_BP_5, null)
					.accountsStrict(
						helper_initializeAccounts(initializer, pool, mintX, mintY),
					)
					.rpc();
				expect.fail("should have failed");
			} catch (e) {
				expect(e.error.errorCode.number).to.eq(6013);
				expect(e.error.errorCode.code).to.eq("NoAuthoritySet");
			}
		});

		it("fails when mintX == mintY due to ATA address collision", async () => {
			const { seed, pool } = helper_genRandomPool(program, mintX, mintX);
			try {
				await program.methods
					.initialize(seed, FEE_BP_5, initializer.publicKey)
					.accountsStrict(
						helper_initializeAccounts(initializer, pool, mintX, mintX),
					)
					.rpc();
				expect.fail("should have failed");
			} catch (e) {
				expect(e.toString()).to.include("Provided owner is not allowed");
			}
		});

		it("fails if mint_x.decimals != mint_y.decimals", async () => {
			const mintX = await createMint(
				provider.connection,
				provider.wallet.payer,
				initializer.publicKey,
				null,
				MINT_DECIMALS,
			);
			const mintY = await createMint(
				provider.connection,
				provider.wallet.payer,
				initializer.publicKey,
				null,
				MINT_DECIMALS + 1,
			);

			const { seed, pool } = helper_genRandomPool(program, mintX, mintY);
			try {
				await program.methods
					.initialize(seed, FEE_BP_5, initializer.publicKey)
					.accountsStrict(
						helper_initializeAccounts(initializer, pool, mintX, mintY),
					)
					.rpc();
				expect.fail("should have failed");
			} catch (e) {
				expect(e.error.errorCode.number).to.eq(6015);
				expect(e.error.errorCode.code).to.eq("InvalidPrecision");
			}
		});
	});

	describe("Init: Fees", () => {
		it("passes fee = 0%", async () => {
			const FEE = FEE_BP_0;

			const { seed, pool } = helper_genRandomPool(program, mintX, mintY);
			try {
				await program.methods
					.initialize(seed, FEE, initializer.publicKey)
					.accountsStrict(
						helper_initializeAccounts(initializer, pool, mintX, mintY),
					)
					.rpc();
			} catch (_e) {
				expect.fail("should have passed");
			}
		});

		it("passes fee = 5%", async () => {
			const FEE = FEE_BP_5;

			const { seed, pool } = helper_genRandomPool(program, mintX, mintY);
			try {
				await program.methods
					.initialize(seed, FEE, initializer.publicKey)
					.accountsStrict(
						helper_initializeAccounts(initializer, pool, mintX, mintY),
					)
					.rpc();
			} catch (_e) {
				expect.fail("should have passed");
			}
		});

		it("passes fee = 100%", async () => {
			const FEE = MAX_BP;

			const { seed, pool } = helper_genRandomPool(program, mintX, mintY);
			try {
				await program.methods
					.initialize(seed, FEE, initializer.publicKey)
					.accountsStrict(
						helper_initializeAccounts(initializer, pool, mintX, mintY),
					)
					.rpc();
			} catch (_e) {
				expect.fail("should have passed");
			}
		});

		it("fails fee > 100%", async () => {
			const FEE = 10_001;

			const { seed, pool } = helper_genRandomPool(program, mintX, mintY);
			try {
				await program.methods
					.initialize(seed, FEE, initializer.publicKey)
					.accountsStrict(
						helper_initializeAccounts(initializer, pool, mintX, mintY),
					)
					.rpc();
				expect.fail("should have failed");
			} catch (e) {
				expect(e.error.errorCode.number).to.eq(6011);
				expect(e.error.errorCode.code).to.eq("InvalidFee");
			}
		});
	});

	describe("Deposits", () => {
		it("single LP deposit", async () => {
			const LP_INITIAL_X = 1000;
			const LP_INITIAL_Y = 1000;
			const LP_MAX_DEP_X = 500;
			const LP_MAX_DEP_Y = 500;
			const MIN_LP = 50;
			const FEE = FEE_BP_5;

			// Setup pool
			const { seed, pool } = helper_genRandomPool(program, mintX, mintY);
			await program.methods
				.initialize(seed, FEE, initializer.publicKey)
				.accountsStrict(
					helper_initializeAccounts(initializer, pool, mintX, mintY),
				)
				.rpc();

			// Setup liquidity provider
			const lp = anchor.web3.Keypair.generate();
			await helper_airdrop(provider, lp.publicKey, 10);

			const lp_initial_x_scaled = helper_uiAmountToRaw(
				LP_INITIAL_X,
				MINT_DECIMALS,
			);
			const lp_initial_y_scaled = helper_uiAmountToRaw(
				LP_INITIAL_Y,
				MINT_DECIMALS,
			);
			const lp_max_dep_x_scaled = helper_uiAmountToRaw(
				LP_MAX_DEP_X,
				MINT_DECIMALS,
			);
			const lp_max_dep_y_scaled = helper_uiAmountToRaw(
				LP_MAX_DEP_Y,
				MINT_DECIMALS,
			);

			const lp_X_ata = await helper_createAtaAndMint({
				provider,
				mint: mintX,
				owner: lp.publicKey,
				amount: lp_initial_x_scaled,
				allowOwnerOffCurve: false,
			});

			const lp_Y_ata = await helper_createAtaAndMint({
				provider,
				mint: mintY,
				owner: lp.publicKey,
				amount: lp_initial_y_scaled,
				allowOwnerOffCurve: false,
			});

			const lp_LP_ata = getAssociatedTokenAddressSync(
				pool.lpMint,
				lp.publicKey,
			);

			// State before tx
			const vaultXBeforeBalance = await helper_getAtaTokenBalance(
				provider.connection,
				pool.vaultX,
			);
			const vaultYBeforeBalance = await helper_getAtaTokenBalance(
				provider.connection,
				pool.vaultY,
			);
			const lpXBefore = await getAccount(provider.connection, lp_X_ata);
			const lpYBefore = await getAccount(provider.connection, lp_Y_ata);
			const lpLPBeforeBalance = await helper_getAtaTokenBalance(
				provider.connection,
				lp_LP_ata,
			);

			// Based on-chain, first deposit return sqrt(X * Y) LP tokens
			const expectedLP = {
				deposit_x: lp_max_dep_x_scaled,
				deposit_y: lp_max_dep_y_scaled,
				mint_l: helper_uiAmountToRaw(500, MINT_DECIMALS), // TODO: Swap with a proper calculation
			};

			const min_lp_scaled = helper_uiAmountToRaw(MIN_LP, MINT_DECIMALS);

			// Make deposit
			await program.methods
				.deposit(
					new anchor.BN(min_lp_scaled),
					new anchor.BN(lp_max_dep_x_scaled),
					new anchor.BN(lp_max_dep_y_scaled),
				)
				.accountsStrict({
					user: lp.publicKey,
					mintX: mintX,
					mintY: mintY,
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

			// State after tx
			const vaultXAfter = await getAccount(provider.connection, pool.vaultX);
			const vaultYAfter = await getAccount(provider.connection, pool.vaultY);
			const lpXAfter = await getAccount(provider.connection, lp_X_ata);
			const lpYAfter = await getAccount(provider.connection, lp_Y_ata);
			const lpLPAfter = await getAccount(provider.connection, lp_LP_ata);

			// Checks
			expect(lpYAfter.amount).to.eq(lpYBefore.amount - expectedLP.deposit_y);
			expect(lpXAfter.amount).to.eq(lpXBefore.amount - expectedLP.deposit_x);
			expect(vaultXAfter.amount).to.eq(
				vaultXBeforeBalance + expectedLP.deposit_x,
			);
			expect(vaultYAfter.amount).to.eq(
				vaultYBeforeBalance + expectedLP.deposit_y,
			);
			expect(lpLPAfter.amount).to.eq(lpLPBeforeBalance + expectedLP.mint_l);
		});

		it("double LP deposit", async () => {
			const LP_INITIAL_X = 2000;
			const LP_INITIAL_Y = 2000;
			const LP_MAX_DEP_X = 500;
			const LP_MAX_DEP_Y = 500;
			const TARGET_LP = 100;
			const FEE = FEE_BP_5;

			// Setup pool
			const { seed, pool } = helper_genRandomPool(program, mintX, mintY);
			await program.methods
				.initialize(seed, FEE, initializer.publicKey)
				.accountsStrict(
					helper_initializeAccounts(initializer, pool, mintX, mintY),
				)
				.rpc();

			// Setup liquidity provider
			const lp = anchor.web3.Keypair.generate();
			await helper_airdrop(provider, lp.publicKey, 10);

			const lp_initial_x_scaled = helper_uiAmountToRaw(
				LP_INITIAL_X,
				MINT_DECIMALS,
			);
			const lp_initial_y_scaled = helper_uiAmountToRaw(
				LP_INITIAL_Y,
				MINT_DECIMALS,
			);
			const lp_max_dep_x_scaled = helper_uiAmountToRaw(
				LP_MAX_DEP_X,
				MINT_DECIMALS,
			);
			const lp_max_dep_y_scaled = helper_uiAmountToRaw(
				LP_MAX_DEP_Y,
				MINT_DECIMALS,
			);

			const lp_X_ata = await helper_createAtaAndMint({
				provider,
				mint: mintX,
				owner: lp.publicKey,
				amount: lp_initial_x_scaled,
				allowOwnerOffCurve: false,
			});
			const lp_Y_ata = await helper_createAtaAndMint({
				provider,
				mint: mintY,
				owner: lp.publicKey,
				amount: lp_initial_y_scaled,
				allowOwnerOffCurve: false,
			});
			const lp_LP_ata = getAssociatedTokenAddressSync(
				pool.lpMint,
				lp.publicKey,
			);

			// State before tx
			const vaultXBefore_balance = await helper_getAtaTokenBalance(
				provider.connection,
				pool.vaultX,
			);
			const vaultYBefore_balance = await helper_getAtaTokenBalance(
				provider.connection,
				pool.vaultY,
			);
			const lpXBefore = await getAccount(provider.connection, lp_X_ata);
			const lpYBefore = await getAccount(provider.connection, lp_Y_ata);
			const lpLPBeforeBalance = await helper_getAtaTokenBalance(
				provider.connection,
				lp_LP_ata,
			);

			// Based on-chain, first deposit return sqrt(X * Y) LP tokens
			const expectedLP = {
				deposit_x: lp_max_dep_x_scaled,
				deposit_y: lp_max_dep_y_scaled,
				mint_l: helper_uiAmountToRaw(500, MINT_DECIMALS), // TODO: Swap with a proper calculation
			};

			const target_lp_scaled = helper_uiAmountToRaw(TARGET_LP, MINT_DECIMALS);

			// Make deposit
			await program.methods
				.deposit(
					new anchor.BN(target_lp_scaled),
					new anchor.BN(lp_max_dep_x_scaled),
					new anchor.BN(lp_max_dep_y_scaled),
				)
				.accountsStrict({
					user: lp.publicKey,
					mintX: mintX,
					mintY: mintY,
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

			// State after tx
			const vaultXAfter = await getAccount(provider.connection, pool.vaultX);
			const vaultYAfter = await getAccount(provider.connection, pool.vaultY);
			const lpXAfter = await getAccount(provider.connection, lp_X_ata);
			const lpYAfter = await getAccount(provider.connection, lp_Y_ata);
			const lpLPAfter = await getAccount(provider.connection, lp_LP_ata);
			const lpMintAfter = await getMint(provider.connection, pool.lpMint);

			// Checks
			expect(lpYAfter.amount).to.eq(lpYBefore.amount - expectedLP.deposit_y);
			expect(lpXAfter.amount).to.eq(lpXBefore.amount - expectedLP.deposit_x);
			expect(vaultXAfter.amount).to.eq(
				vaultXBefore_balance + expectedLP.deposit_x,
			);
			expect(vaultYAfter.amount).to.eq(
				vaultYBefore_balance + expectedLP.deposit_y,
			);
			expect(lpLPAfter.amount).to.eq(lpLPBeforeBalance + expectedLP.mint_l);

			// Deposit #2
			const cp = new ConstantProduct(
				vaultXAfter.amount,
				vaultYAfter.amount,
				lpMintAfter.supply,
				FEE,
				MINT_DECIMALS,
			);
			const depositResult = cp.deposit_liquidity(
				target_lp_scaled,
				lp_max_dep_x_scaled,
				lp_max_dep_y_scaled,
			);

			await program.methods
				.deposit(
					new anchor.BN(target_lp_scaled),
					new anchor.BN(lp_max_dep_x_scaled),
					new anchor.BN(lp_max_dep_y_scaled),
				)
				.accountsStrict({
					user: lp.publicKey,
					mintX: mintX,
					mintY: mintY,
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

			// Final state
			const vaultXFinal = await getAccount(provider.connection, pool.vaultX);
			const vaultYFinal = await getAccount(provider.connection, pool.vaultY);
			const lpXFinal = await getAccount(provider.connection, lp_X_ata);
			const lpYFinal = await getAccount(provider.connection, lp_Y_ata);
			const lpLPFinal = await getAccount(provider.connection, lp_LP_ata);

			expect(lpYFinal.amount).to.eq(lpYAfter.amount - depositResult.deposit_y);
			expect(lpXFinal.amount).to.eq(lpXAfter.amount - depositResult.deposit_x);
			expect(vaultXFinal.amount).to.eq(
				vaultXAfter.amount + depositResult.deposit_x,
			);
			expect(vaultYFinal.amount).to.eq(
				vaultYAfter.amount + depositResult.deposit_y,
			);
			expect(lpLPFinal.amount).to.eq(lpLPAfter.amount + depositResult.mint_l);
		});
	});

	describe("Swaps", () => {
		it("swaps X->Y", async () => {
			const POOL_LIQUIDITY_X = 500;
			const POOL_LIQUIDITY_Y = 500;
			const USER_INITIAL_X = 100;
			const USER_INITIAL_Y = 0;
			const SWAP_AMOUNT_X = 50;
			const FEE = FEE_BP_5;
			const MIN_SWAP = 0;

			// Setup pool
			const { seed, pool } = helper_genRandomPool(program, mintX, mintY);
			await program.methods
				.initialize(seed, FEE, initializer.publicKey)
				.accountsStrict(
					helper_initializeAccounts(initializer, pool, mintX, mintY),
				)
				.rpc();

			await helper_setupPoolWithLiquidity(
				provider,
				program,
				pool,
				{ mint: mintX, amount: POOL_LIQUIDITY_X },
				{ mint: mintY, amount: POOL_LIQUIDITY_Y },
				MINT_DECIMALS,
			);

			// Create user
			const {
				user,
				atas: [userXAta, userYAta],
			} = await helper_genSwapUser(
				provider,
				[
					{ mint: mintX, amount: USER_INITIAL_X },
					{ mint: mintY, amount: USER_INITIAL_Y },
				],
				MINT_DECIMALS,
			);

			// State before tx
			const vaultXBefore = await getAccount(provider.connection, pool.vaultX);
			const vaultYBefore = await getAccount(provider.connection, pool.vaultY);
			const userXBefore = await getAccount(provider.connection, userXAta);
			const userYBefore_balance = await helper_getAtaTokenBalance(
				provider.connection,
				userYAta,
			);
			const lpMint = await getMint(provider.connection, pool.lpMint);

			// Calculate expected result
			const cp = new ConstantProduct(
				vaultXBefore.amount,
				vaultYBefore.amount,
				lpMint.supply,
				FEE,
				MINT_DECIMALS,
			);
			const swapAmountRaw = helper_uiAmountToRaw(SWAP_AMOUNT_X, MINT_DECIMALS);
			const minSwapRaw = helper_uiAmountToRaw(MIN_SWAP, MINT_DECIMALS);
			// Need to pass false/0 to ConstantProductCurve js lib when passing true to CPI
			// Why???
			const expectedSwap = cp.swap(0, swapAmountRaw, 0n);

			// Do the swap
			await program.methods
				.swap(true, new anchor.BN(swapAmountRaw), new anchor.BN(minSwapRaw))
				.accountsStrict({
					user: user.publicKey,
					mintX,
					mintY,
					config: pool.config,
					mintLp: pool.lpMint,
					vaultX: pool.vaultX,
					vaultY: pool.vaultY,
					userX: userXAta,
					userY: userYAta,
					tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
					associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
					systemProgram: anchor.web3.SystemProgram.programId,
				})
				.signers([user])
				.rpc();

			// State after tx
			const config = await program.account.config.fetch(pool.config);
			const vaultXAfter = await getAccount(provider.connection, pool.vaultX);
			const vaultYAfter = await getAccount(provider.connection, pool.vaultY);
			const userXBalance = await getAccount(provider.connection, userXAta);
			const userYBalance = await getAccount(provider.connection, userYAta);

			// Checks
			const expectedFee = (swapAmountRaw * BigInt(config.fee)) / BigInt(MAX_BP);

			expect(expectedSwap.fee).to.eq(expectedFee);
			expect(userYBalance.amount).to.eq(
				userYBefore_balance + expectedSwap.withdraw,
			);
			expect(userXBalance.amount).to.eq(
				userXBefore.amount - expectedSwap.deposit,
			);
			expect(vaultXAfter.amount).to.eq(
				vaultXBefore.amount + expectedSwap.deposit,
			);
			expect(vaultYAfter.amount).to.eq(
				vaultYBefore.amount - expectedSwap.withdraw,
			);
		});

		it("swaps Y->X", async () => {
			const POOL_LIQUIDITY_X = 500;
			const POOL_LIQUIDITY_Y = 500;
			const USER_INITIAL_X = 0;
			const USER_INITIAL_Y = 100;
			const SWAP_AMOUNT_Y = 50;
			const FEE = FEE_BP_5;
			const MIN_SWAP = 0;

			// Setup pool
			const { seed, pool } = helper_genRandomPool(program, mintX, mintY);
			await program.methods
				.initialize(seed, FEE, initializer.publicKey)
				.accountsStrict(
					helper_initializeAccounts(initializer, pool, mintX, mintY),
				)
				.rpc();

			await helper_setupPoolWithLiquidity(
				provider,
				program,
				pool,
				{ mint: mintX, amount: POOL_LIQUIDITY_X },
				{ mint: mintY, amount: POOL_LIQUIDITY_Y },
				MINT_DECIMALS,
			);

			// Create user
			const {
				user,
				atas: [userXAta, userYAta],
			} = await helper_genSwapUser(
				provider,
				[
					{ mint: mintX, amount: USER_INITIAL_X },
					{ mint: mintY, amount: USER_INITIAL_Y },
				],
				MINT_DECIMALS,
			);

			// State before tx
			const vaultXBefore = await getAccount(provider.connection, pool.vaultX);
			const vaultYBefore = await getAccount(provider.connection, pool.vaultY);
			const userXBalanceBefore = await helper_getAtaTokenBalance(
				provider.connection,
				userXAta,
			);
			const userYBefore = await getAccount(provider.connection, userYAta);
			const lpMint = await getMint(provider.connection, pool.lpMint);

			// Calculate expected result
			const cp = new ConstantProduct(
				vaultXBefore.amount,
				vaultYBefore.amount,
				lpMint.supply,
				FEE,
				MINT_DECIMALS,
			);
			const swapAmountRaw = helper_uiAmountToRaw(SWAP_AMOUNT_Y, MINT_DECIMALS);
			const minSwapRaw = helper_uiAmountToRaw(MIN_SWAP, MINT_DECIMALS);
			// Need to pass true/1 to ConstantProductCurve js lib when passing false to CPI
			// Why???
			const expectedSwap = cp.swap(1, swapAmountRaw, minSwapRaw);

			// Do the swap
			await program.methods
				.swap(false, new anchor.BN(swapAmountRaw), new anchor.BN(minSwapRaw))
				.accountsStrict({
					user: user.publicKey,
					mintX,
					mintY,
					config: pool.config,
					mintLp: pool.lpMint,
					vaultX: pool.vaultX,
					vaultY: pool.vaultY,
					userX: userXAta,
					userY: userYAta,
					tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
					associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
					systemProgram: anchor.web3.SystemProgram.programId,
				})
				.signers([user])
				.rpc();

			// State after tx
			const config = await program.account.config.fetch(pool.config);
			const vaultXAfter = await getAccount(provider.connection, pool.vaultX);
			const vaultYAfter = await getAccount(provider.connection, pool.vaultY);
			const userXAfter = await getAccount(provider.connection, userXAta);
			const userYAfter = await getAccount(provider.connection, userYAta);

			// Checks
			const expectedFee = (swapAmountRaw * BigInt(config.fee)) / BigInt(MAX_BP);

			expect(expectedSwap.fee).to.eq(expectedFee);
			expect(userYAfter.amount).to.eq(
				userYBefore.amount - expectedSwap.deposit,
			);
			expect(userXAfter.amount).to.eq(
				userXBalanceBefore + expectedSwap.withdraw,
			);
			expect(vaultXAfter.amount).to.eq(
				vaultXBefore.amount - expectedSwap.withdraw,
			);
			expect(vaultYAfter.amount).to.eq(
				vaultYBefore.amount + expectedSwap.deposit,
			);
		});

		it("passes when slippage equals", async () => {
			const POOL_LIQUIDITY_X = 500;
			const POOL_LIQUIDITY_Y = 500;
			const USER_INITIAL_X = 0;
			const USER_INITIAL_Y = 100;
			const SWAP_AMOUNT_Y = 50;
			const FEE = FEE_BP_5;
			const MIN_SWAP_RAW = 45454546n;

			// Setup pool
			const { seed, pool } = helper_genRandomPool(program, mintX, mintY);
			await program.methods
				.initialize(seed, FEE, initializer.publicKey)
				.accountsStrict(
					helper_initializeAccounts(initializer, pool, mintX, mintY),
				)
				.rpc();

			await helper_setupPoolWithLiquidity(
				provider,
				program,
				pool,
				{ mint: mintX, amount: POOL_LIQUIDITY_X },
				{ mint: mintY, amount: POOL_LIQUIDITY_Y },
				MINT_DECIMALS,
			);

			// Create user
			const {
				user,
				atas: [userXAta, userYAta],
			} = await helper_genSwapUser(
				provider,
				[
					{ mint: mintX, amount: USER_INITIAL_X },
					{ mint: mintY, amount: USER_INITIAL_Y },
				],
				MINT_DECIMALS,
			);

			// State before tx
			const vaultXBefore = await getAccount(provider.connection, pool.vaultX);
			const vaultYBefore = await getAccount(provider.connection, pool.vaultY);
			const userXBalanceBefore = await helper_getAtaTokenBalance(
				provider.connection,
				userXAta,
			);
			const userYBefore = await getAccount(provider.connection, userYAta);
			const lpMint = await getMint(provider.connection, pool.lpMint);

			// Calculate expected result
			const cp = new ConstantProduct(
				vaultXBefore.amount,
				vaultYBefore.amount,
				lpMint.supply,
				FEE,
				MINT_DECIMALS,
			);
			const swapAmountRaw = helper_uiAmountToRaw(SWAP_AMOUNT_Y, MINT_DECIMALS);
			// Need to pass true/1 to ConstantProductCurve js lib when passing false to CPI
			// Why???
			const expectedSwap = cp.swap(1, swapAmountRaw, MIN_SWAP_RAW);

			// Do the swap
			await program.methods
				.swap(false, new anchor.BN(swapAmountRaw), new anchor.BN(MIN_SWAP_RAW))
				.accountsStrict({
					user: user.publicKey,
					mintX,
					mintY,
					config: pool.config,
					mintLp: pool.lpMint,
					vaultX: pool.vaultX,
					vaultY: pool.vaultY,
					userX: userXAta,
					userY: userYAta,
					tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
					associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
					systemProgram: anchor.web3.SystemProgram.programId,
				})
				.signers([user])
				.rpc();

			// State after tx
			const config = await program.account.config.fetch(pool.config);
			const vaultXAfter = await getAccount(provider.connection, pool.vaultX);
			const vaultYAfter = await getAccount(provider.connection, pool.vaultY);
			const userXAfter = await getAccount(provider.connection, userXAta);
			const userYAfter = await getAccount(provider.connection, userYAta);

			// Checks
			const expectedFee = (swapAmountRaw * BigInt(config.fee)) / BigInt(MAX_BP);

			expect(expectedSwap.fee).to.eq(expectedFee);
			expect(userYAfter.amount).to.eq(
				userYBefore.amount - expectedSwap.deposit,
			);
			expect(userXAfter.amount).to.eq(
				userXBalanceBefore + expectedSwap.withdraw,
			);
			expect(vaultXAfter.amount).to.eq(
				vaultXBefore.amount - expectedSwap.withdraw,
			);
			expect(vaultYAfter.amount).to.eq(
				vaultYBefore.amount + expectedSwap.deposit,
			);
		});

		it("fails when slippage exceeded", async () => {
			const POOL_LIQUIDITY_X = 500;
			const POOL_LIQUIDITY_Y = 500;
			const USER_INITIAL_X = 0;
			const USER_INITIAL_Y = 100;
			const SWAP_AMOUNT_Y = 50;
			const FEE = FEE_BP_5;
			const MIN_SWAP = 47;

			// Setup pool
			const { seed, pool } = helper_genRandomPool(program, mintX, mintY);
			await program.methods
				.initialize(seed, FEE, initializer.publicKey)
				.accountsStrict(
					helper_initializeAccounts(initializer, pool, mintX, mintY),
				)
				.rpc();

			await helper_setupPoolWithLiquidity(
				provider,
				program,
				pool,
				{ mint: mintX, amount: POOL_LIQUIDITY_X },
				{ mint: mintY, amount: POOL_LIQUIDITY_Y },
				MINT_DECIMALS,
			);

			// Create user
			const {
				user,
				atas: [userXAta, userYAta],
			} = await helper_genSwapUser(
				provider,
				[
					{ mint: mintX, amount: USER_INITIAL_X },
					{ mint: mintY, amount: USER_INITIAL_Y },
				],
				MINT_DECIMALS,
			);

			const swapAmountRaw = helper_uiAmountToRaw(SWAP_AMOUNT_Y, MINT_DECIMALS);
			const minSwapRaw = helper_uiAmountToRaw(MIN_SWAP, MINT_DECIMALS);

			// Do the swap
			try {
				await program.methods
					.swap(false, new anchor.BN(swapAmountRaw), new anchor.BN(minSwapRaw))
					.accountsStrict({
						user: user.publicKey,
						mintX,
						mintY,
						config: pool.config,
						mintLp: pool.lpMint,
						vaultX: pool.vaultX,
						vaultY: pool.vaultY,
						userX: userXAta,
						userY: userYAta,
						tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
						associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
						systemProgram: anchor.web3.SystemProgram.programId,
					})
					.signers([user])
					.rpc();
				expect.fail("should have failed");
			} catch (e) {
				expect(e.error.errorCode.number).to.eq(6003);
				expect(e.error.errorCode.code).to.eq("SlippageExceeded");
			}
		});

		it("fails swapping in empty pool", async () => {
			const POOL_LIQUIDITY_X = 0;
			const POOL_LIQUIDITY_Y = 0;
			const USER_INITIAL_X = 0;
			const USER_INITIAL_Y = 100;
			const SWAP_AMOUNT_Y = 50;
			const FEE = FEE_BP_5;
			const MIN_SWAP = 0;

			// Setup pool
			const { seed, pool } = helper_genRandomPool(program, mintX, mintY);
			await program.methods
				.initialize(seed, FEE, initializer.publicKey)
				.accountsStrict(
					helper_initializeAccounts(initializer, pool, mintX, mintY),
				)
				.rpc();

			await helper_setupPoolWithLiquidity(
				provider,
				program,
				pool,
				{ mint: mintX, amount: POOL_LIQUIDITY_X },
				{ mint: mintY, amount: POOL_LIQUIDITY_Y },
				MINT_DECIMALS,
			);

			// Create user
			const {
				user,
				atas: [userXAta, userYAta],
			} = await helper_genSwapUser(
				provider,
				[
					{ mint: mintX, amount: USER_INITIAL_X },
					{ mint: mintY, amount: USER_INITIAL_Y },
				],
				MINT_DECIMALS,
			);

			const swapAmountRaw = helper_uiAmountToRaw(SWAP_AMOUNT_Y, MINT_DECIMALS);
			const minSwapRaw = helper_uiAmountToRaw(MIN_SWAP, MINT_DECIMALS);

			// Do the swap
			try {
				await program.methods
					.swap(false, new anchor.BN(swapAmountRaw), new anchor.BN(minSwapRaw))
					.accountsStrict({
						user: user.publicKey,
						mintX,
						mintY,
						config: pool.config,
						mintLp: pool.lpMint,
						vaultX: pool.vaultX,
						vaultY: pool.vaultY,
						userX: userXAta,
						userY: userYAta,
						tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
						associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
						systemProgram: anchor.web3.SystemProgram.programId,
					})
					.signers([user])
					.rpc();
				expect.fail("should have failed");
			} catch (e) {
				expect(e.error.errorCode.number).to.eq(6008);
				expect(e.error.errorCode.code).to.eq("NoLiquidityInPool");
			}
		});

		it("fails with wrong vault mint", async () => {
			const POOL_LIQUIDITY_X = 500;
			const POOL_LIQUIDITY_Y = 500;
			const USER_INITIAL_X = 0;
			const USER_INITIAL_Y = 100;
			const SWAP_AMOUNT_Y = 50;
			const FEE = FEE_BP_5;
			const MIN_SWAP = 0;

			// Another pool
			const { seed: seedFake, pool: poolFake } = helper_genRandomPool(
				program,
				mintX,
				mintY,
			);
			await program.methods
				.initialize(seedFake, FEE, initializer.publicKey)
				.accountsStrict(
					helper_initializeAccounts(initializer, poolFake, mintX, mintY),
				)
				.rpc();
			// Setup actual pool
			const { seed, pool } = helper_genRandomPool(program, mintX, mintY);
			await program.methods
				.initialize(seed, FEE, initializer.publicKey)
				.accountsStrict(
					helper_initializeAccounts(initializer, pool, mintX, mintY),
				)
				.rpc();

			await helper_setupPoolWithLiquidity(
				provider,
				program,
				pool,
				{ mint: mintX, amount: POOL_LIQUIDITY_X },
				{ mint: mintY, amount: POOL_LIQUIDITY_Y },
				MINT_DECIMALS,
			);

			// Create user
			const {
				user,
				atas: [userXAta, userYAta],
			} = await helper_genSwapUser(
				provider,
				[
					{ mint: mintX, amount: USER_INITIAL_X },
					{ mint: mintY, amount: USER_INITIAL_Y },
				],
				MINT_DECIMALS,
			);

			const swapAmountRaw = helper_uiAmountToRaw(SWAP_AMOUNT_Y, MINT_DECIMALS);
			const minSwapRaw = helper_uiAmountToRaw(MIN_SWAP, MINT_DECIMALS);

			// Do the swap
			try {
				await program.methods
					.swap(false, new anchor.BN(swapAmountRaw), new anchor.BN(minSwapRaw))
					.accountsStrict({
						user: user.publicKey,
						mintX,
						mintY,
						config: pool.config,
						mintLp: pool.lpMint,
						vaultX: poolFake.vaultX, // Pass wrong vault
						vaultY: pool.vaultY,
						userX: userXAta,
						userY: userYAta,
						tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
						associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
						systemProgram: anchor.web3.SystemProgram.programId,
					})
					.signers([user])
					.rpc();
				expect.fail("should have failed");
			} catch (e) {
				expect(e.error.errorCode.number).to.eq(2015);
				expect(e.error.errorCode.code).to.eq("ConstraintTokenOwner");
			}
		});

		it("fails with wrong vault authority", async () => {
			const POOL_LIQUIDITY_X = 500;
			const POOL_LIQUIDITY_Y = 500;
			const USER_INITIAL_X = 0;
			const USER_INITIAL_Y = 100;
			const SWAP_AMOUNT_Y = 50;
			const FEE = FEE_BP_5;
			const MIN_SWAP = 0;

			// Fake vault
			const vaultXFake = await helper_createAtaAndMint({
				provider: provider,
				mint: mintX,
				owner: initializer.publicKey,
				amount: 1,
				allowOwnerOffCurve: false,
			});
			// Setup actual pool
			const { seed, pool } = helper_genRandomPool(program, mintX, mintY);
			await program.methods
				.initialize(seed, FEE, initializer.publicKey)
				.accountsStrict(
					helper_initializeAccounts(initializer, pool, mintX, mintY),
				)
				.rpc();

			await helper_setupPoolWithLiquidity(
				provider,
				program,
				pool,
				{ mint: mintX, amount: POOL_LIQUIDITY_X },
				{ mint: mintY, amount: POOL_LIQUIDITY_Y },
				MINT_DECIMALS,
			);

			// Create user
			const {
				user,
				atas: [userXAta, userYAta],
			} = await helper_genSwapUser(
				provider,
				[
					{ mint: mintX, amount: USER_INITIAL_X },
					{ mint: mintY, amount: USER_INITIAL_Y },
				],
				MINT_DECIMALS,
			);

			const swapAmountRaw = helper_uiAmountToRaw(SWAP_AMOUNT_Y, MINT_DECIMALS);
			const minSwapRaw = helper_uiAmountToRaw(MIN_SWAP, MINT_DECIMALS);

			// Do the swap
			try {
				await program.methods
					.swap(false, new anchor.BN(swapAmountRaw), new anchor.BN(minSwapRaw))
					.accountsStrict({
						user: user.publicKey,
						mintX,
						mintY,
						config: pool.config,
						mintLp: pool.lpMint,
						vaultX: vaultXFake, // Pass wrong vault
						vaultY: pool.vaultY,
						userX: userXAta,
						userY: userYAta,
						tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
						associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
						systemProgram: anchor.web3.SystemProgram.programId,
					})
					.signers([user])
					.rpc();
				expect.fail("should have failed");
			} catch (e) {
				expect(e.error.errorCode.number).to.eq(2015);
				expect(e.error.errorCode.code).to.eq("ConstraintTokenOwner");
			}
		});

		it("fails with same vault", async () => {
			const POOL_LIQUIDITY_X = 500;
			const POOL_LIQUIDITY_Y = 500;
			const USER_INITIAL_X = 0;
			const USER_INITIAL_Y = 100;
			const SWAP_AMOUNT_Y = 50;
			const FEE = FEE_BP_5;
			const MIN_SWAP = 0;

			// Setup pool
			const { seed, pool } = helper_genRandomPool(program, mintX, mintY);
			await program.methods
				.initialize(seed, FEE, initializer.publicKey)
				.accountsStrict(
					helper_initializeAccounts(initializer, pool, mintX, mintY),
				)
				.rpc();

			await helper_setupPoolWithLiquidity(
				provider,
				program,
				pool,
				{ mint: mintX, amount: POOL_LIQUIDITY_X },
				{ mint: mintY, amount: POOL_LIQUIDITY_Y },
				MINT_DECIMALS,
			);

			// Create user
			const {
				user,
				atas: [userXAta, userYAta],
			} = await helper_genSwapUser(
				provider,
				[
					{ mint: mintX, amount: USER_INITIAL_X },
					{ mint: mintY, amount: USER_INITIAL_Y },
				],
				MINT_DECIMALS,
			);

			const swapAmountRaw = helper_uiAmountToRaw(SWAP_AMOUNT_Y, MINT_DECIMALS);
			const minSwapRaw = helper_uiAmountToRaw(MIN_SWAP, MINT_DECIMALS);

			// Do the swap
			try {
				await program.methods
					.swap(false, new anchor.BN(swapAmountRaw), new anchor.BN(minSwapRaw))
					.accountsStrict({
						user: user.publicKey,
						mintX,
						mintY,
						config: pool.config,
						mintLp: pool.lpMint,
						vaultX: pool.vaultX,
						vaultY: pool.vaultX, // Pass same vault
						userX: userXAta,
						userY: userYAta,
						tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
						associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
						systemProgram: anchor.web3.SystemProgram.programId,
					})
					.signers([user])
					.rpc();
				expect.fail("should have failed");
			} catch (e) {
				expect(e.error.errorCode.number).to.eq(2009);
				expect(e.error.errorCode.code).to.eq("ConstraintAssociated");
			}
		});

		it("fails with wrong user ata (wrong mint)", async () => {
			const POOL_LIQUIDITY_X = 500;
			const POOL_LIQUIDITY_Y = 500;
			const USER_INITIAL_X = 0;
			const USER_INITIAL_Y = 100;
			const SWAP_AMOUNT_Y = 50;
			const FEE = FEE_BP_5;
			const MIN_SWAP = 0;

			// Setup pool
			const { seed, pool } = helper_genRandomPool(program, mintX, mintY);
			await program.methods
				.initialize(seed, FEE, initializer.publicKey)
				.accountsStrict(
					helper_initializeAccounts(initializer, pool, mintX, mintY),
				)
				.rpc();

			await helper_setupPoolWithLiquidity(
				provider,
				program,
				pool,
				{ mint: mintX, amount: POOL_LIQUIDITY_X },
				{ mint: mintY, amount: POOL_LIQUIDITY_Y },
				MINT_DECIMALS,
			);

			// Create user
			const {
				user,
				atas: [userXAta, userYAta],
			} = await helper_genSwapUser(
				provider,
				[
					{ mint: mintX, amount: USER_INITIAL_X },
					{ mint: mintY, amount: USER_INITIAL_Y },
				],
				MINT_DECIMALS,
			);

			const swapAmountRaw = helper_uiAmountToRaw(SWAP_AMOUNT_Y, MINT_DECIMALS);
			const minSwapRaw = helper_uiAmountToRaw(MIN_SWAP, MINT_DECIMALS);

			// Do the swap
			try {
				await program.methods
					.swap(false, new anchor.BN(swapAmountRaw), new anchor.BN(minSwapRaw))
					.accountsStrict({
						user: user.publicKey,
						mintX,
						mintY,
						config: pool.config,
						mintLp: pool.lpMint,
						vaultX: pool.vaultX,
						vaultY: pool.vaultY,
						userX: userYAta, // Swap user ATAs
						userY: userXAta,
						tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
						associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
						systemProgram: anchor.web3.SystemProgram.programId,
					})
					.signers([user])
					.rpc();
				expect.fail("should have failed");
			} catch (e) {
				expect(e.error.errorCode.number).to.eq(2014);
				expect(e.error.errorCode.code).to.eq("ConstraintTokenMint");
			}
		});

		it("fails with wrong user ata (wrong user)", async () => {
			const POOL_LIQUIDITY_X = 500;
			const POOL_LIQUIDITY_Y = 500;
			const USER_INITIAL_X = 0;
			const USER_INITIAL_Y = 100;
			const SWAP_AMOUNT_Y = 50;
			const FEE = FEE_BP_5;
			const MIN_SWAP = 0;

			// Setup pool
			const { seed, pool } = helper_genRandomPool(program, mintX, mintY);
			await program.methods
				.initialize(seed, FEE, initializer.publicKey)
				.accountsStrict(
					helper_initializeAccounts(initializer, pool, mintX, mintY),
				)
				.rpc();

			await helper_setupPoolWithLiquidity(
				provider,
				program,
				pool,
				{ mint: mintX, amount: POOL_LIQUIDITY_X },
				{ mint: mintY, amount: POOL_LIQUIDITY_Y },
				MINT_DECIMALS,
			);

			// Create user
			const {
				user,
				atas: [_userXAta, userYAta],
			} = await helper_genSwapUser(
				provider,
				[
					{ mint: mintX, amount: USER_INITIAL_X },
					{ mint: mintY, amount: USER_INITIAL_Y },
				],
				MINT_DECIMALS,
			);

			const {
				user: _user,
				atas: [userBXAta, _userBYAta],
			} = await helper_genSwapUser(
				provider,
				[
					{ mint: mintX, amount: USER_INITIAL_X },
					{ mint: mintY, amount: USER_INITIAL_Y },
				],
				MINT_DECIMALS,
			);

			const swapAmountRaw = helper_uiAmountToRaw(SWAP_AMOUNT_Y, MINT_DECIMALS);
			const minSwapRaw = helper_uiAmountToRaw(MIN_SWAP, MINT_DECIMALS);

			// Do the swap
			try {
				await program.methods
					.swap(false, new anchor.BN(swapAmountRaw), new anchor.BN(minSwapRaw))
					.accountsStrict({
						user: user.publicKey,
						mintX,
						mintY,
						config: pool.config,
						mintLp: pool.lpMint,
						vaultX: pool.vaultX,
						vaultY: pool.vaultY,
						userX: userBXAta, // Some other user's ATA
						userY: userYAta,
						tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
						associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
						systemProgram: anchor.web3.SystemProgram.programId,
					})
					.signers([user])
					.rpc();
				expect.fail("should have failed");
			} catch (e) {
				expect(e.toString()).to.include(
					"An account required by the instruction is missing",
				);
			}
		});

		it("multiple swaps", async () => {
			const POOL_LIQUIDITY_X = 500;
			const POOL_LIQUIDITY_Y = 500;
			const USER_INITIAL_X = 200;
			const USER_INITIAL_Y = 0;
			const SWAP_AMOUNT_X = 50;
			const FEE = FEE_BP_5;
			const MIN_SWAP = 0;

			// Setup pool
			const { seed, pool } = helper_genRandomPool(program, mintX, mintY);
			await program.methods
				.initialize(seed, FEE, initializer.publicKey)
				.accountsStrict(
					helper_initializeAccounts(initializer, pool, mintX, mintY),
				)
				.rpc();

			await helper_setupPoolWithLiquidity(
				provider,
				program,
				pool,
				{ mint: mintX, amount: POOL_LIQUIDITY_X },
				{ mint: mintY, amount: POOL_LIQUIDITY_Y },
				MINT_DECIMALS,
			);

			// Create user
			const {
				user,
				atas: [userXAta, userYAta],
			} = await helper_genSwapUser(
				provider,
				[
					{ mint: mintX, amount: USER_INITIAL_X },
					{ mint: mintY, amount: USER_INITIAL_Y },
				],
				MINT_DECIMALS,
			);

			// State before any swaps
			const vaultXInitial = await getAccount(provider.connection, pool.vaultX);
			const vaultYInitial = await getAccount(provider.connection, pool.vaultY);
			const initialK = vaultXInitial.amount * vaultYInitial.amount;

			const swapAmountRaw = helper_uiAmountToRaw(SWAP_AMOUNT_X, MINT_DECIMALS);
			const minSwapRaw = helper_uiAmountToRaw(MIN_SWAP, MINT_DECIMALS);

			// First swap
			await program.methods
				.swap(true, new anchor.BN(swapAmountRaw), new anchor.BN(minSwapRaw))
				.accountsStrict({
					user: user.publicKey,
					mintX,
					mintY,
					config: pool.config,
					mintLp: pool.lpMint,
					vaultX: pool.vaultX,
					vaultY: pool.vaultY,
					userX: userXAta,
					userY: userYAta,
					tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
					associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
					systemProgram: anchor.web3.SystemProgram.programId,
				})
				.signers([user])
				.rpc();

			// Second swap
			await program.methods
				.swap(true, new anchor.BN(swapAmountRaw), new anchor.BN(minSwapRaw))
				.accountsStrict({
					user: user.publicKey,
					mintX,
					mintY,
					config: pool.config,
					mintLp: pool.lpMint,
					vaultX: pool.vaultX,
					vaultY: pool.vaultY,
					userX: userXAta,
					userY: userYAta,
					tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
					associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
					systemProgram: anchor.web3.SystemProgram.programId,
				})
				.signers([user])
				.rpc();

			// Third swap
			await program.methods
				.swap(true, new anchor.BN(swapAmountRaw), new anchor.BN(minSwapRaw))
				.accountsStrict({
					user: user.publicKey,
					mintX,
					mintY,
					config: pool.config,
					mintLp: pool.lpMint,
					vaultX: pool.vaultX,
					vaultY: pool.vaultY,
					userX: userXAta,
					userY: userYAta,
					tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
					associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
					systemProgram: anchor.web3.SystemProgram.programId,
				})
				.signers([user])
				.rpc();

			// Fourth swap
			await program.methods
				.swap(true, new anchor.BN(swapAmountRaw), new anchor.BN(minSwapRaw))
				.accountsStrict({
					user: user.publicKey,
					mintX,
					mintY,
					config: pool.config,
					mintLp: pool.lpMint,
					vaultX: pool.vaultX,
					vaultY: pool.vaultY,
					userX: userXAta,
					userY: userYAta,
					tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
					associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
					systemProgram: anchor.web3.SystemProgram.programId,
				})
				.signers([user])
				.rpc();

			// Check invariant increased (due to fees)
			const vaultXFinal = await getAccount(provider.connection, pool.vaultX);
			const vaultYFinal = await getAccount(provider.connection, pool.vaultY);
			const finalK = vaultXFinal.amount * vaultYFinal.amount;

			expect(finalK > initialK).to.true;
		});
	});

	describe("Withdraw", () => {
		it("single LP withdrawal", async () => {
			const POOL_LIQUIDITY_X = 500;
			const POOL_LIQUIDITY_Y = 500;
			const LP_MIN_WITH_X = 500;
			const LP_MIN_WITH_Y = 500;
			const LP_WITH_LP = 500;
			const FEE = FEE_BP_5;

			// Setup pool
			const { seed, pool } = helper_genRandomPool(program, mintX, mintY);
			await program.methods
				.initialize(seed, FEE, initializer.publicKey)
				.accountsStrict(
					helper_initializeAccounts(initializer, pool, mintX, mintY),
				)
				.rpc();

			const { lp, lp_X_ata, lp_Y_ata, lp_LP_ata } =
				await helper_setupPoolWithLiquidity(
					provider,
					program,
					pool,
					{ mint: mintX, amount: POOL_LIQUIDITY_X },
					{ mint: mintY, amount: POOL_LIQUIDITY_Y },
					MINT_DECIMALS,
				);

			// Scale values
			const lp_min_with_x_scaled = helper_uiAmountToRaw(
				LP_MIN_WITH_X,
				MINT_DECIMALS,
			);
			const lp_min_with_y_scaled = helper_uiAmountToRaw(
				LP_MIN_WITH_Y,
				MINT_DECIMALS,
			);
			const lp_with_lp_scaled = helper_uiAmountToRaw(LP_WITH_LP, MINT_DECIMALS);

			// State before tx
			const vaultXBefore = await getAccount(provider.connection, pool.vaultX);
			const vaultYBefore = await getAccount(provider.connection, pool.vaultY);
			const mintLPBefore = await getMint(provider.connection, pool.lpMint);
			const userXBefore = await getAccount(provider.connection, lp_X_ata);
			const userYBefore = await getAccount(provider.connection, lp_Y_ata);
			const userLPBefore = await getAccount(provider.connection, lp_LP_ata);

			const cp = new ConstantProduct(
				vaultXBefore.amount,
				vaultYBefore.amount,
				mintLPBefore.supply,
				FEE,
				MINT_DECIMALS,
			);
			const expectedWithdraw = cp.withdraw_liquidity(
				lp_with_lp_scaled,
				lp_min_with_x_scaled,
				lp_min_with_y_scaled,
			);

			// Do the withdraw
			await program.methods
				.withdraw(
					new anchor.BN(lp_with_lp_scaled),
					new anchor.BN(lp_min_with_x_scaled),
					new anchor.BN(lp_min_with_y_scaled),
				)
				.accountsStrict({
					user: lp.publicKey,
					mintX,
					mintY,
					config: pool.config,
					mintLp: pool.lpMint,
					vaultX: pool.vaultX,
					vaultY: pool.vaultY,
					userX: lp_X_ata,
					userY: lp_Y_ata,
					userLp: lp_LP_ata,
					tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
					associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
					systemProgram: anchor.web3.SystemProgram.programId,
				})
				.signers([lp])
				.rpc();

			// State after tx
			const vaultXAfter = await getAccount(provider.connection, pool.vaultX);
			const vaultYAfter = await getAccount(provider.connection, pool.vaultY);
			const mintLPAfter = await getMint(provider.connection, pool.lpMint);
			const userXAfter = await getAccount(provider.connection, lp_X_ata);
			const userYAfter = await getAccount(provider.connection, lp_Y_ata);
			const userLPAfter = await getAccount(provider.connection, lp_LP_ata);

			// Checks
			expect(vaultXAfter.amount).to.eq(
				vaultXBefore.amount - expectedWithdraw.withdraw_x,
			);
			expect(vaultYAfter.amount).to.eq(
				vaultYBefore.amount - expectedWithdraw.withdraw_y,
			);
			expect(mintLPAfter.supply).to.eq(
				mintLPBefore.supply - expectedWithdraw.burn_l,
			);
			expect(userXAfter.amount).to.eq(
				userXBefore.amount + expectedWithdraw.withdraw_x,
			);
			expect(userYAfter.amount).to.eq(
				userYBefore.amount + expectedWithdraw.withdraw_x,
			);
			expect(userLPAfter.amount).to.eq(
				userLPBefore.amount - expectedWithdraw.burn_l,
			);
		});

		it("partial LP withdrawal", async () => {
			const POOL_LIQUIDITY_X = 500;
			const POOL_LIQUIDITY_Y = 500;
			const LP_MIN_WITH_X = 0;
			const LP_MIN_WITH_Y = 0;
			const LP_WITH_LP = 250;
			const FEE = FEE_BP_5;

			// Setup pool
			const { seed, pool } = helper_genRandomPool(program, mintX, mintY);
			await program.methods
				.initialize(seed, FEE, initializer.publicKey)
				.accountsStrict(
					helper_initializeAccounts(initializer, pool, mintX, mintY),
				)
				.rpc();

			const { lp, lp_X_ata, lp_Y_ata, lp_LP_ata } =
				await helper_setupPoolWithLiquidity(
					provider,
					program,
					pool,
					{ mint: mintX, amount: POOL_LIQUIDITY_X },
					{ mint: mintY, amount: POOL_LIQUIDITY_Y },
					MINT_DECIMALS,
				);

			// Scale values
			const lp_min_with_x_scaled = helper_uiAmountToRaw(
				LP_MIN_WITH_X,
				MINT_DECIMALS,
			);
			const lp_min_with_y_scaled = helper_uiAmountToRaw(
				LP_MIN_WITH_Y,
				MINT_DECIMALS,
			);
			const lp_with_lp_scaled = helper_uiAmountToRaw(LP_WITH_LP, MINT_DECIMALS);

			// State before tx
			const vaultXBefore = await getAccount(provider.connection, pool.vaultX);
			const vaultYBefore = await getAccount(provider.connection, pool.vaultY);
			const mintLPBefore = await getMint(provider.connection, pool.lpMint);
			const userXBefore = await getAccount(provider.connection, lp_X_ata);
			const userYBefore = await getAccount(provider.connection, lp_Y_ata);
			const userLPBefore = await getAccount(provider.connection, lp_LP_ata);

			const cp = new ConstantProduct(
				vaultXBefore.amount,
				vaultYBefore.amount,
				mintLPBefore.supply,
				FEE,
				MINT_DECIMALS,
			);
			const expectedWithdraw = cp.withdraw_liquidity(
				lp_with_lp_scaled,
				lp_min_with_x_scaled,
				lp_min_with_y_scaled,
			);

			// Do the withdraw
			await program.methods
				.withdraw(
					new anchor.BN(lp_with_lp_scaled),
					new anchor.BN(lp_min_with_x_scaled),
					new anchor.BN(lp_min_with_y_scaled),
				)
				.accountsStrict({
					user: lp.publicKey,
					mintX,
					mintY,
					config: pool.config,
					mintLp: pool.lpMint,
					vaultX: pool.vaultX,
					vaultY: pool.vaultY,
					userX: lp_X_ata,
					userY: lp_Y_ata,
					userLp: lp_LP_ata,
					tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
					associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
					systemProgram: anchor.web3.SystemProgram.programId,
				})
				.signers([lp])
				.rpc();

			// State after tx
			const vaultXAfter = await getAccount(provider.connection, pool.vaultX);
			const vaultYAfter = await getAccount(provider.connection, pool.vaultY);
			const mintLPAfter = await getMint(provider.connection, pool.lpMint);
			const userXAfter = await getAccount(provider.connection, lp_X_ata);
			const userYAfter = await getAccount(provider.connection, lp_Y_ata);
			const userLPAfter = await getAccount(provider.connection, lp_LP_ata);

			// Checks
			expect(vaultXAfter.amount).to.eq(
				vaultXBefore.amount - expectedWithdraw.withdraw_x,
			);
			expect(vaultYAfter.amount).to.eq(
				vaultYBefore.amount - expectedWithdraw.withdraw_y,
			);
			expect(mintLPAfter.supply).to.eq(
				mintLPBefore.supply - expectedWithdraw.burn_l,
			);
			expect(userXAfter.amount).to.eq(
				userXBefore.amount + expectedWithdraw.withdraw_x,
			);
			expect(userYAfter.amount).to.eq(
				userYBefore.amount + expectedWithdraw.withdraw_x,
			);
			expect(userLPAfter.amount).to.eq(
				userLPBefore.amount - expectedWithdraw.burn_l,
			);
		});

		it("fails withdrawing more LP than owned", async () => {
			const POOL_LIQUIDITY_X = 500;
			const POOL_LIQUIDITY_Y = 500;
			const LP_MIN_WITH_X = 0;
			const LP_MIN_WITH_Y = 0;
			const LP_WITH_LP = 600;
			const FEE = FEE_BP_5;

			// Setup pool
			const { seed, pool } = helper_genRandomPool(program, mintX, mintY);
			await program.methods
				.initialize(seed, FEE, initializer.publicKey)
				.accountsStrict(
					helper_initializeAccounts(initializer, pool, mintX, mintY),
				)
				.rpc();

			const { lp, lp_X_ata, lp_Y_ata, lp_LP_ata } =
				await helper_setupPoolWithLiquidity(
					provider,
					program,
					pool,
					{ mint: mintX, amount: POOL_LIQUIDITY_X },
					{ mint: mintY, amount: POOL_LIQUIDITY_Y },
					MINT_DECIMALS,
				);

			// Scale values
			const lp_min_with_x_scaled = helper_uiAmountToRaw(
				LP_MIN_WITH_X,
				MINT_DECIMALS,
			);
			const lp_min_with_y_scaled = helper_uiAmountToRaw(
				LP_MIN_WITH_Y,
				MINT_DECIMALS,
			);
			const lp_with_lp_scaled = helper_uiAmountToRaw(LP_WITH_LP, MINT_DECIMALS);

			try {
				// Do the withdraw
				await program.methods
					.withdraw(
						new anchor.BN(lp_with_lp_scaled),
						new anchor.BN(lp_min_with_x_scaled),
						new anchor.BN(lp_min_with_y_scaled),
					)
					.accountsStrict({
						user: lp.publicKey,
						mintX,
						mintY,
						config: pool.config,
						mintLp: pool.lpMint,
						vaultX: pool.vaultX,
						vaultY: pool.vaultY,
						userX: lp_X_ata,
						userY: lp_Y_ata,
						userLp: lp_LP_ata,
						tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
						associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
						systemProgram: anchor.web3.SystemProgram.programId,
					})
					.signers([lp])
					.rpc();
			} catch (e) {
				expect(e.error.errorCode.number).to.eq(6016);
				expect(e.error.errorCode.code).to.eq("InsufficientBalance");
			}
		});
	});

	describe("Combos", () => {
		it("deposit swap withdraw", async () => {
			// Issue: Js impl of ConstantProduct holds back fees if chaining ops i.e.
			// Deposit -> Swap -> Withdraw
			// Instead of allowing LP to empty pool on withdraw, it retains the fee.
			const LP_INITIAL_X = 1000;
			const LP_INITIAL_Y = 1000;
			const LP_INITIAL_LP = 1000;
			const USER_INITIAL_X = 100;
			const USER_INITIAL_Y = 0;
			const SWAP_AMOUNT_X = 50;
			const FEE = FEE_BP_5;

			// Setup pool
			const { seed, pool } = helper_genRandomPool(program, mintX, mintY);
			await program.methods
				.initialize(seed, FEE, initializer.publicKey)
				.accountsStrict(
					helper_initializeAccounts(initializer, pool, mintX, mintY),
				)
				.rpc();

			// Setup liquidity provider
			const lp = anchor.web3.Keypair.generate();
			await helper_airdrop(provider, lp.publicKey, 10);

			const lp_initial_x_scaled = helper_uiAmountToRaw(
				LP_INITIAL_X,
				MINT_DECIMALS,
			);
			const lp_initial_y_scaled = helper_uiAmountToRaw(
				LP_INITIAL_Y,
				MINT_DECIMALS,
			);
			const lp_initial_lp_scaled = helper_uiAmountToRaw(
				LP_INITIAL_LP,
				MINT_DECIMALS,
			);

			const lp_X_ata = await helper_createAtaAndMint({
				provider,
				mint: mintX,
				owner: lp.publicKey,
				amount: lp_initial_x_scaled,
				allowOwnerOffCurve: false,
			});
			const lp_Y_ata = await helper_createAtaAndMint({
				provider,
				mint: mintY,
				owner: lp.publicKey,
				amount: lp_initial_y_scaled,
				allowOwnerOffCurve: false,
			});
			const lp_LP_ata = getAssociatedTokenAddressSync(
				pool.lpMint,
				lp.publicKey,
			);

			// Setup user
			const swap_amount_x_scaled = helper_uiAmountToRaw(
				SWAP_AMOUNT_X,
				MINT_DECIMALS,
			);
			const {
				user,
				atas: [user_X_ata, user_Y_ata],
			} = await helper_genSwapUser(
				provider,
				[
					{ mint: mintX, amount: USER_INITIAL_X },
					{ mint: mintY, amount: USER_INITIAL_Y },
				],
				MINT_DECIMALS,
			);

			// State before txns
			const vaultXBefore_balance = await helper_getAtaTokenBalance(
				provider.connection,
				pool.vaultX,
			);
			const vaultYBefore_balance = await helper_getAtaTokenBalance(
				provider.connection,
				pool.vaultY,
			);
			const lpXBefore = await getAccount(provider.connection, lp_X_ata);
			const lpYBefore = await getAccount(provider.connection, lp_Y_ata);
			const lpLPBefore_balance = await helper_getAtaTokenBalance(
				provider.connection,
				lp_LP_ata,
			);
			const userXBefore = await getAccount(provider.connection, user_X_ata);
			const userYBefore_balance = await helper_getAtaTokenBalance(
				provider.connection,
				user_Y_ata,
			);

			// Make deposit
			await program.methods
				.deposit(
					new anchor.BN(lp_initial_lp_scaled),
					new anchor.BN(lp_initial_x_scaled),
					new anchor.BN(lp_initial_y_scaled),
				)
				.accountsStrict({
					user: lp.publicKey,
					mintX: mintX,
					mintY: mintY,
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

			const depositResult = {
				deposit_x: lp_initial_x_scaled,
				deposit_y: lp_initial_y_scaled,
				mint_l: lp_initial_lp_scaled,
			};

			// Make Swap
			await program.methods
				.swap(true, new anchor.BN(swap_amount_x_scaled), new anchor.BN(0))
				.accountsStrict({
					user: user.publicKey,
					mintX,
					mintY,
					config: pool.config,
					mintLp: pool.lpMint,
					vaultX: pool.vaultX,
					vaultY: pool.vaultY,
					userX: user_X_ata,
					userY: user_Y_ata,
					tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
					associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
					systemProgram: anchor.web3.SystemProgram.programId,
				})
				.signers([user])
				.rpc();

			const swapResult = new ConstantProduct(
				lp_initial_x_scaled,
				lp_initial_y_scaled,
				lp_initial_lp_scaled,
				FEE,
				MINT_DECIMALS,
			).swap(0, swap_amount_x_scaled, 0n);

			// Make withdraw
			await program.methods
				.withdraw(
					new anchor.BN(lp_initial_lp_scaled),
					new anchor.BN(1_000_000),
					new anchor.BN(1_000_000),
				)
				.accountsStrict({
					user: lp.publicKey,
					mintX,
					mintY,
					config: pool.config,
					mintLp: pool.lpMint,
					vaultX: pool.vaultX,
					vaultY: pool.vaultY,
					userX: lp_X_ata,
					userY: lp_Y_ata,
					userLp: lp_LP_ata,
					tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
					associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
					systemProgram: anchor.web3.SystemProgram.programId,
				})
				.signers([lp])
				.rpc();

			const withdrawResult = new ConstantProduct(
				lp_initial_x_scaled + swapResult.deposit,
				lp_initial_y_scaled - swapResult.withdraw,
				lp_initial_lp_scaled,
				FEE,
				MINT_DECIMALS,
			).withdraw_liquidity(lp_initial_lp_scaled, 0n, 0n);

			// State after
			const vaultXAfter = await getAccount(provider.connection, pool.vaultX);
			const vaultYAfter = await getAccount(provider.connection, pool.vaultY);
			const lpXAfter = await getAccount(provider.connection, lp_X_ata);
			const lpYAfter = await getAccount(provider.connection, lp_Y_ata);
			const lpLPAfter = await getAccount(provider.connection, lp_LP_ata);
			const userXAfter = await getAccount(provider.connection, user_X_ata);
			const userYAfter = await getAccount(provider.connection, user_Y_ata);

			// Checks
			expect(vaultXAfter.amount).to.eq(
				vaultXBefore_balance +
					depositResult.deposit_x +
					swapResult.deposit -
					withdrawResult.withdraw_x,
			);
			expect(vaultYAfter.amount).to.eq(
				vaultYBefore_balance +
					depositResult.deposit_y -
					swapResult.withdraw -
					withdrawResult.withdraw_y,
			);

			expect(lpXAfter.amount).to.eq(
				lpXBefore.amount - depositResult.deposit_x + withdrawResult.withdraw_x,
			);
			expect(lpYAfter.amount).to.eq(
				lpYBefore.amount - depositResult.deposit_y + withdrawResult.withdraw_y,
			);
			expect(lpLPAfter.amount).to.eq(
				lpLPBefore_balance + depositResult.mint_l - withdrawResult.burn_l,
			);

			expect(userXAfter.amount).to.eq(userXBefore.amount - swapResult.deposit);
			expect(userYAfter.amount).to.eq(
				userYBefore_balance + swapResult.withdraw,
			);
		});
	});
});
