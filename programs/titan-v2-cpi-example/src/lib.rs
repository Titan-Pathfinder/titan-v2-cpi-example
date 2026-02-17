#![allow(unexpected_cfgs)]
#![allow(clippy::needless_lifetimes)]
use anchor_lang::prelude::*;

pub mod constant;
pub mod swap;
pub use swap::*;

declare_id!("8Faz99YdaCqSR4SK2nNs5PCpLShpwzScqA9BJTAAJKTj");

#[program]
pub mod titan_v2_cpi_example {
    use super::*;

    pub fn swap<'info>(
        ctx: Context<'_, '_, '_, 'info, Swap<'info>>,
        swap_data: Vec<u8>,
        amount: u64,
        minimum_amount_out: u64,
    ) -> Result<()> {
        ctx.accounts
            .check_amount_and_minimum_out(&swap_data, amount, minimum_amount_out)?;
        ctx.accounts.titan_swap(
            &swap_data,
            ctx.remaining_accounts,
            &[ctx.bumps.protocol_authority],
        )
    }
}
