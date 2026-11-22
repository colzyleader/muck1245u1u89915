# Pocket Discord deposit bot

Members type `$depo` or `$depo LTC` and receive their assigned Litecoin mainnet address in a DM. The bot follows the address while it runs. It sends a Pending DM when a deposit is detected below the confirmation threshold, and a Confirmed DM when the threshold is met. If the first observation already qualifies, it sends Confirmed directly.

## Install and run

Use Node 22.18+ and a persistent disk. Run `npm ci` inside this folder.

1. On a trusted offline machine with the dependencies installed, run `npm run inventory -- 25 offline-wallet-backup`. This creates 25 distinct wallets. The backup directory contains the recovery words for each wallet and one public address inventory. Protect and back up the entire directory. Copy **only public-pool.json** from it into the bot folder on the host. For more users, generate a fresh inventory in another directory, and start the existing bot with that file. Existing assignments stay in SQLite.
2. Open the Discord Developer Portal, create a bot, enable **Message Content Intent**, and invite it with **View Channels** and **Send Messages**. Copy `.env.example` to `.env` and set `DISCORD_TOKEN`. Set `DATA_DIR` to a persistent volume on your bot host. LTC, BTC and SOL have default public providers. ETH, BNB and AVAX additionally need an Etherscan V2 key with access to each chain. Use a dedicated provider if you hit rate limits.
3. Run `npm test`, then `npm start`. Keep the process running. In Discord, run `$depo LTC` and allow DMs. The bot checks the chosen network before sending the address. It uses outbound connections only.

## Scope and timing

| Command | Network | First eligible Pending observation | Confirmed |
| --- | --- | --- | --- |
| $depo LTC | Litecoin | Mempool or shallow block | 6 blocks including the deposit block |
| $depo BTC | Bitcoin | Mempool or shallow block | 3 blocks |
| $depo SOL | Solana | Confirmed successful native system transfer | Finalized |
| $depo ETH | Ethereum | Successful indexed native transfer in a block | 12 blocks |
| $depo BNB | BNB Smart Chain | Successful indexed native transfer in a block | 15 blocks |
| $depo AVAX | Avalanche C-Chain | Successful indexed native transfer in a block | 3 blocks |

Polls run about every 20 seconds per network plus the time to check active addresses. Each Discord member has a stable assignment across restarts. Request each coin you want watched. EVM networks share the same member address. Tokens, internal EVM contract transfers, and change from spending the deposit address are outside this watcher's scope. A dropped pending transaction never qualifies for Confirmed. Discord permissions, provider availability, and chain indexing affect notification timing. A crash during Discord delivery can result in a repeated DM. A notification is a chain observation, not a spendable account credit.

## Ownership and recovery

New deposit addresses belong to operator-controlled wallets. Only the operator has their recovery words. There is no withdrawal command or automatic payment forwarding. Members previously enrolled with the page-based version keep their original self-custody addresses when you use the same wallets.sqlite. Those words remain with the member. Old setup links are unused. Existing standalone Pocket browser-wallet deposits are separate.

Back up the SQLite database using SQLite's online backup facility, along with the offline recovery material. Never start an independent database with an already-used pool: it could assign the same addresses to different members. Run one bot instance per database. The pool table maps a Discord user ID to a slot, and the matching SLOT.words file contains its BIP39 words. Restore using an empty passphrase. Paths are BTC m/84'/0'/0'/0/0, LTC m/84'/2'/0'/0/0, SOL m/44'/501'/0'/0', and ETH/BNB/AVAX m/44'/60'/0'/0/0. Verify a restored address against the assigned public address before accepting funds.

Default data sources: Litecoin Space and mempool.space (Esplora), Solana JSON-RPC, Etherscan V2 plus chain RPC for transaction verification. Optional provider overrides are LTC_API, BTC_API, SOL_RPC, ETH_RPC, BNB_RPC and AVAX_RPC. Esplora URLs include /api.
