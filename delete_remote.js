const url = 'https://bdvh144-manager.onrender.com';
const loginCode = 'KHOI-PR-9X82MZ4K7W';

async function run() {
  try {
    console.log('Logging in...');
    const loginRes = await fetch(`${url}/api/auth/login-code`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: loginCode })
    });
    
    if (!loginRes.ok) throw new Error('Login failed');
    
    const cookies = loginRes.headers.get('set-cookie');
    if (!cookies) throw new Error('No cookies returned');
    
    // Get session 1 details
    console.log('Fetching session details...');
    const sessionRes = await fetch(`${url}/api/admin/sessions/1`, {
      headers: { 'Cookie': cookies }
    });
    
    const sessionData = await sessionRes.json();
    if (!sessionData.success) throw new Error('Failed to fetch session');
    
    const regs = sessionData.registrations;
    const demoReg = regs.find(r => 
      r.full_name === 'Võ Đoàn Đăng Khôi' && 
      r.class_name === 'Lớp 10' &&
      r.registered_at.includes('23:01:12 02/10/2026')
    );
    
    if (!demoReg) {
      console.log('Demo registration not found!');
      // Maybe try to find without strict timestamp
      const fallback = regs.filter(r => r.full_name === 'Võ Đoàn Đăng Khôi' && r.class_name === 'Lớp 10');
      console.log('Similar records:', fallback.map(r => ({id: r.id, time: r.registered_at})));
      return;
    }
    
    console.log('Found demo registration ID:', demoReg.id);
    
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
