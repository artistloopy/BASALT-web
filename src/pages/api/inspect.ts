export async function POST({ request }) {
  try {
    const headers = {};
    for (const [k, v] of request.headers) headers[k] = v;
    let raw = null;
    try { raw = await request.text(); } catch { raw = null; }
    return new Response(JSON.stringify({ headers, raw }, null, 2), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
  }
}

export async function GET() {
  return new Response(JSON.stringify({ ok: true, note: 'POST to this endpoint to inspect headers and raw body' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
}
