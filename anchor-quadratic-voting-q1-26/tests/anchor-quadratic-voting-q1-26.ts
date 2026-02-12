import type { Program } from "@coral-xyz/anchor";
import * as anchor from "@coral-xyz/anchor";
import { Keypair, SystemProgram } from "@solana/web3.js";
import { BN } from "bn.js";
import { expect } from "chai";
import type { AnchorQuadraticVotingQ126 } from "../target/types/anchor_quadratic_voting_q1_26";
import {
	type HelperDao,
	type HelperProposal,
	helper_createDao,
	helper_createMint,
	helper_createProposal,
	helper_createVoter,
} from "./helpers";

describe("anchor-quadratic-voting-q1-26", async () => {
	// Configure the client to use the local cluster.
	const provider = anchor.AnchorProvider.env();
	anchor.setProvider(provider);

	const program = anchor.workspace
		.anchorQuadraticVotingQ126 as Program<AnchorQuadraticVotingQ126>;

	const MINT_DECIMALS = 6;
	const DAO_NAME = "Dao Alpha";
	const PROPOSALS = [
		{ id: 0n, metadata: "Proposal Alpha" },
		{ id: 1n, metadata: "Proposal Beta" },
		{ id: 2n, metadata: "Proposal Charlie" },
	];

	const initializer = provider.wallet;
	const creator = new Keypair();

	let dao: HelperDao;
	let proposal0: HelperProposal;
	let proposal1: HelperProposal;

	before("Setup", async () => {
		// Fund accounts
		await Promise.all(
			[initializer.publicKey, creator.publicKey].map(async (pk) => {
				return provider.connection.requestAirdrop(
					pk,
					10_000 * anchor.web3.LAMPORTS_PER_SOL,
				);
			}),
		);

		// Create mint
		const mint = await helper_createMint({
			provider,
			payer: initializer.payer,
			mintAuthority: initializer.publicKey,
			freezeAuthority: initializer.publicKey,
			decimals: MINT_DECIMALS,
		});

		// Create DAO
		dao = helper_createDao({
			name: DAO_NAME,
			creator: creator.publicKey,
			mint: mint,
			program: program,
		});
	});

	describe("DAO Initialization", () => {
		it("Should initialize a DAO", async () => {
			await program.methods
				.initDao(DAO_NAME)
				.accountsStrict({
					creator: creator.publicKey,
					dao: dao.daoPDA,
					mint: dao.mint.mint,
					systemProgram: SystemProgram.programId,
				})
				.signers([creator])
				.rpc();

			const daoAccount = await program.account.dao.fetch(dao.daoPDA);
			expect(daoAccount.name).to.equal(DAO_NAME);
			expect(daoAccount.authority.toBase58()).to.equal(
				creator.publicKey.toBase58(),
			);
			expect(daoAccount.proposalCount.eq(new BN(0))).to.true;
		});
	});

	describe("Proposal0 Lifecycle", () => {
		before("Initialize Proposal", async () => {
			proposal0 = await helper_createProposal({
				metadata: PROPOSALS[0].metadata,
				dao: dao,
				creator: creator.publicKey,
				program: program,
			});

			await program.methods
				.initProposal(proposal0.metadata)
				.accountsStrict({
					dao: proposal0.dao.daoPDA,
					proposal: proposal0.proposalPDA,
					creator: creator.publicKey,
					systemProgram: SystemProgram.programId,
				})
				.signers([creator])
				.rpc();
		});

		it("Should allow voting for proposal (1 token)", async () => {
			const user1 = await helper_createVoter({
				user: null,
				proposal: proposal0,
				amount: 1,
				connection: provider.connection,
				payer: initializer.payer,
				program: program,
			});

			await program.methods
				.castVote(1)
				.accountsStrict({
					voter: user1.user.publicKey,
					mint: proposal0.dao.mint.mint,
					dao: proposal0.dao.daoPDA,
					proposal: proposal0.proposalPDA,
					vote: user1.userVotePDA,
					voterTokenAccount: user1.userVoteATA,
					systemProgram: SystemProgram.programId,
				})
				.signers([user1.user])
				.rpc();

			const voteAccount = await program.account.vote.fetch(user1.userVotePDA);
			expect(voteAccount.voteCredits.toNumber()).to.equal(1);
			const proposalAccount = await program.account.proposal.fetch(
				proposal0.proposalPDA,
			);
			expect(proposalAccount.yesVoteCount.toNumber()).to.eq(1);
		});

		it("Should allow voting for proposal (4 tokens)", async () => {
			const user2 = await helper_createVoter({
				user: null,
				proposal: proposal0,
				amount: 4,
				connection: provider.connection,
				payer: initializer.payer,
				program: program,
			});

			await program.methods
				.castVote(1)
				.accountsStrict({
					voter: user2.user.publicKey,
					mint: proposal0.dao.mint.mint,
					dao: proposal0.dao.daoPDA,
					proposal: proposal0.proposalPDA,
					vote: user2.userVotePDA,
					voterTokenAccount: user2.userVoteATA,
					systemProgram: SystemProgram.programId,
				})
				.signers([user2.user])
				.rpc();

			const voteAccount = await program.account.vote.fetch(user2.userVotePDA);
			expect(voteAccount.voteCredits.toNumber()).to.equal(2);
			const proposalAccount = await program.account.proposal.fetch(
				proposal0.proposalPDA,
			);
			expect(proposalAccount.yesVoteCount.toNumber()).to.eq(3);
		});

		it("Should allow voting against proposal (4 tokens)", async () => {
			const user3 = await helper_createVoter({
				user: null,
				proposal: proposal0,
				amount: 4,
				connection: provider.connection,
				payer: initializer.payer,
				program: program,
			});

			await program.methods
				.castVote(0)
				.accountsStrict({
					voter: user3.user.publicKey,
					mint: proposal0.dao.mint.mint,
					dao: proposal0.dao.daoPDA,
					proposal: proposal0.proposalPDA,
					vote: user3.userVotePDA,
					voterTokenAccount: user3.userVoteATA,
					systemProgram: SystemProgram.programId,
				})
				.signers([user3.user])
				.rpc();

			const voteAccount = await program.account.vote.fetch(user3.userVotePDA);
			expect(voteAccount.voteCredits.toNumber()).to.equal(2);
			const proposalAccount = await program.account.proposal.fetch(
				proposal0.proposalPDA,
			);
			expect(proposalAccount.noVoteCount.toNumber()).to.eq(2);
		});

		it("Should finalize proposal with correct vote counts", async () => {
			await program.methods
				.finalizeProposal()
				.accountsStrict({
					dao: dao.daoPDA,
					proposal: proposal0.proposalPDA,
					creator: creator.publicKey,
					systemProgram: SystemProgram.programId,
				})
				.signers([creator])
				.rpc();

			const fp = await program.account.proposal.fetch(proposal0.proposalPDA);

			expect(fp.yesVoteCount.toNumber()).to.eq(3);
			expect(fp.noVoteCount.toNumber()).to.eq(2);
			expect(fp.state.active).to.not.exist;
			expect(fp.state.passed).to.exist;
			expect(fp.state.rejected).to.not.exist;
		});
	});

	describe("Proposal1 Lifecycle", () => {
		before("Initialize Proposal", async () => {
			proposal1 = await helper_createProposal({
				metadata: PROPOSALS[1].metadata,
				dao: dao,
				creator: creator.publicKey,
				program: program,
			});

			await program.methods
				.initProposal(proposal1.metadata)
				.accountsStrict({
					dao: proposal1.dao.daoPDA,
					proposal: proposal1.proposalPDA,
					creator: creator.publicKey,
					systemProgram: SystemProgram.programId,
				})
				.signers([creator])
				.rpc();
		});

		it("Should allow voting for proposal (1 token)", async () => {
			const user1 = await helper_createVoter({
				user: null,
				proposal: proposal1,
				amount: 1,
				connection: provider.connection,
				payer: initializer.payer,
				program: program,
			});

			await program.methods
				.castVote(1)
				.accountsStrict({
					voter: user1.user.publicKey,
					mint: proposal1.dao.mint.mint,
					dao: proposal1.dao.daoPDA,
					proposal: proposal1.proposalPDA,
					vote: user1.userVotePDA,
					voterTokenAccount: user1.userVoteATA,
					systemProgram: SystemProgram.programId,
				})
				.signers([user1.user])
				.rpc();

			const voteAccount = await program.account.vote.fetch(user1.userVotePDA);
			expect(voteAccount.voteCredits.toNumber()).to.equal(1);
			const proposalAccount = await program.account.proposal.fetch(
				proposal1.proposalPDA,
			);
			expect(proposalAccount.yesVoteCount.toNumber()).to.eq(1);
		});

		it("Should allow voting against proposal (4 tokens)", async () => {
			const user2 = await helper_createVoter({
				user: null,
				proposal: proposal1,
				amount: 4,
				connection: provider.connection,
				payer: initializer.payer,
				program: program,
			});

			await program.methods
				.castVote(0)
				.accountsStrict({
					voter: user2.user.publicKey,
					mint: proposal1.dao.mint.mint,
					dao: proposal1.dao.daoPDA,
					proposal: proposal1.proposalPDA,
					vote: user2.userVotePDA,
					voterTokenAccount: user2.userVoteATA,
					systemProgram: SystemProgram.programId,
				})
				.signers([user2.user])
				.rpc();

			const voteAccount = await program.account.vote.fetch(user2.userVotePDA);
			expect(voteAccount.voteCredits.toNumber()).to.equal(2);
			const proposalAccount = await program.account.proposal.fetch(
				proposal1.proposalPDA,
			);
			expect(proposalAccount.noVoteCount.toNumber()).to.eq(2);
		});

		it("Should allow voting against proposal (4 tokens)", async () => {
			const user3 = await helper_createVoter({
				user: null,
				proposal: proposal1,
				amount: 4,
				connection: provider.connection,
				payer: initializer.payer,
				program: program,
			});

			await program.methods
				.castVote(0)
				.accountsStrict({
					voter: user3.user.publicKey,
					mint: proposal1.dao.mint.mint,
					dao: proposal1.dao.daoPDA,
					proposal: proposal1.proposalPDA,
					vote: user3.userVotePDA,
					voterTokenAccount: user3.userVoteATA,
					systemProgram: SystemProgram.programId,
				})
				.signers([user3.user])
				.rpc();

			const voteAccount = await program.account.vote.fetch(user3.userVotePDA);
			expect(voteAccount.voteCredits.toNumber()).to.equal(2);
			const proposalAccount = await program.account.proposal.fetch(
				proposal1.proposalPDA,
			);
			expect(proposalAccount.noVoteCount.toNumber()).to.eq(4);
		});

		it("Should finalize proposal with correct vote counts", async () => {
			await program.methods
				.finalizeProposal()
				.accountsStrict({
					dao: dao.daoPDA,
					proposal: proposal1.proposalPDA,
					creator: creator.publicKey,
					systemProgram: SystemProgram.programId,
				})
				.signers([creator])
				.rpc();

			const fp = await program.account.proposal.fetch(proposal1.proposalPDA);

			expect(fp.yesVoteCount.toNumber()).to.eq(1);
			expect(fp.noVoteCount.toNumber()).to.eq(4);
			expect(fp.state.active).to.not.exist;
			expect(fp.state.passed).to.not.exist;
			expect(fp.state.rejected).to.exist;
		});
	});

	describe("Error Cases", () => {
		it("Should fail to vote on finalized proposal", async () => {
			const user4 = await helper_createVoter({
				user: null,
				proposal: proposal0,
				amount: 1,
				connection: provider.connection,
				payer: initializer.payer,
				program: program,
			});

			try {
				await program.methods
					.castVote(1)
					.accountsStrict({
						voter: user4.user.publicKey,
						mint: proposal0.dao.mint.mint,
						dao: proposal0.dao.daoPDA,
						proposal: proposal0.proposalPDA,
						vote: user4.userVotePDA,
						voterTokenAccount: user4.userVoteATA,
						systemProgram: SystemProgram.programId,
					})
					.signers([user4.user])
					.rpc();

				expect.fail("Should have failed to vote on finalized proposal");
			} catch (e) {
				expect(e.error.errorCode).to.deep.eq({
					code: "ProposalNotActive",
					number: 6009,
				});
			}
		});
	});
});
