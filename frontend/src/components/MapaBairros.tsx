import { useEffect, useState } from 'react';
import { MapContainer, TileLayer, CircleMarker, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

interface Bairro { bairro: string; count: number }
interface Ponto { bairro: string; count: number; lat: number; lng: number }

// Centro: Barreiro, Belo Horizonte
const CENTER: [number, number] = [-19.9747, -44.0297];

async function geocode(bairro: string): Promise<[number, number] | null> {
  const key = `geo:${bairro.toLowerCase()}`;
  const cached = localStorage.getItem(key);
  if (cached) { try { return JSON.parse(cached); } catch { /* ignore */ } }
  try {
    const q = encodeURIComponent(`${bairro}, Belo Horizonte, MG, Brasil`);
    const r = await fetch(`https://nominatim.openstreetmap.org/search?q=${q}&format=json&limit=1`);
    const d = await r.json();
    if (d?.[0]) {
      const coord: [number, number] = [parseFloat(d[0].lat), parseFloat(d[0].lon)];
      localStorage.setItem(key, JSON.stringify(coord));
      return coord;
    }
  } catch { /* ignore */ }
  return null;
}

export default function MapaBairros({ bairros }: { bairros: Bairro[] }) {
  const [pontos, setPontos] = useState<Ponto[]>([]);
  const [naoLocalizados, setNaoLocalizados] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancel = false;
    (async () => {
      setLoading(true);
      const ps: Ponto[] = [];
      const fail: string[] = [];
      for (const b of bairros) {
        if (!b.bairro || b.bairro.startsWith('(')) continue; // ignora "(não informado)"
        const c = await geocode(b.bairro);
        if (cancel) return;
        if (c) ps.push({ bairro: b.bairro, count: b.count, lat: c[0], lng: c[1] });
        else fail.push(b.bairro);
      }
      if (!cancel) { setPontos(ps); setNaoLocalizados(fail); setLoading(false); }
    })();
    return () => { cancel = true; };
  }, [bairros]);

  const max = Math.max(1, ...pontos.map((p) => p.count));

  return (
    <div>
      <div style={{ height: 320, borderRadius: 12, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.1)' }}>
        <MapContainer center={CENTER} zoom={12} style={{ height: '100%', width: '100%' }} scrollWheelZoom={false}>
          <TileLayer
            attribution='&copy; OpenStreetMap'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          {pontos.map((p) => (
            <CircleMarker
              key={p.bairro}
              center={[p.lat, p.lng]}
              radius={8 + 20 * (p.count / max)}
              pathOptions={{ color: '#7c3aed', fillColor: '#7c3aed', fillOpacity: 0.45, weight: 1 }}
            >
              <Popup><strong>{p.bairro}</strong><br />{p.count} lead(s)</Popup>
            </CircleMarker>
          ))}
        </MapContainer>
      </div>
      {loading && <p style={{ color: 'var(--text-muted)', fontSize: '0.78rem', marginTop: 6 }}>Localizando bairros no mapa…</p>}
      {!loading && naoLocalizados.length > 0 && (
        <p style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginTop: 6 }}>
          Não localizados no mapa: {naoLocalizados.join(', ')}
        </p>
      )}
    </div>
  );
}
