// Transfer transaction successful: 2LXHjWdfyAebpaQrTYi6bLWNWRgDfGwDAFXwHgFd5mhLy8BY7q4kDqv6KemZZD89nsjjjdwtaBjAejw8B7FdKRBG

import { Commitment, Connection, Keypair, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import wallet from "../turbin3-wallet.json";
import { getOrCreateAssociatedTokenAccount, transfer } from "@solana/spl-token";

// We're going to import our keypair from the wallet file
const keypair = Keypair.fromSecretKey(new Uint8Array(wallet));

//Create a Solana devnet connection
const commitment: Commitment = "confirmed";
const connection = new Connection("https://api.devnet.solana.com", commitment);

// Mint address
const mint = new PublicKey("33VpJJMwNzSHWAPrBBYCZoBMyVd4uvbqV9CLv43XwTwd");

// Recipient address
const to = new PublicKey("berg7BKPHZWPiAdjpitQaWCfTELaKjQ6x7e9nDSu23d");

(async () => {
	try {
		// Get the token account of the fromWallet address, and if it does not exist, create it
		const fromWalletATA = await getOrCreateAssociatedTokenAccount(
			connection,
			keypair,
			mint,
			keypair.publicKey,
		);

		// Get the token account of the toWallet address, and if it does not exist, create it
		const toWalletATA = await getOrCreateAssociatedTokenAccount(
			connection,
			keypair,
			mint,
			to,
		);

		// Transfer the new token to the "toTokenAccount" we just created
		const transferSignature = await transfer(
			connection,
			keypair,
			fromWalletATA.address,
			toWalletATA.address,
			keypair,
			1_000_000n,
		);
		console.log(`Transfer transaction successful: ${transferSignature}`);
	} catch (e) {
		console.error(`Oops, something went wrong: ${e}`);
	}
})();
