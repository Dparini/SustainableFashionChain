import React, { useEffect, useState } from 'react';
import Alert from '@mui/material/Alert';
import CircularProgress from '@mui/material/CircularProgress';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useParams } from 'react-router-dom';
import { fetchProductById, errorMessage } from '../services/api';
import ProductRecord from '../components/ProductRecord';

export default function ProductDetails() {
  const { id } = useParams();
  const [product, setProduct] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    setProduct(null); setError('');
    fetchProductById(id).then(value => { if (active) setProduct(value); })
      .catch(err => { if (active) setError(errorMessage(err)); });
    return () => { active = false; };
  }, [id]);
  return <Stack spacing={2}><Typography variant="h4" component="h1">Product details</Typography>
    {error ? <Alert severity="error">{error}</Alert> : product ? <ProductRecord product={product} /> : <CircularProgress aria-label="Loading product" />}
  </Stack>;
}
