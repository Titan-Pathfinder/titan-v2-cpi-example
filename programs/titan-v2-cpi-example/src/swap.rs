use anchor_lang::prelude::*;
use anchor_lang::solana_program::{instruction::Instruction, program::invoke_signed};
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::{Mint, Token, TokenAccount};
use std::mem::size_of;

use crate::constant::*;

#[derive(Accounts)]
pub struct Swap<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(
        mut,
        seeds = [b"protocol_authority"],
        bump
    )]
    pub protocol_authority: SystemAccount<'info>,
    pub input_mint: Account<'info, Mint>,
    #[account(
        mut,
        associated_token::mint = input_mint,
        associated_token::authority = protocol_authority
    )]
    pub input_vault: Account<'info, TokenAccount>,
    pub output_mint: Account<'info, Mint>,
    #[account(
        init_if_needed,
        payer = payer,
        associated_token::mint = output_mint,
        associated_token::authority = protocol_authority,
    )]
    pub output_vault: Account<'info, TokenAccount>,
    /// CHECK: Atlas PDA owned by the Titan program
    pub atlas: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    #[account(address = TITAN_PROGRAM_ID)]
    /// CHECK: safe because of address constraint
    pub titan_program: UncheckedAccount<'info>,
}

impl<'info> Swap<'info> {
    pub fn check_amount_and_minimum_out(
        &self,
        swap_data: &[u8],
        amount: u64,
        minimum_amount_out: u64,
    ) -> Result<()> {
        if !swap_data.starts_with(&SWAP_ROUTE_V2_DISCRIMINATOR) {
            return Err(ProgramError::InvalidInstructionData.into());
        }

        // Titan swap_route_v2 data layout: [8 discriminator][8 amount][8 minimum_amount_out]...
        let amount_offset = 8;
        let min_out_offset = amount_offset + size_of::<u64>();

        require_eq!(
            amount,
            u64::from_le_bytes(
                swap_data[amount_offset..amount_offset + size_of::<u64>()]
                    .try_into()
                    .unwrap()
            )
        );
        require_eq!(
            minimum_amount_out,
            u64::from_le_bytes(
                swap_data[min_out_offset..min_out_offset + size_of::<u64>()]
                    .try_into()
                    .unwrap()
            )
        );

        Ok(())
    }

    pub fn titan_swap(
        &self,
        swap_data: &[u8],
        remaining_accounts: &[AccountInfo<'info>],
        bump: &[u8],
    ) -> Result<()> {
        let signer_seeds: [&[&[u8]]; 1] = [&[b"protocol_authority", bump]];

        // Build account infos for the CPI call.
        // Fixed accounts for Titan's swap_route: payer, atlas, input_mint,
        // input_token_account, output_mint, output_token_account,
        // input_token_program, output_token_program.
        let mut account_infos = vec![
            self.protocol_authority.to_account_info(), // payer
            self.atlas.to_account_info(),              // atlas
            self.input_mint.to_account_info(),         // input_mint
            self.input_vault.to_account_info(),        // input_token_account
            self.output_mint.to_account_info(),        // output_mint
            self.output_vault.to_account_info(),       // output_token_account
            self.token_program.to_account_info(),      // input_token_program
            self.token_program.to_account_info(),      // output_token_program
        ];
        account_infos.extend(
            remaining_accounts
                .iter()
                .map(|acc| AccountInfo { ..acc.clone() }),
        );

        // Build account metas for the CPI instruction
        let mut accounts = vec![
            AccountMeta::new(self.protocol_authority.key(), true), // payer (writable, signer)
            AccountMeta::new_readonly(self.atlas.key(), false),    // atlas
            AccountMeta::new_readonly(self.input_mint.key(), false), // input_mint
            AccountMeta::new(self.input_vault.key(), false),       // input_token_account
            AccountMeta::new_readonly(self.output_mint.key(), false), // output_mint
            AccountMeta::new(self.output_vault.key(), false),      // output_token_account
            AccountMeta::new_readonly(self.token_program.key(), false), // input_token_program
            AccountMeta::new_readonly(self.token_program.key(), false), // output_token_program
        ];
        accounts.extend(remaining_accounts.iter().map(|acc| AccountMeta {
            pubkey: *acc.key,
            is_signer: false,
            is_writable: acc.is_writable,
        }));

        msg!("Performing a CPI with Titan swap_route_v2");

        let swap_ix = Instruction {
            program_id: self.titan_program.key(),
            accounts,
            data: swap_data.to_vec(),
        };

        invoke_signed(&swap_ix, &account_infos, &signer_seeds)?;

        Ok(())
    }
}
