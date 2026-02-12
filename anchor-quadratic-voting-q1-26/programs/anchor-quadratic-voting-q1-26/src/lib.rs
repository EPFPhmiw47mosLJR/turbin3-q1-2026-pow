use anchor_lang::prelude::*;

mod errors;
mod instructions;
mod state;

use instructions::*;

declare_id!("12LENMZThAX2VuFUH4EtD6c4uBa96Wm9V43e2yQ7yZdJ");

#[program]
pub mod anchor_quadratic_voting_q1_26 {
    use super::*;

    pub fn init_dao(ctx: Context<InitDao>, name: String) -> Result<()> {
        init_dao::init_dao(ctx, name)
    }

    pub fn init_proposal(ctx: Context<InitProposal>, metadata: String) -> Result<()> {
        init_proposal::init_proposal(ctx, metadata)
    }

    pub fn finalize_proposal(ctx: Context<FinalizeProposal>) -> Result<()> {
        finalize_proposal::finalize_proposal(ctx)
    }

    pub fn cast_vote(ctx: Context<CastVote>, vote_type: u8) -> Result<()> {
        cast_vote::cast_vote(ctx, vote_type)
    }
}
