use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token::{mint_to, Mint, MintTo, Token, TokenAccount},
};

use crate::state::{StakeConfig, UserAccount};

#[derive(Accounts)]
pub struct Claim<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    #[account(
        mut,
        constraint = user_account.points > 0,
        seeds = [b"user".as_ref(), user.key().as_ref()],
        bump = user_account.bump
    )]
    pub user_account: Account<'info, UserAccount>,

    #[account(
      init_if_needed,
      payer = user,
      associated_token::mint = reward_mint,
      associated_token::authority = user,
      associated_token::token_program = token_program,
    )]
    pub user_ata: Account<'info, TokenAccount>,

    #[account(
        seeds = [b"config".as_ref()],
        bump = config.bump
    )]
    pub config: Account<'info, StakeConfig>,

    #[account(
        constraint = reward_mint.mint_authority == Some(config.key()).into(),
        seeds = [b"rewards".as_ref(), config.key().as_ref()],
        bump = config.rewards_bump,
    )]
    pub reward_mint: Account<'info, Mint>,

    pub associated_token_program: Program<'info, AssociatedToken>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

impl<'info> Claim<'info> {
    pub fn claim(&mut self) -> Result<()> {
        let signer_seeds: &[&[&[u8]]] = &[&[b"config", &[self.config.bump]]];

        let mint_reward = MintTo {
            mint: self.reward_mint.to_account_info(),
            to: self.user_ata.to_account_info(),
            authority: self.config.to_account_info(),
        };

        let cpi_ctx = CpiContext::new_with_signer(
            self.token_program.to_account_info(),
            mint_reward,
            signer_seeds,
        );

        let reward_points = (self.user_account.points as u64)
            .saturating_mul(10u64.pow(self.reward_mint.decimals as u32));

        mint_to(cpi_ctx, reward_points)?;

        self.user_account.points = 0;

        Ok(())
    }
}
