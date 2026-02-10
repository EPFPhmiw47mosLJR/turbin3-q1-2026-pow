use ::solana_program::{ed25519_program, hash::hash};
use anchor_instruction_sysvar::Ed25519InstructionSignatures;
use anchor_lang::{
    prelude::{sysvar::instructions::load_instruction_at_checked, *},
    solana_program::{self},
    system_program::{transfer, Transfer},
};

use crate::{errors::DiceError, state::Bet};

pub const HOUSE_EDGE: u16 = 150; // 1.5% House edge basis points

#[derive(Accounts)]
pub struct ResolveBet<'info> {
    #[account(mut)]
    pub house: Signer<'info>,

    #[account(mut)]
    ///CHECK: This is safe
    pub player: UncheckedAccount<'info>,

    #[account(
        mut,
        seeds = [b"vault", house.key().as_ref()],
        bump
    )]
    pub vault: SystemAccount<'info>,

    #[account(
        mut,
        has_one = player,
        close = player,
        seeds = [b"bet", vault.key().as_ref(), bet.seed.to_le_bytes().as_ref()],
        bump = bet.bump
    )]
    pub bet: Account<'info, Bet>,

    #[account(
        address = solana_program::sysvar::instructions::ID
    )]
    ///CHECK: This is safe
    pub instruction_sysvar: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

impl<'info> ResolveBet<'info> {
    pub fn resolve_bet(&mut self, sig: &Vec<u8>, bumps: &ResolveBetBumps) -> Result<()> {
        let hash = hash(sig).to_bytes();

        // PRNG from signatures
        // Basically, verified randomness ON-chain
        // And verification that it was signed by the right party
        let mut hash_16: [u8; 16] = [0; 16];
        hash_16.copy_from_slice(&hash[0..16]);
        let lower = u128::from_le_bytes(hash_16);
        hash_16.copy_from_slice(&hash[16..32]);
        let upper = u128::from_le_bytes(hash_16);

        let roll = lower.wrapping_add(upper).wrapping_rem(100) as u8 + 1;

        if self.bet.roll > roll {
            // payout multiplier = (100% - house_edge) / win_probability
            // - house_edge = 1.5%
            // - win_probability = ((roll - 1) / 100)
            // payout multiplier = 98.5% / ((roll - 1) / 100)
            // payout multiplier = 98.5 / (roll - 1)
            // Depending on user:
            // | roll | win prob (roll - 1) / 100 | mult   | gain/loss  |
            // |------|---------------------------|--------|------------|
            // | 100  | 99%                       | 0.9949 | loss 0.5%  |
            // | 50   | 49%                       | 2.01   | win 100.1% |
            // | 2    | 1%                        | 98.5   | win 9750%  |
            // | 1    | 0%                        | -      | -          |
            let payout = (self.bet.amount as u128)
                .checked_mul(10_000 - HOUSE_EDGE as u128)
                .ok_or(DiceError::Overflow)?
                .checked_div(self.bet.roll as u128 - 1)
                .ok_or(DiceError::Overflow)?
                .checked_div(10_000)
                .ok_or(DiceError::Overflow)?;

            let signer_seeds: &[&[&[u8]]] =
                &[&[b"vault", &self.house.key().to_bytes(), &[bumps.vault]]];

            let accounts = Transfer {
                from: self.vault.to_account_info(),
                to: self.player.to_account_info(),
            };

            let ctx = CpiContext::new_with_signer(
                self.system_program.to_account_info(),
                accounts,
                signer_seeds,
            );

            transfer(ctx, payout as u64)?;
        }

        Ok(())
    }

    pub fn verify_ed25519_signature(&mut self, sig: &Vec<u8>) -> Result<()> {
        let ix = load_instruction_at_checked(0, &self.instruction_sysvar)
            .map_err(|_| DiceError::Ed25519Program)?;

        require_eq!(
            ix.program_id,
            ed25519_program::ID,
            DiceError::Ed25519Program
        );
        require_eq!(ix.accounts.len(), 0, DiceError::Ed25519Accounts);

        let signatures = Ed25519InstructionSignatures::unpack(&ix.data)
            .map_err(|_| DiceError::Ed25519Signature)?
            .0;
        require_eq!(signatures.len(), 1, DiceError::Ed25519SignatureCount);

        let signature = &signatures[0];
        require!(signature.is_verifiable, DiceError::Ed25519Header);

        require_keys_eq!(
            signature.public_key.ok_or(DiceError::Ed25519Pubkey)?,
            self.house.key(),
            DiceError::Ed25519Pubkey
        );

        require!(
            signature
                .signature
                .ok_or(DiceError::Ed25519Signature)?
                .eq(&sig[..]),
            DiceError::Ed25519Signature
        );

        require!(
            signature
                .message
                .as_ref()
                .ok_or(DiceError::Ed25519Signature)?
                .eq(&self.bet.to_slice()),
            DiceError::Ed25519Message
        );

        Ok(())
    }
}
