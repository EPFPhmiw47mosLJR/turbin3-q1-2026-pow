// Your image URI:  https://gateway.irys.xyz/4795zYDSeEnCRYqyvWXGWq1EtsHGKKfcERrrkZmjZCtg

import wallet from "../turbin3-wallet.json";
import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import { createGenericFile, createSignerFromKeypair, signerIdentity } from "@metaplex-foundation/umi";
import { irysUploader } from "@metaplex-foundation/umi-uploader-irys";
import { readFile } from "fs/promises";

// Create a devnet connection
const umi = createUmi("https://api.devnet.solana.com");

let keypair = umi.eddsa.createKeypairFromSecretKey(new Uint8Array(wallet));
const signer = createSignerFromKeypair(umi, keypair);

umi.use(irysUploader({ address: "https://devnet.irys.xyz" }));
umi.use(signerIdentity(signer));

// 	irysUploader opts.address:
// 		https://uploader.irys.xyz -> mainnet
// 		https://devnet.irys.xyz -> devnet == https://gateway.irys.xyz/<hash>
//	arweaveUploader:
// 		https://arweave.net

(async () => {
	try {
		//1. Load image
		const image = await readFile("../generug.png");

		//2. Convert image to generic file.
		const genericFile = createGenericFile(image, "generug.png", {
			contentType: "image/png",
		});

		//3. Upload image
		const [myUri] = await umi.uploader.upload([genericFile]);

		console.log("Your image URI: ", myUri);
	} catch (error) {
		console.log("Oops.. Something went wrong", error);
	}
})();
