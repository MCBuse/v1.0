import { Pool } from 'pg';
import { randomBytes } from 'crypto';

const pool = new Pool({
  host: process.env.DATABASE_HOST || 'localhost',
  port: parseInt(process.env.DATABASE_PORT || '5432'),
  user: process.env.DATABASE_USER || 'postgres',
  password: process.env.DATABASE_PASSWORD || 'postgres',
  database: process.env.DATABASE_NAME || 'mcbuse_dev',
});

async function createWallets(email: string) {
  console.log(`Looking for user: ${email}`);

  const userResult = await pool.query(
    'SELECT id, username, first_name, last_name FROM users WHERE email = $1 AND is_active = true',
    [email]
  );

  if (userResult.rows.length === 0) {
    console.error('❌ User not found');
    await pool.end();
    process.exit(1);
  }

  const user = userResult.rows[0];
  console.log(`✓ Found user: ${user.username} (${user.first_name} ${user.last_name})`);

  // Check if wallets already exist
  const existingWallets = await pool.query(
    'SELECT id, type FROM wallets WHERE user_id = $1',
    [user.id]
  );

  if (existingWallets.rows.length > 0) {
    console.log('✓ Wallets already exist:', existingWallets.rows.map(w => w.type).join(', '));
  } else {
    // Create both wallets
    for (const walletType of ['routine', 'savings']) {
      const solanaPubkey = 'DUMMY' + randomBytes(16).toString('hex');
      const encryptedKeypair = 'encrypted_' + randomBytes(32).toString('hex');

      const walletResult = await pool.query(`
        INSERT INTO wallets (user_id, type, solana_pubkey, encrypted_keypair, is_active)
        VALUES ($1, $2, $3, $4, true)
        RETURNING id
      `, [user.id, walletType, solanaPubkey, encryptedKeypair]);

      const walletId = walletResult.rows[0].id;
      console.log(`✓ Created ${walletType} wallet`);

      // Create balances
      for (const currency of ['USDC', 'EURC']) {
        await pool.query(`
          INSERT INTO balances (wallet_id, currency, available, pending)
          VALUES ($1, $2, '100000000', '0')
        `, [walletId, currency]);
        console.log(`  ✓ Created ${currency} balance (100.00)`);
      }
    }
  }

  await pool.end();
  console.log('\nDone! User now has full wallet setup with 100 USDC and 100 EURC in each wallet.');
}

const email = process.argv[2];

if (!email) {
  console.error('Usage: npx tsx scripts/create-test-wallets.ts <email>');
  console.error('Example: npx tsx scripts/create-test-wallets.ts alice@test.com');
  process.exit(1);
}

createWallets(email);
