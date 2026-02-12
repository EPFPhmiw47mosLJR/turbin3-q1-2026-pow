import type { AnchorProvider, Program } from "@coral-xyz/anchor";
import {
	createMint,
	getOrCreateAssociatedTokenAccount,
	mintTo,
} from "@solana/spl-token";
import {
	type Connection,
	Keypair,
	LAMPORTS_PER_SOL,
	PublicKey,
	type Signer,
} from "@solana/web3.js";
import type { AnchorQuadraticVotingQ126 } from "../target/types/anchor_quadratic_voting_q1_26";

// --- Types ---

export type HelperDao = {
	name: string;
	daoPDA: PublicKey;
	creator: PublicKey;
	mint: HelperMint;
};

export type HelperProposal = {
	metadata: string;
	dao: HelperDao;
	creator: PublicKey;
	proposalPDA: PublicKey;
};

export type HelperMint = {
	mint: PublicKey;
	mintAuthority: PublicKey;
	freezeAuthority: PublicKey;
	decimals: number;
};

export type HelperVoter = {
	user: Keypair;
	userVotePDA: PublicKey;
	userVoteATA: PublicKey;
};

// --- Functions ---

export function helper_u64ToLeBuffer(value: bigint): Buffer {
	const buf = Buffer.alloc(8);
	buf.writeBigUInt64LE(value);
	return buf;
}

export function helper_getDaoPDA({
	name,
	creator,
	program,
}: {
	name: string;
	creator: PublicKey;
	program: Program<AnchorQuadraticVotingQ126>;
}): [PublicKey, number] {
	return PublicKey.findProgramAddressSync(
		[Buffer.from("dao"), creator.toBuffer(), Buffer.from(name)],
		program.programId,
	);
}

export function helper_getProposalPDA({
	dao,
	proposalId,
	program,
}: {
	dao: PublicKey;
	proposalId: bigint;
	program: Program<AnchorQuadraticVotingQ126>;
}): [PublicKey, number] {
	return PublicKey.findProgramAddressSync(
		[Buffer.from("proposal"), dao.toBuffer(), helper_u64ToLeBuffer(proposalId)],
		program.programId,
	);
}

export function helper_getUserVotePDA({
	user,
	proposal,
	program,
}: {
	user: PublicKey;
	proposal: PublicKey;
	program: Program<AnchorQuadraticVotingQ126>;
}): [PublicKey, number] {
	return PublicKey.findProgramAddressSync(
		[Buffer.from("vote"), proposal.toBuffer(), user.toBuffer()],
		program.programId,
	);
}

export async function helper_createMint({
	provider,
	payer,
	mintAuthority,
	freezeAuthority,
	decimals,
}: {
	provider: AnchorProvider;
	payer: Signer;
	mintAuthority: PublicKey;
	freezeAuthority: PublicKey;
	decimals: number;
}): Promise<HelperMint> {
	const mint = await createMint(
		provider.connection,
		payer,
		mintAuthority,
		freezeAuthority,
		decimals,
	);

	return {
		mint,
		mintAuthority,
		freezeAuthority,
		decimals,
	};
}

export function helper_createDao({
	name,
	creator,
	mint,
	program,
}: {
	name: string;
	creator: PublicKey;
	mint: HelperMint;
	program: Program<AnchorQuadraticVotingQ126>;
}): HelperDao {
	const [daoPDA, _] = helper_getDaoPDA({ name, creator, program });

	return {
		name,
		daoPDA,
		creator,
		mint,
	};
}

export async function helper_createProposal({
	metadata,
	dao,
	creator,
	program,
}: {
	metadata: string;
	dao: HelperDao;
	creator: PublicKey;
	program: Program<AnchorQuadraticVotingQ126>;
}): Promise<HelperProposal> {
	const daoAccount = await program.account.dao.fetch(dao.daoPDA);

	const proposalId = BigInt(daoAccount.proposalCount.toNumber());

	const [proposalPDA, _] = helper_getProposalPDA({
		dao: dao.daoPDA,
		proposalId,
		program,
	});

	return {
		metadata,
		dao,
		creator,
		proposalPDA,
	};
}

export async function helper_createVoter({
	user,
	proposal,
	amount,
	connection,
	payer,
	program,
}: {
	user: Keypair | null;
	proposal: HelperProposal;
	amount: number | null;
	connection: Connection;
	payer: Signer;
	program: Program<AnchorQuadraticVotingQ126>;
}): Promise<HelperVoter> {
	if (!user) {
		user = new Keypair();
		await connection.requestAirdrop(user.publicKey, 10_000 * LAMPORTS_PER_SOL);
	}

	const [userVotePDA, _] = helper_getUserVotePDA({
		user: user.publicKey,
		proposal: proposal.proposalPDA,
		program,
	});

	const userVoteATA = await getOrCreateAssociatedTokenAccount(
		connection,
		payer,
		proposal.dao.mint.mint,
		user.publicKey,
		false,
	);

	if (amount > 0) {
		await mintTo(
			connection,
			payer,
			proposal.dao.mint.mint,
			userVoteATA.address,
			proposal.dao.mint.mintAuthority,
			BigInt(amount * 10 ** proposal.dao.mint.decimals),
		);
	}

	return {
		user: user,
		userVotePDA: userVotePDA,
		userVoteATA: userVoteATA.address,
	};
}
