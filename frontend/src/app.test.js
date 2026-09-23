import React from 'react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import App from './App';
import * as api from './services/api';

vi.mock('./services/api', () => ({
  fetchAllProducts: vi.fn(), fetchProductById: vi.fn(), registerProduct: vi.fn(),
  verifyProduct: vi.fn(), signIn: vi.fn(), errorMessage: error => error.message,
}));
vi.mock('html5-qrcode', () => ({ Html5Qrcode: vi.fn() }));
const product = { id: 'COTTON-1', type: 'cotton', origin: 'Farm A', status: 'REGISTERED', certifications: [], custodyHistory: [{ holder: 'Farm A' }] };
beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  api.fetchAllProducts.mockResolvedValue([product]);
  api.fetchProductById.mockResolvedValue(product);
  api.verifyProduct.mockResolvedValue({ verified: true, product });
  api.registerProduct.mockResolvedValue(product);
});
afterEach(() => { cleanup(); vi.clearAllMocks(); vi.unstubAllGlobals(); });
function open(path) { window.history.replaceState({}, '', path); return render(<App />); }

for (const [path, title] of Object.entries({
  '/': 'Dashboard', '/products': 'Products', '/products/COTTON-1': 'Product details',
  '/register': 'Register product', '/supply-chain': 'Supply chain',
  '/sustainability': 'Sustainability metrics', '/circular-economy': 'Circular economy',
  '/tokens': 'Tokenized products', '/nfts': 'Product NFTs',
  '/verify': 'Verify product authenticity', '/scan': 'Scan product QR code', '/login': 'Sign in',
})) {
  test(`route ${path} renders`, async () => {
    open(path);
    expect(await screen.findByRole('heading', { name: title, level: 1 })).toBeTruthy();
  });
}
test('verification accepts scanned IDs from the URL', async () => {
  open('/verify?id=COTTON-1');
  expect(screen.getByLabelText(/Product ID/).value).toBe('COTTON-1');
  fireEvent.click(screen.getByRole('button', { name: 'Verify' }));
  expect(await screen.findByText('Product found in the ledger.')).toBeTruthy();
  expect(api.verifyProduct).toHaveBeenCalledWith('COTTON-1');
});
test('registration submits the chaincode payload and opens product details', async () => {
  open('/register');
  fireEvent.change(screen.getByLabelText(/Product ID/), { target: { value: 'COTTON-1' } });
  fireEvent.change(screen.getByLabelText(/Origin/), { target: { value: 'Farm A' } });
  fireEvent.change(screen.getByLabelText(/Quantity/), { target: { value: '12.5' } });
  fireEvent.submit(screen.getByRole('button', { name: 'Register product' }).closest('form'));
  expect(await screen.findByRole('heading', { name: 'Product details' })).toBeTruthy();
  expect(api.registerProduct).toHaveBeenCalledWith(expect.objectContaining({ id: 'COTTON-1', origin: 'Farm A', metadata: expect.objectContaining({ quantity: 12.5 }) }));
});
test('dashboard shows an API failure instead of fabricated zero metrics', async () => {
  api.fetchAllProducts.mockRejectedValueOnce(new Error('Ledger unavailable'));
  open('/');
  expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Ledger unavailable');
  expect(screen.queryByText('Total raw materials tracked')).toBeNull();
});
test('a product request cannot overwrite the next route after navigation', async () => {
  let finish;
  api.fetchProductById.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  const view = open('/products/slow');
  await waitFor(() => expect(api.fetchProductById).toHaveBeenCalledWith('slow'));
  view.unmount();
  open('/products/COTTON-1');
  expect(await screen.findByText('Farm A')).toBeTruthy();
  finish({ ...product, id: 'slow' });
  expect(screen.queryByText('slow')).toBeNull();
});
