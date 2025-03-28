// frontend/src/App.js - Main Application Structure

import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Dashboard from './pages/Dashboard';
import ProductExplorer from './pages/ProductExplorer';
import ProductDetails from './pages/ProductDetails';
import RegisterProduct from './pages/RegisterProduct';
import SupplyChainView from './pages/SupplyChainView';
import SustainabilityMetrics from './pages/SustainabilityMetrics';
import CircularEconomy from './pages/CircularEconomy';
import Verification from './pages/Verification';
import ScanProduct from './pages/ScanProduct';
import Navigation from './components/Navigation';
import Footer from './components/Footer';
import './App.css';

function App() {
  return (
    <Router>
      <div className="app-container">
        <Navigation />
        <main className="main-content">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/products" element={<ProductExplorer />} />
            <Route path="/products/:id" element={<ProductDetails />} />
            <Route path="/register" element={<RegisterProduct />} />
            <Route path="/supply-chain" element={<SupplyChainView />} />
            <Route path="/sustainability" element={<SustainabilityMetrics />} />
            <Route path="/circular-economy" element={<CircularEconomy />} />
            <Route path="/verify" element={<Verification />} />
            <Route path="/scan" element={<ScanProduct />} />
          </Routes>
        </main>
        <Footer />
      </div>
    </Router>
  );
}

export default App;

// Sample Dashboard Component (frontend/src/pages/Dashboard.js)

import react, { useState, useEffect } from 'react';
import { Card, Row, Col, Alert } from 'react-bootstrap';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { fetchDashboardData } from '../services/api';
import MetricsCard from '../components/MetricsCard';
import ActivityFeed from '../components/ActivityFeed';
import LoadingSpinner from '../components/LoadingSpinner';

const dashboard = () => {
  const [dashboardData, setDashboardData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const loadDashboardData = async () => {
      try {
        setLoading(true);
        const data = await fetchDashboardData();
        setDashboardData(data);
        setLoading(false);
      } catch (err) {
        console.error('Error loading dashboard data:', err);
        setError('Failed to load dashboard data. Please try again later.');
        setLoading(false);
      }
    };

    loadDashboardData();
  }, []);

  if (loading) return <LoadingSpinner />;

  if (error) return <Alert variant="danger">{error}</Alert>;

  if (!dashboardData) return <Alert variant="info">No data available</Alert>;

  return (
    <div className="dashboard-container">
      <h1>Sustainability Dashboard</h1>

      <Row className="metrics-cards">
        <Col md={3}>
          <MetricsCard
            title="Organic Cotton"
            value={`${dashboardData.sustainabilityMetrics.organicPercentage}%`}
            trend="+28.5% from last year"
            color="success"
            icon="leaf"
          />
        </Col>
        <Col md={3}>
          <MetricsCard
            title="Water Saved"
            value={`${dashboardData.sustainabilityMetrics.environmentalImpact.waterSaved}M`}
            trend="liters this quarter"
            color="info"
            icon="droplet"
          />
        </Col>
        <Col md={3}>
          <MetricsCard
            title="CO2 Reduction"
            value={dashboardData.sustainabilityMetrics.environmentalImpact.carbonReduction}
            trend="tonnes"
            color="warning"
            icon="cloud"
          />
        </Col>
        <Col md={3}>
          <MetricsCard
            title="Circular Actions"
            value={dashboardData.tokenizationMetrics.circularEconomyActions.total}
            trend="products"
            color="danger"
            icon="refresh-cw"
          />
        </Col>
      </Row>

      <Row className="mt-4">
        <Col md={8}>
          <Card>
            <Card.Header>Monthly Production</Card.Header>
            <Card.Body>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={dashboardData.batchMetrics.monthlyProductionData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="organic" stroke="#047857" strokeWidth={2} />
                  <Line type="monotone" dataKey="nonOrganic" stroke="#d1fae5" strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            </Card.Body>
          </Card>
        </Col>
        <Col md={4}>
          <Card>
            <Card.Header>Certifications</Card.Header>
            <Card.Body>
              <ul className="certification-list">
                {Object.entries(dashboardData.sustainabilityMetrics.certifications).map(([cert, count]) => (
                  <li key={cert} className="certification-item">
                    <span className="certification-name">{cert}</span>
                    <span className="certification-count">{count}</span>
                  </li>
                ))}
              </ul>
            </Card.Body>
          </Card>
        </Col>
      </Row>

      <Row className="mt-4">
        <Col md={12}>
          <Card>
            <Card.Header>Recent Activity</Card.Header>
            <Card.Body>
              <ActivityFeed activities={dashboardData.recentActivities} />
            </Card.Body>
          </Card>
        </Col>
      </Row>
    </div>
  );
};

export default dashboard;

// Sample Product Registration Component (frontend/src/pages/RegisterProduct.js)

import React, { useState } from 'react';
import { Form, Button, Card, Alert, Row, Col } from 'react-bootstrap';
import { useNavigate } from 'react-router-dom';
import { registerNewProduct } from '../services/api';

const RegisterProduct = () => {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    type: 'cotton', // Default type
    origin: '',
    quantity: '',
    manufacturer: '',
    harvestDate: '',
    organic: false,
    fairTrade: false,
    certifications: []
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData({
      ...formData,
      [name]: type === 'checkbox' ? checked : value
    });
  };

  const handleCertificationChange = (e) => {
    const { value, checked } = e.target;
    if (checked) {
      setFormData({
        ...formData,
        certifications: [...formData.certifications, value]
      });
    } else {
      setFormData({
        ...formData,
        certifications: formData.certifications.filter(cert => cert !== value)
      });
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      setLoading(true);
      setError(null);

      const result = await registerNewProduct(formData);

      setSuccess(true);
      setLoading(false);

      // Redirect to product details after 2 seconds
      setTimeout(() => {
        navigate(`/products/${result.productId}`);
      }, 2000);
    } catch (err) {
      console.error('Error registering product:', err);
      setError('Failed to register product. Please try again.');
      setLoading(false);
    }
  };

  return (
    <div className="register-product-container">
      <h1>Register New Product</h1>

      {success && (
        <Alert variant="success">
          Product registered successfully! Redirecting to product details...
        </Alert>
      )}

      {error && <Alert variant="danger">{error}</Alert>}

      <Card>
        <Card.Body>
          <Form onSubmit={handleSubmit}>
            <Row>
              <Col md={6}>
                <Form.Group className="mb-3">
                  <Form.Label>Product Type</Form.Label>
                  <Form.Select
                    name="type"
                    value={formData.type}
                    onChange={handleChange}
                    required
                  >
                    <option value="cotton">Raw Cotton</option>
                    <option value="fabric">Fabric</option>
                    <option value="finished">Finished Product</option>
                  </Form.Select>
                </Form.Group>
              </Col>

              <Col md={6}>
                <Form.Group className="mb-3">
                  <Form.Label>Origin</Form.Label>
                  <Form.Control
                    type="text"
                    name="origin"
                    value={formData.origin}
                    onChange={handleChange}
                    placeholder="Farm or location name"
                    required
                  />
                </Form.Group>
              </Col>
            </Row>

            <Row>
              <Col md={6}>
                <Form.Group className="mb-3">
                  <Form.Label>Quantity (kg)</Form.Label>
                  <Form.Control
                    type="number"
                    name="quantity"
                    value={formData.quantity}
                    onChange={handleChange}
                    placeholder="Amount in kilograms"
                    required
                  />
                </Form.Group>
              </Col>

              <Col md={6}>
                <Form.Group className="mb-3">
                  <Form.Label>Harvest Date</Form.Label>
                  <Form.Control
                    type="date"
                    name="harvestDate"
                    value={formData.harvestDate}
                    onChange={handleChange}
                    required
                  />
                </Form.Group>
              </Col>
            </Row>

            <Row>
              <Col md={6}>
                <Form.Group className="mb-3">
                  <Form.Label>Manufacturer</Form.Label>
                  <Form.Control
                    type="text"
                    name="manufacturer"
                    value={formData.manufacturer}
                    onChange={handleChange}
                    placeholder="Manufacturing organization"
                  />
                </Form.Group>
              </Col>

              <Col md={6}>
                <Form.Group className="mb-3 mt-4">
                  <Form.Check
                    type="checkbox"
                    name="organic"
                    label="Organic Certified"
                    checked={formData.organic}
                    onChange={handleChange}
                  />
                  <Form.Check
                    type="checkbox"
                    name="fairTrade"
                    label="Fair Trade Certified"
                    checked={formData.fairTrade}
                    onChange={handleChange}
                  />
                </Form.Group>
              </Col>
            </Row>

            <Form.Group className="mb-3">
              <Form.Label>Certifications</Form.Label>
              <div>
                <Form.Check
                  inline
                  type="checkbox"
                  id="gots"
                  label="GOTS"
                  value="GOTS"
                  onChange={handleCertificationChange}
                />
                <Form.Check
                  inline
                  type="checkbox"
                  id="oekotex"
                  label="OEKO-TEX"
                  value="OEKO-TEX"
                  onChange={handleCertificationChange}
                />
                <Form.Check
                  inline
                  type="checkbox"
                  id="bci"
                  label="BCI"
                  value="BCI"
                  onChange={handleCertificationChange}
                />
                <Form.Check
                  inline
                  type="checkbox"
                  id="c2c"
                  label="Cradle to Cradle"
                  value="C2C"
                  onChange={handleCertificationChange}
                />
              </div>
            </Form.Group>

            <div className="d-grid gap-2">
              <Button type="submit" variant="primary" disabled={loading}>
                {loading ? 'Registering...' : 'Register Product'}
              </Button>
            </div>
          </Form>
        </Card.Body>
      </Card>
    </div>
  );
};

export default RegisterProduct;

// Product Verification Component (frontend/src/pages/Verification.js)

import React, { useState } from 'react';
import { Card, Form, Button, Alert, Row, Col } from 'react-bootstrap';
import { verifyProduct } from '../services/api';
import ProductVerificationResult from '../components/ProductVerificationResult';

const Verification = () => {
  const [productId, setProductId] = useState('');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleVerify = async (e) => {
    e.preventDefault();
    if (!productId.trim()) return;

    try {
      setLoading(true);
      setError(null);
      setResult(null);

      const data = await verifyProduct(productId);
      setResult(data);
      setLoading(false);
    } catch (err) {
      console.error('Error verifying product:', err);
      setError('Product verification failed. Please check the ID and try again.');
      setLoading(false);
    }
  };

  return (
    <div className="verification-container">
      <h1>Verify Product Authenticity</h1>

      <Card className="mb-4">
        <Card.Body>
          <Form onSubmit={handleVerify}>
            <Form.Group className="mb-3">
              <Form.Label>Enter Product ID or scan QR code</Form.Label>
              <Row>
                <Col xs={9}>
                  <Form.Control
                    type="text"
                    value={productId}
                    onChange={(e) => setProductId(e.target.value)}
                    placeholder="e.g., COTTON-20230001 or NFT ID"
                    required
                  />
                </Col>
                <Col xs={3}>
                  <Button variant="primary" type="submit" className="w-100" disabled={loading}>
                    {loading ? 'Verifying...' : 'Verify'}
                  </Button>
                </Col>
              </Row>
            </Form.Group>
          </Form>

          <div className="text-center mt-3">
            <Button variant="outline-secondary" onClick={() => window.location.href = '/scan'}>
              <i className="bi bi-camera"></i> Scan QR Code
            </Button>
          </div>
        </Card.Body>
      </Card>

      {error && <Alert variant="danger">{error}</Alert>}

      {result && (
        <ProductVerificationResult product={result} />
      )}

      <Card className="mt-4">
        <Card.Header>How to Verify Products</Card.Header>
        <Card.Body>
          <p>
            Every product in our sustainable fashion chain has a unique identifier that can be used to verify its authenticity and trace its journey from farm to finished product.
          </p>
          <ul>
            <li>Enter the product ID printed on the tag or packaging</li>
            <li>Scan the QR code on the product label</li>
            <li>For tokenized products, you can also enter the NFT ID</li>
          </ul>
        </Card.Body>
      </Card>
    </div>
  );
};

export default Verification;

// Sample API Service (frontend/src/services/api.js)

import axios from 'axios';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:3000/api';

// Create an axios instance with base URL and default headers
const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json'
  }
});

// Dashboard data
export const fetchDashboardData = async () => {
  try {
    const response = await apiClient.get('/analytics/dashboard');
    return response.data;
  } catch (error) {
    console.error('Error fetching dashboard data:', error);
    throw error;
  }
};

// Products
export const fetchProducts = async (filters = {}) => {
  try {
    const response = await apiClient.get('/products', { params: filters });
    return response.data;
  } catch (error) {
    console.error('Error fetching products:', error);
    throw error;
  }
};

export const fetchProductById = async (id) => {
  try {
    const response = await apiClient.get(`/products/${id}`);
    return response.data;
  } catch (error) {
    console.error(`Error fetching product ${id}:`, error);
    throw error;
  }
};

export const registerNewProduct = async (productData) => {
  try {
    const response = await apiClient.post('/products', productData);
    return response.data;
  } catch (error) {
    console.error('Error registering product:', error);
    throw error;
  }
};

export const updateProductStatus = async (id, newStatus, additionalData = {}) => {
  try {
    const response = await apiClient.post(`/products/${id}/status`, {
      newStatus,
      additionalData
    });
    return response.data;
  } catch (error) {
    console.error(`Error updating product ${id} status:`, error);
    throw error;
  }
};

// Tokenization
export const tokenizeProduct = async (id, tokenizationData) => {
  try {
    const response = await apiClient.post(`/products/${id}/tokenize`, tokenizationData);
    return response.data;
  } catch (error) {
    console.error(`Error tokenizing product ${id}:`, error);
    throw error;
  }
};

export const mintNFT = async (id, nftData) => {
  try {
    const response = await apiClient.post(`/products/${id}/mint-nft`, nftData);
    return response.data;
  } catch (error) {
    console.error(`Error minting NFT for product ${id}:`, error);
    throw error;
  }
};

// Verification
export const verifyProduct = async (id) => {
  try {
    const response = await apiClient.get(`/verification/${id}`);
    return response.data;
  } catch (error) {
    console.error(`Error verifying product ${id}:`, error);
    throw error;
  }
};

// Sustainability metrics
export const fetchSustainabilityMetrics = async () => {
  try {
    const response = await apiClient.get('/analytics/sustainability');
    return response.data;
  } catch (error) {
    console.error('Error fetching sustainability metrics:', error);
    throw error;
  }
};

// Circular economy
export const recordCircularAction = async (productId, actionData) => {
  try {
    const response = await apiClient.post(`/circular-economy/${productId}/action`, actionData);
    return response.data;
  } catch (error) {
    console.error(`Error recording circular action for product ${productId}:`, error);
    throw error;
  }
};

export const getCircularEconomyStats = async () => {
  try {
    const response = await apiClient.get('/analytics/circular-economy');
    return response.data;
  } catch (error) {
    console.error('Error fetching circular economy stats:', error);
    throw error;
  }
};

// Error handler for API responses
apiClient.interceptors.response.use(
  response => response,
  error => {
    const errorMessage = error.response?.data?.message || 'An unexpected error occurred';
    console.error(`API Error: ${errorMessage}`);
    return Promise.reject(error);
  }
);

export default apiClient;

// Mobile scanning component (frontend/src/pages/ScanProduct.js)

import React, { useEffect, useRef, useState } from 'react';
import { Card, Button, Alert } from 'react-bootstrap';
import { useNavigate } from 'react-router-dom';
import { Html5Qrcode } from 'html5-qrcode';

const ScanProduct = () => {
  const navigate = useNavigate();
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState(null);
  const scannerRef = useRef(null);
  const html5QrCodeRef = useRef(null);

  useEffect(() => {
    return () => {
      // Clean up scanner when component unmounts
      if (html5QrCodeRef.current && html5QrCodeRef.current.isScanning) {
        html5QrCodeRef.current.stop().catch(err => {
          console.error('Error stopping scanner:', err);
        });
      }
    };
  }, []);

  const startScanner = () => {
    if (!scannerRef.current) return;

    setScanning(true);
    setError(null);

    const config = {
      fps: 10,
      qrbox: { width: 250, height: 250 }
    };

    // Initialize scanner
    html5QrCodeRef.current = new Html5Qrcode('qr-reader');

    // Start scanning
    html5QrCodeRef.current.start(
      { facingMode: "environment" },
      config,
      onScanSuccess,
      onScanFailure
    ).catch(err => {
      console.error('Error starting scanner:', err);
      setError('Failed to start camera. Please ensure camera permissions are granted.');
      setScanning(false);
    });
  };

  const stopScanner = () => {
    if (html5QrCodeRef.current && html5QrCodeRef.current.isScanning) {
      html5QrCodeRef.current.stop().then(() => {
        setScanning(false);
      }).catch(err => {
        console.error('Error stopping scanner:', err);
      });
    }
  };

  const onScanSuccess = (decodedText) => {
    // Stop scanner after successful scan
    stopScanner();

    // Navigate to verification page with scanned product ID
    navigate(`/verify?id=${encodeURIComponent(decodedText)}`);
  };

  const onScanFailure = (error) => {
    // We don't need to handle failures during scanning as they're typically just frames without QR codes
    console.debug('QR scan failure:', error);
  };

  return (
    <div className="scan-product-container">
      <h1>Scan Product QR Code</h1>

      <Card>
        <Card.Body>
          {error && <Alert variant="danger">{error}</Alert>}

          <div id="qr-reader" ref={scannerRef} style={{ width: '100%' }}></div>

          <div className="d-grid gap-2 mt-3">
            {!scanning ? (
              <Button variant="primary" onClick={startScanner}>
                Start Scanner
              </Button>
            ) : (
              <Button variant="secondary" onClick={stopScanner}>
                Stop Scanner
              </Button>
            )}

            <Button variant="outline-secondary" onClick={() => navigate('/verify')}>
              Enter Product ID Manually
            </Button>
          </div>

          <div className="mt-3">
            <p className="text-center mb-0">
              Position the QR code within the scanner frame.
            </p>
          </div>
        </Card.Body>
      </Card>
    </div>
  );
};

export default ScanProduct;
export default App;
