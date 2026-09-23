import React, { useState } from 'react';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { verifyProduct, errorMessage } from '../services/api';
import ProductRecord from '../components/ProductRecord';

export default function Verification() {
  const params = useParams();
  const [search] = useSearchParams();
  const [id, setId] = useState(params.id || search.get('id') || '');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function verify(event) {
    event.preventDefault(); setBusy(true); setError(''); setResult(null);
    try { setResult(await verifyProduct(id.trim())); }
    catch (err) { setError(errorMessage(err)); } finally { setBusy(false); }
  }
  return <Stack spacing={2}>
    <Typography variant="h4" component="h1">Verify product authenticity</Typography>
    <Stack component="form" onSubmit={verify} spacing={2}>
      <TextField label="Product ID" value={id} onChange={event => setId(event.target.value)} required />
      <Button type="submit" variant="contained" disabled={busy || !id.trim()}>{busy ? 'Verifying…' : 'Verify'}</Button>
      <Button component={Link} to="/scan">Scan QR code</Button>
    </Stack>
    {error && <Alert severity="error">{error}</Alert>}
    {result && <><Alert severity="success">Product found in the ledger.</Alert><ProductRecord product={result.product || result} /></>}
  </Stack>;
}
