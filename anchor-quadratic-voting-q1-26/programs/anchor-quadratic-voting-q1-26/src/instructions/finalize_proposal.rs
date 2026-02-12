use anchor_lang::prelude::*;

use crate::{
    errors::QuadraticVotingError,
    state::{Dao, Proposal, ProposalState},
};

#[derive(Accounts)]
pub struct FinalizeProposal<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,

    #[account(
        mut,
        constraint = dao.authority == creator.key() @ QuadraticVotingError::UnauthorizedProposalCreation,
    )]
    pub dao: Account<'info, Dao>,

    #[account(
        mut,
        has_one = dao @ QuadraticVotingError::InvalidDao,
        constraint = proposal.state == ProposalState::Active @ QuadraticVotingError::ProposalNotActive,
        seeds = [b"proposal", dao.key().as_ref(), &proposal.proposal_id.to_le_bytes()],
        bump = proposal.bump,
    )]
    pub proposal: Account<'info, Proposal>,

    pub system_program: Program<'info, System>,
}

pub fn finalize_proposal(ctx: Context<FinalizeProposal>) -> Result<()> {
    let proposal = &mut ctx.accounts.proposal;

    if proposal.yes_vote_count > proposal.no_vote_count {
        proposal.state = ProposalState::Passed;
    } else {
        proposal.state = ProposalState::Rejected;
    }

    Ok(())
}
