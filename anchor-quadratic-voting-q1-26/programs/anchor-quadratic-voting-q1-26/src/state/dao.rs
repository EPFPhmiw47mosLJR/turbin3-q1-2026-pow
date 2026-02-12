use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct Dao {
    pub authority: Pubkey,
    pub mint: Pubkey,
    #[max_len(500)]
    pub name: String,
    pub proposal_count: u64,
    pub bump: u8,
}
