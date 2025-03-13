import axios from 'axios';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3000/api';

// Create axios instance
const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Products
export const fetchAllProducts = async () => {
  try {
    // Note: This is a simplified approach. In a real app, you might need pagination
    // and to combine results from multiple endpoints
    const cottonResponse = await api.get('/products/type/cotton');
    const silkResponse = await api.get('/products/type/silk');
    const finishedResponse = await api.get('/products/type/finished');

    return [
      ...cottonResponse.data.products,
      ...silkResponse.data.products,
      ...finishedResponse.data.products
    ];
  } catch (error) {
    console.error('Error fetching all products:', error);
    throw error;
  }
};

export const fetchProductsByType = async (type) => {
  try {
    const response = await api.get(`/products/type/${type}`);
    return response.data.products;
  } catch (error) {
    console.error(`Error fetching ${type} products:`, error);
    throw error;
  }
};

export const fetchProductById = async (id) => {
  try {
    const response = await api.get(`/products/${id}`);
    return response.data.product;
  } catch (error) {
    console.error(`Error fetching product ${id}:`, error);
    throw error;
  }
};

export const registerProduct = async (productData) => {
  try {
    const response = await api.post('/products', productData);
    return response.data.product;
  } catch (error) {
    console.error('Error registering product:', error);
    throw error;
  }
};

export const transferCustody = async (id, newHolder, location) => {
  try {
    const response = await api.post(`/products/${id}/transfer`, {
      newHolder,
      location
    });
    return response.data.product;
  } catch (error) {
    console.error(`Error transferring custody for product ${id}:`, error);
    throw error;
  }
};

export const updateProductStatus = async (id, newStatus, additionalData) => {
  try {
    const response = await api.post(`/products/${id}/status`, {
      newStatus,
      additionalData
    });
    return response.data.product;
  } catch (error) {
    console.error(`Error updating status for product ${id}:`, error);
    throw error;
  }
};

export const addCertification = async (id, certType, certId, issuer) => {
  try {
    const response = await api.post(`/products/${id}/certifications`, {
      certType,
      certId,
      issuer
    });
    return response.data.product;
  } catch (error) {
    console.error(`Error adding certification to product ${id}:`, error);
    throw error;
  }
};

export const mintProductNFT = async (id, ownerAddress, metadata) => {
  try {
    const response = await api.post(`/products/${id}/mint-nft`, {
      ownerAddress,
      metadata
    });
    return response.data;
  } catch (error) {
    console.error(`Error minting NFT for product ${id}:`, error);
    throw error;
  }
};

export default api;