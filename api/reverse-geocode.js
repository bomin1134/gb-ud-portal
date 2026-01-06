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

  if (!clientId || !clientSecret) {
    return res.status(500).json({ error: 'Missing Naver Map credentials' });
  }

  try {
    const coords = `${lng},${lat}`;
    const url = `https://naveropenapi.apigw.ntruss.com/map-reversegeocode/v2/gc?coords=${coords}&orders=addr,roadaddr&output=json`;

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'X-NCP-APIGW-API-KEY-ID': clientId,
        'X-NCP-APIGW-API-KEY': clientSecret
      }
    });

    if (!response.ok) {
      return res.status(response.status).json({ error: 'Naver API error' });
    }

    const data = await response.json();
    return res.status(200).json(data);
  } catch (error) {
    console.error('Reverse geocode error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
