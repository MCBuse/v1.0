import { Pool } from 'pg';

const pool = new Pool({
  host: process.env.DATABASE_HOST || 'localhost',
  port: parseInt(process.env.DATABASE_PORT || '5432'),
  user: process.env.DATABASE_USER || 'postgres',
  password: process.env.DATABASE_PASSWORD || 'postgres',
  database: process.env.DATABASE_NAME || 'mcbuse_dev',
});

async function addFunds(email: string, amount: string) {
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

  const balanceResult = await pool.query(`
    SELECT b.id, b.currency, b.available
    FROM balances b
    JOIN wallets w ON w.id = b.wallet_id
    WHERE w.user_id = $1 AND w.type = 'routine'
  `, [user.id]);

  if (balanceResult.rows.length === 0) {
    console.error('❌ No balances found');
    await pool.end();
    process.exit(1);
  }

  console.log('Current balances:');
  for (const balance of balanceResult.rows) {
    console.log(`  ${balance.currency}: ${balance.available}`);
  }

  for (const balance of balanceResult.rows) {
    await pool.query(
      'UPDATE balances SET available = $1 WHERE id = $2',
      [amount, balance.id]
    );
    console.log(`✓ Updated ${balance.currency} to: ${amount}`);
  }

  await pool.end();
  console.log('\nDone! Refresh the app to see new balances.');
}

const email = process.argv[2];
const amount = process.argv[3] || '100000000'; // Default 100.00 USDC

if (!email) {
  console.error('Usage: npx tsx scripts/add-test-funds.ts <email> [amount]');
  console.error('Example: npx tsx scripts/add-test-funds.ts alice@test.com 100000000');
  process.exit(1);
}

addFunds(email, amount);
