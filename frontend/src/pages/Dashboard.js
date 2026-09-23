import React, { useState, useEffect } from 'react';
import Alert from '@mui/material/Alert';
import CircularProgress from '@mui/material/CircularProgress';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Grid from '@mui/material/Grid';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import CardHeader from '@mui/material/CardHeader';
import Paper from '@mui/material/Paper';
import Divider from '@mui/material/Divider';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { errorMessage, fetchAllProducts } from '../services/api';

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8'];

function Dashboard({ title = 'Dashboard' }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [productStats, setProductStats] = useState({
    cotton: 0,
    silk: 0,
    finished: 0,
    certified: 0,
    recycled: 0,
    tokenized: 0
  });

  const [statusData, setStatusData] = useState([]);
  const [certificationData, setCertificationData] = useState([]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const products = await fetchAllProducts();

        // Count products by type
        const typeCount = {
          cotton: 0,
          silk: 0,
          finished: 0
        };

        // Count statuses
        const statusCount = {};

        // Count certifications
        const certCount = {};

        let certifiedCount = 0;
        let recycledCount = 0;
        let tokenizedCount = 0;

        products.forEach(product => {
          if (product.nftTokenId != null || product.tokenized) tokenizedCount++;
          // Count by type
          if (typeCount.hasOwnProperty(product.type)) {
            typeCount[product.type]++;
          }

          // Count by status
          if (!statusCount[product.status]) {
            statusCount[product.status] = 0;
          }
          statusCount[product.status]++;

          // Check if certified
          if (product.certifications && product.certifications.length > 0) {
            certifiedCount++;

            // Count certifications by type
            product.certifications.forEach(cert => {
              if (!certCount[cert.type]) {
                certCount[cert.type] = 0;
              }
              certCount[cert.type]++;
            });
          }

          // Check if recycled
          if (product.status === 'RECYCLING_INITIATED' || product.status === 'RECYCLED') {
            recycledCount++;
          }
        });

        setProductStats({
          cotton: typeCount.cotton,
          silk: typeCount.silk,
          finished: typeCount.finished,
          certified: certifiedCount,
          recycled: recycledCount,
          tokenized: tokenizedCount
        });

        // Format status data for chart
        const statusArr = Object.keys(statusCount).map(status => ({
          name: status,
          value: statusCount[status]
        }));
        setStatusData(statusArr);

        // Format certification data for chart
        const certArr = Object.keys(certCount).map(cert => ({
          name: cert,
          value: certCount[cert]
        }));
        setCertificationData(certArr);

      } catch (error) {
        setError(errorMessage(error));
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  if (loading) return <CircularProgress aria-label="Loading dashboard" />;
  if (error) return <Alert severity="error">{error}</Alert>;
  return (
    <Box>
      <Typography variant="h4" component="h1" gutterBottom>
        {title}
      </Typography>

      <Grid container spacing={3}>
        {/* Stats Cards */}
        <Grid item xs={12} md={4}>
          <Card>
            <CardHeader title="Raw Materials" />
            <CardContent>
              <Typography variant="h3">{productStats.cotton + productStats.silk}</Typography>
              <Typography color="textSecondary">Total raw materials tracked</Typography>
              <Box mt={2}>
                <Typography>Cotton: {productStats.cotton}</Typography>
                <Typography>Silk: {productStats.silk}</Typography>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={4}>
          <Card>
            <CardHeader title="Finished Products" />
            <CardContent>
              <Typography variant="h3">{productStats.finished}</Typography>
              <Typography color="textSecondary">Completed garments</Typography>
              <Box mt={2}>
                <Typography>Certified: {productStats.certified}</Typography>
                <Typography>Tokenized: {productStats.tokenized}</Typography>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={4}>
          <Card>
            <CardHeader title="Circular Economy" />
            <CardContent>
              <Typography variant="h3">{productStats.recycled}</Typography>
              <Typography color="textSecondary">Products in recycling</Typography>
              <Box mt={2}>
                <Typography>
                  Recycling rate: {
                    productStats.finished > 0
                      ? Math.round((productStats.recycled / productStats.finished) * 100)
                      : 0
                  }%
                </Typography>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        {/* Charts */}
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 2, height: '100%' }}>
            <Typography variant="h6">Products by Status</Typography>
            <Divider sx={{ my: 2 }} />
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={statusData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                  label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                >
                  {statusData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </Paper>
        </Grid>

        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 2, height: '100%' }}>
            <Typography variant="h6">Certifications</Typography>
            <Divider sx={{ my: 2 }} />
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={certificationData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Bar dataKey="value" fill="#82ca9d" />
              </BarChart>
            </ResponsiveContainer>
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
}

export default Dashboard;