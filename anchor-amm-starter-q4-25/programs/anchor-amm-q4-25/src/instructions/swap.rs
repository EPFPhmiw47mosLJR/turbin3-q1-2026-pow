use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token::{transfer, Mint, Token, TokenAccount, Transfer},
};
use constant_product_curve::{ConstantProduct, LiquidityPair};

use crate::{errors::AmmError, state::Config};

#[derive(Accounts)]
pub struct Swap<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    pub mint_x: Account<'info, Mint>,
    pub mint_y: Account<'info, Mint>,

    #[account(
        has_one = mint_x,
        has_one = mint_y,
        seeds = [b"config", config.seed.to_le_bytes().as_ref()],
        bump = config.config_bump,
    )]
    pub config: Account<'info, Config>,

    #[account(
        mut,
        seeds = [b"lp", config.key().as_ref()],
        bump = config.lp_bump,
        mint::authority = config,
    )]
    pub mint_lp: Account<'info, Mint>,

    #[account(
        mut,
        associated_token::mint = mint_x,
        associated_token::authority = config,
    )]
    pub vault_x: Account<'info, TokenAccount>,
    #[account(
        mut,
        associated_token::mint = mint_y,
        associated_token::authority = config,
    )]
    pub vault_y: Account<'info, TokenAccount>,

    #[account(
        init_if_needed,
        payer = user,
        associated_token::mint = mint_x,
        associated_token::authority = user,
    )]
    pub user_x: Account<'info, TokenAccount>,
    #[account(
        init_if_needed,
        payer = user,
        associated_token::mint = mint_y,
        associated_token::authority = user,
    )]
    pub user_y: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub associated_token_program: Program<'info, AssociatedToken>,
}

impl<'info> Swap<'info> {
    pub fn swap(&mut self, is_x: bool, amount: u64, min: u64) -> Result<()> {
        require!(self.config.locked == false, AmmError::PoolLocked);
        require!(amount != 0, AmmError::InvalidAmount);
        require!(
            self.vault_x.amount > 0 && self.vault_y.amount > 0,
            AmmError::NoLiquidityInPool
        );
        require!(self.mint_lp.supply > 0, AmmError::NoLiquidityInPool);
        require!(!self.vault_x.is_frozen(), AmmError::AccountFrozen);
        require!(!self.vault_y.is_frozen(), AmmError::AccountFrozen);

        let lp = match is_x {
            true => LiquidityPair::X,
            false => LiquidityPair::Y,
        };
        let reserve = match is_x {
            true => self.vault_y.amount,
            false => self.vault_x.amount,
        };

        let (deposit, withdraw) = {
            let mut cp = ConstantProduct::init(
                self.vault_x.amount,
                self.vault_y.amount,
                self.mint_lp.supply,
                self.config.fee,
                Some(self.mint_x.decimals),
            )
            .map_err(AmmError::from)?;
            let res = cp.swap(lp, amount, min).map_err(AmmError::from)?;
            (res.deposit, res.withdraw)
        };

        require!(withdraw > 0, AmmError::InvalidAmount);
        require!(withdraw < reserve, AmmError::LiquidityLessThanMinimum);
        require!(
            deposit
                <= if is_x {
                    self.user_x.amount
                } else {
                    self.user_y.amount
                },
            AmmError::InsufficientBalance
        );

        // withdraw token
        self.withdraw_tokens(!is_x, withdraw)?;
        // deposit token
        self.deposit_tokens(is_x, deposit)?;
        // ignore res.fee because ConstantProduct.swap already applies it to input

        Ok(())
    }

    pub fn deposit_tokens(&mut self, is_x: bool, amount: u64) -> Result<()> {
        let (from, to) = match is_x {
            true => (
                self.user_x.to_account_info(),
                self.vault_x.to_account_info(),
            ),
            false => (
                self.user_y.to_account_info(),
                self.vault_y.to_account_info(),
            ),
        };

        let cpi_program = self.token_program.to_account_info();

        let cpi_accounts = Transfer {
            from,
            to,
            authority: self.user.to_account_info(),
        };

        let ctx = CpiContext::new(cpi_program, cpi_accounts);

        transfer(ctx, amount)
    }

    pub fn withdraw_tokens(&mut self, is_x: bool, amount: u64) -> Result<()> {
        let (from, to) = match is_x {
            true => (
                self.vault_x.to_account_info(),
                self.user_x.to_account_info(),
            ),
            false => (
                self.vault_y.to_account_info(),
                self.user_y.to_account_info(),
            ),
        };

        let cpi_program = self.token_program.to_account_info();

        let cpi_accounts = Transfer {
            from,
            to,
            authority: self.config.to_account_info(),
        };

        let signer_seeds: &[&[&[u8]]] = &[&[
            b"config",
            &self.config.seed.to_le_bytes(),
            &[self.config.config_bump],
        ]];

        let ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, signer_seeds);

        transfer(ctx, amount)
    }
}
