use anchor_lang::prelude::*;
use anchor_spl::token::Mint;

use crate::{
    errors::QuadraticVotingError,
    state::{Dao, Proposal, ProposalState, Vote, VoteType},
};

#[derive(Accounts)]
pub struct CastVote<'info> {
    #[account(mut)]
    pub voter: Signer<'info>,

    pub mint: Account<'info, Mint>,

    #[account(
        has_one = mint @ QuadraticVotingError::InvalidMint,
    )]
    pub dao: Account<'info, Dao>,

    #[account(
        mut,
        constraint = proposal.state == ProposalState::Active @ QuadraticVotingError::ProposalNotActive,
    )]
    pub proposal: Account<'info, Proposal>,

    #[account(
        init,
        payer = voter,
        seeds = [b"vote", proposal.key().as_ref(), voter.key().as_ref()],
        bump,
        space = Vote::DISCRIMINATOR.len() + Vote::INIT_SPACE
    )]
    pub vote: Account<'info, Vote>,

    #[account(
        token::authority = voter,
        token::mint = mint,
    )]
    pub voter_token_account: Account<'info, anchor_spl::token::TokenAccount>,

    pub system_program: Program<'info, System>,
}

pub fn cast_vote(ctx: Context<CastVote>, vote_type: u8) -> Result<()> {
    let proposal = &mut ctx.accounts.proposal;
    let vote = &mut ctx.accounts.vote;

    let vote_type_enum = VoteType::try_from(vote_type)?;

    let amount = ctx.accounts.voter_token_account.amount;
    let decimals = ctx.accounts.mint.decimals as u32;
    let scale = 10u128
        .checked_pow(decimals)
        .ok_or(QuadraticVotingError::Overflow)?;
    let normalized = (amount as u128)
        .checked_div(scale)
        .ok_or(QuadraticVotingError::Overflow)?;
    let vote_credits = normalized.isqrt() as u64;

    match vote_type_enum {
        VoteType::No => proposal.no_vote_count += vote_credits,
        VoteType::Yes => proposal.yes_vote_count += vote_credits,
    };

    vote.set_inner(Vote {
        authority: ctx.accounts.voter.key(),
        vote_type: vote_type_enum.into(),
        vote_credits,
        bump: ctx.bumps.vote,
    });

    Ok(())
}
