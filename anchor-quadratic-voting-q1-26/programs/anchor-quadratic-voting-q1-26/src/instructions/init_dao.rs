use anchor_lang::prelude::*;
use anchor_spl::token::Mint;

use crate::{errors::QuadraticVotingError, state::Dao};

#[derive(Accounts)]
#[instruction(name: String)]
pub struct InitDao<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,

    pub mint: Account<'info, Mint>,

    #[account(
        init,
        payer = creator,
        seeds = [b"dao", creator.key().as_ref(), name.as_bytes()],
        bump,
        space = Dao::DISCRIMINATOR.len() + Dao::INIT_SPACE
    )]
    pub dao: Account<'info, Dao>,

    pub system_program: Program<'info, System>,
}

pub fn init_dao(ctx: Context<InitDao>, name: String) -> Result<()> {
    require!(name.len() < 500, QuadraticVotingError::StringTooLong);

    let dao = &mut ctx.accounts.dao;

    dao.set_inner(Dao {
        authority: ctx.accounts.creator.key(),
        mint: ctx.accounts.mint.key(),
        name,
        proposal_count: 0,
        bump: ctx.bumps.dao,
    });

    Ok(())
}
