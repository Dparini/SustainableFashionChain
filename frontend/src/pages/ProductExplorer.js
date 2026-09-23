import React, { useEffect, useState } from 'react';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import CircularProgress from '@mui/material/CircularProgress';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { Link } from 'react-router-dom';
import { fetchAllProducts, errorMessage } from '../services/api';

export default function ProductExplorer({ title = 'Products', filter }) {
  const [products, setProducts] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    fetchAllProducts().then(data => { if (active) setProducts(data); })
      .catch(err => { if (active) setError(errorMessage(err)); });
    return () => { active = false; };
  }, []);
  const visible = (products || []).filter(product => {
    if (filter === 'recycled') return ['RECYCLING_INITIATED', 'RECYCLED'].includes(product.status);
    if (filter === 'tokenized') return Boolean(product.tokenized || product.tokenizationStatus === 'COMPLETED');
    if (filter === 'nft') return product.nftTokenId != null && product.nftTokenId !== '';
    return true;
  });
  return <Stack spacing={2}>
    <Typography variant="h4" component="h1">{title}</Typography>
    {error ? <Alert severity="error">{error} <Link to="/login">Sign in</Link></Alert> : !products ? <CircularProgress aria-label="Loading products" /> : <>
      {!visible.length && <Alert severity="info">No products found.</Alert>}
      {visible.map(product => <Card key={product.id}><CardContent>
        <Typography variant="h6">{product.id}</Typography>
        <Typography>{product.type} · {product.status}</Typography>
        <Typography>Origin: {product.origin || product.manufacturer || 'Not recorded'}</Typography>
        <Button component={Link} to={`/products/${encodeURIComponent(product.id)}`}>View product</Button>
      </CardContent></Card>)}
    </>}
  </Stack>;
}
