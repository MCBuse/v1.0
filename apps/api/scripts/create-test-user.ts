import { Pool } from 'pg';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';

const pool = new Pool({
  host: process.env.DATABASE_HOST || 'localhost',
  port: parseInt(process.env.DATABASE_PORT || '5432'),
  user: process.env.DATABASE_USER || 'postgres',
  password: process.env.DATABASE_PASSWORD || 'postgres',
  database: process.env.DATABASE_NAME || 'mcbuse_dev',
});

async function createUser(username: string, firstName: string, lastName: string) {
  const email = `${username}@test.com`;
  const passwordHash = await bcrypt.hash('password123', 12);

  console.log(`Creating user: @${username}`);

  try {
    const userResult = await pool.query(`
      INSERT INTO users (email, username, first_name, last_name, password_hash, is_email_verified, is_active)
      VALUES ($1, $2, $3, $4, $5, true, true)
      RETURNING id, username
    `, [email, username, firstName, lastName, passwordHash]);

    const user = userResult.rows[0];
    console.log(`✓ Created user: ${user.username} (${email})`);

    // Create wallets
    for (const walletType of ['routine', 'savings']) {
      const solanaPubkey = 'DUMMY' + randomBytes(16).toString('hex');
      const encryptedKeypair = 'encrypted_' + randomBytes(32).toString('hex');

      const walletResult = await pool.query(`
        INSERT INTO wallets (user_id, type, solana_pubkey, encrypted_keypair, is_active)
        VALUES ($1, $2, $3, $4, true)
        RETURNING id
      `, [user.id, walletType, solanaPubkey, encryptedKeypair]);

      const walletId = walletResult.rows[0].id;

      // Create balances
      for (const currency of ['USDC', 'EURC']) {
        await pool.query(`
          INSERT INTO balances (wallet_id, currency, available, pending)
          VALUES ($1, $2, '50000000', '0')
        `, [walletId, currency]);
      }
    }

    console.log(`✓ Created wallets with 50 USDC and 50 EURC each`);
    console.log(`\n✅ Test user ready!`);
    console.log(`   Email: ${email}`);
    console.log(`   Username: @${username}`);
    console.log(`   Password: password123`);

  } catch (err: any) {
    if (err.code === '23505') {
      console.error('❌ User already exists');
    } else {
      console.error('❌ Error:', err.message);
    }
  }

  await pool.end();
}

const username = process.argv[2] || 'bob';
const firstName = process.argv[3] || 'Bob';
const lastName = process.argv[4] || 'Test';

createUser(username, firstName, lastName);
