use anchor_lang::prelude::*;

declare_id!("Buky6wJRWhpGPYRfsLPvXWDxU4VYi4XgiP1XeCnbdggg");

#[program]
pub mod anchor_quadratic_voting_q1_26 {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        msg!("Greetings from: {:?}", ctx.program_id);
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize {}
