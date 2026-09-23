import React, { useEffect, useRef, useState } from 'react';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { Link, useNavigate } from 'react-router-dom';
import { Html5Qrcode } from 'html5-qrcode';

export default function ScanProduct() {
  const navigate = useNavigate();
  const scanner = useRef(null);
  const pending = useRef(null);
  const mounted = useRef(true);
  const [state, setState] = useState('idle');
  const [error, setError] = useState('');
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      Promise.resolve(pending.current).catch(() => {}).then(async () => {
        if (scanner.current?.isScanning) await scanner.current.stop();
        scanner.current?.clear();
      }).catch(() => {});
    };
  }, []);
  async function stop() {
    if (scanner.current?.isScanning) await scanner.current.stop();
    if (mounted.current) setState('idle');
  }
  async function start() {
    setError(''); setState('starting');
    try {
      scanner.current ||= new Html5Qrcode('qr-reader');
      pending.current = scanner.current.start({ facingMode: 'environment' }, { fps: 10, qrbox: 250 }, async text => {
        if (!mounted.current) return;
        await stop();
        // Treat the QR content as an identifier; never navigate to an arbitrary URL.
        let id = text;
        try { const url = new URL(text); id = url.searchParams.get('id') || decodeURIComponent(url.pathname.split('/').filter(Boolean).pop() || ''); } catch { /* Plain product ID. */ }
        if (mounted.current) navigate(`/verify?id=${encodeURIComponent(id)}`);
      });
      await pending.current;
      if (mounted.current) setState('scanning');
    } catch {
      if (mounted.current) { setError('Unable to access the camera. Check camera permissions or enter the product ID manually.'); setState('idle'); }
    }
  }
  return <Stack spacing={2}>
    <Typography variant="h4" component="h1">Scan product QR code</Typography>
    {error && <Alert severity="error">{error}</Alert>}
    <div id="qr-reader" style={{ maxWidth: 640 }} />
    <Button variant="contained" disabled={state === 'starting'} onClick={state === 'scanning' ? () => stop().catch(() => setError('Unable to stop the camera.')) : start}>
      {state === 'scanning' ? 'Stop scanner' : state === 'starting' ? 'Starting camera…' : 'Start scanner'}
    </Button>
    <Button component={Link} to="/verify">Enter product ID manually</Button>
  </Stack>;
}
