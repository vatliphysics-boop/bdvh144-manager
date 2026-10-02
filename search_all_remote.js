const url = 'https://bdvh144-manager.onrender.com';
const loginCode = 'KHOI-PR-9X82MZ4K7W';

async function run() {
  try {
    const loginRes = await fetch(`${url}/api/auth/login-code`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: loginCode })
    });
    const cookies = loginRes.headers.get('set-cookie');
    
    // Get all sessions
    const sessionsRes = await fetch(`${url}/api/admin/sessions`, {
      headers: { 'Cookie': cookies }
    });
    const sessionsData = await sessionsRes.json();
    const sessions = sessionsData.sessions;
    
    for (const s of sessions) {
      console.log(`Checking session ${s.id}...`);
      const sDetailRes = await fetch(`${url}/api/admin/sessions/${s.id}`, {
        headers: { 'Cookie': cookies }
      });
      const sData = await sDetailRes.json();
      if (!sData.success) continue;
      
      const regs = sData.registrations || [];
      const demoReg = regs.find(r => 
        r.full_name === 'Võ Đoàn Đăng Khôi' && 
        r.class_name === 'Lớp 10'
      );
      
      if (demoReg) {
         console.log('Found on session', s.id, demoReg);
         // Delete
         const deleteRes = await fetch(`${url}/api/admin/registrations/${demoReg.id}`, {
           method: 'DELETE',
           headers: { 'Cookie': cookies }
         });
         console.log(await deleteRes.json());
      }
    }

  } catch (err) {
    console.error('Error:', err);
  }
}
run();
