// Vercel Serverless Function: Naver Maps Reverse Geocoding
export default async function handler(req, res) {
  // CORS 헤더 설정
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token,X-Requested-With,Accept,Accept-Version,Content-Length,Content-MD5,Content-Type,Date,X-Api-Version');
  
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { lat, lng } = req.query;

  if (!lat || !lng) {
    return res.status(400).json({ error: 'Missing lat or lng parameters' });
  }

  const clientId = process.env.VITE_NAVER_MAP_CLIENT_ID;
  const clientSecret = process.env.VITE_NAVER_MAP_CLIENT_SECRET;

  console.log('환경 변수 확인:', {
    hasClientId: !!clientId,
    hasClientSecret: !!clientSecret,
    clientIdLength: clientId?.length,
    clientSecretLength: clientSecret?.length
  });

  if (!clientId || !clientSecret) {
    console.error('환경 변수 누락!');
    return res.status(500).json({ error: 'Missing Naver Map credentials', debug: { hasClientId: !!clientId, hasClientSecret: !!clientSecret } });
  }

  try {
    const coords = `${lng},${lat}`;
    const url = `https://maps.apigw.ntruss.com/map-reversegeocode/v2/gc?coords=${coords}&orders=addr,roadaddr&output=json`;

    console.log('Naver API 요청:', {
      url,
      coords,
      hasHeaders: true
    });

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'x-ncp-apigw-api-key-id': clientId,
        'x-ncp-apigw-api-key': clientSecret,
        'Accept': 'application/json'
      }
    });

    console.log('Naver API 응답:', response.status, response.statusText);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Naver API 오류 응답:', errorText);
      return res.status(response.status).json({ 
        error: `Naver API error: ${response.statusText}`,
        details: errorText
      });
    }

    const data = await response.json();
    console.log('Naver API 성공:', data.status);
    return res.status(200).json(data);
  } catch (error) {
    console.error('Reverse geocode error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
