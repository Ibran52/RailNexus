async function test() {
  try {
    const loginRes = await fetch('http://localhost:5000/api/v1/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'worker@railnexus.gov.in',
        password: 'ValidPass123!',
      }),
    });
    const loginData = await loginRes.json();
    const token = loginData.data?.token;
    console.log('Logged in successfully, token received:', Boolean(token));

    const sectionsRes = await fetch('http://localhost:5000/api/v1/brain/sections');
    const sectionsData = await sectionsRes.json();
    const firstSection = sectionsData.data[0];
    console.log('Using verified section:', firstSection);

    const reqRes = await fetch('http://localhost:5000/api/v1/maintenance/requests', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        maintenanceType: 'Track Renewal',
        fromStation: firstSection.from_station,
        toStation: firstSection.to_station,
        durationMinutes: 120,
        earliestStart: '1900-01-01T01:00:00.000Z',
        latestEnd: '1900-01-01T05:00:00.000Z',
        priority: 'HIGH',
        description: 'Emergency track maintenance and tamping',
      }),
    });

    const reqData = await reqRes.json();
    console.log('Request creation response status:', reqRes.status);
    console.log('Response body:', JSON.stringify(reqData, null, 2));
  } catch (err) {
    console.error('Error during test:', err);
  }
}

test();

