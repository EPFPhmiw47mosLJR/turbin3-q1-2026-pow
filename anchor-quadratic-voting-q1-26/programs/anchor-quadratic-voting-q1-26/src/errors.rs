use anchor_lang::error_code;

#[error_code]
pub enum QuadraticVotingError {
    #[msg("DefaultError")]
    DefaultError,
    #[msg("Overflow detected.")]
    Overflow,
    #[msg("Underflow detected.")]
    Underflow,
    #[msg("Invalid vote type.")]
    InvalidVoteType,
    #[msg("Invalid DAO.")]
    InvalidDao,
    #[msg("Only the DAO authority can create proposals.")]
    UnauthorizedProposalCreation,
    #[msg("Invalid mint.")]
    InvalidMint,
    #[msg("Invalid token accoung.")]
    InvalidTokenAccount,
    #[msg("String too long.")]
    StringTooLong,
    #[msg("Proposal voting not active.")]
    ProposalNotActive,
}
