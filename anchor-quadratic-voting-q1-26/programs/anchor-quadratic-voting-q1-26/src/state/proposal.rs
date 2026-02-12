use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct Proposal {
    pub authority: Pubkey,
    pub dao: Pubkey,
    pub proposal_id: u64,
    #[max_len(500)]
    pub metadata: String,
    pub yes_vote_count: u64,
    pub no_vote_count: u64,
    pub state: ProposalState,
    pub bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug, InitSpace)]
pub enum ProposalState {
    Active = 0,
    Passed = 1,
    Rejected = 2,
}
