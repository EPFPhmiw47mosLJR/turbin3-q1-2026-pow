# Week 1

## Accounts

- Everything on-chain is an account
- Dynamically sized, can grow as required
- Each and every account can only be created by the System Program
- Account flags:
    | Flag       | Desc                    |
    |------------|-------------------------|
    | Writable   | Serial access           |
    | Read only  | Parallel access         |
    | Signer     | A signer of transaction |
    | Executable | Program account         |

### Account structure

```
{
    key: PublicKey,         // ?
    lamports: number,       // ?
    data: UInt8Array,       // Data saved in the account
    is_executable: boolean, // Executable flag
    owner: PublicKey        // Owner of the account
}
```

## Programs

- Accounts marked as executable
- `is_executable` is true
- Execute instructions
- Stateless: Holds only compiled code
- Owned by Loaders (Default: Upgradeable Loader)
- Ownership: Can own non-executable accounts (Ex: Data accounts)
- Access via program_id
- Native Programs: These are built in (BFP) by Solana
- Programs are eBPF programs
- User programs: Developed by users/devs


> **CPI: Cross-Program Invocation**
> - It lets a program:
>   - invoke an instruction in another program
>   - pass accounts + data to it
>   - let the Solana runtime enforce permissions
> - Solana's equivalent of a smart contract calling another contract.
> - CPI is the only sanctioned way for programs to interact.

## Rent

- **Rent is for data stored on chain**
- Rent must be paid to create Accounts on-chain
- Pay 2 years rent upfront for Rent-Exemption
- * At the end of each Epoch, a GC runs which collects rent
- Closing an Account allows rent to be reclaimed
- Resizing an Account costs/returns the difference
- Upgradeable programs require 4 years of rent upfront

## Transactions

- Accounts: Reference all accounts you're going to deal with
- Composition: One or more instructions
- Instructions interface with Solana programs "instruction interface"
- Atomic: Fails entirely if any instruction fails

> Parallel execution of transactions only if they reference different accounts

### Structure of Transaction

- Multiple messages in a transaction

```
{
    message: {
        instructions: Array<instructions>,
        recent_blockhash: number,
        fee_payer: PublicKey
    },
    signers: Array<UInt8Array>
}
```

## Compute (Compute Units)

- **CU is for work down**
- Everything done on chain (instructions etc) require compute units. Ex:
    - Executing a transfer
    - Executing account creation
    - Executing a sys call
- By default:
    - Each instruction is allocated 200,000 CUs
    - Each transaction is allocated 1.4M CUs
    - Each block is allocated 60M CUs
- Block Limit: Fixed limit of maximum compute units per block
- Base fee: Paid on instructions (5000 lamports)
    - 50% is burned (taken out of circulating SOL supply)
    - 50% is paid to validator which processed the transaction
- Prioritization fee: Optional fee used to increase the chance validator will process your transaction
    - 100% is paid to validator
    ```
    Prioritization fee = CU limit * CU price
    Priority = (Prioritization fee + Base fee) / (1 + CU limit + Signature CUs + Write lock CUs)
    ```
- Best for the chain: Least amount of CUs

> Can be talked as:
> - How much work does the validator have to do computing what you send it to give an output?
> - This is broken into units that dictate cost and control size.
> - Speed of transaction and assurance of inclusion into a block are affected by this.

> Solana intentionally decoupled:
> - execution cost
> - user fees
> Basic Transaction Fee is 5000 lamports, it pays for signature verification + propagation + basic spam resistance.
> Default compute limit is 200k, can be requested till 1.4mil.
> This means 5000 lamports can be paid for a transaction with 200k CU and 1.4mil CU.
> BUT:
> - Validators choose transactions by *CU price* not *CU usage*
> Compute Unit price (priority fees) is basically "I'll pay X micro-lamports per compute unit."
> `compute_unit_price` is set in `micro-lamports per CU` (1 lamport = 1,000,000 micro-lamports)
> So:
>   - A tx using 1.4M CU at price 0 *gets dropped*
>   - A tx using 200k CU with a non-zero CU price *gets included*
> Validators maximize lamports per compute unit.



## PDA

- Made up of seeds and a bump
    - seeds: byte strings
    - bump: program ID/smart contract's address
- Special PDAs:
    - Associated Token Account
- Deterministic if seeds are fixed
- Can't collide with other PDAs/Accounts created by other programs (program id used in derivation)
- Can be used as data storage (hashmap: key/value)
- If Solana program needs state -> PDAs are used
- PDA Account pubkeys resemble accounts but no private key
    - Hash of the seeds you provide
- Can authorize/sign on program's behalf

> **PDA: Program Derived Address**
> - An address deterministically derived from:
>   - one or more seeds (byte strings), and
>   - a program ID (the smart contract's address)
> - The Solana runtime guarantees that the resulting address is off the Ed25519 curve, which means: **No private key exists for it.**
> - So only the program that derived it can authorize actions on it.

## IDL: Interface Design Language

- Interface Design Language/Interface Description Language/Interface Definition Language
- Many on-chain programs have an IDL
- IDL tells what type of instructions/accounts/data the program takes
- Public IDLs can be uploaded to chain for easy access
- Extra PDA may be used to store IDL
- IDLs are written in JSON


## SPL Token

- To create a new SPL Token, you must first create the Mint Account
- Key arguments when creating an SPL Token:
    - Mint Authority
    - Freeze Authority
    - Decimals
- Helper functions/instructions:
    | Function            | Description                                         |
    |---------------------|-----------------------------------------------------|
    | `initializeMint`    | Creates a new token mint instance                   |
    | `initializeAccount` | Creates a new token account                         |
    | `transfer`          | Sends token from `a` to `b`                         |
    | `approve`           | Grants access to your token                         |
    | `revoke`            | Removes previously approved access                  |
    | `mintTo`            | Mint SPL tokens to a designated account             |
    | `burn`              | Destroy a specific amount of tokens (that you hold) |
    | `freezeAccount`     | Prevent the token account from acting               |
    | `thawAccount`       | Removes freeze                                      |
    | `syncNative`        | Wraps native SOL                                    |
- Once a Mint Account has been created, we can create Token Accounts for it
- Token Accounts:
    - Keep track of token balance
    - Linked to a single mint account

## ATA: Associated Token Account

- One of the most used PDAs on Solana
- Creates a deterministic token account
- Other people can create token accounts for you
- Associated Token Account - special PDA:
    - Associated with your wallet
    - Associated with the mint account of the token itself
    - Completely unique per token
- TS library provides helpers to create ATA:
    - `getAssociatedTokenAddress`
    - `createAssociatedTokenAccount`
    - `getOrCreateAssociatedTokenAccount`

## Metaplex

- Initially started as Solana Labs initiative
- Goal: create an open NFT protocol and tools to support it on Solana chain
    - The Metaplex Metadata Standard
    - CandyMachine
    - Compressed NFTs

## Metaplex Token Standard

| Standard                | Description                                      |
|-------------------------|--------------------------------------------------|
| NonFungible             | Non-fungible token with a Master Edition         |
| FungibleAsset           | Token with metadata, can also have attributes    |
|                         | Sometimes called Semi-Fungible                   |
| Fungible                | Token with simple metadata                       |
| NonFungibleEdition      | Non-fungible token with an Edition account       |
|                         | Printed from a Master Edition                    |
| ProgrammableNonFungible | Special Non-fungible token that is frozen at all |
|                         | times to enforce custom authorization rules      |

- Token Standard is set automatically by the Token Metadata Program
- If the token has a *Master Edition account*, it is a *NonFungible*
- If the token has an *Edition account*, it is a *NonFungibleEdition*
- If the token has no *(Master) Edition account* ensuring it's supply can be `> 1` and uses *zero decimal places*, it is a *FungibleAsset*
- If the token has no *(Master) Edition account* ensuring it's supply can be `> 1` and uses at least *one decimal place*, it is *Fungible*

- Setting Mint Authority to the Master Edition (which can be a PDA), no more tokens of this type can be minted => Supply is 1.

- Depending on the type of Token, different JSON standard needs to be used: <https://developers.metaplex.com/smart-contracts/token-metadata/token-standard>

### Master Edition

- Proof that token is non fungible
    - Verifies mint account has 0 decimal
    - Verifies only 1 token has been minted
- Transfers the mint authority and freeze authority to the Master Edition
- You can set max supply
    - If > 1, use Master Edition to mint sub editions of an NFT
- Data:
    - supply
    - max supply
- PDA Seeds
    - "metadata" (literal namespace string)
    - Metadata
    - Program ID
    - Mint ID
    - "edition"
    - Conceptually: `PDA = hash("metadata", METADATA_PROGRAM_ID, MINT_PUBLIC_KEY, "edition")`
- Parameters
    | Parameter       | Description |
    |-----------------|-------------|
    | edition         | PublicKey   |
    | metadata        | PublicKey   |
    | mint            | PublicKey   |
    | mintAuthority   | PublicKey   |
    | payer           | PublicKey   |
    | updateAuthority | PublicKey   |
    | tokenProgram?   | PublicKey   |
    | systemProgram?  | PublicKey   |


## Metadata Account

- Can be set to mutable
- Creators array can be to obtain royalties (on Marketplaces)
- Creators must sign with their own key to be verified
- Collection NFTs can be used to group NFTs
- Parameters need to create this:
    | Parameter       | Description |
    |-----------------|-------------|
    | metadata        | PublicKey   |
    | mint            | PublicKey   |
    | mintAuthority   | PublicKey   |
    | payer           | PublicKey   |
    | updateAuthority | PublicKey   |
    | systemProgram?  | PublicKey   |


## Metadata

- Data
    - name
    - symbol
    - uri
    - seller_fee_basis_points (ex: 500 = 5%)
    - creators
    - collection
    - uses
- Other arguments
    - isMutable
    - collectionDetails
- PDA Seeds
    - "metadata" (literal namespace string)
    - Metadata Program ID (Authority which owns the derived account)
    - Mint ID
    - Conceptually: `PDA = hash("metadata", METADATA_PROGRAM_ID, MINT_PUBLIC_KEY)`

## Token Extensions (SPL Token 2022)

- Implemented at the token program level, not a separate metadata program
- Extensions are opt-in at mint creation time
- Each extension adds enforced behavior to the token
- Rules apply universally across wallets, programs, and marketplaces
- Extensions cannot be bypassed by clients

### Common Extensions

| Extension              | Description                                               |
|------------------------|-----------------------------------------------------------|
| Transfer Fee           | Fee is deducted automatically on every transfer           |
|                        | Fee parameters stored in the mint                         |
|                        | Enforced by the token program                             |
| Transfer Hook          | Invokes a custom program on every transfer                |
|                        | Enables allowlists, denylists, KYC, logic gates           |
| Permanent Delegate     | Delegate authority that cannot be revoked                 |
|                        | Often used for compliance or recovery                     |
| Confidential Transfers | Balances and transfer amounts are encrypted               |
| Mint Close Authority   | Allows mint account to be closed when supply reaches zero |

## Collections

- Collections are just NFTs
    - You create a Collection NFT by setting the CollectionDetails object.
    - To add a NFT to a collection set the Collection field on the Metadata account.
- A Collection allows a authority to verify or unverify.
- Can be nested.
- Collections should now be SIZED; Sized collections allow you to set the number of NFTs in the collection once, and from then on it grows on-chain

## UMI

- Modular framework that can be used for creating javascript clients for Solana programs
- <https://github.com/Web3-Builders-Alliance/cohort-helper/tree/main/BonusResources/umi>

## Task (Solana-Starter)

### Create a fungible token

- (1) `spl_init.ts`
    - Create a new token mint
    - Make your devnet wallet the mint authority
    - Set decimals to 6
    - Console log the mint ID
- (1) `spl_mint.ts`
    - Use `getOrCreateAssociatedTokenAccount` to create a token account using your wallet and the mint ID
    - Use `mintTo` to mint tokens to yourself
- (2) `spl_metadata.ts`
    - Use `findProgramAddressSync` to get PDA for the Metadata for your Mint.
    - Create a new transaction
        - Add a `createCreateMetadataAccountV3Instruction` to it
        - Add the required accounts and data
        - Use `sendAndConfirmTransaction` to send it to Devnet
- (2) `spl_transfer.ts`
    - Transfer tokens to another cadet
    - Use `getOrCreateAssociatedTokenAccount` to get the tokens account
- (3) `nft_image.ts`
	- Read the generated rug image from disk
	- Convert the image buffer into a `GenericFile`
	- Upload the file to Irys (devnet)
	- Console log the image URI
- (3) `nft_metadata.ts`
	- Create NFT metadata following the Metaplex JSON schema
	- Reference the uploaded image URI
	- Upload the metadata JSON to Irys
	- Console log the metadata URI
- (3) `nft_mint.ts`
	- Generate a new mint keypair
	- Use `createNft` to mint an NFT
        - Set name, symbol, and metadata URI
        - Set seller fee basis points
	- Send and confirm the transaction on devnet
	- Console log the transaction URL and mint address

# Week 2

## Vault

- Trust the chain to verify your wallet with cryptographic signatures so only you can access it
- Instructions:
    1. Initialize the vault
    2. Deposit funds
    3. Withdraw funds
    4. Close the vault

## Task

- `anchor keys sync` generates a set of keypair in `./target/deploy/<name>-keypair.json` if it doesn't exist AND updates the `declare_id!`
- `solana-keygen pubkey <keypair>.json` gets the corresponding public key
- Clean keys should be used for program
  - Keypair is owned by the BPFloader
  - BPFloader is the program that loads new programs to the runtime
  - BPFloader is part of the bigger runtime, it owns all programs deployed on the chain
- If using `surfpool start` -> `anchor build` + `anchor test --skip-local-validator`
- For `Deposit`, `CpiContext::new` works because the user is the signer and the user is transferring to the vault
- For `Withdraw`, `CpiContext::new_with_signer` is needed because the PDA needs to sign

```rust
// lib.rs
use anchor_lang::{
    prelude::*,
    system_program::{transfer, Transfer},
};

/**
 * on-chain address of the program
 */
declare_id!("2u5cG7PEVL5KdTRMWSjdwqtBVv1anE5Hvv4FGSPZVRUN");

/**
 * - exposes functions as on-chain instructions
 * - handles instruction dispatch
 * - enforces account constraints
 */
#[program]
pub mod anchor_vault_q4_25 {
    use super::*;

    /**
     * called once per user
     */
    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        ctx.accounts.initialize(&ctx.bumps)
    }

    /**
     * moves SOL from the user into their vault
     */
    pub fn deposit(ctx: Context<Deposit>, amount: u64) -> Result<()> {
        ctx.accounts.deposit(amount)
    }
}

/**
 * Account validation
 * As in, what accounts must be provided and what rules they must obey
 * user: A wallet, must sign the transaction, mutable to deduct lamports
 * vault_state: Metadata account
 *      - init: create + initialize this account
 *      - payer: user pays rent
 *      - seeds: deterministic address for PDA
 *      - bump: so it is offchain and no extra compute to do
 *      - space: exact byte size; DISCRIMINATOR can be custom so it uses length of that.
 *      - Address is PDA("state", user_pubkey)
 * vault: SOL lives here
 *      - mutable because SOL needs to be added/removed
 *      - No init because depositing SOL does that
 *      - system account
 *      - seeds: deterministic address for PDA
 *      - Address is PDA("vault", vault_state_pubkey)
 * system_program:
 *      - Program used to {create accounts, transfer lamports}
*/
#[derive(Accounts)] 
pub struct Initialize<'info> {
    #[account(mut)]
    pub user: Signer<'info>,
    #[account(
        init,
        payer = user,
        seeds = [b"state", user.key().as_ref()], 
        bump,
        space = VaultState::DISCRIMINATOR.len() + VaultState::INIT_SPACE,
    )]
    pub vault_state: Account<'info, VaultState>,
    #[account(
        mut,
        seeds = [b"vault", vault_state.key().as_ref()],
        bump,
    )]
    pub vault: SystemAccount<'info>,
    pub system_program: Program<'info, System>,
}

/**
 * Under the hood it will derive and save the bump in the context of this instruction
 * So bumps can be used from the instruction itself
 * 1. Gets the amount of lamports needed to make the vault rent exempt because solana deletes accounts
 * 2. Build a CPI context to the System Program's transfer instruction:
 *      - Get address of system_program
 *      - Ask it to do a Transfer FROM user TO vault
 *      - Bundle program to call and accounts to pass
 * 3. Invoke the System Program via CPI to transfer rent-exempt lamports
 * 4. Store the bumps
 */
impl<'info> Initialize<'info> {
    pub fn initialize(&mut self, bumps: &InitializeBumps) -> Result<()> {
        // Get the amount of lamports needed to make the vault rent exempt
        let rent_exempt = Rent::get()?.minimum_balance(self.vault.to_account_info().data_len());

        // Transfer the rent-exempt amount from the user to the vault
        let cpi_program = self.system_program.to_account_info();
        let cpi_accounts = Transfer {
            from: self.user.to_account_info(),
            to: self.vault.to_account_info(),
        };

        let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);

        transfer(cpi_ctx, rent_exempt)?;

        self.vault_state.vault_bump = bumps.vault;
        self.vault_state.state_bump = bumps.vault_state;

        Ok(())
    }
}

/**
 * TODO
 */
#[derive(Accounts)]
pub struct Deposit<'info> {
    #[account(mut)]
    pub user: Signer<'info>,
    #[account(
        mut,
        seeds = [b"vault", vault_state.key().as_ref()], 
        bump = vault_state.vault_bump,
    )]
    pub vault: SystemAccount<'info>,
    #[account(
        seeds = [b"state", user.key().as_ref()],
        bump = vault_state.state_bump,
    )]
    pub vault_state: Account<'info, VaultState>,
    pub system_program: Program<'info, System>,
}

impl<'info> Deposit<'info> {
    pub fn deposit(&mut self, amount: u64) -> Result<()> {
        let cpi_program = self.system_program.to_account_info();

        let cpi_accounts = Transfer {
            from: self.user.to_account_info(),
            to: self.vault.to_account_info(),
        };

        let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);

        transfer(cpi_ctx, amount)?;

        Ok(())
    }
}

/**
 * InitSpace does the space calculation
 * vault_bump is unsigned 8 bit
 * state_bump is unsigned 8 bit
 */
#[derive(InitSpace)]
#[account]
pub struct VaultState {
    pub vault_bump: u8,
    pub state_bump: u8,
}
```
