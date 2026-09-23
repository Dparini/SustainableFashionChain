import axios from 'axios';

const API_URL = process.env.REACT_APP_API_URL || '/api/v1';

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
      ...(cottonResponse.data.products ?? cottonResponse.data),
      ...(silkResponse.data.products ?? silkResponse.data),
      ...(finishedResponse.data.products ?? finishedResponse.data)
    ];
  } catch (error) {
    console.error('Error fetching all products:', error);
    throw error;
  }
};

export const fetchProductsByType = async (type) => {
  try {
    const response = await api.get(`/products/type/${encodeURIComponent(type)}`);
    return response.data.products ?? response.data;
  } catch (error) {
    console.error(`Error fetching ${encodeURIComponent(type)} products:`, error);
    throw error;
  }
};

export const fetchProductById = async (id) => {
  try {
    const response = await api.get(`/products/${encodeURIComponent(id)}`);
    return response.data.product ?? response.data;
  } catch (error) {
    console.error(`Error fetching product ${encodeURIComponent(id)}:`, error);
    throw error;
  }
};

export const registerProduct = async (productData) => {
  try {
    const response = await api.post('/products', productData);
    return response.data.product ?? response.data;
  } catch (error) {
    console.error('Error registering product:', error);
    throw error;
  }
};

export const transferCustody = async (id, newHolder, location) => {
  try {
    const response = await api.post(`/products/${encodeURIComponent(id)}/transfer`, {
      newHolder,
      location
    });
    return response.data.product ?? response.data;
  } catch (error) {
    console.error(`Error transferring custody for product ${encodeURIComponent(id)}:`, error);
    throw error;
  }
};

export const updateProductStatus = async (id, newStatus, additionalData) => {
  try {
    const response = await api.post(`/products/${encodeURIComponent(id)}/status`, {
      newStatus,
      additionalData
    });
    return response.data.product ?? response.data;
  } catch (error) {
    console.error(`Error updating status for product ${encodeURIComponent(id)}:`, error);
    throw error;
  }
};

export const addCertification = async (id, certType, certId, issuer) => {
  try {
    const response = await api.post(`/products/${encodeURIComponent(id)}/certifications`, {
      certType,
      certId,
      issuer
    });
    return response.data.product ?? response.data;
  } catch (error) {
    console.error(`Error adding certification to product ${encodeURIComponent(id)}:`, error);
    throw error;
  }
};

export const mintProductNFT = async (id, ownerAddress, metadata) => {
  try {
    const response = await api.post(`/products/${encodeURIComponent(id)}/mint-nft`, {
      ownerAddress,
      metadata
    });
    return response.data;
  } catch (error) {
    console.error(`Error minting NFT for product ${encodeURIComponent(id)}:`, error);
    throw error;
  }
};

export default api;
export function errorMessage(error) {
  if (error.response?.status === 401) return 'Sign in to access the ledger.';
  return error.response?.data?.error || error.response?.data?.message || 'The service is unavailable. Please try again later.';
}

api.interceptors.request.use(config => {
  const token = sessionStorage.getItem('sfc-token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export async function signIn(key) {
  const { data } = await api.post('/token', {}, { headers: { 'x-api-key': key } });
  sessionStorage.setItem('sfc-token', data.token);
}

export async function verifyProduct(id) {
  const { data } = await api.get(`/verify/${encodeURIComponent(id)}`);
  return data;
}
