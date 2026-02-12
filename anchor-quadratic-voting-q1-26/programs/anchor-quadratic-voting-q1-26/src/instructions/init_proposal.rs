use anchor_lang::prelude::*;

use crate::{
    errors::QuadraticVotingError,
    state::{Dao, Proposal, ProposalState},
};

#[derive(Accounts)]
#[instruction(metadata: String)]
pub struct InitProposal<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,

    #[account(
        mut,
        constraint = dao.authority == creator.key() @ QuadraticVotingError::UnauthorizedProposalCreation,
    )]
    pub dao: Account<'info, Dao>,

    #[account(
        init,
        payer = creator,
        seeds = [b"proposal", dao.key().as_ref(), dao.proposal_count.to_le_bytes().as_ref()],
        bump,
        space = Proposal::DISCRIMINATOR.len() + Proposal::INIT_SPACE
    )]
    pub proposal: Account<'info, Proposal>,

    pub system_program: Program<'info, System>,
}

pub fn init_proposal(ctx: Context<InitProposal>, metadata: String) -> Result<()> {
    require!(metadata.len() < 500, QuadraticVotingError::StringTooLong);

    let proposal = &mut ctx.accounts.proposal;
    let dao = &mut ctx.accounts.dao;

    proposal.set_inner(Proposal {
        authority: ctx.accounts.creator.key(),
        dao: dao.key(),
        proposal_id: dao.proposal_count,
        metadata,
        state: ProposalState::Active,
        yes_vote_count: 0,
        no_vote_count: 0,
        bump: ctx.bumps.proposal,
    });

    dao.proposal_count += 1;

    Ok(())
}
