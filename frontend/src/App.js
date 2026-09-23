import React, { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Link } from 'react-router-dom';
import Alert from '@mui/material/Alert';
import CircularProgress from '@mui/material/CircularProgress';
import CssBaseline from '@mui/material/CssBaseline';
import Layout from './components/Layout';
import ProductExplorer from './pages/ProductExplorer';
import ProductDetails from './pages/ProductDetails';
import RegisterProduct from './pages/RegisterProduct';
import Verification from './pages/Verification';
import SignIn from './pages/SignIn';
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Marketplace = lazy(() => import('./pages/Marketplace'));
const Governance = lazy(() => import('./pages/Governance'));
const ScanProduct = lazy(() => import('./pages/ScanProduct'));

export default function App() {
  return <BrowserRouter><CssBaseline /><Layout><Suspense fallback={<CircularProgress aria-label="Loading page" />}>
    <Routes>
      <Route path="/" element={<Dashboard />} />
      <Route path="/products" element={<ProductExplorer />} />
      <Route path="/products/:id" element={<ProductDetails />} />
      <Route path="/register" element={<RegisterProduct />} />
      <Route path="/supply-chain" element={<ProductExplorer title="Supply chain" />} />
      <Route path="/sustainability" element={<Dashboard title="Sustainability metrics" />} />
      <Route path="/circular-economy" element={<ProductExplorer title="Circular economy" filter="recycled" />} />
      <Route path="/tokens" element={<ProductExplorer title="Tokenized products" filter="tokenized" />} />
      <Route path="/nfts" element={<ProductExplorer title="Product NFTs" filter="nft" />} />
      <Route path="/verify" element={<Verification />} />
      <Route path="/verify/:id" element={<Verification />} />
      <Route path="/scan" element={<ScanProduct />} />
      <Route path="/marketplace" element={<Marketplace />} />
      <Route path="/governance" element={<Governance />} />
      <Route path="/login" element={<SignIn />} />
      <Route path="/dashboard" element={<Navigate to="/" replace />} />
      <Route path="*" element={<Alert severity="info">Page not found. <Link to="/">Go to dashboard</Link></Alert>} />
    </Routes>
  </Suspense></Layout></BrowserRouter>;
}
