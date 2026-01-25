// Your ata is: EwhQTdQGt4ENu88xkpqFtcZWQ1fD5bKZegWDQw5pQzQW
// Your mint txid: NJVfubARMszVjnqRTKwjYAGZBueWUFM9mCrSnHTVXEuWC6oGRhv3i5qXjMK21iTi5YLcXWBZPBYxqAw14e2pKYj

import { Keypair, PublicKey, Connection, Commitment } from "@solana/web3.js";
import { getOrCreateAssociatedTokenAccount, mintTo } from "@solana/spl-token";
import wallet from "../turbin3-wallet.json";

// Import our keypair from the wallet file
const keypair = Keypair.fromSecretKey(new Uint8Array(wallet));

//Create a Solana devnet connection
const commitment: Commitment = "confirmed";
const connection = new Connection("https://api.devnet.solana.com", commitment);

const token_decimals = 1_000_000n;

// Mint address
const mint = new PublicKey("33VpJJMwNzSHWAPrBBYCZoBMyVd4uvbqV9CLv43XwTwd");

(async () => {
	try {
		// Create an ATA
		const ata = await getOrCreateAssociatedTokenAccount(
			connection,
			keypair,
			mint,
			keypair.publicKey,
		);
		console.log(`Your ata is: ${ata.address.toBase58()}`);

		// Mint to ATA
		const mintTx = await mintTo(
			connection,
			keypair,
			mint,
			ata.address,
			keypair,
			token_decimals,
		);
		console.log(`Your mint txid: ${mintTx}`);
	} catch (error) {
		console.log(`Oops, something went wrong: ${error}`);
	}
})();
