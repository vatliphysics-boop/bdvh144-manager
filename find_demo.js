const { query } = require('./server/db');

async function run() {
  try {
     const res = await query(`
       SELECT * FROM registrations 
       WHERE full_name = 'Võ Đoàn Đăng Khôi'
     `);
     console.log('Found records:', res.rows.length);
     for (const row of res.rows) {
       console.log(row.id, row.class_name, row.registered_at);
     }
  } catch (e) {
     console.error(e);
  }
  process.exit(0);
}
run();
