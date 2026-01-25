// Succesfully Minted! Check out your TX here:
// https://explorer.solana.com/tx/3GCQF36KCtztjwQuXsSqYgXii46vVqKNjaf591eaTTuMUNvEkhGREFUGcmhbHsA2wrfopGmMifJe8aefoQHFFezL?cluster=devnet
// Mint Address:  H4vw5LSoPK3rjcH1xY1gDcMe33e2m8Gy7mBPFPoHVsdr

import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import { createSignerFromKeypair, signerIdentity, generateSigner, percentAmount } from "@metaplex-foundation/umi";
import { createNft, mplTokenMetadata } from "@metaplex-foundation/mpl-token-metadata";

import wallet from "../turbin3-wallet.json";
import base58 from "bs58";

const RPC_ENDPOINT = "https://api.devnet.solana.com";
const umi = createUmi(RPC_ENDPOINT);

let keypair = umi.eddsa.createKeypairFromSecretKey(new Uint8Array(wallet));
const myKeypairSigner = createSignerFromKeypair(umi, keypair);
umi.use(signerIdentity(myKeypairSigner));
umi.use(mplTokenMetadata());

const mint = generateSigner(umi);

(async () => {
	let tx = createNft(umi, {
		mint,
		name: "My Grey Rug",
		symbol: "RUG",
		uri: "https://gateway.irys.xyz/5A9Kz1Q1KFvnBk1LHWoa9HPitM33WTrLW733FvtDzPgR",
		sellerFeeBasisPoints: percentAmount(5),
	});

	let result = await tx.sendAndConfirm(umi);

	const signature = base58.encode(result.signature);

	console.log(
		`Succesfully Minted! Check out your TX here:\nhttps://explorer.solana.com/tx/${signature}?cluster=devnet`,
	);

	console.log("Mint Address: ", mint.publicKey);
})();
