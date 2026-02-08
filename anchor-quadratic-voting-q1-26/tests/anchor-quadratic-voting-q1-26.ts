import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { AnchorQuadraticVotingQ126 } from "../target/types/anchor_quadratic_voting_q1_26";

describe("anchor-quadratic-voting-q1-26", () => {
  // Configure the client to use the local cluster.
  anchor.setProvider(anchor.AnchorProvider.env());

  const program = anchor.workspace.anchorQuadraticVotingQ126 as Program<AnchorQuadraticVotingQ126>;

  it("Is initialized!", async () => {
    // Add your test here.
    const tx = await program.methods.initialize().rpc();
    console.log("Your transaction signature", tx);
  });
});
