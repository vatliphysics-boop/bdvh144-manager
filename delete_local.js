const url = 'http://localhost:3000';
const loginCode = 'KHOI-PR-9X82MZ4K7W';

async function run() {
  try {
    console.log('Logging in to localhost...');
    const loginRes = await fetch(`${url}/api/auth/login-code`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: loginCode })
    });
    
    if (!loginRes.ok) throw new Error('Login failed');
    
    const cookies = loginRes.headers.get('set-cookie');
    if (!cookies) throw new Error('No cookies returned');
    
    // Get session details
    console.log('Fetching session details...');
    const sessionRes = await fetch(`${url}/api/admin/sessions/1`, {
      headers: { 'Cookie': cookies }
    });
    
    const sessionData = await sessionRes.json();
    if (!sessionData.success) throw new Error('Failed to fetch session');
    
    const regs = sessionData.registrations || [];
    console.log('Total registrations in session 1:', regs.length);
    
    const demoReg = regs.find(r => 
      r.full_name === 'Võ Đoàn Đăng Khôi' && 
      r.class_name === 'Lớp 10'
    );
    
    if (!demoReg) {
      console.log('Demo registration not found!');
      return;
    }
    
    console.log('Found demo registration ID:', demoReg.id, demoReg.registered_at);
    
    // Delete it
    console.log('Deleting...');
    const deleteRes = await fetch(`${url}/api/admin/registrations/${demoReg.id}`, {
      method: 'DELETE',
      headers: { 'Cookie': cookies }
    });
    
    const deleteData = await deleteRes.json();
    console.log('Delete result:', deleteData);

  } catch (err) {
    console.error('Error:', err);
  }
}
run();
