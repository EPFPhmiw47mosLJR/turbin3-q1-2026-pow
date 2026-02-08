# Notes - Turbin3 Q1 2026

## Gotchas

Tooling issues I ran into during the cohort.

### DeclaredProgramIdMismatch

- If you run into:

    ```rust
    Error: AnchorError occurred. Error Code: DeclaredProgramIdMismatch. Error Number: 4100. Error Message: The declared program id does not match the actual program id.
    ```

- This means the program ID declared in your code does not match the program ID Anchor is building or deploying.
- **Solution (1):** Solve it the easy way. Run `anchor keys sync`.
- **Solution (2):** Solve it manually:
    1. You should have a keypair in `target/deploy/`. If not, generate one.
    2. Generate keypair: `solana-keygen new --outfile target/deploy/<program_name>-keypair.json`
    3. Get the public key: `solana-keygen pubkey target/deploy/<program_name>-keypair.json`
    4. Update `declare_id!(<publickey_or_string_from_step_three>)` in `src/lib.rs`
    5. Update `Anchor.toml`:

        ```toml
        [programs.localnet]
        <program_name> = "<publickey_or_string_from_step_three>"
        ```

    6. Run `anchor build`
    7. Profit!

### Blockhash expired during tests

- If running `surfpool start` + `anchor test --skip-local-validator` takes long enough that transactions fail with `Blockhash expired`, make sure the equivalent of `runbooks/deployment/main.tx` includes `instant_surfnet_deployment = true`:

    ```tx
    addon "svm" {
        rpc_api_url = input.rpc_api_url
        network_id = input.network_id
    }

    action "deploy_xyz" "svm::deploy_program" {
        ...
        // Optional: if you want to deploy the program via a cheatcode when targeting a Surfnet, set `instant_surfnet_deployment = true`
        // Deploying via a cheatcode will write the program data directly to the program account, rather than sending transactions.
        // This will make deployments instantaneous, but is deviating from how the deployments will take place on devnet/mainnet.
        instant_surfnet_deployment = true
    }
    ```

- Then run:

    ```bash
    surfpool start
    anchor test --skip-local-validator --skip-deploy
    ```

- This prevents duplicate deployments. Surfpool already deploys the program, so Anchor does not need to send deployment transactions.

### Stack offset exceeded (MPL)

- If on running `anchor build`, `anchor test`, or any Anchor subcommand that builds the program, you get:

    ```rust
    Error: Function _ZN8mpl_core6hooked6plugin31registry_records_to_plugin_list17h3310a9c680a9eb8bE Stack offset of 4184 exceeded max offset of 4096 by 88 bytes, please minimize large stack variables. Estimated function frame size: 4224 bytes. Exceeding the maximum stack offset may cause undefined behavior during execution.
    ```

    or something of the form:

    ```rust
    Error: Function <some_function_name_here> Stack offset of <offset> exceeded max offset of <max_offset> by <overflow> bytes, please minimize large stack variables. Estimated function frame size: <frame_size> bytes. Exceeding the maximum stack offset may cause undefined behavior during execution.
    ```

- `<some_function_name_here>` is often something from MPL. (e.g. `_ZN8mpl_core6hooked6plugin31registry_records_to_plugin_list17h3310a9c680a9eb8bE`)
- (1) If the function is from MPL, you likely have no control over this.
  - You can safely ignore it for local testing.
  - The program still builds and runs locally.
  - Behavior on devnet/mainnet has not been verified.
- (2) If the function is defined by you, reduce stack usage in that function (e.g. break it up, move large locals to the heap).

### Unsupported Program ID

- If a test/transaction fails with an error like:

    ```rust
         Simulation failed.
    Message: Transaction simulation failed: Error processing Instruction <n>: Unsupported program id.
    Logs:
    [
      "Program <program_id> invoke [1]",
      "Program log: Instruction: <instruction_name>",
      "Program <system_program_id> invoke [2]",
      "Program <system_program_id> success",
      "Program <program_id> consumed <compute_used> of <compute_limit> compute units",
      "Program <program_id> failed: Unsupported program id"
    ]
    Catch the `SendTransactionError` and call `getLogs()` on it for full details.
    ```

- This means the instruction is being sent to a program ID that the runtime does not recognize (or support, in the current environment). In short, the program being called isn't in the current runtime.
- In my case, the error is due to missing MPL Core program. Surfpool fetches Mainnet accounts just-in-time. Anchor uses Localnet via solana-test-validator, which doesn't have Mainnet accounts or access to Mainnet data, or interaction with live ecosystem protocols.
- **Solution (1):** One way to fix this is to use `surfpool`
    1. `surfpool start` (given you have a proper Crypto Infrastructure as Code setup)
    2. `anchor test --skip-local-validator`
    3. Profit?
    4. If you run into  [Blockhash expired during test](#blockhash-expired-during-tests), see that or (2).
- **Solution (2):** Another way to fix this is to:
    1. Get the program file:

        ```bash
        solana program dump -u m CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d tests/metaplex_program.so
        ```

        - `-u m` = Dump from Mainnet
        - `Co...7d` = Address of program
        - `tests/metaplex_program.so` = File to dump it to
    2. Append to `Anchor.toml`:

        ```toml
        [[test.genesis]]
        address = "CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d" # The program address
        program = "tests/metaplex_program.so"                    # The path to program file
        ```

    3. Run `anchor test`
    4. Profit!

---

## Week 1

### Accounts

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

#### Account structure

```ts
{
    key: PublicKey,         // ?
    lamports: number,       // ?
    data: UInt8Array,       // Data saved in the account
    is_executable: boolean, // Executable flag
    owner: PublicKey        // Owner of the account
}
```

### Programs

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
>
> - It lets a program:
>   - invoke an instruction in another program
>   - pass accounts + data to it
>   - let the Solana runtime enforce permissions
> - Solana's equivalent of a smart contract calling another contract.
> - CPI is the only sanctioned way for programs to interact.

### Rent

- **Rent is for data stored on chain**
- Rent must be paid to create Accounts on-chain
- Pay 2 years rent upfront for Rent-Exemption
- - At the end of each Epoch, a GC runs which collects rent
- Closing an Account allows rent to be reclaimed
- Resizing an Account costs/returns the difference
- Upgradeable programs require 4 years of rent upfront

### Transactions

- Accounts: Reference all accounts you're going to deal with
- Composition: One or more instructions
- Instructions interface with Solana programs "instruction interface"
- Atomic: Fails entirely if any instruction fails

> Parallel execution of transactions only if they reference different accounts

#### Structure of Transaction

- Multiple messages in a transaction

```ts
{
    message: {
        instructions: Array<instructions>,
        recent_blockhash: number,
        fee_payer: PublicKey
    },
    signers: Array<UInt8Array>
}
```

### Compute (Compute Units)

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

    ```math
    \begin{aligned}
        \text{Prioritization fee} &= \text{CU limit} \cdot \text{CU price} \\
        \text{Priority} &= \frac{\text{Prioritization fee} + \text{Base fee}}{1 + \text{CU limit} + \text{Signature CUs} + \text{Write lock CUs}}
    \end{aligned}
    ```

- Best for the chain: Least amount of CUs

> Can be talked as:
>
> - How much work does the validator have to do computing what you send it to give an output?
> - This is broken into units that dictate cost and control size.
> - Speed of transaction and assurance of inclusion into a block are affected by this.

> Solana intentionally decoupled:
>
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

### PDA

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
>
> - An address deterministically derived from:
>   - one or more seeds (byte strings), and
>   - a program ID (the smart contract's address)
> - The Solana runtime guarantees that the resulting address is off the Ed25519 curve, which means: **No private key exists for it.**
> - So only the program that derived it can authorize actions on it.

### IDL: Interface Design Language

- Interface Design Language/Interface Description Language/Interface Definition Language
- Many on-chain programs have an IDL
- IDL tells what type of instructions/accounts/data the program takes
- Public IDLs can be uploaded to chain for easy access
- Extra PDA may be used to store IDL
- IDLs are written in JSON

### SPL Token

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

### ATA: Associated Token Account

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

### Metaplex

- Initially started as Solana Labs initiative
- Goal: create an open NFT protocol and tools to support it on Solana chain
  - The Metaplex Metadata Standard
  - CandyMachine
  - Compressed NFTs

### Metaplex Token Standard

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

#### Master Edition

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

### Metadata Account

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

### Metadata

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

### Token Extensions (SPL Token 2022)

- Implemented at the token program level, not a separate metadata program
- Extensions are opt-in at mint creation time
- Each extension adds enforced behavior to the token
- Rules apply universally across wallets, programs, and marketplaces
- Extensions cannot be bypassed by clients

#### Common Extensions

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

### Collections

- Collections are just NFTs
  - You create a Collection NFT by setting the CollectionDetails object.
  - To add a NFT to a collection set the Collection field on the Metadata account.
- A Collection allows a authority to verify or unverify.
- Can be nested.
- Collections should now be SIZED; Sized collections allow you to set the number of NFTs in the collection once, and from then on it grows on-chain

### UMI

- Modular framework that can be used for creating javascript clients for Solana programs
- <https://github.com/Web3-Builders-Alliance/cohort-helper/tree/main/BonusResources/umi>

### Task (Solana-Starter)

#### Create a fungible token

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

## Week 2

### Vault

- Trust the chain to verify your wallet with cryptographic signatures so only you can access it
- Instructions:
    1. Initialize the vault
    2. Deposit funds
    3. Withdraw funds
    4. Close the vault

### Task

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
##[program]
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
##[derive(Accounts)] 
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
##[derive(Accounts)]
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
##[derive(InitSpace)]
##[account]
pub struct VaultState {
    pub vault_bump: u8,
    pub state_bump: u8,
}
```

## TODO

## Week 3

### Automated Market Makers (AMM)

- **What:** Entities that actively buy and sell securities or assets at publicly quoted prices, providing liquidity to the market.
- **Key Role:** Facilitate trading by ensuring there is always someone buying or selling (even when supply and demand are imbalanced).
- **Inventory Management:** Strategically manage their inventory to balance risk and potential profit.

- They make money via **Buy-ask spread:** Difference between the price they buy at (bid) and sell at (ask)

#### Liquidity Pool Token (LP Token)

- Invidividuals or entities deposit their assets into liquidity pools.
- LPs earn a share of trading fees as a reward for providing liquidity.
- Required to deposit two tokens:
    - X token
    - Y token
- Received LP token represents their portion of the pool.
- It is nominal, not notional.
    - Nominal: Face amount or count of tokens held
    - Notional: Economic value or underlying exposure represented by the position.
    - Ex:
        - Hold 10 LP tokens, total supply is 1000 tokens.
            - Nominal share = 1% of the pool
        - Pool Total Value Locked = $10,000,000
            - Notional exposure = $100,000

#### Constant Product Automated Market Maker (CPMM)

- Formula: $k = xy$
- Example:
    1. When someone sells token A, AMM buys these and gives them token B
    2. This lowers token B and increases token A
    3. Increases price B, lowers price A
- Example:
    1. k = 600; X: 20, Y: 30
    2. Swap Order: SWAP 5 X
        - $$X_2 = 20 + 5 = 25$$
        - $$Y_2 = 600 / 25 = 24$$
        - Y change $$= 30 - 24 = 6$$
        - Result: $$6 Y$$ for $$5 X$$
    3. Swap Order: SWAP 5 X
        - $$X_2 = 25 + 5 = 30$$
        - $$Y_2 = 600 / 30 = 20$$
        - Y change $$= 24 - 20 = 4$$
        - Result: $$4 Y$$ for $$5 X$$

#### AMM Arbitrage (AMM Arb)

- **Price Difference:** The CPMM values A at 0.59 B. Other markets might still value it closer to the original price of 1 B per A.
- **Buy Low, Sell High:** Arbitrageur's can buy A cheaply from the CPMM at 0.59 B and sell it on another exchange for closer to 1 B.
- **Important points to consider:**
    1. Fees
    2. Gas

#### Impermanent Loss (IL) or Divergent Loss

- **Impermanent Loss:** The constant rebalancing to maintain $$k$$ can lead to LPs having a different ratio of assets than they initially deposited, potentially resulting in a loss compared to simply holding the tokens.
- **Fees as Compensation:** LPs earn trading fees on each swap, which helps offset the risk of impermanent loss.
- **Divergent Loss:**
    1. Negative gamma
    2. Rho or rates

### Order Flow

- **Two** main types of Order Flow:
    1. Informed: Driven by traders with privileged information, potentially impacting market prices.
    2. Uninformed: Based on publicly available infromation and sentiment, less likely to significantly impact prices.

- **Two** types of **Uninformed Flow**:
    1. Non-Toxic: Patient, long term trades by long-term investors, contributing to a healthy market.
    2. Toxic: Aggressive, high-frequency trading that creates artificial volatility and can harm market quality.

### Types of AMM

- Invariant: $$A n^n \sum x_i + D = A n^n D + \frac{D^{n+1}}{n^n \prod{x_i}}$$
- Concentrated Liquidty AMM (CLMM):
    - Invariant for tick range
    - Can be sum or product
- Hybrid CPMMs (e.g., Curve Finance)
- Function-maximizing AMMs (fmAMMs)
    - CoW Swap: Batch Auctions with Solver Intents

### Program and ProgramData

- `ProgramData` stores the deployment slot ID and the address of the upgrade authority.

```rust
// Refers to the program itself, AnchorMplxcoreQ425 is the program
pub this_program: Program<'info, AnchorMplxcoreQ425>,
// Refers to the program data
pub program_data: Account<'info, ProgramData>
```

This allows for checks like:
1. The program_data account passed in is actually associated with the program.
2. The instruction is authorized by the program's upgrade authority
```rust
#[account(
    constraint = this_program.programdata_address()? == Some(program_data.key())
)]
pub this_program: Program<'info, AnchorMplxcoreQ425>,
#[account(
    constraint = program_data.upgrade_authority_address == Some(payer.key()) @ MPLXCoreError::NotAuthorized
)]
pub program_data: Account<'info, ProgramData>,
```


<!-- MathJax loader for non-MatchJax supporting renderers. -->
<script id="MathJax-script" async src="https://cdn.jsdelivr.net/npm/mathjax@4/tex-mml-chtml.js"></script>
