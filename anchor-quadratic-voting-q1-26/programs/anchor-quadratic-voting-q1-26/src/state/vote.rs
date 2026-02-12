use anchor_lang::prelude::*;

use crate::errors::QuadraticVotingError;

#[account]
#[derive(InitSpace)]
pub struct Vote {
    pub authority: Pubkey,
    pub vote_type: u8,
    pub vote_credits: u64,
    pub bump: u8,
}

pub enum VoteType {
    No = 0,
    Yes = 1,
}

impl TryFrom<u8> for VoteType {
    type Error = QuadraticVotingError;
    // type Error = anchor_lang::error::Error;

    fn try_from(value: u8) -> std::result::Result<Self, Self::Error> {
        match value {
            0 => Ok(VoteType::No),
            1 => Ok(VoteType::Yes),
            _ => Err(QuadraticVotingError::InvalidVoteType),
        }
    }
}

impl From<VoteType> for u8 {
    fn from(v: VoteType) -> Self {
        v as u8
    }
}
