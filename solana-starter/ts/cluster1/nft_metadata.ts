// Your metadata URI:  https://gateway.irys.xyz/5A9Kz1Q1KFvnBk1LHWoa9HPitM33WTrLW733FvtDzPgR

import wallet from "../turbin3-wallet.json";
import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import { createGenericFile, createSignerFromKeypair, signerIdentity } from "@metaplex-foundation/umi";
import { irysUploader } from "@metaplex-foundation/umi-uploader-irys";

// Create a devnet connection
const umi = createUmi("https://api.devnet.solana.com");

let keypair = umi.eddsa.createKeypairFromSecretKey(new Uint8Array(wallet));
const signer = createSignerFromKeypair(umi, keypair);

umi.use(irysUploader({ address: "https://devnet.irys.xyz" }));
umi.use(signerIdentity(signer));

(async () => {
	try {
		// Follow this JSON structure
		// https://docs.metaplex.com/programs/token-metadata/changelog/v1.0#json-structure
		const image =
			"https://gateway.irys.xyz/4795zYDSeEnCRYqyvWXGWq1EtsHGKKfcERrrkZmjZCtg";

		const metadata = {
			name: "My Grey Rug",
			symbol: "RUG",
			description:
				"20 color monochrome rug from https://bergabman.github.io/generug_v2",
			image: image,
			attributes: [
				{ trait_type: "palette", value: "monochrome" },
				{ trait_type: "rarity", value: "common" },
			],
			properties: {
				files: [
					{
						type: "image/png",
						uri: image,
					},
				],
			},
			creators: [],
		};

		const myUri = await umi.uploader.uploadJson(metadata);

		console.log("Your metadata URI: ", myUri);
	} catch (error) {
		console.log("Oops.. Something went wrong", error);
	}
})();
