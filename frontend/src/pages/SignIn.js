import React, { useState } from 'react';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useNavigate } from 'react-router-dom';
import { signIn, errorMessage } from '../services/api';

export default function SignIn() {
  const [key, setKey] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  async function submit(event) {
    event.preventDefault(); setBusy(true); setError('');
    try { await signIn(key); navigate('/'); }
    catch (err) { setError(errorMessage(err)); } finally { setBusy(false); }
  }
  return <Stack component="form" onSubmit={submit} spacing={2} sx={{ maxWidth: 520 }}>
    <Typography variant="h4" component="h1">Sign in</Typography>
    <Typography>Enter the access key supplied by your administrator.</Typography>
    {error && <Alert severity="error">{error}</Alert>}
    <TextField label="Access key" type="password" value={key} onChange={event => setKey(event.target.value)} required />
    <Button type="submit" variant="contained" disabled={busy}>Sign in</Button>
  </Stack>;
}
