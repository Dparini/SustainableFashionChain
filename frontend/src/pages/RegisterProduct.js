import React, { useState } from 'react';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useNavigate } from 'react-router-dom';
import { registerProduct, errorMessage } from '../services/api';

export default function RegisterProduct() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ id: '', type: 'cotton', origin: '', quantity: '', manufacturer: '', harvestDate: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const change = event => setForm({ ...form, [event.target.name]: event.target.value });
  async function submit(event) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const product = await registerProduct({
        id: form.id.trim(), type: form.type, origin: form.origin.trim(), certifications: [],
        metadata: { quantity: Number(form.quantity), manufacturer: form.manufacturer, harvestDate: form.harvestDate },
      });
      navigate(`/products/${encodeURIComponent(product.id)}`);
    } catch (err) { setError(errorMessage(err)); } finally { setBusy(false); }
  }
  return <Stack component="form" onSubmit={submit} spacing={2} sx={{ maxWidth: 640 }}>
    <Typography variant="h4" component="h1">Register product</Typography>
    {error && <Alert severity="error">{error}</Alert>}
    <TextField label="Product ID" name="id" value={form.id} onChange={change} required />
    <TextField select label="Product type" name="type" value={form.type} onChange={change}>
      {['cotton', 'silk', 'finished'].map(type => <MenuItem key={type} value={type}>{type}</MenuItem>)}
    </TextField>
    <TextField label="Origin" name="origin" value={form.origin} onChange={change} required />
    <TextField label="Quantity (kg)" name="quantity" type="number" inputProps={{ min: 0.001, step: 'any' }} value={form.quantity} onChange={change} required />
    <TextField label="Manufacturer" name="manufacturer" value={form.manufacturer} onChange={change} />
    <TextField label="Harvest date" name="harvestDate" type="date" InputLabelProps={{ shrink: true }} value={form.harvestDate} onChange={change} />
    <Button variant="contained" type="submit" disabled={busy}>{busy ? 'Registering…' : 'Register product'}</Button>
  </Stack>;
}
