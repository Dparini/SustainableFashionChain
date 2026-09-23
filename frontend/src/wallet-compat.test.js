import React from 'react';
import { afterEach, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import Governance from './pages/Governance';
import Marketplace from './pages/Marketplace';

const address = '0x1234567890123456789012345678901234567890';

afterEach(() => {
  cleanup();
  delete window.ethereum;
  vi.restoreAllMocks();
});

function connectMockWallet() {
  window.ethereum = {
    request: vi.fn(async ({ method }) => {
      if (method === 'eth_chainId') return '0x1';
      if (method === 'eth_accounts' || method === 'eth_requestAccounts') return [address];
      throw new Error(`Unexpected RPC call: ${method}`);
    }),
  };
}

test('governance connects an EIP-1193 wallet through Ethers 6 and Router 7', async () => {
  connectMockWallet();
  render(<MemoryRouter initialEntries={['/governance']}>
    <Routes><Route path="/governance" element={<Governance />} /></Routes>
  </MemoryRouter>);
  expect(await screen.findByText('Connected: 0x1234...7890')).toBeTruthy();
});

test('marketplace obtains an async signer before allowing a purchase', async () => {
  connectMockWallet();
  const alert = vi.spyOn(window, 'alert').mockImplementation(() => {});
  render(<Marketplace />);
  await waitFor(() => expect(window.ethereum.request).toHaveBeenCalledWith({ method: 'eth_accounts', params: [] }));
  fireEvent.click((await screen.findAllByText('View Details'))[0]);
  await waitFor(() => {
    fireEvent.click(screen.getByText('Purchase'));
    expect(alert).toHaveBeenCalledWith('Purchased Sustainable Cotton T-Shirt');
  });
});
