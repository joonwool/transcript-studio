export default async function handler(req, res) {
  const { v } = req.query;
  if (!v) return res.status(400).json({ error: 'Video ID required' });

  try {
    const response = await fetch(`https://www.youtube.com/watch?v=${v}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept-Language': 'en-US,en;q=0.9'
      }
    });
    const html = await response.text();

    // 제목 추출
    const titleMatch = html.match(/"title":"([^"]+)"/);
    const title = titleMatch ? titleMatch[1].replace(/\\u0026/g, '&') : 'YouTube 영상';

    // 자막 URL 추출
    const captionMatch = html.match(/"captionTracks":\[(.*?)\],"audioTracks"/);
    if (!captionMatch) {
      return res.status(404).json({ error: '이 영상에는 자막이 없습니다' });
    }

    const tracks = captionMatch[1];
    const enMatch = tracks.match(/"baseUrl":"([^"]+)"[^}]*"languageCode":"en"/);
    const anyMatch = tracks.match(/"baseUrl":"([^"]+)"/);
    const rawUrl = enMatch ? enMatch[1] : anyMatch ? anyMatch[1] : null;
    if (!rawUrl) return res.status(404).json({ error: '자막을 찾을 수 없습니다' });

    const captionUrl = rawUrl.replace(/\\u0026/g, '&').replace(/\\\//g, '/');
    const xmlRes = await fetch(captionUrl);
    const xml = await xmlRes.text();

    // XML 파싱
    const lines = [];
    const regex = /<text[^>]*>([\s\S]*?)<\/text>/g;
    let match;
    while ((match = regex.exec(xml)) !== null) {
      const text = match[1]
        .replace(/&amp;/g, '&').replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>').replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'").replace(/<[^>]+>/g, '').trim();
      if (text) lines.push(text);
    }

    // 문장 단위로 합치기
    const merged = [];
    let buf = '';
    for (let i = 0; i < lines.length; i++) {
      buf += (buf ? ' ' : '') + lines[i];
      if (/[.!?]$/.test(buf) || buf.length > 120 || i === lines.length - 1) {
        merged.push({ text: buf.trim() });
        buf = '';
      }
    }

    res.status(200).json({ title, lines: merged });
  } catch (e) {
    res.status(500).json({ error: '트랜스크립트를 가져오지 못했습니다' });
  }
}
