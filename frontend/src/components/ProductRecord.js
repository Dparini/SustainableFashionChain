import React from 'react';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemText from '@mui/material/ListItemText';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';

export default function ProductRecord({ product }) {
  return <Paper sx={{ p: 3 }}><Stack spacing={2}>
    <Typography variant="h5">{product.id || product.productId}</Typography>
    <Typography>Type: {product.type || 'Not recorded'}</Typography>
    <Typography>Status: {product.status || 'Not recorded'}</Typography>
    <Typography>Origin: {product.origin || product.manufacturer || 'Not recorded'}</Typography>
    {product.nftTokenId != null && <Typography>NFT: {product.nftTokenId}</Typography>}
    <Typography variant="h6">Certifications</Typography>
    {!product.certifications?.length ? <Typography>No certifications recorded.</Typography> : <List>
      {product.certifications.map((cert, index) => <ListItem key={cert.id || index}><ListItemText primary={typeof cert === 'string' ? cert : cert.type} secondary={cert.issuer} /></ListItem>)}
    </List>}
    <Typography variant="h6">Custody history</Typography>
    {!product.custodyHistory?.length ? <Typography>No custody history recorded.</Typography> : <List>
      {product.custodyHistory.map((entry, index) => <ListItem key={index}><ListItemText primary={entry.holder} secondary={[entry.location, entry.timestamp].filter(Boolean).join(' · ')} /></ListItem>)}
    </List>}
  </Stack></Paper>;
}
